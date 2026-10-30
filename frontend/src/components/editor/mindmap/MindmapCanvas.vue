<script setup lang="ts">
/**
 * MindmapCanvas（思维导图 阶段 2：SVG 画布）
 *
 * 职责：
 * 1. 用 SVG 渲染思维导图节点与连线（布局来自 mindmapLayoutService，纯派生数据）；
 * 2. 交互：单击选中、双击内联改名、折叠/展开、画布平移、滚轮缩放、
 *    适配内容、重置视口、拖拽节点改变父级（带目标高亮与成环提示由上层处理）；
 * 3. 视口通过 v-model 与上层 store 的 viewport 同步，不进入文档历史；
 * 4. 节点文字支持多语言与自动换行，文本按布局行渲染；
 * 5. 连线完全按布局产出的 path 渲染，不假设方向；edge.orientation 仅用于样式标记，
 *    因此 mindmap/logic/tree（水平）与 org（竖直）可共用同一套渲染逻辑。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  computeFitViewport,
  computeMindmapLayout,
  type MindmapNodeBox,
  type MindmapViewport,
} from '@/services/mindmapLayoutService';
import type { MindMapDocument } from '@/types/mindmap';

const props = defineProps<{
  document: MindMapDocument | null;
  selectedId: string | null;
  viewport: MindmapViewport;
  editingId: string | null;
  editingText: string;
}>();

const emit = defineEmits<{
  (event: 'select', id: string): void;
  (event: 'toggle-collapse', id: string): void;
  (event: 'start-rename', id: string): void;
  (event: 'commit-rename', text: string): void;
  (event: 'cancel-rename'): void;
  (event: 'update:viewport', viewport: MindmapViewport): void;
  (event: 'update:editing-text', text: string): void;
  (event: 'move', draggedId: string, targetId: string): void;
}>();

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
/**
 * 「适配内容」的缩放上限。
 * 小图（如单节点）不应被放大到数倍，否则后续新增节点的坐标会跑到可视区外，
 * 反而看不到刚创建的内容。适配只负责「装得下」，放大交给缩放按钮。
 */
const FIT_MAX_ZOOM = 1;
const DEFAULT_SIZE = { width: 800, height: 600 };

const containerRef = ref<HTMLElement | null>(null);
const size = ref({ ...DEFAULT_SIZE });

const layout = computed(() => (
  props.document ? computeMindmapLayout(props.document) : null
));

const fontSize = computed(() => layout.value?.options.fontSize ?? 13);
const lineHeight = computed(() => layout.value?.options.lineHeight ?? 20);

/* --------------------------------- 容器尺寸 -------------------------------- */

let resizeObserver: ResizeObserver | null = null;

function measureContainer() {
  const el = containerRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    size.value = { width: Math.round(rect.width), height: Math.round(rect.height) };
  }
}

onMounted(() => {
  measureContainer();
  if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
    resizeObserver = new ResizeObserver(() => measureContainer());
    resizeObserver.observe(containerRef.value);
  }
  void nextTick(() => fitView());
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  endPan();
  endNodeDrag();
});

/* --------------------------------- 视口操作 -------------------------------- */

function applyViewport(next: MindmapViewport) {
  emit('update:viewport', next);
}

function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

/** 以容器内某点为中心缩放。 */
function zoomAt(clientX: number, clientY: number, factor: number) {
  const rect = containerRef.value?.getBoundingClientRect();
  const viewport = props.viewport;
  const nextZoom = clampZoom(viewport.zoom * factor);
  if (nextZoom === viewport.zoom) return;
  const px = clientX - (rect?.left ?? 0);
  const py = clientY - (rect?.top ?? 0);
  const worldX = (px - viewport.x) / viewport.zoom;
  const worldY = (py - viewport.y) / viewport.zoom;
  applyViewport({
    x: px - worldX * nextZoom,
    y: py - worldY * nextZoom,
    zoom: nextZoom,
  });
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
  zoomAt(event.clientX, event.clientY, factor);
}

function zoomIn() {
  zoomAt(
    (containerRef.value?.getBoundingClientRect().left ?? 0) + size.value.width / 2,
    (containerRef.value?.getBoundingClientRect().top ?? 0) + size.value.height / 2,
    1.2,
  );
}

