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
      <!-- 主题设置 -->
      <div class="settings-section">
        <h4 class="settings-section-title">外观</h4>
        
        <div class="settings-item">
          <label class="settings-label">主题模式</label>
          <div class="theme-selector">
            <button
              class="theme-btn"
              :class="{ active: settingsStore.theme === 'light' }"
              @click="setTheme('light')"
              title="浅色模式"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
              <span>浅色</span>
            </button>
            <button
              class="theme-btn"
              :class="{ active: settingsStore.theme === 'dark' }"
              @click="setTheme('dark')"
              title="深色模式"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              <span>深色</span>
            </button>
            <button
              class="theme-btn"
              :class="{ active: settingsStore.theme === 'system' }"
              @click="setTheme('system')"
              title="跟随系统"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              <span>系统</span>
            </button>
          </div>
        </div>

        <div class="settings-item">
          <label class="settings-label">编辑器主题</label>
          <select
            class="settings-select"
            :value="settingsStore.monacoTheme"
            @change="setMonacoTheme($event)"
          >
            <option value="vs">Light (vs)</option>
            <option value="vs-dark">Dark (vs-dark)</option>
            <option value="hc-black">High Contrast (hc-black)</option>
          </select>
        </div>
      </div>

      <!-- 字体设置 -->
      <div class="settings-section">
        <h4 class="settings-section-title">字体</h4>
        
        <div class="settings-item">
          <label class="settings-label">字体大小</label>
          <div class="font-size-control">
            <button class="font-size-btn" @click="decreaseFontSize" title="减小字体">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <span class="font-size-value">{{ settingsStore.fontSize }}px</span>
            <button class="font-size-btn" @click="increaseFontSize" title="增大字体">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button class="font-size-reset" @click="resetFontSize" title="重置">
              重置
            </button>
          </div>
        </div>

        <div class="settings-item">
          <label class="settings-label">预览</label>
          <div class="font-preview" :style="{ fontSize: settingsStore.fontSize + 'px' }">
            The quick brown fox jumps over the lazy dog.
            <br>
            快速棕色狐狸跳过懒狗。
          </div>
        </div>

        <div class="settings-item">
          <label class="settings-label">字体家族</label>
          <select
            class="settings-select"
            :value="settingsStore.fontFamily"
            @change="setFontFamily($event)"
          >
            <option value="'JetBrains Mono', 'Fira Code', monospace">JetBrains Mono</option>
            <option value="'Fira Code', monospace">Fira Code</option>
            <option value="'Source Code Pro', monospace">Source Code Pro</option>
            <option value="'Consolas', monospace">Consolas</option>
            <option value="monospace">系统等宽字体</option>
          </select>
        </div>
      </div>

      <!-- 编辑器设置 -->
      <div class="settings-section">
        <h4 class="settings-section-title">编辑器</h4>
        
        <div class="settings-item">
          <label class="settings-label">自动保存</label>
          <label class="settings-checkbox">
            <input
              type="checkbox"
              :checked="settingsStore.autoSaveEnabled"
              @change="setAutoSave($event)"
            />
            <span class="checkbox-text">启用自动保存</span>
          </label>
        </div>

        <div class="settings-item" v-if="settingsStore.autoSaveEnabled">
          <label class="settings-label">自动保存间隔</label>
          <select
            class="settings-select"
            :value="settingsStore.autoSaveInterval"
            @change="setAutoSaveInterval($event)"
          >
            <option :value="10">10 秒</option>
            <option :value="30">30 秒</option>
            <option :value="60">1 分钟</option>
            <option :value="300">5 分钟</option>
          </select>
        </div>

        <div class="settings-item">
          <label class="settings-label">缩进</label>
          <select
            class="settings-select"
            :value="settingsStore.tabSize"
            @change="setTabSize($event)"
          >
            <option :value="2">2 空格</option>
            <option :value="4">4 空格</option>
            <option :value="8">8 空格</option>
            <option :value="1">1 Tab</option>
          </select>
        </div>

        <div class="settings-item">
          <label class="settings-label">显示缩略图</label>
          <label class="settings-checkbox">
            <input
              type="checkbox"
              :checked="settingsStore.minimap"
              @change="setMinimap($event)"
            />
            <span class="checkbox-text">显示代码缩略图</span>
          </label>
        </div>

        <div class="settings-item">
          <label class="settings-label">自动换行</label>
          <label class="settings-checkbox">
            <input
              type="checkbox"
              :checked="settingsStore.wordWrap"
              @change="setWordWrap($event)"
            />
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
  'close': [];
}>();

