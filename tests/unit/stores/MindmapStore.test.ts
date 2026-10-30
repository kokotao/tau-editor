import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  DEFAULT_MINDMAP_OUTLINE_WIDTH,
  DEFAULT_MINDMAP_PROPERTIES_WIDTH,
  MINDMAP_RIGHT_PANEL_MAX_WIDTH,
  MINDMAP_RIGHT_PANEL_MIN_WIDTH,
  useMindmapStore,
} from '@/stores/mindmap';
import {
  createEmptyMindMapDocument,
  parseMindMapDocument,
  serializeMindMapDocument,
  validateMindMapDocument,
} from '@/services/mindmapService';
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

/* ------------- 阶段 4C：节点样式 / 标记 / 主题 / 独立关系线 ------------- */

describe('useMindmapStore 阶段 4C：updateTopicStyle', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('写入 color/fill/shape 并同步 lastSerialized，可撤销/重做', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);
    const before = store.serialized;

    expect(store.updateTopicStyle(rootId, {
      color: ' #1f5fbf ',
      fill: '#e8f1ff',
      shape: 'rect',
    })).toBe(true);

    expect(store.document?.topics[rootId]?.style).toEqual({
      color: '#1f5fbf',
      fill: '#e8f1ff',
      shape: 'rect',
    });
    expect(store.lastSerialized).toBe(store.serialized);
    expect(store.canUndo).toBe(true);

    expect(store.undo()).toBe(true);
    expect(store.serialized).toBe(before);
    expect(store.document?.topics[rootId]?.style).toBeUndefined();

    expect(store.redo()).toBe(true);
    expect(store.document?.topics[rootId]?.style?.shape).toBe('rect');
  });

  it('只更新传入的键，undefined 保持原值（部分更新语义）', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);
    store.updateTopicStyle(rootId, { color: '#111111', fill: '#222222' });

    expect(store.updateTopicStyle(rootId, { color: '#333333' })).toBe(true);
    expect(store.document?.topics[rootId]?.style).toEqual({
      color: '#333333',
      fill: '#222222',
    });
  });

  it('空字符串清除对应键，全部清除后删除 style，可撤销', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);
    store.updateTopicStyle(rootId, { color: '#111111', fill: '#222222', shape: 'pill' });

    expect(store.updateTopicStyle(rootId, { color: '', shape: '' })).toBe(true);
    expect(store.document?.topics[rootId]?.style).toEqual({ fill: '#222222' });

    expect(store.updateTopicStyle(rootId, { fill: '' })).toBe(true);
    expect(store.document?.topics[rootId]?.style).toBeUndefined();

    expect(store.undo()).toBe(true);
    expect(store.document?.topics[rootId]?.style).toEqual({ fill: '#222222' });
  });

  it('无实际变化时不记历史并返回 false', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);
    store.updateTopicStyle(rootId, { color: '#111111' });
    const historyLength = store.history.past.length;

    expect(store.updateTopicStyle(rootId, { color: '#111111' })).toBe(false);
    expect(store.updateTopicStyle(rootId, {})).toBe(false);
    expect(store.history.past.length).toBe(historyLength);
    expect(store.document?.topics[rootId]?.style).toEqual({ color: '#111111' });

    // 纯空白按「清除」处理（与 updateTopicMeta 一致）
    expect(store.updateTopicStyle(rootId, { color: '   ' })).toBe(true);
    expect(store.document?.topics[rootId]?.style).toBeUndefined();
  });

  it('未知节点或无文档时返回 false', () => {
    const store = useMindmapStore();
    expect(store.updateTopicStyle('ghost', { color: '#fff' })).toBe(false);

    const { content } = makeContent();
    store.loadFromContent('tab-1', content);
    expect(store.updateTopicStyle('ghost', { color: '#fff' })).toBe(false);
  });
});

