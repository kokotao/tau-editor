/**
 * 阶段 4B：思维导图搜索服务单测
 *
 * 覆盖：标题命中、子串命中、大小写不敏感、多区间命中、祖先路径、
 * 空查询、limit 截断、无命中、文档只读，以及 expandAncestors 的嵌套/根/未知 id/环引用。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */
import { describe, expect, it } from 'vitest';
import { createEmptyMindMapDocument } from '@/services/mindmapService';
import {
  DEFAULT_MINDMAP_SEARCH_LIMIT,
  expandAncestors,
  findMindmapMatchRanges,
  searchMindmap,
} from '@/services/mindmapSearchService';
import type { MindMapDocument } from '@/types/mindmap';

/**
 * 测试文档结构：
 *   项目计划（根）
 *   ├─ Alpha 任务
 *   │  └─ Alpha 子任务
 *   └─ Beta 任务
 */
function buildDoc(): MindMapDocument {
  const doc = createEmptyMindMapDocument('项目计划');
  const root = doc.rootTopicId;
  doc.topics.a = { id: 'a', parentId: root, childIds: ['a1'], text: 'Alpha 任务' };
  doc.topics.a1 = { id: 'a1', parentId: 'a', childIds: [], text: 'Alpha 子任务' };
  doc.topics.b = { id: 'b', parentId: root, childIds: [], text: 'Beta 任务' };
  const rootTopic = doc.topics[root];
  if (rootTopic) rootTopic.childIds = ['a', 'b'];
  return doc;
}

describe('searchMindmap', () => {
  it('命中心主题并返回空路径', () => {
    const doc = buildDoc();
    const results = searchMindmap(doc, '项目');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(doc.rootTopicId);
    expect(results[0].text).toBe('项目计划');
    expect(results[0].path).toEqual([]);
    expect(results[0].matchRanges).toEqual([{ start: 0, end: 2 }]);
  });

  it('按子串命中并保持文档顺序（先序）', () => {
    const doc = buildDoc();
    const results = searchMindmap(doc, '任务');
    expect(results.map((item) => item.id)).toEqual(['a', 'a1', 'b']);
    expect(results.map((item) => item.text)).toEqual(['Alpha 任务', 'Alpha 子任务', 'Beta 任务']);
  });

  it('大小写不敏感，命中区间指向原始文本', () => {
    const doc = buildDoc();
    const results = searchMindmap(doc, 'alpha');
    expect(results.map((item) => item.id)).toEqual(['a', 'a1']);
    expect(results[0].matchRanges).toEqual([{ start: 0, end: 5 }]);
    // 原始文本区分大小写保留
    expect(results[0].text.startsWith('Alpha')).toBe(true);
  });

  it('path 为中心主题到该节点父级的文本数组', () => {
    const doc = buildDoc();
    const results = searchMindmap(doc, '任务');
    const byId = new Map(results.map((item) => [item.id, item]));
    expect(byId.get('a')?.path).toEqual(['项目计划']);
    expect(byId.get('a1')?.path).toEqual(['项目计划', 'Alpha 任务']);
    expect(byId.get('b')?.path).toEqual(['项目计划']);
  });

  it('同一节点内返回全部命中区间', () => {
    const doc = buildDoc();
    // 去掉子节点中的同名文本，只保留根节点的多区间命中
    if (doc.topics.a) doc.topics.a.text = '任务 A';
    if (doc.topics.a1) doc.topics.a1.text = '子任务';
    if (doc.topics.b) doc.topics.b.text = '任务 B';
    const root = doc.topics[doc.rootTopicId];
    if (root) root.text = 'Alpha alpha ALPHA';
    const results = searchMindmap(doc, 'alpha');
    expect(results).toHaveLength(1);
    expect(results[0].matchRanges).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
      { start: 12, end: 17 },
    ]);
  });

  it('查询串中的正则元字符按字面量匹配', () => {
    const doc = buildDoc();
    const root = doc.topics[doc.rootTopicId];
    if (root) root.text = '目标 (Q4) 计划';
    // 若未转义，'(' 会导致正则非法或误匹配
    expect(searchMindmap(doc, '(q4)')).toHaveLength(1);
    expect(searchMindmap(doc, '.*')).toHaveLength(0);
  });

  it('空查询与纯空白查询返回空数组', () => {
    const doc = buildDoc();
    expect(searchMindmap(doc, '')).toEqual([]);
    expect(searchMindmap(doc, '   ')).toEqual([]);
    expect(searchMindmap(doc, '\n\t ')).toEqual([]);
  });

  it('无命中返回空数组', () => {
    const doc = buildDoc();
    expect(searchMindmap(doc, '不存在的关键词')).toEqual([]);
  });

  it('limit 截断结果且保持文档顺序', () => {
    const doc = buildDoc();
    const results = searchMindmap(doc, '任务', { limit: 2 });
    expect(results.map((item) => item.id)).toEqual(['a', 'a1']);
  });

  it('limit 为 0 时不返回结果', () => {
    const doc = buildDoc();
    expect(searchMindmap(doc, '任务', { limit: 0 })).toEqual([]);
  });

  it('默认上限 200 条并截断超量结果', () => {
    const doc = createEmptyMindMapDocument('根');
    const rootId = doc.rootTopicId;
    const rootTopic = doc.topics[rootId];
    if (rootTopic) rootTopic.childIds = [];
    for (let index = 0; index < 205; index += 1) {
      const id = `n${index}`;
      doc.topics[id] = { id, parentId: rootId, childIds: [], text: `条目 ${index}` };
      if (rootTopic) rootTopic.childIds.push(id);
    }
    const results = searchMindmap(doc, '条目');
    expect(results).toHaveLength(DEFAULT_MINDMAP_SEARCH_LIMIT);
    expect(DEFAULT_MINDMAP_SEARCH_LIMIT).toBe(200);
    // 超量部分被截断，最后一条是第 200 个（下标 199）
    expect(results[results.length - 1].text).toBe('条目 199');
  });

  it('搜索折叠分支内的节点也会返回', () => {
    const doc = buildDoc();
    const a = doc.topics.a;
    if (a) a.collapsed = true;
    const results = searchMindmap(doc, '子任务');
    expect(results.map((item) => item.id)).toEqual(['a1']);
  });

  it('不修改文档（只读）', () => {
    const doc = buildDoc();
    const snapshot = JSON.stringify(doc);
    searchMindmap(doc, '任务');
    expandAncestors(doc, ['a1']);
    expect(JSON.stringify(doc)).toBe(snapshot);
  });
});

