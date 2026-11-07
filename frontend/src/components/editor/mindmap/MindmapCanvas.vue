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
 * UX-1 扩展：
 * - 平移修复：监听容器 pointerdown（容器被 svg 铺满，`@pointerdown.self` 永不触发），
 *   空白区域按住拖动即平移；节点 / 折叠钮 / 内联编辑器不参与平移；
 * - 节点拖拽完善：>5px 进入拖拽、源半透明、目标高亮、拖拽中禁止选中文本，
 *   收尾抑制一次 click 以免误选中；
 * - 右键菜单：右键时按几何命中判定节点，向上 emit { nodeId, clientX, clientY }，
 *   菜单本身由上层（MindmapStage）统一构造与执行；
 * - 配色全部改为 Tau 主题 token，default 主题因此随明暗主题自适应。
 *
 * UX-2 扩展（边界 / 概要）：
 * - 边界：半透明圆角框 + 虚线描边 + 左上角标签，绘制在父子连线之前（视觉在最底层）；
 * - 概要：子节点范围的括线 + 文本，颜色跟随主题强调色；
 * - 两者都 `pointer-events: none`，不参与节点命中/拖拽/右键，因此不会挡住交互。
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
  measureTextWidth,
  type MindmapNodeBox,
  type MindmapSummaryBox,
  type MindmapViewport,
} from '@/services/mindmapLayoutService';
import {
  DEFAULT_MINDMAP_THEME_ID,
  isMindmapThemeId,
  isRainbowTheme,
  mindmapThemeCanvasVariables,
  rainbowBranchColor,
  resolveMindmapTheme,
} from '@/services/mindmapThemeService';
import { mindmapMarkerBadge } from '@/stores/mindmap';
import { getMindmapLineOffsets, segmentMindmapTextLine } from '@/services/mindmap/mindmapTextStyleService';
import type { MindMapDocument, MindMapTopicStyle, MindmapStyleTarget } from '@/types/mindmap';

const props = withDefaults(defineProps<{
  document: MindMapDocument | null;
  selectedId: string | null;
  viewport: MindmapViewport;
  editingId: string | null;
  editingText: string;
  canvasBackground?: string;
  canvasGridVisible?: boolean;
  canvasRootVisible?: boolean;
  canvasTool?: 'select' | 'relation';
  relationStartId?: string | null;
}>(), {
  canvasGridVisible: true,
  canvasRootVisible: true,
  canvasTool: 'select',
  relationStartId: null,
});

const emit = defineEmits<{
  (event: 'select', id: string): void;
  (event: 'style-target', target: MindmapStyleTarget): void;
  (event: 'toggle-collapse', id: string): void;
  (event: 'start-rename', id: string): void;
  (event: 'commit-rename', text: string): void;
  (event: 'cancel-rename'): void;
  (event: 'update:viewport', viewport: MindmapViewport): void;
  (event: 'update:editing-text', text: string): void;
  (event: 'apply-text-style', payload: { start: number; end: number; color?: string | null; background?: string | null }): void;
  (event: 'move', draggedId: string, targetId: string, position?: 'before' | 'after'): void;
  /** 右键：nodeId 为命中的节点，null 表示空白区域。 */
  (event: 'contextmenu', payload: {
    nodeId: string | null;
    clientX: number;
    clientY: number;
  }): void;
}>();

/** 标记徽章边长（世界坐标，随画布缩放）。 */
const MARKER_BADGE_SIZE = 14;
/** 默认节点圆角；shape 未声明时使用，保持与既有观感一致。 */
const DEFAULT_NODE_RADIUS = 9;


const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
/**
 * 「适配内容」的缩放上限。
 * 小图允许轻微放大填满空白，但放大到数倍会让后续新增节点的坐标跑到可视区外；
 * 因此上限控制在 1.15，更大的放大交给缩放按钮。
 */
const FIT_MAX_ZOOM = 1.15;
/**
 * 「适配内容」的可读缩放下限。
 * 大图若按「装得下」硬缩，字号会小到不可读（13px → 4px）；低于该值时停在 55%
 * 并以根节点为中心，让用户靠平移查看其余内容。
 */
const FIT_MIN_READABLE = 0.55;
const DEFAULT_SIZE = { width: 800, height: 600 };

const containerRef = ref<HTMLElement | null>(null);
const size = ref({ ...DEFAULT_SIZE });

const layout = computed(() => (
  props.document ? computeMindmapLayout(props.document) : null
));

const visibleNodes = computed(() => {
  const current = layout.value?.nodes ?? [];
  if (props.canvasRootVisible !== false) return current;
  return current.filter((node) => node.id !== props.document?.rootTopicId);
});

const visibleEdges = computed(() => {
  const current = layout.value?.edges ?? [];
  if (props.canvasRootVisible !== false) return current;
  const rootId = props.document?.rootTopicId;
  return current.filter((edge) => edge.parentId !== rootId && edge.childId !== rootId);
});

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
  document.addEventListener('pointerdown', onTextMenuOutsidePointerDown);
  document.addEventListener('keydown', onTextMenuGlobalKeydown);
  void nextTick(() => fitView());
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  endPan();
  endNodeDrag();
  document.removeEventListener('pointerdown', onTextMenuOutsidePointerDown);
  document.removeEventListener('keydown', onTextMenuGlobalKeydown);
});

function onTextMenuOutsidePointerDown(event: PointerEvent) {
  if (!textContextMenu.value.visible) return;
  if (event.target instanceof Element && event.target.closest('.mm-text-context-menu')) return;
  closeTextContextMenu();
}

function onTextMenuGlobalKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !textContextMenu.value.visible) return;
  event.preventDefault();
  closeTextContextMenu();
}

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
  if (event.ctrlKey || event.metaKey) {
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomAt(event.clientX, event.clientY, factor);
    return;
  }

  applyViewport({
    x: props.viewport.x - event.deltaX,
    y: props.viewport.y - event.deltaY,
    zoom: props.viewport.zoom,
  });
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

