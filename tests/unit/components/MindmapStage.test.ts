/**
 * MindmapStage 阶段 1 组件契约测试：
 * 大纲树渲染、键盘新增/改名/删除确认/撤销，以及 change 事件把序列化 JSON 交回标签管线。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MindmapStage from '@/components/editor/mindmap/MindmapStage.vue';
import { createEmptyMindMapDocument, serializeMindMapDocument } from '@/services/mindmapService';
import type { MindMapDocument } from '@/types/mindmap';

function treeDocument(): MindMapDocument {
  const doc = createEmptyMindMapDocument('组件测试');
  const root = doc.rootTopicId;
  doc.topics.a = { id: 'a', parentId: root, childIds: ['a1'], text: 'A' };
  doc.topics.a1 = { id: 'a1', parentId: 'a', childIds: [], text: 'A1' };
  doc.topics.b = { id: 'b', parentId: root, childIds: [], text: 'B' };
  const rootTopic = doc.topics[root];
  if (rootTopic) rootTopic.childIds = ['a', 'b'];
  return doc;
}

function mountStage(content: string) {
  return mount(MindmapStage, {
    props: {
      tabId: 'tab-mm',
      documentJson: content,
      fileName: 'test.taumap',
      documentKind: 'mindmap' as const,
    },
  });
}

describe('MindmapStage 阶段 1', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('渲染整棵大纲树并默认选中中心主题', () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    const rows = wrapper.findAll('.mindmap-row');
    expect(rows).toHaveLength(4);
    expect(wrapper.find('.mindmap-row.is-selected').exists()).toBe(true);
    expect(wrapper.text()).toContain('A1');
  });

  it('Tab 添加子主题并 emit change', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    await wrapper.find('[data-testid="mindmap-tree"]').trigger('keydown', { key: 'Tab' });

    const emitted = wrapper.emitted('change');
    expect(emitted).toBeTruthy();
    const json = emitted![emitted!.length - 1]![0] as string;
    expect(JSON.parse(json).topics).toBeTypeOf('object');
    expect(wrapper.findAll('.mindmap-row')).toHaveLength(5);
  });

  it('F2 进入改名并提交后 emit change', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    await wrapper.find('[data-testid="mindmap-tree"]').trigger('keydown', { key: 'F2' });
    await wrapper.vm.$nextTick();

    const input = wrapper.find('[data-testid="mm-rename-input"]');
    expect(input.exists()).toBe(true);
    await input.setValue('中心新名');
    await input.trigger('keydown', { key: 'Enter' });

    const emitted = wrapper.emitted('change');
    expect(emitted).toBeTruthy();
    const json = emitted![emitted!.length - 1]![0] as string;
    expect(json).toContain('中心新名');
  });

  it('删除含子树的节点先弹确认，确认后才 emit change', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));

    // 选中 A（有 1 个子节点）
    const rowA = wrapper.findAll('.mindmap-row').find((row) => row.attributes('data-topic-id') === 'a');
    expect(rowA).toBeTruthy();
    await rowA!.trigger('click');
    await wrapper.find('[data-testid="mindmap-tree"]').trigger('keydown', { key: 'Delete' });

    expect(wrapper.find('[data-testid="mindmap-confirm"]').exists()).toBe(true);
    expect(wrapper.emitted('change')).toBeFalsy();

    await wrapper.find('[data-testid="mm-confirm-ok"]').trigger('click');
    const emitted = wrapper.emitted('change');
    expect(emitted).toBeTruthy();
    const json = emitted![emitted!.length - 1]![0] as string;
    const parsed = JSON.parse(json) as MindMapDocument;
    expect(parsed.topics.a).toBeUndefined();
    expect(parsed.topics.a1).toBeUndefined();
  });

  it('Ctrl+Z 撤销后 emit 回退后的内容', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    const tree = wrapper.find('[data-testid="mindmap-tree"]');

    await tree.trigger('keydown', { key: 'Tab' });
    expect(wrapper.findAll('.mindmap-row')).toHaveLength(5);

    await tree.trigger('keydown', { key: 'z', ctrlKey: true });
    expect(wrapper.findAll('.mindmap-row')).toHaveLength(4);

    const emitted = wrapper.emitted('change')!;
    const lastJson = emitted[emitted.length - 1]![0] as string;
    expect(JSON.parse(lastJson).topics.a1).toBeDefined();
  });

  it('外部格式只显示提示，不进入编辑树', () => {
    const external = mount(MindmapStage, {
      props: {
        tabId: 'tab-x',
        documentJson: 'PK fake',
        fileName: 'plan.xmind',
        documentKind: 'mindmap-external' as const,
      },
    });
    expect(external.find('[data-testid="mindmap-external-notice"]').exists()).toBe(true);
    expect(external.find('[data-testid="mindmap-tree"]').exists()).toBe(false);
  });

  it('损坏 JSON 显示安全失败提示，不渲染编辑树', () => {
    const wrapper = mountStage('{ broken json');
    expect(wrapper.find('[data-testid="mindmap-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mindmap-tree"]').exists()).toBe(false);
  });

  it('阶段 2：画布与大纲同时渲染', () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    expect(wrapper.find('[data-testid="mindmap-canvas"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mindmap-outline"]').exists()).toBe(true);
    expect(wrapper.findAll('.mm-node')).toHaveLength(4);
    expect(wrapper.findAll('.mindmap-row')).toHaveLength(4);
  });

  it('阶段 2：画布点击选中在画布与大纲间同步', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    const nodeB = wrapper.find('.mm-node[data-node-id="b"]');
    expect(nodeB.exists()).toBe(true);
    await nodeB.trigger('click');
    await wrapper.vm.$nextTick();

    const canvasSelected = wrapper.find('.mm-node.is-selected');
    expect(canvasSelected.attributes('data-node-id')).toBe('b');
    const outlineSelected = wrapper.find('.mindmap-row.is-selected');
    expect(outlineSelected.attributes('data-topic-id')).toBe('b');
  });

  it('阶段 2：大纲点击选中同步到画布', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    const rowA1 = wrapper.findAll('.mindmap-row')
      .find((row) => row.attributes('data-topic-id') === 'a1');
    expect(rowA1).toBeTruthy();
    await rowA1!.trigger('click');
    await wrapper.vm.$nextTick();
    const canvasSelected = wrapper.find('.mm-node.is-selected');
    expect(canvasSelected.attributes('data-node-id')).toBe('a1');
  });

  it('阶段 2：视口操作不触发 change 且不影响 dirty', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    await wrapper.find('[data-testid="mindmap-canvas"]').trigger('wheel', {
      deltaY: -120,
      clientX: 200,
      clientY: 200,
    });
    expect(wrapper.emitted('change')).toBeFalsy();
  });

  it('阶段 2：大纲面板可收起', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    expect(wrapper.find('[data-testid="mindmap-outline"]').exists()).toBe(true);
    await wrapper.find('[data-testid="mm-toggle-outline"]').trigger('click');
    expect(wrapper.find('[data-testid="mindmap-outline"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="mindmap-canvas"]').exists()).toBe(true);
  });

  it('阶段 2：画布折叠按钮隐藏子节点并 emit change', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    const nodeA = wrapper.find('.mm-node[data-node-id="a"]');
    await nodeA.find('.mm-toggle').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.mm-node[data-node-id="a1"]').exists()).toBe(false);
    expect(wrapper.emitted('change')).toBeTruthy();
  });
});

/* --------------------------- 阶段 4A：结构布局切换 --------------------------- */