describe('useMindmapStore 阶段 4C：标记', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('toggleMarker 先加后删，撤销/重做正确', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);

    expect(store.toggleMarker(rootId, 'priority-1')).toBe(true);
    expect(store.document?.topics[rootId]?.markers).toEqual(['priority-1']);

    expect(store.toggleMarker(rootId, 'star')).toBe(true);
    expect(store.document?.topics[rootId]?.markers).toEqual(['priority-1', 'star']);

    expect(store.undo()).toBe(true);
    expect(store.document?.topics[rootId]?.markers).toEqual(['priority-1']);

    expect(store.toggleMarker(rootId, 'priority-1')).toBe(true);
    expect(store.document?.topics[rootId]?.markers).toBeUndefined();

    expect(store.undo()).toBe(true);
    expect(store.document?.topics[rootId]?.markers).toEqual(['priority-1']);
    expect(store.redo()).toBe(true);
    expect(store.document?.topics[rootId]?.markers).toBeUndefined();
  });

  it('updateTopicMarkers 归一化：去空、去重、保序；空数组删除键', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);

    expect(store.updateTopicMarkers(rootId, [' star ', 'flag', 'star', '', 'question'])).toBe(true);
    expect(store.document?.topics[rootId]?.markers).toEqual(['star', 'flag', 'question']);

    expect(store.updateTopicMarkers(rootId, [])).toBe(true);
    expect(store.document?.topics[rootId]?.markers).toBeUndefined();
    expect(store.serialized).not.toContain('"markers"');
  });

  it('未知节点、空标记或无实际变化返回 false', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);
    const historyLength = store.history.past.length;

    expect(store.toggleMarker('ghost', 'star')).toBe(false);
    expect(store.toggleMarker(rootId, '   ')).toBe(false);
    expect(store.updateTopicMarkers('ghost', ['star'])).toBe(false);
    expect(store.updateTopicMarkers(rootId, [])).toBe(false);
    expect(store.history.past.length).toBe(historyLength);
  });
});

describe('useMindmapStore 阶段 4C：setTheme', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('切换到内置主题并同步 lastSerialized，可撤销/重做', () => {
    const store = useMindmapStore();
    const { content } = makeContent();
    store.loadFromContent('tab-1', content);
    const before = store.serialized;
    expect(store.document?.themeId).toBe('default');

    expect(store.setTheme('ocean')).toBe(true);
    expect(store.document?.themeId).toBe('ocean');
    expect(store.lastSerialized).toBe(store.serialized);

    expect(store.undo()).toBe(true);
    expect(store.document?.themeId).toBe('default');
    expect(store.serialized).toBe(before);

    expect(store.redo()).toBe(true);
    expect(store.document?.themeId).toBe('ocean');
  });

  it('未知主题、与当前相同、无文档时返回 false 且不记历史', () => {
    const store = useMindmapStore();
    expect(store.setTheme('ocean')).toBe(false);

    const { content } = makeContent();
    store.loadFromContent('tab-1', content);
    const historyLength = store.history.past.length;

    expect(store.setTheme('nebula')).toBe(false);
    expect(store.setTheme('')).toBe(false);
    expect(store.setTheme('default')).toBe(false);
    expect(store.document?.themeId).toBe('default');
    expect(store.history.past.length).toBe(historyLength);
  });

  it('主题与其它命令的历史互不干扰', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);

    expect(store.setTheme('forest')).toBe(true);
    store.applyCommand('添加子主题', (doc) => addChildTopic(doc, rootId));

    expect(store.undo()).toBe(true);
    expect(store.document?.themeId).toBe('forest');
    expect(store.undo()).toBe(true);
    expect(store.document?.themeId).toBe('default');
  });
});

