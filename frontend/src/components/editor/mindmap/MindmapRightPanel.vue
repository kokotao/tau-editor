<script setup lang="ts">
/**
 * MindmapRightPanel（UX-3B 返工：大纲列 + 属性列，两个独立右侧面板）
 *
 * 职责：
 * 1. 承载原本嵌在 MindmapStage 里的「大纲」与「属性」两个面板，作为编辑器外壳
 *    右侧两列独立显示（由 App.vue 在 .editor-stage 内渲染）；
 * 2. 两列各自独立 resizer 与宽度（写 store.outlineWidth / store.propertiesWidth，
 *    clamp 180–420）；显隐由 store.outlineVisible / store.propertiesVisible 控制
 *    （开关在全局 Toolbar，本组件不再提供顶部 tab / 收起工具条）；
 * 3. 直接消费 mindmap store（文档 / 选中 / 历史），编辑动作统一走可撤销命令，
 *    成功写入后通过 change 事件把序列化 JSON 交回标签管线（与 Stage 的 emit 模式一致）。
 *
 * 约定：
 * - 面板只影响展示（显隐 / 宽度）不写文档、不进历史、不触发 dirty；
 * - 保留被包裹面板内部的 data-testid（mm-outline-* / mm-props-*），既有测试与 E2E 兼容；
 * - 两列的 resizer 使用原有 testid（mm-outline-resizer / mm-props-resizer），
 *   被包裹面板自带的 resizer 由样式隐藏，避免同一列出现两条拖拽边；
 * - 大纲行的右键菜单由 Stage 统一提供：这里只把 contextmenu 载荷 emit 给上层，
 *   不重复实现菜单（避免两套动作逻辑）。
 *
 * 对外契约：
 * - props：无（状态来自 stores/mindmap）
 * - emits：
 *   - `change(json)`：文档因面板内编辑而变化（交给 App 的 handleMindmapChange）
 *   - `contextmenu({ nodeId, clientX, clientY })`：大纲行右键，转交 Stage 打开菜单
 *
 * @author Albert_Luo
 * @date 2026-10-31
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import {
  buildMindmapOutlineRows,
  collectMindmapTopicsInOrder,
  useMindmapStore,
} from '@/stores/mindmap';
import {
  isDescendantOf,
  moveTopic,
  renameTopic,
  setTopicCollapsed,
} from '@/services/mindmap/mindmapCommands';
import type { MindMapTopicBoundary, MindMapTopicStyle } from '@/types/mindmap';
import MindmapOutlinePanel from './MindmapOutlinePanel.vue';
import MindmapPropertiesPanel from './MindmapPropertiesPanel.vue';

const emit = defineEmits<{
  (event: 'change', json: string): void;
  (event: 'contextmenu', payload: {
    nodeId: string | null;
    clientX: number;
    clientY: number;
  }): void;
}>();

const store = useMindmapStore();

/** 两列显隐（由全局 Toolbar 的开关驱动）。 */
const outlineVisible = computed(() => store.outlineVisible);
const propertiesVisible = computed(() => store.propertiesVisible);

const mindmapDocument = computed(() => store.document);
const selectedTopicId = computed(() => store.selectedTopicId);

/* ------------------------------- 列宽与 resizer ------------------------------- */

/** 当前正在拖动的列（null = 未拖动）。 */
type PanelColumn = 'outline' | 'properties';
const resizingColumn = ref<PanelColumn | null>(null);
let resizeStartX = 0;
let resizeStartWidth = 0;

const outlineColumnStyle = computed(() => {
  const width = store.outlineWidth;
  return { width: `${width}px`, flex: `0 0 ${width}px` };
});
const propertiesColumnStyle = computed(() => {
  const width = store.propertiesWidth;
  return { width: `${width}px`, flex: `0 0 ${width}px` };
});

