<template>
  <teleport to="body">
    <div v-if="visible" class="workspace-search-overlay" @click.self="emit('close')">
      <section class="workspace-search-panel" aria-label="Workspace search">
        <header>
          <input
            :value="query"
            placeholder="Search workspace"
            data-testid="workspace-search-input"
            @input="emitQuery"
            @keydown.enter.prevent="emitSearch"
            @keydown.esc.prevent="emit('close')"
          >
          <button type="button" data-testid="workspace-search-submit" @click="emit('search', query)">Search</button>
          <button
            v-if="loading"
            type="button"
            data-testid="workspace-search-cancel"
            @click="emit('cancel')"
          >
            取消
          </button>
          <button type="button" aria-label="Close search" @click="emit('close')">×</button>
        </header>

        <div class="workspace-search-replace">
          <input
            :value="replacement"
            placeholder="替换为"
            data-testid="workspace-replace-input"
            @input="emitReplacement"
            @keydown.enter.prevent="emitPreviewReplace"
          >
          <button
            type="button"
            :disabled="!query.trim()"
            data-testid="workspace-replace-preview"
            @click="emitPreviewReplace"
          >
            预览替换
          </button>
        </div>

        <p v-if="loading">Searching…</p>
        <p v-else-if="error">{{ error }}</p>
        <div v-else class="workspace-search-results">
          <p v-if="cancelled" class="workspace-search-cancelled" data-testid="workspace-search-cancelled">
            搜索已取消，以下为已扫描到的部分结果
          </p>
          <button
            v-for="(result, index) in results"
            :key="`${result.path}:${result.line}:${result.column}`"
            type="button"
            :data-testid="`workspace-search-result-${index}`"
            @click="emit('navigate', result.path, result.line)"
          >
            <strong>{{ result.path }}:{{ result.line }}</strong>
            <span>{{ result.preview }}</span>
          </button>
          <p v-if="results.length === 0">No matches</p>
        </div>
      </section>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import type { WorkspaceSearchMatch } from '@/lib/tauri';

const props = defineProps<{
  visible: boolean;
  query: string;
  results: WorkspaceSearchMatch[];
  loading?: boolean;
  error?: string | null;
  cancelled?: boolean;
  replacement?: string;
}>();

const emit = defineEmits<{
  close: [];
  search: [query: string];
  cancel: [];
  navigate: [path: string, line: number];
  previewReplace: [replacement: string];
  'update:query': [query: string];
  'update:replacement': [replacement: string];
}>();

const emitQuery = (event: Event) => {
  emit('update:query', (event.target as HTMLInputElement).value);
};

const emitReplacement = (event: Event) => {
  emit('update:replacement', (event.target as HTMLInputElement).value);
};

const emitSearch = () => {
  emit('search', props.query);
};

const emitPreviewReplace = () => {
  emit('previewReplace', props.replacement ?? '');
};

</script>

<style scoped>
.workspace-search-overlay {
  position: fixed;
  inset: 0;
  z-index: 45;
  display: flex;
  justify-content: center;
  padding-top: 10vh;
  background: rgba(3, 7, 18, 0.48);
}

.workspace-search-panel {
  width: min(760px, calc(100vw - 32px));
  max-height: 70vh;
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
  gap: 8px;
}

.workspace-search-replace {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

input {
  flex: 1;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--border-soft);
  border-radius: 0;
  background: var(--surface-muted);
  color: inherit;
}

.workspace-search-panel button {
  padding: 8px 10px;
  border: 0;
  border-radius: 0;
  background: var(--surface-hover);
  color: inherit;
  cursor: pointer;
}

.workspace-search-panel button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.workspace-search-results {
  display: grid;
  gap: 5px;
  margin-top: 12px;
}

.workspace-search-results button {
  display: grid;
  gap: 3px;
  text-align: left;
}

.workspace-search-results button:hover {
  box-shadow: inset 2px 0 0 var(--accent-blue);
}

.workspace-search-results span {
  overflow: hidden;
  color: var(--text-muted);
  font-family: var(--font-code);
  font-size: var(--font-size-ui-sm, 12px);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-search-cancelled {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-size-ui-sm, 12px);
}
</style>
