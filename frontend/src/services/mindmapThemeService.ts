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

/**
 * 主题上色模式：
 * - solid：整张导图使用同一套纯色配色（default / ocean / forest / sunset）；
 * - rainbow：按「一级分支」分别取色，连线与节点随所在分支着色（彩虹主题）。
 */
export type MindmapThemeMode = 'solid' | 'rainbow';

/** 一个主题模板的完整配色。 */
export interface MindmapTheme {
  /** 主题 id，写入 `document.themeId`。 */
  id: string;
  /** 展示名（工具栏 / 属性面板）。 */
  name: string;
  /**
   * 上色模式；缺省视为 solid，保证旧主题行为零变化。
   * rainbow 时渲染层会按 `branchPalette` 给每条一级分支单独着色。
   */
  mode?: MindmapThemeMode;
  /**
   * 彩虹主题的分支调色板（按一级分支出现顺序取模使用）。
   * 仅 mode==='rainbow' 时生效。
   */
  branchPalette?: readonly string[];
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

/**
 * 彩虹主题的 8 条分支主色。
 *
 * 取色偏「高饱和 + 中高明度」，在 Tau 深色画布（#0b1020）上发光柔和、
 * 白色文字对比充足；浅色主题下渲染层会把这些色相与背景做 color-mix 加深，
 * 因此这里只需维护一套色源，无需再维护一套浅色硬编码。
 */
export const RAINBOW_BRANCH_PALETTE: readonly string[] = [
  '#FF6B6B', // 珊瑚
  '#FF9F43', // 橙
  '#FFD93D', // 黄
  '#4ADE80', // 绿
  '#2DD4BF', // 青
  '#38BDF8', // 天蓝
  '#7C7BFF', // 靛
  '#FF7BC5', // 粉
];

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
  {
    // 彩虹主题：连线 / 节点描边 / 边缘圆点都按一级分支取色。
    // nodeFill / rootFill 等字段仅作为「非渲染场景」的兼容兜底：
    // 画布不会注入这些变量（见 mindmapThemeCanvasVariables），
    // 节点底色仍沿用 Tau 的 --panel-elevated，因此深浅主题都能自适应。
    id: 'rainbow',
    name: '彩虹',
    mode: 'rainbow',
    branchPalette: RAINBOW_BRANCH_PALETTE,
    nodeFill: '#151d2d',
    nodeStroke: '#94a3b8',
    rootFill: '#151d2d',
    rootStroke: '#7cc7ff',
    edge: '#94a3b8',
    text: '#ecf2ff',
    accent: '#7cc7ff',
    markerBadgeFill: '#fff5e0',
    markerBadgeText: '#8a5a00',
  },
  { id: 'lavender', name: '薰衣草', nodeFill: '#fbf8ff', nodeStroke: '#d1c4e9', rootFill: '#e9ddff', rootStroke: '#8056b3', edge: '#aa91cc', text: '#35234d', accent: '#8056b3', markerBadgeFill: '#f5edff', markerBadgeText: '#5e3a88' },
  { id: 'mint', name: '薄荷', nodeFill: '#f3fcf8', nodeStroke: '#a9d9c4', rootFill: '#d5f3e6', rootStroke: '#25805d', edge: '#79b99d', text: '#193e30', accent: '#25805d', markerBadgeFill: '#e3f8ee', markerBadgeText: '#236445' },
  { id: 'coral', name: '珊瑚', nodeFill: '#fff8f6', nodeStroke: '#efb7a8', rootFill: '#ffe0d7', rootStroke: '#cc5f49', edge: '#db9585', text: '#522a22', accent: '#c95743', markerBadgeFill: '#fff0e9', markerBadgeText: '#984332' },
  { id: 'lemon', name: '柠檬', nodeFill: '#fffef4', nodeStroke: '#e3d889', rootFill: '#fff5b8', rootStroke: '#9a8118', edge: '#c5b54c', text: '#443a12', accent: '#8f7810', markerBadgeFill: '#fff8d7', markerBadgeText: '#75600b' },
  { id: 'slate', name: '石板灰', nodeFill: '#f7f9fb', nodeStroke: '#b8c4d0', rootFill: '#e0e7ef', rootStroke: '#526779', edge: '#94a4b3', text: '#263746', accent: '#526779', markerBadgeFill: '#edf2f6', markerBadgeText: '#405465' },
  { id: 'berry', name: '莓果', nodeFill: '#fff7fa', nodeStroke: '#e5b4c9', rootFill: '#f7d9e6', rootStroke: '#ad426f', edge: '#cf83a2', text: '#4b2436', accent: '#ad426f', markerBadgeFill: '#fdebf3', markerBadgeText: '#863653' },
  { id: 'lagoon', name: '泻湖', nodeFill: '#f2fbfc', nodeStroke: '#a6d7dc', rootFill: '#d1f0f2', rootStroke: '#287e88', edge: '#79b7be', text: '#1c4145', accent: '#287e88', markerBadgeFill: '#e2f7f8', markerBadgeText: '#24666e' },
  { id: 'meadow', name: '草甸', nodeFill: '#f8fbf2', nodeStroke: '#c4d49b', rootFill: '#e7f0ca', rootStroke: '#6c8532', edge: '#a7bd72', text: '#35401f', accent: '#6c8532', markerBadgeFill: '#f0f6df', markerBadgeText: '#566d27' },
  { id: 'ice', name: '冰川', nodeFill: '#f5faff', nodeStroke: '#b4cde5', rootFill: '#dcecff', rootStroke: '#4c77a5', edge: '#8daed0', text: '#243a50', accent: '#4c77a5', markerBadgeFill: '#eaf4ff', markerBadgeText: '#385f87' },
  { id: 'sandstone', name: '陶土', nodeFill: '#fff9f3', nodeStroke: '#e3c2a3', rootFill: '#f5e1cc', rootStroke: '#a56437', edge: '#c99a70', text: '#493222', accent: '#a56437', markerBadgeFill: '#fff0df', markerBadgeText: '#80502d' },
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

/** 判断主题是否走「按分支上色」的彩虹模式。 */
export function isRainbowTheme(theme: MindmapTheme | null | undefined): boolean {
  return Boolean(theme && theme.mode === 'rainbow'
    && Array.isArray(theme.branchPalette) && theme.branchPalette.length > 0);
}

/**
 * 取第 `branchIndex` 条一级分支的主色（按调色板长度取模，负数安全）。
 *
 * @returns 非彩虹主题返回 null，调用方据此回退到单色逻辑。
 */
export function rainbowBranchColor(
  theme: MindmapTheme | null | undefined,
  branchIndex: number,
): string | null {
  if (!isRainbowTheme(theme)) return null;
  const palette = (theme as MindmapTheme).branchPalette as readonly string[];
  const size = palette.length;
  const index = ((Math.trunc(branchIndex) % size) + size) % size;
  return palette[index] ?? null;
}

/**
 * 画布根节点应注入的内联 CSS 变量。
 *
 * 与 `mindmapThemeCssVariables` 的差异：彩虹主题**不覆盖**节点填充/描边/连线这些
 * 「本该按分支变化」的变量，只注入强调色与标记配色，让节点底色继续跟随 Tau 的
 * `--panel-elevated`（深浅主题各自适配），分支着色则由渲染层逐节点/逐边内联完成。
 */
export function mindmapThemeCanvasVariables(theme: MindmapTheme): Record<string, string> {
  if (isRainbowTheme(theme)) {
    return {
      '--mindmap-accent': theme.accent,
      '--mindmap-marker-bg': theme.markerBadgeFill ?? DEFAULT_MARKER_BADGE_FILL,
      '--mindmap-marker-text': theme.markerBadgeText ?? DEFAULT_MARKER_BADGE_TEXT,
    };
  }
  return mindmapThemeCssVariables(theme);
}
