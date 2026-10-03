<template>
  <section v-if="visible" class="hierarchy-panel" data-testid="hierarchy-panel">
    <header class="hierarchy-header">
      <div class="hierarchy-title">
        <span class="hierarchy-kicker">{{ copy.kicker }}</span>
        <h2>{{ mode === 'call' ? copy.callTitle : copy.typeTitle }}</h2>
        <span class="hierarchy-count">{{ rows.length }}</span>
      </div>
      <div class="hierarchy-actions">
        <span v-if="loading" class="hierarchy-loading">{{ copy.loading }}</span>
        <button v-if="loading" type="button" class="hierarchy-button" data-testid="hierarchy-cancel" @click="emit('cancel')">{{ copy.cancel }}</button>
        <button type="button" class="hierarchy-button" data-testid="hierarchy-close" @click="emit('close')">{{ copy.close }}</button>
      </div>
    </header>

    <div v-if="error" class="hierarchy-empty" data-testid="hierarchy-error">{{ error }}</div>
    <div v-else-if="!loading && rows.length === 0" class="hierarchy-empty" data-testid="hierarchy-empty">{{ copy.empty }}</div>
    <div v-else class="hierarchy-list" role="list">
      <div v-if="root" class="hierarchy-root">
        <strong>{{ root.name }}</strong>
        <span v-if="root.detail">{{ root.detail }}</span>
      </div>
      <div v-for="row in rows" :key="row.id" class="hierarchy-row" role="listitem">
        <div class="hierarchy-row-main">
          <strong>{{ row.name }}</strong>
          <span v-if="row.detail">{{ row.detail }}</span>
          <small>{{ row.path }}:{{ row.line }}:{{ row.column }}</small>
        </div>
        <button type="button" class="hierarchy-go" :data-testid="`hierarchy-go-${row.id}`" @click="emit('navigate', row)">{{ copy.go }}</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export type HierarchyMode = 'call' | 'type';

export interface HierarchyRow {
  id: string;
  name: string;
  detail?: string;
  path: string;
  line: number;
  column: number;
  uri: string;
}

const props = withDefaults(defineProps<{
  visible?: boolean;
  mode?: HierarchyMode;
  loading?: boolean;
  root?: { name: string; detail?: string } | null;
  rows?: HierarchyRow[];
  error?: string | null;
  locale?: 'zh-CN' | 'en-US';
}>(), {
  visible: true,
  mode: 'call',
  loading: false,
  root: null,
  rows: () => [],
  error: null,
  locale: 'en-US',
});

const emit = defineEmits<{
  navigate: [row: HierarchyRow];
  cancel: [];
  close: [];
}>();

const rows = computed(() => props.rows);
const copy = computed(() => props.locale === 'zh-CN'
  ? { kicker: '代码分析', callTitle: '调用层级', typeTitle: '类型层级', loading: '正在分析…', cancel: '取消', close: '关闭', empty: '没有可显示的层级关系。', go: '跳转' }
  : { kicker: 'CODE ANALYSIS', callTitle: 'Call Hierarchy', typeTitle: 'Type Hierarchy', loading: 'Analyzing…', cancel: 'Cancel', close: 'Close', empty: 'No hierarchy relationships found.', go: 'Go' });
</script>

<style scoped>
.hierarchy-panel { display: flex; flex: 0 0 min(320px, 38vh); min-height: 170px; flex-direction: column; border-top: 1px solid var(--border-soft); background: color-mix(in srgb, var(--panel-base) 94%, transparent); color: var(--text-primary); }
.hierarchy-header, .hierarchy-title, .hierarchy-actions { display: flex; align-items: center; }
.hierarchy-header { min-height: 42px; justify-content: space-between; gap: 12px; padding: 8px 12px; border-bottom: 1px solid var(--border-soft); }
.hierarchy-title { gap: 8px; }
.hierarchy-kicker { color: var(--text-secondary); font-size: 10px; letter-spacing: .08em; }
.hierarchy-title h2 { margin: 0; font-size: 13px; font-weight: 650; }
.hierarchy-count { padding: 1px 6px; border-radius: 999px; background: var(--panel-elevated); color: var(--text-secondary); font-size: 11px; }
.hierarchy-actions { gap: 8px; }
.hierarchy-loading { color: var(--text-secondary); font-size: 11px; }
.hierarchy-button, .hierarchy-go { border: 1px solid var(--border-soft); border-radius: 5px; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 11px; padding: 3px 7px; }
.hierarchy-button:hover, .hierarchy-go:hover { background: var(--panel-elevated); color: var(--text-primary); }
.hierarchy-list { min-height: 0; overflow: auto; padding: 4px 0; }
.hierarchy-root { display: flex; flex-direction: column; gap: 2px; padding: 8px 12px; border-bottom: 1px solid var(--border-soft); }
.hierarchy-root span, .hierarchy-row-main span, .hierarchy-row-main small { color: var(--text-secondary); font-size: 11px; }
.hierarchy-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; border-bottom: 1px solid color-mix(in srgb, var(--border-soft) 60%, transparent); }
.hierarchy-row-main { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
.hierarchy-row-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.hierarchy-row-main small { font-family: var(--font-code); }
.hierarchy-empty { display: grid; flex: 1; place-items: center; color: var(--text-secondary); font-size: 12px; }
</style>
