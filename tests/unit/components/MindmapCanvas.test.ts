/**
 * MindmapCanvas 阶段 2 契约测试：
 * 节点/连线渲染、选中与改名事件、折叠、滚轮缩放/平移/适配内容、内联编辑器。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('画布视图设置可隐藏网格和中心节点及其直属连线', () => {
    const doc = buildDoc();
    const wrapper = mountCanvas({ document: doc, canvasBackground: '#ffffff', canvasGridVisible: false, canvasRootVisible: false });
    expect(wrapper.get('[data-testid="mindmap-canvas"]').classes()).toContain('is-grid-hidden');
    expect(wrapper.get('[data-testid="mindmap-canvas"]').attributes('style')).toContain('background-color');
    expect(wrapper.find(`[data-node-id="${doc.rootTopicId}"]`).exists()).toBe(false);
    expect(wrapper.findAll('.mm-edge')).toHaveLength(1);
  });

  it('选中节点时高亮并可点击发出 select', async () => {
    const wrapper = mountCanvas();
    const node = wrapper.find('.mm-node[data-node-id="b"]');
    expect(node.exists()).toBe(true);
    await node.trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual(['b']);
    expect(wrapper.emitted('style-target')?.[0]).toEqual([{ kind: 'topic', topicId: 'b' }]);
  });

  it('选中有后代的节点时以持续模式沿后代连线发送分层脉冲', async () => {
    const wrapper = mountCanvas();
    await wrapper.find('.mm-node.is-root').trigger('click');

    const pulses = wrapper.findAll('.mm-edge-pulse');
    expect(pulses).toHaveLength(3);
    expect(pulses.every((pulse) => pulse.attributes('data-pulse-mode') === 'continuous')).toBe(true);
    expect(pulses.map((pulse) => pulse.attributes('data-pulse-depth'))).toEqual(['1', '2', '1']);
    expect(pulses[0]!.attributes('style')).toContain('animation-delay: 0ms');
    expect(pulses[1]!.attributes('style')).toContain('animation-delay: 460ms');
  });

  it('切换到其他节点后清理旧节点的持续脉冲', async () => {
    const wrapper = mountCanvas();
    await wrapper.find('.mm-node[data-node-id="a"]').trigger('click');
    expect(wrapper.find('.mm-edge-pulse').exists()).toBe(true);

    await wrapper.find('.mm-node[data-node-id="b"]').trigger('click');
    expect(wrapper.find('.mm-edge-pulse').exists()).toBe(false);
  });

  it('空白画布可通过指针拖动平移视口', async () => {
    const wrapper = mountCanvas();
    const canvas = wrapper.get('[data-testid="mindmap-canvas"]');

    await canvas.trigger('pointerdown', { button: 0, clientX: 40, clientY: 50, pointerId: 1 });
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 75, clientY: 82 }));

    const events = wrapper.emitted('update:viewport');
    expect(events).toBeTruthy();
    const viewport = events![events!.length - 1]![0] as { x: number; y: number; zoom: number };
    expect(viewport).toMatchObject({ x: 35, y: 32, zoom: 1 });

    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 75, clientY: 82 }));
    wrapper.unmount();
  });

  it('父子线和独立关系线可点击并发出对应样式目标', async () => {
    const doc = buildDoc();
    doc.relations = [{ id: 'r1', sourceTopicId: 'a', targetTopicId: 'b' }];
    const wrapper = mountCanvas({ document: doc });
    await wrapper.find('.mm-edge-hit').trigger('click');
    expect(wrapper.emitted('style-target')?.[0]?.[0]).toMatchObject({ kind: 'edge' });
    await wrapper.get('[data-relation-id="r1"] .mm-edge-hit').trigger('click');
    expect(wrapper.emitted('style-target')?.[1]).toEqual([{ kind: 'relation', relationId: 'r1' }]);
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
    expect(selected.attributes('data-selected')).toBe('true');
    expect(selected.attributes('aria-selected')).toBe('true');
    expect(selected.find('.mm-node-selection-ring').exists()).toBe(true);
    expect(wrapper.find('.mm-node[data-node-id="a"] .mm-node-selection-ring').exists()).toBe(false);
  });

  it('点击折叠按钮发出 toggle-collapse', async () => {
    const wrapper = mountCanvas();
    const parentNode = wrapper.find('.mm-node[data-node-id="a"]');
    await parentNode.find('.mm-toggle').trigger('click');
    expect(wrapper.emitted('toggle-collapse')?.[0]).toEqual(['a']);
  });

  it('触控板双指滚动平移画布，不改变缩放比例', async () => {
    const wrapper = mountCanvas();
    // 等待挂载后的自动适配完成，避免把适配事件误当成滚轮结果
    await wrapper.vm.$nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const before = wrapper.emitted('update:viewport')?.length ?? 0;

    await wrapper.find('[data-testid="mindmap-canvas"]').trigger('wheel', {
      deltaY: 80,
      deltaX: 12,
      clientX: 400,
      clientY: 300,
    });

    const events = wrapper.emitted('update:viewport');
    expect(events).toBeTruthy();
    expect(events!.length).toBeGreaterThan(before);
    const viewport = events![events!.length - 1]![0] as { x: number; y: number; zoom: number };
    expect(viewport.zoom).toBe(1);
    expect(viewport.x).toBe(-12);
    expect(viewport.y).toBe(-80);
    expect(Number.isFinite(viewport.x)).toBe(true);
    expect(Number.isFinite(viewport.y)).toBe(true);
  });

  it('Ctrl/Cmd 加滚轮仍可缩放画布', async () => {
    const wrapper = mountCanvas();
    await wrapper.vm.$nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const before = wrapper.emitted('update:viewport')?.length ?? 0;

    await wrapper.find('[data-testid="mindmap-canvas"]').trigger('wheel', {
      deltaY: -120,
      clientX: 400,
      clientY: 300,
      ctrlKey: true,
    });

    const events = wrapper.emitted('update:viewport');
    expect(events).toBeTruthy();
    expect(events!.length).toBeGreaterThan(before);
    const viewport = events![events!.length - 1]![0] as { x: number; y: number; zoom: number };
    expect(viewport.zoom).toBeGreaterThan(1);
  });

  it('适配内容与重置视口通过暴露方法发出视口', async () => {
    const wrapper = mountCanvas();
    const exposed = wrapper.vm as unknown as { fitView: () => void; resetView: () => void };
    exposed.fitView();
    let events = wrapper.emitted('update:viewport');
    expect(events).toBeTruthy();
    const fitted = events![events!.length - 1]![0] as { zoom: number };
    expect(fitted.zoom).toBeGreaterThan(0);
    // 小图适配允许轻微放大填满空白，但不超过上限 1.15（避免后续新增节点跑到可视区外）
    expect(fitted.zoom).toBeLessThanOrEqual(1.15);

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

  it('仅在有选中文本时显示较大的格式工具栏，并提供应用内右键菜单', async () => {
    const wrapper = mountCanvas({ editingId: 'a', editingText: '分支 A' });
    const editor = wrapper.get<HTMLTextAreaElement>('[data-testid="mm-inline-editor"]');
    expect(wrapper.find('[role="toolbar"][aria-label="文字颜色与高亮"]').exists()).toBe(false);
    editor.element.setSelectionRange(0, 3);
    await editor.trigger('select');
    expect(wrapper.find('[role="toolbar"][aria-label="文字颜色与高亮"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="mm-text-color"]').element.clientWidth).toBeGreaterThanOrEqual(0);

    await editor.trigger('contextmenu', { clientX: 90, clientY: 80 });
    expect(wrapper.find('[data-testid="mm-text-context-menu"]').exists()).toBe(true);
    await editor.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-testid="mm-text-context-menu"]').exists()).toBe(false);
  });

  it('文本菜单复制通过系统剪贴板写入选中内容', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText, readText: vi.fn() } });
    const wrapper = mountCanvas({ editingId: 'a', editingText: '分支 A' });
    const editor = wrapper.get<HTMLTextAreaElement>('[data-testid="mm-inline-editor"]');
    editor.element.setSelectionRange(0, 3);
    await editor.trigger('select');
    await editor.trigger('contextmenu', { clientX: 90, clientY: 80 });
    await wrapper.get('[data-testid="mm-text-context-menu"] [role="menuitem"]:nth-child(2)').trigger('click');
    expect(writeText).toHaveBeenCalledWith('分支 ');
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
    expect(path.attributes('marker-end')).toContain('mm-line-arrow');
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

/* ------------------- UX-1：平移 / 节点拖拽 / 右键菜单 ------------------- */