function restoreResizeCursor() {
  if (typeof document === 'undefined') return;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

function startResize(column: PanelColumn, event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  resizingColumn.value = column;
  resizeStartX = event.clientX;
  resizeStartWidth = column === 'outline' ? store.outlineWidth : store.propertiesWidth;
  window.addEventListener('pointermove', onResizePointerMove);
  window.addEventListener('pointerup', endResize, { once: true });
  window.addEventListener('pointercancel', endResize, { once: true });
  if (typeof document !== 'undefined') {
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }
}

function onResizePointerMove(event: PointerEvent) {
  const column = resizingColumn.value;
  if (!column) return;
  // 面板在右侧：向左拖（clientX 变小）应当变宽
  const nextWidth = resizeStartWidth + (resizeStartX - event.clientX);
  if (column === 'outline') store.setOutlineWidth(nextWidth);
  else store.setPropertiesWidth(nextWidth);
}

function endResize() {
  resizingColumn.value = null;
  if (typeof window !== 'undefined') {
    window.removeEventListener('pointermove', onResizePointerMove);
    window.removeEventListener('pointerup', endResize);
    window.removeEventListener('pointercancel', endResize);
  }
  restoreResizeCursor();
}

/* ------------------------------- 轻提示 ------------------------------- */

const notice = ref<string | null>(null);
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

function showNotice(message: string) {
  notice.value = message;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.value = null;
    noticeTimer = null;
  }, 3600);
}

onBeforeUnmount(() => {
  if (noticeTimer) clearTimeout(noticeTimer);
  endResize();
});

/* ------------------------------- 大纲数据 ------------------------------- */

const searchQuery = ref('');
const outline = computed(() => {
  const doc = mindmapDocument.value;
  if (!doc) return { rows: [], matchIds: new Set<string>(), searching: false };
  return buildMindmapOutlineRows(doc, searchQuery.value);
});

/** 大纲行内改名（与画布内联改名互相独立，互不干扰）。 */
const outlineEditingId = ref<string | null>(null);
const outlineEditingText = ref('');

function startOutlineRename(topicId: string) {
  const topic = mindmapDocument.value?.topics[topicId];
  if (!topic) return;
  outlineEditingId.value = topicId;
  outlineEditingText.value = topic.text;
}

function cancelOutlineRename() {
  outlineEditingId.value = null;
}

/* ------------------------------ 属性数据源 ------------------------------ */

/** 属性面板数据源：只暴露面板需要的字段，避免面板直接持有文档。 */
const panelTopic = computed(() => {
  const doc = mindmapDocument.value;
  const id = selectedTopicId.value;
  if (!doc || !id) return null;
  const topic = doc.topics[id];
  if (!topic) return null;
  return {
    id: topic.id,
    text: topic.text ?? '',
    notes: topic.notes,
    link: topic.link,
    labels: topic.labels,
    style: topic.style,
    markers: topic.markers ?? [],
    boundary: topic.boundary,
    summary: topic.summary,
  };
});

/** 可作为关系终点的候选：排除当前节点自身。 */
const relationTargets = computed(() => {
  const doc = mindmapDocument.value;
  const id = selectedTopicId.value;
  if (!doc) return [];
  return collectMindmapTopicsInOrder(doc).filter((topic) => topic.id !== id);
});

/** 与当前节点相关的关系线（源或目标），已补齐对端节点文本。 */
const panelRelations = computed(() => {
  const doc = mindmapDocument.value;
  const id = selectedTopicId.value;
  if (!doc || !id) return [];
  const result: {
    id: string;
    sourceId: string;
    targetId: string;
    targetText: string;
    label?: string;
  }[] = [];
  for (const relation of doc.relations ?? []) {
    if (relation.sourceTopicId !== id && relation.targetTopicId !== id) continue;
    const otherId = relation.sourceTopicId === id
      ? relation.targetTopicId
      : relation.sourceTopicId;
    result.push({
      id: relation.id,
      sourceId: relation.sourceTopicId,
      targetId: otherId,
      targetText: doc.topics[otherId]?.text || '（空主题）',
      label: relation.label,
    });
  }
  return result;
});

function closeProperties() {
  store.setPropertiesVisible(false);
}

/* ------------------------------- 命令执行 ------------------------------- */

/** 面板内编辑共用的「序列化前后对比 → emit change」封装。 */
function emitIfChanged(before: string) {
  const after = store.serialized;
  if (after && after !== before) emit('change', after);
}

