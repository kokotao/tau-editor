/**
 * 思维导图布局服务（阶段 2，阶段 4A 扩展结构布局模式）
 *
 * 职责：
 * 1. 文本测量与换行：按字符宽度估算节点尺寸，支持中文/全角、长文本自动换行，
 *    保证不同语言与换行下连线位置正确（纯函数，不依赖 DOM 测量）；
 * 2. 按 `document.layoutMode` 生成结构布局：
 *    - mindmap：中心主题居中，子主题按子树高度均衡分派到左右两侧（阶段 2 行为）；
 *    - logic：单侧向右的辐射式布局，所有非根节点在根右侧逐层展开；
 *    - tree：方向与 logic 相同，但连线采用「树干折线」风格（正交树形连线）；
 *    - org：自上而下的组织图，同一父节点的子节点横向展开、连线为竖直方向；
 * 3. 生成 SVG 连线路径与整体包围盒，并提供「适配内容」的视口计算。
 *
 * UX-2 扩展（边界 / 概要）：
 * - `boundaries[]`：按「该主题 + 全部可见后代」的节点盒 union 加内边距得到的框（左上角坐标系），
 *   带可选标签/颜色；折叠时只包住主题自身；
 * - `summaries[]`：按「该主题全部可见子节点」的 union 得到的括线范围 + 文本，
 *   水平布局括线放在子节点外侧（left/right），org 布局放在下方（bottom）；
 * - 两者都并入整体 `bounds`，保证「适配内容」不会裁掉边界框与概要文字。
 *
 * 约定：
 * - 自动布局坐标不持久化；本服务只产出渲染用的派生数据；
 * - 折叠节点不展开子树，也不参与连线；
 * - `MindmapEdgeBox.orientation` 描述该连线的走向：org 为 vertical，其余为 horizontal；
 *   画布据此渲染，不再对方向做任何硬编码假设。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */

import type { MindMapDocument, MindMapLayoutMode, MindMapTopic } from '@/types/mindmap';

export interface MindmapLayoutOptions {
  /** 相邻层级（列中心）水平间距 */
  hGap: number;
  /** 同级节点垂直间距 */
  vGap: number;
  paddingX: number;
  paddingY: number;
  fontSize: number;
  lineHeight: number;
  /** 单行文本最大宽度，超出换行 */
  maxTextWidth: number;
  minNodeWidth: number;
  /** 连线控制点水平偏移基数 */
  edgeCurve: number;
}

export const DEFAULT_MINDMAP_LAYOUT_OPTIONS: MindmapLayoutOptions = {
  hGap: 56,
  vGap: 14,
  paddingX: 14,
  paddingY: 8,
  fontSize: 13,
  lineHeight: 20,
  maxTextWidth: 240,
  minNodeWidth: 64,
  edgeCurve: 24,
};

/** 边界框内边距（UX-2，v1 固定 12px，落在 10–14 的观感区间）。 */
export const MINDMAP_BOUNDARY_PADDING = 12;
/** 边界标签占用的高度：有标签时框顶再抬高一档，避免标签压住节点文字。 */
export const MINDMAP_BOUNDARY_LABEL_HEIGHT = 16;
/** 概要括线与子节点范围之间的间距。 */
export const MINDMAP_SUMMARY_GAP = 8;
/** 概要括线两端向内容方向的折角长度（画布绘制时也按这个值折 6px）。 */
export const MINDMAP_SUMMARY_TICK = 6;
const SUMMARY_BRACKET_TICK = MINDMAP_SUMMARY_TICK;
/** 概要文字字号与单行高度（与画布样式保持一致）。 */
export const MINDMAP_SUMMARY_FONT_SIZE = 11;
export const MINDMAP_SUMMARY_TEXT_HEIGHT = 16;

export type MindmapNodeSide = 'root' | 'left' | 'right';

export interface MindmapNodeBox {
  id: string;
  text: string;
  depth: number;
  side: MindmapNodeSide;
  /** 节点中心坐标（世界坐标） */
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  collapsed: boolean;
  hasChildren: boolean;
}

/**
 * 连线走向：
 * - horizontal：父节点外沿 → 子节点内沿的水平三次贝塞尔（mindmap/logic）；
 * - vertical：父节点底边中心 → 子节点顶边中心的竖直三次贝塞尔（org）。
 */
export type MindmapEdgeOrientation = 'horizontal' | 'vertical';

