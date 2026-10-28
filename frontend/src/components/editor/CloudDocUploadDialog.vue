<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="cloud-doc-upload cd-nocturne"
      data-testid="cloud-doc-upload-overlay"
      @click.self="handleOverlayClick()"
    >
      <section
        class="cloud-doc-upload__card"
        data-testid="cloud-doc-upload-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="panel.uploadDialogTitle"
      >
        <header class="cloud-doc-upload__header">
          <h3 class="cloud-doc-upload__title">{{ panel.uploadDialogTitle }}</h3>
          <button
            ref="closeButtonRef"
            type="button"
            class="cloud-doc-upload__icon-button"
            data-testid="cloud-doc-upload-close-icon"
            :aria-label="panel.uploadClose"
            :title="panel.uploadClose"
            :disabled="busy"
            @click="emit('close')"
          >
            ×
          </button>
        </header>

        <p class="cloud-doc-upload__target" data-testid="cloud-doc-upload-target">
          {{ panel.uploadDialogTarget(targetName) }}
        </p>
        <p class="cloud-doc-upload__hint">{{ panel.uploadPickHint }}</p>

        <!-- 进度：串行上传，done/total 由宿主的 onItemStart/onItem 推进 -->
        <div
          class="cd-progress"
          role="progressbar"
          :aria-valuemin="0"
          :aria-valuemax="total"
          :aria-valuenow="done"
          :aria-label="panel.uploadProgress(done, total)"
        >
          <div class="cd-progress__bar" :style="{ width: `${percent}%` }" />
        </div>
        <p class="cloud-doc-upload__progress" data-testid="cloud-doc-upload-progress">
          {{ panel.uploadProgress(done, total) }}
        </p>

        <ul v-if="rows.length > 0" class="cloud-doc-upload__list cd-scroll" data-testid="cloud-doc-upload-list">
          <li
            v-for="row in rows"
            :key="row.localPath"
            class="cloud-doc-upload__row"
            :class="`is-${row.status}`"
            data-testid="cloud-doc-upload-row"
            :data-status="row.status"
          >
            <span class="cloud-doc-upload__row-name" :title="row.localPath">{{ row.fileName }}</span>
            <span class="cloud-doc-upload__row-status">{{ statusLabel(row) }}</span>
            <span v-if="detailOf(row)" class="cloud-doc-upload__row-detail">{{ detailOf(row) }}</span>
          </li>
        </ul>
        <p v-else class="cloud-doc-upload__empty" data-testid="cloud-doc-upload-empty">{{ panel.uploadEmpty }}</p>

        <p v-if="summary" class="cloud-doc-upload__summary" data-testid="cloud-doc-upload-summary">{{ summaryText }}</p>
        <p v-if="aborted" class="cloud-doc-upload__aborted" data-testid="cloud-doc-upload-aborted">
          {{ abortedText }}
        </p>

        <div class="cloud-doc-upload__actions">
          <button
            v-if="busy"
            type="button"
            class="cloud-doc-upload__button"
            data-testid="cloud-doc-upload-cancel"
            @click="emit('cancel')"
          >
            {{ panel.uploadCancel }}
          </button>
          <button
            type="button"
            class="cloud-doc-upload__button cloud-doc-upload__button--primary"
            data-testid="cloud-doc-upload-close"
            :disabled="busy"
            @click="emit('close')"
          >
            {{ panel.uploadClose }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * @description 云文档批量上传弹窗（R2）：目标分类 + 逐条状态列表 + 进度条 + 中止/关闭。
 *
 * 组件本身不发 IPC、不持有队列：上传计划与串行执行在
 * `cloudDocBatchUploadService` + 宿主 `CloudDocTree` 里，这里只负责把 `rows/summary` 画出来，
 * 这样侧栏与云文档浏览弹窗两个宿主共用同一套进度展示，视觉沿用 `cd-nocturne` 与现有弹窗骨架。
 *
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-28
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { getCloudDocPanelI18n } from '@/i18n/ui';
import { useSettingsStore } from '@/stores/settings';
import type { BatchUploadRow, BatchUploadSummary } from '@/services/cloudDocBatchUploadService';

const props = withDefaults(defineProps<{
  visible?: boolean;
  /** 逐条状态行（上传计划 + 运行时状态） */
  rows?: BatchUploadRow[];
  /** 目标分类名（右键的那个节点） */
  targetName?: string;
  done?: number;
  total?: number;
  /** 队列是否仍在执行：true 时只给「中止上传」，关闭按钮禁用 */
  busy?: boolean;
  /** 全部结束后的汇总（未结束时为 null） */
  summary?: BatchUploadSummary | null;
  /** 是否因配额/登录失效/用户中止提前结束 */
  aborted?: boolean;
  /** 中止是否由用户点「中止上传」触发（用来区分文案，避免把主动取消说成配额/登录问题） */
  cancelled?: boolean;
}>(), {
  visible: false,
  rows: () => [],
  targetName: '',
  done: 0,
  total: 0,
  busy: false,
  summary: null,
  aborted: false,
  cancelled: false,
});

const emit = defineEmits<{ cancel: []; close: [] }>();

const settingsStore = useSettingsStore();
const panel = computed(() => getCloudDocPanelI18n(settingsStore.uiLanguage));

const closeButtonRef = ref<HTMLButtonElement | null>(null);

const percent = computed(() => {
  if (props.total <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((props.done / props.total) * 100));
});

const summaryText = computed(() => {
  const summary = props.summary;
  if (!summary) {
    return '';
  }
  return panel.value.uploadSummary(summary.ok, summary.skipped, summary.failed);
});

/** 中止原因文案：用户主动取消 vs 配额/登录失效（两者语义完全不同，不能共用一句）。 */
const abortedText = computed(() => (
  props.cancelled ? panel.value.uploadCancelled : panel.value.uploadAborted
));

function statusLabel(row: BatchUploadRow): string {
  switch (row.status) {
    case 'uploading':
      return panel.value.uploadStatusUploading;
    case 'done':
      return panel.value.uploadStatusDone;
    case 'skipped':
      return panel.value.uploadStatusSkipped;
    case 'failed':
      return panel.value.uploadStatusFailed;
    default:
      return panel.value.uploadStatusPending;
  }
}

/** 行内补充说明：优先用结果文案（宿主已按 i18n 填好），否则给计划阶段的跳过原因。 */
function detailOf(row: BatchUploadRow): string {
  if (row.message) {
    return row.message;
  }
  if (row.kind === 'skipped') {
    return row.reason === 'too-large' ? panel.value.uploadReasonTooLarge : panel.value.uploadReasonUnsupported;
  }
  return '';
}

/** 点遮罩关闭：上传中不允许关（会留下跑不完的队列），交给「中止上传」。 */
function handleOverlayClick(): void {
  if (props.busy) {
    return;
  }
  emit('close');
}

function handleKeydown(event: KeyboardEvent): void {
  if (!props.visible || event.key !== 'Escape' || props.busy) {
    return;
  }
  event.preventDefault();
  emit('close');
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      window.addEventListener('keydown', handleKeydown);
      void nextTick(() => closeButtonRef.value?.focus());
      return;
    }
    window.removeEventListener('keydown', handleKeydown);
  },
  { immediate: true },
);

onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

defineExpose({ focusClose: () => closeButtonRef.value?.focus() });
</script>

<style scoped>
/* ---------- 遮罩：与云文档预览/历史版本弹窗同一套视觉 ---------- */
.cloud-doc-upload {
  position: fixed;
  inset: 0;
  z-index: 14000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(5, 6, 10, 0.74);
  backdrop-filter: blur(6px);
}

.cloud-doc-upload__card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(560px, calc(100vw - 48px));
  max-height: min(620px, 84vh);
  min-height: 0;
  padding: 14px 16px;
  overflow: hidden;
  font-family: var(--cd-font-ui, sans-serif);
  color: var(--cd-text, #f8fafc);
  background: var(--cd-bg-card, #1e2033);
  border: 1px solid var(--cd-border-strong, #323653);
  border-radius: var(--cd-r-dialog, 12px);
  box-shadow: var(--cd-shadow-dialog, 0 25px 60px -15px rgba(0, 0, 0, 0.75));
}

.cloud-doc-upload__header {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  align-items: center;
}

.cloud-doc-upload__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: var(--cd-fs-body, 14px);
  font-weight: 600;
  white-space: nowrap;
  word-break: keep-all;
  text-overflow: ellipsis;
}

.cloud-doc-upload__icon-button {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
  color: var(--cd-text-2, #94a3b8);
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--cd-r-panel, 8px);
}

.cloud-doc-upload__icon-button:hover:not(:disabled) {
  color: #fff;
  background: color-mix(in srgb, var(--cd-danger, #ef4444) 24%, transparent);
  border-color: color-mix(in srgb, var(--cd-danger, #ef4444) 40%, transparent);
}

.cloud-doc-upload__icon-button:focus-visible {
  outline: 2px solid var(--cd-accent, #38bdf8);
  outline-offset: 2px;
}

.cloud-doc-upload__icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.cloud-doc-upload__target {
  flex: 0 0 auto;
  margin: 0;
  font-size: var(--cd-fs-sm, 13px);
  color: var(--cd-text, #f8fafc);
}

.cloud-doc-upload__hint {
  flex: 0 0 auto;
  margin: 0;
  font-size: var(--cd-fs-label, 11px);
  color: var(--cd-text-3, #64748b);
}

.cloud-doc-upload__progress {
  flex: 0 0 auto;
  margin: 0;
  font-family: var(--cd-font-mono, monospace);
  font-size: var(--cd-fs-label, 11px);
  color: var(--cd-text-2, #94a3b8);
}

/* ---------- 逐条列表 ---------- */
.cloud-doc-upload__list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 1px;
  min-height: 0;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.cloud-doc-upload__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0 8px;
  align-items: center;
  padding: 5px 8px;
  font-size: var(--cd-fs-meta, 12px);
  color: var(--cd-text-2, #94a3b8);
  background: var(--cd-bg-sunken, #0d0e16);
  border-radius: var(--cd-r-ctl, 6px);
}

.cloud-doc-upload__row-name {
  min-width: 0;
  overflow: hidden;
  font-family: var(--cd-font-mono, monospace);
  color: var(--cd-text, #f8fafc);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloud-doc-upload__row-status {
  font-size: var(--cd-fs-label, 11px);
  white-space: nowrap;
}

/* 状态色：成功绿 / 跳过中性 / 失败危险红（与 .cd-menu 同一套 token） */
.cloud-doc-upload__row.is-done .cloud-doc-upload__row-status {
  color: var(--cd-success, #10b981);
}

.cloud-doc-upload__row.is-uploading .cloud-doc-upload__row-status {
  color: var(--cd-accent, #38bdf8);
}

.cloud-doc-upload__row.is-failed .cloud-doc-upload__row-status {
  color: var(--cd-danger, #ef4444);
}

.cloud-doc-upload__row-detail {
  grid-column: 1 / -1;
  min-width: 0;
  margin-top: 2px;
  font-size: var(--cd-fs-label, 11px);
  color: var(--cd-text-3, #64748b);
  word-break: break-word;
}

.cloud-doc-upload__empty {
  margin: 0;
  padding: 12px 8px;
  font-size: var(--cd-fs-meta, 12px);
  color: var(--cd-text-3, #64748b);
  text-align: center;
}

.cloud-doc-upload__summary {
  flex: 0 0 auto;
  margin: 0;
  font-size: var(--cd-fs-sm, 13px);
  color: var(--cd-text, #f8fafc);
}

.cloud-doc-upload__aborted {
  flex: 0 0 auto;
  margin: 0;
  font-size: var(--cd-fs-label, 11px);
  color: var(--cd-warning, #f59e0b);
}

.cloud-doc-upload__actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.cloud-doc-upload__button {
  padding: 3px 10px;
  font-family: var(--cd-font-ui, sans-serif);
  font-size: 11.5px;
  color: var(--cd-text, #f8fafc);
  cursor: pointer;
  background: var(--cd-bg-sunken, #0d0e16);
  border: 1px solid var(--cd-border-soft, rgba(50, 54, 83, 0.6));
  border-radius: var(--cd-r-ctl, 6px);
}

.cloud-doc-upload__button:hover:not(:disabled) {
  color: var(--cd-accent, #38bdf8);
  border-color: var(--cd-accent, #38bdf8);
}

.cloud-doc-upload__button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.cloud-doc-upload__button--primary {
  color: var(--cd-accent, #38bdf8);
  border-color: var(--cd-accent, #38bdf8);
}
</style>
