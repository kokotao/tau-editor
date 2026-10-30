/**
 * 思维导图编辑态 store（阶段 1）
 *
 * 职责：
 * 1. 持有当前标签的 MindMapDocument、选中节点与历史快照；
 * 2. 统一入口 applyCommand 应用领域命令：成功才记录历史并更新选中；
 * 3. 提供 undo/redo 与重置文档；序列化结果供标签 content/dirty 同步；
 * 4. 解析失败只记录 loadError，不改写原内容。
 *
 * 约定：
 * - store 只负责编辑态，不直接写盘；脏状态由组件把序列化结果交给 tabService；
 * - 快照历史有界（MINDMAP_HISTORY_LIMIT）。
 *
 * @author Albert_Luo
 * @date 2026-10-29
 */

import { defineStore } from 'pinia';
import {
  createEmptyMindMapDocument,
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
import type { MindMapCommandResult } from '@/services/mindmap/mindmapCommands';
import type { MindmapViewport } from '@/services/mindmapLayoutService';
import type { MindMapDocument, MindMapLayoutMode, MindMapTopic } from '@/types/mindmap';

/** 默认视口：世界坐标原点居中、100% 缩放（真实适配由画布调用 fitView 完成）。 */
export const DEFAULT_MINDMAP_VIEWPORT: MindmapViewport = { x: 0, y: 0, zoom: 1 };

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
  }),

  getters: {
    canUndo: (state) => state.history.past.length > 0,
    canRedo: (state) => state.history.future.length > 0,
    rootTopic: (state): MindMapTopic | null => {
      if (!state.document) return null;
      return state.document.topics[state.document.rootTopicId] ?? null;
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

    /** 更新画布视口：只影响渲染，不进入历史、不改变文档与 dirty。 */
    setViewport(viewport: MindmapViewport) {
      this.viewport = { ...viewport };
    },

    resetViewport() {
      this.viewport = { ...DEFAULT_MINDMAP_VIEWPORT };
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