export interface MindmapEdgeBox {
  id: string;
  parentId: string;
  childId: string;
  side: 'left' | 'right';
  /** 该连线的走向；org 模式为 vertical，其余为 horizontal。 */
  orientation: MindmapEdgeOrientation;
  path: string;
}

/**
 * 边界框（UX-2）：包住一个主题及其全部可见后代。
 *
 * 坐标系约定：x / y 为**左上角**（与节点盒的中心坐标不同），可直接用于 SVG <rect>。
 */
export interface MindmapBoundaryBox {
  /** 所属主题 id（一个主题最多一个边界）。 */
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  color?: string;
}

/** 概要括线所在的方位：水平布局取子节点外侧，org 布局放在下方。 */
export type MindmapSummarySide = 'left' | 'right' | 'bottom';

/**
 * 概要框（UX-2）：该主题全部可见子节点的纵向/横向范围。
 *
 * 坐标系约定：
 * - `x` / `y` 为左上角；
 * - 水平布局下，`width` 覆盖「括线 + 文字」占据的横向空间，`height` 为子节点范围高度；
 * - org 布局下放在子节点范围下方，`height` 覆盖括线与文字。
 */
export interface MindmapSummaryBox {
  /** 所属主题 id（概要描述的是它的子节点范围）。 */
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  side: MindmapSummarySide;
}

export interface MindmapLayoutBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface MindmapLayout {
  nodes: MindmapNodeBox[];
  edges: MindmapEdgeBox[];
  /** 边界框（UX-2），绘制顺序为「面积大的在外层」。 */
  boundaries: MindmapBoundaryBox[];
  /** 概要括线（UX-2）。 */
  summaries: MindmapSummaryBox[];
  bounds: MindmapLayoutBounds;
  options: MindmapLayoutOptions;
  /** 本次布局采用的结构模式（由 document.layoutMode 归一化而来）。 */
  mode: MindMapLayoutMode;
  /** 整体连线走向，供画布等渲染方决定装饰性细节。 */
  orientation: MindmapEdgeOrientation;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface MindmapViewport {
  x: number;
  y: number;
  zoom: number;
}

/** 全角/CJK 字符判定（含常见中文标点与全角符号）。 */
const WIDE_CHAR_RE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/;

/** 单个字符的估算宽度（相对字号）。 */
export function estimateCharWidth(char: string, fontSize: number): number {
  if (WIDE_CHAR_RE.test(char)) return fontSize;
  if (char === ' ') return fontSize * 0.28;
  return fontSize * 0.56;
}

/** 估算一段不含换行的文本宽度。 */
export function measureTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of Array.from(text)) {
    width += estimateCharWidth(char, fontSize);
  }
  return width;
}

/**
 * 按最大宽度换行。优先在空白处断行，避免把英文单词切断；
 * 中文等无空白文本按字符断行。
 */
export function wrapTopicText(
  text: string,
  maxTextWidth: number,
  fontSize: number,
): string[] {
  const paragraphs = String(text ?? '').split(/\r?\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }
    const chars = Array.from(paragraph);
    let current = '';
    let currentWidth = 0;
    let lastBreakIndex = -1;

    for (let i = 0; i < chars.length; i += 1) {
      const char = chars[i] as string;
      const charWidth = estimateCharWidth(char, fontSize);
      if (currentWidth + charWidth > maxTextWidth && current.length > 0) {
        // 英文单词场景：若最近有空白断点，优先在空白处断行
        if (lastBreakIndex > 0 && lastBreakIndex < current.length) {
          lines.push(current.slice(0, lastBreakIndex).trimEnd());
          current = current.slice(lastBreakIndex).trimStart();
          currentWidth = measureTextWidth(current, fontSize);
          lastBreakIndex = -1;
        } else {
          lines.push(current.trimEnd());
          current = '';
          currentWidth = 0;
        }
      }
      current += char;
      currentWidth += charWidth;
      if (char === ' ') lastBreakIndex = current.length;
    }
    if (current.length > 0) lines.push(current.trimEnd());
  }

  return lines.length > 0 ? lines : [''];
}

export interface MeasuredTopic {
  width: number;
  height: number;
  lines: string[];
}

/** 测量节点尺寸（文本换行 + 内边距 + 最小宽度）。 */
export function measureTopic(
  text: string,
  options: MindmapLayoutOptions = DEFAULT_MINDMAP_LAYOUT_OPTIONS,
): MeasuredTopic {
  const lines = wrapTopicText(text, options.maxTextWidth, options.fontSize);
  const textWidth = lines.reduce(
    (max, line) => Math.max(max, measureTextWidth(line, options.fontSize)),
    0,
  );
  const width = Math.max(
    options.minNodeWidth,
    Math.ceil(textWidth + options.paddingX * 2),
  );
  const height = Math.ceil(lines.length * options.lineHeight + options.paddingY * 2);
  return { width, height, lines };
}

