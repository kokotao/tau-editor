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
        <em
          v-if="!link.external"
          class="context-link-state"
          :class="`context-link-state--${linkStatus(link)}`"
        >
          {{ linkStatus(link) }}
        </em>
        <small>{{ link.line }}</small>
      </button>
    </section>

    <section
      v-if="language === 'markdown'"
      class="context-rail-section"
      aria-labelledby="context-workspace-tasks-heading"
    >
      <div class="context-rail-section-header">
        <h3 id="context-workspace-tasks-heading">{{ copy.workspaceTasks }}</h3>
        <span data-testid="context-workspace-task-count">{{ workspaceTaskTotal }}</span>
        <button
          type="button"
          class="context-rail-refresh"
          data-testid="context-refresh-tasks"
          :title="copy.refreshTasks"
          @click="emit('refresh-tasks')"
        >
          ↻
        </button>
      </div>
      <p v-if="workspaceTasksLoading" class="context-rail-empty">{{ copy.workspaceTasksLoading }}</p>
      <template v-else>
        <button
          v-for="task in workspaceTasks"
          :key="task.id"
          type="button"
          class="context-work-item"
          :class="{ completed: task.completed }"
          :data-testid="`context-workspace-task-${task.id}`"
          @click="emit('navigate-file', task.relativePath, task.line)"
        >
          <span>{{ task.completed ? '✓' : '○' }}</span>
          <span>{{ task.label }}</span>
          <small>{{ task.relativePath }}:{{ task.line }}</small>
        </button>
        <p
          v-if="workspaceTasks.length === 0"
          class="context-rail-empty"
          data-testid="context-workspace-tasks-empty"
        >
          {{ copy.workspaceTasksEmpty }}
        </p>
        <p v-if="workspaceTasksTruncated" class="context-rail-empty">
          {{ copy.workspaceTasksTruncated }}
        </p>
      </template>
    </section>

    <section v-if="gitEntries.length" class="context-rail-section" aria-labelledby="context-git-heading">
      <div class="context-rail-section-header">
        <h3 id="context-git-heading">{{ copy.changes }}</h3>
        <span data-testid="context-git-branch">{{ gitBranch || 'HEAD' }}</span>
      </div>
      <div class="context-outline-list">
        <button
          v-for="entry in gitEntries"
          :key="entry.path"
          type="button"
          class="context-work-item"
          :data-testid="`context-git-entry-${entry.path.replace(/\//g, '-')}`"
          @click="emit('select-git', entry.path)"
        >
          <span>{{ entry.indexStatus !== ' ' ? entry.indexStatus : entry.worktreeStatus }}</span>
          <span>{{ entry.path }}</span>
          <small>diff</small>
        </button>
      </div>
    </section>

    <section v-if="externalConflictFileName" class="context-rail-section" data-testid="context-external-conflict">
      <div class="context-rail-section-header">
        <h3>{{ copy.externalChange }}</h3>
      </div>
      <p class="context-rail-empty">{{ externalConflictFileName }} {{ copy.externalChangeHint }}</p>
      <div class="context-rail-actions">
        <button type="button" data-testid="context-conflict-reload" @click="emit('reload-external')">{{ copy.reload }}</button>
        <button type="button" data-testid="context-conflict-keep" @click="emit('keep-external')">{{ copy.keep }}</button>
        <button type="button" data-testid="context-conflict-details" @click="emit('show-external-details')">{{ copy.details }}</button>
      </div>
    </section>

    <section class="context-rail-section context-rail-actions" aria-labelledby="context-actions-heading">
      <div class="context-rail-section-header">
        <h3 id="context-actions-heading">{{ copy.actions }}</h3>
      </div>
      <button type="button" data-testid="context-action-find" @click="emit('find')">{{ copy.find }}</button>
      <button v-if="language === 'markdown'" type="button" data-testid="context-action-insert-image" @click="emit('insert-image')">{{ copy.insertImage }}</button>
      <button type="button" data-testid="context-action-go-to-line" @click="emit('go-to-line')">{{ copy.goToLine }}</button>
      <button v-if="language === 'markdown'" type="button" data-testid="context-action-export-html" @click="emit('export-html')">{{ copy.exportHtml }}</button>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { OutlineItem } from '@/services/documentOutlineService';
