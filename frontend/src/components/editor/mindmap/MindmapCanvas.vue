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
 * 阶段 4C 扩展：
 * - 主题模板：按 `document.themeId` 取色，通过内联 CSS 变量整体换色；
 *   默认主题（未选择 / default）不写任何内联变量，完全沿用既有 CSS，观感不变；
 * - 节点样式：`topic.style.fill/color/shape` 覆盖单节点填充、文字色与圆角形状；
 * - 标记：`topic.markers` 在节点左上角渲染徽章；
 * - 独立关系线：`document.relations` 在父子连线之外渲染虚线 + 箭头 + 可选标签，
 *   只读取布局产出的节点坐标，不参与布局计算。
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
import {
  DEFAULT_MARKER_BADGE_FILL,
  DEFAULT_MARKER_BADGE_TEXT,
  DEFAULT_MINDMAP_THEME_ID,
  isMindmapThemeId,
  mindmapThemeCssVariables,
  resolveMindmapTheme,
} from '@/services/mindmapThemeService';
import { mindmapMarkerBadge } from '@/stores/mindmap';
import type { MindMapDocument, MindMapTopicStyle } from '@/types/mindmap';

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

/** 关系线箭头 marker 的固定 id（同页多画布共用同一份定义，不影响渲染）。 */
const RELATION_ARROW_MARKER = 'url(#mm-relation-arrow)';
/** 标记徽章边长（世界坐标，随画布缩放）。 */
const MARKER_BADGE_SIZE = 14;
/** 默认节点圆角；shape 未声明时使用，保持与既有观感一致。 */
const DEFAULT_NODE_RADIUS = 9;


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

/* ------------------------------ 派生：主题 ------------------------------- */

/** 当前主题 id（缺失时按 default 处理）。 */
const themeId = computed(() => props.document?.themeId ?? DEFAULT_MINDMAP_THEME_ID);

/** 当前主题配色；未知 id 由 resolveMindmapTheme 回退 default。 */
const currentTheme = computed(() => resolveMindmapTheme(themeId.value));

/**
 * 画布根节点的内联 CSS 变量。
 *
 * 仅在「已选择非默认主题」时输出：default（或未设置）时保持为空对象，
 * 完全沿用既有 CSS 与暗色模式变量，确保未选主题时观感与改动前一致。
 */
const canvasThemeStyle = computed<Record<string, string>>(() => {
  if (!isMindmapThemeId(themeId.value)) return {};
  if (themeId.value === DEFAULT_MINDMAP_THEME_ID) return {};
  return mindmapThemeCssVariables(currentTheme.value);
});

/* ------------------------------ 派生：节点样式 ------------------------------- */

function topicStyle(id: string): MindMapTopicStyle | undefined {
  return props.document?.topics[id]?.style;
}

/** 节点矩形内联样式：仅当节点声明了 fill 时覆盖（其余交给主题 CSS 变量）。 */
function nodeRectStyle(node: MindmapNodeBox): Record<string, string> {
  const style = topicStyle(node.id);
  return style?.fill ? { fill: style.fill } : {};
}

/** 节点文字内联样式：仅当节点声明了 color 时覆盖。 */
function nodeTextStyle(node: MindmapNodeBox): Record<string, string> {
  const style = topicStyle(node.id);
  return style?.color ? { fill: style.color } : {};
}

/** 圆角半径：shape 支持 rounded（默认）/ rect / pill，未知值按默认处理。 */
function nodeRx(node: MindmapNodeBox): number {
  const shape = topicStyle(node.id)?.shape;
  if (shape === 'rect') return 2;
  if (shape === 'pill') return Math.min(node.width, node.height) / 2;
  return DEFAULT_NODE_RADIUS;
}

/* ------------------------------ 派生：标记 ------------------------------- */

function markersOf(id: string): string[] {
  return props.document?.topics[id]?.markers ?? [];
}

/* ------------------------------ 派生：关系线 ------------------------------- */

interface RenderedRelation {
  id: string;
  sourceId: string;
  targetId: string;
  path: string;
  label?: string;
  labelX: number;
  labelY: number;
  color: string;
}

