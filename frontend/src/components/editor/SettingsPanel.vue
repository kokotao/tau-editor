<template>
  <div class="settings-panel" data-testid="settings-panel">
    <div class="settings-header">
      <h3 class="settings-title">设置</h3>
      <button class="settings-close" @click="emit('close')" title="关闭">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <div class="settings-content">
      <div class="settings-section">
        <h4 class="settings-section-title">外观</h4>

        <div class="settings-item">
          <label class="settings-label">主题模式</label>
          <div class="theme-selector">
            <button class="theme-btn" :class="{ active: settingsStore.theme === 'light' }" @click="setTheme('light')">浅色</button>
            <button class="theme-btn" :class="{ active: settingsStore.theme === 'dark' }" @click="setTheme('dark')">深色</button>
            <button class="theme-btn" :class="{ active: settingsStore.theme === 'system' }" @click="setTheme('system')">系统</button>
          </div>
        </div>

        <div class="settings-item">
          <label class="settings-label">编辑器主题</label>
          <select class="settings-select" :value="settingsStore.monacoTheme" @change="setMonacoTheme($event)">
            <option value="vs">Light (vs)</option>
            <option value="vs-dark">Dark (vs-dark)</option>
            <option value="hc-black">High Contrast (hc-black)</option>
          </select>
        </div>
      </div>

      <div class="settings-section">
        <h4 class="settings-section-title">字体</h4>

        <div class="settings-item">
          <label class="settings-label">字体大小</label>
          <div class="font-size-control">
            <button class="font-size-btn" @click="decreaseFontSize">-</button>
            <span class="font-size-value">{{ settingsStore.fontSize }}px</span>
            <button class="font-size-btn" @click="increaseFontSize">+</button>
            <button class="font-size-reset" @click="resetFontSize">重置</button>
          </div>
        </div>

        <div class="settings-item">
          <label class="settings-label">字体家族</label>
          <select class="settings-select" :value="settingsStore.fontFamily" @change="setFontFamily($event)">
            <option value="'JetBrains Mono', 'Fira Code', 'SF Mono', monospace">JetBrains Mono</option>
            <option value="'Fira Code', 'JetBrains Mono', monospace">Fira Code</option>
            <option value="'Maple Mono', 'JetBrains Mono', monospace">Maple Mono</option>
            <option value="'Cascadia Code', 'Consolas', monospace">Cascadia Code</option>
            <option value="'IBM Plex Mono', 'SF Mono', monospace">IBM Plex Mono</option>
            <option value="'Monaspace Neon', 'Monaco', monospace">Monaspace Neon</option>
            <option value="'SF Mono', 'Menlo', 'Monaco', monospace">SF Mono / Menlo</option>
            <option value="'Source Code Pro', monospace">Source Code Pro</option>
            <option value="'Consolas', monospace">Consolas</option>
            <option value="monospace">系统等宽字体</option>
          </select>
        </div>

        <div class="settings-item">
          <label class="settings-label">预览</label>
          <div class="font-preview" :style="{ fontSize: `${settingsStore.fontSize}px`, fontFamily: settingsStore.fontFamily }">
            const hello = "你好，世界";
            <br>
            console.log(hello);
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h4 class="settings-section-title">编辑器</h4>

        <div class="settings-item">
          <label class="settings-label">自动保存</label>
          <label class="settings-checkbox">
            <input type="checkbox" :checked="settingsStore.autoSaveEnabled" @change="setAutoSave($event)" />
            <span class="checkbox-text">启用自动保存</span>
          </label>
        </div>

        <div class="settings-item" v-if="settingsStore.autoSaveEnabled">
          <label class="settings-label">自动保存间隔</label>
          <select class="settings-select" :value="settingsStore.autoSaveInterval" @change="setAutoSaveInterval($event)">
            <option :value="10">10 秒</option>
            <option :value="30">30 秒</option>
            <option :value="60">1 分钟</option>
            <option :value="300">5 分钟</option>
          </select>
        </div>

        <div class="settings-item">
          <label class="settings-label">缩进</label>
          <select class="settings-select" :value="settingsStore.tabSize" @change="setTabSize($event)">
            <option :value="2">2 空格</option>
            <option :value="4">4 空格</option>
            <option :value="8">8 空格</option>
          </select>
        </div>

        <div class="settings-item">
          <label class="settings-label">显示缩略图</label>
          <label class="settings-checkbox">
            <input type="checkbox" :checked="settingsStore.minimap" @change="setMinimap($event)" />
            <span class="checkbox-text">显示代码缩略图</span>
          </label>
        </div>

        <div class="settings-item">
          <label class="settings-label">自动换行</label>
          <label class="settings-checkbox">
            <input type="checkbox" :checked="settingsStore.wordWrap" @change="setWordWrap($event)" />
            <span class="checkbox-text">启用自动换行</span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings';