import type { MarkdownLink, MarkdownTask } from '@/services/markdownService';
import type { GitStatusEntry, MarkdownLinkStatus } from '@/lib/tauri';
import type { WorkspaceTaskEntry } from '@/services/markdownContextService';

interface ContextRailProps {
  outline?: OutlineItem[];
  tasks?: MarkdownTask[];
  links?: MarkdownLink[];
  linkStatuses?: Record<string, MarkdownLinkStatus | undefined>;
  workspaceTasks?: WorkspaceTaskEntry[];
  workspaceTaskTotal?: number;
  workspaceTasksLoading?: boolean;
  workspaceTasksTruncated?: boolean;
  gitBranch?: string | null;
  gitEntries?: GitStatusEntry[];
  externalConflictFileName?: string | null;
  language?: string;
  locale?: 'zh-CN' | 'en-US';
}

const props = withDefaults(defineProps<ContextRailProps>(), {
  outline: () => [],
  tasks: () => [],
  links: () => [],
  linkStatuses: () => ({}),
  workspaceTasks: () => [],
  workspaceTaskTotal: 0,
  workspaceTasksLoading: false,
  workspaceTasksTruncated: false,
  gitBranch: null,
  gitEntries: () => [],
  externalConflictFileName: null,
  language: 'plaintext',
  locale: 'en-US',
});

const emit = defineEmits<{
  navigate: [line: number];
  find: [];
  'go-to-line': [];
  'toggle-collapse': [];
  'select-git': [path: string];
  'reload-external': [];
  'keep-external': [];
  'show-external-details': [];
  'export-html': [];
  'insert-image': [];
  'refresh-tasks': [];
  'navigate-file': [relativePath: string, line: number];
}>();

const copy = computed(() => props.locale === 'zh-CN'
  ? {
      context: '上下文',
      outline: '文档大纲',
      actions: '快捷操作',
      tasks: '任务',
      links: '链接',
      changes: '变更',
      externalChange: '外部修改',
      externalChangeHint: '已在磁盘上更新。',
      details: '查看详情',
      reload: '重新加载',
      keep: '保留当前',
      exportHtml: '导出 HTML',
      collapse: '收起上下文栏',
      empty: '当前文档没有可导航的结构。',
      find: '查找',
      workspaceTasks: '工作区任务',
      workspaceTasksEmpty: '工作区暂时没有 Markdown 任务。',
      workspaceTasksLoading: '正在扫描工作区任务…',
      workspaceTasksTruncated: '任务过多，仅展示前 500 项。',
      refreshTasks: '刷新任务列表',
      insertImage: '插入图片',
      goToLine: '跳转到行',
    }
  : {
      context: 'Context',
      outline: 'Document outline',
      actions: 'Quick actions',
      tasks: 'Tasks',
      links: 'Links',
      changes: 'Changes',
      externalChange: 'External change',
      externalChangeHint: 'changed on disk.',
      details: 'Details',
      reload: 'Reload',
      keep: 'Keep current',
      exportHtml: 'Export HTML',
      collapse: 'Collapse context rail',
      empty: 'No navigation targets in this document.',
      find: 'Find',
      workspaceTasks: 'Workspace tasks',
      workspaceTasksEmpty: 'No Markdown tasks in this workspace.',
      workspaceTasksLoading: 'Scanning workspace tasks…',
      workspaceTasksTruncated: 'Too many tasks, showing the first 500.',
      refreshTasks: 'Refresh tasks',
      insertImage: 'Insert image',
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

const linkStatus = (link: MarkdownLink) =>
  props.linkStatuses[link.target.trim()]?.status ?? 'unknown';
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

.context-rail-refresh {
  margin-left: auto;
  padding: 2px 6px;
  border-radius: 5px;
  font-size: 12px;
}

.context-link-state {
  font-style: normal;
  font-size: 11px;
  color: var(--text-muted);
}

.context-link-state--missing,
.context-link-state--outside,
.context-link-state--unsupported,
.context-link-state--invalid {
  color: #f5a524;
}
</style>