/** 适配内容：整体缩放到容器内并居中（大图保可读下限、以根节点为中心）。 */
function fitView() {
  measureContainer();
  const currentLayout = layout.value;
  if (!currentLayout) return;
  const rootNode = currentLayout.nodes.find((node) => node.side === 'root');
  applyViewport(computeFitViewport(currentLayout.bounds, size.value, 48, {
    min: MIN_ZOOM,
    max: FIT_MAX_ZOOM,
    readableMin: FIT_MIN_READABLE,
  }, rootNode ? { x: rootNode.x, y: rootNode.y } : undefined));
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

function focusTopic(id: string) {
  const node = layout.value?.nodes.find((item) => item.id === id);
  if (!node) return;
  measureContainer();
  const zoom = clampZoom(Math.max(1, props.viewport.zoom));
  applyViewport({
    x: size.value.width / 2 - node.x * zoom,
    y: size.value.height / 2 - node.y * zoom,
    zoom,
  });
}

defineExpose({ fitView, zoomIn, zoomOut, resetView, focusTopic });

/* -------------------------------- 迷你地图 -------------------------------- */

/** 迷你地图画布尺寸（与 Stitch 稿右下角缩略图一致）。 */
const MINIMAP_WIDTH = 168;
const MINIMAP_HEIGHT = 104;
const MINIMAP_PADDING = 8;

/**
 * 迷你地图几何：把整幅导图等比装进缩略框，并算出当前视口在该坐标系中的矩形。
 *
 * 与画布共用同一份 layout.bounds，因此节点位置永远一致；
 * 视口矩形用 viewport.x/y/zoom 反推（屏幕坐标 → 世界坐标）。
 */
const minimap = computed(() => {
  const currentLayout = layout.value;
  if (!currentLayout || currentLayout.nodes.length === 0) return null;
  const bounds = currentLayout.bounds;
  const worldWidth = Math.max(1, bounds.width);
  const worldHeight = Math.max(1, bounds.height);
  const scale = Math.min(
    (MINIMAP_WIDTH - MINIMAP_PADDING * 2) / worldWidth,
    (MINIMAP_HEIGHT - MINIMAP_PADDING * 2) / worldHeight,
  );
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const offsetX = (MINIMAP_WIDTH - worldWidth * scale) / 2 - bounds.minX * scale;
  const offsetY = (MINIMAP_HEIGHT - worldHeight * scale) / 2 - bounds.minY * scale;
  const toMini = (worldX: number, worldY: number) => ({
    x: worldX * scale + offsetX,
    y: worldY * scale + offsetY,
  });
  const nodes = currentLayout.nodes.map((node) => {
    const topLeft = toMini(node.x - node.width / 2, node.y - node.height / 2);
    return {
      id: node.id,
      x: topLeft.x,
      y: topLeft.y,
      width: Math.max(1.5, node.width * scale),
      height: Math.max(1.5, node.height * scale),
      isRoot: node.side === 'root',
      isSelected: node.id === props.selectedId,
    };
  });
  // 当前视口覆盖的世界区域（屏幕 (0,0)-(w,h) 反投影）
  const view = props.viewport;
  const worldLeft = (0 - view.x) / view.zoom;
  const worldTop = (0 - view.y) / view.zoom;
  const worldRight = (size.value.width - view.x) / view.zoom;
  const worldBottom = (size.value.height - view.y) / view.zoom;
  const viewTopLeft = toMini(worldLeft, worldTop);
  return {
    width: MINIMAP_WIDTH,
    height: MINIMAP_HEIGHT,
    nodes,
    viewBox: {
      x: viewTopLeft.x,
      y: viewTopLeft.y,
      width: Math.max(4, (worldRight - worldLeft) * scale),
      height: Math.max(4, (worldBottom - worldTop) * scale),
    },
    scale,
    offsetX,
    offsetY,
  };
});

/** 点击迷你地图：把点击处对应的世界坐标移到画布中心。 */
function onMinimapClick(event: MouseEvent) {
  const map = minimap.value;
  const el = event.currentTarget as HTMLElement | null;
  if (!map || !el) return;
  const rect = el.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  const worldX = (localX - map.offsetX) / map.scale;
  const worldY = (localY - map.offsetY) / map.scale;
  measureContainer();
  applyViewport({
    x: size.value.width / 2 - worldX * props.viewport.zoom,
    y: size.value.height / 2 - worldY * props.viewport.zoom,
    zoom: props.viewport.zoom,
  });
}

/* --------------------------------- 平移 --------------------------------- */

interface PanState {
  pointerId: number;
  startX: number;
  startY: number;
  origin: MindmapViewport;
  moved: boolean;
}
let panState: PanState | null = null;
/** 平移进行中（用于把光标切换为 grabbing）。 */
const isPanning = ref(false);

/**
 * 判断事件目标是否属于「不可平移」的交互元素。
 *
 * 关键点：平移监听挂在容器上，而容器内部被 `<svg>` 铺满，所以不能用
 * `@pointerdown.self`（那样永远不会触发）。改为在容器上监听后，
 * 这里显式排除节点、折叠钮、内联编辑器等需要自己处理指针的元素。
 */
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('.mm-node, .mm-toggle, .mm-edge-hit, .mm-relation, .mm-inline-editor, .mm-context-menu, .mm-text-style-toolbar, .mm-text-context-menu, .mm-minimap'));
}

function onBackgroundPointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  if (props.editingId) return;
  if (isInteractiveTarget(event.target)) return;
  (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  panState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    origin: { ...props.viewport },
    moved: false,
  };
  isPanning.value = true;
  window.addEventListener('pointermove', onPanPointerMove);
  window.addEventListener('pointerup', onPanPointerUp, { once: true });
  window.addEventListener('pointercancel', endPan, { once: true });
}

function onPanPointerMove(event: PointerEvent) {
  if (!panState) return;
  const dx = event.clientX - panState.startX;
  const dy = event.clientY - panState.startY;
  if (Math.hypot(dx, dy) >= 5) panState.moved = true;
  applyViewport({
    x: panState.origin.x + dx,
    y: panState.origin.y + dy,
    zoom: panState.origin.zoom,
  });
}

function onPanPointerUp(event: PointerEvent) {
  const samePointer = panState && (event.pointerId === undefined || event.pointerId === panState.pointerId);
  if (panState && samePointer && !panState.moved
    && Math.hypot(event.clientX - panState.startX, event.clientY - panState.startY) < 5) {
    emit('style-target', { kind: 'canvas' });
  }
  endPan();
}

function endPan() {
  panState = null;
  isPanning.value = false;
  window.removeEventListener('pointermove', onPanPointerMove);
  window.removeEventListener('pointerup', onPanPointerUp);
  window.removeEventListener('pointercancel', endPan);
}

/* ------------------------------ 节点拖放 ------------------------------- */

/** 进入拖拽的最小位移（px）；小于该阈值仍视为「点击」。 */
const DRAG_THRESHOLD = 5;
/** 拖拽结束后抑制 click 的时间窗（避免误选中）。 */
const DRAG_CLICK_SUPPRESS_MS = 300;

interface NodeDragState {
  id: string;
  startX: number;
  startY: number;
  moved: boolean;
}
let nodeDrag: NodeDragState | null = null;
const draggingId = ref<string | null>(null);
const dragOverId = ref<string | null>(null);
const dragOverPosition = ref<'before' | 'after' | null>(null);
const dragOffset = ref({ x: 0, y: 0 });
const dragInsertion = computed(() => {
  if (!dragOverId.value || !dragOverPosition.value) return null;
  const target = layout.value?.nodes.find((node) => node.id === dragOverId.value);
  if (!target) return null;
  if (layout.value?.mode === 'org') {
    const x = target.x + (dragOverPosition.value === 'before' ? -1 : 1) * (target.width / 2 + 8);
    return { x1: x, y1: target.y - target.height / 2 - 5, x2: x, y2: target.y + target.height / 2 + 5 };
  }
  const y = target.y + (dragOverPosition.value === 'before' ? -1 : 1) * (target.height / 2 + 8);
  return { x1: target.x - target.width / 2 - 5, y1: y, x2: target.x + target.width / 2 + 5, y2: y };
});
/** 在该时间点之前到达的 click 一律忽略（拖拽收尾）。 */
let suppressClickUntil = 0;

/** 拖拽期间禁止页面文本选中，收尾时恢复。 */
function setBodyDragging(active: boolean) {
  if (typeof document === 'undefined') return;
  document.body.classList.toggle('mm-node-dragging', active);
}

