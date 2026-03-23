<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="naiveThemeOverrides">
    <div class="settings-panel" data-testid="settings-panel">
    <div class="settings-header">
      <h3 class="settings-title">{{ copy.title }}</h3>
      <button class="settings-close" @click="emit('close')" :title="copy.close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <div class="settings-content">
      <div class="settings-section">
        <h4 class="settings-section-title">{{ copy.appearance }}</h4>

        <div class="settings-item">
          <label class="settings-label">{{ copy.language }}</label>
          <n-select
            class="settings-nselect"
            data-testid="select-ui-language"
            :value="settingsStore.uiLanguage"
            :options="uiLanguageOptions"
            :consistent-menu-width="false"
            @update:value="setUiLanguage"
          />
        </div>

        <div class="settings-item">
          <label class="settings-label">{{ copy.themeMode }}</label>
          <div class="theme-selector">
            <button class="theme-btn" :class="{ active: settingsStore.theme === 'light' }" @click="setTheme('light')">{{ copy.themeLight }}</button>
            <button class="theme-btn" :class="{ active: settingsStore.theme === 'dark' }" @click="setTheme('dark')">{{ copy.themeDark }}</button>
            <button class="theme-btn" :class="{ active: settingsStore.theme === 'system' }" @click="setTheme('system')">{{ copy.themeSystem }}</button>
          </div>
        </div>

        <div class="settings-item">
          <label class="settings-label">{{ copy.editorTheme }}</label>
          <n-select
            class="settings-nselect"
            data-testid="select-monaco-theme"
            :value="settingsStore.monacoTheme"
            :options="monacoThemeOptions"
            :consistent-menu-width="false"
            @update:value="setMonacoTheme"
          />
        </div>
      </div>

      <div class="settings-section">
        <h4 class="settings-section-title">{{ copy.font }}</h4>

        <div class="settings-item">
          <label class="settings-label">{{ copy.fontSize }}</label>
          <div class="font-size-control">
            <button class="font-size-btn" @click="decreaseFontSize">-</button>
            <span class="font-size-value">{{ settingsStore.fontSize }}px</span>
            <button class="font-size-btn" @click="increaseFontSize">+</button>
            <button class="font-size-reset" @click="resetFontSize">{{ copy.reset }}</button>
          </div>
        </div>

        <div class="settings-item">
          <label class="settings-label">{{ copy.fontFamily }}</label>
          <n-select
            class="settings-nselect"
            data-testid="select-font-family"
            :value="settingsStore.fontFamily"
            :options="fontFamilyOptions"
            :consistent-menu-width="false"
            @update:value="setFontFamily"
          />
        </div>

        <div class="settings-item">
          <label class="settings-label">{{ copy.preview }}</label>
          <div class="font-preview" :style="{ fontSize: `${settingsStore.fontSize}px`, fontFamily: settingsStore.fontFamily }">
            {{ copy.fontPreviewLine1 }}
            <br>
            {{ copy.fontPreviewLine2 }}
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h4 class="settings-section-title">{{ copy.editor }}</h4>

        <div class="settings-item">
          <label class="settings-label">{{ copy.autoSave }}</label>
          <label class="settings-checkbox">
            <input type="checkbox" :checked="settingsStore.autoSaveEnabled" @change="setAutoSave($event)" />
            <span class="checkbox-text">{{ copy.autoSaveEnabled }}</span>
          </label>
        </div>

        <div class="settings-item" v-if="settingsStore.autoSaveEnabled">
          <label class="settings-label">{{ copy.autoSaveInterval }}</label>
          <n-select
            class="settings-nselect"
            data-testid="select-auto-save-interval"
            :value="settingsStore.autoSaveInterval"
            :options="autoSaveIntervalOptions"
            :consistent-menu-width="false"
            @update:value="setAutoSaveInterval"
          />
        </div>

        <div class="settings-item">
          <label class="settings-label">{{ copy.indent }}</label>
          <n-select
            class="settings-nselect"
            data-testid="select-tab-size"
            :value="settingsStore.tabSize"
            :options="tabSizeOptions"
            :consistent-menu-width="false"
            @update:value="setTabSize"
          />
        </div>

        <div class="settings-item">
          <label class="settings-label">{{ copy.minimap }}</label>
          <label class="settings-checkbox">
            <input type="checkbox" :checked="settingsStore.minimap" @change="setMinimap($event)" />
            <span class="checkbox-text">{{ copy.minimapEnabled }}</span>
          </label>
        </div>

        <div class="settings-item">
          <label class="settings-label">{{ copy.wordWrap }}</label>
          <label class="settings-checkbox">
            <input type="checkbox" :checked="settingsStore.wordWrap" @change="setWordWrap($event)" />
            <span class="checkbox-text">{{ copy.wordWrapEnabled }}</span>
          </label>
        </div>
      </div>

      <div class="settings-footer">
        <button
          class="settings-author-entry"
          data-testid="settings-author-entry"
          type="button"
          @click="showAuthorModal = true"
        >
          {{ authorCopy.entry }}
        </button>
      </div>
    </div>

    <div
      v-if="showAuthorModal"
      class="settings-author-modal-overlay"
      data-testid="author-modal-overlay"
      @click="showAuthorModal = false"
    >
      <div class="settings-author-modal" data-testid="author-modal" @click.stop>
        <div class="settings-author-modal-header">
          <h4>{{ authorCopy.modalTitle }}</h4>
          <button type="button" class="settings-author-modal-close" @click="showAuthorModal = false">×</button>
        </div>
        <div class="settings-author-modal-content">
          <p>{{ authorCopy.nameLabel }}albert_luo</p>
          <p>{{ authorCopy.emailLabel }}480199976@qq.com</p>
          <a
            class="settings-author-link"
            href="https://github.com/albertluo"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ authorCopy.githubLabel }}
          </a>
        </div>
      </div>
    </div>
    </div>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { darkTheme, NConfigProvider, NSelect, type GlobalThemeOverrides, type SelectOption } from 'naive-ui';
