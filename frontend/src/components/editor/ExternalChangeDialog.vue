<template>
  <teleport to="body">
    <div v-if="visible && conflict" class="external-change-overlay" @click.self="emit('close')">
      <section
        class="external-change-panel"
        role="dialog"
        aria-modal="true"
        :aria-label="copy.title"
        data-testid="external-change-dialog"
      >
        <header class="external-change-header">
          <h2>{{ copy.title }}</h2>
          <button
            type="button"
            class="external-change-close"
            data-testid="external-change-close"
            @click="emit('close')"
          >
            {{ copy.close }}
          </button>
        </header>

        <p class="external-change-file">{{ fileName || conflict.path }}</p>

        <dl class="external-change-meta">
          <div>
            <dt>{{ copy.changeType }}</dt>
            <dd data-testid="external-change-kind">{{ kindLabel }}</dd>
          </div>
          <div>
            <dt>{{ copy.baseline }}</dt>
            <dd>{{ formatTime(conflict.baselineModifiedMs) }}</dd>
          </div>
          <div>
            <dt>{{ copy.disk }}</dt>
            <dd data-testid="external-change-disk">{{ formatTime(conflict.diskModifiedMs) }}</dd>
          </div>
        </dl>

        <p class="external-change-hint">{{ copy.hint }}</p>

        <div class="external-change-actions">
          <button
            type="button"
            data-testid="external-change-reload"
            :disabled="busy"
            @click="emit('reload')"
          >
            {{ copy.reload }}
          </button>
          <button
            type="button"
            data-testid="external-change-keep"
            :disabled="busy"
            @click="emit('keep')"
          >
            {{ copy.keep }}
          </button>
          <button
            type="button"
            class="external-change-primary"
            data-testid="external-change-save-as"
            :disabled="busy"
            @click="emit('saveAs')"
          >
            {{ copy.saveAs }}
          </button>
        </div>
      </section>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FileConflictRecord } from '@/stores/fileConflicts';
import type { WorkspaceChangeKind } from '@/lib/tauri';

interface ExternalChangeDialogProps {
  visible: boolean;
  conflict: FileConflictRecord | null;
  fileName?: string | null;
  locale?: 'zh-CN' | 'en-US';
  busy?: boolean;
}

const props = withDefaults(defineProps<ExternalChangeDialogProps>(), {
  fileName: null,
  locale: 'en-US',
  busy: false,
});

const emit = defineEmits<{
  close: [];
  reload: [];
  keep: [];
  saveAs: [];
}>();

const copy = computed(() => props.locale === 'zh-CN'
  ? {
      title: '文件已在外部修改',
      close: '关闭',
      changeType: '变更类型',
      baseline: '本地基线',
      disk: '磁盘版本',
      hint: '磁盘内容与编辑器中的内容不一致。重新加载会放弃本地未保存修改，保留当前内容会在下次保存时覆盖磁盘。',
      reload: '重新加载',
      keep: '保留当前内容',
      saveAs: '另存为',
    }
  : {
      title: 'File changed on disk',
      close: 'Close',
      changeType: 'Change',
      baseline: 'Local baseline',
      disk: 'On disk',
      hint: 'The file on disk differs from the editor buffer. Reload discards local edits; keeping the current content overwrites the file on the next save.',
      reload: 'Reload',
      keep: 'Keep current',
      saveAs: 'Save as',
    });

const kindLabels: Record<WorkspaceChangeKind, { 'zh-CN': string; 'en-US': string }> = {
  created: { 'zh-CN': '新建', 'en-US': 'Created' },
  modified: { 'zh-CN': '修改', 'en-US': 'Modified' },
  removed: { 'zh-CN': '删除', 'en-US': 'Removed' },
  renamed: { 'zh-CN': '重命名', 'en-US': 'Renamed' },
};

const kindLabel = computed(() => {
  const kind = props.conflict?.kind;
  if (!kind) return '';
  return kindLabels[kind][props.locale];
});

function formatTime(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Date(value).toLocaleString();
}
</script>

<style scoped>
.external-change-overlay {
  position: fixed;
  inset: 0;
  z-index: 45;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(3, 7, 18, 0.48);
  backdrop-filter: blur(12px);
}

.external-change-panel {
  width: min(520px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-strong, rgba(148, 163, 184, 0.3));
  background: var(--panel, #101726);
  color: var(--text, #e2e8f0);
  box-shadow: 0 24px 60px rgba(2, 6, 23, 0.45);
}

.external-change-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.external-change-header h2 {
  margin: 0;
  font-size: var(--font-size-ui-lg, 15px);
  font-weight: 700;
}

.external-change-close {
  border: 1px solid var(--border-strong, rgba(148, 163, 184, 0.3));
  border-radius: var(--radius-sm);
  padding: 4px 10px;
  background: transparent;
  color: inherit;
  font-size: var(--font-size-ui-sm, 12px);
  cursor: pointer;
}

.external-change-file {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  word-break: break-all;
}

.external-change-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  font-size: 12px;
}

.external-change-meta div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.external-change-meta dt {
  color: var(--text-muted, #75829e);
}

.external-change-meta dd {
  margin: 0;
  word-break: break-all;
}

.external-change-hint {
  margin: 0;
  color: var(--text-muted, #75829e);
  font-size: 12px;
  line-height: 1.6;
}

.external-change-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.external-change-actions button {
  border: 1px solid var(--border-strong, rgba(148, 163, 184, 0.3));
  border-radius: var(--radius-sm);
  padding: 7px 14px;
  background: transparent;
  color: inherit;
  font-size: var(--font-size-ui-md, 13px);
  cursor: pointer;
}

.external-change-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.external-change-primary {
  border-color: transparent;
  background: var(--accent, #3b82f6);
  color: #f8fafc;
}
</style>
