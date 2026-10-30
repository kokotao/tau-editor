/**
 * MindmapCanvas 阶段 2 契约测试：
 * 节点/连线渲染、选中与改名事件、折叠、滚轮缩放/平移/适配内容、内联编辑器。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MindmapCanvas from '@/components/editor/mindmap/MindmapCanvas.vue';
import { createEmptyMindMapDocument } from '@/services/mindmapService';
import type { MindMapDocument } from '@/types/mindmap';

function buildDoc(): MindMapDocument {
  const doc = createEmptyMindMapDocument('中心');
  const root = doc.rootTopicId;
  doc.topics.a = { id: 'a', parentId: root, childIds: ['a1'], text: '分支 A' };
  doc.topics.a1 = { id: 'a1', parentId: 'a', childIds: [], text: 'A1' };
  doc.topics.b = { id: 'b', parentId: root, childIds: [], text: '分支 B' };
  const rootTopic = doc.topics[root];
  if (rootTopic) rootTopic.childIds = ['a', 'b'];
  return doc;
}

function mountCanvas(overrides: Record<string, unknown> = {}) {
  return mount(MindmapCanvas, {
    props: {
      document: buildDoc(),
      selectedId: null,
      viewport: { x: 0, y: 0, zoom: 1 },
      editingId: null,
      editingText: '',
      ...overrides,
    },
  });
}

describe('MindmapCanvas', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('渲染全部节点与连线', () => {
    const wrapper = mountCanvas();
    expect(wrapper.findAll('.mm-node')).toHaveLength(4);
    expect(wrapper.findAll('.mm-edge')).toHaveLength(3);
    expect(wrapper.text()).toContain('分支 A');
    expect(wrapper.text()).toContain('A1');
  });

  it('选中节点时高亮并可点击发出 select', async () => {
    const wrapper = mountCanvas();
    const node = wrapper.find('.mm-node[data-node-id="b"]');
    expect(node.exists()).toBe(true);
    await node.trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual(['b']);
  });

  it('双击节点发出 start-rename', async () => {
    const wrapper = mountCanvas();
    await wrapper.find('.mm-node[data-node-id="a"]').trigger('dblclick');
    expect(wrapper.emitted('start-rename')?.[0]).toEqual(['a']);
  });

  it('选中态来自 selectedId', () => {
    const wrapper = mountCanvas({ selectedId: 'a1' });
    const selected = wrapper.find('.mm-node.is-selected');
    expect(selected.exists()).toBe(true);
    expect(selected.attributes('data-node-id')).toBe('a1');
  });

  it('点击折叠按钮发出 toggle-collapse', async () => {
    const wrapper = mountCanvas();
    const parentNode = wrapper.find('.mm-node[data-node-id="a"]');
    await parentNode.find('.mm-toggle').trigger('click');
    expect(wrapper.emitted('toggle-collapse')?.[0]).toEqual(['a']);
  });

  it('滚轮发出带缩放变化的 update:viewport', async () => {
    const wrapper = mountCanvas();
    // 等待挂载后的自动适配完成，避免把适配事件误当成滚轮结果
    await wrapper.vm.$nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const before = wrapper.emitted('update:viewport')?.length ?? 0;

    await wrapper.find('[data-testid="mindmap-canvas"]').trigger('wheel', {
      deltaY: -120,
      clientX: 400,
      clientY: 300,
    });

    const events = wrapper.emitted('update:viewport');
    expect(events).toBeTruthy();
    expect(events!.length).toBeGreaterThan(before);
    const viewport = events![events!.length - 1]![0] as { x: number; y: number; zoom: number };
    expect(viewport.zoom).toBeGreaterThan(1);
    expect(Number.isFinite(viewport.x)).toBe(true);
    expect(Number.isFinite(viewport.y)).toBe(true);
  });

  it('适配内容与重置视口通过暴露方法发出视口', async () => {
    const wrapper = mountCanvas();
    const exposed = wrapper.vm as unknown as { fitView: () => void; resetView: () => void };
    exposed.fitView();
    let events = wrapper.emitted('update:viewport');
    expect(events).toBeTruthy();
    const fitted = events![events!.length - 1]![0] as { zoom: number };
    expect(fitted.zoom).toBeGreaterThan(0);
    // 小图适配不应放大超过 100%，否则新增节点会跑到可视区外
    expect(fitted.zoom).toBeLessThanOrEqual(1);

    exposed.resetView();
    events = wrapper.emitted('update:viewport');
    const reset = events![events!.length - 1]![0] as { zoom: number };
    expect(reset.zoom).toBe(1);
  });

  it('默认视口下节点位置由布局决定（根在原点附近）', async () => {
    const wrapper = mountCanvas();
    const root = wrapper.find('.mm-node.is-root');
    expect(root.exists()).toBe(true);
    const transform = root.attributes('transform') ?? '';
    expect(transform).toContain('translate(0 0)');
  });

  it('折叠节点的子节点不渲染', () => {
    const doc = buildDoc();
    doc.topics.a = { ...doc.topics.a!, collapsed: true };
    const wrapper = mountCanvas({ document: doc });
    expect(wrapper.find('.mm-node[data-node-id="a1"]').exists()).toBe(false);
  });

  it('内联编辑器出现并提交/取消改名', async () => {
    const wrapper = mountCanvas({ editingId: 'a', editingText: '分支 A' });
    const editor = wrapper.find('[data-testid="mm-inline-editor"]');
    expect(editor.exists()).toBe(true);

    await editor.setValue('新名字');
    expect(wrapper.emitted('update:editing-text')?.[0]).toEqual(['新名字']);

    await editor.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('commit-rename')?.[0]).toEqual(['分支 A']);
  });

  it('内联编辑器 Esc 取消', async () => {
    const wrapper = mountCanvas({ editingId: 'a', editingText: 'x' });
    await wrapper.find('[data-testid="mm-inline-editor"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('cancel-rename')).toBeTruthy();
  });

  it('200 节点画布可渲染', () => {
    const doc = createEmptyMindMapDocument('性能');
    const root = doc.rootTopicId;
    const rootTopic = doc.topics[root];
    if (!rootTopic) throw new Error('missing root');
    const ids: string[] = [];
    for (let i = 0; i < 199; i += 1) {
      const id = `n${i}`;
      doc.topics[id] = { id, parentId: root, childIds: [], text: `节点 ${i}` };
      ids.push(id);
    }
    rootTopic.childIds = ids;

    const wrapper = mountCanvas({ document: doc });
    expect(wrapper.findAll('.mm-node')).toHaveLength(200);
  });
});

/* ---------------------- 阶段 4A：结构布局模式的连线渲染 ---------------------- */