/** 在 window 上派发指针事件（真实拖拽的移动/松开都发生在这里）。 */
function dispatchPointer(type: string, x: number, y: number) {
  window.dispatchEvent(new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: 0,
    bubbles: true,
    cancelable: true,
  }));
}

describe('MindmapCanvas UX-1', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('空白处按住拖动平移画布并 emit update:viewport（修复 @pointerdown.self 永不触发）', async () => {
    const wrapper = mountCanvas();
    await wrapper.vm.$nextTick();
    const canvas = wrapper.find('[data-testid="mindmap-canvas"]');

    await canvas.trigger('pointerdown', { button: 0, clientX: 100, clientY: 100 });
    // 平移中光标改为 grabbing
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="mindmap-canvas"]').classes()).toContain('is-panning');

    dispatchPointer('pointermove', 160, 130);
    const events = wrapper.emitted('update:viewport');
    expect(events).toBeTruthy();
    expect(events![events!.length - 1]![0]).toEqual({ x: 60, y: 30, zoom: 1 });

    dispatchPointer('pointerup', 160, 130);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="mindmap-canvas"]').classes()).not.toContain('is-panning');
    // 平移不是选中
    expect(wrapper.emitted('select')).toBeFalsy();
    expect(wrapper.emitted('style-target')).toBeFalsy();
  });

  it('空白处点击发出画布样式目标', async () => {
    const wrapper = mountCanvas();
    const canvas = wrapper.find('[data-testid="mindmap-canvas"]');
    await canvas.trigger('pointerdown', { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    dispatchPointer('pointerup', 100, 100);
    expect(wrapper.emitted('style-target')?.[0]).toEqual([{ kind: 'canvas' }]);
  });

  it('在节点上按下不会触发平移', async () => {
    const wrapper = mountCanvas();
    await wrapper.vm.$nextTick();
    const before = wrapper.emitted('update:viewport')?.length ?? 0;

    await wrapper.find('.mm-node[data-node-id="b"]').trigger('pointerdown', {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    dispatchPointer('pointermove', 120, 120);
    expect(wrapper.emitted('update:viewport')?.length ?? 0).toBe(before);
    dispatchPointer('pointerup', 120, 120);
  });

  it('节点拖拽：>5px 才进入拖拽，松手在目标节点上 emit move', async () => {
    const wrapper = mountCanvas();
    await wrapper.vm.$nextTick();
    const from = nodeCenter(wrapper, 'a1');
    const to = nodeCenter(wrapper, 'b');
    const dragged = wrapper.find('.mm-node[data-node-id="a1"]');

    await dragged.trigger('pointerdown', { button: 0, clientX: from.x, clientY: from.y });
    // 位移 3px：低于阈值，仍视为点击
    dispatchPointer('pointermove', from.x + 3, from.y + 1);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.mm-node[data-node-id="a1"]').classes()).not.toContain('is-dragging');

    // 越过阈值并落到目标节点 b 上：源半透明、目标高亮
    dispatchPointer('pointermove', to.x, to.y);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.mm-node[data-node-id="a1"]').classes()).toContain('is-dragging');
    expect(wrapper.find('.mm-node[data-node-id="b"]').classes()).toContain('is-drag-over');

    dispatchPointer('pointerup', to.x, to.y);
    expect(wrapper.emitted('move')?.[0]).toEqual(['a1', 'b']);
    // 拖拽收尾时抑制一次 click，避免误选中
    await dragged.trigger('click');
    expect(wrapper.emitted('select')).toBeFalsy();
  });

  it('同级节点拖到目标节点边缘时显示插入线并发出前后位置', async () => {
    const wrapper = mountCanvas();
    await wrapper.vm.$nextTick();
    const from = nodeCenter(wrapper, 'b');
    const target = wrapper.find('.mm-node[data-node-id="a"]');
    const transform = target.attributes('transform')!.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!;
    const rect = target.find('.mm-node-box').element as SVGRectElement;
    const beforeX = Number(transform[1]);
    const beforeY = Number(transform[2]) - Number(rect.getAttribute('height')) * 0.35;
    const dragged = wrapper.find('.mm-node[data-node-id="b"]');

    await dragged.trigger('pointerdown', { button: 0, clientX: from.x, clientY: from.y });
    dispatchPointer('pointermove', beforeX, beforeY);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="mm-drop-insertion"]').exists()).toBe(true);

    dispatchPointer('pointerup', beforeX, beforeY);
    expect(wrapper.emitted('move')?.[0]).toEqual(['b', 'a', 'before']);
  });

  it('拖拽释放在空白处不 emit move', async () => {
    const wrapper = mountCanvas();
    await wrapper.vm.$nextTick();
    const from = nodeCenter(wrapper, 'a1');
    const dragged = wrapper.find('.mm-node[data-node-id="a1"]');

    await dragged.trigger('pointerdown', { button: 0, clientX: from.x, clientY: from.y });
    dispatchPointer('pointermove', 9999, 9999);
    dispatchPointer('pointerup', 9999, 9999);
    expect(wrapper.emitted('move')).toBeFalsy();
  });

  it('右键空白区域 emit contextmenu（nodeId=null）', async () => {
    const wrapper = mountCanvas();
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="mindmap-canvas"]').trigger('contextmenu', {
      clientX: 9999,
      clientY: 9999,
    });
    expect(wrapper.emitted('contextmenu')?.[0]).toEqual([
      { nodeId: null, clientX: 9999, clientY: 9999 },
    ]);
  });

  it('右键节点 emit contextmenu 且带命中节点 id', async () => {
    const wrapper = mountCanvas();
    await wrapper.vm.$nextTick();
    const target = nodeCenter(wrapper, 'a1');
    await wrapper.find('[data-testid="mindmap-canvas"]').trigger('contextmenu', {
      clientX: target.x,
      clientY: target.y,
    });
    const payload = wrapper.emitted('contextmenu')?.[0]?.[0] as { nodeId: string | null };
    expect(payload.nodeId).toBe('a1');
  });
});