/* --------------------------------- 内部树 -------------------------------- */

interface InternalNode {
  id: string;
  topic: MindMapTopic;
  depth: number;
  side: MindmapNodeSide;
  measured: MeasuredTopic;
  children: InternalNode[];
  collapsed: boolean;
}

function buildVisibleTree(
  document: MindMapDocument,
  options: MindmapLayoutOptions,
): InternalNode | null {
  const build = (topicId: string, depth: number, side: MindmapNodeSide): InternalNode | null => {
    const topic = document.topics[topicId];
    if (!topic) return null;
    const hasChildren = (topic.childIds?.length ?? 0) > 0;
    const collapsed = Boolean(topic.collapsed) && hasChildren;
    const node: InternalNode = {
      id: topic.id,
      topic,
      depth,
      side,
      measured: measureTopic(topic.text ?? '', options),
      collapsed,
      children: [],
    };
    if (!collapsed) {
      node.children = (topic.childIds ?? [])
        .map((childId) => build(childId, depth + 1, side))
        .filter((child): child is InternalNode => child !== null);
    }
    return node;
  };

  return build(document.rootTopicId, 0, 'root');
}

/** 递归指定子树所在侧（左右由根的子主题分派结果决定）。 */
function assignSide(node: InternalNode, side: 'left' | 'right'): void {
  node.side = side;
  for (const child of node.children) assignSide(child, side);
}

/** 按子树高度把根的子主题均衡分派到左右两侧，保持各自顺序。 */
function splitRootChildren(
  children: InternalNode[],
  vGap: number,
  heightOf: (node: InternalNode) => number,
): { left: InternalNode[]; right: InternalNode[] } {
  const left: InternalNode[] = [];
  const right: InternalNode[] = [];
  let leftHeight = 0;
  let rightHeight = 0;

  for (const child of children) {
    const height = heightOf(child);
    if (rightHeight <= leftHeight) {
      right.push(child);
      rightHeight += height + vGap;
    } else {
      left.push(child);
      leftHeight += height + vGap;
    }
  }
  return { left, right };
}

function collectByDepth(
  nodes: InternalNode[],
  depthMap: Map<number, InternalNode[]>,
): void {
  for (const node of nodes) {
    const bucket = depthMap.get(node.depth);
    if (bucket) bucket.push(node);
    else depthMap.set(node.depth, [node]);
    collectByDepth(node.children, depthMap);
  }
}

/** 每一层列中心 X（左右两侧分别计算，root 宽度作为第 0 层基准）。 */
function computeColumnCenters(
  rootWidth: number,
  depthMap: Map<number, InternalNode[]>,
  hGap: number,
  direction: 1 | -1,
): Map<number, number> {
  const centers = new Map<number, number>();
  const maxDepth = Math.max(0, ...Array.from(depthMap.keys()));
  let previousCenter = 0; // 根节点中心为 0
  let previousWidth = rootWidth;

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const nodes = depthMap.get(depth) ?? [];
    const maxWidth = nodes.reduce((max, node) => Math.max(max, node.measured.width), 0);
    if (maxWidth === 0) break;
    // 相邻列中心的距离 = 上一列半宽 + 水平间距 + 本列半宽
    const centerDistance = previousWidth / 2 + hGap + maxWidth / 2;
    const center = previousCenter + direction * centerDistance;
    centers.set(depth, center);
    previousCenter = center;
    previousWidth = maxWidth;
  }
  return centers;
}

/**
 * 计算思维导图布局：按 `document.layoutMode` 分派到对应结构布局。
 *
 * @param document 已通过结构校验的文档
 * @param optionOverrides 布局参数覆盖
 */
export function computeMindmapLayout(
  document: MindMapDocument,
  optionOverrides: Partial<MindmapLayoutOptions> = {},
): MindmapLayout {
  const options: MindmapLayoutOptions = { ...DEFAULT_MINDMAP_LAYOUT_OPTIONS, ...optionOverrides };
  const mode = resolveLayoutMode(document.layoutMode);
  const orientation = layoutOrientation(mode);
  const root = buildVisibleTree(document, options);

  if (!root) {
    const emptyBounds: MindmapLayoutBounds = {
      minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0,
    };
    return {
      nodes: [],
      edges: [],
      boundaries: [],
      summaries: [],
      bounds: emptyBounds,
      options,
      mode,
      orientation,
    };
  }

  if (mode === 'org') return computeOrgLayout(root, options);
  if (mode === 'logic' || mode === 'tree') return computeSingleSideLayout(root, options, mode);
  return computeTwoSidedLayout(root, options);
}