function onNodePointerDown(node: MindmapNodeBox, event: PointerEvent) {
  if (event.button !== 0) return;
  if (props.editingId) return;
  // 折叠按钮与输入框自行处理
  const target = event.target as HTMLElement | SVGElement | null;
  if (target && typeof (target as Element).closest === 'function'
    && (target as Element).closest('.mm-toggle')) {
    return;
  }
  (event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId);
  nodeDrag = { id: node.id, startX: event.clientX, startY: event.clientY, moved: false };
  window.addEventListener('pointermove', onNodePointerMove);
  window.addEventListener('pointerup', onNodePointerUp, { once: true });
  window.addEventListener('pointercancel', endNodeDrag, { once: true });
}

function onNodePointerMove(event: PointerEvent) {
  if (!nodeDrag) return;
  const dx = event.clientX - nodeDrag.startX;
  const dy = event.clientY - nodeDrag.startY;
  if (!nodeDrag.moved) {
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    nodeDrag.moved = true;
    draggingId.value = nodeDrag.id;
    setBodyDragging(true);
  }
  dragOffset.value = {
    x: dx / props.viewport.zoom,
    y: dy / props.viewport.zoom,
  };
  const targetId = hitTestNode(event.clientX, event.clientY, nodeDrag.id);
  dragOverId.value = targetId;
  dragOverPosition.value = targetId && isSameParent(nodeDrag.id, targetId)
    ? getDropPosition(targetId, event.clientX, event.clientY)
    : null;
}

function onNodePointerUp() {
  const drag = nodeDrag;
  const targetId = dragOverId.value;
  const position = dragOverPosition.value;
  endNodeDrag();
  if (!drag || !drag.moved) return;
  // 拖拽收尾时抑制紧随其后的 click，避免「拖完就选中」的误操作
  suppressClickUntil = Date.now() + DRAG_CLICK_SUPPRESS_MS;
  if (targetId && targetId !== drag.id) {
    if (position) emit('move', drag.id, targetId, position);
    else emit('move', drag.id, targetId);
  }
}

function isSameParent(sourceId: string, targetId: string): boolean {
  return Boolean(
    props.document?.topics[sourceId]
    && props.document.topics[sourceId]?.parentId === props.document.topics[targetId]?.parentId,
  );
}

function getDropPosition(targetId: string, clientX: number, clientY: number): 'before' | 'after' | null {
  const target = layout.value?.nodes.find((node) => node.id === targetId);
  const rect = containerRef.value?.getBoundingClientRect();
  if (!target || !rect) return 'after';
  const localX = (clientX - rect.left - props.viewport.x) / props.viewport.zoom;
  const localY = (clientY - rect.top - props.viewport.y) / props.viewport.zoom;
  const isOrg = layout.value?.mode === 'org';
  const coordinate = isOrg ? localX - target.x : localY - target.y;
  const extent = (isOrg ? target.width : target.height) / 2;
  const edgeZone = extent * 0.35;
  if (coordinate < -edgeZone) return 'before';
  if (coordinate > edgeZone) return 'after';
  return null;
}

function endNodeDrag() {
  nodeDrag = null;
  draggingId.value = null;
  dragOverId.value = null;
  dragOverPosition.value = null;
  dragOffset.value = { x: 0, y: 0 };
  setBodyDragging(false);
  window.removeEventListener('pointermove', onNodePointerMove);
  window.removeEventListener('pointerup', onNodePointerUp);
  window.removeEventListener('pointercancel', endNodeDrag);
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
  // 拖拽刚结束时浏览器仍会派发 click：这里按时间窗丢弃一次，避免误选中
  if (Date.now() <= suppressClickUntil) {
    suppressClickUntil = 0;
    return;
  }
  emit('select', node.id);
  emit('style-target', { kind: 'topic', topicId: node.id });
}

/* ------------------------------ 右键菜单事件 ------------------------------ */

/**
 * 画布右键：几何命中节点则 nodeId 为其 id，否则为 null（空白菜单）。
 *
 * 内联编辑器里保留原生右键菜单（方便复制粘贴），其余位置一律 preventDefault。
 */
function onCanvasContextMenu(event: MouseEvent) {
  const target = event.target;
  if (target instanceof Element && target.closest('.mm-inline-editor')) return;
  closeTextContextMenu();
  event.preventDefault();
  emit('contextmenu', {
    nodeId: hitTestNode(event.clientX, event.clientY),
    clientX: event.clientX,
    clientY: event.clientY,
  });
}