function zoomOut() {
  zoomAt(
    (containerRef.value?.getBoundingClientRect().left ?? 0) + size.value.width / 2,
    (containerRef.value?.getBoundingClientRect().top ?? 0) + size.value.height / 2,
    1 / 1.2,
  );
}

/** 适配内容：整体缩放到容器内并居中。 */
function fitView() {
  measureContainer();
  const currentLayout = layout.value;
  if (!currentLayout) return;
  applyViewport(computeFitViewport(currentLayout.bounds, size.value, 48, {
    min: MIN_ZOOM,
    max: FIT_MAX_ZOOM,
  }));
}

/** 重置视口：保持 100% 缩放并让内容居中。 */
function resetView() {
  const currentLayout = layout.value;
  if (!currentLayout) {
    applyViewport({ x: size.value.width / 2, y: size.value.height / 2, zoom: 1 });
    return;
  }
  const centerX = currentLayout.bounds.minX + currentLayout.bounds.width / 2;
  const centerY = currentLayout.bounds.minY + currentLayout.bounds.height / 2;
  applyViewport({
    x: size.value.width / 2 - centerX,
    y: size.value.height / 2 - centerY,
    zoom: 1,
  });
}

defineExpose({ fitView, zoomIn, zoomOut, resetView });

/* --------------------------------- 平移 --------------------------------- */

interface PanState {
  pointerId: number;
  startX: number;
  startY: number;
  origin: MindmapViewport;
}
let panState: PanState | null = null;

function onBackgroundPointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  if (props.editingId) return;
  panState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    origin: { ...props.viewport },
  };
  window.addEventListener('pointermove', onPanPointerMove);
  window.addEventListener('pointerup', endPan, { once: true });
  window.addEventListener('pointercancel', endPan, { once: true });
}

function onPanPointerMove(event: PointerEvent) {
  if (!panState) return;
  const dx = event.clientX - panState.startX;
  const dy = event.clientY - panState.startY;
  applyViewport({
    x: panState.origin.x + dx,
    y: panState.origin.y + dy,
    zoom: panState.origin.zoom,
  });
}

function endPan() {
  panState = null;
  window.removeEventListener('pointermove', onPanPointerMove);
}

/* ------------------------------ 节点拖放 ------------------------------- */

interface NodeDragState {
  id: string;
  startX: number;
  startY: number;
  moved: boolean;
}
let nodeDrag: NodeDragState | null = null;
const draggingId = ref<string | null>(null);
const dragOverId = ref<string | null>(null);
let suppressNextClick = false;

function onNodePointerDown(node: MindmapNodeBox, event: PointerEvent) {
  if (event.button !== 0) return;
  if (props.editingId) return;
  // 折叠按钮与输入框自行处理
  const target = event.target as HTMLElement | SVGElement | null;
  if (target && typeof (target as Element).closest === 'function'
    && (target as Element).closest('.mm-toggle')) {
    return;
  }
  nodeDrag = { id: node.id, startX: event.clientX, startY: event.clientY, moved: false };
  window.addEventListener('pointermove', onNodePointerMove);
  window.addEventListener('pointerup', onNodePointerUp, { once: true });
  window.addEventListener('pointercancel', endNodeDrag, { once: true });
}

function onNodePointerMove(event: PointerEvent) {
  if (!nodeDrag) return;
  const dx = event.clientX - nodeDrag.startX;
  const dy = event.clientY - nodeDrag.startY;
  if (!nodeDrag.moved && Math.hypot(dx, dy) < 5) return;
  nodeDrag.moved = true;
  suppressNextClick = true;
  draggingId.value = nodeDrag.id;
  dragOverId.value = hitTestNode(event.clientX, event.clientY, nodeDrag.id);
}

function onNodePointerUp() {
  const drag = nodeDrag;
  const targetId = dragOverId.value;
  endNodeDrag();
  if (!drag || !drag.moved) return;
  if (targetId && targetId !== drag.id) {
    emit('move', drag.id, targetId);
  }
}

function endNodeDrag() {
  nodeDrag = null;
  draggingId.value = null;
  dragOverId.value = null;
  window.removeEventListener('pointermove', onNodePointerMove);
}