/* ---------------- UX-1 回归守卫：mindmap 组件只允许使用 Tau 主题 token ---------------- */

describe('Mindmap 组件主题 token 回归守卫', () => {
  /** 曾被误用、实际并不存在的变量（暗色主题下会回落成写死的浅色，导致白底浅字）。 */
  const BANNED_PATTERNS = [
    'var(--background',
    'var(--surface,',
    'var(--border,',
    'var(--hover',
    'var(--danger',
    'var(--accent,',
    'var(--selected,',
    'var(--font-sans',
    'var(--chip-bg',
    'var(--notice-bg',
    'var(--confirm-bg',
    'var(--surface-input',
  ];

  const COMPONENTS = [
    'MindmapStage.vue',
    'MindmapCanvas.vue',
    'MindmapOutlinePanel.vue',
    'MindmapPropertiesPanel.vue',
    'MindmapImportPreviewDialog.vue',
    'MindmapExportDialog.vue',
    'MindmapContextMenu.vue',
  ];

  it('不再引用不存在的主题变量', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    for (const file of COMPONENTS) {
      const fullPath = path.join(process.cwd(), 'frontend/src/components/editor/mindmap', file);
      const source = fs.readFileSync(fullPath, 'utf8');
      for (const pattern of BANNED_PATTERNS) {
        expect(source.includes(pattern), `${file} 不应再包含 ${pattern}`).toBe(false);
      }
    }
  });
});