function onInlineEditorContextMenu(event: MouseEvent) {
  if (!openTextContextMenu(event)) {
    closeTextContextMenu();
  }
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

const editingTextarea = ref<HTMLTextAreaElement | null>(null);
const textSelection = ref({ start: 0, end: 0 });
const domTextSelection = ref({ start: 0, end: 0 });
const lastNonEmptyTextSelection = ref<{ text: { start: number; end: number }; dom: { start: number; end: number } } | null>(null);
const textContextMenu = ref<{ visible: boolean; x: number; y: number; status: string }>({ visible: false, x: 0, y: 0, status: '' });
let pendingRenameCommit: ReturnType<typeof setTimeout> | undefined;
let colorPickerOpen = false;
let colorPickerTimeout: ReturnType<typeof setTimeout> | undefined;

function captureTextSelection() {
  const target = editingTextarea.value;
  if (!target) return;
  textSelection.value = {
    start: Array.from(target.value.slice(0, target.selectionStart ?? 0)).length,
    end: Array.from(target.value.slice(0, target.selectionEnd ?? 0)).length,
  };
  domTextSelection.value = { start: target.selectionStart ?? 0, end: target.selectionEnd ?? 0 };
  if (textSelection.value.end > textSelection.value.start) {
    lastNonEmptyTextSelection.value = {
      text: { ...textSelection.value },
      dom: { ...domTextSelection.value },
    };
  }
}

const hasTextSelection = computed(() => textSelection.value.end > textSelection.value.start);

const textToolbarPosition = computed(() => {
  const box = editingBox.value;
  const canvas = containerRef.value;
  if (!box || !canvas) return { left: `${box?.left ?? 0}px`, top: `${Math.max(4, (box?.top ?? 48) - 48)}px` };
  const maxLeft = Math.max(4, canvas.clientWidth - 250);
  const left = Math.min(Math.max(4, box.left), maxLeft);
  const above = box.top - 48;
  const top = above >= 4 ? above : Math.min(canvas.clientHeight - 48, box.top + box.height + 6);
  return { left: `${left}px`, top: `${Math.max(4, top)}px` };
});

function closeTextContextMenu() {
  textContextMenu.value = { ...textContextMenu.value, visible: false, status: '' };
}

function openTextContextMenu(event: MouseEvent) {
  const target = editingTextarea.value;
  const canvas = containerRef.value;
  if (!target || !canvas) return false;
  if (hasTextSelection.value) {
    lastNonEmptyTextSelection.value = {
      text: { ...textSelection.value },
      dom: { ...domTextSelection.value },
    };
  } else if (lastNonEmptyTextSelection.value) {
    textSelection.value = { ...lastNonEmptyTextSelection.value.text };
    domTextSelection.value = { ...lastNonEmptyTextSelection.value.dom };
  }
  if (!hasTextSelection.value) return false;
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const width = 196;
  const height = 242;
  textContextMenu.value = {
    visible: true,
    x: Math.max(4, Math.min(event.clientX - rect.left, canvas.clientWidth - width - 4)),
    y: Math.max(4, Math.min(event.clientY - rect.top, canvas.clientHeight - height - 4)),
    status: '',
  };
  return true;
}

async function runTextContextAction(action: 'cut' | 'copy' | 'paste' | 'paste-plain' | 'select-all') {
  const target = editingTextarea.value;
  if (!target) return;
  target.focus();
  target.setSelectionRange(domTextSelection.value.start, domTextSelection.value.end);
  try {
    if (action === 'select-all') {
      target.select();
      captureTextSelection();
      closeTextContextMenu();
      return;
    }
    if (action === 'copy' || action === 'cut') {
      const selected = target.value.slice(domTextSelection.value.start, domTextSelection.value.end);
      await navigator.clipboard.writeText(selected);
      if (action === 'cut') {
        const nextValue = `${target.value.slice(0, domTextSelection.value.start)}${target.value.slice(domTextSelection.value.end)}`;
        emit('update:editing-text', nextValue);
        target.value = nextValue;
        target.setSelectionRange(domTextSelection.value.start, domTextSelection.value.start);
        captureTextSelection();
      }
    } else {
      const pasted = await navigator.clipboard.readText();
      const start = domTextSelection.value.start;
      const end = domTextSelection.value.end;
      const nextValue = `${target.value.slice(0, start)}${pasted}${target.value.slice(end)}`;
      emit('update:editing-text', nextValue);
      target.value = nextValue;
      const caret = start + pasted.length;
      target.setSelectionRange(caret, caret);
      captureTextSelection();
    }
    closeTextContextMenu();
  } catch {
    textContextMenu.value.status = '剪贴板不可用，请检查系统权限或使用快捷键';
  }
}

function applyTextStyle(patch: { color?: string | null; background?: string | null }) {
  colorPickerOpen = false;
  if (colorPickerTimeout) clearTimeout(colorPickerTimeout);
  if (pendingRenameCommit) clearTimeout(pendingRenameCommit);
  const { start, end } = textSelection.value;
  if (end <= start) return;
  emit('apply-text-style', { start, end, ...patch });
  requestAnimationFrame(() => {
    const target = editingTextarea.value;
    if (!target) return;
    target.focus();
    target.setSelectionRange(domTextSelection.value.start, domTextSelection.value.end);
  });
}

function onEditingInput(event: Event) {
  const target = event.target as HTMLTextAreaElement | null;
  emit('update:editing-text', target?.value ?? '');
  captureTextSelection();
}

function commitRename() {
  if (pendingRenameCommit) clearTimeout(pendingRenameCommit);
  emit('commit-rename', props.editingText);
}

function deferRenameCommit() {
  if (pendingRenameCommit) clearTimeout(pendingRenameCommit);
  pendingRenameCommit = setTimeout(() => {
    pendingRenameCommit = undefined;
    commitRename();
  }, 300);
}

function onEditingBlur(event: FocusEvent) {
  if (colorPickerOpen) return;
  const next = event.relatedTarget;
  if (next instanceof Element && next.closest('.mm-text-style-toolbar')) return;
  deferRenameCommit();
}

function onToolbarPointerDown(event: PointerEvent) {
  captureTextSelection();
  if (!(event.target instanceof HTMLInputElement) || event.target.type !== 'color') return;
  colorPickerOpen = true;
  if (colorPickerTimeout) clearTimeout(colorPickerTimeout);
  colorPickerTimeout = setTimeout(() => { colorPickerOpen = false; }, 15000);
}

function onEditingKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && textContextMenu.value.visible) {
    event.preventDefault();
    closeTextContextMenu();
    return;
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    commitRename();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    emit('cancel-rename');
  }
}

/* ------------------------------ 派生：文本 ------------------------------- */

function toggleOffsetX(node: MindmapNodeBox): number {
  return node.side === 'left' ? -node.width / 2 - 10 : node.width / 2 + 10;
}

/** 节点的行高：按「基础行高 / 基础字号」比例缩放，保证层级字号不同但行距观感一致。 */
function nodeLineHeight(node: MindmapNodeBox): number {
  const baseFont = layout.value?.options.fontSize ?? fontSize.value;
  const baseLine = layout.value?.options.lineHeight ?? lineHeight.value;
  return Math.round((baseLine / baseFont) * node.fontSize);
}

/** 多行文本的基线位置：以节点中心为原点上下均分。 */
function nodeLineBaselineY(node: MindmapNodeBox, index: number): number {
  const total = node.lines.length;
  return (index - (total - 1) / 2) * nodeLineHeight(node) + node.fontSize * 0.35;
}

function styledLineSegments(node: MindmapNodeBox, line: string, index: number) {
  const topic = props.document?.topics[node.id];
  const offsets = getMindmapLineOffsets(topic?.text ?? '', node.lines);
  return segmentMindmapTextLine(line, offsets[index] ?? 0, topic?.textStyles);
}

function styledBackgrounds(node: MindmapNodeBox, line: string, index: number) {
  const segments = styledLineSegments(node, line, index);
  const total = segments.reduce((sum, segment) => sum + measureTextWidth(segment.text, node.fontSize), 0);
  let x = -total / 2;
  const baseline = nodeLineBaselineY(node, index);
  return segments.map((segment) => {
    const width = measureTextWidth(segment.text, node.fontSize);
    const result = {
      x,
      y: baseline - node.fontSize * 0.84,
      width,
      height: node.fontSize * 1.12,
      background: segment.background,
    };
    x += width;
    return result;
  });
}

/* ------------------------------ 派生：主题 ------------------------------- */

/** 当前主题 id（缺失时按 default 处理）。 */
const themeId = computed(() => props.document?.themeId ?? DEFAULT_MINDMAP_THEME_ID);

/** 当前解析后的主题对象（未知 id 回退 default）。 */
const activeTheme = computed(() => resolveMindmapTheme(themeId.value));

/** 是否启用「彩虹」按分支上色模式。 */
const isRainbow = computed(() => isRainbowTheme(activeTheme.value));

/**
 * 主题强调色（选中态、关系线、标记徽章边框）。
 *
 * `--mindmap-accent` 只在「已选择非默认主题」时由 canvasThemeStyle 注入；
 * default（或未知 id）没有内联变量，于是回落到 Tau token --accent-brand，
 * 从而跟随明暗主题 / 皮肤自动变色——不再写死 #4a90e2。
 */
const THEME_ACCENT = 'var(--mindmap-accent, var(--accent-brand))';

/**
 * 画布根节点的内联 CSS 变量。
 *
 * 仅在「已选择非默认主题」时输出：default（或未设置）时保持为空对象，
 * 完全沿用既有 CSS 与暗色模式变量，确保未选主题时随主题自适应。
 * 彩虹主题只注入强调色/标记配色，节点填充与连线交给逐项上色逻辑。
 */
const canvasThemeStyle = computed<Record<string, string>>(() => {
  if (!isMindmapThemeId(themeId.value)) return {};
  if (themeId.value === DEFAULT_MINDMAP_THEME_ID) return {};
  return mindmapThemeCanvasVariables(activeTheme.value);
});

/* --------------------------- 彩虹主题：分支配色表 --------------------------- */

/**
 * 节点 id → 所属一级分支的序号。
 *
 * 算法（O(n)）：
 * 1. 分支序号按**文档中子节点的声明顺序**（`root.childIds`）编号，
 *    与布局模式、折叠状态无关，切换导图/逻辑图/树形/组织图时分支颜色稳定；
 * 2. 沿 `document.topics[*].childIds` 递归，把序号继承给该分支全部后代；
 * 3. 根节点没有分支归属（不写入映射）。
 *
 * 不修改布局产物、不参与文档历史，只是渲染层的纯派生数据。
 */