describe('MindmapStage 阶段 4A', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  /** 取最近一次 change 事件里的文档。 */
  function lastChangedDocument(wrapper: ReturnType<typeof mountStage>): MindMapDocument {
    const emitted = wrapper.emitted('change');
    expect(emitted).toBeTruthy();
    return JSON.parse(emitted![emitted!.length - 1]![0] as string) as MindMapDocument;
  }

  it('工具栏提供四种布局按钮，默认导图为激活态', () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    for (const mode of ['mindmap', 'logic', 'tree', 'org']) {
      expect(wrapper.find(`[data-testid="mm-layout-${mode}"]`).exists()).toBe(true);
    }
    expect(wrapper.find('[data-testid="mm-layout-mindmap"]').classes()).toContain('is-active');
    expect(wrapper.find('[data-testid="mm-layout-mindmap"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[data-testid="mm-layout-org"]').attributes('aria-pressed')).toBe('false');
  });

  it('点击组织图按钮：emit change 且按钮激活态切换', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    await wrapper.find('[data-testid="mm-layout-org"]').trigger('click');

    expect(lastChangedDocument(wrapper).layoutMode).toBe('org');
    expect(wrapper.find('[data-testid="mm-layout-org"]').classes()).toContain('is-active');
    expect(wrapper.find('[data-testid="mm-layout-org"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[data-testid="mm-layout-mindmap"]').classes()).not.toContain('is-active');
    expect(wrapper.find('[data-testid="mm-layout-mindmap"]').attributes('aria-pressed')).toBe('false');
  });

  it('切换为 org 后画布节点数不变，连线变为竖直方向', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    expect(wrapper.findAll('.mm-edge[data-orientation="horizontal"]')).toHaveLength(3);

    await wrapper.find('[data-testid="mm-layout-org"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.mm-node')).toHaveLength(4);
    expect(wrapper.findAll('.mm-edge[data-orientation="vertical"]')).toHaveLength(3);
    expect(wrapper.findAll('.mm-edge[data-orientation="horizontal"]')).toHaveLength(0);
  });

  it('点击当前模式不产生 change（幂等）', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    await wrapper.find('[data-testid="mm-layout-mindmap"]').trigger('click');
    expect(wrapper.emitted('change')).toBeFalsy();
  });

  it('布局切换可通过 Ctrl+Z 撤销并回写文档', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    const tree = wrapper.find('[data-testid="mindmap-tree"]');

    await wrapper.find('[data-testid="mm-layout-logic"]').trigger('click');
    expect(lastChangedDocument(wrapper).layoutMode).toBe('logic');

    await tree.trigger('keydown', { key: 'z', ctrlKey: true });
    expect(lastChangedDocument(wrapper).layoutMode).toBe('mindmap');
    expect(wrapper.find('[data-testid="mm-layout-mindmap"]').classes()).toContain('is-active');

    // 重做回到 logic
    await tree.trigger('keydown', { key: 'z', ctrlKey: true, shiftKey: true });
    expect(lastChangedDocument(wrapper).layoutMode).toBe('logic');
    expect(wrapper.find('[data-testid="mm-layout-logic"]').classes()).toContain('is-active');
  });


  it('属性面板：开关、应用备注/链接/标签并 emit change', async () => {
    const doc = treeDocument();
    const rootId = doc.rootTopicId;
    const wrapper = mountStage(serializeMindMapDocument(doc));

    expect(wrapper.find('[data-testid="mm-props"]').exists()).toBe(false);
    await wrapper.find('[data-testid="mm-properties-toggle"]').trigger('click');
    expect(wrapper.find('[data-testid="mm-props"]').exists()).toBe(true);

    await wrapper.find('[data-testid="mm-props-notes"]').setValue('阶段4备注');
    await wrapper.find('[data-testid="mm-props-link"]').setValue('https://example.com/x');
    await wrapper.find('[data-testid="mm-props-labels"]').setValue('标签1, 标签2');
    await wrapper.find('[data-testid="mm-props-apply"]').trigger('click');
    await wrapper.vm.$nextTick();

    const updated = lastChangedDocument(wrapper);
    expect(updated.topics[rootId]?.notes).toBe('阶段4备注');
    expect(updated.topics[rootId]?.link).toBe('https://example.com/x');
    expect(updated.topics[rootId]?.labels).toEqual(['标签1', '标签2']);
  });

  it('大纲搜索：只显示命中与祖先并高亮，清空后恢复', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
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
  });

  it('大纲搜索无命中时显示空结果', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    await wrapper.find('[data-testid="mm-outline-search"]').setValue('不存在的节点');
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.mindmap-row')).toHaveLength(0);
  });
});

