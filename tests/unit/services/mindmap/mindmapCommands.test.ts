import { describe, expect, it } from 'vitest';
import { createEmptyMindMapDocument, serializeMindMapDocument } from '@/services/mindmapService';
import {
  addChildTopic,
  addSiblingTopic,
  collectSubtreeTopicIds,
  countDescendants,
  deleteTopic,
  duplicateTopic,
  isDescendantOf,
  moveTopic,
  moveTopicByOffset,
  renameTopic,
  resetDocument,
  setTopicCollapsed,
} from '@/services/mindmap/mindmapCommands';
import type { MindMapCommandResult } from '@/services/mindmap/mindmapCommands';
import type { MindMapDocument } from '@/types/mindmap';

/**
 * 构造固定树：
 *   root
 *   ├── a
 *   │   └── a1
 *   └── b
 */
function docWithTree(): MindMapDocument {
  const doc = createEmptyMindMapDocument('根主题');
  const root = doc.rootTopicId;
  doc.topics.a = { id: 'a', parentId: root, childIds: ['a1'], text: 'A' };
  doc.topics.a1 = { id: 'a1', parentId: 'a', childIds: [], text: 'A1' };
  doc.topics.b = { id: 'b', parentId: root, childIds: [], text: 'B' };
  const rootTopic = doc.topics[root];
  if (rootTopic) rootTopic.childIds = ['a', 'b'];
  return doc;
}

function expectOk(result: MindMapCommandResult): Extract<MindMapCommandResult, { ok: true }> {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

function expectFail(result: MindMapCommandResult, code: string) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('期望失败但成功');
  expect(result.error.code).toBe(code);
}

const freeze = (doc: MindMapDocument) => serializeMindMapDocument(doc);

describe('addChildTopic', () => {
  it('追加子节点并展开父节点', () => {
    const doc = docWithTree();
    const before = freeze(doc);
    const result = expectOk(addChildTopic(doc, 'b', '新子'));
    expect(result.document.topics.b?.childIds).toHaveLength(1);
    const newId = result.newTopicId as string;
    expect(result.document.topics[newId]?.parentId).toBe('b');
    expect(result.document.topics[newId]?.text).toBe('新子');
    expect(result.selectionId).toBe(newId);
    // 原文档未被修改（纯函数）
    expect(freeze(doc)).toBe(before);
  });

  it('父节点不存在时失败且不修改文档', () => {
    const doc = docWithTree();
    const before = freeze(doc);
    expectFail(addChildTopic(doc, 'ghost'), 'TOPIC_NOT_FOUND');
    expect(freeze(doc)).toBe(before);
  });
});

describe('addSiblingTopic', () => {
  it('插到当前节点之后', () => {
    const doc = docWithTree();
    const result = expectOk(addSiblingTopic(doc, 'a', 'A2'));
    const root = doc.rootTopicId;
    expect(result.document.topics[root]?.childIds[0]).toBe('a');
    expect(result.document.topics[root]?.childIds[1]).toBe(result.newTopicId);
    expect(result.document.topics[root]?.childIds[2]).toBe('b');
  });

  it('中心主题没有同级节点', () => {
    const doc = docWithTree();
    expectFail(addSiblingTopic(doc, doc.rootTopicId), 'ROOT_NODE_NO_SIBLING');
  });
});

describe('renameTopic', () => {
  it('改节点文本', () => {
    const doc = docWithTree();
    const result = expectOk(renameTopic(doc, 'a', '改名后'));
    expect(result.document.topics.a?.text).toBe('改名后');
  });

  it('中心主题改名同步文档 title', () => {
    const doc = docWithTree();
    const result = expectOk(renameTopic(doc, doc.rootTopicId, '新标题'));
    expect(result.document.title).toBe('新标题');
    expect(result.document.topics[doc.rootTopicId]?.text).toBe('新标题');
  });
});

describe('deleteTopic', () => {
  it('删除整棵子树并清理父节点引用与关系', () => {
    const doc = docWithTree();
    doc.relations = [{ id: 'r1', sourceTopicId: 'a', targetTopicId: 'b', label: 'x' }];
    const result = expectOk(deleteTopic(doc, 'a'));
    expect(result.document.topics.a).toBeUndefined();
    expect(result.document.topics.a1).toBeUndefined();
    expect(result.document.topics.b).toBeDefined();
    expect(result.document.topics[doc.rootTopicId]?.childIds).toEqual(['b']);
    expect(result.document.relations).toEqual([]);
    expect(result.selectionId).toBe(doc.rootTopicId);
  });

  it('中心主题不能删除', () => {
    const doc = docWithTree();
    const before = freeze(doc);
    expectFail(deleteTopic(doc, doc.rootTopicId), 'ROOT_NODE_DELETE');
    expect(freeze(doc)).toBe(before);
  });
});

