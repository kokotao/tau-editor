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

export const CUSTOM_THEME_COLOR_KEYS = [
  'bgApp',
  'panelBase',
  'textPrimary',
  'textSecondary',
  'accentBrand',
  'accentBrandStrong',
  'stateSuccess',
  'stateDanger',
] as const;

export type CustomThemeColorKey = (typeof CUSTOM_THEME_COLOR_KEYS)[number];
export type CustomThemeColors = Partial<Record<CustomThemeColorKey, string>>;

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

  // Markdown 预览
  markdownPreviewMode: 'edit' | 'split' | 'preview';
  markdownPreviewEnabled: boolean;

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

let systemThemeMediaQuery: MediaQueryList | null = null;
let systemThemeListenerAttached = false;

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  return null;
}

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
    markdownPreviewMode: 'edit',
    markdownPreviewEnabled: true,
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
          markdownPreviewMode: this.markdownPreviewMode,
          markdownPreviewEnabled: this.markdownPreviewEnabled,
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
        partial.customThemeColors !== undefined
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
      this.$reset();
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
      applyCustomThemeColors(root, this.customThemeColors);
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
