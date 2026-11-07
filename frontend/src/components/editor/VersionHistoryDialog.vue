<template>
  <Teleport to="body">
  <div v-if="visible" class="cloud-hist-backdrop" data-testid="version-history-dialog" @click.self="emit('close')">
    <section class="cloud-hist" role="dialog" aria-modal="true" style="min-width: 320px" @keydown.esc.prevent="emit('close')">
      <header class="cloud-hist__header">
        <h3 data-testid="version-history-title" style="white-space: nowrap">{{ copy.historyTitle(fileName || '') }}</h3>
        <button type="button" class="cloud-hist__close" data-testid="version-history-close" @click="emit('close')">×</button>
      </header>

      <p v-if="loading" class="cloud-hist__hint" data-testid="version-history-loading">{{ copy.historyLoading }}</p>
      <p v-else-if="error" class="cloud-hist__hint cloud-hist__hint--error" data-testid="version-history-error">{{ error }}</p>
      <p v-else-if="versions.length === 0" class="cloud-hist__hint" data-testid="version-history-empty">{{ copy.historyEmpty }}</p>
      <div v-else class="cloud-hist__body">
      <ul class="cloud-hist__list" data-testid="version-history-list">
        <li
          v-for="row in versions"
          :key="row.versionId"
          class="cloud-hist__row"
          :class="{ 'is-current': row.version === currentVersion }"
          :data-testid="`version-history-row-${row.version}`"
        >
          <span class="cloud-hist__version">{{ copy.versionLabel(row.version) }}</span>
          <span v-if="row.version === currentVersion" class="cloud-hist__badge">{{ copy.currentVersion }}</span>
          <span class="cloud-hist__meta">
            <span v-if="row.createdAt">{{ formatTime(row.createdAt) }}</span>
            <span>{{ formatSize(row.size) }}</span>
            <span v-if="row.remark" class="cloud-hist__remark">{{ row.remark }}</span>
          </span>
          <button
            type="button"
            class="cloud-hist__button"
            :data-testid="`version-history-preview-${row.version}`"
            :disabled="previewLoading"
            @click="preview(row.versionId)"
          >{{ copy.preview }}</button>
          <button
            type="button"
            class="cloud-hist__button"
            :data-testid="`version-history-restore-${row.version}`"
            :disabled="busy || row.version === currentVersion"
            @click="restore(row.version, row.versionId)"
          >
            {{ copy.restore }}
          </button>
        </li>
      </ul>

      <section v-if="previewLoading || previewVersion" class="cloud-hist__preview" data-testid="version-history-preview">
        <header class="cloud-hist__preview-header">
          <strong>{{ previewVersion ? copy.versionLabel(previewVersion.version) : copy.preview }}</strong>
          <span v-if="previewVersion?.createdAt">{{ formatTime(previewVersion.createdAt) }}</span>
        </header>
        <p v-if="previewLoading" class="cloud-hist__hint" data-testid="version-history-preview-loading">
          {{ copy.previewLoading }}
        </p>
        <template v-else-if="previewVersion">
          <div v-if="mindmapPreview" class="cloud-hist__mindmap-toolbar">
            <span>{{ mindmapPreview.formatName }}</span>
            <span class="cloud-hist__mindmap-actions">
              <button
                v-if="!mindmapSourceVisible"
                type="button"
                data-testid="version-history-mindmap-fit-toggle"
                @click="mindmapFitMode = mindmapFitMode === 'fit' ? 'actual' : 'fit'"
              >{{ mindmapFitMode === 'fit' ? '原始尺寸' : '适应面板' }}</button>
              <button type="button" data-testid="version-history-mindmap-source-toggle" @click="mindmapSourceVisible = !mindmapSourceVisible">
                {{ mindmapSourceVisible ? '查看导图' : '查看源码' }}
              </button>
            </span>
          </div>
          <div
            v-if="mindmapPreview && !mindmapSourceVisible"
            class="cloud-hist__preview-content cloud-hist__preview-mindmap"
            :class="{ 'is-actual-size': mindmapFitMode === 'actual' }"
            data-testid="version-history-preview-mindmap"
            v-html="mindmapPreview.svg"
          ></div>
          <div
            v-else-if="previewVersion.content !== null && previewFormat === 'markdown'"
            class="cloud-hist__preview-content cloud-hist__preview-markdown"
            data-testid="version-history-preview-content"
            data-preview-format="markdown"
            @click="handlePreviewClick"
            v-html="previewMarkdownHtml"
          ></div>
          <pre
            v-else-if="previewVersion.content !== null"
            class="cloud-hist__preview-content"
            data-testid="version-history-preview-content"
            data-preview-format="text"
          >{{ previewVersion.content }}</pre>
          <p v-else class="cloud-hist__hint" data-testid="version-history-preview-unavailable">{{ copy.previewUnavailable }}</p>
        </template>
      </section>

      <p v-if="previewError" class="cloud-hist__hint cloud-hist__hint--error" data-testid="version-history-preview-error">
        {{ previewError }}
      </p>
      </div>
      <p v-if="notice" class="cloud-hist__hint" data-testid="version-history-notice">{{ notice }}</p>
    </section>
  </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * @description 云文档历史版本弹窗：标题写清「《文件名》的历史版本」，列出时间/大小/说明并可恢复。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 19:20
 */
