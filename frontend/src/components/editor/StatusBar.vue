<template>
  <div class="status-bar" data-testid="status-bar">
    <div class="status-section status-left">
      <div class="status-item">
        <span class="status-label" data-testid="cursor-position">{{ cursorPositionLabel }}</span>
      </div>
      <div class="status-item">
        <span class="status-label" data-testid="line-count">{{ lineCountLabel }}</span>
      </div>
      <div class="status-item">
        <span class="status-label" data-testid="word-count">{{ wordCount }}</span>
      </div>
      <div class="status-item author-info">
        <button class="author-trigger" data-testid="author-info-trigger" type="button" @click="showAuthorModal = true">
          {{ authorCopy.entry }}
        </button>
      </div>
    </div>

    <div class="status-section status-center">
      <div class="status-capsule auto-save-capsule" v-if="autoSaveEnabled">
        <span class="status-icon" data-testid="auto-save-icon">💾</span>
        <span class="status-label" data-testid="auto-save-label">{{ copy.autoSave }}</span>
        <span class="status-value" data-testid="auto-save-status" v-if="lastSaveTime">
          {{ formatLastSaveTime(lastSaveTime) }}
        </span>
      </div>
      <div class="status-capsule encoding-capsule">
        <span class="status-label" data-testid="encoding-display">{{ displayEncoding }}</span>
      </div>
    </div>

    <div class="status-section status-right">
      <div class="status-item">
        <label class="status-pill">
          <span class="pill-prefix">{{ copy.theme }}</span>
          <select
            class="status-select"
            data-testid="theme-select"
            :value="monacoTheme"
            @change="handleThemeChange"
            :title="copy.editorThemeTitle"
          >
            <option
              v-for="themeOption in themeOptions"
              :key="themeOption.value"
              :value="themeOption.value"
            >
              {{ copy.themeOptions[themeOption.value] }}
            </option>
          </select>
        </label>
      </div>
      <div class="status-item">
        <label class="status-pill language-pill">
          <span class="pill-prefix">{{ copy.language }}</span>
          <select
            class="status-select"
            data-testid="language-mode-display"
            :value="language"
            @change="handleLanguageChange"
            :title="copy.languageModeTitle"
          >
            <option
              v-for="languageOption in languageOptions"
              :key="languageOption.value"
              :value="languageOption.value"
            >
              {{ copy.languageOptions[languageOption.value] }}
            </option>
          </select>
        </label>
      </div>
    </div>
  </div>

  <div
    v-if="showAuthorModal"
    class="author-modal-overlay"
    data-testid="author-modal-overlay"
    @click="showAuthorModal = false"
  >
    <div class="author-modal" data-testid="author-modal" @click.stop>
      <div class="author-modal-header">
        <h4>{{ authorCopy.modalTitle }}</h4>
        <button type="button" class="author-modal-close" @click="showAuthorModal = false">×</button>
      </div>
      <div class="author-modal-content">
        <p>{{ authorCopy.nameLabel }}albert_luo</p>
        <p>{{ authorCopy.emailLabel }}480199976@qq.com</p>
        <a
          class="author-link"
          href="https://github.com/albertluo"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ authorCopy.githubLabel }}
        </a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useEditorStore } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';
import { getAuthorInfoI18n, getStatusBarI18n, type EditorLanguageMode, type MonacoThemeValue } from '@/i18n/ui';

interface StatusBarProps {
  cursorPosition?: { line: number; column: number };
  encoding?: string;
  language?: string;
  monacoTheme?: string;
  wordCount?: number;
  autoSaveEnabled?: boolean;
  lastSaveTime?: Date;
}

const props = withDefaults(defineProps<StatusBarProps>(), {
  cursorPosition: () => ({ line: 1, column: 1 }),
  encoding: 'utf-8',
  language: 'plaintext',
  monacoTheme: 'vs-dark',
  wordCount: 0,
  autoSaveEnabled: true,
  lastSaveTime: undefined,
});

const emit = defineEmits<{
  'encoding-change': [encoding: string];
  'language-change': [language: string];
  'theme-change': [theme: string];
}>();

