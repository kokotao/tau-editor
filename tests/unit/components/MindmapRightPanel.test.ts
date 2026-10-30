/**
 * MindmapRightPanel 组件契约测试（UX-3B 返工：大纲列 + 属性列，双列独立）。
 *
 * 覆盖：
 * 1. 双列各自显隐（store.outlineVisible / propertiesVisible）、无顶部 tab / 收起条；
 * 2. 每列各自 resizer（mm-outline-resizer / mm-props-resizer，每个 testid 唯一）
 *    与各自独立宽度（store.outlineWidth / propertiesWidth，clamp 180–420）；
 * 3. 大纲：可见行、搜索过滤与高亮、选中、改名、拖放、右键载荷 emit；
 * 4. 属性：备注/链接/标签、样式、标记、关系、边界/概要的编辑回写（emit change）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MindmapRightPanel from '@/components/editor/mindmap/MindmapRightPanel.vue';
import { useMindmapStore } from '@/stores/mindmap';
import { createEmptyMindMapDocument, serializeMindMapDocument } from '@/services/mindmapService';
import type { MindMapDocument } from '@/types/mindmap';

/** 根 + A(A1) + B 的三层文档。 */
function treeDocument(): MindMapDocument {
  const doc = createEmptyMindMapDocument('右侧面板测试');
  const root = doc.rootTopicId;
  doc.topics.a = { id: 'a', parentId: root, childIds: ['a1'], text: 'A' };
  doc.topics.a1 = { id: 'a1', parentId: 'a', childIds: [], text: 'A1' };
  doc.topics.b = { id: 'b', parentId: root, childIds: [], text: 'B' };
  const rootTopic = doc.topics[root];
  if (rootTopic) rootTopic.childIds = ['a', 'b'];
  return doc;
}

/** 把文档装进 store（默认大纲展开、属性收起）后挂载右面板。 */
function mountPanel(
  document: MindMapDocument = treeDocument(),
  options: { properties?: boolean } = {},
) {
  const store = useMindmapStore();
  store.loadFromContent('tab-mm', serializeMindMapDocument(document));
  // 在挂载前设置，保证首帧就带属性列（等价于用户先点了全局 Toolbar 的属性开关）
  if (options.properties) store.setPropertiesVisible(true);
  const wrapper = mount(MindmapRightPanel);
  return { store, wrapper, document };
}

/** 同上，但属性列一开始就展开。 */
function mountPanelWithProperties(document: MindMapDocument = treeDocument()) {
  return mountPanel(document, { properties: true });
}

/** 取最近一次 change 事件里的文档。 */
function lastDocument(wrapper: ReturnType<typeof mountPanel>['wrapper']): MindMapDocument {
  const emitted = wrapper.emitted('change');
  expect(emitted).toBeTruthy();
  return JSON.parse(emitted![emitted!.length - 1]![0] as string) as MindMapDocument;
}

/** 在 window 上派发指针事件（拖动/松开发生在 window 上）。 */
function dispatchPointer(type: string, clientX: number) {
  window.dispatchEvent(new MouseEvent(type, {
    clientX,
    clientY: 0,
    button: 0,
    bubbles: true,
    cancelable: true,
  }));
}

