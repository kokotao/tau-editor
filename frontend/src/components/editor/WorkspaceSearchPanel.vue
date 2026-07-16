<template>
  <teleport to="body">
    <div v-if="visible" class="workspace-search-overlay" @click.self="emit('close')">
      <section class="workspace-search-panel" aria-label="Workspace search">
        <header>
          <input
            :value="query"
            placeholder="Search workspace"
            data-testid="workspace-search-input"
            @input="emit('update:query', ($event.target as HTMLInputElement).value)"
            @keydown.enter.prevent="emit('search', query)"
            @keydown.esc.prevent="emit('close')"
          >
          <button type="button" data-testid="workspace-search-submit" @click="emit('search', query)">Search</button>
          <button type="button" @click="emit('close')">×</button>
        </header>
        <p v-if="loading">Searching…</p>
        <p v-else-if="error">{{ error }}</p>
        <div v-else class="workspace-search-results">
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

defineProps<{
  visible: boolean;
  query: string;
  results: WorkspaceSearchMatch[];
  loading?: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{
  close: [];
  search: [query: string];
  navigate: [path: string, line: number];
  'update:query': [query: string];
}>();
</script>

<style scoped>
.workspace-search-overlay{position:fixed;inset:0;z-index:45;background:rgba(3,7,18,.48);display:flex;justify-content:center;padding-top:10vh}.workspace-search-panel{width:min(760px,calc(100vw - 32px));max-height:70vh;overflow:auto;background:var(--panel);border:1px solid var(--border-strong);border-radius:14px;padding:14px;color:var(--text-primary)}header{display:flex;gap:8px}input{flex:1;min-width:0;padding:10px;border:1px solid var(--border-soft);border-radius:8px;background:var(--surface-muted);color:inherit}.workspace-search-panel button{border:0;border-radius:7px;padding:8px 10px;background:var(--surface-hover);color:inherit;cursor:pointer}.workspace-search-results{display:grid;gap:5px;margin-top:12px}.workspace-search-results button{display:grid;text-align:left;gap:3px}.workspace-search-results span{color:var(--text-muted);font-family:var(--font-code);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style>
