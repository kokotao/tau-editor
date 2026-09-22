import { defineStore } from 'pinia';
import { settingsCommands, TauriError } from '@/lib/tauri';
import {
  THEME_SKINS,
  resolveThemeState,
  type MonacoThemeId,
  type ThemeResolution,
  type ThemeSkinId,
} from '@/utils/themeResolver';
import { normalizeUiLanguage, type UiLanguage } from '@/i18n/ui';
import {
  normalizeKeybindingOverrides,
  normalizeKeybinding,
  type KeybindingOverrides,
} from '@/services/keybindingService';
import {
  createThemePackageFromColors,
  missingRequiredThemeColors,
  normalizeHexColor as normalizeThemeHexColor,
  normalizeThemeColors,
  normalizeThemePackageRecord,
  parseThemePackage,
  resolveMonacoThemeId,
  serializeThemePackage,
  themePackageToCssColors,
  THEME_COLOR_KEYS,
  USER_THEME_ID_PREFIX,
  type MonacoBaseTheme,
  type ThemeColorKey,
  type ThemePackage,
  type ThemePackageError,
} from '@/utils/themePackage';

export const CUSTOM_THEME_COLOR_KEYS = THEME_COLOR_KEYS;

export const MARKDOWN_PREVIEW_THEMES = [
  'docs-clean',
  'paper-soft',
  'editorial-warm',
  'graphite-night',
] as const;

export type CustomThemeColorKey = ThemeColorKey;
export type CustomThemeColors = Partial<Record<CustomThemeColorKey, string>>;

/** Monaco 自定义主题定义，与 monaco.editor.IStandaloneThemeData 结构对齐。 */
export interface MonacoThemeDefinition {
  base: MonacoBaseTheme;
  inherit: boolean;
  rules: Array<{ token: string; foreground?: string; fontStyle?: string }>;
  colors: Record<string, string>;
}
export type { ThemePackage };
export type MarkdownPreviewTheme = (typeof MARKDOWN_PREVIEW_THEMES)[number];

export const CUSTOM_THEME_COLOR_VAR_MAP: Record<CustomThemeColorKey, string> = {
  bgApp: '--bg-app',
  panelBase: '--panel-base',
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  accentBrand: '--accent-brand',
  accentBrandStrong: '--accent-brand-strong',
  stateSuccess: '--state-success',
  stateDanger: '--state-danger',
};

export const CUSTOM_THEME_COLOR_FALLBACKS: Record<CustomThemeColorKey, string> = {
  bgApp: '#0b1020',
  panelBase: '#101726',
  textPrimary: '#ecf2ff',
  textSecondary: '#b6c2d9',
  accentBrand: '#7cc7ff',
  accentBrandStrong: '#4dabff',
  stateSuccess: '#4ade80',
  stateDanger: '#f87171',
};

export interface EditorSettings {
  // 编辑器外观
  theme: 'light' | 'dark' | 'system';
  themeSkin: ThemeSkinId;
  monacoTheme: 'vs' | 'vs-dark' | 'hc-black';
  customThemeColors: CustomThemeColors;
  // v0.4.0：导入的主题包与当前生效主题包（null 表示使用内置皮肤）
  themePackages: ThemePackage[];
  activeThemePackageId: string | null;
  // v0.4.0：命令快捷键覆盖（命令 id -> 归一化绑定，空串表示解绑）
  keybindingOverrides: KeybindingOverrides;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  minimap: boolean;
  wordWrap: boolean;

  // 自动保存
  autoSaveEnabled: boolean;
  autoSaveInterval: number;     // 秒

  // 标签页
  tabSize: number;
  insertSpaces: boolean;
  trimTrailingWhitespace: boolean;
  maxOpenTabs: number;
  memoryLimitMB: number;

  // 文件树
  showHiddenFiles: boolean;
  fileTreeWidth: number;
  sidebarCollapsed: boolean;
  contextRailWidth: number;
  contextRailCollapsed: boolean;

