<script setup lang="ts">
/**
 * MindmapOutlinePanel（思维导图 阶段 2：大纲面板）
 *
 * 职责：
 * 1. 以大纲树呈现当前文档可见节点，与画布共享选中态（双向同步由上层 store 保证）；
 * 2. 支持选中、折叠/展开、双击/F2 改名、拖放改变父级；
 * 3. 作为键盘导航与可访问性的补充视图。
 *
 * 说明：本组件保持「受控」——不直接修改文档，所有操作通过事件交给上层命令层。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import type { MindmapOutlineRow } from '@/types/mindmap';

const props = withDefaults(defineProps<{
  rows: MindmapOutlineRow[];
  selectedId: string | null;
  editingId: string | null;
  editingText: string;
  /** 搜索框内容（受控）。 */
  searchQuery?: string;
  /** 命中节点的 id 列表，用于高亮。 */
  matchIds?: string[];
  /** 初始宽度（px），拖动 resizer 后由组件内部维护。 */
  initialWidth?: number;
  /**
   * 受控宽度（px，UX-3B）：传入时宽度完全由外部决定，拖动 resizer 通过
   * `update:width` 交回上层，用于外壳统一管理右侧列宽。
   */
  width?: number;
  /**
   * 是否渲染自带的 resizer（默认 true）。
   * 外壳（MindmapRightPanel）自己提供 resizer 时传 false，避免同名 testid 重复。
   */
  resizable?: boolean;
}>(), {
  // Boolean prop 缺省会被 Vue 转换为 false，因此显式声明默认 true
  resizable: true,
});

const emit = defineEmits<{
  (event: 'select', id: string): void;
  (event: 'toggle', id: string): void;
  (event: 'start-rename', id: string): void;
  (event: 'commit-rename', text: string): void;
  (event: 'cancel-rename'): void;
  (event: 'update:editing-text', text: string): void;
  (event: 'update:search', query: string): void;
  (event: 'update:width', width: number): void;
  (event: 'move', draggedId: string, targetId: string): void;
  /** 右键一行：由上层构造并打开统一右键菜单。 */
  (event: 'contextmenu', payload: {
    nodeId: string | null;
    clientX: number;
    clientY: number;
  }): void;
}>();

function onSearchInput(event: Event) {
  const target = event.target as HTMLInputElement | null;
  emit('update:search', target?.value ?? '');
}

function isMatch(id: string): boolean {
  return props.matchIds?.includes(id) ?? false;
}

const draggedId = ref<string | null>(null);
const dragOverId = ref<string | null>(null);

function onDragStart(event: DragEvent, id: string) {
  draggedId.value = id;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  }
}

function onDragOver(event: DragEvent, id: string) {
  if (!draggedId.value || draggedId.value === id) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  dragOverId.value = id;
}

function onDragEnd() {
  draggedId.value = null;
  dragOverId.value = null;
}

function onDrop(event: DragEvent, targetId: string) {
  event.preventDefault();
  const source = draggedId.value;
  dragOverId.value = null;
  draggedId.value = null;
  if (!source || source === targetId) return;
  emit('move', source, targetId);
}

function indent(depth: number): string {
  return `${10 + depth * 18}px`;
}

function onRenameInput(event: Event) {
  const target = event.target as HTMLInputElement | null;
  emit('update:editing-text', target?.value ?? '');
}

function onRenameKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    emit('commit-rename', props.editingText);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    emit('cancel-rename');
  }
}

/* ---------------------------- 面板宽度（本地或受控） ---------------------------- */

/** 面板宽度上下限（与任务约定一致：180–420px）。 */
const PANEL_MIN_WIDTH = 180;
const PANEL_MAX_WIDTH = 420;
const DEFAULT_PANEL_WIDTH = 240;

function clampWidth(value: number): number {
  return Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, Math.round(value)));
}