function selectTopic(topicId: string) {
  store.selectTopic(topicId);
}

function toggleCollapse(topicId: string) {
  const topic = mindmapDocument.value?.topics[topicId];
  if (!topic) return;
  const before = store.serialized;
  const result = store.applyCommand(
    topic.collapsed ? '展开主题' : '折叠主题',
    (doc) => setTopicCollapsed(doc, topicId, !topic.collapsed),
  );
  if (result?.ok) emitIfChanged(before);
}

function commitOutlineRename(text: string) {
  const topicId = outlineEditingId.value;
  if (!topicId) return;
  outlineEditingId.value = null;
  const topic = mindmapDocument.value?.topics[topicId];
  if (topic && topic.text === text) return;
  const before = store.serialized;
  const result = store.applyCommand('重命名主题', (doc) => renameTopic(doc, topicId, text));
  if (result?.ok) emitIfChanged(before);
}

/** 大纲拖放换父级：与画布拖拽同一套校验。 */
function onMove(draggedId: string, targetId: string) {
  const doc = mindmapDocument.value;
  if (!doc || draggedId === targetId) return;
  if (draggedId === doc.rootTopicId) {
    showNotice('中心主题不能移动');
    return;
  }
  if (isDescendantOf(doc, draggedId, targetId)) {
    showNotice('不能把节点移动到自身的后代之下');
    return;
  }
  const before = store.serialized;
  const result = store.applyCommand('拖放移动', (current) => moveTopic(current, draggedId, targetId));
  if (result?.ok) emitIfChanged(before);
}

/** 属性列提交：备注 / 链接 / 标签。 */
function applyTopicProperties(payload: {
  notes?: string;
  link?: string;
  labels?: string[];
}) {
  const id = selectedTopicId.value;
  if (!id) return;
  const before = store.serialized;
  if (store.updateTopicMeta(id, payload)) {
    emitIfChanged(before);
    showNotice('节点属性已更新');
  }
}

function applyTopicStyle(style: MindMapTopicStyle) {
  const id = selectedTopicId.value;
  if (!id) return;
  const before = store.serialized;
  if (store.updateTopicStyle(id, style)) emitIfChanged(before);
}

function applyTopicMarkers(markers: string[]) {
  const id = selectedTopicId.value;
  if (!id) return;
  const before = store.serialized;
  if (store.updateTopicMarkers(id, markers)) emitIfChanged(before);
}

function applyTopicBoundary(boundary: MindMapTopicBoundary | null) {
  const id = selectedTopicId.value;
  if (!id) return;
  const before = store.serialized;
  if (store.setTopicBoundary(id, boundary)) {
    emitIfChanged(before);
    showNotice(boundary ? '已更新节点边界' : '已清除节点边界');
  }
}

function applyTopicSummary(text: string | null) {
  const id = selectedTopicId.value;
  if (!id) return;
  const before = store.serialized;
  if (store.setTopicSummary(id, text)) {
    emitIfChanged(before);
    showNotice(text ? '已更新节点概要' : '已清除节点概要');
  }
}

function addRelationFromPanel(payload: { targetId: string }) {
  const id = selectedTopicId.value;
  if (!id || !payload.targetId) return;
  const before = store.serialized;
  if (store.addRelation(id, payload.targetId)) {
    emitIfChanged(before);
    showNotice('已添加关系线');
  } else {
    showNotice('无法添加该关系（不能指向自身，且同一对节点只允许一条关系）');
  }
}

function removeRelationFromPanel(payload: { relationId: string }) {
  if (!payload.relationId) return;
  const before = store.serialized;
  if (store.removeRelation(payload.relationId)) {
    emitIfChanged(before);
    showNotice('已删除关系线');
  }
}

/** 大纲行右键：右键时先选中该行，再把载荷交给 Stage 打开统一菜单。 */
function onOutlineContextMenu(payload: {
  nodeId: string | null;
  clientX: number;
  clientY: number;
}) {
  if (payload.nodeId) store.selectTopic(payload.nodeId);
  emit('contextmenu', payload);
}
</script>