/* ------------------------------ 模式与公共部件 ------------------------------ */

/** 连线走向与布局模式的对应关系：org 自上而下用竖直连线，其余模式用水平连线。 */
export function layoutOrientation(mode: MindMapLayoutMode): MindmapEdgeOrientation {
  return mode === 'org' ? 'vertical' : 'horizontal';
}

/** 归一化布局模式：缺失或非法值回退到 mindmap，保证布局函数对脏数据健壮。 */
export function resolveLayoutMode(value: unknown): MindMapLayoutMode {
  return value === 'logic' || value === 'tree' || value === 'org' ? value : 'mindmap';
}

/** 构造渲染用的节点盒子：四种模式共用，保证字段完全一致（节点始终以 x/y 为中心）。 */
function makeBox(node: InternalNode, x: number, y: number): MindmapNodeBox {
  return {
    id: node.id,
    text: node.topic.text ?? '',
    depth: node.depth,
    side: node.side,
    x,
    y,
    width: node.measured.width,
    height: node.measured.height,
    lines: node.measured.lines,
    collapsed: node.collapsed,
    hasChildren: (node.topic.childIds?.length ?? 0) > 0,
  };
}

/** 子树高度记忆化：避免在大图上重复递归导致 O(n²)。 */
function createHeightOf(options: MindmapLayoutOptions): (node: InternalNode) => number {
  const heightCache = new Map<string, number>();
  const heightOf = (node: InternalNode): number => {
    const cached = heightCache.get(node.id);
    if (cached !== undefined) return cached;
    let height: number;
    if (node.children.length === 0) {
      height = node.measured.height;
    } else {
      const childrenTotal = node.children.reduce(
        (sum, child) => sum + heightOf(child),
        0,
      ) + options.vGap * (node.children.length - 1);
      height = Math.max(node.measured.height, childrenTotal);
    }
    heightCache.set(node.id, height);
    return height;
  };
  return heightOf;
}

/** 水平方向布局上下文：mindmap 的双侧布局与 logic/tree 的单侧布局共用。 */
interface HorizontalLayoutContext {
  options: MindmapLayoutOptions;
  orientation: MindmapEdgeOrientation;
  /** tree 模式改用正交树干折线，其余模式使用三次贝塞尔。 */
  treeStyle: boolean;
  nodes: MindmapNodeBox[];
  edges: MindmapEdgeBox[];
  heightOf: (node: InternalNode) => number;
}

/**
 * 水平方向递归布局：同一父节点的子节点纵向堆叠，并以父节点中心为轴居中。
 * 列中心统一来自 computeColumnCenters，因此同一层节点的左/右边缘对齐一致。
 */
function placeHorizontal(
  ctx: HorizontalLayoutContext,
  parentBox: MindmapNodeBox,
  children: InternalNode[],
  centers: Map<number, number>,
  side: 'left' | 'right',
): void {
  if (children.length === 0) return;
  const heights = children.map((child) => ctx.heightOf(child));
  const total = heights.reduce((sum, height) => sum + height, 0)
    + ctx.options.vGap * (children.length - 1);
  let cursor = parentBox.y - total / 2;

  for (let i = 0; i < children.length; i += 1) {
    const child = children[i] as InternalNode;
    const height = heights[i] as number;
    const centerY = cursor + height / 2;
    const centerX = centers.get(child.depth) ?? 0;
    const childBox = makeBox(child, centerX, centerY);
    ctx.nodes.push(childBox);
    ctx.edges.push({
      id: `${parentBox.id}->${child.id}`,
      parentId: parentBox.id,
      childId: child.id,
      side,
      orientation: ctx.orientation,
      path: ctx.treeStyle
        ? buildTreeEdgePath(parentBox, childBox, side)
        : buildEdgePath(parentBox, childBox, side, ctx.options.edgeCurve),
    });
    placeHorizontal(ctx, childBox, child.children, centers, side);
    cursor += height + ctx.options.vGap;
  }
}