  // Markdown 预览
  markdownPreviewMode: 'edit' | 'split' | 'preview';
  markdownPreviewEnabled: boolean;
  markdownPreviewTheme: MarkdownPreviewTheme;

  // 其他
  confirmBeforeClose: boolean;
  restoreLastSession: boolean;
  uiLanguage: UiLanguage;
}

// localStorage 键名
const STORAGE_KEY = 'text-editor-settings';
const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)';
const DEFAULT_MAX_OPEN_TABS = 30;
const DEFAULT_MEMORY_LIMIT_MB = 256;
const MIN_CONTEXT_RAIL_WIDTH = 240;
const MAX_CONTEXT_RAIL_WIDTH = 420;
const DEFAULT_CONTEXT_RAIL_WIDTH = 300;

let systemThemeMediaQuery: MediaQueryList | null = null;
let systemThemeListenerAttached = false;

const normalizeHexColor = (value: unknown): string | null => normalizeThemeHexColor(value);

function normalizeCustomThemeColors(value: unknown): CustomThemeColors {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const result: CustomThemeColors = {};
  CUSTOM_THEME_COLOR_KEYS.forEach((key) => {
    const normalized = normalizeHexColor((value as Record<string, unknown>)[key]);
    if (normalized) {
      result[key] = normalized;
    }
  });

  return result;
}

function normalizeOpenTabsLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_OPEN_TABS;
  }
  return Math.min(120, Math.max(5, Math.round(parsed)));
}

function normalizeMemoryLimitMB(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MEMORY_LIMIT_MB;
  }
  return Math.min(2048, Math.max(64, Math.round(parsed)));
}

function normalizeContextRailWidth(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_CONTEXT_RAIL_WIDTH;
  }
  return Math.min(MAX_CONTEXT_RAIL_WIDTH, Math.max(MIN_CONTEXT_RAIL_WIDTH, Math.round(parsed)));
}

function normalizeContextRailCollapsed(value: unknown): boolean {
  return typeof value === 'boolean' ? value : false;
}

function normalizeMarkdownPreviewTheme(value: unknown): MarkdownPreviewTheme {
  if (typeof value === 'string' && MARKDOWN_PREVIEW_THEMES.includes(value as MarkdownPreviewTheme)) {
    return value as MarkdownPreviewTheme;
  }
  return 'docs-clean';
}

/**
 * 归一化本地存储/导入的主题包：只保留合法项，并统一加用户前缀避免与内置皮肤冲突。
 */
function normalizeStoredThemePackages(value: unknown): ThemePackage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const packages: ThemePackage[] = [];
  const seen = new Set<string>();
  value.slice(0, 64).forEach((entry) => {
    const result = normalizeThemePackageRecord(entry);
    if (!result.ok) {
      return;
    }
    const id = result.theme.id.startsWith(USER_THEME_ID_PREFIX)
      ? result.theme.id
      : `${USER_THEME_ID_PREFIX}${result.theme.id}`;
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    packages.push({ ...result.theme, id });
  });

  return packages;
}

function applyCustomThemeColors(root: HTMLElement, colors: CustomThemeColors) {
  const style = root.style;
  if (!style || typeof style.setProperty !== 'function' || typeof style.removeProperty !== 'function') {
    return;
  }

  CUSTOM_THEME_COLOR_KEYS.forEach((key) => {
    const cssVar = CUSTOM_THEME_COLOR_VAR_MAP[key];
    const color = normalizeHexColor(colors[key]);
    if (color) {
      style.setProperty(cssVar, color);
    } else {
      style.removeProperty(cssVar);
    }
  });
}

function getPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }

  return Boolean(window.matchMedia(SYSTEM_THEME_QUERY)?.matches);
}

function getThemeResolution(settings: Pick<EditorSettings, 'theme' | 'themeSkin' | 'monacoTheme' | 'uiLanguage'>): ThemeResolution {
  return resolveThemeState({
    theme: settings.theme,
    themeSkin: settings.themeSkin,
    monacoTheme: settings.monacoTheme,
    prefersDark: getPrefersDark(),
    uiLanguage: settings.uiLanguage,
  });
}

