import { describe, expect, it } from 'vitest';
import {
  MindMapError,
  createEmptyMindMapDocument,
  isMindMapError,
  parseMindMapDocument,
  serializeMindMapDocument,
  validateMindMapDocument,
} from '@/services/mindmapService';
import type { MindMapDocument } from '@/types/mindmap';

/** 构造一个合法文档的便捷函数。 */
function makeValidDocument(overrides: Partial<MindMapDocument> = {}): MindMapDocument {
  const rootId = 't_root';
  return {
    format: 'tau-mindmap',
    schemaVersion: 1,
    id: 'doc_1',
    title: '导图',
    rootTopicId: rootId,
    layoutMode: 'mindmap',
    themeId: 'default',
    saveMode: 'native',
    topics: {
      [rootId]: { id: rootId, parentId: null, childIds: [], text: '中心' },
    },
    ...overrides,
  };
}

function topicId(document: MindMapDocument, label: string): string {
  return Object.values(document.topics).find((t) => t.text === label)?.id ?? '';
}

describe('createEmptyMindMapDocument', () => {
  it('创建一个包含单一中心主题的合法空文档', () => {
    const document = createEmptyMindMapDocument('我的导图');
    expect(document.format).toBe('tau-mindmap');
    expect(document.schemaVersion).toBe(1);
    expect(document.saveMode).toBe('native');
    expect(document.layoutMode).toBe('mindmap');

    const root = document.topics[document.rootTopicId];
    expect(root).toBeDefined();
    expect(root?.parentId).toBeNull();
    expect(root?.childIds).toEqual([]);
    expect(root?.text).toBe('我的导图');
    expect(Object.keys(document.topics)).toHaveLength(1);
  });

  it('默认标题为未命名思维导图', () => {
    const document = createEmptyMindMapDocument();
    expect(document.title).toBe('未命名思维导图');
    expect(validateMindMapDocument(document).ok).toBe(true);
  });
});

describe('serialize / parse 往返', () => {
  it('空文档往返后结构完全一致', () => {
    const document = createEmptyMindMapDocument('往返');
    const raw = serializeMindMapDocument(document);
    const restored = parseMindMapDocument(raw);

    expect(restored).toEqual(document);
    expect(serializeMindMapDocument(restored)).toEqual(raw);
  });

  it('多级树往返后结构一致（含关系字段）', () => {
    const document = makeValidDocument();
    const root = document.rootTopicId;
    const a = 't_a';
    const a1 = 't_a1';
    document.topics[root].childIds = [a];
    document.topics[a] = { id: a, parentId: root, childIds: [a1], text: 'A' };
    document.topics[a1] = { id: a1, parentId: a, childIds: [], text: 'A1' };
    document.relations = [{ id: 'rel1', sourceTopicId: a, targetTopicId: a1, label: 'ref' }];

    const restored = parseMindMapDocument(serializeMindMapDocument(document));

    expect(restored).toEqual(document);
    expect(restored.rootTopicId).toBe(root);
    expect(restored.topics[a].childIds).toEqual([a1]);
    expect(restored.relations).toHaveLength(1);
  });

  it('外部来源字段在往返中保留', () => {
    const document = makeValidDocument({
      sourceFormat: 'xmind-zen',
      sourceVersion: 'zen-22.11',
      saveMode: 'imported',
      opaqueExtensions: { xmindMetrics: { foo: 1 } },
    });
    const restored = parseMindMapDocument(serializeMindMapDocument(document));
    expect(restored.sourceFormat).toBe('xmind-zen');
    expect(restored.sourceVersion).toBe('zen-22.11');
    expect(restored.saveMode).toBe('imported');
    expect(restored.opaqueExtensions).toEqual({ xmindMetrics: { foo: 1 } });
  });
});

describe('parse 错误分类', () => {
  it('非法 JSON → corrupt-content', () => {
    try {
      parseMindMapDocument('{ not json');
      expect.unreachable();
    } catch (error) {
      expect(isMindMapError(error)).toBe(true);
      const mindMapError = error as MindMapError;
      expect(mindMapError.category).toBe('corrupt-content');
    }
  });

  it('不是对象 → invalid-structure', () => {
    try {
      parseMindMapDocument('"hello"');
      expect.unreachable();
    } catch (error) {
      expect((error as MindMapError).category).toBe('invalid-structure');
    }
  });

  it('format 不是 tau-mindmap → unsupported-format', () => {
    const raw = JSON.stringify({ format: 'xmind', schemaVersion: 1 });
    try {
      parseMindMapDocument(raw);
      expect.unreachable();
    } catch (error) {
      expect((error as MindMapError).category).toBe('unsupported-format');
    }
  });

  it('未知更高 schema 版本 → unsupported-schema', () => {
    const raw = JSON.stringify({
      format: 'tau-mindmap',
      schemaVersion: 99,
      topics: {},
    });
    try {
      parseMindMapDocument(raw);
      expect.unreachable();
    } catch (error) {
      expect(isMindMapError(error)).toBe(true);
      expect((error as MindMapError).category).toBe('unsupported-schema');
      expect((error as MindMapError).code).toBe('SCHEMA_TOO_NEW');
    }
  });

  it('缺少 schemaVersion → unsupported-schema', () => {
    const raw = JSON.stringify({ format: 'tau-mindmap' });
    try {
      parseMindMapDocument(raw);
      expect.unreachable();
    } catch (error) {
      expect((error as MindMapError).category).toBe('unsupported-schema');
    }
  });
});