/** mindmap：中心主题居中，子主题按子树高度均衡分派到左右两侧（阶段 2 行为，保持不变）。 */
function computeTwoSidedLayout(
  root: InternalNode,
  options: MindmapLayoutOptions,
): MindmapLayout {
  const heightOf = createHeightOf(options);

  const { left, right } = splitRootChildren(root.children, options.vGap, heightOf);
  for (const node of right) assignSide(node, 'right');
  for (const node of left) assignSide(node, 'left');

  const rightDepth = new Map<number, InternalNode[]>();
  const leftDepth = new Map<number, InternalNode[]>();
  collectByDepth(right, rightDepth);
  collectByDepth(left, leftDepth);

  const rightCenters = computeColumnCenters(root.measured.width, rightDepth, options.hGap, 1);
  const leftCenters = computeColumnCenters(root.measured.width, leftDepth, options.hGap, -1);

  const ctx: HorizontalLayoutContext = {
    options,
    orientation: 'horizontal',
    treeStyle: false,
    nodes: [],
    edges: [],
    heightOf,
  };

  // 根节点居中；其子主题必须分别布局到左右两侧，不能走单侧递归。
  const rootBox = makeBox(root, 0, 0);
  ctx.nodes.push(rootBox);
  placeHorizontal(ctx, rootBox, right, rightCenters, 'right');
  placeHorizontal(ctx, rootBox, left, leftCenters, 'left');

  return finalizeLayout(root, ctx.nodes, ctx.edges, options, 'mindmap', 'horizontal');
}

/**
 * logic / tree：单侧向右。
 *
 * 两者节点坐标完全一致：
 * - 所有非根节点都在根右侧（x > 0），层级向右逐列展开；
 * - 同一父节点的子节点纵向堆叠、以父节点为轴居中。
 *
 * 差异仅在连线风格：tree 使用「树干折线」（正交路径，父节点右边缘 → 竖直树干 → 子节点左边缘），
 * logic 与 mindmap 一样使用平滑的三次贝塞尔。
 */
function computeSingleSideLayout(
  root: InternalNode,
  options: MindmapLayoutOptions,
  mode: 'logic' | 'tree',
): MindmapLayout {
  const heightOf = createHeightOf(options);

  // 单侧布局：整棵树归到右侧，不再做左右分派。
  for (const child of root.children) assignSide(child, 'right');

  const depthMap = new Map<number, InternalNode[]>();
  collectByDepth(root.children, depthMap);
  const centers = computeColumnCenters(root.measured.width, depthMap, options.hGap, 1);

  const ctx: HorizontalLayoutContext = {
    options,
    orientation: 'horizontal',
    treeStyle: mode === 'tree',
    nodes: [],
    edges: [],
    heightOf,
  };

  const rootBox = makeBox(root, 0, 0);
  ctx.nodes.push(rootBox);
  placeHorizontal(ctx, rootBox, root.children, centers, 'right');

  return finalizeLayout(root, ctx.nodes, ctx.edges, options, mode, 'horizontal');
}

/**
 * org：自上而下的组织图。
 *
 * 与水平布局的差异：
 * 1. 层级沿 Y 轴向下，同一层共用一个行中心，保证同级节点横向对齐；
 * 2. 同一父节点的子节点沿 X 轴横向展开，整体以父节点为中心左右对称；
 * 3. 连线方向为竖直：父节点底边中心 → 子节点顶边中心。
 */
