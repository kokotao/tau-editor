<template>
  <section
    v-if="visible"
    class="problems-panel"
    data-testid="problems-panel"
    aria-label="Problems"
  >
    <header class="problems-panel-header">
      <div class="problems-panel-title-group">
        <span class="problems-panel-kicker">{{ copy.kicker }}</span>
        <h2>{{ copy.title }}</h2>
        <span class="problems-panel-count">{{ diagnosticsStore.count }}</span>
      </div>
      <div class="problems-panel-actions">
        <button
          type="button"
          class="problems-panel-filter"
          :class="{ active: activeFilter === 'all' }"
          data-testid="problems-filter-all"
          @click="setFilter('all')"
        >{{ copy.all }} {{ diagnosticsStore.count }}</button>
        <button
          type="button"
          class="problems-panel-filter error"
          :class="{ active: activeFilter === 'error' }"
          data-testid="problems-filter-error"
          @click="setFilter('error')"
        >{{ copy.errors }} {{ diagnosticsStore.errorCount }}</button>
        <button
          type="button"
          class="problems-panel-filter warning"
          :class="{ active: activeFilter === 'warning' }"
          data-testid="problems-filter-warning"
          @click="setFilter('warning')"
        >{{ copy.warnings }} {{ diagnosticsStore.warningCount }}</button>
        <button
          type="button"
          class="problems-panel-icon-button"
          data-testid="problems-clear"
          :title="copy.clear"
          :aria-label="copy.clear"
          @click="diagnosticsStore.clearAll()"
        >⌫</button>
        <button
          type="button"
          class="problems-panel-icon-button"
          data-testid="problems-close"
          :title="copy.close"
          :aria-label="copy.close"
          @click="emit('close')"
        >×</button>
      </div>
    </header>

    <div v-if="filteredDiagnostics.length === 0" class="problems-panel-empty" data-testid="problems-empty">
      {{ diagnosticsStore.count === 0 ? copy.empty : copy.noMatches }}
    </div>
    <div v-else class="problems-panel-list" role="list">
      <button
        v-for="diagnostic in filteredDiagnostics"
        :key="diagnostic.id"
        type="button"
        class="problem-item"
        :class="`problem-item--${severityName(diagnostic.severity)}`"
        :data-testid="`problem-item-${diagnostic.id}`"
        role="listitem"
        @click="emit('navigate', diagnostic)"
      >
        <span class="problem-severity" :title="severityLabel(diagnostic.severity)">{{ severityGlyph(diagnostic.severity) }}</span>
        <span class="problem-main">
          <span class="problem-message">{{ diagnostic.message }}</span>
          <span class="problem-meta">
            <span class="problem-path" :title="diagnostic.path">{{ diagnostic.path }}</span>
            <span>{{ diagnostic.startLineNumber }}:{{ diagnostic.startColumn }}</span>
            <span v-if="diagnostic.source">{{ diagnostic.source }}</span>
            <span v-if="diagnostic.code">[{{ diagnostic.code }}]</span>
          </span>
        </span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDiagnosticsStore, type DiagnosticRecord, type DiagnosticSeverity } from '@/stores/diagnostics';

const props = withDefaults(defineProps<{ visible?: boolean; locale?: 'zh-CN' | 'en-US' }>(), {
  visible: true,
  locale: 'en-US',
});

const emit = defineEmits<{
  navigate: [diagnostic: DiagnosticRecord];
  close: [];
}>();

const diagnosticsStore = useDiagnosticsStore();
const visible = computed(() => props.visible);
const activeFilter = ref<'all' | 'error' | 'warning'>(diagnosticsStore.activeFilter);
const filteredDiagnostics = computed(() => diagnosticsStore.all.filter((diagnostic) => activeFilter.value === 'all'
  || (activeFilter.value === 'error' && diagnostic.severity === 1)
  || (activeFilter.value === 'warning' && diagnostic.severity === 2)));