describe('MindmapRightPanel：双列显隐 / 独立 resizer 与宽度', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('默认只渲染大纲列，属性列收起；没有顶部 tab / 收起条', () => {
    const { wrapper } = mountPanel();

    expect(wrapper.find('[data-testid="mm-right-outline"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mindmap-outline"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mm-right-properties"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="mm-props"]').exists()).toBe(false);

    // 返工后：顶部 tab / 收起工具条已删除（开合由全局 Toolbar 控制）
    expect(wrapper.find('[data-testid="mm-right-tabs"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="mm-right-collapse"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="mm-right-tab-outline"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="mm-right-tab-properties"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="mm-right-panel"]').exists()).toBe(false);
  });

  it('打开属性列后两列并列渲染，各自 resizer 的 testid 唯一（无重复）', () => {
    const { wrapper, store } = mountPanelWithProperties();

    expect(wrapper.find('[data-testid="mm-right-outline"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mm-right-properties"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mindmap-outline"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mm-props"]').exists()).toBe(true);

    // 每列一个 resizer：外层唯一（内部面板 resizer 已按 resizable=false 关闭）
    expect(wrapper.findAll('[data-testid="mm-outline-resizer"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-testid="mm-props-resizer"]')).toHaveLength(1);

    // 两列宽度各自独立（默认都是 280）
    expect(store.outlineWidth).toBe(280);
    expect(store.propertiesWidth).toBe(280);
    expect(wrapper.find('[data-testid="mm-right-outline"]').attributes('style')).toContain('width: 280px');
    expect(wrapper.find('[data-testid="mm-right-properties"]').attributes('style')).toContain('width: 280px');
  });

  it('显隐由 store 驱动：关大纲后属性列仍在，两列可同时关闭', async () => {
    const { wrapper, store } = mountPanelWithProperties();

    store.setOutlineVisible(false);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="mm-right-outline"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="mm-right-properties"]').exists()).toBe(true);

    store.setPropertiesVisible(false);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="mm-right-properties"]').exists()).toBe(false);

    store.setOutlineVisible(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="mm-right-outline"]').exists()).toBe(true);
  });

  it('大纲列 resizer 调宽：只改 outlineWidth（clamp 180–420）', async () => {
    const { wrapper, store } = mountPanel();
    const panel = () => wrapper.find('[data-testid="mm-right-outline"]');
    expect(panel().attributes('style')).toContain('width: 280px');

    await wrapper.find('[data-testid="mm-outline-resizer"]').trigger('pointerdown', {
      button: 0,
      clientX: 600,
    });
    // 向左拖 60px → 340
    dispatchPointer('pointermove', 540);
    await wrapper.vm.$nextTick();
    expect(store.outlineWidth).toBe(340);
    expect(panel().attributes('style')).toContain('width: 340px');

    // 继续向左 → 上限 420
    dispatchPointer('pointermove', -2000);
    await wrapper.vm.$nextTick();
    expect(store.outlineWidth).toBe(420);

    // 向右拖回 → 下限 180
    dispatchPointer('pointermove', 5000);
    await wrapper.vm.$nextTick();
    expect(store.outlineWidth).toBe(180);

    dispatchPointer('pointerup', 5000);
    // 宽度是视图偏好：不产生 change，不写文档
    expect(wrapper.emitted('change')).toBeFalsy();
  });

  it('属性列 resizer 调宽：只改 propertiesWidth，不影响大纲列', async () => {
    const { wrapper, store } = mountPanelWithProperties();
    expect(store.outlineWidth).toBe(280);

    await wrapper.find('[data-testid="mm-props-resizer"]').trigger('pointerdown', {
      button: 0,
      clientX: 500,
    });
    dispatchPointer('pointermove', 440);
    await wrapper.vm.$nextTick();

    expect(store.propertiesWidth).toBe(340);
    expect(store.outlineWidth).toBe(280);
    expect(wrapper.find('[data-testid="mm-right-properties"]').attributes('style'))
      .toContain('width: 340px');

    dispatchPointer('pointermove', -2000);
    await wrapper.vm.$nextTick();
    expect(store.propertiesWidth).toBe(420);

    dispatchPointer('pointerup', 0);
    expect(wrapper.emitted('change')).toBeFalsy();
  });

  it('属性列在没有选中节点时不显示（与面板外移前的 Stage 行为一致）', async () => {
    const { wrapper, store } = mountPanelWithProperties();
    expect(wrapper.find('[data-testid="mm-right-properties"]').exists()).toBe(true);

    store.selectTopic(null);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="mm-right-properties"]').exists()).toBe(false);
    // 大纲列不受影响
    expect(wrapper.find('[data-testid="mm-right-outline"]').exists()).toBe(true);
  });
});