/* ---------------------- UX-2：边界（boundary）/ 概要（summary） ---------------------- */

describe('MindmapCanvas UX-2', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('topic.boundary 渲染边界框与标签，自定义颜色生效', () => {
    const doc = buildDoc();
    doc.topics.a = {
      ...doc.topics.a!,
      boundary: { label: '阶段一', color: '#2563eb' },
    };
    const wrapper = mountCanvas({ document: doc });

    const boundaries = wrapper.findAll('[data-testid="mm-boundary"]');
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0]?.attributes('data-boundary-id')).toBe('a');

    const rect = boundaries[0]!.find('rect');
    expect(rect.exists()).toBe(true);
    expect(Number(rect.attributes('width'))).toBeGreaterThan(0);
    expect(Number(rect.attributes('height'))).toBeGreaterThan(0);
    expect(rect.attributes('rx')).toBe('10');
    // 自定义颜色：填充与描边都使用该色
    expect(rect.attributes('style')).toContain('#2563eb');
    expect(boundaries[0]!.text()).toContain('阶段一');
  });

  it('未声明颜色时回落到主题强调色变量（default 主题跟随 Tau token）', () => {
    const doc = buildDoc();
    doc.topics.a = { ...doc.topics.a!, boundary: {} };
    const wrapper = mountCanvas({ document: doc });
    const rect = wrapper.find('[data-testid="mm-boundary"] rect');
    expect(rect.attributes('style')).toContain('var(--mindmap-accent, var(--accent-brand))');
    // 无标签时不渲染标签文字
    expect(wrapper.find('[data-testid="mm-boundary"]').text()).toBe('');
  });

  it('topic.summary 渲染括线路径与文本', () => {
    const doc = buildDoc();
    doc.topics.a = { ...doc.topics.a!, summary: '这组是一类' };
    const wrapper = mountCanvas({ document: doc });

    const summaries = wrapper.findAll('[data-testid="mm-summary"]');
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.attributes('data-summary-id')).toBe('a');
    const path = summaries[0]!.find('path');
    expect(path.exists()).toBe(true);
    expect(path.attributes('d')?.startsWith('M ')).toBe(true);
    expect(summaries[0]!.find('text').text()).toBe('这组是一类');
  });

  it('无边界/概要的文档不渲染任何 overlay', () => {
    const wrapper = mountCanvas();
    expect(wrapper.findAll('[data-testid="mm-boundary"]')).toHaveLength(0);
    expect(wrapper.findAll('[data-testid="mm-summary"]')).toHaveLength(0);
  });

  it('overlay 绘制在连线之前，且不改变节点/连线数量', () => {
    const doc = buildDoc();
    doc.topics.a = { ...doc.topics.a!, boundary: { label: '框' }, summary: '概要' };
    const wrapper = mountCanvas({ document: doc });

    expect(wrapper.findAll('.mm-node')).toHaveLength(4);
    expect(wrapper.findAll('.mm-edge')).toHaveLength(3);

    const html = wrapper.find('.mm-svg').html();
    const boundaryIndex = html.indexOf('mm-boundary');
    const edgeIndex = html.indexOf('mm-edge');
    expect(boundaryIndex).toBeGreaterThanOrEqual(0);
    expect(edgeIndex).toBeGreaterThan(boundaryIndex);
  });

  it('折叠节点后其边界只包住自身（框宽随可见范围缩小）', () => {
    const doc = buildDoc();
    doc.topics.a = { ...doc.topics.a!, boundary: {} };
    const expanded = mountCanvas({ document: doc });
    const expandedWidth = Number(expanded.find('[data-testid="mm-boundary"] rect').attributes('width'));

    const collapsedDoc = buildDoc();
    collapsedDoc.topics.a = { ...collapsedDoc.topics.a!, boundary: {}, collapsed: true };
    const collapsed = mountCanvas({ document: collapsedDoc });
    const collapsedWidth = Number(collapsed.find('[data-testid="mm-boundary"] rect').attributes('width'));

    expect(collapsedWidth).toBeLessThan(expandedWidth);
    // 折叠后 a1 不渲染，但边界仍在
    expect(collapsed.find('.mm-node[data-node-id="a1"]').exists()).toBe(false);
    expect(collapsed.findAll('[data-testid="mm-boundary"]')).toHaveLength(1);
  });
});