describe('useMindmapStore 阶段 4C：独立关系线', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  /** 建一个「根 + 两个子节点」的文档。 */
  function twoChildContent(): { content: string; rootId: string; childA: string; childB: string; store: ReturnType<typeof useMindmapStore> } {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);
    store.applyCommand('添加子主题', (doc) => addChildTopic(doc, rootId));
    const childA = store.selectedTopicId as string;
    store.applyCommand('添加子主题', (doc) => addChildTopic(doc, rootId));
    const childB = store.selectedTopicId as string;
    return { content: store.serialized, rootId, childA, childB, store };
  }

  it('addRelation 生成唯一 id 并带可选标签，可撤销/重做', () => {
    const { store, childA, childB } = twoChildContent();
    const before = store.serialized;

    expect(store.addRelation(childA, childB, ' 依赖 ')).toBe(true);
    const relations = store.document?.relations ?? [];
    expect(relations).toHaveLength(1);
    expect(relations[0]?.sourceTopicId).toBe(childA);
    expect(relations[0]?.targetTopicId).toBe(childB);
    expect(relations[0]?.label).toBe('依赖');
    expect(relations[0]?.id).toMatch(/^rel_/);
    expect(store.lastSerialized).toBe(store.serialized);

    expect(store.undo()).toBe(true);
    expect(store.serialized).toBe(before);
    expect(store.document?.relations).toBeUndefined();

    expect(store.redo()).toBe(true);
    expect(store.document?.relations).toHaveLength(1);
  });

  it('关系 id 互不重复', () => {
    const { store, rootId, childA, childB } = twoChildContent();
    expect(store.addRelation(childA, childB)).toBe(true);
    expect(store.addRelation(rootId, childA)).toBe(true);
    const ids = (store.document?.relations ?? []).map((relation) => relation.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('拒绝自环、重复对（含反向）、端点不存在与非空校验', () => {
    const { store, rootId, childA, childB } = twoChildContent();
    const historyLength = store.history.past.length;

    expect(store.addRelation(childA, childA)).toBe(false);
    expect(store.addRelation('ghost', childB)).toBe(false);
    expect(store.addRelation(childA, 'ghost')).toBe(false);
    expect(store.addRelation('', childB)).toBe(false);

    expect(store.addRelation(childA, childB)).toBe(true);
    const afterAdd = store.history.past.length;
    expect(store.addRelation(childA, childB)).toBe(false);
    expect(store.addRelation(childB, childA)).toBe(false);
    expect(store.addRelation(rootId, childA)).toBe(true);

    expect(afterAdd).toBe(historyLength + 1);
    expect(store.document?.relations).toHaveLength(2);
  });

  it('removeRelation 删除并清理空数组键，可撤销', () => {
    const { store, childA, childB } = twoChildContent();
    store.addRelation(childA, childB);
    const relationId = (store.document?.relations ?? [])[0]?.id as string;

    expect(store.removeRelation(relationId)).toBe(true);
    expect(store.document?.relations).toBeUndefined();
    expect(store.serialized).not.toContain('"relations"');

    expect(store.undo()).toBe(true);
    expect(store.document?.relations).toHaveLength(1);
  });

  it('removeRelation 对不存在的 id、无文档返回 false', () => {
    const store = useMindmapStore();
    expect(store.removeRelation('rel_x')).toBe(false);

    const { content } = makeContent();
    store.loadFromContent('tab-1', content);
    expect(store.removeRelation('rel_x')).toBe(false);
    expect(store.addRelation('a', 'b')).toBe(false);
  });
});

/* ------------------------- 阶段 4E：多工作表 / 多中心主题 ------------------------- */

describe('useMindmapStore 阶段 4E：多工作表', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  /** 加载单工作表文档后新增一张工作表，返回两表状态的关键 id。 */
  function storeWithTwoSheets() {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);
    expect(store.addSheet('第二张')).toBe(true);
    const secondRootId = store.document?.rootTopicId as string;
    const secondSheetId = store.currentSheetId as string;
    const firstSheetId = store.sheets[0]?.id as string;
    return { store, firstRootId: rootId, firstSheetId, secondRootId, secondSheetId };
  }

  it('sheets getter：旧文档（无 sheets）兜底为唯一工作表且 id 稳定', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);

    expect(store.sheets).toHaveLength(1);
    expect(store.sheets[0]?.rootTopicId).toBe(rootId);
    // 兜底 id 由根 id 派生：多次读取必须一致，否则切换/重命名无法定位
    const firstId = store.sheets[0]?.id;
    expect(store.sheets[0]?.id).toBe(firstId);
    expect(store.currentSheetId).toBe(firstId);
  });

  it('无文档时 sheets 为空、currentSheetId 为 null', () => {
    const store = useMindmapStore();
    expect(store.sheets).toEqual([]);
    expect(store.currentSheetId).toBeNull();
  });

  it('addSheet：新增中心主题并切为当前，视口复位、同步 lastSerialized，可撤销/重做', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);
    const before = store.serialized;
    const firstSheetId = store.currentSheetId;
    store.setViewport({ x: 30, y: 40, zoom: 1.5 });

    expect(store.addSheet('第二张')).toBe(true);

    const newRootId = store.document?.rootTopicId as string;
    expect(newRootId).not.toBe(rootId);
    expect(store.sheets).toHaveLength(2);
    expect(store.sheets[1]?.title).toBe('第二张');
    expect(store.sheets[1]?.rootTopicId).toBe(newRootId);

    // 新中心主题：无父、无子、文本与工作表标题一致
    const newRoot = store.document?.topics[newRootId];
    expect(newRoot?.parentId).toBeNull();
    expect(newRoot?.childIds).toEqual([]);
    expect(newRoot?.text).toBe('第二张');

    expect(store.selectedTopicId).toBe(newRootId);
    expect(store.currentSheetId).toBe(store.sheets[1]?.id);
    expect(store.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(store.lastSerialized).toBe(store.serialized);
    expect(store.canUndo).toBe(true);
    // 新增后文档仍合法（多根 + rootTopicId 指向当前工作表）
    expect(validateMindMapDocument(store.document as NonNullable<typeof store.document>).ok).toBe(true);

    expect(store.undo()).toBe(true);
    expect(store.serialized).toBe(before);
    expect(store.document?.rootTopicId).toBe(rootId);
    expect(store.sheets).toHaveLength(1);
    expect(store.currentSheetId).toBe(firstSheetId);

    expect(store.redo()).toBe(true);
    expect(store.document?.rootTopicId).toBe(newRootId);
    expect(store.sheets).toHaveLength(2);
  });

  it('addSheet 默认按序号命名；无文档时返回 false', () => {
    const store = useMindmapStore();
    expect(store.addSheet()).toBe(false);

    const { content } = makeContent();
    store.loadFromContent('tab-1', content);
    expect(store.addSheet()).toBe(true);
    expect(store.sheets[1]?.title).toBe('工作表 2');
    expect(store.addSheet()).toBe(true);
    expect(store.sheets[2]?.title).toBe('工作表 3');
  });

  it('switchSheet：切换 rootTopicId / 选中 / 视口，可撤销；未知与当前返回 false', () => {
    const { store, firstRootId, firstSheetId, secondRootId } = storeWithTwoSheets();
    store.setViewport({ x: 5, y: 6, zoom: 2 });

    expect(store.switchSheet(firstSheetId)).toBe(true);
    expect(store.document?.rootTopicId).toBe(firstRootId);
    expect(store.selectedTopicId).toBe(firstRootId);
    expect(store.currentSheetId).toBe(firstSheetId);
    expect(store.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(store.lastSerialized).toBe(store.serialized);

    const historyLength = store.history.past.length;
    expect(store.switchSheet(firstSheetId)).toBe(false); // 已经是当前工作表
    expect(store.switchSheet('sheet-ghost')).toBe(false); // 未知工作表
    expect(store.history.past.length).toBe(historyLength);

    expect(store.undo()).toBe(true);
    expect(store.document?.rootTopicId).toBe(secondRootId);
    expect(store.redo()).toBe(true);
    expect(store.document?.rootTopicId).toBe(firstRootId);
  });

  it('renameSheet：trim 标题并记住历史；空标题 / 未知 / 无变化返回 false', () => {
    const { store, secondSheetId } = storeWithTwoSheets();
    const before = store.serialized;

    expect(store.renameSheet(secondSheetId, '  重命名后的表  ')).toBe(true);
    expect(store.sheets.find((sheet) => sheet.id === secondSheetId)?.title)
      .toBe('重命名后的表');
    expect(store.lastSerialized).toBe(store.serialized);

    const historyLength = store.history.past.length;
    expect(store.renameSheet(secondSheetId, '重命名后的表')).toBe(false); // 无变化
    expect(store.renameSheet(secondSheetId, '   ')).toBe(false); // 空标题
    expect(store.renameSheet('sheet-ghost', 'x')).toBe(false);
    expect(store.history.past.length).toBe(historyLength);

    expect(store.undo()).toBe(true);
    expect(store.serialized).toBe(before);
    expect(store.sheets.find((sheet) => sheet.id === secondSheetId)?.title).toBe('第二张');
  });

  it('removeSheet：至少保留一个工作表，仅剩一个时返回 false', () => {
    const store = useMindmapStore();
    const { content } = makeContent();
    store.loadFromContent('tab-1', content);
    const before = store.serialized;

    expect(store.removeSheet(store.currentSheetId as string)).toBe(false);
    expect(store.sheets).toHaveLength(1);
    expect(store.serialized).toBe(before);
    expect(store.canUndo).toBe(false);
  });

  it('removeSheet 删除当前工作表：切到剩余第一个、清理子树与关系，可撤销', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);
    expect(store.addSheet('第二张')).toBe(true);

    const secondSheetId = store.currentSheetId as string;
    const secondRootId = store.document?.rootTopicId as string;

    store.applyCommand('添加子主题', (doc) => addChildTopic(doc, secondRootId));
    const childId = store.selectedTopicId as string;
    store.applyCommand('添加子主题', (doc) => addChildTopic(doc, childId));
    const grandChildId = store.selectedTopicId as string;
    // 跨工作表关系线：删除第二张后该关系端点失效，必须一并清理
    expect(store.addRelation(secondRootId, rootId, '跨表')).toBe(true);

    const beforeRemove = store.serialized;
    expect(store.removeSheet(secondSheetId)).toBe(true);

    expect(store.sheets).toHaveLength(1);
    expect(store.document?.rootTopicId).toBe(rootId);
    expect(store.selectedTopicId).toBe(rootId);
    expect(store.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(store.document?.topics[secondRootId]).toBeUndefined();
    expect(store.document?.topics[childId]).toBeUndefined();
    expect(store.document?.topics[grandChildId]).toBeUndefined();
    expect(store.document?.relations).toBeUndefined();
    expect(store.serialized).not.toContain('"relations"');
    expect(validateMindMapDocument(store.document as NonNullable<typeof store.document>).ok).toBe(true);

    expect(store.undo()).toBe(true);
    expect(store.serialized).toBe(beforeRemove);
    expect(store.document?.topics[secondRootId]).toBeDefined();
    expect(store.document?.relations).toHaveLength(1);

    expect(store.redo()).toBe(true);
    expect(store.document?.topics[secondRootId]).toBeUndefined();
  });

  it('removeSheet 删除非当前工作表时保持当前工作表与选中不变', () => {
    const { store, firstSheetId, firstRootId, secondSheetId, secondRootId } = storeWithTwoSheets();
    // 切回第一张，选中第一张的根
    expect(store.switchSheet(firstSheetId)).toBe(true);
    expect(store.selectedTopicId).toBe(firstRootId);

    expect(store.removeSheet(secondSheetId)).toBe(true);
    expect(store.sheets).toHaveLength(1);
    expect(store.sheets[0]?.id).toBe(firstSheetId);
    expect(store.document?.rootTopicId).toBe(firstRootId);
    expect(store.selectedTopicId).toBe(firstRootId);
    expect(store.document?.topics[secondRootId]).toBeUndefined();
  });

  it('removeSheet：选中节点落在被删子树时退回当前工作表根（不留悬空选中）', () => {
    const { store, firstSheetId, firstRootId, secondSheetId, secondRootId } = storeWithTwoSheets();
    expect(store.switchSheet(firstSheetId)).toBe(true);
    // 人为把选中放到另一张工作表的根（如跨表关系端点的场景）
    store.selectTopic(secondRootId);
    expect(store.selectedTopicId).toBe(secondRootId);

    expect(store.removeSheet(secondSheetId)).toBe(true);
    expect(store.selectedTopicId).toBe(firstRootId);
    expect(store.document?.rootTopicId).toBe(firstRootId);
  });


  it('recoverAsEmptyDocument：打开失败态可显式重建为空白导图', () => {
    const store = useMindmapStore();
    store.loadFromContent('tab-1', '{ broken json');
    expect(store.loadError).toBeTruthy();
    expect(store.document).toBeNull();

    expect(store.recoverAsEmptyDocument('恢复的导图')).toBe(true);

    expect(store.loadError).toBeNull();
    expect(store.document?.title).toBe('恢复的导图');
    expect(store.selectedTopicId).toBe(store.document?.rootTopicId);
    // 没有可回退的旧文档，因此不产生撤销历史
    expect(store.canUndo).toBe(false);
    expect(JSON.parse(store.serialized).format).toBe('tau-mindmap');
  });
});