export const useSettingsStore = defineStore('settings', {
  state: (): EditorSettings => ({
    theme: 'system',
    themeSkin: 'deep-ocean',
    monacoTheme: 'vs-dark',
    customThemeColors: {},
    themePackages: [],
    activeThemePackageId: null,
    keybindingOverrides: {},
    fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', 'Fira Code', monospace",
    fontSize: 15,
    lineHeight: 1.6,
    minimap: true,
    wordWrap: false,
    autoSaveEnabled: true,
    autoSaveInterval: 30,
    tabSize: 2,
    insertSpaces: true,
    trimTrailingWhitespace: true,
    maxOpenTabs: DEFAULT_MAX_OPEN_TABS,
    memoryLimitMB: DEFAULT_MEMORY_LIMIT_MB,
    showHiddenFiles: false,
    fileTreeWidth: 250,
    sidebarCollapsed: false,
    contextRailWidth: DEFAULT_CONTEXT_RAIL_WIDTH,
    contextRailCollapsed: false,
    markdownPreviewMode: 'edit',
    markdownPreviewEnabled: true,
    markdownPreviewTheme: 'docs-clean',
    confirmBeforeClose: true,
    restoreLastSession: true,
    uiLanguage: 'zh-CN',
  }),

  getters: {
    // 获取 Monaco 配置选项
    monacoOptions: (state) => ({
      fontFamily: state.fontFamily,
      fontSize: state.fontSize,
      lineHeight: Math.round(state.lineHeight * 10),
      minimap: { enabled: state.minimap },
      wordWrap: state.wordWrap ? ('on' as const) : ('off' as const),
      tabSize: state.tabSize,
      insertSpaces: state.insertSpaces,
      trimAutoWhitespace: state.trimTrailingWhitespace,
    }),
    resolvedTheme: (state) => getThemeResolution(state).resolvedTheme,
    previewTheme: (state) => getThemeResolution(state).previewTheme,
    recommendedMonacoTheme: (state) => getThemeResolution(state).recommendedMonacoTheme,
    monacoThemeOptions: (state) => getThemeResolution(state).monacoThemeOptions,
    themeSkinOptions: (state) => getThemeResolution(state).skinOptions,
    activeThemePackage: (state): ThemePackage | null =>
      state.themePackages.find((theme) => theme.id === state.activeThemePackageId) ?? null,
    themePackageOptions: (state) =>
      state.themePackages.map((theme) => ({ value: theme.id, label: theme.name })),
    activeMonacoThemeId(): string {
      const active = this.activeThemePackage;
      return active ? resolveMonacoThemeId(active) : this.monacoTheme;
    },
    activeMonacoThemeDefinition(): MonacoThemeDefinition | null {
      const active = this.activeThemePackage;
      if (!active) {
        return null;
      }
      return {
        base: active.monaco.base,
        inherit: true,
        rules: active.monaco.rules,
        colors: active.monaco.colors,
      };
    },
  },

  actions: {
    ensureThemeListener() {
      if (
        typeof window === 'undefined' ||
        typeof window.matchMedia !== 'function' ||
        systemThemeListenerAttached
      ) {
        return;
      }

      systemThemeMediaQuery = window.matchMedia(SYSTEM_THEME_QUERY);
      const handleThemeChange = () => {
        if (this.theme === 'system') {
          this.applyTheme();
        }
      };

      if (typeof systemThemeMediaQuery.addEventListener === 'function') {
        systemThemeMediaQuery.addEventListener('change', handleThemeChange);
      } else if (typeof systemThemeMediaQuery.addListener === 'function') {
        systemThemeMediaQuery.addListener(handleThemeChange);
      }

      systemThemeListenerAttached = true;
    },

    // 从 localStorage 加载设置
    loadFromStorage() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          this.$patch(parsed);
          this.customThemeColors = normalizeCustomThemeColors(this.customThemeColors);
          this.maxOpenTabs = normalizeOpenTabsLimit(this.maxOpenTabs);
          this.memoryLimitMB = normalizeMemoryLimitMB(this.memoryLimitMB);
          this.contextRailWidth = normalizeContextRailWidth(this.contextRailWidth);
          this.contextRailCollapsed = normalizeContextRailCollapsed(this.contextRailCollapsed);
          this.markdownPreviewTheme = normalizeMarkdownPreviewTheme(this.markdownPreviewTheme);
          this.themePackages = normalizeStoredThemePackages(this.themePackages);
          if (!this.themePackages.some((theme) => theme.id === this.activeThemePackageId)) {
            this.activeThemePackageId = null;
          }
          this.keybindingOverrides = normalizeKeybindingOverrides(this.keybindingOverrides);
          // Older builds defaulted Markdown to split view, which caused
          // opened files to look half-width on launch. Migrate that startup
          // state back to full-width editing.
          if (this.markdownPreviewMode === 'split') {
            this.markdownPreviewMode = 'edit';
          }
          this.uiLanguage = normalizeUiLanguage(this.uiLanguage);
          console.log('[Settings] 从 localStorage 加载设置成功');
        }
      } catch (error) {
        console.error('[Settings] 从 localStorage 加载失败:', error);
      }
    },

    // 保存设置到 localStorage
    saveToStorage() {
      try {
        const toSave = {
          theme: this.theme,
          themeSkin: this.themeSkin,
          monacoTheme: this.monacoTheme,
          customThemeColors: this.customThemeColors,
          themePackages: this.themePackages,
          activeThemePackageId: this.activeThemePackageId,
          keybindingOverrides: this.keybindingOverrides,
          fontFamily: this.fontFamily,
          fontSize: this.fontSize,
          lineHeight: this.lineHeight,
          minimap: this.minimap,
          wordWrap: this.wordWrap,
          autoSaveEnabled: this.autoSaveEnabled,
          autoSaveInterval: this.autoSaveInterval,
          tabSize: this.tabSize,
          insertSpaces: this.insertSpaces,
          trimTrailingWhitespace: this.trimTrailingWhitespace,
          maxOpenTabs: this.maxOpenTabs,
          memoryLimitMB: this.memoryLimitMB,
          showHiddenFiles: this.showHiddenFiles,
          fileTreeWidth: this.fileTreeWidth,
          sidebarCollapsed: this.sidebarCollapsed,
          contextRailWidth: this.contextRailWidth,
          contextRailCollapsed: this.contextRailCollapsed,
          markdownPreviewMode: this.markdownPreviewMode,
          markdownPreviewEnabled: this.markdownPreviewEnabled,
          markdownPreviewTheme: this.markdownPreviewTheme,
          confirmBeforeClose: this.confirmBeforeClose,
          restoreLastSession: this.restoreLastSession,
          uiLanguage: this.uiLanguage,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
        console.log('[Settings] 保存设置到 localStorage');
      } catch (error) {
        console.error('[Settings] 保存到 localStorage 失败:', error);
      }
    },

    // 更新设置
    async updateSettings(partial: Partial<EditorSettings>) {
      this.$patch(partial);
      this.maxOpenTabs = normalizeOpenTabsLimit(this.maxOpenTabs);
      this.memoryLimitMB = normalizeMemoryLimitMB(this.memoryLimitMB);
      this.contextRailWidth = normalizeContextRailWidth(this.contextRailWidth);
      this.contextRailCollapsed = normalizeContextRailCollapsed(this.contextRailCollapsed);
      this.markdownPreviewTheme = normalizeMarkdownPreviewTheme(this.markdownPreviewTheme);
      this.themePackages = normalizeStoredThemePackages(this.themePackages);
      if (!this.themePackages.some((theme) => theme.id === this.activeThemePackageId)) {
        this.activeThemePackageId = null;
      }
      this.keybindingOverrides = normalizeKeybindingOverrides(this.keybindingOverrides);
      
      // 保存到 localStorage
      this.saveToStorage();
      
      // 如果更新了自动保存相关设置，同步到 Tauri
      if (partial.autoSaveEnabled !== undefined || partial.autoSaveInterval !== undefined) {
        await this.syncAutoSaveToTauri();
      }
      
      // 如果更新了主题，应用主题
      if (partial.customThemeColors !== undefined) {
        this.customThemeColors = normalizeCustomThemeColors(this.customThemeColors);
      }

      if (
        partial.theme !== undefined ||
        partial.themeSkin !== undefined ||
        partial.monacoTheme !== undefined ||
        partial.customThemeColors !== undefined ||
        partial.themePackages !== undefined ||
        partial.activeThemePackageId !== undefined
      ) {
        this.applyTheme();
      }

      // 如果更新了界面语言，应用语言属性
      if (partial.uiLanguage !== undefined) {
        this.uiLanguage = normalizeUiLanguage(this.uiLanguage);
        this.applyLanguage();
      }
    },

    // 重置为默认值
    async resetToDefaults() {
      // 导入的主题包属于用户资产，恢复默认设置时保留。
      const themePackages = this.themePackages.map((theme) => ({ ...theme }));
      this.$reset();
      this.themePackages = themePackages;
      this.saveToStorage();
      await this.syncAutoSaveToTauri();
      this.applyTheme();
      this.applyLanguage();
    },

    // 应用主题
    applyTheme() {
      const root = document.documentElement;
      const themeState = getThemeResolution(this);
      const themeSkinClasses = THEME_SKINS.map((skin) => `skin-${skin}`);

      root.classList.remove('light', 'dark', 'theme-light', 'theme-dark', ...themeSkinClasses);
      root.classList.add(themeState.resolvedTheme, `theme-${themeState.resolvedTheme}`, `skin-${themeState.skin}`);
      // 生效中的主题包优先于快速调色，保证 UI 与 Monaco 配色同源。
      const activePackage = this.activeThemePackage;
      applyCustomThemeColors(
        root,
        activePackage ? themePackageToCssColors(activePackage) : this.customThemeColors,
      );
    },

    setCustomThemeColor(key: CustomThemeColorKey, color: string) {
      const next = { ...this.customThemeColors };
      const normalized = normalizeHexColor(color);
      if (normalized) {
        next[key] = normalized;
      } else {
        delete next[key];
      }
      this.updateSettings({ customThemeColors: next });
    },

    resetCustomThemeColors() {
      this.updateSettings({ customThemeColors: {} });
    },

    exportCustomThemeColors(): string {
      return JSON.stringify({ customThemeColors: this.customThemeColors }, null, 2);
    },

    importCustomThemeColors(raw: string): { success: boolean; applied: number; message: string } {
      try {
        const parsed = JSON.parse(raw);
        const candidate =
          parsed && typeof parsed === 'object' && 'customThemeColors' in parsed
            ? (parsed as Record<string, unknown>).customThemeColors
            : parsed;
        const normalized = normalizeCustomThemeColors(candidate);
        this.updateSettings({ customThemeColors: normalized });
        return {
          success: true,
          applied: Object.keys(normalized).length,
          message: 'ok',
        };
      } catch (error) {
        return {
          success: false,
          applied: 0,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },

    // ========== v0.4.0 主题包 ==========

    /**
     * 激活主题包；传入 null 回到内置皮肤 + 快速调色。包不存在时不改变当前主题。
     */
    applyThemePackage(packageId: string | null): ThemePackage | null {
      const target = packageId
        ? this.themePackages.find((theme) => theme.id === packageId) ?? null
        : null;
      if (packageId && !target) {
        return null;
      }

      this.activeThemePackageId = target ? target.id : null;
      if (target) {
        // 主题包自带明暗模式与 Monaco 基底，激活时一并同步。
        this.theme = target.mode;
        this.monacoTheme = target.monaco.base;
      }
      this.saveToStorage();
      this.applyTheme();
      return target;
    },

    /**
     * 导入主题包 JSON；失败时返回结构化错误且不改变当前主题。
     */
    importThemePackage(
      raw: string,
      options?: { activate?: boolean },
    ): { success: boolean; theme?: ThemePackage; error?: ThemePackageError } {
      const result = parseThemePackage(raw);
      if (!result.ok) {
        return { success: false, error: result.error };
      }

      const theme: ThemePackage = {
        ...result.theme,
        id: result.theme.id.startsWith(USER_THEME_ID_PREFIX)
          ? result.theme.id
          : `${USER_THEME_ID_PREFIX}${result.theme.id}`,
      };

      const existingIndex = this.themePackages.findIndex((item) => item.id === theme.id);
      if (existingIndex >= 0) {
        this.themePackages.splice(existingIndex, 1, theme);
      } else {
        this.themePackages.push(theme);
      }

      if (options?.activate === false) {
        this.saveToStorage();
      } else {
        this.applyThemePackage(theme.id);
      }

      return { success: true, theme };
    },

    /**
     * 删除主题包；删除当前生效的包时回退到内置皮肤。
     */
    removeThemePackage(packageId: string): boolean {
      const index = this.themePackages.findIndex((theme) => theme.id === packageId);
      if (index < 0) {
        return false;
      }

      this.themePackages.splice(index, 1);
      if (this.activeThemePackageId === packageId) {
        this.applyThemePackage(null);
      } else {
        this.saveToStorage();
      }
      return true;
    },

    /**
     * 导出主题包：优先导出指定/生效中的包；没有生效包时把当前皮肤 + 快速调色合成一个可再导入的包。
     */
    exportThemePackage(packageId?: string): string | null {
      const target = packageId
        ? this.themePackages.find((theme) => theme.id === packageId) ?? null
        : this.activeThemePackage;

      if (!target) {
        const colors: CustomThemeColors = {
          ...CUSTOM_THEME_COLOR_FALLBACKS,
          ...normalizeCustomThemeColors(this.customThemeColors),
        };
        const synthesized = createThemePackageFromColors({
          id: `skin-${this.themeSkin}`.replace(/[^a-z0-9-]/g, '-'),
          name: `${this.themeSkin} palette`,
          mode: this.resolvedTheme,
          colors,
          base: this.monacoTheme,
        });
        return synthesized.ok ? serializeThemePackage(synthesized.theme) : null;
      }

      const missing = missingRequiredThemeColors(target.colors);
      if (missing.length > 0) {
        return null;
      }

      return serializeThemePackage({
        ...target,
        // 导出的主题包去掉 user: 前缀，方便在其它实例直接导入。
        id: target.id.startsWith(USER_THEME_ID_PREFIX)
          ? target.id.slice(USER_THEME_ID_PREFIX.length)
          : target.id,
      });
    },

    // ========== v0.4.0 快捷键覆盖 ==========

    /**
     * 设置命令的快捷键覆盖；keys 传空串表示解绑，非法绑定返回 false。
     */
    setKeybindingOverride(commandId: string, keys: string): boolean {
      if (!commandId) {
        return false;
      }

      if (keys === '') {
        this.keybindingOverrides = { ...this.keybindingOverrides, [commandId]: '' };
        this.saveToStorage();
        return true;
      }

      const normalized = normalizeKeybinding(keys);
      if (!normalized) {
        return false;
      }

      this.keybindingOverrides = { ...this.keybindingOverrides, [commandId]: normalized };
      this.saveToStorage();
      return true;
    },

    /** 重置单条命令回默认绑定 */
    resetKeybinding(commandId: string) {
      if (!Object.prototype.hasOwnProperty.call(this.keybindingOverrides, commandId)) {
        return;
      }
      const next = { ...this.keybindingOverrides };
      delete next[commandId];
      this.keybindingOverrides = next;
      this.saveToStorage();
    },

    /** 重置全部快捷键覆盖 */
    resetAllKeybindings() {
      this.keybindingOverrides = {};
      this.saveToStorage();
    },

    applyLanguage() {
      if (typeof document === 'undefined') {
        return;
      }
      const root = document.documentElement as HTMLElement | null;
      if (root && typeof root.setAttribute === 'function') {
        root.setAttribute('lang', this.uiLanguage);
      }
    },

    // 切换主题（深色/浅色）
    toggleTheme() {
      const newTheme = this.theme === 'dark' ? 'light' : 'dark';
      this.updateSettings({ theme: newTheme });
    },

    // 调整字体大小
    adjustFontSize(delta: number) {
      const newSize = Math.max(10, Math.min(24, this.fontSize + delta));
      this.updateSettings({ fontSize: newSize });
    },

    // 重置字体大小
    resetFontSize() {
      this.updateSettings({ fontSize: 15 });
    },

    // 初始化
    async init() {
      this.ensureThemeListener();
      // 首先从 localStorage 加载
      this.loadFromStorage();
      this.uiLanguage = normalizeUiLanguage(this.uiLanguage);
      // 然后应用主题
      this.applyTheme();
      this.applyLanguage();
      // 最后从 Tauri 加载（覆盖部分设置）
      await this.loadFromTauri();
    },

    // 从 Tauri 加载设置
    async loadFromTauri() {
      try {
        const interval = await settingsCommands.getAutoSaveInterval();
        if (interval > 0) {
          this.autoSaveEnabled = true;
          this.autoSaveInterval = interval;
        } else {
          this.autoSaveEnabled = false;
        }
      } catch (error) {
        const tauriError = error instanceof TauriError ? error : TauriError.fromError(error, 'get_auto_save_interval');
        console.warn('Failed to load settings from Tauri:', tauriError.message);
        // 使用默认值，不抛出错误
      }
    },

    // 同步自动保存设置到 Tauri
    async syncAutoSaveToTauri() {
      try {
        const interval = this.autoSaveEnabled ? this.autoSaveInterval : 0;
        await settingsCommands.setAutoSaveInterval(interval);
      } catch (error) {
        const tauriError = error instanceof TauriError ? error : TauriError.fromError(error, 'auto_save_config');
        console.error('Failed to sync auto-save settings to Tauri:', tauriError.message);
        throw new Error(`同步自动保存设置失败：${tauriError.message}`);
      }
    },

    // 同步所有设置到 Tauri 后端
    async syncWithTauri() {
      await this.syncAutoSaveToTauri();
    },

    // ========== 完整的设置加载/保存 ==========

    // 加载所有设置 (从 Tauri 后端)
    async loadSettings(): Promise<void> {
      console.log('[Settings] 从 Tauri 加载设置');
      try {
        // 目前 Tauri 后端只存储了自动保存间隔
        // 未来可以扩展为加载所有设置
        const interval = await settingsCommands.getAutoSaveInterval();
        if (interval > 0) {
          this.autoSaveEnabled = true;
          this.autoSaveInterval = interval;
        } else {
          this.autoSaveEnabled = false;
        }
        console.log('[Settings] 设置加载成功');
      } catch (error) {
        const tauriError = error instanceof TauriError ? error : TauriError.fromError(error, 'load_settings');
        console.error('[Settings] 加载设置失败:', tauriError);
        throw new Error(`加载设置失败：${tauriError.message}`);
      }
    },

    // 保存所有设置 (到 Tauri 后端)
    async saveSettings(): Promise<void> {
      console.log('[Settings] 保存设置到 Tauri');
      try {
        // 保存自动保存间隔
        const interval = this.autoSaveEnabled ? this.autoSaveInterval : 0;
        await settingsCommands.setAutoSaveInterval(interval);
        
        // 未来可以在这里添加更多设置的保存逻辑
        // 例如：保存主题、字体等设置到配置文件
        
        console.log('[Settings] 设置保存成功');
      } catch (error) {
        const tauriError = error instanceof TauriError ? error : TauriError.fromError(error, 'save_settings');
        console.error('[Settings] 保存设置失败:', tauriError);
        throw new Error(`保存设置失败：${tauriError.message}`);
      }
    },
  },
});