/* ----------------------- 彩虹主题：分支配色渲染 ----------------------- */

describe('MindmapCanvas 彩虹主题', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function rainbowDoc(): MindMapDocument {
    const doc = buildDoc();
    doc.themeId = 'rainbow';
    return doc;
  }

  it('彩虹主题下每条连线按所属分支取色，兄弟分支颜色不同', () => {
    const wrapper = mountCanvas({ document: rainbowDoc() });
    // 边界 a→a1 与根→a（同属分支 a）应为第一种分支色
    const edgeToA = wrapper.find('.mm-edge[data-edge-id$="->a"]');
    const edgeToA1 = wrapper.find('.mm-edge[data-edge-id="a->a1"]');
    const edgeToB = wrapper.find('.mm-edge[data-edge-id$="->b"]');
    for (const edge of [edgeToA, edgeToA1, edgeToB]) {
      expect(edge.exists()).toBe(true);
      expect(edge.classes()).toContain('mm-edge--rainbow');
    }
    const styleA = (edgeToA.attributes('style') ?? '').toLowerCase();
    const styleA1 = (edgeToA1.attributes('style') ?? '').toLowerCase();
    const styleB = (edgeToB.attributes('style') ?? '').toLowerCase();
    // 子节点继承父分支：a 与 a1 同色
    expect(styleA1).toBe(styleA);
    // 兄弟一级分支分到不同颜色
    expect(styleB).not.toBe(styleA);
    expect(styleA).toContain('#ff6b6b');
  });

  it('彩虹主题为带分支的节点注入 --mm-hue 并渲染分支圆点，根节点无圆点', () => {
    const wrapper = mountCanvas({ document: rainbowDoc() });
    const nodeA = wrapper.find('.mm-node[data-node-id="a"]');
    const nodeRoot = wrapper.find('.mm-node.is-root');

    expect((nodeA.attributes('style') ?? '').toLowerCase()).toContain('--mm-hue');
    expect(nodeA.find('.mm-branch-dot').exists()).toBe(true);

    // 根节点不属于任何一级分支：不注入色相、不画圆点
    expect((nodeRoot.attributes('style') ?? '')).not.toContain('--mm-hue');
    expect(nodeRoot.find('.mm-branch-dot').exists()).toBe(false);
  });

  it('非彩虹主题不渲染分支圆点、连线不带分支内联色', () => {
    const wrapper = mountCanvas(); // 默认 default 主题
    expect(wrapper.find('.mm-branch-dot').exists()).toBe(false);
    const edge = wrapper.find('.mm-edge[data-edge-id="a->a1"]');
    expect(edge.classes()).not.toContain('mm-edge--rainbow');
    expect(edge.attributes('style')).toBeUndefined();
  });

  it('彩虹主题画布只注入强调色，不写死节点填充（节点底色跟随面板）', () => {
    const canvas = mountCanvas({ document: rainbowDoc() })
      .find('[data-testid="mindmap-canvas"]');
    const style = (canvas.attributes('style') ?? '').toLowerCase();
    expect(style).toContain('--mindmap-accent');
    expect(style).not.toContain('--mindmap-node-bg');
    expect(style).not.toContain('--mindmap-edge');
  });

  it('折叠子节点后不渲染其连线与圆点', () => {
    const doc = rainbowDoc();
    doc.topics.a = { ...doc.topics.a!, collapsed: true };
    const wrapper = mountCanvas({ document: doc });
    expect(wrapper.find('.mm-edge[data-edge-id="a->a1"]').exists()).toBe(false);
    expect(wrapper.find('.mm-node[data-node-id="a1"]').exists()).toBe(false);
    // 折叠的父节点仍有分支归属，圆点保留
    expect(wrapper.find('.mm-node[data-node-id="a"] .mm-branch-dot').exists()).toBe(true);
  });

  it('分支序号按文档 childIds 顺序稳定分配（与布局模式无关）', () => {
    const doc = rainbowDoc();
    const colorOf = (themeId: string, layoutMode: string) => {
      const variant = buildDoc();
      variant.themeId = themeId;
      (variant as unknown as { layoutMode: string }).layoutMode = layoutMode;
      const wrapper = mountCanvas({ document: variant });
      const style = wrapper.find('.mm-edge[data-edge-id="a->a1"]').attributes('style') ?? '';
      return style.toLowerCase();
    };
    // 切换布局模式后，同一条分支的颜色必须保持一致（避免颜色随布局乱跳）
    const mindmap = colorOf('rainbow', 'mindmap');
    const logic = colorOf('rainbow', 'logic');
    const org = colorOf('rainbow', 'org');
    expect(logic).toBe(mindmap);
    expect(org).toBe(mindmap);
    // 一级分支 a 固定使用调色板第一色
    expect(mindmap).toContain('#ff6b6b');

    const bColor = (() => {
      const wrapper = mountCanvas({ document: doc });
      return (wrapper.find('.mm-edge[data-edge-id$="->b"]').attributes('style') ?? '').toLowerCase();
    })();
    // b 是第二个分支 → 第二种颜色
    expect(bColor).toContain('#ff9f43');
  });

  it('彩虹主题节点文字不会被 stroke 覆盖（浅色主题可读性回归）', () => {
    // 该断言守住真实缺陷：文字曾继承到近白 stroke，浅色画布上表现为「白底浅字」。
    const style = wrapperStyleSheetText();
    expect(style).toMatch(/\.mm-node-text\s*\{[^}]*stroke:\s*none/);
  });
});

