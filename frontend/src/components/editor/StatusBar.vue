<template>
  <div class="status-bar" :class="{ 'status-bar--mindmap': isMindmap }" data-testid="status-bar">
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
      <div v-if="!isMindmap" class="status-item author-info">
        <button class="author-trigger" data-testid="author-info-trigger" type="button" @click="showAuthorModal = true">
          {{ authorCopy.entry }}
        </button>
      </div>
    </div>

    <div v-show="isMindmap" class="status-section mindmap-status-section" data-testid="mindmap-status-section">
      <button class="author-trigger" data-testid="author-info-trigger" type="button" @click="showAuthorModal = true">
        {{ authorCopy.entry }}
      </button>
      <div id="mindmap-sheet-bar-host" class="mindmap-status-section__sheets"></div>
      <div class="mindmap-status-shortcuts" role="group" aria-label="思维导图常用操作" data-testid="mindmap-status-shortcuts">
        <span class="mindmap-status-shortcut"><kbd>滚轮</kbd><span>平移画布</span></span>
        <span class="mindmap-status-shortcut"><kbd>Ctrl/⌘ + 滚轮</kbd><span>缩放</span></span>
        <span class="mindmap-status-shortcut"><kbd>拖拽空白</kbd><span>平移画布</span></span>
        <span class="mindmap-status-shortcut"><kbd>Ctrl/⌘ + Z</kbd><span>撤销</span></span>
        <span class="mindmap-status-shortcut"><kbd>Ctrl/⌘ + Y</kbd><span>重做</span></span>
        <span class="mindmap-status-shortcut"><kbd>Ctrl/⌘ + Alt + O/P</kbd><span>大纲/属性</span></span>
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
      <!-- 云端同步状态：失败时必须可见（本地已保存但云端没落地），点击重试 -->
      <button
        v-if="cloudSyncState === 'failed'"
        type="button"
        class="status-capsule cloud-sync-capsule is-failed"
        data-testid="cloud-sync-failed"
        :title="cloudSyncError || copy.cloudSyncFailedTitle"
        @click="emit('retry-cloud-sync')"
      >
        <span class="status-icon" aria-hidden="true">⚠</span>
        <span class="status-label">{{ copy.cloudSyncFailedTitle }}</span>
        <span class="status-value">{{ copy.cloudSyncRetry }}</span>
      </button>
      <div v-else-if="cloudSyncState === 'saving'" class="status-capsule cloud-sync-capsule">
        <span class="status-label" data-testid="cloud-sync-saving">{{ copy.cloudSyncSaving }}</span>
      </div>
      <!-- 编码：读写链路目前固定 UTF-8，没有真正的「按其它编码解码/重编码」实现。
           之前这里是个 8 项下拉（gbk/utf-16le…），选了只改状态栏文字、文件仍按 UTF-8 处理，
           会让人以为已经转码（信任它就会把 GBK 文件存坏）。因此改为如实展示，不可选。 -->
      <div class="status-pill encoding-pill" :title="copy.encodingTitle">
        <span class="pill-prefix">{{ copy.encoding }}</span>
        <span class="status-value encoding-readonly" data-testid="encoding-readonly">UTF-8</span>
      </div>
    </div>

    <div class="status-section status-right">
      <div class="status-item">
        <div class="status-pill">
          <span class="pill-prefix">{{ copy.theme }}</span>
          <StatusBarSelect
            test-id="theme-select"
            :value="normalizedTheme"
            :options="themeSelectOptions"
            :title="copy.editorThemeTitle"
            @change="emit('theme-change', $event)"
          />
        </div>
      </div>
      <div class="status-item">
        <div class="status-pill language-pill">
          <span class="pill-prefix">{{ copy.language }}</span>
          <StatusBarSelect
            test-id="language-mode-display"
            :value="normalizedLanguage"
            :options="languageSelectOptions"
            :title="copy.languageModeTitle"
            @change="emit('language-change', $event)"
          />
        </div>
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
import StatusBarSelect from '@/components/editor/StatusBarSelect.vue';
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
  /**
   * 云文档同步状态。`failed` 时必须可见（本地已保存但云端没落地），
   * 否则用户会以为已经入库、关掉文档即丢。
   */
  cloudSyncState?: 'synced' | 'saving' | 'failed' | 'offline' | null;
  cloudSyncError?: string | null;
  isMindmap?: boolean;
}

const props = withDefaults(defineProps<StatusBarProps>(), {
  cursorPosition: () => ({ line: 1, column: 1 }),
  encoding: 'utf-8',
  language: 'plaintext',
  monacoTheme: 'vs-dark',
  wordCount: 0,
  autoSaveEnabled: true,
  lastSaveTime: undefined,
  cloudSyncState: null,
  cloudSyncError: null,
  isMindmap: false,
});

