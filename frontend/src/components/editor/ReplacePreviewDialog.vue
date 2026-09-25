<template>
  <teleport to="body">
    <div v-if="visible" class="replace-preview-overlay" @click.self="emit('close')">
      <section class="replace-preview-dialog" data-testid="replace-preview-dialog" aria-label="Replace preview">
        <header>
          <h2>替换预览</h2>
          <span class="summary">{{ totalMatches }} 项命中 / 已选 {{ selectedCount }} 项</span>
          <button type="button" aria-label="Close replace preview" @click="emit('close')">×</button>
        </header>

        <p v-if="loading">正在生成替换预览…</p>
        <p v-else-if="error">{{ error }}</p>

        <template v-else-if="preview">
          <div class="toolbar">
            <button type="button" data-testid="replace-preview-toggle-all" @click="toggleAll">
              {{ allSelected ? '全不选' : '全选' }}
            </button>
            <button
              type="button"
              data-testid="replace-preview-apply"
              :disabled="applying || selectedCount === 0"
              @click="handleApply"
            >
              {{ applying ? '替换中…' : '执行替换' }}
            </button>
            <span v-if="preview.truncated" class="notice">命中过多，仅展示前 {{ totalMatches }} 项</span>
          </div>

          <ul class="preview-files">
            <li v-for="(file, fileIndex) in preview.files" :key="file.relativePath">
              <label class="file-head">
                <input
                  type="checkbox"
                  :checked="fileSelectionState(file) === 'all'"
                  :data-testid="`replace-preview-file-${fileIndex}`"
                  @change="toggleFile(file)"
                >
                <strong>{{ file.relativePath }}</strong>
                <span>{{ file.matches.length }} 项</span>
              </label>
              <ul class="preview-matches">
                <li v-for="(match, matchIndex) in file.matches" :key="match.matchId">
                  <label :data-testid="`replace-preview-match-${fileIndex}-${matchIndex}`">
                    <input
                      type="checkbox"
                      :checked="isSelected(match.matchId)"
                      @change="toggleMatch(match.matchId)"
                    >
                    <span class="position">{{ match.line }}:{{ match.column }}</span>
                    <code class="before">{{ match.before }}</code>
                    <code class="after">{{ match.after }}</code>
                  </label>
                </li>
              </ul>
            </li>
          </ul>

          <div v-if="results && results.length" class="preview-results">
            <p
              v-for="(result, index) in results"
              :key="result.relativePath"
              :data-testid="`replace-preview-result-${index}`"
            >
              <strong>{{ result.relativePath }}</strong>
              <span :class="`status status-${result.status}`">{{ statusLabel(result.status) }}</span>
              <span v-if="result.message" class="message">{{ result.message }}</span>
            </p>
            <div class="undo-row">
              <button
                v-if="undoId"
                type="button"
                data-testid="replace-preview-undo"
                :disabled="undoBusy"
                @click="emit('undo')"
              >
                {{ undoBusy ? '撤销中…' : '撤销本次替换' }}
              </button>
              <span v-if="undone">已撤销</span>
            </div>
          </div>
        </template>
      </section>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  WorkspaceReplaceFileResult,
  WorkspaceReplacePreviewFile,
  WorkspaceReplacePreviewResponse,
  WorkspaceReplaceStatus,
} from '@/lib/tauri';

const props = defineProps<{
  visible: boolean;
  preview: WorkspaceReplacePreviewResponse | null;
  loading?: boolean;
  error?: string | null;
  applying?: boolean;
  results?: WorkspaceReplaceFileResult[];
  undoId?: string | null;
  undoBusy?: boolean;
  undone?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  apply: [matchIds: string[]];
  undo: [];
}>();

const selected = ref<Set<string>>(new Set());

watch(
  () => props.preview?.previewId ?? null,
  () => {
    const next = new Set<string>();
    for (const file of props.preview?.files ?? []) {
      for (const match of file.matches) {
        next.add(match.matchId);
      }
    }
    selected.value = next;
  },
  { immediate: true },
);

