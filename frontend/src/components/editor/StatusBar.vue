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
        <span class="status-label" data-testid="word-count">{{ normalizedWordCountLabel }}</span>
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
      <label class="status-pill encoding-pill">
        <span class="pill-prefix">{{ copy.encoding }}</span>
        <select
          class="status-select"
          data-testid="encoding-select"
          :value="normalizedEncoding"
          :title="copy.encodingTitle"
          @change="handleEncodingChange"
        >
          <option
            v-for="encodingOption in encodingOptions"
            :key="encodingOption.value"
            :value="encodingOption.value"
          >
            {{ copy.encodingOptions[encodingOption.value] }}
          </option>
        </select>
      </label>
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
        <p>
          {{ authorCopy.githubLabel }}
          <a
            class="author-link"
            :href="projectHomepageUrl"
            target="_blank"
            rel="noopener noreferrer"
            @click.prevent="handleOpenProjectHomepage"
          >
            {{ projectHomepageUrl }}
          </a>
        </p>
        <p>{{ authorCopy.qqGroupLabel }}1091775563</p>
        <section class="author-donation">
          <h5>{{ authorCopy.donationTitle }}</h5>
          <p class="author-donation-desc">{{ authorCopy.donationDesc }}</p>
          <div class="author-qr-grid">
            <figure class="author-qr-card">
              <img :src="wechatDonateQr" :alt="authorCopy.wechatLabel" loading="lazy" />
              <figcaption>{{ authorCopy.wechatLabel }}</figcaption>
            </figure>
            <figure class="author-qr-card">
              <img :src="alipayDonateQr" :alt="authorCopy.alipayLabel" loading="lazy" />
              <figcaption>{{ authorCopy.alipayLabel }}</figcaption>
            </figure>
          </div>
          <p class="author-donation-tip">{{ authorCopy.donationTip }}</p>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useEditorStore } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';
import { appCommands } from '@/lib/tauri';
import {
  getAuthorInfoI18n,
  getStatusBarI18n,
  type EditorEncoding,
  type EditorLanguageMode,
  type MonacoThemeValue,
} from '@/i18n/ui';
import wechatDonateQr from '@/assets/donation/WeChatPay.jpg';
import alipayDonateQr from '@/assets/donation/AliPay.jpg';

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
const projectHomepageUrl = 'https://github.com/kokotao/tau-editor';
const themeOptions: Array<{ value: MonacoThemeValue }> = [
  { value: 'vs' },
  { value: 'vs-dark' },
  { value: 'hc-black' },
];
const encodingOptions: Array<{ value: EditorEncoding }> = [
  { value: 'utf-8' },
  { value: 'utf-16le' },
  { value: 'utf-16be' },
  { value: 'gbk' },
  { value: 'gb18030' },
  { value: 'big5' },
  { value: 'shift_jis' },
  { value: 'iso-8859-1' },
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
const normalizedWordCountLabel = computed(() => {
  if (typeof props.wordCount !== 'number' || props.wordCount < 0) {
    return '--';
  }
  return String(props.wordCount);
});
const normalizedEncoding = computed<EditorEncoding>(() => {
  const rawEncoding = (props.encoding ?? 'utf-8').toLowerCase();
  const matched = encodingOptions.find((item) => item.value === rawEncoding);
  return matched?.value ?? 'utf-8';
});
const showAuthorModal = ref(false);

const handleEncodingChange = (event: Event) => {
  emit('encoding-change', (event.target as HTMLSelectElement).value);
};

const handleLanguageChange = (event: Event) => {
  emit('language-change', (event.target as HTMLSelectElement).value);
};

const handleThemeChange = (event: Event) => {
  emit('theme-change', (event.target as HTMLSelectElement).value);
};

const handleOpenProjectHomepage = async () => {
  await appCommands.openProjectHomepage();
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
  white-space: nowrap;
}

.author-trigger {
  height: 28px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.22));
  font-size: 11px;
  background: rgba(16, 23, 38, 0.85);
  color: var(--text-secondary, #cbd5e1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.author-trigger:hover {
  border-color: rgba(125, 211, 252, 0.6);
  color: var(--text-primary, #f8fafc);
}

.author-link {
  color: var(--accent-blue, #7cc7ff);
  text-decoration: none;
  border-bottom: 1px dashed transparent;
  transition: border-color 0.15s ease, color 0.15s ease;
  word-break: break-all;
}

.author-link:hover {
  color: #7dd3fc;
  border-color: currentColor;
}

.author-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.56);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
}

.author-modal {
  width: min(560px, 92vw);
  border-radius: 16px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.22));
  background: var(--panel, #101726);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.32);
  overflow: hidden;
}

.author-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
}

.author-modal-header h4 {
  margin: 0;
  font-size: 15px;
}

.author-modal-close {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary, #cbd5e1);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.author-modal-close:hover {
  border-color: var(--border-soft, rgba(148, 163, 184, 0.18));
  background: rgba(255, 255, 255, 0.06);
}

.author-modal-content {
  padding: 14px 16px 18px;
  line-height: 1.7;
}

.author-modal-content p {
  margin: 0 0 8px;
  color: var(--text-secondary, #cbd5e1);
  font-size: 13px;
}

.author-donation {
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
}

.author-donation h5 {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--text-primary, #f8fafc);
}

.author-donation-desc {
  margin: 0 0 10px;
  font-size: 12px;
}

.author-qr-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.author-qr-card {
  margin: 0;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.03);
}

.author-qr-card img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 8px;
}

.author-qr-card figcaption {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary, #cbd5e1);
  text-align: center;
}

.author-donation-tip {
  margin: 10px 0 0 !important;
  font-size: 12px;
}

@media (max-width: 520px) {
  .author-qr-grid {
    grid-template-columns: 1fr;
  }
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