/** 把「中心 → 指定方向」的射线裁剪到节点矩形边界（含少量内缩留白）。 */
function clipToNodeBoundary(
  node: MindmapNodeBox,
  dx: number,
  dy: number,
): { x: number; y: number } {
  const halfWidth = node.width / 2 + 3;
  const halfHeight = node.height / 2 + 3;
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : Math.abs(halfWidth / dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : Math.abs(halfHeight / dy);
  const ratio = Math.min(scaleX, scaleY);
  return { x: node.x + dx * ratio, y: node.y + dy * ratio };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 关系线几何：两端各裁到矩形边界，直连两节点中心，标签落在中点上方。
 * 端点重合（同位置节点）时返回 null，跳过渲染。
 */
function relationGeometry(
  source: MindmapNodeBox,
  target: MindmapNodeBox,
): { path: string; labelX: number; labelY: number } | null {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  if (dx === 0 && dy === 0) return null;
  const start = clipToNodeBoundary(source, dx, dy);
  const end = clipToNodeBoundary(target, -dx, -dy);
  return {
    path: `M ${round1(start.x)} ${round1(start.y)} L ${round1(end.x)} ${round1(end.y)}`,
    labelX: round1((start.x + end.x) / 2),
    labelY: round1((start.y + end.y) / 2 - 6),
  };
}

/**
 * 需要渲染的关系线：端点必须同时可见（折叠/不存在则不渲染），
 * 且不参与布局——只读取布局产出的节点中心与尺寸。
 */
const renderedRelations = computed<RenderedRelation[]>(() => {
  const document = props.document;
  const currentLayout = layout.value;
  if (!document || !currentLayout) return [];
  const relations = document.relations ?? [];
  if (relations.length === 0) return [];

  const byId = new Map(currentLayout.nodes.map((node) => [node.id, node]));
  const color = currentTheme.value.accent;
  const result: RenderedRelation[] = [];
  for (const relation of relations) {
    const source = byId.get(relation.sourceTopicId);
    const target = byId.get(relation.targetTopicId);
    if (!source || !target) continue;
    const geometry = relationGeometry(source, target);
    if (!geometry) continue;
    result.push({
      id: relation.id,
      sourceId: relation.sourceTopicId,
      targetId: relation.targetTopicId,
      path: geometry.path,
      label: relation.label,
      labelX: geometry.labelX,
      labelY: geometry.labelY,
      color,
    });
  }
  return result;
});

/** 标记徽章配色（跟随主题，缺省用内置兜底色）。 */
const markerBadgeFill = computed(
  () => currentTheme.value.markerBadgeFill ?? DEFAULT_MARKER_BADGE_FILL,
);
const markerBadgeText = computed(
  () => currentTheme.value.markerBadgeText ?? DEFAULT_MARKER_BADGE_TEXT,
);

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
    :data-theme-id="themeId"
    :style="canvasThemeStyle"
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
      <!-- 关系线箭头定义：独立关系线（阶段 4C）复用同一份 marker -->
      <defs>
        <marker
          id="mm-relation-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" :fill="currentTheme.accent" />
        </marker>
      </defs>
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

        <!--
          独立关系线（阶段 4C）：虚线 + 箭头 + 可选标签。
          只读取布局产出的节点坐标，不参与布局，因此缩放/适配行为与父子连线一致。
        -->
        <g
          v-for="relation in renderedRelations"
          :key="relation.id"
          class="mm-relation"
          data-testid="mm-relation"
          :data-relation-id="relation.id"
          :data-source-id="relation.sourceId"
          :data-target-id="relation.targetId"
        >
          <path
            class="mm-relation-path"
            :d="relation.path"
            fill="none"
            stroke-dasharray="6 4"
            :marker-end="RELATION_ARROW_MARKER"
            :style="{ stroke: relation.color }"
          />
          <text
            v-if="relation.label"
            class="mm-relation-label"
            :x="relation.labelX"
            :y="relation.labelY"
            text-anchor="middle"
            :style="{ fill: relation.color }"
          >{{ relation.label }}</text>
        </g>

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
            :rx="nodeRx(node)"
            :style="nodeRectStyle(node)"
          />
          <text class="mm-node-text" text-anchor="middle" :style="nodeTextStyle(node)">
            <tspan
              v-for="(line, index) in node.lines"
              :key="index"
              :x="0"
              :y="lineBaselineY(index, node.lines.length)"
            >{{ line }}</tspan>
          </text>
          <!-- 标记徽章（阶段 4C）：节点左上角外侧，数量与 topic.markers 顺序一致 -->
          <g
            v-if="markersOf(node.id).length > 0"
            class="mm-markers"
            :transform="`translate(${-node.width / 2} ${-node.height / 2 - 12})`"
          >
            <g
              v-for="(marker, index) in markersOf(node.id)"
              :key="marker"
              class="mm-marker"
              data-testid="mm-marker"
              :data-marker="marker"
              :transform="`translate(${index * (MARKER_BADGE_SIZE + 3)} 0)`"
            >
              <rect
                :width="MARKER_BADGE_SIZE"
                :height="MARKER_BADGE_SIZE"
                rx="4"
                :style="{ fill: markerBadgeFill, stroke: currentTheme.accent }"
              />
              <text
                :x="MARKER_BADGE_SIZE / 2"
                :y="MARKER_BADGE_SIZE - 4"
                text-anchor="middle"
                :style="{ fill: markerBadgeText }"
              >{{ mindmapMarkerBadge(marker) }}</text>
            </g>
          </g>
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
  fill: var(--mindmap-node-text, var(--text-primary, #1f2329));
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
/* 独立关系线（阶段 4C）：虚线 + 箭头；不参与布局，仅作语义补充 */
.mm-relation-path {
  stroke-width: 1.5;
  stroke-linecap: round;
  pointer-events: none;
}
.mm-relation-label {
  font-family: var(--font-sans, 'Manrope', 'Segoe UI', 'Microsoft YaHei', sans-serif);
  font-size: 10px;
  paint-order: stroke;
  stroke: var(--background, #ffffff);
  stroke-width: 2.5px;
  stroke-linejoin: round;
  pointer-events: none;
}
/* 标记徽章（阶段 4C）：节点左上角，小圆角块 + 徽章字符 */
.mm-marker rect {
  fill: var(--mindmap-marker-bg, #fff5e0);
  stroke-width: 1;
}
.mm-marker text {
  font-family: var(--font-sans, 'Manrope', 'Segoe UI', 'Microsoft YaHei', sans-serif);
  font-size: 9px;
  font-weight: 700;
  fill: var(--mindmap-marker-text, #8a5a00);
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