const totalMatches = computed(() => props.preview?.totalMatches ?? 0);
const selectedCount = computed(() => selected.value.size);
const allSelected = computed(
  () => totalMatches.value > 0 && selectedCount.value === totalMatches.value,
);

const isSelected = (matchId: string) => selected.value.has(matchId);

const toggleMatch = (matchId: string) => {
  const next = new Set(selected.value);
  if (next.has(matchId)) {
    next.delete(matchId);
  } else {
    next.add(matchId);
  }
  selected.value = next;
};

const fileSelectionState = (file: WorkspaceReplacePreviewFile): 'none' | 'partial' | 'all' => {
  const selectedCountInFile = file.matches.filter((match) => selected.value.has(match.matchId)).length;
  if (selectedCountInFile === 0) {
    return 'none';
  }
  return selectedCountInFile === file.matches.length ? 'all' : 'partial';
};

const toggleFile = (file: WorkspaceReplacePreviewFile) => {
  const next = new Set(selected.value);
  const selectAll = fileSelectionState(file) !== 'all';
  for (const match of file.matches) {
    if (selectAll) {
      next.add(match.matchId);
    } else {
      next.delete(match.matchId);
    }
  }
  selected.value = next;
};

const toggleAll = () => {
  const next = new Set<string>();
  if (!allSelected.value) {
    for (const file of props.preview?.files ?? []) {
      for (const match of file.matches) {
        next.add(match.matchId);
      }
    }
  }
  selected.value = next;
};

const handleApply = () => {
  emit('apply', [...selected.value]);
};

const statusLabel = (status: WorkspaceReplaceStatus) => {
  switch (status) {
    case 'applied':
      return '已替换';
    case 'conflict':
      return '已被外部修改，跳过';
    case 'skipped':
      return '命中已消失，跳过';
    case 'failed':
    default:
      return '失败';
  }
};
</script>

<style scoped>
.replace-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 46;
  display: flex;
  justify-content: center;
  padding-top: 8vh;
  background: rgba(3, 7, 18, 0.48);
}

.replace-preview-dialog {
  width: min(880px, calc(100vw - 32px));
  max-height: 78vh;
  overflow: auto;
  padding: 14px;
  border: 1px solid var(--border-strong);
  border-radius: 0;
  background: var(--panel);
  color: var(--text-primary);
  box-shadow: 0 24px 60px rgba(2, 6, 23, 0.42);
}

header {
  display: flex;
  align-items: center;
  gap: 10px;
}

h2 {
  margin: 0;
  font-size: var(--font-size-ui-lg, 15px);
}

.summary {
  color: var(--text-muted);
  font-size: var(--font-size-ui-sm, 12px);
}

header button {
  margin-left: auto;
}

.replace-preview-dialog button {
  padding: 8px 10px;
  border: 0;
  border-radius: 0;
  background: var(--surface-hover);
  color: inherit;
  cursor: pointer;
}

.replace-preview-dialog button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
}

.notice,
.file-head span {
  color: var(--text-muted);
  font-size: var(--font-size-ui-sm, 12px);
}

.preview-files {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.preview-files > li {
  padding: 8px;
  border: 1px solid var(--border-soft);
  border-radius: 0;
}

.file-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preview-matches {
  display: grid;
  gap: 4px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}

.preview-matches label {
  display: grid;
  grid-template-columns: auto 56px 1fr 1fr;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-ui-sm, 12px);
}

.position {
  color: var(--text-muted);
  font-family: var(--font-code);
}

code {
  overflow: hidden;
  font-family: var(--font-code);
  font-size: var(--font-size-ui-sm, 12px);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.before {
  color: var(--text-muted);
}

.after {
  color: var(--text-primary);
}

.preview-results {
  display: grid;
  gap: 6px;
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--border-soft);
}

.preview-results p {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: var(--font-size-ui-sm, 12px);
}

.status {
  padding: 2px 8px;
  border-radius: 0;
  background: var(--surface-hover);
}

.status-conflict {
  color: #f5a524;
}

.status-failed {
  color: #f87171;
}

.message {
  color: var(--text-muted);
}

.undo-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