import { useSettingsStore } from '@/stores/settings';
import { getAuthorInfoI18n, getSettingsPanelI18n, type MonacoThemeValue, type UiLanguage } from '@/i18n/ui';

const settingsStore = useSettingsStore();
const copy = computed(() => getSettingsPanelI18n(settingsStore.uiLanguage));
const authorCopy = computed(() => getAuthorInfoI18n(settingsStore.uiLanguage));
const naiveTheme = computed(() => (settingsStore.resolvedTheme === 'dark' ? darkTheme : null));
const showAuthorModal = ref(false);
const naiveThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#38bdf8',
    primaryColorHover: '#7dd3fc',
    primaryColorPressed: '#0ea5e9',
    borderRadius: '14px',
  },
  Select: {
    peers: {
      InternalSelection: {
        color: 'rgba(255, 255, 255, 0.04)',
        colorActive: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(148, 163, 184, 0.18)',
        borderActive: '1px solid rgba(56, 189, 248, 0.9)',
        borderFocus: '1px solid rgba(56, 189, 248, 0.9)',
        boxShadowFocus: '0 0 0 3px rgba(56, 189, 248, 0.2)',
      },
      InternalSelectMenu: {
        color: '#111a2f',
      },
    },
  },
};

const uiLanguageOptions = computed<SelectOption[]>(() => [
  { label: copy.value.languageZh, value: 'zh-CN' },
  { label: copy.value.languageEn, value: 'en-US' },
]);

const monacoThemeOptions = computed<SelectOption[]>(() =>
  settingsStore.monacoThemeOptions.map((option) => ({
    label: `${option.label}${option.recommended ? ` (${copy.value.recommended})` : ''}`,
    value: option.value,
  })),
);

