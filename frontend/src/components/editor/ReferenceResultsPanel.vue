<template>
  <section v-if="visible" class="reference-results-panel" data-testid="reference-results-panel">
    <header class="reference-results-header">
      <div class="reference-results-title">
        <span class="reference-results-kicker">{{ copy.kicker }}</span>
        <h2>{{ copy.title }}</h2>
        <span class="reference-results-count">{{ total }}</span>
      </div>
      <div class="reference-results-actions">
        <span v-if="loading" class="reference-results-loading">{{ copy.loading }}</span>
        <button
          v-if="loading"
          type="button"
          class="reference-results-button"
          data-testid="reference-results-cancel"
          @click="emit('cancel')"
        >{{ copy.cancel }}</button>
        <button
          type="button"
          class="reference-results-button"
          data-testid="reference-results-close"
          @click="emit('close')"
        >{{ copy.close }}</button>
      </div>
    </header>

    <div v-if="error" class="reference-results-empty" data-testid="reference-results-error">{{ error }}</div>
    <div v-else-if="!loading && groups.length === 0" class="reference-results-empty" data-testid="reference-results-empty">
      {{ copy.empty }}
    </div>
    <div v-else class="reference-results-list">
      <section v-for="group in groups" :key="group.path" class="reference-results-group">
        <div class="reference-results-group-header">
          <span class="reference-results-file">{{ group.path }}</span>
          <span class="reference-results-group-count">{{ group.items.length }}</span>
        </div>
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          class="reference-result-item"
          :data-testid="`reference-result-${item.id}`"
          @click="emit('navigate', item)"
        >
          <span class="reference-result-position">{{ item.line }}:{{ item.column }}</span>
          <span class="reference-result-preview">{{ item.preview }}</span>
        </button>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface ReferenceResultItem {
  id: string;
  uri: string;
  path: string;
  line: number;
  column: number;
  preview: string;
}

export interface ReferenceResultGroup {
  path: string;
  items: ReferenceResultItem[];
}

const props = withDefaults(defineProps<{
  visible?: boolean;
  loading?: boolean;
  groups?: ReferenceResultGroup[];
  error?: string | null;
  locale?: 'zh-CN' | 'en-US';
}>(), {
  visible: true,
  loading: false,
  groups: () => [],
  error: null,
  locale: 'en-US',
});

const emit = defineEmits<{
  navigate: [item: ReferenceResultItem];
  cancel: [];
  close: [];
}>();

const groups = computed(() => props.groups);
const total = computed(() => groups.value.reduce((sum, group) => sum + group.items.length, 0));
const copy = computed(() => props.locale === 'zh-CN'
  ? { kicker: '代码分析', title: '引用', loading: '正在查找…', cancel: '取消', close: '关闭', empty: '未找到引用。' }
  : { kicker: 'CODE ANALYSIS', title: 'References', loading: 'Searching…', cancel: 'Cancel', close: 'Close', empty: 'No references found.' });
</script>

<style scoped>
.reference-results-panel { display: flex; flex: 0 0 min(300px, 36vh); min-height: 160px; flex-direction: column; border-top: 1px solid var(--border-soft); background: color-mix(in srgb, var(--panel-base) 94%, transparent); color: var(--text-primary); }
.reference-results-header, .reference-results-title, .reference-results-actions, .reference-results-group-header { display: flex; align-items: center; }
.reference-results-header { min-height: 42px; justify-content: space-between; gap: 12px; padding: 8px 12px; border-bottom: 1px solid var(--border-soft); }
.reference-results-title { gap: 8px; }
.reference-results-kicker { color: var(--text-secondary); font-size: 10px; letter-spacing: .08em; }
.reference-results-title h2 { margin: 0; font-size: 13px; font-weight: 650; }
.reference-results-count, .reference-results-group-count { padding: 1px 6px; border-radius: 999px; background: var(--panel-elevated); color: var(--text-secondary); font-size: 11px; }
.reference-results-actions { gap: 8px; }
.reference-results-loading { color: var(--text-secondary); font-size: 11px; }
.reference-results-button { border: 1px solid var(--border-soft); border-radius: 5px; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 11px; padding: 3px 7px; }
.reference-results-button:hover { background: var(--panel-elevated); color: var(--text-primary); }
.reference-results-list { min-height: 0; overflow: auto; padding: 4px 0; }
.reference-results-group-header { justify-content: space-between; gap: 8px; padding: 6px 12px 4px; color: var(--text-secondary); font-size: 11px; }
.reference-results-file { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.reference-result-item { display: flex; width: 100%; gap: 10px; padding: 6px 12px; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--border-soft) 60%, transparent); background: transparent; color: inherit; cursor: pointer; text-align: left; }
.reference-result-item:hover { background: color-mix(in srgb, var(--accent-blue) 10%, transparent); }
.reference-result-position { flex: 0 0 54px; color: var(--text-secondary); font-size: 10px; }
.reference-result-preview { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 12px var(--font-code); }
.reference-results-empty { display: grid; flex: 1; place-items: center; color: var(--text-secondary); font-size: 12px; }
</style>