const settingsStore = useSettingsStore();

const emit = defineEmits<{
  close: [];
}>();

const setTheme = (theme: 'light' | 'dark' | 'system') => {
  settingsStore.updateSettings({ theme });
};

const setMonacoTheme = (event: Event) => {
  settingsStore.updateSettings({ monacoTheme: (event.target as HTMLSelectElement).value as 'vs' | 'vs-dark' | 'hc-black' });
};

const increaseFontSize = () => {
  settingsStore.adjustFontSize(1);
};

const decreaseFontSize = () => {
  settingsStore.adjustFontSize(-1);
};

const resetFontSize = () => {
  settingsStore.resetFontSize();
};

const setFontFamily = (event: Event) => {
  settingsStore.updateSettings({ fontFamily: (event.target as HTMLSelectElement).value });
};

const setAutoSave = (event: Event) => {
  settingsStore.updateSettings({ autoSaveEnabled: (event.target as HTMLInputElement).checked });
};

const setAutoSaveInterval = (event: Event) => {
  settingsStore.updateSettings({ autoSaveInterval: Number((event.target as HTMLSelectElement).value) });
};

const setTabSize = (event: Event) => {
  settingsStore.updateSettings({ tabSize: Number((event.target as HTMLSelectElement).value) });
};

const setMinimap = (event: Event) => {
  settingsStore.updateSettings({ minimap: (event.target as HTMLInputElement).checked });
};

const setWordWrap = (event: Event) => {
  settingsStore.updateSettings({ wordWrap: (event.target as HTMLInputElement).checked });
};
</script>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--panel, #101726);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
}

.settings-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.settings-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
}

.settings-close:hover {
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
  border-color: var(--border-soft, rgba(148, 163, 184, 0.18));
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.settings-section {
  margin-bottom: 28px;
}

.settings-section-title {
  margin: 0 0 14px;
  color: var(--text-muted, #94a3b8);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.settings-item {
  margin-bottom: 16px;
}

.settings-label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-secondary, #cbd5e1);
  font-size: 13px;
}

.settings-select,
.font-preview,
.theme-btn,
.font-size-control,
.settings-checkbox {
  border-radius: 14px;
}

.settings-select,
.font-preview {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  color: var(--text-primary, #f8fafc);
}

.theme-selector {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.theme-btn {
  height: 42px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  background: transparent;
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
}

.theme-btn.active {
  border-color: transparent;
  background: linear-gradient(135deg, var(--accent-blue-strong, #4dabff), #38bdf8);
  color: #fff;
}

.font-size-control {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
}

.font-size-btn,
.font-size-reset {
  height: 34px;
  min-width: 34px;
  padding: 0 12px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  border-radius: 10px;
  background: transparent;
  color: var(--text-primary, #f8fafc);
  cursor: pointer;
}

.font-size-value {
  min-width: 62px;
  text-align: center;
}

.font-preview {
  line-height: 1.7;
}

.settings-checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  color: var(--text-secondary, #cbd5e1);
}
</style>