const branchIndexOfNode = computed<Map<string, number>>(() => {
  const map = new Map<string, number>();
  const doc = props.document;
  if (!doc || !isRainbow.value) return map;
  const rootTopic = doc.topics[doc.rootTopicId];
  if (!rootTopic) return map;

  const assignBranch = (topicId: string, index: number): void => {
    const topic = doc.topics[topicId];
    if (!topic) return;
    map.set(topicId, index);
    for (const childId of topic.childIds ?? []) assignBranch(childId, index);
  };

  (rootTopic.childIds ?? []).forEach((childId, index) => assignBranch(childId, index));
  return map;
});

/** 节点所属分支主色；非彩虹主题或根节点返回 null（回退单色）。 */
function branchColorOf(nodeId: string): string | null {
  if (!isRainbow.value) return null;
  const index = branchIndexOfNode.value.get(nodeId);
  if (index === undefined) return null;
  return rainbowBranchColor(activeTheme.value, index);
}

/** 连线颜色：取子节点所属分支色；非彩虹主题返回 null（回退 CSS 单色）。 */
function edgeColorOf(childId: string): string | null {
  return branchColorOf(childId);
}

function edgeStyleOf(edge: { childId: string }): Record<string, string> {
  const style = props.document?.topics[edge.childId]?.style;
  const color = style?.edgeColor || edgeColorOf(edge.childId);
  return {
    ...(color ? { stroke: color } : {}),
    ...(style?.edgeWidth ? { strokeWidth: style.edgeWidth } : {}),
    ...(style?.edgeStyle === 'dashed' ? { strokeDasharray: '6 4' } : {}),
    ...(style?.edgeStyle === 'dotted' ? { strokeDasharray: '1 4', strokeLinecap: 'round' } : {}),
    ...(style?.edgeStartArrow === 'arrow' ? { markerStart: 'url(#mm-line-arrow)' } : {}),
    ...(style?.edgeEndArrow === 'arrow' ? { markerEnd: 'url(#mm-line-arrow)' } : {}),
  };
}

/** 节点承载的分支色（以 CSS 变量形式下发给子元素，便于纯 CSS 派生描边/圆点）。 */
function nodeBranchStyle(nodeId: string): Record<string, string> {
  const color = branchColorOf(nodeId);
  return color ? { '--mm-hue': color } : {};
}

function nodeDragStyle(nodeId: string): Record<string, string> {
  return {
    ...nodeBranchStyle(nodeId),
    ...(nodeId === draggingId.value ? { transition: 'none' } : {}),
  };
}

/** 节点边缘圆点：落在「连线接入的那条边」的中点，作为分支色锚点。 */
function branchDotX(node: MindmapNodeBox): number {
  return node.side === 'left' ? -node.width / 2 + 3 : node.width / 2 - 3;
}

/* ------------------------------ 派生：节点样式 ------------------------------- */

function topicStyle(id: string): MindMapTopicStyle | undefined {
  return props.document?.topics[id]?.style;
}

/** 节点矩形内联样式：仅当节点声明了 fill 时覆盖（其余交给主题 CSS 变量）。 */
function nodeRectStyle(node: MindmapNodeBox): Record<string, string> {
  const style = topicStyle(node.id);
  return {
    ...(style?.fill ? { fill: style.fill } : {}),
    ...(style?.borderColor ? { stroke: style.borderColor } : {}),
    ...(style?.borderWidth ? { strokeWidth: style.borderWidth } : {}),
  };
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
  lineStyle: 'solid' | 'dashed' | 'dotted';
  startArrow: boolean;
  endArrow: boolean;
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
  const color = THEME_ACCENT;
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
      lineStyle: relation.lineStyle ?? 'dashed',
      startArrow: relation.startArrow === 'arrow',
      endArrow: relation.endArrow !== 'none',
    });
  }
  return result;
});

/** 标记徽章配色：随主题变量走，default 主题回落到 Tau token。 */
const MARKER_BADGE_FILL = 'var(--mindmap-marker-bg, var(--surface-active))';
const MARKER_BADGE_TEXT = 'var(--mindmap-marker-text, var(--text-primary))';

/* --------------------------- 边界 / 概要（UX-2） --------------------------- */

/** 边界 / 概要的默认颜色：跟随主题强调色，default 主题回落到 Tau token。 */
const OVERLAY_ACCENT = THEME_ACCENT;

/** 渲染用边界：颜色已回退到主题强调色，模板里不再做分支判断。 */
interface RenderedBoundary {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  color: string;
}

const renderedBoundaries = computed<RenderedBoundary[]>(() => (
  (layout.value?.boundaries ?? []).map((boundary) => ({
    id: boundary.id,
    x: boundary.x,
    y: boundary.y,
    width: boundary.width,
    height: boundary.height,
    label: boundary.label,
    color: boundary.color || OVERLAY_ACCENT,
  }))
));

/** 渲染用概要：括线路径与文字位置在这里一次算好。 */
interface RenderedSummary {
  id: string;
  text: string;
  bracketPath: string;
  textX: number;
  textY: number;
  textAnchor: 'start' | 'middle' | 'end';
}

/**
 * 括线路径。
 *
 * - 水平布局：竖线位于子节点范围外侧，两端向内容方向各折 6px（形如「[」「]」）；
 * - org 布局：横线位于子节点范围下方，两端向上折 6px。
 */
function summaryBracketPath(summary: MindmapSummaryBox): string {
  if (summary.side === 'bottom') {
    const y = summary.y;
    return `M ${round1(summary.x)} ${round1(y - 6)} V ${round1(y)}`
      + ` H ${round1(summary.x + summary.width)} V ${round1(y - 6)}`;
  }
  // 右侧括线在框的左边缘，折向内容（左）；左侧括线在框的右边缘，折向内容（右）
  const bracketX = summary.side === 'left' ? summary.x + summary.width : summary.x;
  const direction = summary.side === 'left' ? 1 : -1;
  const tick = round1(bracketX + direction * 6);
  return `M ${tick} ${round1(summary.y)} H ${round1(bracketX)}`
    + ` V ${round1(summary.y + summary.height)} H ${tick}`;
}

/** 概要文字位置与对齐方式（与布局给出的框保持同一套几何）。 */
function summaryTextPosition(
  summary: MindmapSummaryBox,
): { textX: number; textY: number; textAnchor: 'start' | 'middle' | 'end' } {
  if (summary.side === 'bottom') {
    return {
      textX: round1(summary.x + summary.width / 2),
      // 文字落在括线下方一档（与布局给出的 16px 文字高度对齐）
      textY: round1(summary.y + 10),
      textAnchor: 'middle',
    };
  }
  if (summary.side === 'left') {
    return {
      textX: round1(summary.x + summary.width - 6),
      textY: round1(summary.y + summary.height / 2),
      textAnchor: 'end',
    };
  }
  return {
    textX: round1(summary.x + 6),
    textY: round1(summary.y + summary.height / 2),
    textAnchor: 'start',
  };
}

const renderedSummaries = computed<RenderedSummary[]>(() => (
  (layout.value?.summaries ?? []).map((summary) => ({
    id: summary.id,
    text: summary.text,
    bracketPath: summaryBracketPath(summary),
    ...summaryTextPosition(summary),
  }))
));