/* ------------- 阶段 4C：样式 / 标记 / 关系线 / 主题模板接线 ------------- */

describe('MindmapStage 阶段 4C', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  /** 取最近一次 change 事件里的文档。 */
  function lastDocument(wrapper: ReturnType<typeof mountStage>): MindMapDocument {
    const emitted = wrapper.emitted('change');
    expect(emitted).toBeTruthy();
    return JSON.parse(emitted![emitted!.length - 1]![0] as string) as MindMapDocument;
  }

  it('属性面板改样式：emit change 且写入 topic.style', async () => {
    const doc = treeDocument();
    const rootId = doc.rootTopicId;
    const wrapper = mountStage(serializeMindMapDocument(doc));
    await wrapper.find('[data-testid="mm-properties-toggle"]').trigger('click');

    await wrapper.find('[data-testid="mm-props-style-fill"]').setValue('#e8f1ff');
    await wrapper.vm.$nextTick();

    const style = lastDocument(wrapper).topics[rootId]?.style;
    expect(style?.fill).toBe('#e8f1ff');
    // 受控：面板控件跟随 store 回填
    expect((wrapper.find('[data-testid="mm-props-style-fill"]').element as HTMLSelectElement).value)
      .toBe('#e8f1ff');

    // 再改形状 → 新的 change，且保留已有填充（空值键不写入文档）
    await wrapper.find('[data-testid="mm-props-style-shape"]').setValue('pill');
    await wrapper.vm.$nextTick();
    expect(lastDocument(wrapper).topics[rootId]?.style).toEqual({
      fill: '#e8f1ff',
      shape: 'pill',
    });
  });

  it('属性面板样式改动可撤销', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    await wrapper.find('[data-testid="mm-properties-toggle"]').trigger('click');
    await wrapper.find('[data-testid="mm-props-style-fill"]').setValue('#e8f1ff');
    await wrapper.vm.$nextTick();

    await wrapper.find('[data-testid="mindmap-tree"]').trigger('keydown', { key: 'z', ctrlKey: true });
    await wrapper.vm.$nextTick();
    expect(lastDocument(wrapper).topics[treeDocument().rootTopicId]?.style).toBeUndefined();
  });

  it('属性面板切换标记：emit change，画布出现徽章，再次点击清除', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    await wrapper.find('[data-testid="mm-properties-toggle"]').trigger('click');
    expect(wrapper.findAll('[data-testid="mm-marker"]')).toHaveLength(0);

    await wrapper.find('[data-testid="mm-props-marker-priority-1"]').trigger('click');
    await wrapper.vm.$nextTick();

    const rootId = lastDocument(wrapper).rootTopicId;
    expect(lastDocument(wrapper).topics[rootId]?.markers).toEqual(['priority-1']);
    expect(wrapper.findAll('[data-testid="mm-marker"]')).toHaveLength(1);

    await wrapper.find('[data-testid="mm-props-marker-priority-1"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(lastDocument(wrapper).topics[rootId]?.markers).toBeUndefined();
    expect(wrapper.findAll('[data-testid="mm-marker"]')).toHaveLength(0);
  });

  it('属性面板添加关系：emit change、画布渲染关系线，随后可删除', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    await wrapper.find('[data-testid="mm-properties-toggle"]').trigger('click');
    expect(wrapper.findAll('[data-testid="mm-relation"]')).toHaveLength(0);

    // 中心主题为源，选择节点 A 作为目标
    await wrapper.find('[data-testid="mm-props-relation-target"]').setValue('a');
    await wrapper.find('[data-testid="mm-props-relation-add"]').trigger('click');
    await wrapper.vm.$nextTick();

    const changed = lastDocument(wrapper);
    const rootId = changed.rootTopicId;
    expect(changed.relations).toHaveLength(1);
    expect(changed.relations?.[0]?.sourceTopicId).toBe(rootId);
    expect(changed.relations?.[0]?.targetTopicId).toBe('a');
    expect(wrapper.findAll('[data-testid="mm-relation"]')).toHaveLength(1);

    // 删除关系
    const relationId = changed.relations?.[0]?.id as string;
    await wrapper.find(`[data-testid="mm-props-relation-remove-${relationId}"]`).trigger('click');
    await wrapper.vm.$nextTick();

    expect(lastDocument(wrapper).relations).toBeUndefined();
    expect(wrapper.findAll('[data-testid="mm-relation"]')).toHaveLength(0);
  });

  it('添加关系被拒绝时（自环/重复）不产生 change，并给出提示', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    await wrapper.find('[data-testid="mm-properties-toggle"]').trigger('click');
    await wrapper.find('[data-testid="mm-props-relation-target"]').setValue('a');
    await wrapper.find('[data-testid="mm-props-relation-add"]').trigger('click');
    await wrapper.vm.$nextTick();
    const changeCount = wrapper.emitted('change')?.length ?? 0;

    // 同一对节点再添加一次（重复）：store 拒绝，不 emit change
    await wrapper.find('[data-testid="mm-props-relation-target"]').setValue('a');
    await wrapper.find('[data-testid="mm-props-relation-add"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('change')?.length ?? 0).toBe(changeCount);
    expect(wrapper.find('[data-testid="mindmap-notice"]').text()).toContain('无法添加该关系');
  });

  it('工具栏切换主题：emit change、画布换色、可撤销', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    const canvas = wrapper.find('[data-testid="mindmap-canvas"]');
    expect(canvas.attributes('data-theme-id')).toBe('default');

    const select = wrapper.find('[data-testid="mm-theme-select"]');
    expect(select.findAll('option').map((option) => option.attributes('value')))
      .toEqual(['default', 'ocean', 'forest', 'sunset']);

    await select.setValue('ocean');
    await wrapper.vm.$nextTick();

    expect(lastDocument(wrapper).themeId).toBe('ocean');
    expect(wrapper.find('[data-testid="mindmap-canvas"]').attributes('data-theme-id')).toBe('ocean');
    expect(wrapper.find('[data-testid="mindmap-canvas"]').attributes('style')).toContain('--mindmap-node-bg');

    await wrapper.find('[data-testid="mindmap-tree"]').trigger('keydown', { key: 'z', ctrlKey: true });
    await wrapper.vm.$nextTick();
    expect(lastDocument(wrapper).themeId).toBe('default');
    expect(wrapper.find('[data-testid="mindmap-canvas"]').attributes('data-theme-id')).toBe('default');
  });

  it('主题切换是幂等的：选中当前主题不产生 change', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    await wrapper.find('[data-testid="mm-theme-select"]').setValue('default');
    expect(wrapper.emitted('change')).toBeFalsy();
  });
});

