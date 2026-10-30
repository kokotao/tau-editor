/**
 * 思维导图编辑态 store（阶段 1；阶段 4C 扩展样式/标记/主题/关系；阶段 4E 多工作表）
 *
 * 职责：
 * 1. 持有当前标签的 MindMapDocument、选中节点与历史快照；
 * 2. 统一入口 applyCommand 应用领域命令：成功才记录历史并更新选中；
 * 3. 提供 undo/redo 与重置文档；序列化结果供标签 content/dirty 同步；
 * 4. 解析失败只记录 loadError，不改写原内容；
 * 5. 阶段 4C：节点样式（updateTopicStyle）、标记（toggleMarker/updateTopicMarkers）、
 *    主题模板（setTheme）与独立关系线（addRelation/removeRelation）均为可撤销命令；
 * 6. 阶段 4E：多工作表 / 多中心主题（addSheet/switchSheet/renameSheet/removeSheet），
 *    约定 document.rootTopicId 永远等于「当前工作表」的根；
 * 7. UX-3B（返工）：右侧两个独立列（大纲 / 属性）的显隐与宽度
 *    （outlineVisible/propertiesVisible + outlineWidth/propertiesWidth），
 *    与 viewport 一样属于视图偏好——不进历史、不改文档、不触发 dirty。
 *
 * 约定：
 * - store 只负责编辑态，不直接写盘；脏状态由组件把序列化结果交给 tabService；
 * - 快照历史有界（MINDMAP_HISTORY_LIMIT）；
 * - 所有「原地小改」命令共用 commitDocumentChange：序列化无变化时不记历史。
 *
 * @author Albert_Luo
 * @date 2026-10-29
 */

import { defineStore } from 'pinia';
import {
  collectDocumentSheets,
  createEmptyMindMapDocument,
  generateTopicId,
  isMindMapError,
  parseMindMapDocument,
  serializeMindMapDocument,
  validateMindMapDocument,
} from '@/services/mindmapService';
import {
  createHistoryState,
  pushHistory,
  redoHistory,
  undoHistory,
  type MindmapHistorySnapshot,
  type MindmapHistoryState,
} from '@/services/mindmapHistoryService';
import { collectSubtreeTopicIds, type MindMapCommandResult } from '@/services/mindmap/mindmapCommands';
import { expandAncestors, searchMindmap } from '@/services/mindmapSearchService';
import type { MindmapViewport } from '@/services/mindmapLayoutService';
import { isMindmapThemeId } from '@/services/mindmapThemeService';
import type {
  MindMapDocument,
  MindMapLayoutMode,
  MindMapRelation,
  MindMapSheet,
  MindMapTopic,
  MindMapTopicBoundary,
  MindMapTopicStyle,
  MindmapOutlineRow,
} from '@/types/mindmap';

/** 默认视口：世界坐标原点居中、100% 缩放（真实适配由画布调用 fitView 完成）。 */
export const DEFAULT_MINDMAP_VIEWPORT: MindmapViewport = { x: 0, y: 0, zoom: 1 };

/* --------------------- 右侧面板（UX-3B 返工：双列独立） --------------------- */

/**
 * 右侧面板（大纲列 / 属性列）：
 * - 两个独立布尔控制显示（大纲默认展开，属性默认收起）；
 * - 两列各自有独立宽度（拖 resizer 变化），clamp 到 180–420。
 * 这些都是纯展示偏好：不进历史、不改文档、不触发 dirty。
 */
export const MINDMAP_RIGHT_PANEL_MIN_WIDTH = 180;
export const MINDMAP_RIGHT_PANEL_MAX_WIDTH = 420;
/** 大纲列默认宽度。 */
export const DEFAULT_MINDMAP_OUTLINE_WIDTH = 280;
/** 属性列默认宽度。 */
export const DEFAULT_MINDMAP_PROPERTIES_WIDTH = 280;

/** 把某一列宽度夹到 [MIN, MAX] 并取整（NaN/Infinity 回落到大纲默认宽度）。 */
export function clampMindmapRightPanelWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MINDMAP_OUTLINE_WIDTH;
  return Math.max(
    MINDMAP_RIGHT_PANEL_MIN_WIDTH,
    Math.min(MINDMAP_RIGHT_PANEL_MAX_WIDTH, Math.round(value)),
  );
}

/* --------------------------------- 标记 --------------------------------- */

/**
 * 内置标记定义（阶段 4C）。
 *
 * 标记以字符串 id 存在 `topic.markers` 中，展示形态（徽章文字）由这里统一声明，
 * 画布（徽章）与属性面板（多选按钮）共用同一份表，避免两处文案漂移。
 * 导入的外部标记允许出现表外 id：渲染时取 id 前两个字符作为兜底徽章。
 */