import { computed, ref, watch } from 'vue';
import { listCloudDocVersions, previewCloudDocVersion, restoreCloudDocVersion } from '@/services/cloudDocService';
import { getCloudDocPanelI18n } from '@/i18n/ui';
import { useSettingsStore } from '@/stores/settings';
import { appCommands } from '@/lib/tauri';
import { isMindMapPath } from '@/services/documentTypeService';
import { previewMindmapImport } from '@/services/mindmap/importExportService';
import type { CloudDocVersion, CloudDocVersionPreview } from '@/lib/tauri';

const props = withDefaults(defineProps<{
  visible?: boolean;
  fileId?: number | null;
  fileName?: string;
  currentVersion?: number | null;
}>(), { visible: false, fileId: null, fileName: '', currentVersion: null });

const emit = defineEmits<{ close: []; restored: [version: number] }>();

const settingsStore = useSettingsStore();
const copy = computed(() => getCloudDocPanelI18n(settingsStore.uiLanguage));

const versions = ref<CloudDocVersion[]>([]);
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const notice = ref('');
const previewVersion = ref<CloudDocVersionPreview | null>(null);
const previewLoading = ref(false);
const previewError = ref('');
const previewMarkdownHtml = ref('');
const mindmapPreview = ref<{
  formatName: string;
  svg: string;
  sourceText: string;
} | null>(null);
const mindmapSourceVisible = ref(false);
const mindmapFitMode = ref<'fit' | 'actual'>('fit');

const previewExtension = computed(() => {
  const name = props.fileName?.trim().toLowerCase() ?? '';
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1) : '';
});
const previewFormat = computed<'markdown' | 'text'>(
  () => (['md', 'markdown', 'mdown', 'mkd', 'mkdn'].includes(previewExtension.value) ? 'markdown' : 'text'),
);

async function handlePreviewClick(event: MouseEvent) {
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(anchor instanceof HTMLAnchorElement)) return;
  event.preventDefault();
  event.stopPropagation();
  const href = anchor.getAttribute('href')?.trim() ?? '';
  if (!/^https?:\/\//i.test(href)) return;
  try {
    await appCommands.openExternalLink(href);
  } catch {
    // 外链打开失败不应影响只读预览本身
  }
}

