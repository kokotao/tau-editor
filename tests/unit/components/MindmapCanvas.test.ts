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
/* ------------ 阶段 4C：节点样式 / 标记 / 关系线 / 主题模板 ------------ */

/** 把颜色归一化后再比较（不同 DOM 实现可能把 #rrggbb 序列化为 rgb()）。 */
function expectColor(styleText: string, hex: string) {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const rgb = `rgb(${r}, ${g}, ${b})`;
  expect(styleText.toLowerCase()).toMatch(
    new RegExp(`${hex.toLowerCase()}|${rgb.replace(/[()]/g, '\\$&')}`),
  );
}

describe('MindmapCanvas 阶段 4C', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('节点 style.fill / color 渲染为内联样式，shape=rect 变为小圆角', () => {
    const doc = buildDoc();
    doc.topics.a = {
      ...doc.topics.a!,
      style: { fill: '#ffe8e6', color: '#c0451c', shape: 'rect' },
    };
    const wrapper = mountCanvas({ document: doc });

    const rect = wrapper.find('.mm-node[data-node-id="a"] .mm-node-box');
    expect(rect.exists()).toBe(true);
    expectColor(rect.attributes('style') ?? '', '#ffe8e6');
    expect(rect.attributes('rx')).toBe('2');

    const text = wrapper.find('.mm-node[data-node-id="a"] .mm-node-text');
    expectColor(text.attributes('style') ?? '', '#c0451c');
  });

  it('shape=pill 使用半高圆角，未声明样式时回落到默认 9', () => {
    const doc = buildDoc();
    doc.topics.a = { ...doc.topics.a!, style: { shape: 'pill' } };
    const wrapper = mountCanvas({ document: doc });

    const pillRx = Number(wrapper.find('.mm-node[data-node-id="a"] .mm-node-box').attributes('rx'));
    expect(pillRx).toBeGreaterThan(2);
    expect(Number.isFinite(pillRx)).toBe(true);

    // 未声明样式的节点：既无内联填充，也保持默认圆角
    const plainRect = wrapper.find('.mm-node[data-node-id="b"] .mm-node-box');
    expect(plainRect.attributes('rx')).toBe('9');
    expect(plainRect.attributes('style')).toBeUndefined();
  });

  it('topic.markers 渲染徽章，数量与顺序一致，未标记节点无徽章', () => {
    const doc = buildDoc();
    doc.topics.b = { ...doc.topics.b!, markers: ['priority-1', 'star'] };
    const wrapper = mountCanvas({ document: doc });

    const markers = wrapper.findAll('[data-testid="mm-marker"]');
    expect(markers).toHaveLength(2);
    expect(markers[0]?.attributes('data-marker')).toBe('priority-1');
    expect(markers[1]?.attributes('data-marker')).toBe('star');
    // 内置标记的徽章文字来自统一标记表
    expect(markers[1]?.text()).toBe('★');

    // 未标记的节点（a）不渲染徽章
    expect(wrapper.find('.mm-node[data-node-id="a"] .mm-marker').exists()).toBe(false);
  });

  it('表外标记 id 退化为前两个字符作为徽章', () => {
    const doc = buildDoc();
    doc.topics.b = { ...doc.topics.b!, markers: ['custom-urgent'] };
    const wrapper = mountCanvas({ document: doc });
    expect(wrapper.find('[data-testid="mm-marker"]').text()).toBe('cu');
  });

  it('document.relations 渲染独立关系线：虚线 + 箭头 + 标签', () => {
    const doc = buildDoc();
    doc.relations = [
      { id: 'r1', sourceTopicId: 'a1', targetTopicId: 'b', label: '依赖' },
      { id: 'r2', sourceTopicId: 'a', targetTopicId: 'b' },
    ];
    const wrapper = mountCanvas({ document: doc });

    const relations = wrapper.findAll('[data-testid="mm-relation"]');
    expect(relations).toHaveLength(2);
    expect(relations[0]?.attributes('data-relation-id')).toBe('r1');
    expect(relations[0]?.attributes('data-source-id')).toBe('a1');
    expect(relations[0]?.attributes('data-target-id')).toBe('b');

    const path = relations[0]!.find('.mm-relation-path');
    expect(path.exists()).toBe(true);
    expect(path.attributes('stroke-dasharray')).toBe('6 4');
    expect(path.attributes('marker-end')).toContain('mm-relation-arrow');
    expect(path.attributes('d')?.startsWith('M ')).toBe(true);
    expect(path.attributes('d')).toContain(' L ');

    // 标签只出现在声明了 label 的关系线上
    expect(relations[0]?.find('.mm-relation-label').text()).toBe('依赖');
    expect(relations[1]?.find('.mm-relation-label').exists()).toBe(false);
  });

  it('关系线不参与布局：节点位置与父子连线数量不受影响', () => {
    const plain = mountCanvas();
    const withRelations = mountCanvas({
      document: (() => {
        const doc = buildDoc();
        doc.relations = [{ id: 'r1', sourceTopicId: 'a1', targetTopicId: 'b' }];
        return doc;
      })(),
    });

    expect(withRelations.findAll('.mm-edge')).toHaveLength(3);
    for (const id of ['a', 'a1', 'b']) {
      expect(withRelations.find(`.mm-node[data-node-id="${id}"]`).attributes('transform'))
        .toBe(plain.find(`.mm-node[data-node-id="${id}"]`).attributes('transform'));
    }
  });

  it('折叠后端点不可见的关系线不渲染', () => {
    const doc = buildDoc();
    doc.topics.a = { ...doc.topics.a!, collapsed: true };
    doc.relations = [{ id: 'r1', sourceTopicId: 'a1', targetTopicId: 'b' }];
    const wrapper = mountCanvas({ document: doc });
    expect(wrapper.findAll('[data-testid="mm-relation"]')).toHaveLength(0);
  });

  it('主题模板通过内联 CSS 变量换色，默认主题不覆盖既有变量', () => {
    const themed = buildDoc();
    themed.themeId = 'ocean';
    const wrapper = mountCanvas({ document: themed });
    const canvas = wrapper.find('[data-testid="mindmap-canvas"]');
    expect(canvas.attributes('data-theme-id')).toBe('ocean');
    const style = canvas.attributes('style') ?? '';
    expect(style).toContain('--mindmap-node-bg');
    expect(style).toContain('--mindmap-edge');

    const plain = mountCanvas();
    const plainCanvas = plain.find('[data-testid="mindmap-canvas"]');
    expect(plainCanvas.attributes('data-theme-id')).toBe('default');
    // 未选主题时不写内联变量，完全沿用既有 CSS 观感
    expect(plainCanvas.attributes('style')).toBeUndefined();

    // 未知主题 id 按 default 处理，同样不输出内联变量
    const unknown = buildDoc();
    unknown.themeId = 'nebula';
    const unknownCanvas = mountCanvas({ document: unknown }).find('[data-testid="mindmap-canvas"]');
    expect(unknownCanvas.attributes('style')).toBeUndefined();
  });
});