/* ------------------ UX-2：边界（boundary）/ 概要（summary） ------------------ */

describe('useMindmapStore UX-2：setTopicBoundary', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('写入 label/color（trim）并同步 lastSerialized，可撤销/重做', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);
    const before = store.serialized;

    expect(store.setTopicBoundary(rootId, { label: '  阶段一  ', color: ' #2563eb ' })).toBe(true);
    expect(store.document?.topics[rootId]?.boundary).toEqual({
      label: '阶段一',
      color: '#2563eb',
    });
    expect(store.lastSerialized).toBe(store.serialized);
    expect(store.canUndo).toBe(true);

    expect(store.undo()).toBe(true);
    expect(store.serialized).toBe(before);
    expect(store.document?.topics[rootId]?.boundary).toBeUndefined();

    expect(store.redo()).toBe(true);
    expect(store.document?.topics[rootId]?.boundary?.label).toBe('阶段一');
  });

  it('null / 空对象 / 全空白字段都视为清除（删除键，不留空对象噪音）', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);

    store.setTopicBoundary(rootId, { label: '分组' });
    expect(store.document?.topics[rootId]?.boundary).toEqual({ label: '分组' });

    expect(store.setTopicBoundary(rootId, null)).toBe(true);
    expect(store.document?.topics[rootId]?.boundary).toBeUndefined();
    expect(store.serialized).not.toContain('"boundary"');

    expect(store.setTopicBoundary(rootId, { label: '再写一次' })).toBe(true);
    expect(store.setTopicBoundary(rootId, {})).toBe(true);
    expect(store.document?.topics[rootId]?.boundary).toBeUndefined();

    // 已是无边界：再传全空白字段属于「无变化」
    expect(store.setTopicBoundary(rootId, { label: '  ', color: '' })).toBe(false);
    store.setTopicBoundary(rootId, { label: '临时' });
    expect(store.setTopicBoundary(rootId, { label: '  ', color: '' })).toBe(true);
    expect(store.document?.topics[rootId]?.boundary).toBeUndefined();
  });

  it('只写其中一项时省略另一项；无实际变化返回 false 且不记历史', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);

    expect(store.setTopicBoundary(rootId, { color: '#16a34a' })).toBe(true);
    expect(store.document?.topics[rootId]?.boundary).toEqual({ color: '#16a34a' });

    const historyLength = store.history.past.length;
    expect(store.setTopicBoundary(rootId, { color: '#16a34a' })).toBe(false);
    expect(store.setTopicBoundary(rootId, null)).toBe(true);
    expect(store.history.past.length).toBe(historyLength + 1);
    expect(store.setTopicBoundary(rootId, null)).toBe(false);
  });

  it('未知节点或无文档时返回 false', () => {
    const store = useMindmapStore();
    expect(store.setTopicBoundary('ghost', { label: 'x' })).toBe(false);

    const { content } = makeContent();
    store.loadFromContent('tab-1', content);
    expect(store.setTopicBoundary('ghost', { label: 'x' })).toBe(false);
  });
});