/* ---------------------- 阶段 4E：多工作表 / 多中心主题 ---------------------- */

describe('MindmapStage 阶段 4E', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  /** 取最近一次 change 事件里的文档。 */
  function lastDocument(wrapper: ReturnType<typeof mountStage>): MindMapDocument {
    const emitted = wrapper.emitted('change');
    expect(emitted).toBeTruthy();
    return JSON.parse(emitted![emitted!.length - 1]![0] as string) as MindMapDocument;
  }

  /** 两张工作表的文档：工作表 1 = treeDocument 的根，工作表 2 = 独立根 + 一个子节点。 */
  function multiSheetDocument(): MindMapDocument {
    const doc = treeDocument();
    doc.topics.sheet2 = { id: 'sheet2', parentId: null, childIds: ['s2a'], text: '第二张' };
    doc.topics.s2a = { id: 's2a', parentId: 'sheet2', childIds: [], text: 'S2A' };
    doc.sheets = [
      { id: 'sheet-1', title: '工作表 1', rootTopicId: doc.rootTopicId },
      { id: 'sheet-2', title: '第二张', rootTopicId: 'sheet2' },
    ];
    return doc;
  }

  it('切换条渲染：旧文档兜底为单个工作表，仅剩一个时删除按钮禁用', () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));

    expect(wrapper.find('[data-testid="mm-sheet-bar"]').exists()).toBe(true);
    const tabs = wrapper.findAll('[data-testid^="mm-sheet-tab-"]');
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.text()).toBe('工作表 1');
    expect(tabs[0]?.classes()).toContain('is-active');
    expect(tabs[0]?.attributes('aria-selected')).toBe('true');

    expect(wrapper.find('[data-testid="mm-sheet-add"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mm-sheet-remove"]').attributes('disabled')).toBeDefined();
  });

  it('点击工作表标签切换：emit change、激活态切换、画布渲染新工作表的根', async () => {
    const doc = multiSheetDocument();
    const wrapper = mountStage(serializeMindMapDocument(doc));
    expect(wrapper.find('[data-testid="mm-sheet-tab-0"]').classes()).toContain('is-active');

    await wrapper.find('[data-testid="mm-sheet-tab-1"]').trigger('click');
    await wrapper.vm.$nextTick();

    const changed = lastDocument(wrapper);
    expect(changed.rootTopicId).toBe('sheet2');
    expect(wrapper.find('[data-testid="mm-sheet-tab-1"]').classes()).toContain('is-active');
    expect(wrapper.find('[data-testid="mm-sheet-tab-0"]').classes()).not.toContain('is-active');
    // 画布/大纲只渲染当前工作表的子树（第二张：根 + 1 个子节点）
    expect(wrapper.findAll('.mm-node')).toHaveLength(2);
    expect(wrapper.findAll('.mindmap-row')).toHaveLength(2);
    expect(wrapper.find('.mm-node.is-selected').attributes('data-node-id')).toBe('sheet2');
  });

  it('切换工作表可撤销（Ctrl+Z 回到原工作表）', async () => {
    const doc = multiSheetDocument();
    const wrapper = mountStage(serializeMindMapDocument(doc));

    await wrapper.find('[data-testid="mm-sheet-tab-1"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(lastDocument(wrapper).rootTopicId).toBe('sheet2');

    await wrapper.find('[data-testid="mindmap-tree"]').trigger('keydown', { key: 'z', ctrlKey: true });
    await wrapper.vm.$nextTick();

    expect(lastDocument(wrapper).rootTopicId).toBe(doc.rootTopicId);
    expect(wrapper.find('[data-testid="mm-sheet-tab-0"]').classes()).toContain('is-active');
  });

  it('mm-sheet-add 新增工作表：数量 +1、切到新根、emit change', async () => {
    const doc = treeDocument();
    const originalRoot = doc.rootTopicId;
    const wrapper = mountStage(serializeMindMapDocument(doc));
    expect(wrapper.findAll('[data-testid^="mm-sheet-tab-"]')).toHaveLength(1);

    await wrapper.find('[data-testid="mm-sheet-add"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('[data-testid^="mm-sheet-tab-"]')).toHaveLength(2);
    const changed = lastDocument(wrapper);
    expect(changed.sheets).toHaveLength(2);
    expect(changed.sheets?.[1]?.title).toBe('工作表 2');
    expect(changed.rootTopicId).not.toBe(originalRoot);
    // 新工作表只有中心主题本身
    expect(wrapper.findAll('.mm-node')).toHaveLength(1);
    expect(wrapper.find('[data-testid="mm-sheet-tab-1"]').classes()).toContain('is-active');
    // 已有两个工作表 → 删除按钮可用
    expect(wrapper.find('[data-testid="mm-sheet-remove"]').attributes('disabled')).toBeUndefined();
  });

  it('mm-sheet-remove 删除当前工作表：数量 -1、切回剩余工作表并 emit change', async () => {
    const doc = multiSheetDocument();
    const wrapper = mountStage(serializeMindMapDocument(doc));

    await wrapper.find('[data-testid="mm-sheet-tab-1"]').trigger('click');
    await wrapper.vm.$nextTick();

    await wrapper.find('[data-testid="mm-sheet-remove"]').trigger('click');
    await wrapper.vm.$nextTick();

    const changed = lastDocument(wrapper);
    expect(changed.sheets).toHaveLength(1);
    expect(changed.rootTopicId).toBe(doc.rootTopicId);
    expect(changed.topics.sheet2).toBeUndefined();
    expect(wrapper.findAll('[data-testid^="mm-sheet-tab-"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="mm-sheet-tab-0"]').classes()).toContain('is-active');
    expect(wrapper.find('[data-testid="mm-sheet-remove"]').attributes('disabled')).toBeDefined();
  });


  it('阶段 4：损坏/空 .taumap 可一键新建空白导图覆盖', async () => {
    const wrapper = mountStage('{ broken json');
    expect(wrapper.find('[data-testid="mindmap-error"]').exists()).toBe(true);

    const button = wrapper.find('[data-testid="mm-error-create-empty"]');
    expect(button.exists()).toBe(true);
    await button.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="mindmap-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="mindmap-canvas"]').exists()).toBe(true);

    const emitted = wrapper.emitted('change');
    expect(emitted).toBeTruthy();
    const json = JSON.parse(emitted![emitted!.length - 1]![0] as string);
    expect(json.format).toBe('tau-mindmap');
    expect(Object.keys(json.topics)).toHaveLength(1);
  });
});