/** 同一棵测试树切换为 org 布局。 */
function orgDoc(): MindMapDocument {
  const doc = buildDoc();
  doc.layoutMode = 'org';
  return doc;
}

/** 从 transform="translate(x y)" 中取出节点中心坐标。 */
function nodeCenter(wrapper: ReturnType<typeof mountCanvas>, id: string) {
  const element = wrapper.find(`.mm-node[data-node-id="${id}"]`);
  expect(element.exists()).toBe(true);
  const matched = (element.attributes('transform') ?? '').match(/translate\(([-\d.]+) ([-\d.]+)\)/);
  expect(matched).toBeTruthy();
  return { x: Number(matched![1]), y: Number(matched![2]) };
}

describe('MindmapCanvas 阶段 4A', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('默认导图模式渲染水平连线', () => {
    const wrapper = mountCanvas();
    const edges = wrapper.findAll('.mm-edge');
    expect(edges).toHaveLength(3);
    for (const edge of edges) {
      expect(edge.attributes('data-orientation')).toBe('horizontal');
      expect(edge.classes()).not.toContain('mm-edge--vertical');
    }
  });

  it('org 模式渲染竖直连线（父底中心 → 子顶中心）', () => {
    const wrapper = mountCanvas({ document: orgDoc() });
    const edges = wrapper.findAll('.mm-edge');
    expect(edges).toHaveLength(3);
    for (const edge of edges) {
      expect(edge.attributes('data-orientation')).toBe('vertical');
      expect(edge.classes()).toContain('mm-edge--vertical');
      // 竖直贝塞尔：以 M x y C 开头，路径存在且合法
      const d = edge.attributes('d') ?? '';
      expect(d.startsWith('M ')).toBe(true);
      expect(d).toContain(' C ');
    }
    // 根节点出发的连线：起点应为根节点底边中心（竖直连线不产生水平偏移）
    const rootId = wrapper.find('.mm-node.is-root').attributes('data-node-id') as string;
    const rootCenter = nodeCenter(wrapper, rootId);
    const rootEdge = wrapper.find(`.mm-edge[data-edge-id="${rootId}->a"]`);
    expect(rootEdge.exists()).toBe(true);
    const start = (rootEdge.attributes('d') ?? '').match(/^M ([-\d.]+) ([-\d.]+)/);
    expect(start).toBeTruthy();
    expect(Number(start![1])).toBeCloseTo(rootCenter.x, 1);
    expect(Number(start![2])).toBeGreaterThan(rootCenter.y);
  });

  it('org 模式节点自上而下排列（子节点 y 大于父节点）', () => {
    const wrapper = mountCanvas({ document: orgDoc() });
    const a = nodeCenter(wrapper, 'a');
    const a1 = nodeCenter(wrapper, 'a1');
    const rootId = wrapper.find('.mm-node.is-root').attributes('data-node-id') as string;
    const root = nodeCenter(wrapper, rootId);
    expect(a.y).toBeGreaterThan(root.y);
    expect(a1.y).toBeGreaterThan(a.y);
  });

  it('logic 模式所有节点在根右侧渲染', () => {
    const doc = buildDoc();
    doc.layoutMode = 'logic';
    const wrapper = mountCanvas({ document: doc });
    const rootId = wrapper.find('.mm-node.is-root').attributes('data-node-id') as string;
    const root = nodeCenter(wrapper, rootId);
    for (const id of ['a', 'a1', 'b']) {
      expect(nodeCenter(wrapper, id).x).toBeGreaterThan(root.x);
    }
  });
});