export interface MindmapMarkerDefinition {
  /** 存储用 id，例如 'priority-1'。 */
  id: string;
  /** 中文名（属性面板按钮文案）。 */
  label: string;
  /** 徽章文字（画布上显示）。 */
  badge: string;
}

export const MINDMAP_MARKER_DEFINITIONS: readonly MindmapMarkerDefinition[] = [
  { id: 'priority-1', label: '优先级 1', badge: '1' },
  { id: 'priority-2', label: '优先级 2', badge: '2' },
  { id: 'priority-3', label: '优先级 3', badge: '3' },
  { id: 'star', label: '星标', badge: '★' },
  { id: 'flag', label: '旗标', badge: '⚑' },
  { id: 'question', label: '疑问', badge: '?' },
];

/** 内置标记 id 列表。 */
export const MINDMAP_MARKER_IDS: readonly string[] = MINDMAP_MARKER_DEFINITIONS.map(
  (marker) => marker.id,
);

/** 取标记的徽章文字；表外 id 退化为前两个字符。 */
export function mindmapMarkerBadge(marker: string): string {
  const found = MINDMAP_MARKER_DEFINITIONS.find((item) => item.id === marker);
  return found ? found.badge : marker.slice(0, 2);
}

/** 生成关系线 id（与节点 id 前缀区分，避免混淆）。 */
function generateRelationId(existing: readonly MindMapRelation[]): string {
  const used = new Set(existing.map((relation) => relation.id));
  let candidate = '';
  do {
    candidate = `rel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  } while (used.has(candidate));
  return candidate;
}

/** 生成工作表 id（与节点 / 关系 id 前缀区分，避免混淆）。 */
function generateSheetId(existing: readonly MindMapSheet[]): string {
  const used = new Set(existing.map((sheet) => sheet.id));
  let candidate = '';
  do {
    candidate = `sheet_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  } while (used.has(candidate));
  return candidate;
}