/**
 * 本地宽度：拖动 resizer 时变化（未传 `width` 时生效）。
 * 不进文档、不触发 change、不进历史——宽度是「视图偏好」而不是内容。
 */
const localWidth = ref(clampWidth(props.initialWidth ?? DEFAULT_PANEL_WIDTH));

/**
 * 对外生效的宽度：
 * - 传了 `width` → 受控（由外壳如 MindmapRightPanel 管，store.outlineWidth）；
 * - 没传 → 用本地宽度（面板独立使用时的既有行为）。
 */
const panelWidth = computed(() => (
  props.width === undefined ? localWidth.value : clampWidth(props.width)
));

/** 是否渲染自带的 resizer（外壳自己提供 resizer 时关闭，避免 testid 重复）。 */
const showResizer = computed(() => props.resizable !== false);

let resizeStartX = 0;
let resizeStartWidth = 0;
let resizing = false;

function restoreResizeCursor() {
  if (typeof document === 'undefined') return;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

function onResizePointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  resizing = true;
  resizeStartX = event.clientX;
  resizeStartWidth = panelWidth.value;
  window.addEventListener('pointermove', onResizePointerMove);
  window.addEventListener('pointerup', endResize, { once: true });
  window.addEventListener('pointercancel', endResize, { once: true });
  if (typeof document !== 'undefined') {
    // 拖动期间固定 col-resize 光标并禁止选中
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }
}

function onResizePointerMove(event: PointerEvent) {
  if (!resizing) return;
  // 面板位于右侧：向左拖（clientX 变小）应当变宽
  const nextWidth = clampWidth(resizeStartWidth + (resizeStartX - event.clientX));
  if (props.width === undefined) localWidth.value = nextWidth;
  else emit('update:width', nextWidth);
}

function endResize() {
  resizing = false;
  window.removeEventListener('pointermove', onResizePointerMove);
  window.removeEventListener('pointerup', endResize);
  window.removeEventListener('pointercancel', endResize);
  restoreResizeCursor();
}

onBeforeUnmount(() => {
  endResize();
});

/* ------------------------------ 右键菜单 ------------------------------ */

/** 行内右键：阻止浏览器默认菜单，把节点信息交给上层统一处理。 */
function onRowContextMenu(event: MouseEvent, rowId: string) {
  event.preventDefault();
  event.stopPropagation();
  emit('contextmenu', { nodeId: rowId, clientX: event.clientX, clientY: event.clientY });
}
</script>

<template>
  <aside
    class="mindmap-outline"
    data-testid="mindmap-outline"
    :style="{ width: `${panelWidth}px`, flex: `0 0 ${panelWidth}px` }"
  >
    <div
      v-if="showResizer"
      class="mm-panel-resizer"
      data-testid="mm-outline-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="拖动调整大纲宽度"
      title="拖动调整宽度"
      @pointerdown="onResizePointerDown"
    ></div>
    <div class="mindmap-outline-header">
      <span class="mindmap-outline-title">大纲</span>
      <input
        class="mm-outline-search"
        data-testid="mm-outline-search"
        type="search"
        placeholder="搜索节点"
        :value="props.searchQuery ?? ''"
        @input="onSearchInput"
      />
    </div>
    <div class="mindmap-tree" data-testid="mindmap-tree" role="tree">
      <div
        v-for="row in rows"
        :key="row.id"
        class="mindmap-row"
        :class="{
          'is-selected': row.id === selectedId,
          'is-drag-over': row.id === dragOverId,
          'is-match': isMatch(row.id),
        }"
        :style="{ paddingLeft: indent(row.depth) }"
        role="treeitem"
        :aria-selected="row.id === selectedId"
        :aria-expanded="row.hasChildren ? !row.collapsed : undefined"
        :data-topic-id="row.id"
        draggable="true"
        @click="emit('select', row.id)"
        @dblclick="emit('start-rename', row.id)"
        @dragstart="onDragStart($event, row.id)"
        @dragover="onDragOver($event, row.id)"
        @drop="onDrop($event, row.id)"
        @dragend="onDragEnd"
        @contextmenu="onRowContextMenu($event, row.id)"
      >
        <button
          v-if="row.hasChildren"
          type="button"
          class="mm-toggle"
          :aria-label="row.collapsed ? '展开' : '折叠'"
          @click.stop="emit('toggle', row.id)"
        >
          {{ row.collapsed ? '▸' : '▾' }}
        </button>
        <span v-else class="mm-toggle is-placeholder" aria-hidden="true">•</span>

        <input
          v-if="editingId === row.id"
          class="mm-rename-input"
          data-testid="mm-rename-input"
          type="text"
          autocomplete="off"
          :value="editingText"
          @input="onRenameInput"
          @keydown="onRenameKeydown"
          @blur="emit('commit-rename', editingText)"
        />
        <span v-else class="mm-row-text">{{ row.text || '（空主题）' }}</span>
        <span v-if="row.hasChildren" class="mm-row-count">{{ row.childCount }}</span>
      </div>

      <div v-if="rows.length === 0" class="mindmap-empty">文档没有可显示的节点。</div>
    </div>
  </aside>