const editorStore = useEditorStore();
const settingsStore = useSettingsStore();
const copy = computed(() => getStatusBarI18n(settingsStore.uiLanguage));
const authorCopy = computed(() => getAuthorInfoI18n(settingsStore.uiLanguage));
const themeOptions: Array<{ value: MonacoThemeValue }> = [
  { value: 'vs' },
  { value: 'vs-dark' },
  { value: 'hc-black' },
];
const languageOptions: Array<{ value: EditorLanguageMode }> = [
  { value: 'plaintext' },
  { value: 'javascript' },
  { value: 'typescript' },
  { value: 'python' },
  { value: 'java' },
  { value: 'c' },
  { value: 'cpp' },
  { value: 'csharp' },
  { value: 'go' },
  { value: 'rust' },
  { value: 'html' },
  { value: 'css' },
  { value: 'scss' },
  { value: 'json' },
  { value: 'xml' },
  { value: 'markdown' },
  { value: 'yaml' },
  { value: 'sql' },
  { value: 'shell' },
];
const normalizedLineCount = computed(() => {
  const rawLineCount = (editorStore as any).lineCount;
  if (typeof rawLineCount === 'number') {
    return rawLineCount;
  }

  if (rawLineCount && typeof rawLineCount === 'object' && 'value' in rawLineCount) {
    const value = Number((rawLineCount as { value: unknown }).value);
    return Number.isFinite(value) ? value : 1;
  }

  return 1;
});
const cursorPositionLabel = computed(() => copy.value.rowCol(props.cursorPosition.line, props.cursorPosition.column));
const lineCountLabel = computed(() => copy.value.lineCount(normalizedLineCount.value));
const displayEncoding = computed(() => (props.encoding ?? 'utf-8').toUpperCase());
const showAuthorModal = ref(false);

const handleLanguageChange = (event: Event) => {
  emit('language-change', (event.target as HTMLSelectElement).value);
};

const handleThemeChange = (event: Event) => {
  emit('theme-change', (event.target as HTMLSelectElement).value);
};

const formatLastSaveTime = (date: Date) => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return copy.value.justNow;
  if (minutes < 60) return copy.value.minutesAgo(minutes);
  if (hours < 24) return copy.value.hoursAgo(hours);
  return date.toLocaleTimeString(settingsStore.uiLanguage, { hour: '2-digit', minute: '2-digit' });
};
</script>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 40px;
  padding: 0 14px;
  background:
    linear-gradient(90deg, rgba(76, 146, 255, 0.24), rgba(46, 204, 113, 0.12)),
    var(--panel-elevated, #111827);
  color: var(--text-primary, #f8fafc);
  font-size: 12px;
  border-top: 1px solid var(--border-strong, rgba(148, 163, 184, 0.3));
}

.status-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-left {
  flex: 0 0 auto;
}

.status-center {
  flex: 1 1 auto;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px;
}

.status-right {
  flex: 0 0 auto;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
}

.status-label {
  opacity: 0.92;
}

.status-value {
  opacity: 0.74;
  font-size: 11px;
}

.author-info {
  gap: 6px;
  opacity: 0.82;
  white-space: nowrap;
}

.author-trigger {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 999px;
  height: 24px;
  padding: 0 10px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
}

.author-trigger:hover {
  border-color: rgba(125, 211, 252, 0.6);
  color: #e2e8f0;
}

.author-link {
  color: var(--accent-blue, #7cc7ff);
  text-decoration: none;
  border-bottom: 1px dashed transparent;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.author-link:hover {
  color: #7dd3fc;
  border-color: currentColor;
}

.author-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
}

.author-modal {
  min-width: 320px;
  max-width: 420px;
  border-radius: 14px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  background: linear-gradient(180deg, #111a2f, #0f172a);
  box-shadow: 0 14px 36px rgba(2, 6, 23, 0.5);
  padding: 12px 14px;
}

.author-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.author-modal-header h4 {
  margin: 0;
  font-size: 14px;
  color: #f8fafc;
}

.author-modal-close {
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.author-modal-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.author-modal-content p {
  margin: 0;
  color: #cbd5e1;
  font-size: 13px;
}

.status-icon {
  font-size: 14px;
}

.status-capsule {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.pill-prefix {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.68);
}

.status-select {
  min-width: 72px;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  outline: none;
  appearance: none;
}

.status-select option {
  background: #1b2230;
  color: #fff;
}
</style>