<template>
  <!-- 大纲列（默认展开） -->
  <aside
    v-if="outlineVisible"
    class="mm-right-column mm-right-outline"
    data-testid="mm-right-outline"
    role="complementary"
    aria-label="大纲"
    :style="outlineColumnStyle"
  >
    <div
      class="mm-right-resizer"
      data-testid="mm-outline-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="拖动调整大纲宽度"
      title="拖动调整宽度"
      @pointerdown="startResize('outline', $event)"
    ></div>
    <div v-if="notice && !propertiesVisible" class="mm-right-notice" role="status" data-testid="mm-right-notice">{{ notice }}</div>
    <div class="mm-right-column-body">
      <MindmapOutlinePanel
        :rows="outline.rows"
        :selected-id="selectedTopicId"
        :editing-id="outlineEditingId"
        :editing-text="outlineEditingText"
        :search-query="searchQuery"
        :match-ids="[...outline.matchIds]"
        :width="store.outlineWidth"
        :resizable="false"
        @select="selectTopic"
        @toggle="toggleCollapse"
        @start-rename="startOutlineRename"
        @commit-rename="commitOutlineRename"
        @cancel-rename="cancelOutlineRename"
        @update:editing-text="outlineEditingText = $event"
        @update:search="searchQuery = $event"
        @move="onMove"
        @contextmenu="onOutlineContextMenu"
      />
    </div>
  </aside>

  <!-- 属性列（默认收起；没有选中节点时不显示，与面板外移前的 Stage 行为一致） -->
  <aside
    v-if="propertiesVisible && panelTopic"
    class="mm-right-column mm-right-properties"
    data-testid="mm-right-properties"
    role="complementary"
    aria-label="节点属性"
    :style="propertiesColumnStyle"
  >
    <div
      class="mm-right-resizer"
      data-testid="mm-props-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="拖动调整属性面板宽度"
      title="拖动调整宽度"
      @pointerdown="startResize('properties', $event)"
    ></div>
    <div v-if="notice" class="mm-right-notice" role="status" data-testid="mm-right-notice">{{ notice }}</div>
    <div class="mm-right-column-body">
      <MindmapPropertiesPanel
        :topic="panelTopic"
        :relations="panelRelations"
        :relation-targets="relationTargets"
        :width="store.propertiesWidth"
        :resizable="false"
        @update="applyTopicProperties"
        @close="closeProperties"
        @update-style="applyTopicStyle"
        @update-markers="applyTopicMarkers"
        @add-relation="addRelationFromPanel"
        @remove-relation="removeRelationFromPanel"
        @update-boundary="applyTopicBoundary"
        @update-summary="applyTopicSummary"
      />
    </div>
  </aside>
</template>

<style scoped>
/* 配色一律使用 Tau 主题 token（明暗主题 / 皮肤切换下保持可读） */
.mm-right-column {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-left: 1px solid var(--border-soft);
  background: var(--panel-base);
  color: var(--text-primary);
  font-family: var(--font-ui);
  overflow: hidden;
}
/* 每列各自的 resizer：列左边缘，拖动改变该列宽度 */
.mm-right-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 3;
  background: transparent;
}
.mm-right-resizer::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  width: 2px;
  background: transparent;
}
.mm-right-resizer:hover::after,
.mm-right-resizer:active::after { background: var(--accent-brand); }
.mm-right-notice {
  padding: 5px 10px;
  font-size: 12px;
  color: var(--text-primary);
  background: var(--surface-active);
  border-bottom: 1px solid var(--border-soft);
  flex: 0 0 auto;
}
.mm-right-column-body {
  flex: 1;
  display: flex;
  min-height: 0;
  min-width: 0;
}
/*
 * 被包裹的大纲 / 属性面板自带宽度与 resizer（历史上独立使用）。
 * 在右面板里统一由外层列的宽度与列 resizer 控制，因此这里覆盖为撑满容器，
 * 并隐藏它们的内部 resizer，避免同一列出现两条拖拽边。
 */
.mm-right-column-body :deep(.mindmap-outline),
.mm-right-column-body :deep(.mm-props) {
  width: 100% !important;
  flex: 1 1 auto !important;
  border-left: none;
}
.mm-right-column-body :deep(.mm-panel-resizer) { display: none; }
</style>