describe('moveTopic', () => {
  it('改变父级并保持 childIds/parentId 一致', () => {
    const doc = docWithTree();
    const result = expectOk(moveTopic(doc, 'a1', 'b'));
    expect(result.document.topics.a1?.parentId).toBe('b');
    expect(result.document.topics.b?.childIds).toEqual(['a1']);
    expect(result.document.topics.a?.childIds).toEqual([]);
  });

  it('同父节点内按索引重排', () => {
    const doc = docWithTree();
    const root = doc.rootTopicId;
    const result = expectOk(moveTopic(doc, 'b', root, 0));
    expect(result.document.topics[root]?.childIds).toEqual(['b', 'a']);
  });

  it('拒绝移动到自身后代之下（成环）', () => {
    const doc = docWithTree();
    const before = freeze(doc);
    expectFail(moveTopic(doc, 'a', 'a1'), 'CYCLE_NOT_ALLOWED');
    expect(freeze(doc)).toBe(before);
  });

  it('拒绝移动到自身', () => {
    const doc = docWithTree();
    expectFail(moveTopic(doc, 'a', 'a'), 'ROOT_NODE_NO_MOVE');
  });

  it('拒绝移动中心主题', () => {
    const doc = docWithTree();
    expectFail(moveTopic(doc, doc.rootTopicId, 'a'), 'ROOT_NODE_NO_MOVE');
  });

  it('目标父节点不存在时失败', () => {
    const doc = docWithTree();
    expectFail(moveTopic(doc, 'a', 'ghost'), 'TOPIC_NOT_FOUND');
  });
});

describe('moveTopicByOffset', () => {
  it('上移/下移同级', () => {
    const doc = docWithTree();
    const up = expectOk(moveTopicByOffset(doc, 'b', -1));
    expect(up.document.topics[doc.rootTopicId]?.childIds).toEqual(['b', 'a']);
    const down = expectOk(moveTopicByOffset(doc, 'a', 1));
    expect(down.document.topics[doc.rootTopicId]?.childIds).toEqual(['b', 'a']);
  });

  it('边界处返回无变更文档', () => {
    const doc = docWithTree();
    const result = expectOk(moveTopicByOffset(doc, 'a', -1));
    expect(freeze(result.document)).toBe(freeze(doc));
  });

  it('中心主题不能重排', () => {
    const doc = docWithTree();
    expectFail(moveTopicByOffset(doc, doc.rootTopicId, 1), 'ROOT_NODE_NO_MOVE');
  });
});

describe('duplicateTopic', () => {
  it('深拷贝整棵子树并插在原节点之后', () => {
    const doc = docWithTree();
    const result = expectOk(duplicateTopic(doc, 'a'));
    const newRootId = result.newTopicId as string;
    expect(newRootId).not.toBe('a');
    expect(result.document.topics[newRootId]?.text).toBe('A');
    expect(result.document.topics[newRootId]?.parentId).toBe(doc.rootTopicId);
    // 子节点被复制且 id 不同
    const copiedChildren = result.document.topics[newRootId]?.childIds ?? [];
    expect(copiedChildren).toHaveLength(1);
    expect(copiedChildren[0]).not.toBe('a1');
    expect(result.document.topics[copiedChildren[0] as string]?.text).toBe('A1');
    // 原节点仍在
    expect(result.document.topics.a1).toBeDefined();
    // 插在 a 之后、b 之前
    expect(result.document.topics[doc.rootTopicId]?.childIds).toEqual(['a', newRootId, 'b']);
  });

  it('中心主题不能复制为同级', () => {
    const doc = docWithTree();
    expectFail(duplicateTopic(doc, doc.rootTopicId), 'ROOT_NODE_NO_SIBLING');
  });
});

describe('setTopicCollapsed', () => {
  it('切换折叠状态', () => {
    const doc = docWithTree();
    const result = expectOk(setTopicCollapsed(doc, 'a', true));
    expect(result.document.topics.a?.collapsed).toBe(true);
    const expanded = expectOk(setTopicCollapsed(result.document, 'a', false));
    expect(expanded.document.topics.a?.collapsed).toBe(false);
  });
});

describe('resetDocument', () => {
  it('返回只有中心主题的空白文档', () => {
    const result = expectOk(resetDocument('重置标题'));
    expect(result.document.title).toBe('重置标题');
    expect(Object.keys(result.document.topics)).toHaveLength(1);
    expect(result.selectionId).toBe(result.document.rootTopicId);
  });
});

describe('结构辅助函数', () => {
  it('collectSubtreeTopicIds / countDescendants / isDescendantOf', () => {
    const doc = docWithTree();
    expect(Array.from(collectSubtreeTopicIds(doc, 'a')).sort()).toEqual(['a', 'a1']);
    expect(countDescendants(doc, 'a')).toBe(1);
    expect(countDescendants(doc, 'a1')).toBe(0);
    expect(isDescendantOf(doc, 'a', 'a1')).toBe(true);
    expect(isDescendantOf(doc, 'a1', 'a')).toBe(false);
    expect(isDescendantOf(doc, doc.rootTopicId, 'a1')).toBe(true);
  });
});