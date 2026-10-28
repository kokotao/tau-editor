<template>
  <Teleport to="body">
    <!-- 遮罩层：既给视觉层次，也兜住「点空白处关闭」 -->
    <div
      v-if="visible"
      class="folder-upload-backdrop cd-nocturne"
      data-testid="cloud-folder-upload"
      @click.self="requestClose"
    >
      <section
        class="folder-upload"
        role="dialog"
        aria-modal="true"
        :aria-label="folderCopy.uploadFolderTitle"
      >
        <header class="folder-upload__header">
          <h3 class="folder-upload__title">{{ folderCopy.uploadFolderTitle }}</h3>
          <span class="folder-upload__folder" :title="folderPath">{{ folderName }}</span>
          <button
            ref="closeButtonRef"
            type="button"
            class="folder-upload__close"
            data-testid="cloud-folder-upload-close"
            :aria-label="panelCopy.uploadClose"
            :title="panelCopy.uploadClose"
            @click="requestClose"
          >
            ×
          </button>
        </header>

        <!-- 确认页：先说清「将上传多少 / 跳过多少 / 归入哪个分类」，再让用户点确定 -->
        <div v-if="phase === 'confirm'" class="folder-upload__body" data-testid="cloud-folder-upload-confirm">
          <LoadingSpinner v-if="collecting" size="small" />
          <template v-else>
            <p class="folder-upload__line" data-testid="cloud-folder-upload-summary">
              {{ folderCopy.uploadFolderConfirm(plan.files.length, plan.skipped.length) }}
            </p>
            <p class="folder-upload__hint">{{ folderCopy.uploadFolderCategoryHint(folderName) }}</p>
            <p
              v-if="plan.truncated && plan.truncatedReason"
              class="folder-upload__hint folder-upload__hint--warn"
              data-testid="cloud-folder-upload-truncated"
            >
              {{ plan.truncatedReason }}
            </p>
            <p
              v-if="plan.files.length === 0"
              class="folder-upload__hint folder-upload__hint--warn"
              data-testid="cloud-folder-upload-empty"
            >
              {{ folderCopy.uploadFolderEmpty }}
            </p>
            <ul
              v-if="plan.skipped.length"
              class="folder-upload__list"
              data-testid="cloud-folder-upload-skipped"
            >
              <li v-for="entry in plan.skipped" :key="entry.path" class="folder-upload__skip-row">
                <span class="folder-upload__skip-name" :title="entry.relativePath">{{ entry.name }}</span>
                <span class="folder-upload__skip-reason">{{ entry.reason }}</span>
              </li>
            </ul>
          </template>
        </div>

        <!-- 进度页：进度条 + 最近处理的文件 + 已完成的逐条结果 -->
        <div v-else-if="phase === 'running'" class="folder-upload__body" data-testid="cloud-folder-upload-progress">
          <p class="folder-upload__line" data-testid="cloud-folder-upload-progress-text">
            {{ folderCopy.uploadFolderProgress(done, total) }}
          </p>
          <div
            class="folder-upload__bar"
            role="progressbar"
            :aria-valuenow="done"
            aria-valuemin="0"
            :aria-valuemax="Math.max(total, 1)"
          >
            <span class="folder-upload__bar-fill" :style="{ width: `${percent}%` }"></span>
          </div>
          <p
            v-if="currentItem"
            class="folder-upload__hint folder-upload__current"
            data-testid="cloud-folder-upload-current"
            :title="currentItem.relativePath"
          >
            {{ currentItem.name }}
          </p>
          <ul class="folder-upload__list" data-testid="cloud-folder-upload-progress-items">
            <li
              v-for="item in items"
              :key="item.path"
              class="folder-upload__result-row"
              :class="`folder-upload__result-row--${resultTone(item)}`"
            >
              <span class="folder-upload__result-name" :title="item.relativePath">{{ item.name }}</span>
              <span class="folder-upload__result-status">{{ statusLabel(item) }}</span>
            </li>
          </ul>
        </div>

        <!-- 结束页：汇总「成功 / 失败 / 跳过」+ 中止原因 -->
        <div v-else class="folder-upload__body" data-testid="cloud-folder-upload-done">
          <p
            class="folder-upload__line"
            :class="{ 'folder-upload__line--warn': hasIssues }"
            data-testid="cloud-folder-upload-result"
          >
            {{ resultText }}
          </p>
          <p
            v-if="summary?.aborted"
            class="folder-upload__hint folder-upload__hint--warn"
            data-testid="cloud-folder-upload-aborted"
          >
            {{ panelCopy.uploadAborted }}
            <template v-if="summary.abortMessage">：{{ summary.abortMessage }}</template>
          </p>
          <p v-if="summary?.category?.note" class="folder-upload__hint">
            {{ summary.category.note }}
          </p>
          <ul class="folder-upload__list" data-testid="cloud-folder-upload-done-items">
            <li
              v-for="item in items"
              :key="item.path"
              class="folder-upload__result-row"
              :class="`folder-upload__result-row--${resultTone(item)}`"
              :title="item.detail ?? item.relativePath"
            >
              <span class="folder-upload__result-name">{{ item.name }}</span>
              <span class="folder-upload__result-status">{{ statusLabel(item) }}</span>
              <span class="folder-upload__result-message">{{ item.message }}</span>
            </li>
          </ul>
        </div>

        <footer class="folder-upload__footer">
          <template v-if="phase === 'confirm'">
            <button
              type="button"
              class="folder-upload__button"
              data-testid="cloud-folder-upload-cancel"
              @click="requestClose"
            >
              {{ panelCopy.cancel }}
            </button>
            <button
              type="button"
              class="folder-upload__button folder-upload__button--primary"
              data-testid="cloud-folder-upload-confirm-button"
              :disabled="collecting || plan.files.length === 0"
              @click="start"
            >
              {{ panelCopy.confirm }}
            </button>
          </template>
          <button
            v-else-if="phase === 'running'"
            type="button"
            class="folder-upload__button"
            data-testid="cloud-folder-upload-abort"
            @click="abortUpload"
          >
            {{ panelCopy.uploadCancel }}
          </button>
          <button
            v-else
            type="button"
            class="folder-upload__button folder-upload__button--primary"
            data-testid="cloud-folder-upload-close-button"
            @click="requestClose"
          >
            {{ panelCopy.uploadClose }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * @description 工作区文件夹右键「上传该文件夹到云端」的三段式弹窗：
 * 确认（将上传数量 + 跳过清单 + 分类提示）→ 进度（进度条 + 逐条结果）→ 汇总（成功/失败/跳过、中止原因）。
 * 文案复用 FileTree 的 uploadFolder* 与云文档面板的通用按钮/状态文案，不新增 i18n 键。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-28 15:45
 */
import { computed, onUnmounted, ref, watch } from 'vue';
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue';
import { getCloudDocPanelI18n, getFileTreeI18n } from '@/i18n/ui';
import {
  collectFolderFiles,
  runFolderUpload,
  type CollectFolderResult,
  type FolderUploadResultItem,
  type FolderUploadSummary,
} from '@/services/cloudFolderUploadService';
import { useSettingsStore } from '@/stores/settings';
import { useWorkspaceStore } from '@/stores/workspace';

const props = withDefaults(defineProps<{
  visible?: boolean;
  /** 文件夹名 → 云端分类名 */
  folderName?: string;
  /** 本地文件夹绝对路径（递归收集的根） */
  folderPath?: string;
}>(), {
  visible: false,
  folderName: '',
  folderPath: '',
});

const emit = defineEmits<{
  close: [];
  /** 队列跑完（含提前中止）时抛一次汇总，宿主据此刷新云端文档树 */
  uploaded: [summary: FolderUploadSummary];
}>();

const settingsStore = useSettingsStore();
const workspaceStore = useWorkspaceStore();
const folderCopy = computed(() => getFileTreeI18n(settingsStore.uiLanguage));
const panelCopy = computed(() => getCloudDocPanelI18n(settingsStore.uiLanguage));

type Phase = 'confirm' | 'running' | 'done';

const phase = ref<Phase>('confirm');
const collecting = ref(false);
const plan = ref<CollectFolderResult>({ files: [], skipped: [], truncated: false, truncatedReason: null });
const items = ref<FolderUploadResultItem[]>([]);
const currentItem = ref<FolderUploadResultItem | null>(null);
const summary = ref<FolderUploadSummary | null>(null);
const done = ref(0);
const busy = ref(false);
const closeButtonRef = ref<HTMLButtonElement | null>(null);

let abortController: AbortController | null = null;
/** 收集是异步的：连续打开不同文件夹时用令牌丢弃过期结果 */
let collectToken = 0;

const total = computed(() => plan.value.files.length);
const percent = computed(() => (total.value === 0 ? 0 : Math.round((done.value / total.value) * 100)));

/** 成功数按「新上传 + 云端已是最新」合并：两者都不需要用户再处理 */
const okCount = computed(() => (summary.value ? summary.value.uploaded + summary.value.unchanged : 0));
const skippedCount = computed(() => (summary.value ? summary.value.skipped + summary.value.conflict : 0));
const hasIssues = computed(() => Boolean(summary.value && (summary.value.failed > 0 || skippedCount.value > 0)));

const resultText = computed(() => {
  const value = summary.value;
  if (!value) {
    return '';
  }
  return hasIssues.value
    ? folderCopy.value.uploadFolderPartial(okCount.value, value.failed, skippedCount.value)
    : folderCopy.value.uploadFolderDone(okCount.value);
});

/** 逐条结果的状态文案（冲突/跳过在视觉上同属「没传上去」） */
const statusLabel = (item: FolderUploadResultItem): string => {
  if (item.status === 'uploaded' || item.status === 'unchanged') {
    return panelCopy.value.uploadStatusDone;
  }
  if (item.status === 'failed') {
    return panelCopy.value.uploadStatusFailed;
  }
  return panelCopy.value.uploadStatusSkipped;
};

const resultTone = (item: FolderUploadResultItem): 'ok' | 'warn' | 'error' => {
  if (item.status === 'uploaded' || item.status === 'unchanged') {
    return 'ok';
  }
  return item.status === 'failed' ? 'error' : 'warn';
};

/** 打开时重新收集：文件夹内容可能在两次右键之间变过 */
const loadPlan = async (): Promise<void> => {
  const token = ++collectToken;
  collecting.value = true;
  plan.value = { files: [], skipped: [], truncated: false, truncatedReason: null };
  const result = await collectFolderFiles(props.folderPath);
  if (token !== collectToken) {
    return;
  }
  plan.value = result;
  collecting.value = false;
};

const resetState = (): void => {
  abortController?.abort();
  abortController = null;
  phase.value = 'confirm';
  collecting.value = false;
  plan.value = { files: [], skipped: [], truncated: false, truncatedReason: null };
  items.value = [];
  currentItem.value = null;
  summary.value = null;
  done.value = 0;
  busy.value = false;
};

const start = async (): Promise<void> => {
  if (busy.value || collecting.value || plan.value.files.length === 0) {
    return;
  }
  busy.value = true;
  phase.value = 'running';
  done.value = 0;
  items.value = [];
  currentItem.value = null;
  summary.value = null;

  const controller = new AbortController();
  abortController = controller;

  let result: FolderUploadSummary;
  try {
    result = await runFolderUpload(
      { rootPath: props.folderPath, folderName: props.folderName, files: plan.value.files },
      {
        onProgress: (count, _total, item) => {
          done.value = count;
          currentItem.value = item;
          items.value = [...items.value, item];
        },
      },
      {
        workspaceName: workspaceStore.currentWorkspaceName ?? null,
        workspacePath: workspaceStore.currentWorkspacePath ?? null,
        signal: controller.signal,
      },
    );
  } catch (error) {
    // 兜底：队列本身不该抛错，但一旦抛了也必须落到结束页，否则弹窗会卡在「进度」且没有出口
    result = {
      total: plan.value.files.length,
      uploaded: 0,
      unchanged: 0,
      skipped: 0,
      conflict: 0,
      failed: plan.value.files.length,
      aborted: true,
      abortKind: null,
      abortMessage: error instanceof Error ? error.message : String(error),
      category: { category: null, categoryId: null, created: false, note: null },
      items: items.value,
    };
  }

  if (abortController !== controller) {
    // 组件已被重置/卸载：结果不再展示
    return;
  }
  abortController = null;
  summary.value = result;
  currentItem.value = null;
  busy.value = false;
  phase.value = 'done';
  emit('uploaded', result);
};

const abortUpload = (): void => {
  abortController?.abort();
};

const requestClose = (): void => {
  // 上传过程中不允许点遮罩关闭：队列只能通过「中止上传」停下，避免留下半途状态
  if (busy.value) {
    return;
  }
  emit('close');
};

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      return;
    }
    resetState();
    void loadPlan();
  },
  { immediate: true },
);