/** 屏幕坐标命中节点（世界坐标矩形判定）。 */
function hitTestNode(clientX: number, clientY: number, excludeId?: string): string | null {
  const currentLayout = layout.value;
  const rect = containerRef.value?.getBoundingClientRect();
  if (!currentLayout || !rect) return null;
  const viewport = props.viewport;
  const worldX = (clientX - rect.left - viewport.x) / viewport.zoom;
  const worldY = (clientY - rect.top - viewport.y) / viewport.zoom;
  for (let i = currentLayout.nodes.length - 1; i >= 0; i -= 1) {
    const node = currentLayout.nodes[i] as MindmapNodeBox;
    if (node.id === excludeId) continue;
    if (
      Math.abs(worldX - node.x) <= node.width / 2
      && Math.abs(worldY - node.y) <= node.height / 2
    ) {
      return node.id;
    }
  }
  return null;
}

function onNodeClick(node: MindmapNodeBox) {
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  emit('select', node.id);
}

/* ------------------------------ 内联改名 ------------------------------- */

const editingBox = computed(() => {
  if (!props.editingId || !layout.value) return null;
  const node = layout.value.nodes.find((item) => item.id === props.editingId);
  if (!node) return null;
  const viewport = props.viewport;
  const scale = viewport.zoom;
  const width = Math.max(120, node.width * scale + 32);
  const height = Math.max(30, node.height * scale + 10);
  const centerX = node.x * scale + viewport.x;
  const centerY = node.y * scale + viewport.y;
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    width,
    height,
    fontSize: Math.max(11, fontSize.value * scale),
    lineHeight: `${Math.max(14, lineHeight.value * scale)}px`,
  };
});

function onEditingInput(event: Event) {
  const target = event.target as HTMLTextAreaElement | null;
  emit('update:editing-text', target?.value ?? '');
}

function commitRename() {
  emit('commit-rename', props.editingText);
}

function onEditingKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    commitRename();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    emit('cancel-rename');
  }
}

/* ------------------------------ 派生：文本 ------------------------------- */

function lineBaselineY(index: number, total: number): number {
  return (index - (total - 1) / 2) * lineHeight.value + fontSize.value * 0.35;
}

function toggleOffsetX(node: MindmapNodeBox): number {
  return node.side === 'left' ? -node.width / 2 - 10 : node.width / 2 + 10;
}

/* 文档切换（rootTopicId 变化）时自动适配内容；编辑不改变 root，不会反复跳动。 */
let lastRootId: string | null = null;
watch(
  () => props.document?.rootTopicId ?? null,
  async (rootId) => {
    if (rootId === lastRootId) return;
    lastRootId = rootId;
    if (!rootId) return;
    await nextTick();
    fitView();
  },
  { immediate: true },
);
</script>

