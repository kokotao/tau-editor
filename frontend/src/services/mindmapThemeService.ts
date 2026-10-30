/**
 * 思维导图主题模板服务（阶段 4C）
 *
 * 职责：
 * 1. 定义内置主题模板（default / ocean / forest / sunset），每个主题给出一套完整配色：
 *    nodeFill / nodeStroke / rootFill / rootStroke / edge / text / accent，以及标记徽章配色；
 * 2. 提供 `listMindmapThemes()` 供工具栏列出色板、`resolveMindmapTheme(themeId)` 供渲染层取色；
 * 3. 提供 `mindmapThemeCssVariables()`：把主题换算为画布既有的 CSS 变量，
 *    渲染层只需在根节点上内联覆盖变量即可，无需改动既有 CSS 规则。
 *
 * 设计约束：
 * - 纯数据 + 纯函数：不读写 store、不依赖 DOM，便于在画布、舞台与单测中复用；
 * - `default` 主题的取色刻意与画布既有 CSS 变量回退值一一对齐，
 *   因此「未选择主题」与「选择 default」时观感完全一致；
 * - 未知 themeId 一律回退到 default，保证脏数据（如外部导入的未知主题）不会导致白屏。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */

/** 一个主题模板的完整配色。 */
export interface MindmapTheme {
  /** 主题 id，写入 `document.themeId`。 */
  id: string;
  /** 展示名（工具栏 / 属性面板）。 */
  name: string;
  /** 普通节点填充色。 */
  nodeFill: string;
  /** 普通节点描边色。 */
  nodeStroke: string;
  /** 中心主题填充色。 */
  rootFill: string;
  /** 中心主题描边色。 */
  rootStroke: string;
  /** 父子连线颜色。 */
  edge: string;
  /** 节点文字颜色。 */
  text: string;
  /** 强调色（选中态、关系线、标记徽章边框等）。 */
  accent: string;
  /** 标记徽章填充色（可选，缺省用浅黄）。 */
  markerBadgeFill?: string;
  /** 标记徽章文字颜色（可选，缺省用深棕）。 */
  markerBadgeText?: string;
}

/** 默认主题 id（与 createEmptyMindMapDocument 的 themeId 保持一致）。 */
export const DEFAULT_MINDMAP_THEME_ID = 'default';

/** 内置标记徽章的兜底配色（主题未覆盖时使用）。 */
export const DEFAULT_MARKER_BADGE_FILL = '#fff5e0';
export const DEFAULT_MARKER_BADGE_TEXT = '#8a5a00';

/**
 * 内置主题清单（顺序即工具栏顺序）。
 *
 * default 的取色与 MindmapCanvas 中 CSS 变量回退值保持一致：
 * nodeFill #ffffff / nodeStroke #c7d2e2 / rootFill #eaf2ff / rootStroke #7aa7e8 /
 * edge #b7c4d8 / text #1f2329 / accent #4a90e2。
 */
export const MINDMAP_THEMES: readonly MindmapTheme[] = [
  {
    id: 'default',
    name: '默认',
    nodeFill: '#ffffff',
    nodeStroke: '#c7d2e2',
    rootFill: '#eaf2ff',
    rootStroke: '#7aa7e8',
    edge: '#b7c4d8',
    text: '#1f2329',
    accent: '#4a90e2',
    markerBadgeFill: '#fff5e0',
    markerBadgeText: '#8a5a00',
  },
  {
    id: 'ocean',
    name: '深海',
    nodeFill: '#f4faff',
    nodeStroke: '#a9cfe8',
    rootFill: '#d8ecfb',
    rootStroke: '#2f87c7',
    edge: '#7fb3d5',
    text: '#0e3550',
    accent: '#1f7ac0',
    markerBadgeFill: '#e3f2fd',
    markerBadgeText: '#1b5f8a',
  },
  {
    id: 'forest',
    name: '森林',
    nodeFill: '#f6fbf5',
    nodeStroke: '#b6d6b0',
    rootFill: '#e2f2dd',
    rootStroke: '#4f9550',
    edge: '#8fbb8a',
    text: '#1d3a22',
    accent: '#3f8f4a',
    markerBadgeFill: '#eaf6e5',
    markerBadgeText: '#2f6b32',
  },
  {
    id: 'sunset',
    name: '日落',
    nodeFill: '#fffaf4',
    nodeStroke: '#e8c4a8',
    rootFill: '#ffe9d6',
    rootStroke: '#d9772f',
    edge: '#e0aa80',
    text: '#4a2a16',
    accent: '#d2691e',
    markerBadgeFill: '#fff0e0',
    markerBadgeText: '#9a4a12',
  },
];

/** 内置主题 id 列表（供运行时校验与工具栏遍历）。 */
export const MINDMAP_THEME_IDS: readonly string[] = MINDMAP_THEMES.map((theme) => theme.id);

/** 判断是否为内置主题 id。 */
export function isMindmapThemeId(value: unknown): value is string {
  return typeof value === 'string'
    && (MINDMAP_THEME_IDS as readonly string[]).includes(value);
}

/** 列出全部内置主题（返回浅拷贝，避免调用方改动内置常量）。 */
export function listMindmapThemes(): MindmapTheme[] {
  return MINDMAP_THEMES.map((theme) => ({ ...theme }));
}

/**
 * 解析主题：未知 / 缺失的 themeId 一律回退到 default。
 *
 * @param themeId `document.themeId`（可为空）
 */
export function resolveMindmapTheme(themeId?: string | null): MindmapTheme {
  const found = MINDMAP_THEMES.find((theme) => theme.id === themeId);
  const theme = found ?? (MINDMAP_THEMES[0] as MindmapTheme);
  return { ...theme };
}

/**
 * 把主题换算为画布既有的 CSS 变量。
 *
 * 渲染层在画布根节点上内联这些变量即可整体换色，且不破坏既有 CSS 规则
 * （选中 / 拖放 / 折叠等状态的优先级保持不变）。
 */
export function mindmapThemeCssVariables(theme: MindmapTheme): Record<string, string> {
  return {
    '--mindmap-node-bg': theme.nodeFill,
    '--mindmap-node-border': theme.nodeStroke,
    '--mindmap-root-bg': theme.rootFill,
    '--mindmap-root-border': theme.rootStroke,
    '--mindmap-edge': theme.edge,
    '--mindmap-node-text': theme.text,
    '--mindmap-accent': theme.accent,
    '--mindmap-marker-bg': theme.markerBadgeFill ?? DEFAULT_MARKER_BADGE_FILL,
    '--mindmap-marker-text': theme.markerBadgeText ?? DEFAULT_MARKER_BADGE_TEXT,
  };
}