</template>

<style scoped>
/* 配色使用 Tau 主题 token，明暗主题 / 皮肤切换下都保持可读 */
.mindmap-outline {
  position: relative;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-soft);
  background: var(--panel-base);
  color: var(--text-primary);
  overflow: hidden;
}
/* 可拖拽调宽的左边缘（命中区域比视觉更宽，便于抓取） */
.mm-panel-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 2;
  background: transparent;
}
.mm-panel-resizer::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  width: 2px;
  background: transparent;
}
.mm-panel-resizer:hover::after,
.mm-panel-resizer:active::after {
  background: var(--accent-brand);
}
.mindmap-outline-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-soft);
}
.mindmap-outline-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  flex: 0 0 auto;
}
.mm-outline-search {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-family: var(--font-ui);
  padding: 3px 8px;
  border-radius: var(--radius-control);
  border: 1px solid var(--border-soft);
  background: var(--panel-elevated);
  color: var(--text-primary);
  outline: none;
}
.mm-outline-search::placeholder { color: var(--text-muted); }
.mm-outline-search:focus { border-color: var(--accent-brand); }
.mindmap-tree {
  flex: 1;
  overflow: auto;
  padding: 6px 0;
}
.mindmap-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 0;
  margin: 1px 6px;
  border-radius: var(--radius-control);
  cursor: default;
  min-height: 26px;
  color: var(--text-primary);
}
.mindmap-row:hover { background: var(--surface-hover); }
.mindmap-row.is-selected {
  background: var(--surface-active);
  box-shadow: inset 0 0 0 1px var(--accent-brand);
}
.mindmap-row.is-drag-over { box-shadow: inset 0 2px 0 0 var(--state-success); }
.mindmap-row.is-match .mm-row-text {
  color: var(--state-warning);
  font-weight: 600;
}
.mm-toggle {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 10px;
  cursor: pointer;
  opacity: 0.8;
  padding: 0;
}
.mm-toggle.is-placeholder { cursor: default; opacity: 0.4; text-align: center; }
.mm-row-text {
  flex: 1;
  font-size: 12px;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}
.mm-row-count {
  font-size: 10px;
  color: var(--text-secondary);
  padding: 0 4px;
  border-radius: var(--radius-pill);
  background: var(--surface-muted);
}
.mm-rename-input {
  flex: 1;
  font-size: 12px;
  font-family: var(--font-ui);
  padding: 2px 6px;
  border-radius: var(--radius-control);
  border: 1px solid var(--accent-brand);
  background: var(--panel-elevated);
  color: var(--text-primary);
  outline: none;
}
.mindmap-empty { color: var(--text-muted); padding: 14px; font-size: 12px; }
</style>