// 主题设置
const setTheme = (theme: 'light' | 'dark' | 'system') => {
  settingsStore.updateSettings({ theme });
};

const setMonacoTheme = (event: Event) => {
  const target = event.target as HTMLSelectElement;
  settingsStore.updateSettings({ monacoTheme: target.value as 'vs' | 'vs-dark' | 'hc-black' });
};

// 字体设置
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
  const target = event.target as HTMLSelectElement;
  settingsStore.updateSettings({ fontFamily: target.value });
};

// 编辑器设置
const setAutoSave = (event: Event) => {
  const target = event.target as HTMLInputElement;
  settingsStore.updateSettings({ autoSaveEnabled: target.checked });
};

const setAutoSaveInterval = (event: Event) => {
  const target = event.target as HTMLSelectElement;
  settingsStore.updateSettings({ autoSaveInterval: Number(target.value) });
};

const setTabSize = (event: Event) => {
  const target = event.target as HTMLSelectElement;
  settingsStore.updateSettings({ tabSize: Number(target.value) });
};

const setMinimap = (event: Event) => {
  const target = event.target as HTMLInputElement;
  settingsStore.updateSettings({ minimap: target.checked });
};

const setWordWrap = (event: Event) => {
  const target = event.target as HTMLInputElement;
  settingsStore.updateSettings({ wordWrap: target.checked });
};
</script>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--n-color, #252526);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--n-border-color, #333);
}

.settings-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--n-text-color, #fff);
  margin: 0;
}

.settings-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--n-text-color, #999);
  transition: background 0.15s, color 0.15s;
}

.settings-close:hover {
  background: var(--n-hover-color, #2a2d2e);
  color: var(--n-text-color, #fff);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.settings-section {
  margin-bottom: 24px;
}

.settings-section-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--n-text-color, #999);
  margin: 0 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--n-border-color, #333);
}

.settings-item {
  margin-bottom: 16px;
}

.settings-label {
  display: block;
  font-size: 13px;
  color: var(--n-text-color, #ccc);
  margin-bottom: 8px;
}

.theme-selector {
  display: flex;
  gap: 8px;
}

.theme-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 1;
  padding: 12px;
  background: var(--n-hover-color, #2a2d2e);
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  color: var(--n-text-color, #ccc);
  transition: all 0.2s;
}

.theme-btn:hover {
  background: var(--n-active-color, #37373d);
}

.theme-btn.active {
  border-color: #007acc;
  background: var(--n-active-color, #37373d);
  color: var(--n-text-color, #fff);
}

.theme-btn span {
  font-size: 12px;
}

.settings-select {
  width: 100%;
  padding: 8px 12px;
  background: var(--n-hover-color, #2a2d2e);
  border: 1px solid var(--n-border-color, #333);
  border-radius: 4px;
  color: var(--n-text-color, #fff);
  font-size: 13px;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s;
}

.settings-select:hover {
  border-color: #007acc;
}

.settings-select:focus {
  border-color: #007acc;
}

.settings-select option {
  background: var(--n-color, #252526);
  color: var(--n-text-color, #fff);
}

.font-size-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.font-size-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: var(--n-hover-color, #2a2d2e);
  border: 1px solid var(--n-border-color, #333);
  border-radius: 4px;
  cursor: pointer;
  color: var(--n-text-color, #ccc);
  transition: all 0.15s;
}

.font-size-btn:hover {
  background: var(--n-active-color, #37373d);
  border-color: #007acc;
}

.font-size-value {
  flex: 1;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--n-text-color, #fff);
  padding: 8px 0;
  background: var(--n-hover-color, #2a2d2e);
  border-radius: 4px;
}

.font-size-reset {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--n-border-color, #333);
  border-radius: 4px;
  color: var(--n-text-color, #999);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.font-size-reset:hover {
  border-color: #007acc;
  color: var(--n-text-color, #fff);
}

.font-preview {
  padding: 12px;
  background: var(--n-hover-color, #2a2d2e);
  border: 1px solid var(--n-border-color, #333);
  border-radius: 4px;
  color: var(--n-text-color, #ccc);
  line-height: 1.6;
  font-family: 'JetBrains Mono', monospace;
}

.settings-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.settings-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #007acc;
}

.checkbox-text {
  font-size: 13px;
  color: var(--n-text-color, #ccc);
}
</style>