describe('MindmapRightPanel：大纲列', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('渲染可见行、点击选中写回 store', async () => {
    const { wrapper, store, document } = mountPanel();
    expect(wrapper.findAll('.mindmap-row')).toHaveLength(4);
    expect(store.selectedTopicId).toBe(document.rootTopicId);

    const rowB = wrapper.findAll('.mindmap-row')
      .find((row) => row.attributes('data-topic-id') === 'b');
    await rowB!.trigger('click');
    expect(store.selectedTopicId).toBe('b');
    // 选中不属于文档内容：不产生 change
    expect(wrapper.emitted('change')).toBeFalsy();
  });

  it('搜索：只显示命中与祖先并高亮，清空后恢复；无命中时为空', async () => {
    const { wrapper } = mountPanel();
    expect(wrapper.findAll('.mindmap-row')).toHaveLength(4);

    const search = wrapper.find('[data-testid="mm-outline-search"]');
    await search.setValue('A1');
    await wrapper.vm.$nextTick();
    // root / A / A1 三行，其中 A1 为命中
    expect(wrapper.findAll('.mindmap-row')).toHaveLength(3);
    expect(wrapper.findAll('.mindmap-row.is-match')).toHaveLength(1);

    await search.setValue('');
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.mindmap-row')).toHaveLength(4);
    expect(wrapper.findAll('.mindmap-row.is-match')).toHaveLength(0);

    await search.setValue('不存在的节点');
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.mindmap-row')).toHaveLength(0);
  });

  it('双击改名：emit change 并写入文档，可撤销', async () => {
    const { wrapper, store } = mountPanel();
    const rowA = wrapper.findAll('.mindmap-row')
      .find((row) => row.attributes('data-topic-id') === 'a');
    await rowA!.trigger('dblclick');
    await wrapper.vm.$nextTick();

    const input = wrapper.find('[data-testid="mm-rename-input"]');
    expect(input.exists()).toBe(true);
    await input.setValue('改名后的 A');
    await input.trigger('keydown', { key: 'Enter' });
    await wrapper.vm.$nextTick();

    expect(lastDocument(wrapper).topics.a?.text).toBe('改名后的 A');
    expect(store.document?.topics.a?.text).toBe('改名后的 A');

    expect(store.undo()).toBe(true);
    expect(store.document?.topics.a?.text).toBe('A');
  });

  it('折叠/展开走既有命令并 emit change', async () => {
    const { wrapper } = mountPanel();
    const toggle = wrapper.find('.mindmap-row[data-topic-id="a"] .mm-toggle');
    await toggle.trigger('click');
    await wrapper.vm.$nextTick();

    expect(lastDocument(wrapper).topics.a?.collapsed).toBe(true);
  });

  it('拖放改变父级：校验通过后 emit change', async () => {
    const { wrapper } = mountPanel();
    const rowA = wrapper.findAll('.mindmap-row')
      .find((row) => row.attributes('data-topic-id') === 'a');
    const rowB = wrapper.findAll('.mindmap-row')
      .find((row) => row.attributes('data-topic-id') === 'b');
    await rowA!.trigger('dragstart');
    await rowB!.trigger('drop');
    await wrapper.vm.$nextTick();

    const changed = lastDocument(wrapper);
    expect(changed.topics.a?.parentId).toBe('b');
  });

  it('大纲行右键：选中该行并把载荷 emit 给上层（Stage 统一菜单）', async () => {
    const { wrapper, store } = mountPanel();
    const rowA = wrapper.findAll('.mindmap-row')
      .find((row) => row.attributes('data-topic-id') === 'a');
    await rowA!.trigger('contextmenu', { clientX: 210, clientY: 130 });

    expect(store.selectedTopicId).toBe('a');
    const emitted = wrapper.emitted('contextmenu');
    expect(emitted).toHaveLength(1);
    expect(emitted![0]![0]).toEqual({ nodeId: 'a', clientX: 210, clientY: 130 });
  });
});