/* ------------------------- 节点文字不得溢出节点框（回归） ------------------------- */

describe('MindmapCanvas 节点文字居中', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('文本行 tspan 不带 dx 偏移，避免与 text-anchor=middle 重复计算导致整行左移出框', () => {
    // 真实缺陷：给首个 tspan 加 dx=-宽度/2，与父级 text-anchor="middle" 叠加，
    // 结果整行文字左移半个字宽，在长文本节点上表现为「文字溢出节点框」。
    const wrapper = mountCanvas();
    const tspans = wrapper.findAll('.mm-node-text tspan');
    expect(tspans.length).toBeGreaterThan(0);
    for (const tspan of tspans) {
      expect(tspan.attributes('dx')).toBeUndefined();
    }
  });

  it('带局部高亮的文本同样不使用 dx', () => {
    const doc = buildDoc();
    doc.topics.a = {
      ...doc.topics.a!,
      text: '分支A高亮',
      textStyles: [{ start: 0, end: 3, color: '#ff0000', background: '#ffff00' }],
    };
    const wrapper = mountCanvas({ document: doc });
    const tspans = wrapper.findAll('.mm-node[data-node-id="a"] .mm-node-text tspan');
    expect(tspans.length).toBeGreaterThan(1);
    for (const tspan of tspans) {
      expect(tspan.attributes('dx')).toBeUndefined();
    }
  });
});

