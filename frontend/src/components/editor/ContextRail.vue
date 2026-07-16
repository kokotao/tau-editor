<template>
  <aside class="context-rail" data-testid="context-rail">
    <header class="context-rail-header">
      <div>
        <p class="context-rail-kicker">{{ copy.context }}</p>
        <h2 data-testid="context-rail-title">{{ copy.outline }}</h2>
      </div>
      <button
        type="button"
        class="context-rail-collapse"
        data-testid="context-rail-collapse"
        :title="copy.collapse"
        @click="emit('toggle-collapse')"
      >
        ×
      </button>
    </header>

    <section class="context-rail-section" aria-labelledby="context-outline-heading">
      <div class="context-rail-section-header">
        <h3 id="context-outline-heading">{{ copy.outline }}</h3>
        <span>{{ outline.length }}</span>
      </div>
      <div v-if="outline.length" class="context-outline-list">
        <button
          v-for="item in outline"
          :key="item.id"
          type="button"
          class="context-outline-item"
          :class="`context-outline-item--${item.kind}`"
          :style="{ '--outline-level': String(Math.min(4, Math.max(1, item.level))) }"
          :data-testid="`context-outline-item-${item.id}`"
          @click="emit('navigate', item.line)"
        >
          <span class="context-outline-kind">{{ outlineKindLabel(item.kind) }}</span>
          <span class="context-outline-label">{{ item.label }}</span>
          <span class="context-outline-line">{{ item.line }}</span>
        </button>
      </div>
      <p v-else class="context-rail-empty" data-testid="context-rail-empty">{{ copy.empty }}</p>
    </section>

    <section v-if="tasks.length" class="context-rail-section" aria-labelledby="context-tasks-heading">
      <div class="context-rail-section-header">
        <h3 id="context-tasks-heading">{{ copy.tasks }}</h3>
        <span>{{ tasks.length }}</span>
      </div>
      <button
        v-for="task in tasks"
        :key="task.id"
        type="button"
        class="context-work-item"
        :class="{ completed: task.completed }"
        :data-testid="`context-task-${task.id}`"
        @click="emit('navigate', task.line)"
      >
        <span>{{ task.completed ? '✓' : '○' }}</span>
        <span>{{ task.label }}</span>
        <small>{{ task.line }}</small>
      </button>
    </section>

    <section v-if="links.length" class="context-rail-section" aria-labelledby="context-links-heading">
      <div class="context-rail-section-header">
        <h3 id="context-links-heading">{{ copy.links }}</h3>
        <span>{{ links.length }}</span>
      </div>
      <button
        v-for="link in links"
        :key="link.id"
        type="button"
        class="context-work-item"
        :data-testid="`context-link-${link.id}`"
        @click="emit('navigate', link.line)"
      >
        <span>{{ link.external ? '↗' : '↳' }}</span>
        <span>{{ link.label }}</span>
        <small>{{ link.line }}</small>
      </button>
    </section>

    <section class="context-rail-section context-rail-actions" aria-labelledby="context-actions-heading">
      <div class="context-rail-section-header">
        <h3 id="context-actions-heading">{{ copy.actions }}</h3>
      </div>
      <button type="button" data-testid="context-action-find" @click="emit('find')">{{ copy.find }}</button>
      <button type="button" data-testid="context-action-go-to-line" @click="emit('go-to-line')">{{ copy.goToLine }}</button>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { OutlineItem } from '@/services/documentOutlineService';
import type { MarkdownLink, MarkdownTask } from '@/services/markdownService';

interface ContextRailProps {
  outline?: OutlineItem[];
  tasks?: MarkdownTask[];
  links?: MarkdownLink[];
  language?: string;
  locale?: 'zh-CN' | 'en-US';
}

const props = withDefaults(defineProps<ContextRailProps>(), {
  outline: () => [],
  tasks: () => [],
  links: () => [],
  language: 'plaintext',
  locale: 'en-US',
});

const emit = defineEmits<{
  navigate: [line: number];
  find: [];
  'go-to-line': [];
  'toggle-collapse': [];
}>();

const copy = computed(() => props.locale === 'zh-CN'
  ? {
      context: '上下文',
      outline: '文档大纲',
      actions: '快捷操作',
      tasks: '任务',
      links: '链接',
      collapse: '收起上下文栏',
      empty: '当前文档没有可导航的结构。',
      find: '查找',
      goToLine: '跳转到行',
    }
  : {
      context: 'Context',
      outline: 'Document outline',
      actions: 'Quick actions',
      tasks: 'Tasks',
      links: 'Links',
      collapse: 'Collapse context rail',
      empty: 'No navigation targets in this document.',
      find: 'Find',
      goToLine: 'Go to line',
    });

const outlineKindLabel = (kind: OutlineItem['kind']) => {
  const labels: Record<OutlineItem['kind'], string> = {
    heading: '#',
    class: 'C',
    function: 'ƒ',
    key: '•',
    selector: '⌘',
  };
  return labels[kind];
};
</script>

<style scoped>
.context-rail {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  overflow: hidden auto;
  background: var(--panel);
  color: var(--text-primary);
}

.context-rail-header,
.context-rail-section {
  padding: 16px;
}

.context-rail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-soft);
}

.context-rail-kicker,
.context-rail-header h2,
.context-rail-section h3 {
  margin: 0;
}

.context-rail-kicker {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.context-rail-header h2 {
  margin-top: 4px;
  font-size: 14px;
}

.context-rail-collapse {
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.context-rail-section + .context-rail-section {
  border-top: 1px solid var(--border-soft);
}

.context-rail-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.context-rail-section h3 {
  color: var(--text-secondary);
  font-size: 11px;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.context-rail-section-header span {
  color: var(--text-muted);
  font-size: 11px;
}

.context-outline-list {
  display: grid;
  gap: 2px;
}

.context-outline-item,
.context-work-item,
.context-rail-actions button {
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
}

.context-outline-item {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 6px 7px calc(6px + (var(--outline-level) - 1) * 9px);
  border-radius: 5px;
  font-size: 12px;
}

.context-work-item {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 6px;
  border-radius: 5px;
  font-size: 12px;
}

.context-work-item small {
  color: var(--text-muted);
  font-family: var(--font-code);
}

.context-work-item.completed span:nth-child(2) {
  color: var(--text-muted);
  text-decoration: line-through;
}

.context-outline-item:hover,
.context-outline-item:focus-visible,
.context-work-item:hover,
.context-work-item:focus-visible,
.context-rail-actions button:hover,
.context-rail-actions button:focus-visible {
  background: var(--surface-hover);
  color: var(--text-primary);
  outline: none;
}

.context-outline-kind,
.context-outline-line {
  color: var(--text-muted);
  font-family: var(--font-code);
  font-size: 11px;
}

.context-outline-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-rail-empty {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.context-rail-actions {
  margin-top: auto;
  display: grid;
  gap: 4px;
}

.context-rail-actions button {
  padding: 8px;
  border-radius: 5px;
  font-size: 12px;
}
</style>