describe('useMindmapStore UX-2：setTopicSummary', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('写入概要（trim）并可撤销/重做', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);

    expect(store.setTopicSummary(rootId, '  这组子主题的概要  ')).toBe(true);
    expect(store.document?.topics[rootId]?.summary).toBe('这组子主题的概要');
    expect(store.serialized).toContain('这组子主题的概要');

    expect(store.undo()).toBe(true);
    expect(store.document?.topics[rootId]?.summary).toBeUndefined();
    expect(store.redo()).toBe(true);
    expect(store.document?.topics[rootId]?.summary).toBe('这组子主题的概要');
  });

  it('null / 空白文本清除键，无实际变化返回 false', () => {
    const store = useMindmapStore();
    const { content, rootId } = makeContent();
    store.loadFromContent('tab-1', content);

    expect(store.setTopicSummary(rootId, null)).toBe(false);
    expect(store.setTopicSummary(rootId, '   ')).toBe(false);

    store.setTopicSummary(rootId, '概要');
    expect(store.setTopicSummary(rootId, '概要')).toBe(false);
    expect(store.setTopicSummary(rootId, '   ')).toBe(true);
    expect(store.document?.topics[rootId]?.summary).toBeUndefined();
    expect(store.serialized).not.toContain('"summary"');
  });

  it('未知节点或无文档时返回 false', () => {
    const store = useMindmapStore();
    expect(store.setTopicSummary('ghost', 'x')).toBe(false);

    const { content } = store && makeContent();
    store.loadFromContent('tab-1', content);
    expect(store.setTopicSummary('ghost', 'x')).toBe(false);
  });
});