const setFilter = (filter: 'all' | 'error' | 'warning') => {
  activeFilter.value = filter;
  diagnosticsStore.setFilter(filter);
};
const copy = computed(() => props.locale === 'zh-CN'
  ? {
      kicker: '代码分析', title: '问题', all: '全部', errors: '错误', warnings: '警告',
      clear: '清空问题', close: '关闭问题面板', empty: '当前没有诊断问题。', noMatches: '当前筛选没有匹配的问题。',
    }
  : {
      kicker: 'CODE ANALYSIS', title: 'Problems', all: 'All', errors: 'Errors', warnings: 'Warnings',
      clear: 'Clear problems', close: 'Close problems panel', empty: 'No diagnostics.', noMatches: 'No problems match this filter.',
    });

const severityName = (severity: DiagnosticSeverity) => ({ 1: 'error', 2: 'warning', 3: 'info', 4: 'hint' }[severity]);
const severityGlyph = (severity: DiagnosticSeverity) => ({ 1: '●', 2: '▲', 3: '●', 4: '◆' }[severity]);
const severityLabel = (severity: DiagnosticSeverity) => ({
  1: props.locale === 'zh-CN' ? '错误' : 'Error',
  2: props.locale === 'zh-CN' ? '警告' : 'Warning',
  3: props.locale === 'zh-CN' ? '信息' : 'Information',
  4: props.locale === 'zh-CN' ? '提示' : 'Hint',
}[severity]);
</script>

<style scoped>
.problems-panel {
  display: flex;
  flex: 0 0 min(260px, 32vh);
  min-height: 150px;
  flex-direction: column;
  border-top: 1px solid var(--border-soft);
  background: color-mix(in srgb, var(--panel-base) 94%, transparent);
  color: var(--text-primary);
}

.problems-panel-header {
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-soft);
}

.problems-panel-title-group,
.problems-panel-actions,
.problem-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.problems-panel-kicker {
  color: var(--text-secondary);
  font-size: 10px;
  letter-spacing: .08em;
}

.problems-panel h2 {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
}

.problems-panel-count {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--panel-elevated);
  color: var(--text-secondary);
  font-size: 11px;
  text-align: center;
}

.problems-panel-filter,
.problems-panel-icon-button {
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
}

.problems-panel-filter { padding: 3px 6px; }
.problems-panel-filter:hover,
.problems-panel-filter.active { border-color: var(--border-soft); background: var(--panel-elevated); color: var(--text-primary); }
.problems-panel-filter.error { color: #ff6b6b; }
.problems-panel-filter.warning { color: #eab308; }
.problems-panel-icon-button { width: 24px; height: 24px; font-size: 16px; }
.problems-panel-icon-button:hover { background: var(--panel-elevated); color: var(--text-primary); }

.problems-panel-list { min-height: 0; overflow: auto; padding: 4px 0; }
.problem-item {
  display: flex;
  width: 100%;
  gap: 8px;
  align-items: flex-start;
  padding: 7px 12px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border-soft) 60%, transparent);
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.problem-item:hover { background: color-mix(in srgb, var(--accent-blue) 10%, transparent); }
.problem-severity { width: 14px; flex: 0 0 14px; padding-top: 1px; font-size: 10px; }
.problem-item--error .problem-severity { color: #ff6b6b; }
.problem-item--warning .problem-severity { color: #eab308; }
.problem-item--info .problem-severity { color: #60a5fa; }
.problem-item--hint .problem-severity { color: #a78bfa; }
.problem-main { display: grid; min-width: 0; gap: 3px; }
.problem-message { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.problem-meta { min-width: 0; color: var(--text-secondary); font-size: 10px; }
.problem-path { max-width: min(52vw, 520px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.problems-panel-empty { display: grid; flex: 1; place-items: center; color: var(--text-secondary); font-size: 12px; }

@media (max-width: 720px) {
  .problems-panel-kicker { display: none; }
  .problems-panel-header { padding-inline: 8px; }
  .problems-panel-actions { gap: 2px; }
  .problem-item { padding-inline: 8px; }
}
</style>