/* ------------------- UX-1：右键菜单 + 面板拖拽调宽 ------------------- */

/** 在 window 上派发指针事件（拖动/松开发生在 window 上）。 */
function dispatchResizePointer(type: string, clientX: number) {
  window.dispatchEvent(new MouseEvent(type, {
    clientX,
    clientY: 0,
    button: 0,
    bubbles: true,
    cancelable: true,
  }));
}

/** 当前文档中渲染出的右键菜单项 testid 列表。 */
function menuItemTestIds(): string[] {
  return [...document.querySelectorAll('[data-testid^="mm-context-item-"]')]
    .map((element) => element.getAttribute('data-testid') ?? '');
}

function clickMenuItem(id: string) {
  const element = document.querySelector(`[data-testid="mm-context-item-${id}"]`) as HTMLElement | null;
  if (!element) throw new Error(`右键菜单中不存在菜单项：${id}`);
  element.click();
}

describe('MindmapStage UX-1', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('大纲行右键打开统一菜单（≥7 项），点击「新增子主题」执行命令并 emit change', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    const rowA = wrapper.findAll('.mindmap-row')
      .find((row) => row.attributes('data-topic-id') === 'a');
    expect(rowA).toBeTruthy();

    await rowA!.trigger('contextmenu', { clientX: 200, clientY: 120 });
    await wrapper.vm.$nextTick();

    expect(document.querySelector('[data-testid="mm-context-menu"]')).toBeTruthy();
    const testIds = menuItemTestIds();
    expect(testIds.length).toBeGreaterThanOrEqual(7);
    expect(testIds).toContain('mm-context-item-add-child');
    expect(testIds).toContain('mm-context-item-rename');
    expect(testIds).toContain('mm-context-item-delete');

    clickMenuItem('add-child');
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('change')).toBeTruthy();
    // 右键已把目标节点选中，新增子主题落在 a 之下
    expect(wrapper.findAll('.mindmap-row')).toHaveLength(5);
    // 执行后菜单关闭
    expect(document.querySelector('[data-testid="mm-context-menu"]')).toBeNull();
    wrapper.unmount();
  });

  it('画布空白右键打开空白菜单（≥4 项）并执行画布级命令', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    await wrapper.find('[data-testid="mindmap-canvas"]').trigger('contextmenu', {
      clientX: 9999,
      clientY: 9999,
    });
    await wrapper.vm.$nextTick();

    const testIds = menuItemTestIds();
    expect(testIds.length).toBeGreaterThanOrEqual(4);
    expect(testIds).toContain('mm-context-item-add-root-child');
    expect(testIds).toContain('mm-context-item-fit-view');
    expect(testIds).toContain('mm-context-item-reset-view');

    clickMenuItem('add-root-child');
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('change')).toBeTruthy();
    expect(wrapper.findAll('.mindmap-row')).toHaveLength(5);
    wrapper.unmount();
  });

  it('节点菜单「折叠子主题」隐藏子树（走既有命令）', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    const rowA = wrapper.findAll('.mindmap-row')
      .find((row) => row.attributes('data-topic-id') === 'a');
    await rowA!.trigger('contextmenu', { clientX: 120, clientY: 90 });
    await wrapper.vm.$nextTick();
    // 有子节点时该项可用
    expect(document.querySelector('[data-testid="mm-context-item-toggle-collapse"]')).toBeTruthy();

    clickMenuItem('toggle-collapse');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.mm-node[data-node-id="a1"]').exists()).toBe(false);
    expect(wrapper.emitted('change')).toBeTruthy();
    wrapper.unmount();
  });

  it('大纲 resizer 拖动改宽（clamp 180–420）且不写文档', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    const outline = () => wrapper.find('[data-testid="mindmap-outline"]');
    expect(outline().attributes('style')).toContain('width: 240px');

    await wrapper.find('[data-testid="mm-outline-resizer"]').trigger('pointerdown', {
      button: 0,
      clientX: 500,
    });
    // 面板在右侧：向左拖 60px → 300px
    dispatchResizePointer('pointermove', 440);
    await wrapper.vm.$nextTick();
    expect(outline().attributes('style')).toContain('width: 300px');

    // 继续向左 → 上限 420
    dispatchResizePointer('pointermove', -2000);
    await wrapper.vm.$nextTick();
    expect(outline().attributes('style')).toContain('width: 420px');

    // 向右拖回 → 下限 180
    dispatchResizePointer('pointermove', 5000);
    await wrapper.vm.$nextTick();
    expect(outline().attributes('style')).toContain('width: 180px');

    dispatchResizePointer('pointerup', 5000);
    // 宽度是视图偏好：不产生 change，不写文档
    expect(wrapper.emitted('change')).toBeFalsy();
    wrapper.unmount();
  });

  it('属性面板 resizer 拖动改宽', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    await wrapper.find('[data-testid="mm-properties-toggle"]').trigger('click');
    await wrapper.vm.$nextTick();

    const panel = () => wrapper.find('[data-testid="mm-props"]');
    expect(panel().attributes('style')).toContain('width: 260px');

    await wrapper.find('[data-testid="mm-props-resizer"]').trigger('pointerdown', {
      button: 0,
      clientX: 400,
    });
    dispatchResizePointer('pointermove', 340);
    await wrapper.vm.$nextTick();
    expect(panel().attributes('style')).toContain('width: 320px');

    dispatchResizePointer('pointerup', 340);
    expect(wrapper.emitted('change')).toBeFalsy();
    wrapper.unmount();
  });
});