describe('UX-2 持久化：boundary / summary 随文档往返', () => {
  it('序列化 → 解析后边界与概要仍然存在，且结构校验通过', () => {
    const doc = createEmptyMindMapDocument('往返测试');
    const rootId = doc.rootTopicId;
    doc.topics[rootId] = {
      ...doc.topics[rootId]!,
      boundary: { label: '分组', color: '#2563eb' },
      summary: '概要文本',
    };

    const content = serializeMindMapDocument(doc);
    const parsed = parseMindMapDocument(content);
    expect(parsed.topics[rootId]?.boundary).toEqual({ label: '分组', color: '#2563eb' });
    expect(parsed.topics[rootId]?.summary).toBe('概要文本');
    expect(validateMindMapDocument(parsed).ok).toBe(true);
  });
});

/* ------------- UX-3B 返工：右侧两列（大纲 / 属性）显隐与宽度状态 ------------- */

describe('useMindmapStore UX-3B：右侧两列状态', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('默认：大纲列展开、属性列收起，两列宽度都是 280', () => {
    const store = useMindmapStore();
    expect(store.outlineVisible).toBe(true);
    expect(store.propertiesVisible).toBe(false);
    expect(store.outlineWidth).toBe(DEFAULT_MINDMAP_OUTLINE_WIDTH);
    expect(store.propertiesWidth).toBe(DEFAULT_MINDMAP_PROPERTIES_WIDTH);
    expect(DEFAULT_MINDMAP_OUTLINE_WIDTH).toBe(280);
    expect(DEFAULT_MINDMAP_PROPERTIES_WIDTH).toBe(280);
  });

  it('setOutlineVisible / setPropertiesVisible：两列互相独立，同值返回 false', () => {
    const store = useMindmapStore();

    expect(store.setOutlineVisible(false)).toBe(true);
    expect(store.outlineVisible).toBe(false);
    expect(store.setOutlineVisible(false)).toBe(false);

    // 属性列独立：开属性不影响大纲
    expect(store.setPropertiesVisible(true)).toBe(true);
    expect(store.propertiesVisible).toBe(true);
    expect(store.outlineVisible).toBe(false);
    expect(store.setPropertiesVisible(true)).toBe(false);
  });

  it('toggle 语义：同一面板开→关、关→开，两列可同时打开', () => {
    const store = useMindmapStore();

    expect(store.toggleOutlineVisible()).toBe(false);
    expect(store.outlineVisible).toBe(false);
    expect(store.toggleOutlineVisible()).toBe(true);
    expect(store.outlineVisible).toBe(true);

    expect(store.togglePropertiesVisible()).toBe(true);
    expect(store.propertiesVisible).toBe(true);
    // 两列同时展开是允许的（旧 Stage 也能同时显示大纲 + 属性）
    expect(store.outlineVisible).toBe(true);
    expect(store.propertiesVisible).toBe(true);

    expect(store.togglePropertiesVisible()).toBe(false);
    expect(store.propertiesVisible).toBe(false);
  });

  it('setOutlineWidth / setPropertiesWidth：各自 clamp 到 180–420 并取整', () => {
    const store = useMindmapStore();

    expect(store.setOutlineWidth(320)).toBe(320);
    expect(store.setOutlineWidth(50)).toBe(MINDMAP_RIGHT_PANEL_MIN_WIDTH);
    expect(store.setOutlineWidth(9999)).toBe(MINDMAP_RIGHT_PANEL_MAX_WIDTH);
    expect(store.setOutlineWidth(240.6)).toBe(241);
    expect(store.setOutlineWidth(Number.NaN)).toBe(DEFAULT_MINDMAP_OUTLINE_WIDTH);

    // 属性列宽度独立，不受大纲列影响
    expect(store.setPropertiesWidth(360)).toBe(360);
    expect(store.outlineWidth).toBe(DEFAULT_MINDMAP_OUTLINE_WIDTH);
    expect(store.propertiesWidth).toBe(360);
    expect(store.setPropertiesWidth(9999)).toBe(MINDMAP_RIGHT_PANEL_MAX_WIDTH);
    expect(store.outlineWidth).toBe(DEFAULT_MINDMAP_OUTLINE_WIDTH);
  });

  it('resetRightPanels：恢复「大纲开、属性关、两列 280」', () => {
    const store = useMindmapStore();
    store.setOutlineVisible(false);
    store.setPropertiesVisible(true);
    store.setOutlineWidth(400);
    store.setPropertiesWidth(200);

    store.resetRightPanels();
    expect(store.outlineVisible).toBe(true);
    expect(store.propertiesVisible).toBe(false);
    expect(store.outlineWidth).toBe(DEFAULT_MINDMAP_OUTLINE_WIDTH);
    expect(store.propertiesWidth).toBe(DEFAULT_MINDMAP_PROPERTIES_WIDTH);
  });

  it('面板状态是视图偏好：不进历史、不改序列化内容', () => {
    const store = useMindmapStore();
    const { content } = makeContent();
    store.loadFromContent('tab-1', content);
    const serialized = store.serialized;

    store.togglePropertiesVisible();
    store.setOutlineWidth(360);
    store.setPropertiesWidth(200);
    store.toggleOutlineVisible();

    expect(store.serialized).toBe(serialized);
    expect(store.canUndo).toBe(false);
    expect(store.history.past.length).toBe(0);
    // lastSerialized 也不受影响，避免被误判为自产回写
    expect(store.lastSerialized).toBe(serialized);
  });
});