/* 文档切换后等布局和容器尺寸就绪再适配，避免首帧把根节点留在画布外。 */
let pendingFitRootId: string | null = null;
let fittedRootId: string | null = null;
watch(
  () => [
    props.document?.rootTopicId ?? null,
    layout.value?.nodes.length ?? 0,
    size.value.width,
    size.value.height,
  ] as const,
  async ([rootId, nodeCount, width, height]) => {
    if (rootId !== fittedRootId) {
      pendingFitRootId = rootId;
    }
    if (!rootId || pendingFitRootId !== rootId || nodeCount === 0 || width <= 0 || height <= 0) return;
    await nextTick();
    if (pendingFitRootId !== rootId) return;
    fitView();
    fittedRootId = rootId;
    pendingFitRootId = null;
  },
  { immediate: true },
);
</script>

<template>
  <div
    ref="containerRef"
    class="mindmap-canvas"
    :class="{ 'is-panning': isPanning, 'is-grid-hidden': props.canvasGridVisible === false }"
    data-testid="mindmap-canvas"
    :data-theme-id="themeId"
    :style="{ ...canvasThemeStyle, ...(props.canvasBackground ? { backgroundColor: props.canvasBackground } : {}) }"
    @wheel="onWheel"
    @pointerdown="onBackgroundPointerDown"
    @contextmenu="onCanvasContextMenu"
  >
    <svg
      v-if="layout"
      class="mm-svg"
      :width="size.width"
      :height="size.height"
      role="group"
      aria-label="思维导图画布"
    >
      <!-- 连接线和关系线共用箭头标记。 -->
      <defs>
        <marker
          id="mm-line-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" :style="{ fill: THEME_ACCENT }" />
        </marker>
      </defs>
      <g :transform="`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`">
        <!--
          边界（UX-2）：半透明圆角框 + 虚线描边 + 左上角标签。
          绘制在连线与节点之下（最底层），且 pointer-events: none，不干扰命中。
        -->
        <g
          v-for="boundary in renderedBoundaries"
          :key="`boundary-${boundary.id}`"
          class="mm-boundary"
          data-testid="mm-boundary"
          :data-boundary-id="boundary.id"
        >
          <rect
            class="mm-boundary-box"
            :x="boundary.x"
            :y="boundary.y"
            :width="boundary.width"
            :height="boundary.height"
            rx="10"
            :style="{ fill: boundary.color, stroke: boundary.color }"
          />
          <text
            v-if="boundary.label"
            class="mm-boundary-label"
            :x="boundary.x + 8"
            :y="boundary.y + 14"
            :style="{ fill: boundary.color }"
          >{{ boundary.label }}</text>
        </g>

        <!-- 概要（UX-2）：子节点范围的括线 + 文本，同样不参与命中 -->
        <g
          v-for="summary in renderedSummaries"
          :key="`summary-${summary.id}`"
          class="mm-summary"
          data-testid="mm-summary"
          :data-summary-id="summary.id"
        >
          <path
            class="mm-summary-bracket"
            :d="summary.bracketPath"
            fill="none"
            :style="{ stroke: OVERLAY_ACCENT }"
          />
          <text
            class="mm-summary-text"
            :x="summary.textX"
            :y="summary.textY"
            :text-anchor="summary.textAnchor"
            dominant-baseline="middle"
            :style="{ fill: OVERLAY_ACCENT }"
          >{{ summary.text }}</text>
        </g>

        <!--
          连线路径完全由布局服务生成，画布不假设方向：
          edge.orientation 只用于样式与测试标记（org 为 vertical，其余 horizontal）。
        -->
        <g
          v-for="edge in visibleEdges"
          :key="edge.id"
        >
          <path class="mm-edge" :class="{ 'mm-edge--vertical': edge.orientation === 'vertical', 'mm-edge--rainbow': isRainbow }"
            :data-orientation="edge.orientation" :data-edge-id="edge.id" :d="edge.path" fill="none" :style="edgeStyleOf(edge)" />
          <path class="mm-edge-hit" :d="edge.path" fill="none" @pointerdown.stop
            @click.stop="emit('style-target', { kind: 'edge', childId: edge.childId })" />
        </g>

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
          @pointerdown.stop
          @click.stop="emit('style-target', { kind: 'relation', relationId: relation.id })"
        >
          <path class="mm-edge-hit" :d="relation.path" fill="none" />
          <path
            class="mm-relation-path"
            :d="relation.path"
            fill="none"
            :stroke-dasharray="relation.lineStyle === 'dashed' ? '6 4' : relation.lineStyle === 'dotted' ? '1 4' : undefined"
            :stroke-linecap="relation.lineStyle === 'dotted' ? 'round' : undefined"
            :marker-start="relation.startArrow ? 'url(#mm-line-arrow)' : undefined"
            :marker-end="relation.endArrow ? 'url(#mm-line-arrow)' : undefined"
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
          v-for="node in visibleNodes"
          :key="node.id"
          class="mm-node"
          :class="{
            'is-selected': node.id === selectedId,
            'is-relation-start': node.id === relationStartId,
            'is-relation-pick-mode': canvasTool === 'relation',
            'is-root': node.side === 'root',
            'is-collapsed': node.collapsed,
            'is-drag-over': node.id === dragOverId,
            'is-dragging': node.id === draggingId,
          }"
          :data-node-id="node.id"
          :data-selected="node.id === selectedId ? 'true' : 'false'"
          :aria-selected="node.id === selectedId"
          :transform="`translate(${node.x + (node.id === draggingId ? dragOffset.x : 0)} ${node.y + (node.id === draggingId ? dragOffset.y : 0)})`"
          :style="nodeDragStyle(node.id)"
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
          <rect
            v-if="node.id === selectedId"
            class="mm-node-selection-ring"
            :x="-node.width / 2 - 4"
            :y="-node.height / 2 - 4"
            :width="node.width + 8"
            :height="node.height + 8"
            :rx="nodeRx(node) + 3"
          />
          <!-- 彩虹主题：分支色锚点圆点，落在连线接入的那条边中点 -->
          <circle
            v-if="branchColorOf(node.id)"
            class="mm-branch-dot"
            :class="node.depth === 1 ? 'mm-branch-dot--l1' : 'mm-branch-dot--leaf'"
            :cx="branchDotX(node)"
            cy="0"
            :r="node.depth === 1 ? 3 : 2.5"
            :style="{ fill: 'var(--mm-hue)' }"
          />
          <g class="mm-node-text-highlights" pointer-events="none">
            <template v-for="(line, index) in node.lines" :key="`highlight-${index}`">
              <rect
                v-for="(segment, segmentIndex) in styledBackgrounds(node, line, index)"
                :key="`highlight-${index}-${segmentIndex}`"
                v-show="segment.background"
                :x="segment.x"
                :y="segment.y"
                :width="segment.width"
                :height="segment.height"
                rx="2"
                :fill="segment.background"
              />
            </template>
          </g>
          <text
            class="mm-node-text"
            text-anchor="middle"
            :style="{ fontSize: `${node.fontSize}px`, ...nodeTextStyle(node) }"
          >
            <tspan
              v-for="(line, index) in node.lines"
              :key="index"
              :x="0"
              :y="nodeLineBaselineY(node, index)"
            ><tspan
              v-for="(segment, segmentIndex) in styledLineSegments(node, line, index)"
              :key="`${index}-${segmentIndex}`"
              :fill="segment.color || undefined"
            >{{ segment.text }}</tspan></tspan>
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
                :style="{ fill: MARKER_BADGE_FILL, stroke: THEME_ACCENT }"
              />
              <text
                :x="MARKER_BADGE_SIZE / 2"
                :y="MARKER_BADGE_SIZE - 4"
                text-anchor="middle"
                :style="{ fill: MARKER_BADGE_TEXT }"
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
      <line
        v-if="dragInsertion"
        class="mm-drop-insertion"
        :x1="viewport.x + dragInsertion.x1 * viewport.zoom"
        :y1="viewport.y + dragInsertion.y1 * viewport.zoom"
        :x2="viewport.x + dragInsertion.x2 * viewport.zoom"
        :y2="viewport.y + dragInsertion.y2 * viewport.zoom"
        data-testid="mm-drop-insertion"
      />
    </svg>

    <!-- 迷你地图（Stitch 稿右下角缩略导航）：只读全图 + 当前视口矩形，点击跳转 -->
    <div
      v-if="minimap"
      class="mm-minimap"
      data-testid="mm-minimap"
      role="group"
      aria-label="迷你地图"
      :title="'迷你地图：点击跳转到对应区域'"
      @mousedown.stop
      @click.stop="onMinimapClick"
    >
      <svg :width="minimap.width" :height="minimap.height" :viewBox="`0 0 ${minimap.width} ${minimap.height}`">
        <rect
          v-for="node in minimap.nodes"
          :key="node.id"
          :x="node.x"
          :y="node.y"
          :width="node.width"
          :height="node.height"
          rx="1.5"
          :class="{
            'mm-minimap-node': true,
            'is-root': node.isRoot,
            'is-selected': node.isSelected,
          }"
        />
        <rect
          class="mm-minimap-view"
          :x="minimap.viewBox.x"
          :y="minimap.viewBox.y"
          :width="minimap.viewBox.width"
          :height="minimap.viewBox.height"
          rx="3"
        />
      </svg>
    </div>

    <div v-if="editingBox && hasTextSelection" class="mm-text-style-toolbar" :style="textToolbarPosition" role="toolbar" aria-label="文字颜色与高亮" @pointerdown="onToolbarPointerDown">
      <label title="文字颜色">字
        <input type="color" data-testid="mm-text-color" @input="applyTextStyle({ color: ($event.target as HTMLInputElement).value })">
      </label>
      <label title="背景高亮">底
        <input type="color" data-testid="mm-text-background" @input="applyTextStyle({ background: ($event.target as HTMLInputElement).value })">
      </label>
      <button type="button" title="清除文字颜色" data-testid="mm-text-color-clear" @click="applyTextStyle({ color: null })">A</button>
      <button type="button" title="清除背景高亮" data-testid="mm-text-background-clear" @click="applyTextStyle({ background: null })">□</button>
    </div>
    <textarea
      v-if="editingBox"
      ref="editingTextarea"
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
      @contextmenu="onInlineEditorContextMenu"
      @select="captureTextSelection"
      @keyup="captureTextSelection"
      @mouseup="captureTextSelection"
      @keydown.stop="onEditingKeydown"
      @blur="onEditingBlur"
    ></textarea>
    <div
      v-if="textContextMenu.visible"
      class="mm-text-context-menu"
      data-testid="mm-text-context-menu"
      role="menu"
      aria-label="文本编辑菜单"
      :style="{ left: `${textContextMenu.x}px`, top: `${textContextMenu.y}px` }"
      @pointerdown.prevent
    >
      <button type="button" role="menuitem" @click="runTextContextAction('cut')">剪切 <kbd>Ctrl+X</kbd></button>
      <button type="button" role="menuitem" @click="runTextContextAction('copy')">复制 <kbd>Ctrl+C</kbd></button>
      <button type="button" role="menuitem" @click="runTextContextAction('paste')">粘贴 <kbd>Ctrl+V</kbd></button>
      <button type="button" role="menuitem" @click="runTextContextAction('paste-plain')">粘贴为纯文本</button>
      <button type="button" role="menuitem" @click="runTextContextAction('select-all')">全选 <kbd>Ctrl+A</kbd></button>
      <p v-if="textContextMenu.status" role="status">{{ textContextMenu.status }}</p>
    </div>
  </div>
