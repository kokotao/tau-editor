import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useMindmapStore } from '@/stores/mindmap';
import { createEmptyMindMapDocument, serializeMindMapDocument } from '@/services/mindmapService';
import { addChildTopic, deleteTopic, moveTopicByOffset } from '@/services/mindmap/mindmapCommands';

function makeContent(): { content: string; rootId: string } {
  const doc = createEmptyMindMapDocument('store 测试');
  return { content: serializeMindMapDocument(doc), rootId: doc.rootTopicId };
}

describe('useMindmapStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('loadFromContent 解析文档并选中根节点', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);

    expect(store.tabId).toBe('tab-1');
    expect(store.document).not.toBeNull();
    expect(store.selectedTopicId).toBe(rootId);
    expect(store.loadError).toBeNull();
    expect(store.serialized).toBe(content);
  });

  it('loadFromContent 解析失败记录 loadError 且不覆盖内容', () => {
    const store = useMindmapStore();
    store.loadFromContent('tab-1', '{ broken');
    expect(store.document).toBeNull();
    expect(store.loadError).toBeTruthy();
    expect(store.lastSerialized).toBe('{ broken');
  });

  it('与上次对齐的内容重复 load 不重置选中与历史', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);
    store.applyCommand('添加子主题', (doc) => addChildTopic(doc, rootId));

    const historyLength = store.history.past.length;
    const selected = store.selectedTopicId;
    // 编辑后 lastSerialized 已更新；用同一内容再次 load 应当跳过
    store.loadFromContent('tab-1', store.serialized);
    expect(store.history.past.length).toBe(historyLength);
    expect(store.selectedTopicId).toBe(selected);
  });

  it('外部内容变化时 load 会重置历史', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);
    store.applyCommand('添加子主题', (doc) => addChildTopic(doc, rootId));
    expect(store.canUndo).toBe(true);

    store.loadFromContent('tab-1', content);
    expect(store.canUndo).toBe(false);
  });

  it('applyCommand 成功记录历史并更新选中', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);

    const result = store.applyCommand('添加子主题', (doc) => addChildTopic(doc, rootId));
    expect(result?.ok).toBe(true);
    expect(store.canUndo).toBe(true);
    expect(store.selectedTopicId).not.toBe(rootId);
    expect(Object.keys(store.document?.topics ?? {})).toHaveLength(2);
  });

  it('applyCommand 失败不修改文档与历史', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);
    const before = store.serialized;

    const result = store.applyCommand('添加子主题', (doc) => addChildTopic(doc, 'ghost'));
    expect(result?.ok).toBe(false);
    expect(store.serialized).toBe(before);
    expect(store.canUndo).toBe(false);
    expect(store.selectedTopicId).toBe(rootId);
  });

  it('无实际变更的命令不记录历史', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);

    store.applyCommand('添加子主题', (doc) => addChildTopic(doc, rootId));
    const childId = store.selectedTopicId as string;
    const historyLength = store.history.past.length;

    // 唯一子节点上移属于边界：命令成功但文档不变，不应新增历史
    const result = store.applyCommand('上移主题', (doc) => moveTopicByOffset(doc, childId, -1));
    expect(result?.ok).toBe(true);
    expect(store.history.past.length).toBe(historyLength);
  });

  it('undo/redo 恢复文档与选中，且历史栈正确', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);

    store.applyCommand('添加子主题', (doc) => addChildTopic(doc, rootId));
    const afterAdd = store.serialized;
    const childId = store.selectedTopicId as string;
    expect(childId).not.toBe(rootId);

    expect(store.undo()).toBe(true);
    expect(store.serialized).toBe(content);
    expect(store.selectedTopicId).toBe(rootId);
    expect(store.canRedo).toBe(true);

    expect(store.redo()).toBe(true);
    expect(store.serialized).toBe(afterAdd);
    expect(store.selectedTopicId).toBe(childId);
  });

  it('删除节点后可撤销恢复整棵子树', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);
    store.applyCommand('添加子主题', (doc) => addChildTopic(doc, rootId));
    const childId = store.selectedTopicId as string;
    store.applyCommand('添加子主题', (doc) => addChildTopic(doc, childId));

    store.applyCommand('删除主题', (doc) => deleteTopic(doc, childId));
    expect(store.document?.topics[childId]).toBeUndefined();

    store.undo();
    expect(store.document?.topics[childId]).toBeDefined();
  });

  it('resetToEmpty 可撤销', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);
    store.applyCommand('添加子主题', (doc) => addChildTopic(doc, rootId));
    const beforeReset = store.serialized;

    expect(store.resetToEmpty('重置')).toBe(true);
    expect(Object.keys(store.document?.topics ?? {})).toHaveLength(1);

    store.undo();
    expect(store.serialized).toBe(beforeReset);
  });

  it('clear 清空编辑态', () => {
    const store = useMindmapStore();
    const { content } = makeContent();
    store.loadFromContent('tab-1', content);
    store.clear();
    expect(store.tabId).toBeNull();
    expect(store.document).toBeNull();
    expect(store.canUndo).toBe(false);
  });

  it('视口变化不影响文档、历史与序列化内容', () => {
    const store = useMindmapStore();
    const { content } = makeContent();
    store.loadFromContent('tab-1', content);
    const serialized = store.serialized;

    store.setViewport({ x: 120, y: -40, zoom: 1.5 });

    expect(store.viewport).toEqual({ x: 120, y: -40, zoom: 1.5 });
    expect(store.serialized).toBe(serialized);
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(false);
  });

  it('撤销/重做不改变视口', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);
    store.applyCommand('添加子主题', (doc) => addChildTopic(doc, rootId));
    store.setViewport({ x: 10, y: 20, zoom: 0.8 });

    store.undo();
    expect(store.viewport).toEqual({ x: 10, y: 20, zoom: 0.8 });
    store.redo();
    expect(store.viewport).toEqual({ x: 10, y: 20, zoom: 0.8 });
  });

  it('resetViewport 恢复默认视口', () => {
    const store = useMindmapStore();
    const { content } = makeContent();
    store.loadFromContent('tab-1', content);
    store.setViewport({ x: 5, y: 6, zoom: 2 });
    store.resetViewport();
    expect(store.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('重新加载文档时重置视口', () => {
    const store = useMindmapStore();
    const { content } = makeContent();
    const other = createEmptyMindMapDocument('另一个');
    store.loadFromContent('tab-1', content);
    store.setViewport({ x: 99, y: 99, zoom: 2 });

    store.loadFromContent('tab-2', serializeMindMapDocument(other));
    expect(store.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('replaceDocument 导入替换：可撤销、选中归零、视口复位', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);
    store.applyCommand('添加子主题', (doc) => addChildTopic(doc, rootId));
    const beforeImport = store.serialized;

    const imported = createEmptyMindMapDocument('导入的导图');
    const importedRoot = imported.rootTopicId;
    imported.topics.x = { id: 'x', parentId: importedRoot, childIds: [], text: '导入节点' };
    const importedRootTopic = imported.topics[importedRoot];
    if (importedRootTopic) importedRootTopic.childIds = ['x'];

    store.setViewport({ x: 50, y: 50, zoom: 1.4 });
    expect(store.replaceDocument(imported, '导入 Markdown')).toBe(true);

    expect(store.document?.title).toBe('导入的导图');
    expect(store.selectedTopicId).toBe(importedRoot);
    expect(store.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(store.canUndo).toBe(true);

    // 撤销回到导入前
    expect(store.undo()).toBe(true);
    expect(store.serialized).toBe(beforeImport);
    // 重做回到导入后
    expect(store.redo()).toBe(true);
    expect(store.document?.title).toBe('导入的导图');
  });

  it('replaceDocument 拒绝非法文档且不改变现状', () => {
    const store = useMindmapStore();
    const { content } = makeContent();
    store.loadFromContent('tab-1', content);
    const before = store.serialized;
    const historyLength = store.history.past.length;

    const broken = createEmptyMindMapDocument('坏文档');
    broken.rootTopicId = 'missing';
    expect(store.replaceDocument(broken)).toBe(false);
    expect(store.serialized).toBe(before);
    expect(store.history.past.length).toBe(historyLength);
  });

  it('replaceDocument 在无文档时返回 false', () => {
    const store = useMindmapStore();
    expect(store.replaceDocument(createEmptyMindMapDocument('x'))).toBe(false);
  });

  it('replaceDocument 内容相同则不记历史', () => {
    const store = useMindmapStore();
    const { content } = makeContent();
    store.loadFromContent('tab-1', content);
    const current = store.document as NonNullable<typeof store.document>;
    const before = store.serialized;
    expect(store.replaceDocument(current)).toBe(false);
    expect(store.serialized).toBe(before);
    expect(store.canUndo).toBe(false);
  });
});

/* ------------------------- 阶段 4A：结构布局模式切换 ------------------------- */

describe('useMindmapStore 阶段 4A：setLayoutMode', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('合法切换更新 document.layoutMode 与 lastSerialized，且可撤销/重做', () => {
    const store = useMindmapStore();
    const { content } = makeContent();
    store.loadFromContent('tab-1', content);
    const before = store.serialized;
    expect(store.document?.layoutMode).toBe('mindmap');

    expect(store.setLayoutMode('org')).toBe(true);
    expect(store.document?.layoutMode).toBe('org');
    expect(store.serialized).not.toBe(before);
    // lastSerialized 必须与当前序列化一致，避免自产回写被当成外部改动
    expect(store.lastSerialized).toBe(store.serialized);
    expect(store.canUndo).toBe(true);
    expect(store.canRedo).toBe(false);

    expect(store.undo()).toBe(true);
    expect(store.document?.layoutMode).toBe('mindmap');
    expect(store.serialized).toBe(before);
    expect(store.lastSerialized).toBe(before);

    expect(store.redo()).toBe(true);
    expect(store.document?.layoutMode).toBe('org');
    expect(store.serialized).toContain('"layoutMode": "org"');
  });

  it('非法模式被拒绝：不写文档、不记历史、返回 false', () => {
    const store = useMindmapStore();
    const { content } = makeContent();
    store.loadFromContent('tab-1', content);
    const before = store.serialized;
    const historyLength = store.history.past.length;

    expect(store.setLayoutMode('radial' as never)).toBe(false);
    expect(store.document?.layoutMode).toBe('mindmap');
    expect(store.serialized).toBe(before);
    expect(store.lastSerialized).toBe(before);
    expect(store.history.past.length).toBe(historyLength);
    expect(store.canUndo).toBe(false);
  });

  it('与当前模式相同返回 false 且不产生历史', () => {
    const store = useMindmapStore();
    const { content } = makeContent();
    store.loadFromContent('tab-1', content);
    const historyLength = store.history.past.length;

    expect(store.setLayoutMode('mindmap')).toBe(false);
    expect(store.history.past.length).toBe(historyLength);
    expect(store.canUndo).toBe(false);
  });

  it('无文档时返回 false', () => {
    const store = useMindmapStore();
    expect(store.setLayoutMode('logic')).toBe(false);
  });

  it('历史快照完整：撤销其它命令后布局模式保持，连撤两步才回到初始布局', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);

    expect(store.setLayoutMode('logic')).toBe(true);
    store.applyCommand('添加子主题', (doc) => addChildTopic(doc, rootId));

    // 先撤销「添加子主题」，布局仍是 logic
    expect(store.undo()).toBe(true);
    expect(store.document?.layoutMode).toBe('logic');
    // 再撤销布局切换
    expect(store.undo()).toBe(true);
    expect(store.document?.layoutMode).toBe('mindmap');
    expect(store.serialized).toBe(content);
  });


  it('updateTopicMeta 写入备注/链接/标签且可撤销', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);
    const before = store.serialized;

    expect(store.updateTopicMeta(rootId, {
      notes: '  备注内容  ',
      link: 'https://example.com',
      labels: [' 标签1 ', '标签2', '标签1', ''],
    })).toBe(true);

    const topic = store.document?.topics[rootId];
    expect(topic?.notes).toBe('备注内容');
    expect(topic?.link).toBe('https://example.com');
    expect(topic?.labels).toEqual(['标签1', '标签2']);
    expect(store.canUndo).toBe(true);

    expect(store.undo()).toBe(true);
    expect(store.serialized).toBe(before);
    expect(store.document?.topics[rootId]?.notes).toBeUndefined();

    expect(store.redo()).toBe(true);
    expect(store.document?.topics[rootId]?.notes).toBe('备注内容');
  });

  it('updateTopicMeta 清空属性时删除对应键，无变化不记历史', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);
    store.updateTopicMeta(rootId, { notes: 'x', link: 'mailto:a@b.com', labels: ['l'] });

    expect(store.updateTopicMeta(rootId, { notes: '', link: '', labels: [] })).toBe(true);
    const topic = store.document?.topics[rootId];
    expect(topic?.notes).toBeUndefined();
    expect(topic?.link).toBeUndefined();
    expect(topic?.labels).toBeUndefined();

    const historyLength = store.history.past.length;
    expect(store.updateTopicMeta(rootId, { notes: '' })).toBe(false);
    expect(store.history.past.length).toBe(historyLength);
  });

  it('updateTopicMeta 未知节点或空 payload 返回 false', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);
    expect(store.updateTopicMeta('ghost', { notes: 'x' })).toBe(false);
    expect(store.updateTopicMeta(rootId, {})).toBe(false);
  });
});