<template>
  <div
    ref="containerRef"
    class="mindmap-canvas"
    data-testid="mindmap-canvas"
    @wheel="onWheel"
    @pointerdown.self="onBackgroundPointerDown"
  >
    <svg
      v-if="layout"
      class="mm-svg"
      :width="size.width"
      :height="size.height"
      role="group"
      aria-label="思维导图画布"
    >
      <g :transform="`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`">
        <!--
          连线路径完全由布局服务生成，画布不假设方向：
          edge.orientation 只用于样式与测试标记（org 为 vertical，其余 horizontal）。
        -->
        <path
          v-for="edge in layout.edges"
          :key="edge.id"
          class="mm-edge"
          :class="{ 'mm-edge--vertical': edge.orientation === 'vertical' }"
          :data-orientation="edge.orientation"
          :data-edge-id="edge.id"
          :d="edge.path"
          fill="none"
        />

        <g
          v-for="node in layout.nodes"
          :key="node.id"
          class="mm-node"
          :class="{
            'is-selected': node.id === selectedId,
            'is-root': node.side === 'root',
            'is-collapsed': node.collapsed,
            'is-drag-over': node.id === dragOverId,
            'is-dragging': node.id === draggingId,
          }"
          :data-node-id="node.id"
          :transform="`translate(${node.x} ${node.y})`"
          @pointerdown.stop="onNodePointerDown(node, $event)"
          @click.stop="onNodeClick(node)"
          @dblclick.stop="emit('start-rename', node.id)"
        >
          <rect
            class="mm-node-box"
            :x="-node.width / 2"
            :y="-node.height / 2"
            :width="node.width"
            :height="node.height"
            rx="9"
          />
          <text class="mm-node-text" text-anchor="middle">
            <tspan
              v-for="(line, index) in node.lines"
              :key="index"
              :x="0"
              :y="lineBaselineY(index, node.lines.length)"
            >{{ line }}</tspan>
          </text>
          <g
            v-if="node.hasChildren"
            class="mm-toggle"
            :transform="`translate(${toggleOffsetX(node)} 0)`"
            role="button"
            :aria-label="node.collapsed ? '展开' : '折叠'"
            @pointerdown.stop
            @click.stop="emit('toggle-collapse', node.id)"
          >
            <circle r="7" />
            <text text-anchor="middle" y="3.5">{{ node.collapsed ? '+' : '−' }}</text>
          </g>
        </g>
      </g>
    </svg>

    <textarea
      v-if="editingBox"
      class="mm-inline-editor"
      data-testid="mm-inline-editor"
      :value="editingText"
      :style="{
        left: `${editingBox.left}px`,
        top: `${editingBox.top}px`,
        width: `${editingBox.width}px`,
        height: `${editingBox.height}px`,
        fontSize: `${editingBox.fontSize}px`,
        lineHeight: editingBox.lineHeight,
      }"
      @input="onEditingInput"
      @keydown.stop="onEditingKeydown"
      @blur="commitRename"
    ></textarea>
  </div>
</template>

<style scoped>
.mindmap-canvas {
  position: relative;
  flex: 1;
  overflow: hidden;
  background: var(--background, #ffffff);
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.mindmap-canvas:active { cursor: grabbing; }
.mm-svg { display: block; }
.mm-edge {
  stroke: var(--mindmap-edge, #b7c4d8);
  stroke-width: 1.6;
}
/* org 模式的竖直连线：圆头收尾，避免底部端点出现硬角 */
.mm-edge--vertical {
  stroke-linecap: round;
}
.mm-node { cursor: pointer; }
.mm-node-box {
  fill: var(--mindmap-node-bg, #ffffff);
  stroke: var(--mindmap-node-border, #c7d2e2);
  stroke-width: 1.4;
}
.mm-node-text {
  font-family: var(--font-sans, 'Manrope', 'Segoe UI', 'Microsoft YaHei', sans-serif);
  font-size: 13px;
  fill: var(--text-primary, #1f2329);
  pointer-events: none;
}
.mm-node.is-root .mm-node-box {
  fill: var(--mindmap-root-bg, #eaf2ff);
  stroke: var(--mindmap-root-border, #7aa7e8);
  stroke-width: 1.8;
}
.mm-node.is-root .mm-node-text { font-weight: 700; }
.mm-node.is-collapsed .mm-node-box { stroke-dasharray: 4 3; }
.mm-node.is-selected .mm-node-box {
  stroke: var(--accent, #4a90e2);
  stroke-width: 2.2;
  filter: drop-shadow(0 0 4px rgba(74, 144, 226, 0.45));
}
.mm-node.is-drag-over .mm-node-box {
  stroke: #3aa76d;
  stroke-width: 2.4;
  fill: rgba(58, 167, 109, 0.12);
}
.mm-node.is-dragging { opacity: 0.55; }
.mm-toggle { cursor: pointer; }
.mm-toggle circle {
  fill: var(--mindmap-toggle-bg, #ffffff);
  stroke: var(--mindmap-node-border, #c7d2e2);
  stroke-width: 1.2;
}
.mm-toggle text {
  font-size: 9px;
  fill: var(--text-secondary, #5b6675);
  pointer-events: none;
}
.mm-inline-editor {
  position: absolute;
  z-index: 5;
  margin: 0;
  padding: 4px 8px;
  border-radius: 8px;
  border: 1.5px solid var(--accent, #4a90e2);
  background: var(--surface, #ffffff);
  color: var(--text-primary, #1f2329);
  font-family: var(--font-sans, 'Manrope', 'Segoe UI', 'Microsoft YaHei', sans-serif);
  resize: none;
  outline: none;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}
</style>