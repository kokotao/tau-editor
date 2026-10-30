import { describe, expect, it } from 'vitest';
import {
  MINDMAP_HISTORY_LIMIT,
  canRedo,
  canUndo,
  createHistoryState,
  pushHistory,
  redoHistory,
  undoHistory,
  type MindmapHistorySnapshot,
} from '@/services/mindmapHistoryService';
import { createEmptyMindMapDocument } from '@/services/mindmapService';

function snapshot(label: string): MindmapHistorySnapshot {
  return {
    document: createEmptyMindMapDocument(label),
    selectedTopicId: null,
    label,
  };
}

describe('mindmapHistoryService', () => {
  it('初始状态不可撤销/重做', () => {
    const state = createHistoryState();
    expect(canUndo(state)).toBe(false);
    expect(canRedo(state)).toBe(false);
  });

  it('push 后 canUndo，且新操作清空 redo 栈', () => {
    let state = createHistoryState();
    state = pushHistory(state, snapshot('one'));
    expect(canUndo(state)).toBe(true);

    const undone = undoHistory(state, snapshot('current'));
    expect(undone).not.toBeNull();
    state = undone!.next;
    expect(canRedo(state)).toBe(true);

    state = pushHistory(state, snapshot('two'));
    expect(canRedo(state)).toBe(false);
  });

  it('undo 返回上一个快照并把它移入 future', () => {
    let state = createHistoryState();
    state = pushHistory(state, snapshot('one'));
    const result = undoHistory(state, snapshot('current'));
    expect(result?.restore.label).toBe('one');
    expect(result?.next.past).toHaveLength(0);
    expect(result?.next.future[0]?.label).toBe('current');
  });

  it('redo 恢复被撤销的快照', () => {
    let state = createHistoryState();
    state = pushHistory(state, snapshot('one'));
    const undone = undoHistory(state, snapshot('current'))!;
    const redone = redoHistory(undone.next, snapshot('one'))!;
    expect(redone.restore.label).toBe('current');
    expect(canUndo(redone.next)).toBe(true);
    expect(canRedo(redone.next)).toBe(false);
  });

  it('空栈时 undo/redo 返回 null', () => {
    const state = createHistoryState();
    expect(undoHistory(state, snapshot('x'))).toBeNull();
    expect(redoHistory(state, snapshot('x'))).toBeNull();
  });

  it('历史有界：超过上限丢弃最旧快照', () => {
    let state = createHistoryState();
    for (let i = 0; i < MINDMAP_HISTORY_LIMIT + 10; i += 1) {
      state = pushHistory(state, snapshot(`s${i}`));
    }
    expect(state.past).toHaveLength(MINDMAP_HISTORY_LIMIT);
    expect(state.past[0]?.label).toBe('s10');
    expect(state.past[state.past.length - 1]?.label).toBe(`s${MINDMAP_HISTORY_LIMIT + 9}`);
  });

  it('自定义上限生效', () => {
    let state = createHistoryState();
    for (let i = 0; i < 5; i += 1) state = pushHistory(state, snapshot(`s${i}`), 3);
    expect(state.past).toHaveLength(3);
  });
});