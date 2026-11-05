import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MindmapCanvasStylePanel from '@/components/editor/mindmap/MindmapCanvasStylePanel.vue';
import { useMindmapStore } from '@/stores/mindmap';
import { createEmptyMindMapDocument, serializeMindMapDocument } from '@/services/mindmapService';

describe('MindmapCanvasStylePanel', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('布局与主题写入文档并支持撤销，视图设置不修改正文', async () => {
    const store = useMindmapStore();
    store.loadFromContent('tab', serializeMindMapDocument(createEmptyMindMapDocument('测试')));
    store.setStyleVisible(true);
    store.showStyleTarget({ kind: 'canvas' });
    const wrapper = mount(MindmapCanvasStylePanel);
    await wrapper.get('[title="主题统一向右展开"]').trigger('click');
    expect(store.document?.layoutMode).toBe('logic');
    await wrapper.get('[data-testid="mm-theme-trigger"]').trigger('click');
    expect(wrapper.get('[role="listbox"]').findAll('[role="option"]')).toHaveLength(15);
    await wrapper.get('[title="应用森林主题"]').trigger('click');
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="mm-theme-trigger"]').text()).toContain('森林');
    expect(store.document?.themeId).toBe('forest');
    expect(wrapper.emitted('change')).toHaveLength(2);
    expect(store.undo()).toBe(true);
    expect(store.document?.themeId).toBe('default');
    const before = store.serialized;
    await wrapper.get('[title="纯白 #ffffff"]').trigger('click');
    await wrapper.get('input[type="checkbox"]').setValue(false);
    expect(store.canvasBackground).toBe('#ffffff');
    expect(store.canvasGridVisible).toBe(false);
    expect(store.serialized).toBe(before);
  });

  it('节点和连接线样式可编辑、持久化并撤销', async () => {
    const store = useMindmapStore();
    const doc = createEmptyMindMapDocument('测试');
    store.loadFromContent('tab', serializeMindMapDocument(doc));
    store.showStyleTarget({ kind: 'topic', topicId: doc.rootTopicId });
    const wrapper = mount(MindmapCanvasStylePanel);
    expect(wrapper.text()).toContain('预置主题风格');
    await wrapper.get('[aria-expanded="false"].mm-custom-style-toggle').trigger('click');
    await wrapper.get('input[type="color"]').setValue('#123456');
    expect(store.document?.topics[doc.rootTopicId]?.style?.fill).toBe('#123456');
    store.showStyleTarget({ kind: 'edge', childId: doc.rootTopicId });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('连接线样式');
    await wrapper.get('input[type="color"]').setValue('#abcdef');
    expect(store.document?.topics[doc.rootTopicId]?.style?.edgeColor).toBe('#abcdef');
    expect(store.undo()).toBe(true);
    expect(store.document?.topics[doc.rootTopicId]?.style?.edgeColor).toBeUndefined();
  });

  it('主题样式可调间距并应用节点预置风格', async () => {
    const store = useMindmapStore();
    const doc = createEmptyMindMapDocument('测试');
    const rootId = doc.rootTopicId;
    doc.topics.branch = { id: 'branch', parentId: rootId, childIds: ['child'], text: '分支' };
    doc.topics.child = { id: 'child', parentId: 'branch', childIds: [], text: '子主题' };
    doc.topics[rootId]!.childIds = ['branch'];
    store.loadFromContent('tab', serializeMindMapDocument(doc));
    store.setStyleVisible(true);
    store.showStyleTarget({ kind: 'topic', topicId: rootId });
    const wrapper = mount(MindmapCanvasStylePanel);
    expect(wrapper.text()).toContain('主题间距');
    const hGap = wrapper.get('[aria-label="主题横向间距"]');
    await hGap.setValue('88');
    await hGap.trigger('change');
    expect(store.document?.opaqueExtensions?.tauLayoutSpacing).toMatchObject({ hGap: 88 });
    await wrapper.get('[title="应用柔和雅韵到所选节点"]').trigger('click');
    expect(store.document?.topics[doc.rootTopicId]?.style).toMatchObject({ fill: '#eadde4', shape: 'rounded' });
    await wrapper.get('[aria-label="批量应用层级"]').setValue('branch');
    await wrapper.get('[aria-label="批量主题样式预设"]').setValue('business');
    await wrapper.get('.mm-bulk-apply').trigger('click');
    expect(store.document?.topics.branch?.style).toMatchObject({ fill: '#dce4ee', color: '#263746' });
    expect(store.document?.topics.child?.style).toBeUndefined();
  });

  it('分别保存并应用中心、分支、子主题模板', async () => {
    const store = useMindmapStore();
    const doc = createEmptyMindMapDocument('测试');
    const rootId = doc.rootTopicId;
    doc.topics.branch = { id: 'branch', parentId: rootId, childIds: ['child'], text: '分支' };
    doc.topics.child = { id: 'child', parentId: 'branch', childIds: [], text: '子主题' };
    doc.topics[rootId]!.childIds = ['branch'];
    store.loadFromContent('tab', serializeMindMapDocument(doc));
    store.showStyleTarget({ kind: 'topic', topicId: rootId });
    const wrapper = mount(MindmapCanvasStylePanel);
    for (const [level, preset, aria] of [
      ['root', 'business', '中心主题样式模板'],
      ['branch', 'coral', '分支主题样式模板'],
      ['child', 'fresh', '子主题样式模板'],
    ] as const) {
      await wrapper.get(`[aria-label="${aria}"]`).setValue(preset);
      await wrapper.get(`[aria-label="应用${aria.replace('样式模板', '')}模板"]`).trigger('click');
    }
    expect(store.document?.topics[rootId]?.style?.fill).toBe('#dce4ee');
    expect(store.document?.topics.branch?.style?.fill).toBe('#cf6651');
    expect(store.document?.topics.child?.style?.fill).toBe('#65b79a');
    expect(store.document?.opaqueExtensions?.tauTopicStylePresets).toMatchObject({ root: 'business', branch: 'coral', child: 'fresh' });
  });

  it('编辑父子连接线的线型和起止箭头', async () => {
    const store = useMindmapStore();
    const doc = createEmptyMindMapDocument('测试');
    doc.topics.branch = { id: 'branch', parentId: doc.rootTopicId, childIds: [], text: '分支' };
    doc.topics[doc.rootTopicId]!.childIds = ['branch'];
    store.loadFromContent('tab', serializeMindMapDocument(doc));
    store.showStyleTarget({ kind: 'edge', childId: 'branch' });
    const wrapper = mount(MindmapCanvasStylePanel);
    await wrapper.get('[aria-label="线型"]').setValue('dotted');
    await wrapper.get('[aria-label="起始箭头"]').setValue('arrow');
    await wrapper.get('[aria-label="结束箭头"]').setValue('arrow');
    expect(store.document?.topics.branch?.style).toMatchObject({ edgeStyle: 'dotted', edgeStartArrow: 'arrow', edgeEndArrow: 'arrow' });
  });

  it('编辑关系线的线型和起止箭头', async () => {
    const store = useMindmapStore();
    const doc = createEmptyMindMapDocument('测试');
    doc.topics.branch = { id: 'branch', parentId: doc.rootTopicId, childIds: [], text: '分支' };
    doc.topics[doc.rootTopicId]!.childIds = ['branch'];
    doc.relations = [{ id: 'relation-1', sourceTopicId: doc.rootTopicId, targetTopicId: 'branch' }];
    store.loadFromContent('tab', serializeMindMapDocument(doc));
    store.showStyleTarget({ kind: 'relation', relationId: 'relation-1' });
    const wrapper = mount(MindmapCanvasStylePanel);
    await wrapper.get('[aria-label="线型"]').setValue('solid');
    await wrapper.get('[aria-label="起始箭头"]').setValue('arrow');
    await wrapper.get('[aria-label="结束箭头"]').setValue('none');
    expect(store.document?.relations?.[0]).toMatchObject({ lineStyle: 'solid', startArrow: 'arrow', endArrow: 'none' });
  });
});