function computeOrgLayout(
  root: InternalNode,
  options: MindmapLayoutOptions,
): MindmapLayout {
  // 1) 逐层行高与行中心 Y（子节点 y 严格大于父节点 y）。
  const depthHeights = new Map<number, number>();
  const collectRows = (node: InternalNode): void => {
    depthHeights.set(node.depth, Math.max(depthHeights.get(node.depth) ?? 0, node.measured.height));
    for (const child of node.children) collectRows(child);
  };
  collectRows(root);

  const maxDepth = Math.max(0, ...Array.from(depthHeights.keys()));
  const rowCenterY = new Map<number, number>();
  let previousBottom = 0;
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const rowHeight = depthHeights.get(depth) ?? 0;
    // 根节点固定在原点，后续层依次向下排布（行间距 vGap）。
    const centerY = depth === 0 ? 0 : previousBottom + options.vGap + rowHeight / 2;
    rowCenterY.set(depth, centerY);
    previousBottom = centerY + rowHeight / 2;
  }

  // 2) 子树水平占位宽度记忆化：同级之间至少保留 hGap，保证横向不重叠。
  const widthCache = new Map<string, number>();
  const widthOf = (node: InternalNode): number => {
    const cached = widthCache.get(node.id);
    if (cached !== undefined) return cached;
    let width = node.measured.width;
    if (node.children.length > 0) {
      const childrenTotal = node.children.reduce((sum, child) => sum + widthOf(child), 0)
        + options.hGap * (node.children.length - 1);
      width = Math.max(width, childrenTotal);
    }
    widthCache.set(node.id, width);
    return width;
  };

  const nodes: MindmapNodeBox[] = [];
  const edges: MindmapEdgeBox[] = [];

  const place = (node: InternalNode, centerX: number): MindmapNodeBox => {
    const box = makeBox(node, centerX, rowCenterY.get(node.depth) ?? 0);
    nodes.push(box);
    if (node.children.length === 0) return box;

    const widths = node.children.map((child) => widthOf(child));
    const total = widths.reduce((sum, width) => sum + width, 0)
      + options.hGap * (node.children.length - 1);
    let cursor = centerX - total / 2;

    for (let i = 0; i < node.children.length; i += 1) {
      const child = node.children[i] as InternalNode;
      const width = widths[i] as number;
      const childBox = place(child, cursor + width / 2);
      edges.push({
        id: `${box.id}->${child.id}`,
        parentId: box.id,
        childId: child.id,
        side: 'right',
        orientation: 'vertical',
        path: buildVerticalEdgePath(box, childBox, options.edgeCurve),
      });
      cursor += width + options.hGap;
    }
    return box;
  };

  place(root, 0);

  return finalizeLayout(root, nodes, edges, options, 'org', 'vertical');
}

/** 三次贝塞尔连线：从父节点外侧连到子节点内侧。 */
export function buildEdgePath(
  parent: { x: number; y: number; width: number },
  child: { x: number; y: number; width: number },
  side: 'left' | 'right',
  curve = DEFAULT_MINDMAP_LAYOUT_OPTIONS.edgeCurve,
): string {
  const startX = side === 'right' ? parent.x + parent.width / 2 : parent.x - parent.width / 2;
  const endX = side === 'right' ? child.x - child.width / 2 : child.x + child.width / 2;
  const distance = Math.max(curve, Math.abs(endX - startX) * 0.45);
  const c1x = side === 'right' ? startX + distance : startX - distance;
  const c2x = side === 'right' ? endX - distance : endX + distance;
  return `M ${round(startX)} ${round(parent.y)} C ${round(c1x)} ${round(parent.y)}, ${round(c2x)} ${round(child.y)}, ${round(endX)} ${round(child.y)}`;
}

/**
 * tree 模式连线：正交「树干折线」。
 * 父节点外侧 → 水平走到两列中间 → 竖直走到子节点所在行 → 水平进入子节点内侧。
 * 与贝塞尔的差异仅在外观：单调、正交，读起来更像目录树。
 */
export function buildTreeEdgePath(
  parent: { x: number; y: number; width: number },
  child: { x: number; y: number; width: number },
  side: 'left' | 'right',
): string {
  const startX = side === 'right' ? parent.x + parent.width / 2 : parent.x - parent.width / 2;
  const endX = side === 'right' ? child.x - child.width / 2 : child.x + child.width / 2;
  // 树干列取两列之间的中点，保证同一父节点的子节点共用一条竖线。
  const trunkX = (startX + endX) / 2;
  return `M ${round(startX)} ${round(parent.y)} L ${round(trunkX)} ${round(parent.y)} L ${round(trunkX)} ${round(child.y)} L ${round(endX)} ${round(child.y)}`;
}

/**
 * org 模式竖直连线：父节点底边中心 → 子节点顶边中心。
 * 控制点沿 Y 轴偏移，形成自上而下的三次贝塞尔。
 */
