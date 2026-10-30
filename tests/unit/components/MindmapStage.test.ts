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
