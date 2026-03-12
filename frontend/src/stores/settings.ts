import { defineStore } from 'pinia';
import { settingsCommands, TauriError } from '@/lib/tauri';

export interface EditorSettings {
  // 编辑器外观
  theme: 'light' | 'dark' | 'system';
  monacoTheme: 'vs' | 'vs-dark' | 'hc-black';
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

  // 文件树
  showHiddenFiles: boolean;
  fileTreeWidth: number;

  // 其他
  confirmBeforeClose: boolean;
  restoreLastSession: boolean;
}

// localStorage 键名
const STORAGE_KEY = 'text-editor-settings';

export const useSettingsStore = defineStore('settings', {
  state: (): EditorSettings => ({
    theme: 'system',
    monacoTheme: 'vs-dark',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: 14,
    lineHeight: 1.6,
    minimap: true,
    wordWrap: false,
    autoSaveEnabled: true,
    autoSaveInterval: 30,
    tabSize: 2,
    insertSpaces: true,
    trimTrailingWhitespace: true,
    showHiddenFiles: false,
    fileTreeWidth: 250,
    confirmBeforeClose: true,
    restoreLastSession: true,
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
  },

  actions: {
    // 从 localStorage 加载设置
    loadFromStorage() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          this.$patch(parsed);
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
          monacoTheme: this.monacoTheme,
          fontFamily: this.fontFamily,
          fontSize: this.fontSize,
          lineHeight: this.lineHeight,
          minimap: this.minimap,
          wordWrap: this.wordWrap,
          autoSaveEnabled: this.autoSaveEnabled,
          autoSaveInterval: this.autoSaveInterval,
          tabSize: this.tabSize,
          insertSpaces: this.insertSpaces,
          showHiddenFiles: this.showHiddenFiles,
          fileTreeWidth: this.fileTreeWidth,
          confirmBeforeClose: this.confirmBeforeClose,
          restoreLastSession: this.restoreLastSession,
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
      
      // 保存到 localStorage
      this.saveToStorage();
      
      // 如果更新了自动保存相关设置，同步到 Tauri
      if (partial.autoSaveEnabled !== undefined || partial.autoSaveInterval !== undefined) {
        await this.syncAutoSaveToTauri();
      }
      
      // 如果更新了主题，应用主题
      if (partial.theme !== undefined || partial.monacoTheme !== undefined) {
        this.applyTheme();
      }
    },

    // 重置为默认值
    async resetToDefaults() {
      this.$reset();
      this.saveToStorage();
      await this.syncAutoSaveToTauri();
      this.applyTheme();
    },

    // 应用主题
    applyTheme() {
      const root = document.documentElement;
      if (this.theme === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
      } else if (this.theme === 'light') {
        root.classList.add('light');
        root.classList.remove('dark');
      } else {
        // system
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.classList.toggle('dark', prefersDark);
        root.classList.toggle('light', !prefersDark);
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
      this.updateSettings({ fontSize: 14 });
    },

    // 初始化
    async init() {
      // 首先从 localStorage 加载
      this.loadFromStorage();
      // 然后应用主题
      this.applyTheme();
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