export function buildVerticalEdgePath(
  parent: { x: number; y: number; height: number },
  child: { x: number; y: number; height: number },
  curve = DEFAULT_MINDMAP_LAYOUT_OPTIONS.edgeCurve,
): string {
  const startX = parent.x;
  const startY = parent.y + parent.height / 2;
  const endX = child.x;
  const endY = child.y - child.height / 2;
  const distance = Math.max(curve, Math.abs(endY - startY) * 0.45);
  return `M ${round(startX)} ${round(startY)} C ${round(startX)} ${round(startY + distance)}, ${round(endX)} ${round(endY - distance)}, ${round(endX)} ${round(endY)}`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/* -------------------------- 边界 / 概要（UX-2） -------------------------- */

/** 简单的矩形范围（左上角 + 宽高），overlay 计算内部使用。 */
interface OverlayExtent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function extentOfBox(box: MindmapNodeBox): OverlayExtent {
  return {
    minX: box.x - box.width / 2,
    minY: box.y - box.height / 2,
    maxX: box.x + box.width / 2,
    maxY: box.y + box.height / 2,
  };
}

function extentOfFrame(frame: { x: number; y: number; width: number; height: number }): OverlayExtent {
  return {
    minX: frame.x,
    minY: frame.y,
    maxX: frame.x + frame.width,
    maxY: frame.y + frame.height,
  };
}

function unionExtent(a: OverlayExtent, b: OverlayExtent): OverlayExtent {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function frameOfExtent(extent: OverlayExtent): { x: number; y: number; width: number; height: number } {
  return {
    x: round(extent.minX),
    y: round(extent.minY),
    width: round(extent.maxX - extent.minX),
    height: round(extent.maxY - extent.minY),
  };
}

/**
 * 概要括线方位：
 * - org（竖直连线）放在子节点范围下方；
 * - 水平布局放在子节点外侧；根节点在 mindmap 模式下子主题会分到左右两侧，
 *   此时统一放在右侧（v1 简化，避免一根括线横跨中心主题）。
 */
function resolveSummarySide(
  children: InternalNode[],
  orientation: MindmapEdgeOrientation,
): MindmapSummarySide {
  if (orientation === 'vertical') return 'bottom';
  const hasRight = children.some((child) => child.side !== 'left');
  return hasRight ? 'right' : 'left';
}

/** 概要框：括线 + 文字占据的范围（并会并入整体 bounds）。 */
function buildSummaryFrame(
  range: OverlayExtent,
  side: MindmapSummarySide,
  text: string,
): { x: number; y: number; width: number; height: number } {
  if (side === 'bottom') {
    return {
      x: round(range.minX),
      y: round(range.maxY + MINDMAP_SUMMARY_GAP),
      width: round(range.maxX - range.minX),
      height: MINDMAP_SUMMARY_TEXT_HEIGHT,
    };
  }
  // 框只覆盖「括线 + 文字」的绘制区域：括线落在子节点范围外侧 gap 处，
  // 因此框的右/左边缘正好是括线位置（间距本身已由节点范围覆盖）。
  const textWidth = Math.ceil(measureTextWidth(text, MINDMAP_SUMMARY_FONT_SIZE));
  const frameWidth = SUMMARY_BRACKET_TICK + textWidth;
  if (side === 'left') {
    return {
      x: round(range.minX - MINDMAP_SUMMARY_GAP - frameWidth),
      y: round(range.minY),
      width: frameWidth,
      height: round(range.maxY - range.minY),
    };
  }
  return {
    x: round(range.maxX + MINDMAP_SUMMARY_GAP),
    y: round(range.minY),
    width: frameWidth,
    height: round(range.maxY - range.minY),
  };
}

/**
 * 计算边界与概要（纯函数，只读取已放置的节点盒）。
 *
 * 算法（后序遍历，O(n)）：
 * 1. 每个可见节点先取自身节点盒作为范围；
 * 2. 递归合并全部可见子节点的范围，得到「该主题 + 全部可见后代」的范围；
 * 3. 若该主题声明了 boundary，用范围 + 内边距生成边界框，并把框并入返回范围，
 *    使祖先边界自然包住子边界；
 * 4. 若该主题声明了 summary 且有可见子节点，用「全部子节点范围」生成概要框。
 */
function computeOverlays(
  root: InternalNode,
  nodes: MindmapNodeBox[],
  orientation: MindmapEdgeOrientation,
): { boundaries: MindmapBoundaryBox[]; summaries: MindmapSummaryBox[] } {
  const boxById = new Map(nodes.map((node) => [node.id, node]));
  const boundaries: MindmapBoundaryBox[] = [];
  const summaries: MindmapSummaryBox[] = [];

  const walk = (node: InternalNode): OverlayExtent | null => {
    const box = boxById.get(node.id);
    if (!box) return null;

    let extent = extentOfBox(box);
    const childRanges: { child: InternalNode; extent: OverlayExtent }[] = [];
    for (const child of node.children) {
      const childExtent = walk(child);
      if (!childExtent) continue;
      childRanges.push({ child, extent: childExtent });
      extent = unionExtent(extent, childExtent);
    }

    // 1) 边界：包住该主题 + 全部可见后代（折叠时后代为空，只包自身）
    const boundary = node.topic.boundary;
    if (boundary) {
      const label = boundary.label?.trim() || undefined;
      const color = boundary.color?.trim() || undefined;
      const labelHeight = label ? MINDMAP_BOUNDARY_LABEL_HEIGHT : 0;
      const frame = {
        x: Math.round(extent.minX - MINDMAP_BOUNDARY_PADDING),
        y: Math.round(extent.minY - MINDMAP_BOUNDARY_PADDING - labelHeight),
        width: Math.round(extent.maxX - extent.minX + MINDMAP_BOUNDARY_PADDING * 2),
        height: Math.round(
          extent.maxY - extent.minY + MINDMAP_BOUNDARY_PADDING * 2 + labelHeight,
        ),
      };
      boundaries.push({ id: node.id, ...frame, label, color });
      // 祖先把子边界框也包进去，避免出现「父框切穿子框」的观感
      extent = unionExtent(extent, extentOfFrame(frame));
    }

    // 2) 概要：按可见子节点范围生成（无子节点或已折叠时忽略）
    const summaryText = node.topic.summary?.trim();
    if (summaryText && childRanges.length > 0) {
      const side = resolveSummarySide(node.children, orientation);
      // 水平布局只概括「括线所在那一侧」的子节点：mindmap 的根节点子主题会分到左右两侧，
      // 若合并两侧范围，括线会横跨中心主题、视觉上难以理解（v1 简化）。
      const sideRanges = orientation === 'vertical'
        ? childRanges
        : childRanges.filter((item) => (
          side === 'left' ? item.child.side === 'left' : item.child.side !== 'left'
        ));
      const range = (sideRanges.length > 0 ? sideRanges : childRanges)
        .map((item) => item.extent)
        .reduce(unionExtent);
      const frame = buildSummaryFrame(range, side, summaryText);
      summaries.push({ id: node.id, ...frame, text: summaryText, side });
      extent = unionExtent(extent, extentOfFrame(frame));
    }

    return extent;
  };

  walk(root);
  // 面积大的（外层）先画，嵌套边界才不会互相盖住
  boundaries.sort((a, b) => b.width * b.height - a.width * a.height);
  return { boundaries, summaries };
}

/** 组装最终布局：计算 overlays，并把它们并入整体包围盒。 */
function finalizeLayout(
  root: InternalNode,
  nodes: MindmapNodeBox[],
  edges: MindmapEdgeBox[],
  options: MindmapLayoutOptions,
  mode: MindMapLayoutMode,
  orientation: MindmapEdgeOrientation,
): MindmapLayout {
  const { boundaries, summaries } = computeOverlays(root, nodes, orientation);
  let bounds = computeBounds(nodes);
  let extent: OverlayExtent = {
    minX: bounds.minX,
    minY: bounds.minY,
    maxX: bounds.maxX,
    maxY: bounds.maxY,
  };
  for (const frame of [...boundaries, ...summaries]) {
    extent = unionExtent(extent, extentOfFrame(frame));
  }
  bounds = {
    minX: round(extent.minX),
    minY: round(extent.minY),
    maxX: round(extent.maxX),
    maxY: round(extent.maxY),
    width: round(extent.maxX - extent.minX),
    height: round(extent.maxY - extent.minY),
  };
  return { nodes, edges, boundaries, summaries, bounds, options, mode, orientation };
}

function computeBounds(nodes: MindmapNodeBox[]): MindmapLayoutBounds {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.width / 2);
    minY = Math.min(minY, node.y - node.height / 2);
    maxX = Math.max(maxX, node.x + node.width / 2);
    maxY = Math.max(maxY, node.y + node.height / 2);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * 计算「适配内容」视口：把布局整体包围盒缩放到容器内并居中。
 * 画布变换约定：screen = world * zoom + translate。
 */
export function computeFitViewport(
  bounds: MindmapLayoutBounds,
  viewport: ViewportSize,
  padding = 48,
  zoomRange: { min: number; max: number } = { min: 0.1, max: 2 },
): MindmapViewport {
  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);

  if (bounds.width <= 0 || bounds.height <= 0) {
    return { x: viewport.width / 2, y: viewport.height / 2, zoom: 1 };
  }
  const scale = Math.min(
    availableWidth / bounds.width,
    availableHeight / bounds.height,
    zoomRange.max,
  );
  const zoom = Math.max(zoomRange.min, scale);
  const centerX = bounds.minX + bounds.width / 2;
  const centerY = bounds.minY + bounds.height / 2;
  return {
    x: viewport.width / 2 - centerX * zoom,
    y: viewport.height / 2 - centerY * zoom,
    zoom,
  };
}