onUnmounted(() => {
  abortController?.abort();
  abortController = null;
});

defineExpose({ start, requestClose });
</script>

<style scoped>
.folder-upload-backdrop {
  position: fixed;
  inset: 0;
  /* 高于云同步弹窗（12000），低于最顶层 toast */
  z-index: 13500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6vh 6vw;
  background: rgba(5, 6, 10, 0.74);
  backdrop-filter: blur(6px);
}

.folder-upload {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(560px, 100%);
  max-height: 100%;
  min-height: 0;
  padding: 14px 16px;
  font-family: var(--cd-font-ui, inherit);
  color: var(--cd-text, #e5e9f0);
  background: var(--cd-bg-card, #151d2d);
  border: 1px solid var(--cd-border-strong, rgba(148, 163, 184, 0.38));
  border-radius: var(--cd-r-dialog, 10px);
  box-shadow: var(--cd-shadow-dialog, 0 24px 60px rgba(0, 0, 0, 0.45));
}

.folder-upload__header {
  display: flex;
  flex: 0 0 auto;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.folder-upload__title {
  flex-shrink: 0;
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--cd-text, #e5e9f0);
}

.folder-upload__folder {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 11.5px;
  color: var(--cd-text-2, #75829e);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-upload__close {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
  color: var(--cd-text-2, #a8b3c5);
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--cd-r-panel, 6px);
}

.folder-upload__close:hover {
  color: #fff;
  background: color-mix(in srgb, var(--cd-danger, #d84545) 24%, transparent);
  border-color: color-mix(in srgb, var(--cd-danger, #d84545) 40%, transparent);
}

.folder-upload__close:focus-visible {
  outline: 2px solid var(--cd-accent, #7cc7ff);
  outline-offset: 2px;
}

.folder-upload__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: auto;
}

.folder-upload__line {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cd-text, #e5e9f0);
}

.folder-upload__line--warn {
  color: var(--cd-warning, #fbbf24);
}

.folder-upload__hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.55;
  color: var(--cd-text-2, #75829e);
}

.folder-upload__hint--warn {
  color: var(--cd-warning, #fbbf24);
}

.folder-upload__current {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- 进度条 ---------- */
.folder-upload__bar {
  flex: 0 0 auto;
  height: 6px;
  overflow: hidden;
  background: var(--cd-bg-sunken, #101726);
  border: 1px solid var(--cd-border-soft, rgba(148, 163, 184, 0.24));
  border-radius: 999px;
}

.folder-upload__bar-fill {
  display: block;
  height: 100%;
  background: var(--cd-accent, #7cc7ff);
  border-radius: 999px;
  transition: width 0.2s ease;
}

/* ---------- 跳过清单 / 逐条结果 ---------- */
.folder-upload__list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 220px;
  margin: 0;
  padding: 4px;
  overflow: auto;
  list-style: none;
  background: var(--cd-bg-sunken, #101726);
  border: 1px solid var(--cd-border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--cd-r-panel, 6px);
}

.folder-upload__skip-row,
.folder-upload__result-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  padding: 3px 6px;
  font-size: 11.5px;
  line-height: 1.5;
}

.folder-upload__skip-name,
.folder-upload__result-name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--cd-text, #e5e9f0);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-upload__skip-reason,
.folder-upload__result-message {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--cd-text-2, #75829e);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-upload__result-status {
  flex: 0 0 auto;
  font-size: 10.5px;
  color: var(--cd-text-2, #75829e);
}

.folder-upload__result-row--ok .folder-upload__result-status {
  color: var(--cd-success, #4ade80);
}

.folder-upload__result-row--warn .folder-upload__result-status {
  color: var(--cd-warning, #fbbf24);
}

.folder-upload__result-row--error .folder-upload__result-status {
  color: var(--cd-danger, #f87171);
}

.folder-upload__footer {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid var(--cd-border-soft, rgba(148, 163, 184, 0.24));
}

.folder-upload__button {
  padding: 5px 12px;
  font-size: 11.5px;
  color: var(--cd-text, #e5e9f0);
  cursor: pointer;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--cd-border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--cd-r-panel, 6px);
}

.folder-upload__button:hover:not(:disabled) {
  color: var(--cd-accent, #7cc7ff);
  border-color: var(--cd-accent, #7cc7ff);
}

.folder-upload__button--primary {
  color: var(--cd-accent, #7cc7ff);
  border-color: var(--cd-accent, #7cc7ff);
}

.folder-upload__button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