/* ------------------------------- 迷你地图（Stitch 稿） ------------------------------- */
describe('MindmapCanvas 迷你地图', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('渲染全图缩略节点与当前视口矩形', () => {
    const wrapper = mountCanvas();
    const minimap = wrapper.find('[data-testid="mm-minimap"]');
    expect(minimap.exists()).toBe(true);
    // 每个可见节点一个缩略方块
    expect(minimap.findAll('.mm-minimap-node')).toHaveLength(4);
    // 视口矩形用于指示当前可见区域
    expect(minimap.find('.mm-minimap-view').exists()).toBe(true);
  });

  it('中心主题缩略方块带 is-root 标记', () => {
    const wrapper = mountCanvas();
    expect(wrapper.find('[data-testid="mm-minimap"] .mm-minimap-node.is-root').exists()).toBe(true);
  });

  it('点击迷你地图改变视口（发出 update:viewport）', async () => {
    const wrapper = mountCanvas();
    const minimap = wrapper.find('[data-testid="mm-minimap"]');
    await minimap.trigger('click', { clientX: 40, clientY: 30 });
    expect(wrapper.emitted('update:viewport')).toBeTruthy();
  });
});

/** 读取 MindmapCanvas 的样式文本（用于静态样式契约断言）。 */
function wrapperStyleSheetText(): string {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  return fs.readFileSync(
    path.resolve(__dirname, '../../../frontend/src/components/editor/mindmap/MindmapCanvas.vue'),
    'utf8',
  );
}