describe('validateMindMapDocument', () => {
  it('合法文档验证通过', () => {
    const document = createEmptyMindMapDocument();
    const result = validateMindMapDocument(document);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('rootTopicId 不存在 → INVALID_ROOT_REF', () => {
    const document = makeValidDocument({ rootTopicId: 'missing' });
    const result = validateMindMapDocument(document);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'INVALID_ROOT_REF')).toBe(true);
  });

  it('悬空子节点引用 → DANGLING_CHILD', () => {
    const document = makeValidDocument();
    document.topics[document.rootTopicId].childIds = ['ghost_child'];
    const result = validateMindMapDocument(document);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'DANGLING_CHILD')).toBe(true);
  });

  it('重复子节点 id → DUPLICATE_CHILD', () => {
    const document = makeValidDocument();
    const root = document.rootTopicId;
    const a = 't_a';
    document.topics[a] = { id: a, parentId: root, childIds: [], text: 'A' };
    const rootTopic = document.topics[root];
    if (rootTopic) rootTopic.childIds = [a, a];
    const result = validateMindMapDocument(document);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'DUPLICATE_CHILD')).toBe(true);
  });

  it('父子引用不一致 → PARENT_MISMATCH', () => {
    const document = makeValidDocument();
    const root = document.rootTopicId;
    const a = 't_a';
    // child 的 parentId 指向 root，但 childIds 里的归属是 a（不一致）
    document.topics[a] = { id: a, parentId: root, childIds: [], text: 'A' };
    const a1 = 't_a1';
    document.topics[a1] = { id: a1, parentId: 't_other', childIds: [], text: 'A1' };
    document.topics[a].childIds = [a1];
    const result = validateMindMapDocument(document);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'PARENT_MISMATCH')).toBe(true);
  });

  it('非 root 节点 parentId 为空 → ROOT_HAS_PARENT', () => {
    const document = makeValidDocument();
    const a = 't_a';
    document.topics[a] = { id: a, parentId: null, childIds: [], text: 'A' };
    const result = validateMindMapDocument(document);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'ROOT_HAS_PARENT')).toBe(true);
  });

  it('成环引用 → CYCLE', () => {
    const document = makeValidDocument();
    const a = 't_a';
    const b = 't_b';
    document.topics[a] = { id: a, parentId: b, childIds: [], text: 'A' };
    document.topics[b] = { id: b, parentId: a, childIds: [], text: 'B' };
    // root 仍保持合法；环在 a/b 之间
    const result = validateMindMapDocument(document);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'CYCLE')).toBe(true);
  });

  it('关系端点不存在 → RELATION_ENDPOINT 错误（规格要求端点必须存在）', () => {
    const document = makeValidDocument();
    document.relations = [
      { id: 'r1', sourceTopicId: 't_root', targetTopicId: 'ghost', label: 'x' },
    ];
    const result = validateMindMapDocument(document);
    expect(result.issues.some((issue) => issue.code === 'RELATION_ENDPOINT')).toBe(true);
    expect(result.ok).toBe(false);
  });

  it('空 topics → EMPTY_TOPICS', () => {
    const document = makeValidDocument({ topics: {} });
    const result = validateMindMapDocument(document);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'EMPTY_TOPICS')).toBe(true);
  });
});

describe('parse 结构校验集成', () => {
  it('成环文档 parse 时抛 inconsistent-reference', () => {
    const document = makeValidDocument();
    const a = 't_a';
    const b = 't_b';
    document.topics[a] = { id: a, parentId: b, childIds: [], text: 'A' };
    document.topics[b] = { id: b, parentId: a, childIds: [], text: 'B' };
    // root 自身需要合法（否则 root 相关的 error 先出现）
    const root = document.topics[document.rootTopicId];
    if (root) root.childIds = [];

    try {
      parseMindMapDocument(serializeMindMapDocument(document));
      expect.unreachable();
    } catch (error) {
      expect(isMindMapError(error)).toBe(true);
      expect((error as MindMapError).category).toBe('inconsistent-reference');
    }
  });
});