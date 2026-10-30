/**
 * 思维导图编辑历史服务（阶段 1）
 *
 * 职责：
 * 1. 有界 undo/redo 快照栈（默认上限 100 条），超出上限丢弃最旧快照；
 * 2. 快照包含文档、选中节点与操作标签，撤销后恢复选中态；
 * 3. 纯函数实现，便于单测；不依赖 Pinia / DOM。
 *
 * 说明：
 * - 采用整文档快照：导图文档本身是小体积 JSON，快照实现比 patch 更不易出错；
 * - 新操作会清空 redo 栈，与编辑器通用语义一致。
 *
 * @author Albert_Luo
 * @date 2026-10-29
 */

import type { MindMapDocument } from '@/types/mindmap';

/** 历史快照上限。 */
export const MINDMAP_HISTORY_LIMIT = 100;

export interface MindmapHistorySnapshot {
  document: MindMapDocument;
  selectedTopicId: string | null;
  /** 生成该快照的操作标签，便于未来做「撤销：添加子主题」。 */
  label: string;
}

export interface MindmapHistoryState {
  /** 由旧到新的历史（栈顶在末尾）。 */
  past: MindmapHistorySnapshot[];
  /** redo 栈（栈顶在开头，便于 shift）。 */
  future: MindmapHistorySnapshot[];
}

export function createHistoryState(): MindmapHistoryState {
  return { past: [], future: [] };
}

/** 压入一条历史快照（保留最近 limit 条）。 */
export function pushHistory(
  state: MindmapHistoryState,
  snapshot: MindmapHistorySnapshot,
  limit = MINDMAP_HISTORY_LIMIT,
): MindmapHistoryState {
  const past = [...state.past, snapshot];
  const overflow = past.length - Math.max(1, limit);
  return {
    past: overflow > 0 ? past.slice(overflow) : past,
    future: [],
  };
}

export interface MindmapUndoResult {
  next: MindmapHistoryState;
  restore: MindmapHistorySnapshot;
}

/** 撤销：把当前快照推入 redo 栈，返回上一个快照。 */
export function undoHistory(
  state: MindmapHistoryState,
  current: MindmapHistorySnapshot,
): MindmapUndoResult | null {
  if (state.past.length === 0) return null;
  const restore = state.past[state.past.length - 1];
  if (!restore) return null;
  return {
    next: {
      past: state.past.slice(0, -1),
      future: [current, ...state.future],
    },
    restore,
  };
}

/** 重做：把当前快照推入 undo 栈，返回 redo 栈顶快照。 */
export function redoHistory(
  state: MindmapHistoryState,
  current: MindmapHistorySnapshot,
): MindmapUndoResult | null {
  if (state.future.length === 0) return null;
  const restore = state.future[0];
  if (!restore) return null;
  return {
    next: {
      past: [...state.past, current],
      future: state.future.slice(1),
    },
    restore,
  };
}

export function canUndo(state: MindmapHistoryState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: MindmapHistoryState): boolean {
  return state.future.length > 0;
}