</template>

<style scoped>
/*
 * 配色一律使用 Tau 主题 token（frontend/src/assets/workbench-theme.css）：
 * - 画布底色 --bg-app；节点/徽章等「浮起」元素 --panel-elevated / --panel-base
 * - 边框 --border-soft / --border-strong；文字 --text-primary / --text-secondary
 * - 强调 --accent-brand；状态 --state-success / --state-danger
 * 主题模板（ocean/forest/sunset）通过内联 --mindmap-* 变量覆盖这些回退值，
 * default 主题不注入任何内联变量，因此整套观感随明暗主题自动切换。
 */
.mm-minimap {
  position: absolute;
  right: 14px;
  bottom: 14px;
  z-index: 4;
  padding: 4px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: color-mix(in srgb, var(--panel-base) 92%, transparent);
  box-shadow: var(--shadow-soft);
  cursor: pointer;
  opacity: 0.92;
  transition: opacity 120ms ease;
}
.mm-minimap:hover { opacity: 1; }
.mm-minimap svg { display: block; }
.mm-minimap-node {
  fill: color-mix(in srgb, var(--text-muted) 46%, transparent);
}
.mm-minimap-node.is-root {
  fill: var(--accent-brand);
  opacity: 0.9;
}
.mm-minimap-node.is-selected {
  fill: var(--accent-brand);
  opacity: 1;
}
.mm-minimap-view {
  fill: color-mix(in srgb, var(--accent-brand) 12%, transparent);
  stroke: var(--accent-brand);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.mm-text-style-toolbar {
  position: absolute;
  z-index: 7;
  display: flex;
  align-items: center;
  gap: 7px;
  height: 40px;
  padding: 5px 8px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--panel-elevated);
  box-shadow: var(--shadow-soft);
}
.mm-text-style-toolbar label,
.mm-text-style-toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 34px;
  height: 30px;
  padding: 0 6px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--text-primary);
  font: 600 13px var(--font-ui);
}
.mm-text-style-toolbar input[type='color'] { width: 25px; height: 25px; padding: 1px; border: 1px solid var(--border-soft); border-radius: 4px; background: var(--panel-base); cursor: pointer; }
.mm-text-style-toolbar button:hover { background: var(--surface-hover); cursor: pointer; }
.mm-text-style-toolbar label,
.mm-text-style-toolbar button { min-width: 42px; height: 36px; padding: 0 8px; }
.mm-text-style-toolbar input[type='color'] { width: 30px; height: 30px; }
.mm-text-context-menu {
  position: absolute;
  z-index: 8;
  display: grid;
  width: 196px;
  padding: 5px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--panel-elevated);
  box-shadow: var(--shadow-soft);
}
.mm-text-context-menu button { display: flex; justify-content: space-between; align-items: center; min-height: 34px; padding: 0 9px; border: 0; border-radius: 3px; background: transparent; color: var(--text-primary); text-align: left; cursor: pointer; }
.mm-text-context-menu button:hover { background: var(--surface-hover); }
.mm-text-context-menu kbd { color: var(--text-muted); font: 11px var(--font-ui); }
.mm-text-context-menu p { margin: 5px 8px; color: var(--state-danger); font-size: 11px; }
.mindmap-canvas {
  position: relative;
  flex: 1;
  overflow: hidden;
  background-color: var(--bg-app);
  background-image: radial-gradient(circle, color-mix(in srgb, var(--text-muted) 20%, transparent) 1px, transparent 1.2px);
  background-position: 10px 10px;
  background-size: 28px 28px;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
:global(:root.theme-light) .mindmap-canvas {
  background-image: radial-gradient(circle, color-mix(in srgb, var(--text-muted) 18%, transparent) 1px, transparent 1.2px);
}
.mindmap-canvas.is-grid-hidden,
:global(:root.theme-light) .mindmap-canvas.is-grid-hidden { background-image: none; }
/* 平移中：光标改为抓紧 */
.mindmap-canvas.is-panning { cursor: grabbing; }
/* 节点拖拽期间全局禁止选中文本，避免拖出一个蓝色选区 */
:global(body.mm-node-dragging) {
  user-select: none !important;
  cursor: grabbing !important;
}
.mm-svg { display: block; }
.mm-edge {
  stroke: var(--mindmap-edge, var(--border-strong));
  stroke-width: 1.6;
}
/* org 模式的竖直连线：圆头收尾，避免底部端点出现硬角 */
.mm-edge--vertical {
  stroke-linecap: round;
}
.mm-edge-hit { stroke: transparent; stroke-width: 16; pointer-events: stroke; cursor: pointer; }
.mm-node {
  cursor: pointer;
  transition: transform 180ms cubic-bezier(.2, .75, .25, 1);
}
.mm-node-box {
  fill: var(--mindmap-node-bg, var(--panel-elevated));
  stroke: var(--mindmap-node-border, var(--border-strong));
  stroke-width: 1.4;
}
.mm-node-text {
  font-family: var(--font-ui);
  font-size: 13px;
  fill: var(--mindmap-node-text, var(--text-primary));
  /* 显式禁用描边：文字 stroke 会继承祖先/默认值，某些渲染路径下会把填充压淡，
     在浅色主题里表现为「白底浅字看不清」。 */
  stroke: none;
  stroke-width: 0;
  pointer-events: none;
}
.mm-node.is-root .mm-node-box {
  fill: var(--mindmap-root-bg, var(--surface-active));
  stroke: var(--mindmap-root-border, var(--accent-brand));
  stroke-width: 1.8;
}
.mm-node.is-root .mm-node-text { font-weight: 700; }
.mm-node.is-collapsed .mm-node-box { stroke-dasharray: 4 3; }
.mm-node.is-selected .mm-node-box {
  stroke: var(--mindmap-accent, var(--accent-brand));
  stroke-width: 2;
}
.mm-node-selection-ring {
  fill: none;
  stroke: var(--mindmap-accent, var(--accent-brand));
  stroke-width: 2.5;
  stroke-dasharray: 5 3;
  pointer-events: none;
}
/* 拖拽源：半透明；拖拽目标：成功色高亮 */
.mm-node.is-dragging { opacity: 0.5; }
.mm-node.is-drag-over .mm-node-box {
  stroke: var(--state-success);
  stroke-width: 2.4;
  fill: var(--surface-active);
}
.mm-node.is-relation-pick-mode { cursor: crosshair; }
.mm-node.is-relation-start .mm-node-box {
  stroke: var(--accent-brand);
  stroke-width: 3;
  filter: drop-shadow(0 0 5px color-mix(in srgb, var(--accent-brand) 65%, transparent));
}
.mm-drop-insertion {
  stroke: var(--accent-brand);
  stroke-width: 3;
  stroke-linecap: round;
  pointer-events: none;
}
.mm-toggle { cursor: pointer; }
.mm-toggle circle {
  fill: var(--panel-base);
  stroke: var(--border-strong);
  stroke-width: 1.2;
}
.mm-toggle text {
  font-size: 9px;
  fill: var(--text-secondary);
  pointer-events: none;
}
/* 边界（UX-2）：半透明填充 + 虚线描边 + 左上角标签；不参与命中/拖拽/右键 */
.mm-boundary { pointer-events: none; }
.mm-boundary-box {
  fill-opacity: 0.12;
  stroke-width: 1.4;
  stroke-dasharray: 6 4;
}
.mm-boundary-label {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
}
/* 概要（UX-2）：括线 + 文本 */
.mm-summary { pointer-events: none; }
.mm-summary-bracket {
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mm-summary-text {
  font-family: var(--font-ui);
  font-size: 11px;
}
/* 独立关系线（阶段 4C）：虚线 + 箭头；不参与布局，仅作语义补充 */
.mm-relation-path {
  stroke-width: 1.5;
  stroke-linecap: round;
  pointer-events: none;
}
.mm-relation-label {
  font-family: var(--font-ui);
  font-size: 10px;
  paint-order: stroke;
  stroke: var(--bg-app);
  stroke-width: 2.5px;
  stroke-linejoin: round;
  pointer-events: none;
}
/* 标记徽章（阶段 4C）：节点左上角，小圆角块 + 徽章字符 */
.mm-marker rect {
  stroke-width: 1;
}
.mm-marker text {
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: 700;
  pointer-events: none;
}
.mm-inline-editor {
  position: absolute;
  z-index: 5;
  margin: 0;
  padding: 4px 8px;
  border-radius: var(--radius-control);
  border: 1.5px solid var(--accent-brand);
  background: var(--panel-elevated);
  color: var(--text-primary);
  font-family: var(--font-ui);
  resize: none;
  outline: none;
  overflow: hidden;
  box-shadow: var(--shadow-soft);
}

/*
 * 彩虹主题（mode==='rainbow'）：
 * - 连线/节点描边/边缘圆点都由节点上的 --mm-hue 派生，深浅主题只切换混合比例；
 * - 节点底色不覆盖，继续跟随 --panel-elevated，融入 Tau 深蓝/浅色工作区；
 * - 节点文字显式继承 --text-primary（彩虹主题不注入 --mindmap-node-text）；
 * - 描边一律用「实色 + 与背景混色」而不是「与 transparent 混色」：
 *   后者在浅色画布上会退化成半透明灰边，整张图发灰、不清爽。
 */
.mm-node[style*="--mm-hue"] .mm-node-text {
  fill: var(--mindmap-node-text, var(--text-primary));
}
.mm-edge--rainbow {
  stroke-width: 2;
  stroke-linecap: round;
  opacity: 1;
}
/* 深色：原色直接可用 */
.mm-node[style*="--mm-hue"] .mm-node-box {
  stroke: var(--mm-hue);
  stroke-width: 1.5;
}
/* 浅色：与白底混合压暗，保证轮廓清晰 */
:global(:root.theme-light) .mm-node[style*="--mm-hue"] .mm-node-box {
  stroke: color-mix(in srgb, var(--mm-hue) 72%, #1e293b 18%);
}
/* 叶子节点描边收细，末梢自然收口；一级分支保持更清晰的轮廓 */
.mm-node[style*="--mm-hue"]:not(.is-root):not(:has(.mm-toggle)) .mm-node-box {
  stroke-width: 1.1;
  opacity: 0.85;
}
.mm-branch-dot {
  stroke: var(--bg-app);
  stroke-width: 1.5;
  pointer-events: none;
}
:global(:root.theme-light) .mm-branch-dot {
  stroke: var(--panel-elevated);
}
/* 彩虹模式下折叠钮描边带分支色，强化「属于哪个分支」的归属感 */
.mm-node[style*="--mm-hue"] .mm-toggle circle {
  stroke: var(--mm-hue);
}
</style>