describe('findMindmapMatchRanges', () => {
  it('返回全部命中区间，空文本/空查询返回空数组', () => {
    expect(findMindmapMatchRanges('abABab', 'ab')).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
      { start: 4, end: 6 },
    ]);
    expect(findMindmapMatchRanges('', 'a')).toEqual([]);
    expect(findMindmapMatchRanges('abc', '')).toEqual([]);
  });
});

describe('expandAncestors', () => {
  it('返回嵌套节点的全部祖先（含根）', () => {
    const doc = buildDoc();
    const ancestors = expandAncestors(doc, ['a1']);
    expect(ancestors.has('a')).toBe(true);
    expect(ancestors.has(doc.rootTopicId)).toBe(true);
    expect(ancestors.size).toBe(2);
    // 不含自身
    expect(ancestors.has('a1')).toBe(false);
  });

  it('多级嵌套逐层收集', () => {
    const doc = buildDoc();
    doc.topics.a1x = { id: 'a1x', parentId: 'a1', childIds: [], text: '孙节点' };
    doc.topics.a1.childIds = ['a1x'];
    const ancestors = expandAncestors(doc, ['a1x']);
    expect([...ancestors].sort()).toEqual(['a', 'a1', doc.rootTopicId].sort());
  });

  it('直接子节点只返回根', () => {
    const doc = buildDoc();
    const ancestors = expandAncestors(doc, ['b']);
    expect([...ancestors]).toEqual([doc.rootTopicId]);
  });

  it('根节点自身没有祖先', () => {
    const doc = buildDoc();
    expect(expandAncestors(doc, [doc.rootTopicId]).size).toBe(0);
  });

  it('未知 id 与空输入安全返回空集合', () => {
    const doc = buildDoc();
    expect(expandAncestors(doc, ['missing']).size).toBe(0);
    expect(expandAncestors(doc, []).size).toBe(0);
  });

  it('多个节点的祖先取并集', () => {
    const doc = buildDoc();
    const ancestors = expandAncestors(doc, ['a1', 'b']);
    expect([...ancestors].sort()).toEqual(['a', doc.rootTopicId].sort());
  });

  it('parentId 成环时不死循环', () => {
    const doc = buildDoc();
    doc.topics.x = { id: 'x', parentId: 'y', childIds: [], text: 'X' };
    doc.topics.y = { id: 'y', parentId: 'x', childIds: [], text: 'Y' };
    // x 的父级是 y，y 的父级指回 x：只收集到 y，且必须能终止
    expect([...expandAncestors(doc, ['x'])]).toEqual(['y']);
  });
});