/** 归一化标记数组：去空、去重、保序。 */
function normalizeMarkers(markers: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const marker of markers) {
    const value = String(marker ?? '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

/** 合法的结构布局模式（用于 setLayoutMode 的运行时校验）。 */
export const MINDMAP_LAYOUT_MODES: readonly MindMapLayoutMode[] = [
  'mindmap',
  'logic',
  'tree',
  'org',
];

/** 判断是否为合法的布局模式。 */
export function isMindMapLayoutMode(value: unknown): value is MindMapLayoutMode {
  return typeof value === 'string'
    && (MINDMAP_LAYOUT_MODES as readonly string[]).includes(value);
}

/* -------------------- UI 辅助（纯函数，Stage 与右面板共用） -------------------- */

export interface MindmapOutlineRowsResult {
  /** 可见行（按先序）。 */
  rows: MindmapOutlineRow[];
  /** 命中的节点 id（无查询时为空集合）。 */
  matchIds: Set<string>;
  /** 是否处于搜索态（搜索时忽略折叠标记）。 */
  searching: boolean;
}

/**
 * 构建大纲可见行（UX-3B：Stage 键盘导航与右侧面板大纲共用）。
 *
 * - 无查询：按可见性（折叠的子树不出现）先序遍历；
 * - 有查询：只保留「命中节点 + 其祖先」，并强制展开，保证命中项可见。
 *
 * 纯函数：只读文档，不依赖 store / DOM。
 */
export function buildMindmapOutlineRows(
  document: MindMapDocument,
  searchQuery = '',
): MindmapOutlineRowsResult {
  const query = searchQuery.trim();
  const searching = query.length > 0;
  const matchIds = searching
    ? new Set(searchMindmap(document, query).map((item) => item.id))
    : new Set<string>();

  const visibleIds: Set<string> | null = searching
    ? new Set<string>([...matchIds, ...expandAncestors(document, [...matchIds])])
    : null;

  const rows: MindmapOutlineRow[] = [];
  const walk = (topicId: string, depth: number) => {
    const topic = document.topics[topicId];
    if (!topic) return;
    if (visibleIds && !visibleIds.has(topic.id)) return;
    const childIds = topic.childIds ?? [];
    const hasChildren = childIds.length > 0;
    // 搜索期间忽略折叠标记，确保命中分支可展开查看。
    const collapsed = !searching && Boolean(topic.collapsed) && hasChildren;
    rows.push({
      id: topic.id,
      text: topic.text ?? '',
      depth,
      hasChildren,
      collapsed,
      childCount: childIds.length,
    });
    if (collapsed) return;
    for (const childId of childIds) walk(childId, depth + 1);
  };
  walk(document.rootTopicId, 0);

  return { rows, matchIds, searching };
}

/**
 * 按文档树序（先序）收集全部节点，供属性面板「关系目标」下拉使用。
 * 只依赖 childIds，不受折叠影响（折叠只是画布可见性问题）。
 */
export function collectMindmapTopicsInOrder(
  document: MindMapDocument,
): { id: string; text: string }[] {
  const result: { id: string; text: string }[] = [];
  const walk = (topicId: string) => {
    const topic = document.topics[topicId];
    if (!topic) return;
    result.push({ id: topic.id, text: topic.text ?? '' });
    for (const childId of topic.childIds ?? []) walk(childId);
  };
  walk(document.rootTopicId);
  return result;
}

export interface MindmapStoreState {
  tabId: string | null;
  document: MindMapDocument | null;
  selectedTopicId: string | null;
  loadError: string | null;
  history: MindmapHistoryState;
  /** 最近一次与标签 content 对齐的序列化文本，用于避免把加载当编辑。 */
  lastSerialized: string;
  /**
   * 画布视口（平移/缩放）。刻意与文档历史分离：
   * 视口操作不进入 undo/redo，也不改变文档内容与 dirty 状态。
   */
  viewport: MindmapViewport;
  /**
   * 右侧大纲列是否显示（UX-3B 返工：与属性列各自独立）。
   * 默认展开，与面板外移前的默认行为一致。
   */
  outlineVisible: boolean;
  /** 右侧属性列是否显示；默认收起（需用户显式打开，或选中节点后由工具栏/右键打开）。 */
  propertiesVisible: boolean;
  /** 大纲列宽度（px），拖动该列 resizer 时变化，clamp 到 180–420。 */
  outlineWidth: number;
  /** 属性列宽度（px），拖动该列 resizer 时变化，clamp 到 180–420。 */
  propertiesWidth: number;
}

function snapshotOf(
  document: MindMapDocument,
  selectedTopicId: string | null,
  label: string,
): MindmapHistorySnapshot {
  return { document, selectedTopicId, label };
}

export const useMindmapStore = defineStore('mindmap', {
  state: (): MindmapStoreState => ({
    tabId: null,
    document: null,
    selectedTopicId: null,
    loadError: null,
    history: createHistoryState(),
    lastSerialized: '',
    viewport: { ...DEFAULT_MINDMAP_VIEWPORT },
    outlineVisible: true,
    propertiesVisible: false,
    outlineWidth: DEFAULT_MINDMAP_OUTLINE_WIDTH,
    propertiesWidth: DEFAULT_MINDMAP_PROPERTIES_WIDTH,
  }),

  getters: {
    canUndo: (state) => state.history.past.length > 0,
    canRedo: (state) => state.history.future.length > 0,
    rootTopic: (state): MindMapTopic | null => {
      if (!state.document) return null;
      return state.document.topics[state.document.rootTopicId] ?? null;
    },
    /**
     * 全部工作表（阶段 4E）。
     *
     * 旧文档没有 sheets 时由 collectDocumentSheets 兜底为「唯一工作表」，
     * 因此 UI 可以无条件按列表渲染，无需到处判空。
     */
    sheets: (state): MindMapSheet[] =>
      (state.document ? collectDocumentSheets(state.document) : []),
    /** 当前工作表 id（rootTopicId 所属的工作表）；无文档时为 null。 */
    currentSheetId: (state): string | null => {
      const doc = state.document;
      if (!doc) return null;
      const current = collectDocumentSheets(doc)
        .find((sheet) => sheet.rootTopicId === doc.rootTopicId);
      return current?.id ?? null;
    },
    serialized: (state): string =>
      state.document ? serializeMindMapDocument(state.document) : '',
  },

  actions: {
    /** 从标签内容加载；内容与上次对齐时跳过，避免自产回写触发重载。 */
    loadFromContent(tabId: string, content: string) {
      if (this.tabId === tabId && this.lastSerialized === content) {
        return;
      }
      this.tabId = tabId;
      this.loadError = null;
      this.history = createHistoryState();
      this.selectedTopicId = null;
      this.viewport = { ...DEFAULT_MINDMAP_VIEWPORT };

      try {
        const document = parseMindMapDocument(content);
        this.document = document;
        this.selectedTopicId = document.rootTopicId;
        this.lastSerialized = serializeMindMapDocument(document);
      } catch (error) {
        this.document = null;
        this.lastSerialized = content;
        this.loadError = isMindMapError(error) ? error.message : '无法解析该思维导图文件';
      }
    },

    /** 清空编辑态（关闭标签/切换为空时）。 */
    clear() {
      this.tabId = null;
      this.document = null;
      this.selectedTopicId = null;
      this.loadError = null;
      this.history = createHistoryState();
      this.lastSerialized = '';
      this.viewport = { ...DEFAULT_MINDMAP_VIEWPORT };
    },

    /**
     * 打开失败（空文件 / 非法 JSON）后，按用户明确操作重建为空白导图。
     *
     * 这是「恢复」而不是编辑：没有可回退的旧文档，因此重置历史与视口；
     * 只有用户在错误态主动点击时才调用，绝不自动覆盖源文件。
     */
    recoverAsEmptyDocument(title = '未命名思维导图'): boolean {
      const next = createEmptyMindMapDocument(title);
      this.document = next;
      this.selectedTopicId = next.rootTopicId;
      this.loadError = null;
      this.history = createHistoryState();
      this.lastSerialized = serializeMindMapDocument(next);
      this.viewport = { ...DEFAULT_MINDMAP_VIEWPORT };
      return true;
    },

    /** 更新画布视口：只影响渲染，不进入历史、不改变文档与 dirty。 */
    setViewport(viewport: MindmapViewport) {
      this.viewport = { ...viewport };
    },

    resetViewport() {
      this.viewport = { ...DEFAULT_MINDMAP_VIEWPORT };
    },

    /* -------------- 右侧面板（UX-3B 返工：双列独立，纯展示状态） -------------- */

    /**
     * 设置大纲列显隐。
     *
     * 与 viewport 一样属于「视图偏好」：不写文档、不进历史、不改变 dirty。
     *
     * @returns 是否真的发生了变化（重复设置返回 false）
     */
    setOutlineVisible(visible: boolean): boolean {
      if (this.outlineVisible === visible) return false;
      this.outlineVisible = visible;
      return true;
    },

    /** 设置属性列显隐；返回是否发生变化。 */
    setPropertiesVisible(visible: boolean): boolean {
      if (this.propertiesVisible === visible) return false;
      this.propertiesVisible = visible;
      return true;
    },

    /** 切换大纲列（开→关、关→开），返回切换后的显隐状态。 */
    toggleOutlineVisible(): boolean {
      this.outlineVisible = !this.outlineVisible;
      return this.outlineVisible;
    },

    /** 切换属性列（开→关、关→开），返回切换后的显隐状态。 */
    togglePropertiesVisible(): boolean {
      this.propertiesVisible = !this.propertiesVisible;
      return this.propertiesVisible;
    },

    /** 设置大纲列宽度（clamp 到 180–420）；返回实际生效的宽度。 */
    setOutlineWidth(width: number): number {
      this.outlineWidth = clampMindmapRightPanelWidth(width);
      return this.outlineWidth;
    },

    /** 设置属性列宽度（clamp 到 180–420）；返回实际生效的宽度。 */
    setPropertiesWidth(width: number): number {
      this.propertiesWidth = clampMindmapRightPanelWidth(width);
      return this.propertiesWidth;
    },

    /** 恢复默认布局：大纲展开、属性收起、两列宽度回到 280。 */
    resetRightPanels() {
      this.outlineVisible = true;
      this.propertiesVisible = false;
      this.outlineWidth = DEFAULT_MINDMAP_OUTLINE_WIDTH;
      this.propertiesWidth = DEFAULT_MINDMAP_PROPERTIES_WIDTH;
    },

    selectTopic(topicId: string | null) {
      if (topicId === null) {
        this.selectedTopicId = null;
        return;
      }
      if (this.document?.topics[topicId]) {
        this.selectedTopicId = topicId;
      }
    },

    /**
     * 应用领域命令。
     * @returns 命令结果；失败时文档不变、不记录历史。
     */
    applyCommand(
      label: string,
      command: (document: MindMapDocument) => MindMapCommandResult,
      options: { recordHistory?: boolean } = {},
    ): MindMapCommandResult | null {
      if (!this.document) return null;

      const before = serializeMindMapDocument(this.document);
      const result = command(this.document);
      if (!result.ok) return result;

      const after = serializeMindMapDocument(result.document);
      if (after === before) {
        // 无实际变更（如已在边界的上移/下移）：不污染历史。
        return result;
      }

      if (options.recordHistory !== false) {
        this.history = pushHistory(
          this.history,
          snapshotOf(this.document, this.selectedTopicId, label),
        );
      }
      this.document = result.document;
      this.lastSerialized = after;
      if (result.selectionId && result.document.topics[result.selectionId]) {
        this.selectedTopicId = result.selectionId;
      }
      return result;
    },

    /**
     * 切换结构布局模式（mindmap / logic / tree / org）。
     *
     * 布局模式是文档正文的一部分（document.layoutMode），因此：
     * 1. 非法值或与当前值相同 → 返回 false，不写文档、不记历史；
     * 2. 合法切换 → 作为一条可撤销命令写入历史，并同步 lastSerialized，
     *    使上层据序列化结果正确判定 dirty 与回写标签内容。
     */
    setLayoutMode(mode: MindMapLayoutMode): boolean {
      if (!this.document) return false;
      if (!isMindMapLayoutMode(mode)) return false;
      if (this.document.layoutMode === mode) return false;

      const before = serializeMindMapDocument(this.document);
      // 复制文档再改，避免就地修改历史快照中的对象。
      const next: MindMapDocument = { ...this.document, layoutMode: mode };
      const after = serializeMindMapDocument(next);
      if (after === before) return false;

      this.history = pushHistory(
        this.history,
        snapshotOf(this.document, this.selectedTopicId, `切换布局：${mode}`),
      );
      this.document = next;
      this.lastSerialized = after;
      return true;
    },

    /**
     * 更新节点语义属性（备注 / 链接 / 标签），作为一条可撤销命令。
     *
     * 约定：空字符串或空数组表示「清除该属性」，写回时删除对应键，
     * 避免文档里留下 `notes: ""` 这类噪音；无实际变化时不记历史。
     */
    updateTopicMeta(
      topicId: string,
      payload: { notes?: string; link?: string; labels?: string[] },
    ): boolean {
      if (!this.document) return false;
      const current = this.document.topics[topicId];
      if (!current) return false;

      const nextTopic: MindMapTopic = { ...current };
      if (payload.notes !== undefined) {
        const notes = payload.notes.trim();
        if (notes) nextTopic.notes = notes;
        else delete nextTopic.notes;
      }
      if (payload.link !== undefined) {
        const link = payload.link.trim();
        if (link) nextTopic.link = link;
        else delete nextTopic.link;
      }
      if (payload.labels !== undefined) {
        const labels = Array.from(
          new Set(payload.labels.map((label) => label.trim()).filter(Boolean)),
        );
        if (labels.length > 0) nextTopic.labels = labels;
        else delete nextTopic.labels;
      }

      const before = serializeMindMapDocument(this.document);
      const next: MindMapDocument = {
        ...this.document,
        topics: { ...this.document.topics, [topicId]: nextTopic },
      };
      const after = serializeMindMapDocument(next);
      if (after === before) return false;

      this.history = pushHistory(
        this.history,
        snapshotOf(this.document, this.selectedTopicId, '编辑节点属性'),
      );
      this.document = next;
      this.lastSerialized = after;
      return true;
    },

    /**
     * 内部：提交一份新文档——只有序列化结果真的变化才记录历史并写回。
     *
     * 样式 / 标记 / 主题 / 关系等「原地小改」命令共用它，
     * 保证「无实际变化不污染历史」与 lastSerialized 同步的规则完全一致。
     *
     * @param options.selectionId  指定提交后的选中节点（工作表切换/删除等需要换根的命令）；
     *                             传 null 表示清空选中，省略则保持原选中
     * @param options.resetViewport 提交后是否把画布视口复位（换根后必须复位，否则旧视口
     *                             会落在新工作表的空白处）
     */
    commitDocumentChange(
      label: string,
      next: MindMapDocument,
      options: { selectionId?: string | null; resetViewport?: boolean } = {},
    ): boolean {
      if (!this.document) return false;
      const before = serializeMindMapDocument(this.document);
      const after = serializeMindMapDocument(next);
      if (after === before) return false;

      this.history = pushHistory(
        this.history,
        snapshotOf(this.document, this.selectedTopicId, label),
      );
      this.document = next;
      this.lastSerialized = after;
      if (options.selectionId !== undefined) {
        this.selectedTopicId = options.selectionId;
      }
      if (options.resetViewport) {
        this.viewport = { ...DEFAULT_MINDMAP_VIEWPORT };
      }
      return true;
    },

    /**
     * 更新节点样式（`topic.style`：color / fill / shape），可撤销。
     *
     * 语义与 updateTopicMeta 对齐：
     * - 未出现在 payload 里的键保持不动（undefined = 不改）；
     * - 空字符串表示清除该键（写回时删除，避免 `color: ""` 噪音）；
     * - 三个键全被清除时整体删除 `style`，无实际变化返回 false 且不记历史。
     */
    updateTopicStyle(topicId: string, style: MindMapTopicStyle): boolean {
      if (!this.document) return false;
      const current = this.document.topics[topicId];
      if (!current) return false;

      const nextStyle: MindMapTopicStyle = { ...(current.style ?? {}) };
      const apply = (key: keyof MindMapTopicStyle, value: string | undefined) => {
        if (value === undefined) return;
        const trimmed = String(value).trim();
        if (trimmed) nextStyle[key] = trimmed;
        else delete nextStyle[key];
      };
      apply('color', style.color);
      apply('fill', style.fill);
      apply('shape', style.shape);

      const nextTopic: MindMapTopic = { ...current };
      if (Object.keys(nextStyle).length > 0) nextTopic.style = nextStyle;
      else delete nextTopic.style;

      return this.commitDocumentChange('更新节点样式', {
        ...this.document,
        topics: { ...this.document.topics, [topicId]: nextTopic },
      });
    },

    /**
     * 覆盖节点标记集合（`topic.markers`），可撤销。
     *
     * 归一化：去空、去重、保序；空数组表示清除该属性（删除键）。
     */
    updateTopicMarkers(topicId: string, markers: readonly string[]): boolean {
      if (!this.document) return false;
      const current = this.document.topics[topicId];
      if (!current) return false;

      const normalized = normalizeMarkers(markers);
      const nextTopic: MindMapTopic = { ...current };
      if (normalized.length > 0) nextTopic.markers = normalized;
      else delete nextTopic.markers;

      return this.commitDocumentChange('更新节点标记', {
        ...this.document,
        topics: { ...this.document.topics, [topicId]: nextTopic },
      });
    },

    /**
     * 切换单个标记（有则删、无则加），可撤销。
     *
     * @param marker 标记 id（如 priority-1 / star / flag / question）
     */
    toggleMarker(topicId: string, marker: string): boolean {
      if (!this.document) return false;
      const current = this.document.topics[topicId];
      if (!current) return false;
      const value = String(marker ?? '').trim();
      if (!value) return false;

      const existing = current.markers ?? [];
      const next = existing.includes(value)
        ? existing.filter((item) => item !== value)
        : [...existing, value];
      return this.updateTopicMarkers(topicId, next);
    },

    /**
     * 设置 / 清除节点边界（`topic.boundary`，UX-2），可撤销。
     *
     * 语义：
     * - `null`，或 label / color 去掉空白后都不存在 → 删除 boundary 键（即无边界）；
     * - label / color 会做 trim，空字符串按「未设置」处理，避免 `label: ""` 噪音；
     * - 无实际变化返回 false 且不记历史（沿用 commitDocumentChange）。
     */
    setTopicBoundary(topicId: string, boundary: MindMapTopicBoundary | null): boolean {
      if (!this.document) return false;
      const current = this.document.topics[topicId];
      if (!current) return false;

      const label = boundary?.label?.trim() || undefined;
      const color = boundary?.color?.trim() || undefined;

      const nextTopic: MindMapTopic = { ...current };
      if (label || color) {
        const nextBoundary: MindMapTopicBoundary = {};
        if (label) nextBoundary.label = label;
        if (color) nextBoundary.color = color;
        nextTopic.boundary = nextBoundary;
      } else {
        delete nextTopic.boundary;
      }

      return this.commitDocumentChange('更新节点边界', {
        ...this.document,
        topics: { ...this.document.topics, [topicId]: nextTopic },
      });
    },

    /**
     * 设置 / 清除节点概要（`topic.summary`，UX-2），可撤销。
     *
     * 语义：null 或 trim 后为空 → 删除 summary 键；无实际变化返回 false。
     */
    setTopicSummary(topicId: string, text: string | null): boolean {
      if (!this.document) return false;
      const current = this.document.topics[topicId];
      if (!current) return false;

      const trimmed = text?.trim() ?? '';
      const nextTopic: MindMapTopic = { ...current };
      if (trimmed) nextTopic.summary = trimmed;
      else delete nextTopic.summary;

      return this.commitDocumentChange('更新节点概要', {
        ...this.document,
        topics: { ...this.document.topics, [topicId]: nextTopic },
      });
    },

    /**
     * 切换主题模板（写 `document.themeId`），可撤销。
     *
     * 未知主题 id 直接拒绝（渲染层虽会回退 default，但不应把非法值写进文档，
     * 否则导出/再次打开时主题与观感不一致）。
     */
    setTheme(themeId: string): boolean {
      if (!this.document) return false;
      if (!isMindmapThemeId(themeId)) return false;
      if (this.document.themeId === themeId) return false;
      return this.commitDocumentChange('切换主题', { ...this.document, themeId });
    },

    /**
     * 添加独立关系线（`document.relations`），可撤销。
     *
     * 拒绝：自环（源 = 目标）、端点不存在、同一对节点间已存在关系（无向判重，
     * 避免 A→B 与 B→A 两条线在画布上互相重叠难以点击）。
     *
     * @returns 成功返回 true；被拒绝时文档、历史均不变
     */
    addRelation(sourceId: string, targetId: string, label?: string): boolean {
      if (!this.document) return false;
      if (!sourceId || !targetId) return false;
      if (sourceId === targetId) return false;
      if (!this.document.topics[sourceId] || !this.document.topics[targetId]) return false;

      const existing = this.document.relations ?? [];
      const duplicated = existing.some((relation) => (
        (relation.sourceTopicId === sourceId && relation.targetTopicId === targetId)
        || (relation.sourceTopicId === targetId && relation.targetTopicId === sourceId)
      ));
      if (duplicated) return false;

      const relation: MindMapRelation = {
        id: generateRelationId(existing),
        sourceTopicId: sourceId,
        targetTopicId: targetId,
      };
      const trimmed = label?.trim();
      if (trimmed) relation.label = trimmed;

      return this.commitDocumentChange('添加关系', {
        ...this.document,
        relations: [...existing, relation],
      });
    },

    /** 删除一条关系线，可撤销；不存在的 id 返回 false。 */
    removeRelation(id: string): boolean {
      if (!this.document) return false;
      const existing = this.document.relations ?? [];
      if (!existing.some((relation) => relation.id === id)) return false;

      const remaining = existing.filter((relation) => relation.id !== id);
      const next: MindMapDocument = { ...this.document };
      // 清空后删除键，避免文档里留下 `relations: []`
      if (remaining.length > 0) next.relations = remaining;
      else delete next.relations;
      return this.commitDocumentChange('删除关系', next);
    },

    /* ---------------------- 阶段 4E：多工作表 / 多中心主题 ---------------------- */

    /**
     * 新增工作表（空白中心主题），并切换为当前工作表，可撤销。
     *
     * 完整流程：
     * 1. 新建一个只含中心节点的根主题（text 与工作表标题一致）；
     * 2. 追加到 sheets（旧文档第一次新增时会把兜底单工作表显式写入）；
     * 3. 更新 rootTopicId、选中新根，并把画布视口复位到默认视口。
     *
     * @param title 工作表标题；为空时自动命名「工作表 N」
     */
    addSheet(title?: string): boolean {
      if (!this.document) return false;
      const sheets = collectDocumentSheets(this.document);
      const sheetTitle = (title ?? '').trim() || `工作表 ${sheets.length + 1}`;

      const rootId = generateTopicId();
      const rootTopic: MindMapTopic = {
        id: rootId,
        parentId: null,
        childIds: [],
        text: sheetTitle,
      };
      const sheet: MindMapSheet = {
        id: generateSheetId(sheets),
        title: sheetTitle,
        rootTopicId: rootId,
      };

      const next: MindMapDocument = {
        ...this.document,
        rootTopicId: rootId,
        topics: { ...this.document.topics, [rootId]: rootTopic },
        sheets: [...sheets, sheet],
      };

      return this.commitDocumentChange('新增工作表', next, {
        selectionId: rootId,
        resetViewport: true,
      });
    },

    /**
     * 切换当前工作表：更新 rootTopicId 与选中，并复位视口，可撤销。
     *
     * @returns 未知工作表 id、或已经是当前工作表时返回 false（不记历史）
     */
    switchSheet(sheetId: string): boolean {
      if (!this.document) return false;
      const target = collectDocumentSheets(this.document)
        .find((sheet) => sheet.id === sheetId);
      if (!target) return false;
      if (this.document.rootTopicId === target.rootTopicId) return false;
      if (!this.document.topics[target.rootTopicId]) return false;

      return this.commitDocumentChange('切换工作表', {
        ...this.document,
        rootTopicId: target.rootTopicId,
      }, { selectionId: target.rootTopicId, resetViewport: true });
    },

    /**
     * 重命名工作表（只改 sheets[i].title，不动中心主题文本），可撤销。
     *
     * 说明：标题是「工作表的名字」，中心主题文本属于节点正文，两者刻意分开维护，
     * 避免改工作表名时意外改动导图内容；空标题（trim 后为空）视为非法输入。
     */
    renameSheet(sheetId: string, title: string): boolean {
      if (!this.document) return false;
      const trimmed = (title ?? '').trim();
      if (!trimmed) return false;

      const sheets = collectDocumentSheets(this.document);
      const index = sheets.findIndex((sheet) => sheet.id === sheetId);
      if (index < 0) return false;
      const current = sheets[index];
      if (!current || current.title === trimmed) return false;

      const nextSheets = sheets.map((sheet, i) => (
        i === index ? { ...sheet, title: trimmed } : sheet
      ));
      return this.commitDocumentChange('重命名工作表', {
        ...this.document,
        sheets: nextSheets,
      });
    },

    /**
     * 删除工作表：删除该根及其整棵子树 + 从 sheets 移除 + 清理相关关系线，可撤销。
     *
     * 约束：
     * - 至少保留一个工作表（仅剩一个时返回 false）；
     * - 删除的是当前工作表时，切换到剩余的第一个工作表并复位视口；
     * - 关系线端点落在被删子树里的整条关系一并清理（否则文档立即变成非法）。
     *
     * @returns 未知 id、仅剩一个工作表或无文档时返回 false
     */
    removeSheet(sheetId: string): boolean {
      if (!this.document) return false;
      const sheets = collectDocumentSheets(this.document);
      if (sheets.length <= 1) return false;

      const index = sheets.findIndex((sheet) => sheet.id === sheetId);
      if (index < 0) return false;
      const target = sheets[index];
      if (!target) return false;

      const removedIds = collectSubtreeTopicIds(this.document, target.rootTopicId);
      const remainingSheets = sheets.filter((_, i) => i !== index);
      const firstRemaining = remainingSheets[0];
      if (!firstRemaining) return false;

      const removingCurrent = this.document.rootTopicId === target.rootTopicId;
      const nextRootId = removingCurrent
        ? firstRemaining.rootTopicId
        : this.document.rootTopicId;

      const topics: Record<string, MindMapTopic> = {};
      for (const [topicId, topic] of Object.entries(this.document.topics)) {
        if (!removedIds.has(topicId)) topics[topicId] = topic;
      }

      const next: MindMapDocument = {
        ...this.document,
        rootTopicId: nextRootId,
        topics,
        sheets: remainingSheets,
      };
      // 清理端点落在被删子树里的关系线；清空后删除键，避免留下 `relations: []`
      const remainingRelations = (this.document.relations ?? []).filter((relation) => (
        !removedIds.has(relation.sourceTopicId) && !removedIds.has(relation.targetTopicId)
      ));
      if (remainingRelations.length > 0) next.relations = remainingRelations;
      else delete next.relations;

      // 只有删掉的是当前工作表时才换根/换选中/复位视口；
      // 删除其它工作表不该打断当前编辑位置。若选中的节点恰好落在被删子树里
      // （例如跨表关系的端点），则退回到当前工作表的根，避免留下悬空选中。
      if (removingCurrent) {
        return this.commitDocumentChange('删除工作表', next, {
          selectionId: nextRootId,
          resetViewport: true,
        });
      }
      const selectionDangling = this.selectedTopicId !== null
        && !topics[this.selectedTopicId];
      return this.commitDocumentChange('删除工作表', next,
        selectionDangling ? { selectionId: nextRootId } : {});
    },

    undo(): boolean {
      if (!this.document) return false;
      const result = undoHistory(
        this.history,
        snapshotOf(this.document, this.selectedTopicId, '当前'),
      );
      if (!result) return false;
      this.history = result.next;
      this.document = result.restore.document;
      this.selectedTopicId = result.restore.selectedTopicId;
      this.lastSerialized = serializeMindMapDocument(result.restore.document);
      return true;
    },

    redo(): boolean {
      if (!this.document) return false;
      const result = redoHistory(
        this.history,
        snapshotOf(this.document, this.selectedTopicId, '当前'),
      );
      if (!result) return false;
      this.history = result.next;
      this.document = result.restore.document;
      this.selectedTopicId = result.restore.selectedTopicId;
      this.lastSerialized = serializeMindMapDocument(result.restore.document);
      return true;
    },

    /** 重置为空白文档（可撤销）。 */
    resetToEmpty(title = '未命名思维导图'): boolean {
      if (!this.document) return false;
      const before = serializeMindMapDocument(this.document);
      const next = createEmptyMindMapDocument(title);
      const after = serializeMindMapDocument(next);
      if (after === before) return false;
      this.history = pushHistory(
        this.history,
        snapshotOf(this.document, this.selectedTopicId, '重置文档'),
      );
      this.document = next;
      this.selectedTopicId = next.rootTopicId;
      this.lastSerialized = after;
      return true;
    },

    /**
     * 用导入结果替换当前文档（可撤销）。
     *
     * 导入失败或结构非法时不做任何修改，保证原文档、选中与历史不变。
     */
    replaceDocument(document: MindMapDocument, label = '导入文档'): boolean {
      if (!this.document) return false;
      if (!validateMindMapDocument(document).ok) return false;

      const before = serializeMindMapDocument(this.document);
      const after = serializeMindMapDocument(document);
      if (after === before) return false;

      this.history = pushHistory(
        this.history,
        snapshotOf(this.document, this.selectedTopicId, label),
      );
      this.document = document;
      this.selectedTopicId = document.rootTopicId;
      this.lastSerialized = after;
      this.viewport = { ...DEFAULT_MINDMAP_VIEWPORT };
      return true;
    },
  },
});