describe('MindmapRightPanel：属性列', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('应用备注/链接/标签：emit change 并写入文档', async () => {
    const { wrapper } = mountPanelWithProperties();
    await wrapper.find('[data-testid="mm-props-notes"]').setValue('面板备注');
    await wrapper.find('[data-testid="mm-props-link"]').setValue('https://example.com/x');
    await wrapper.find('[data-testid="mm-props-labels"]').setValue('标签1, 标签2');
    await wrapper.find('[data-testid="mm-props-apply"]').trigger('click');
    await wrapper.vm.$nextTick();

    const changed = lastDocument(wrapper);
    const rootId = changed.rootTopicId;
    expect(changed.topics[rootId]?.notes).toBe('面板备注');
    expect(changed.topics[rootId]?.link).toBe('https://example.com/x');
    expect(changed.topics[rootId]?.labels).toEqual(['标签1', '标签2']);
    expect(wrapper.find('[data-testid="mm-right-notice"]').text()).toContain('节点属性已更新');
  });

  it('改样式：emit change 且空值键不写入文档', async () => {
    const { wrapper } = mountPanelWithProperties();
    await wrapper.find('[data-testid="mm-props-style-fill"]').setValue('#e8f1ff');
    await wrapper.vm.$nextTick();

    const changed = lastDocument(wrapper);
    const rootId = changed.rootTopicId;
    expect(changed.topics[rootId]?.style?.fill).toBe('#e8f1ff');

    await wrapper.find('[data-testid="mm-props-style-shape"]').setValue('pill');
    await wrapper.vm.$nextTick();
    expect(lastDocument(wrapper).topics[rootId]?.style).toEqual({
      fill: '#e8f1ff',
      shape: 'pill',
    });
  });

  it('切换标记：emit change，再次点击清除', async () => {
    const { wrapper } = mountPanelWithProperties();
    await wrapper.find('[data-testid="mm-props-marker-priority-1"]').trigger('click');
    await wrapper.vm.$nextTick();

    const rootId = lastDocument(wrapper).rootTopicId;
    expect(lastDocument(wrapper).topics[rootId]?.markers).toEqual(['priority-1']);

    await wrapper.find('[data-testid="mm-props-marker-priority-1"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(lastDocument(wrapper).topics[rootId]?.markers).toBeUndefined();
  });

  it('添加/删除关系线：emit change；重复添加被拒绝时给出提示', async () => {
    const { wrapper } = mountPanelWithProperties();
    await wrapper.find('[data-testid="mm-props-relation-target"]').setValue('a');
    await wrapper.find('[data-testid="mm-props-relation-add"]').trigger('click');
    await wrapper.vm.$nextTick();

    const changed = lastDocument(wrapper);
    const rootId = changed.rootTopicId;
    expect(changed.relations).toHaveLength(1);
    expect(changed.relations?.[0]?.sourceTopicId).toBe(rootId);
    expect(changed.relations?.[0]?.targetTopicId).toBe('a');

    // 重复添加同一对节点：store 拒绝，不产生新的 change
    const changeCount = wrapper.emitted('change')?.length ?? 0;
    await wrapper.find('[data-testid="mm-props-relation-target"]').setValue('a');
    await wrapper.find('[data-testid="mm-props-relation-add"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('change')?.length ?? 0).toBe(changeCount);
    expect(wrapper.find('[data-testid="mm-right-notice"]').text()).toContain('无法添加该关系');

    const relationId = changed.relations?.[0]?.id as string;
    await wrapper.find(`[data-testid="mm-props-relation-remove-${relationId}"]`).trigger('click');
    await wrapper.vm.$nextTick();
    expect(lastDocument(wrapper).relations).toBeUndefined();
  });

  it('设置/清除边界与概要：emit change 并写入文档', async () => {
    const { wrapper } = mountPanelWithProperties();
    const docRootId = (useMindmapStore().document as MindMapDocument).rootTopicId;

    await wrapper.find('[data-testid="mm-props-boundary-label"]').setValue('阶段一');
    await wrapper.find('[data-testid="mm-props-boundary-color"]').setValue('#2563eb');
    await wrapper.find('[data-testid="mm-props-boundary-apply"]').trigger('click');
    await wrapper.vm.$nextTick();

    let changed = lastDocument(wrapper);
    expect(changed.topics[docRootId]?.boundary).toEqual({ label: '阶段一', color: '#2563eb' });

    await wrapper.find('[data-testid="mm-props-summary-text"]').setValue('这是一组子主题');
    await wrapper.find('[data-testid="mm-props-summary-apply"]').trigger('click');
    await wrapper.vm.$nextTick();
    changed = lastDocument(wrapper);
    expect(changed.topics[docRootId]?.summary).toBe('这是一组子主题');

    await wrapper.find('[data-testid="mm-props-boundary-clear"]').trigger('click');
    await wrapper.vm.$nextTick();
    changed = lastDocument(wrapper);
    expect(changed.topics[docRootId]?.boundary).toBeUndefined();

    await wrapper.find('[data-testid="mm-props-summary-clear"]').trigger('click');
    await wrapper.vm.$nextTick();
    changed = lastDocument(wrapper);
    expect(changed.topics[docRootId]?.summary).toBeUndefined();
  });

  it('属性列的关闭按钮只收起属性列（大纲列保留）', async () => {
    const { wrapper, store } = mountPanelWithProperties();
    await wrapper.find('[data-testid="mm-props-close"]').trigger('click');
    expect(store.propertiesVisible).toBe(false);
    expect(wrapper.find('[data-testid="mm-right-properties"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="mm-right-outline"]').exists()).toBe(true);
  });
});