const emit = defineEmits<{
  'encoding-change': [encoding: string];
  'language-change': [language: string];
  'theme-change': [theme: string];
  /** 点「同步失败」徽标时请求重试本次云端保存 */
  'retry-cloud-sync': [];
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
const normalizedTheme = computed<MonacoThemeValue>(
  () => themeOptions.find((item) => item.value === props.monacoTheme)?.value ?? 'vs-dark',
);
const normalizedLanguage = computed<EditorLanguageMode>(
  () => languageOptions.find((item) => item.value === props.language)?.value ?? 'plaintext',
);
const encodingSelectOptions = computed(() =>
  encodingOptions.map(({ value }) => ({ value, label: copy.value.encodingOptions[value] })),
);
const themeSelectOptions = computed(() =>
  themeOptions.map(({ value }) => ({ value, label: copy.value.themeOptions[value] })),
);
const languageSelectOptions = computed(() =>
  languageOptions.map(({ value }) => ({ value, label: copy.value.languageOptions[value] })),
);
const showAuthorModal = ref(false);

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
  position: relative;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 36px;
  padding: 0 10px;
  background: var(--panel-elevated, #111827);
  color: var(--text-primary, #f8fafc);
  font-size: var(--font-size-ui-sm, 12px);
  border-top: 1px solid var(--border-strong, rgba(148, 163, 184, 0.3));
  transition: background-color .22s ease, color .22s ease, border-color .22s ease;
}

.status-bar--mindmap {
  justify-content: flex-start;
  gap: 12px;
  overflow-x: auto;
  scrollbar-width: thin;
}

.status-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-left {
  flex: 0 0 auto;
}

.status-center {
  flex: 1 1 auto;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
}

.status-bar--mindmap .status-center {
  flex: 0 0 auto;
  justify-content: flex-start;
}

.status-right {
  flex: 0 0 auto;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
}

.status-label {
  opacity: 0.92;
}

.status-value {
  opacity: 0.74;
  font-size: var(--font-size-ui-xs, 11px);
}

.author-info {
  gap: 6px;
  white-space: nowrap;
}

.mindmap-status-section {
  flex: 1 1 420px;
  min-width: 0;
  overflow: hidden;
}

.mindmap-status-section__sheets {
  display: flex;
  flex: 0 0 auto;
  min-width: 0;
  max-width: min(42vw, 560px);
  overflow-x: auto;
  scrollbar-width: thin;
}

.mindmap-status-shortcuts {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: thin;
  color: var(--text-muted, #94a3b8);
  font-size: 10px;
  white-space: nowrap;
}

.mindmap-status-shortcut {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.mindmap-status-shortcut kbd {
  padding: 1px 4px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.28));
  border-radius: 3px;
  color: var(--text-secondary, #cbd5e1);
  font: inherit;
}

.author-trigger {
  height: 28px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.22));
  font-size: var(--font-size-ui-xs, 11px);
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
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

@media (max-width: 1100px) {
  .mindmap-status-shortcuts {
    gap: 8px;
  }
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
  border-radius: var(--radius-lg);
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
  font-size: var(--font-size-ui-lg, 15px);
}

.author-modal-close {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
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
  font-size: var(--font-size-ui-md, 13px);
}

.author-donation {
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
}

.author-donation h5 {
  margin: 0 0 6px;
  font-size: var(--font-size-ui-md, 13px);
  color: var(--text-primary, #f8fafc);
}

.author-donation-desc {
  margin: 0 0 10px;
  font-size: var(--font-size-ui-sm, 12px);
}

.author-qr-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.author-qr-card {
  margin: 0;
  padding: 8px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.03);
}

.author-qr-card img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius-sm);
}

.author-qr-card figcaption {
  margin-top: 6px;
  font-size: var(--font-size-ui-sm, 12px);
  color: var(--text-secondary, #cbd5e1);
  text-align: center;
}

.author-donation-tip {
  margin: 10px 0 0 !important;
  font-size: var(--font-size-ui-sm, 12px);
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
  min-height: 26px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
}

/* 云端同步失败：用警示色描边，保证在状态栏里能被一眼看到（本地已存但云端没落地） */
.cloud-sync-capsule {
  cursor: default;
  font: inherit;
}

.cloud-sync-capsule.is-failed {
  cursor: pointer;
  color: var(--state-error, #ef4444);
  background: color-mix(in srgb, var(--state-error, #ef4444) 12%, transparent);
  border-color: color-mix(in srgb, var(--state-error, #ef4444) 45%, transparent);
}

.cloud-sync-capsule.is-failed:hover {
  background: color-mix(in srgb, var(--state-error, #ef4444) 20%, transparent);
}

/* 编码为只读展示（当前读写固定 UTF-8，不再给会误导的下拉） */
.encoding-readonly {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 26px;
  padding: 0 9px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
}

.pill-prefix {
  font-size: var(--font-size-ui-xs, 11px);
  color: rgba(255, 255, 255, 0.68);
}

</style>