/* ---------------------- UX-2：边界（boundary）/ 概要（summary） ---------------------- */

describe('MindmapStage UX-2', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  /** 取最近一次 change 事件里的文档。 */
  function lastDocument(wrapper: ReturnType<typeof mountStage>): MindMapDocument {
    const emitted = wrapper.emitted('change');
    expect(emitted).toBeTruthy();
    return JSON.parse(emitted![emitted!.length - 1]![0] as string) as MindMapDocument;
  }

  it('节点菜单按「有无边界/概要」显示添加或清除', async () => {
    const plain = mountStage(serializeMindMapDocument(treeDocument()));
    const plainRow = plain.findAll('.mindmap-row')
      .find((row) => row.attributes('data-topic-id') === 'a');
    await plainRow!.trigger('contextmenu', { clientX: 10, clientY: 10 });
    await plain.vm.$nextTick();
    expect(document.querySelector('[data-testid="mm-context-item-add-boundary"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="mm-context-item-add-summary"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="mm-context-item-clear-boundary"]')).toBeNull();
    expect(document.querySelector('[data-testid="mm-context-item-clear-summary"]')).toBeNull();
    // 关闭菜单，避免 teleport 泄漏到后续用例
    clickMenuItem('add-summary');
    await plain.vm.$nextTick();
    plain.unmount();

    const doc = treeDocument();
    doc.topics.a = { ...doc.topics.a!, boundary: { label: '框' }, summary: '概要' };
    const wrapper = mountStage(serializeMindMapDocument(doc));
    const rowA = wrapper.findAll('.mindmap-row')
      .find((row) => row.attributes('data-topic-id') === 'a');
    await rowA!.trigger('contextmenu', { clientX: 10, clientY: 10 });
    await wrapper.vm.$nextTick();
    expect(document.querySelector('[data-testid="mm-context-item-clear-boundary"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="mm-context-item-clear-summary"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="mm-context-item-add-boundary"]')).toBeNull();
    clickMenuItem('add-child');
    await wrapper.vm.$nextTick();
    wrapper.unmount();
  });

  it('菜单「添加边界…」打开属性面板，不写文档', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    expect(wrapper.find('[data-testid="mm-props"]').exists()).toBe(false);

    const rowA = wrapper.findAll('.mindmap-row')
      .find((row) => row.attributes('data-topic-id') === 'a');
    await rowA!.trigger('contextmenu', { clientX: 10, clientY: 10 });
    await wrapper.vm.$nextTick();
    clickMenuItem('add-boundary');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="mm-props"]').exists()).toBe(true);
    expect(wrapper.emitted('change')).toBeFalsy();
    wrapper.unmount();
  });

  it('菜单「清除边界」写回文档（可撤销）且画布移除边界', async () => {
    const doc = treeDocument();
    doc.topics.a = { ...doc.topics.a!, boundary: { label: '框', color: '#2563eb' } };
    const wrapper = mountStage(serializeMindMapDocument(doc));
    expect(wrapper.findAll('[data-testid="mm-boundary"]')).toHaveLength(1);

    const rowA = wrapper.findAll('.mindmap-row')
      .find((row) => row.attributes('data-topic-id') === 'a');
    await rowA!.trigger('contextmenu', { clientX: 10, clientY: 10 });
    await wrapper.vm.$nextTick();
    clickMenuItem('clear-boundary');
    await wrapper.vm.$nextTick();

    expect(lastDocument(wrapper).topics.a?.boundary).toBeUndefined();
    expect(wrapper.findAll('[data-testid="mm-boundary"]')).toHaveLength(0);

    // 撤销后边界回来
    await wrapper.find('[data-testid="mindmap-tree"]').trigger('keydown', { key: 'z', ctrlKey: true });
    await wrapper.vm.$nextTick();
    expect(lastDocument(wrapper).topics.a?.boundary?.label).toBe('框');
    expect(wrapper.findAll('[data-testid="mm-boundary"]')).toHaveLength(1);
    wrapper.unmount();
  });

  it('属性面板设置边界：emit change、画布出现边界框与标签', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    await wrapper.find('[data-testid="mm-properties-toggle"]').trigger('click');
    await wrapper.find('[data-testid="mm-props-boundary-label"]').setValue('阶段一');
    await wrapper.find('[data-testid="mm-props-boundary-color"]').setValue('#2563eb');
    await wrapper.find('[data-testid="mm-props-boundary-apply"]').trigger('click');
    await wrapper.vm.$nextTick();

    const changed = lastDocument(wrapper);
    const rootId = changed.rootTopicId;
    expect(changed.topics[rootId]?.boundary).toEqual({ label: '阶段一', color: '#2563eb' });

    const boundaries = wrapper.findAll('[data-testid="mm-boundary"]');
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0]?.text()).toContain('阶段一');
    // 受控：面板控件跟随回填
    expect((wrapper.find('[data-testid="mm-props-boundary-label"]').element as HTMLInputElement).value)
      .toBe('阶段一');
    wrapper.unmount();
  });

  it('属性面板设置概要：emit change、画布出现括线与文本', async () => {
    const wrapper = mountStage(serializeMindMapDocument(treeDocument()));
    await wrapper.find('[data-testid="mm-properties-toggle"]').trigger('click');
    await wrapper.find('[data-testid="mm-props-summary-text"]').setValue('这是一组子主题');
    await wrapper.find('[data-testid="mm-props-summary-apply"]').trigger('click');
    await wrapper.vm.$nextTick();

    const changed = lastDocument(wrapper);
    expect(changed.topics[changed.rootTopicId]?.summary).toBe('这是一组子主题');

    const summaries = wrapper.findAll('[data-testid="mm-summary"]');
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.text()).toContain('这是一组子主题');
    wrapper.unmount();
  });

  it('属性面板清除边界与概要：emit change 并移除画布 overlay', async () => {
    const doc = treeDocument();
    doc.topics[doc.rootTopicId] = {
      ...doc.topics[doc.rootTopicId]!,
      boundary: { label: '框' },
      summary: '概要',
    };
    const wrapper = mountStage(serializeMindMapDocument(doc));
    await wrapper.find('[data-testid="mm-properties-toggle"]').trigger('click');
    expect(wrapper.findAll('[data-testid="mm-boundary"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-testid="mm-summary"]')).toHaveLength(1);

    await wrapper.find('[data-testid="mm-props-boundary-clear"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(lastDocument(wrapper).topics[doc.rootTopicId]?.boundary).toBeUndefined();
    expect(wrapper.findAll('[data-testid="mm-boundary"]')).toHaveLength(0);

    await wrapper.find('[data-testid="mm-props-summary-clear"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(lastDocument(wrapper).topics[doc.rootTopicId]?.summary).toBeUndefined();
    expect(wrapper.findAll('[data-testid="mm-summary"]')).toHaveLength(0);
    wrapper.unmount();
  });
});
