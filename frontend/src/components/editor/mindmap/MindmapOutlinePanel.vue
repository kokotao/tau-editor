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
import { ref } from 'vue';
import type { MindmapOutlineRow } from '@/types/mindmap';

const props = defineProps<{
  rows: MindmapOutlineRow[];
  selectedId: string | null;
  editingId: string | null;
  editingText: string;
  /** 搜索框内容（受控）。 */
  searchQuery?: string;
  /** 命中节点的 id 列表，用于高亮。 */
  matchIds?: string[];
}>();

const emit = defineEmits<{
  (event: 'select', id: string): void;
  (event: 'toggle', id: string): void;
  (event: 'start-rename', id: string): void;
  (event: 'commit-rename', text: string): void;
  (event: 'cancel-rename'): void;
  (event: 'update:editing-text', text: string): void;
  (event: 'update:search', query: string): void;
  (event: 'move', draggedId: string, targetId: string): void;
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
</script>

<template>
  <aside class="mindmap-outline" data-testid="mindmap-outline">
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
.mindmap-outline {
  width: 240px;
  flex: 0 0 240px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border, #e5e7eb);
  background: var(--surface, #ffffff);
  overflow: hidden;
}
.mindmap-outline-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border, #e5e7eb);
}
.mindmap-outline-title {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.7;
  flex: 0 0 auto;
}
.mm-outline-search {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid var(--border, #d8dee9);
  background: var(--surface, #fff);
  color: inherit;
  outline: none;
}
.mm-outline-search:focus { border-color: rgba(74, 144, 226, 0.7); }
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
  border-radius: 6px;
  cursor: default;
  min-height: 26px;
}
.mindmap-row:hover { background: var(--hover, rgba(74, 144, 226, 0.06)); }
.mindmap-row.is-selected {
  background: var(--selected, rgba(74, 144, 226, 0.18));
  box-shadow: inset 0 0 0 1px rgba(74, 144, 226, 0.45);
}
.mindmap-row.is-drag-over { box-shadow: inset 0 2px 0 0 rgba(58, 167, 109, 0.9); }
.mindmap-row.is-match .mm-row-text {
  color: #b26a00;
  font-weight: 600;
}
.mm-toggle {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 10px;
  cursor: pointer;
  opacity: 0.7;
  padding: 0;
}
.mm-toggle.is-placeholder { cursor: default; opacity: 0.35; text-align: center; }
.mm-row-text { flex: 1; font-size: 12px; white-space: pre-wrap; word-break: break-word; }
.mm-row-count {
  font-size: 10px;
  opacity: 0.5;
  padding: 0 4px;
  border-radius: 6px;
  background: var(--chip-bg, rgba(0, 0, 0, 0.05));
}
.mm-rename-input {
  flex: 1;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid rgba(74, 144, 226, 0.7);
  background: var(--surface, #fff);
  color: inherit;
  outline: none;
}
.mindmap-empty { opacity: 0.6; padding: 14px; font-size: 12px; }
</style>