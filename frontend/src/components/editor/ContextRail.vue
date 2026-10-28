<template>
  <aside class="context-rail" data-testid="context-rail" @scroll.passive="handleRailScroll">
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
      <div
        ref="outlineListRef"
        v-if="outline.length"
        class="context-outline-list"
        data-testid="context-outline-list"
        @wheel.passive="suppressAutoFollow"
        @touchmove.passive="suppressAutoFollow"
        @pointerdown="suppressAutoFollow"
        @mouseenter="suppressAutoFollow"
        @mousemove.passive="suppressAutoFollow"
      >
        <button
          v-for="(item, index) in outline"
          :key="item.id"
          type="button"
          class="context-outline-item"
          :class="[
            `context-outline-item--${item.kind}`,
            { 'context-outline-item--active': index === activeIndex },
          ]"
          :style="{ '--outline-level': String(Math.min(4, Math.max(1, item.level))) }"
          :data-testid="`context-outline-item-${item.id}`"
          :aria-current="index === activeIndex ? 'true' : undefined"
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
          class="context-work-item context-workspace-task-item"
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
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { OutlineItem } from '@/services/documentOutlineService';
import type { MarkdownLink, MarkdownTask } from '@/services/markdownService';
import type { GitStatusEntry, MarkdownLinkStatus } from '@/lib/tauri';
import type { WorkspaceTaskEntry } from '@/services/markdownContextService';
import { pickActiveOutlineIndex } from '@/services/scrollSpyService';

interface ContextRailProps {
  outline?: OutlineItem[];
  /** 当前激活的源码行（1 基，0/未传表示暂无当前项），由编辑器视口/预览滚动/点击写入。 */
  activeLine?: number;
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
  activeLine: 0,
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

/**
 * @description 当前激活的大纲项：activeLine 为 0 / 未传时不高亮任何项（-1）。
 * @author Albert_Luo
 * @date 2026-10-28
 */
const activeIndex = computed(() => {
  if (!props.activeLine || props.activeLine <= 0 || props.outline.length === 0) {
    return -1;
  }
  return pickActiveOutlineIndex(props.outline, props.activeLine);
});

const outlineListRef = ref<HTMLElement | null>(null);
/** D8：用户手动滚动/悬停大纲列表后 3s 内不自动跟随，避免抢用户的滚动意图。 */
const AUTO_FOLLOW_SUPPRESS_MS = 3000;
/** 程序化滚动会异步派发 scroll 事件，这段时间内的 scroll 不视为用户操作。 */
const AUTO_SCROLL_ECHO_MS = 200;
let followSuppressedUntil = 0;
let lastAutoScrollAt = 0;

const suppressAutoFollow = () => {
  followSuppressedUntil = Date.now() + AUTO_FOLLOW_SUPPRESS_MS;
};

/**
 * 大纲列表本身不滚动（真正滚动的是 `.context-rail`），因此手动滚动判定挂在根容器上；
 * 自身 scrollIntoView 触发的回声事件用时间窗过滤。
 */
const handleRailScroll = () => {
  if (Date.now() - lastAutoScrollAt < AUTO_SCROLL_ECHO_MS) {
    return;
  }
  suppressAutoFollow();
};

/**
 * @description 把当前大纲项滚动到列表可见区域（block: 'nearest'）。面板不可见
 * （宽度/高度为 0、display:none）或环境不支持 scrollIntoView 时静默跳过。
 * @author Albert_Luo
 * @date 2026-10-28
 */
const revealActiveOutlineItem = () => {
  const list = outlineListRef.value;
  const index = activeIndex.value;
  if (!list || index < 0) {
    return;
  }
  if (Date.now() < followSuppressedUntil) {
    return;
  }
  if (list.clientWidth <= 0 || list.clientHeight <= 0) {
    return;
  }

  const item = list.querySelectorAll<HTMLElement>('.context-outline-item')[index];
  if (!item || typeof item.scrollIntoView !== 'function') {
    return;
  }

  lastAutoScrollAt = Date.now();
  try {
    item.scrollIntoView({ block: 'nearest' });
  } catch {
    // 隐藏面板/无滚动容器时部分环境会抛错，跟随失败不应影响渲染。
  }
};

watch(activeIndex, async () => {
  await nextTick();
  revealActiveOutlineItem();
});

// 面板重新打开（v-if 重建）时，把已经激活的项带回可见区域。
onMounted(async () => {
  await nextTick();
  revealActiveOutlineItem();
});

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
  padding: 14px;
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
  font-size: var(--font-size-ui-xs, 11px);
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.context-rail-header h2 {
  margin-top: 4px;
  font-size: var(--font-size-ui-lg, 15px);
  font-weight: 700;
}

.context-rail-collapse {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
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
  min-width: 0;
  margin-bottom: 8px;
}

.context-rail-section h3 {
  min-width: 0;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: var(--font-size-ui-xs, 11px);
  letter-spacing: 0;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.context-rail-section-header span {
  color: var(--text-muted);
  font-size: var(--font-size-ui-xs, 11px);
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
  border-radius: 0;
  font-size: var(--font-size-ui-sm, 12px);
}

.context-work-item {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 6px;
  border-radius: 0;
  font-size: var(--font-size-ui-sm, 12px);
}

.context-work-item small {
  min-width: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-family: var(--font-code);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-workspace-task-item {
  grid-template-columns: 18px minmax(0, 1fr);
  grid-template-areas:
    "state label"
    ". meta";
  align-items: start;
  min-width: 0;
  row-gap: 3px;
}

.context-workspace-task-item > :first-child {
  grid-area: state;
}

.context-workspace-task-item > :nth-child(2) {
  grid-area: label;
  display: -webkit-box;
  min-width: 0;
  overflow: hidden;
  line-height: 1.35;
  overflow-wrap: break-word;
  word-break: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.context-workspace-task-item > small {
  grid-area: meta;
  width: 100%;
  line-height: 1.25;
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
  font-size: var(--font-size-ui-xs, 11px);
}

.context-outline-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-rail-empty {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-size-ui-sm, 12px);
  line-height: 1.5;
}

.context-rail-actions {
  margin-top: auto;
  display: grid;
  gap: 4px;
}

.context-rail-actions button {
  padding: 8px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-ui-sm, 12px);
}

.context-rail-refresh {
  margin-left: auto;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-ui-sm, 12px);
}

.context-link-state {
  font-style: normal;
  font-size: var(--font-size-ui-xs, 11px);
  color: var(--text-muted);
}

.context-link-state--missing,
.context-link-state--outside,
.context-link-state--unsupported,
.context-link-state--invalid {
  color: #f5a524;
}

.context-outline-item:focus-visible,
.context-work-item:focus-visible {
  box-shadow: inset 2px 0 0 var(--accent-blue);
}

/* 目录联动高亮：左侧 2px 主色竖条 + 主色文字（深浅主题都取自 accent token）。
   放在 :hover 之后并用同为显式选择器的规则覆盖背景色，保证悬停当前项时仍是高亮态。 */
.context-outline-item--active,
.context-outline-item--active:hover,
.context-outline-item--active:focus-visible {
  background: color-mix(in srgb, var(--accent-blue) 12%, transparent);
  color: var(--accent-blue-strong, var(--accent-blue));
  box-shadow: inset 2px 0 0 var(--accent-blue);
  font-weight: 600;
}

.context-outline-item--active .context-outline-label {
  color: inherit;
}

.context-outline-item--active .context-outline-kind,
.context-outline-item--active .context-outline-line {
  color: var(--accent-blue-strong, var(--accent-blue));
  opacity: 0.85;
}
</style>