function formatTime(value: string | null): string {
  if (!value) {
    return '';
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString(settingsStore.uiLanguage) : value;
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index] ?? 'B'}`;
}

async function load(): Promise<void> {
  const fileId = props.fileId;
  versions.value = [];
  error.value = '';
  notice.value = '';
  previewVersion.value = null;
  previewError.value = '';
  previewMarkdownHtml.value = '';
  mindmapPreview.value = null;
  if (fileId === null || fileId === undefined) {
    return;
  }
  loading.value = true;
  try {
    const outcome = await listCloudDocVersions(fileId);
    if (!outcome.ok) {
      error.value = copy.value.loadFailed(outcome.message);
      return;
    }
    versions.value = outcome.data;
  } finally {
    loading.value = false;
  }
}

async function preview(versionId: number): Promise<void> {
  const fileId = props.fileId;
  if (fileId === null || fileId === undefined || previewLoading.value) return;
  previewLoading.value = true;
  previewVersion.value = null;
  previewError.value = '';
  previewMarkdownHtml.value = '';
  mindmapPreview.value = null;
  mindmapSourceVisible.value = false;
  mindmapFitMode.value = 'fit';
  try {
    const outcome = await previewCloudDocVersion(fileId, versionId);
    if (!outcome.ok) {
      previewError.value = copy.value.loadFailed(outcome.message);
      return;
    }
    previewVersion.value = outcome.data;
    if (
      typeof outcome.data.content === 'string'
      && (isMindMapPath(props.fileName) || isMindMapPath((outcome.data as { path?: string }).path))
    ) {
      const parsed = await previewMindmapImport({ fileName: props.fileName, content: outcome.data.content });
      if (parsed.ok && parsed.document) {
        const { renderMindmapSvg } = await import('@/services/mindmapSvgService');
        const rendered = renderMindmapSvg(parsed.document, {
          background: 'transparent',
          padding: 24,
          colorMode: 'color',
          fontFamily: settingsStore.uiFontFamily,
        });
        mindmapPreview.value = {
          formatName: parsed.formatName,
          svg: rendered.svg,
          sourceText: outcome.data.content,
        };
      } else {
        // 损坏/不支持的导图版本仍保留源码可读，避免预览区空白。
        mindmapSourceVisible.value = true;
      }
    } else if (typeof outcome.data.content === 'string' && previewFormat.value === 'markdown') {
      const { renderMarkdown } = await import('@/services/markdownRenderService');
      previewMarkdownHtml.value = renderMarkdown(outcome.data.content);
    } else {
      previewMarkdownHtml.value = '';
    }
  } finally {
    previewLoading.value = false;
  }
}

async function restore(version: number, versionId: number): Promise<void> {
  const fileId = props.fileId;
  if (fileId === null || fileId === undefined || busy.value) {
    return;
  }
  busy.value = true;
  try {
    const outcome = await restoreCloudDocVersion(fileId, versionId);
    if (!outcome.ok) {
      error.value = copy.value.loadFailed(outcome.message);
      return;
    }
    emit('restored', outcome.data.version);
    await load();
    // load() 会清空 notice，恢复提示放在刷新之后
    notice.value = copy.value.restoreDone(outcome.data.version);
  } finally {
    busy.value = false;
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      void load();
    }
  },
  { immediate: true },
);

defineExpose({ load });
</script>

<style scoped>
.cloud-hist-backdrop {
  position: fixed;
  inset: 0;
  z-index: 12500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6vh 6vw;
  background: var(--bg-backdrop, rgba(8, 13, 26, 0.78));
}

.cloud-hist {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(1180px, calc(100vw - 40px));
  min-width: 320px;
  max-width: calc(100vw - 40px);
  height: min(820px, 90vh);
  max-height: 90vh;
  padding: 14px 16px;
  color: var(--text-primary, #e5e9f0);
  background: var(--panel-elevated, #151d2d);
  border: 1px solid var(--border-strong, rgba(148, 163, 184, 0.38));
  border-radius: var(--radius-dialog, 10px);
  box-shadow: var(--shadow-overlay, 0 24px 60px rgba(0, 0, 0, 0.45));
}

.cloud-hist__header {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.cloud-hist__header h3 {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 13.5px;
  font-weight: 600;
  white-space: nowrap;
  word-break: keep-all;
  text-overflow: ellipsis;
}

.cloud-hist__close {
  padding: 0 4px;
  font-size: 16px;
  line-height: 1;
  color: var(--text-secondary, #a8b3c5);
  cursor: pointer;
  background: transparent;
  border: 0;
}

.cloud-hist__hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-muted, #75829e);
}

.cloud-hist__hint--error {
  color: var(--state-danger, #dc2626);
}

.cloud-hist__body {
  display: grid;
  grid-template-columns: minmax(360px, 0.85fr) minmax(0, 1.45fr);
  flex: 1;
  gap: 14px;
  min-width: 0;
  min-height: 0;
}

.cloud-hist__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
  flex: 1 1 300px;
  min-height: 140px;
}

.cloud-hist__preview {
  display: flex;
  flex-direction: column;
  flex: 1 1 640px;
  min-width: 0;
  min-height: 0;
  gap: 8px;
  min-height: 0;
  padding-top: 8px;
  border-top: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
}

.cloud-hist__body > .cloud-hist__preview {
  padding-top: 0;
  padding-left: 14px;
  border-top: 0;
  border-left: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
}

@media (max-width: 820px), (max-height: 600px) {
  .cloud-hist {
    width: min(680px, calc(100vw - 24px));
    height: min(860px, 94vh);
    max-height: 94vh;
  }
  .cloud-hist__body {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(160px, 0.75fr) minmax(260px, 1.25fr);
  }
  .cloud-hist__body > .cloud-hist__preview {
    padding-top: 12px;
    padding-left: 0;
    border-top: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
    border-left: 0;
  }
}

.cloud-hist__preview-header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11.5px;
}

.cloud-hist__preview-header span { color: var(--text-muted, #75829e); }

.cloud-hist__preview-content {
  flex: 1;
  min-height: 260px;
  max-height: none;
  margin: 0;
  padding: 10px;
  overflow: auto;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-control, 5px);
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  color: var(--text-primary, #e5e9f0);
  font: 11px/1.55 var(--font-code, monospace);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.cloud-hist__preview-markdown {
  font: 12px/1.65 var(--font-ui);
  white-space: normal;
}
.cloud-hist__preview-mindmap {
  display: grid;
  place-items: center;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.cloud-hist__preview-mindmap :deep(svg) {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  max-height: 100%;
  object-fit: contain;
}
.cloud-hist__preview-mindmap.is-actual-size {
  display: block;
  place-items: initial;
}
.cloud-hist__preview-mindmap.is-actual-size :deep(svg) {
  width: auto;
  max-width: none;
  height: auto;
  max-height: none;
}
.cloud-hist__mindmap-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 11px;
}
.cloud-hist__mindmap-actions { display: flex; align-items: center; gap: 6px; }
.cloud-hist__mindmap-toolbar button {
  padding: 3px 8px;
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  background: var(--panel-elevated);
  color: var(--text-primary);
  cursor: pointer;
}
.cloud-hist__preview-markdown :deep(h1),
.cloud-hist__preview-markdown :deep(h2),
.cloud-hist__preview-markdown :deep(h3),
.cloud-hist__preview-markdown :deep(h4) {
  margin: 0.8em 0 0.4em;
  color: var(--text-primary);
  line-height: 1.35;
}
.cloud-hist__preview-markdown :deep(h1) { font-size: 18px; }
.cloud-hist__preview-markdown :deep(h2) { font-size: 16px; }
.cloud-hist__preview-markdown :deep(h3) { font-size: 14px; }
.cloud-hist__preview-markdown :deep(p),
.cloud-hist__preview-markdown :deep(ul),
.cloud-hist__preview-markdown :deep(ol),
.cloud-hist__preview-markdown :deep(blockquote) { margin: 0.55em 0; }
.cloud-hist__preview-markdown :deep(table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.cloud-hist__preview-markdown :deep(th),
.cloud-hist__preview-markdown :deep(td) {
  padding: 5px 7px;
  border: 1px solid var(--border-soft);
  text-align: left;
  vertical-align: top;
}
.cloud-hist__preview-markdown :deep(th) { background: var(--surface-active); }
.cloud-hist__preview-markdown :deep(pre) {
  overflow: auto;
  padding: 8px;
  border-radius: 4px;
  background: var(--surface-muted);
  font: 11px/1.55 var(--font-code, monospace);
}
.cloud-hist__preview-markdown :deep(code) { font-family: var(--font-code, monospace); }
.cloud-hist__preview-markdown :deep(img) { max-width: 100%; height: auto; }

.cloud-hist__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 12px;
  border-radius: var(--radius-control, 5px);
}

.cloud-hist__row:hover {
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
}

.cloud-hist__row.is-current {
  background: var(--surface-active, rgba(124, 199, 255, 0.14));
}

.cloud-hist__version {
  font-weight: 600;
  white-space: nowrap;
}

.cloud-hist__badge {
  padding: 0 6px;
  font-size: 10px;
  color: var(--accent-brand, #7cc7ff);
  border: 1px solid var(--accent-brand, #7cc7ff);
  border-radius: var(--radius-badge, 999px);
}

.cloud-hist__meta {
  display: flex;
  gap: 8px;
  margin-left: auto;
  font-size: 11px;
  color: var(--text-muted, #75829e);
}

.cloud-hist__remark {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloud-hist__button {
  padding: 3px 10px;
  font-size: 11.5px;
  color: var(--text-primary, #e5e9f0);
  cursor: pointer;
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-control, 5px);
}

.cloud-hist__button:hover:not(:disabled) {
  color: var(--accent-brand, #7cc7ff);
  border-color: var(--accent-brand, #7cc7ff);
}

.cloud-hist__button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