const fontFamilyOptions = computed<SelectOption[]>(() => [
  { label: 'JetBrains Mono', value: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace" },
  { label: 'Fira Code', value: "'Fira Code', 'JetBrains Mono', monospace" },
  { label: 'Maple Mono', value: "'Maple Mono', 'JetBrains Mono', monospace" },
  { label: 'Cascadia Code', value: "'Cascadia Code', 'Consolas', monospace" },
  { label: 'IBM Plex Mono', value: "'IBM Plex Mono', 'SF Mono', monospace" },
  { label: 'Monaspace Neon', value: "'Monaspace Neon', 'Monaco', monospace" },
  { label: 'SF Mono / Menlo', value: "'SF Mono', 'Menlo', 'Monaco', monospace" },
  { label: 'Source Code Pro', value: "'Source Code Pro', monospace" },
  { label: 'Consolas', value: "'Consolas', monospace" },
  { label: copy.value.systemMonospace, value: 'monospace' },
]);

const autoSaveIntervalOptions = computed<SelectOption[]>(() => [
  { label: copy.value.seconds10, value: 10 },
  { label: copy.value.seconds30, value: 30 },
  { label: copy.value.minute1, value: 60 },
  { label: copy.value.minutes5, value: 300 },
]);

const tabSizeOptions = computed<SelectOption[]>(() => [
  { label: copy.value.spaces2, value: 2 },
  { label: copy.value.spaces4, value: 4 },
  { label: copy.value.spaces8, value: 8 },
]);

const emit = defineEmits<{
  close: [];
}>();

const setTheme = (theme: 'light' | 'dark' | 'system') => {
  settingsStore.updateSettings({ theme });
};

const setUiLanguage = (value: string | number | null) => {
  if (typeof value !== 'string') return;
  settingsStore.updateSettings({ uiLanguage: value as UiLanguage });
};

const setMonacoTheme = (value: string | number | null) => {
  if (typeof value !== 'string') return;
  settingsStore.updateSettings({ monacoTheme: value as MonacoThemeValue });
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

const setFontFamily = (value: string | number | null) => {
  if (typeof value !== 'string') return;
  settingsStore.updateSettings({ fontFamily: value });
};

const setAutoSave = (event: Event) => {
  settingsStore.updateSettings({ autoSaveEnabled: (event.target as HTMLInputElement).checked });
};

const setAutoSaveInterval = (value: string | number | null) => {
  if (value === null) return;
  settingsStore.updateSettings({ autoSaveInterval: Number(value) });
};

const setTabSize = (value: string | number | null) => {
  if (value === null) return;
  settingsStore.updateSettings({ tabSize: Number(value) });
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

.settings-select-shell,
.font-preview {
  width: 100%;
}

.settings-select-shell {
  position: relative;
  display: flex;
  align-items: center;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.06),
    rgba(255, 255, 255, 0.02)
  );
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.settings-select-shell:hover {
  border-color: rgba(125, 211, 252, 0.38);
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.08),
    rgba(255, 255, 255, 0.03)
  );
}

.settings-select-shell:focus-within {
  border-color: rgba(56, 189, 248, 0.9);
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
}

.settings-select {
  width: 100%;
  padding: 12px 42px 12px 14px;
  border: none;
  background: transparent;
  color: var(--text-primary, #f8fafc);
  font: inherit;
  appearance: none;
  outline: none;
  cursor: pointer;
}

.settings-select-icon {
  position: absolute;
  right: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted, #94a3b8);
  pointer-events: none;
}

.settings-select option {
  color: #f8fafc;
  background: #111a2f;
}

.font-preview {
  padding: 12px 14px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
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

.settings-footer {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
}

.settings-author-entry {
  width: 100%;
  height: 36px;
  border-radius: 12px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.22));
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
}

.settings-author-entry:hover {
  border-color: rgba(125, 211, 252, 0.6);
  color: var(--text-primary, #f8fafc);
}

.settings-author-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 24;
  background: rgba(2, 6, 23, 0.56);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-author-modal {
  width: min(360px, 92vw);
  border-radius: 16px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.22));
  background: var(--panel, #101726);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.32);
  overflow: hidden;
}

.settings-author-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
}

.settings-author-modal-header h4 {
  margin: 0;
  font-size: 15px;
}

.settings-author-modal-close {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
}

.settings-author-modal-close:hover {
  border-color: var(--border-soft, rgba(148, 163, 184, 0.18));
  background: rgba(255, 255, 255, 0.06);
}

.settings-author-modal-content {
  padding: 14px 16px 18px;
  line-height: 1.7;
}

.settings-author-modal-content p {
  margin: 0 0 8px;
}

.settings-author-link {
  color: var(--accent-blue, #7cc7ff);
  text-decoration: none;
}

.settings-author-link:hover {
  text-decoration: underline;
}
</style>
