import { describe, expect, it } from 'vitest';
import { createEmptyMindMapDocument } from '@/services/mindmapService';
import {
  DEFAULT_MINDMAP_LAYOUT_OPTIONS,
  MINDMAP_BOUNDARY_LABEL_HEIGHT,
  MINDMAP_BOUNDARY_PADDING,
  MINDMAP_SUMMARY_GAP,
  computeFitViewport,
  computeMindmapLayout,
  estimateCharWidth,
  measureTextWidth,
  measureTopic,
  wrapTopicText,
  type MindmapLayout,
} from '@/services/mindmapLayoutService';
import type { MindMapDocument, MindMapLayoutMode } from '@/types/mindmap';

function buildTree(): MindMapDocument {
  const doc = createEmptyMindMapDocument('中心');
  const root = doc.rootTopicId;
  doc.topics.a = { id: 'a', parentId: root, childIds: ['a1'], text: '分支 A' };
  doc.topics.a1 = { id: 'a1', parentId: 'a', childIds: [], text: 'A1' };
  doc.topics.b = { id: 'b', parentId: root, childIds: [], text: '分支 B' };
  doc.topics.c = { id: 'c', parentId: root, childIds: [], text: '分支 C' };
  doc.topics.d = { id: 'd', parentId: root, childIds: [], text: '分支 D' };
  const rootTopic = doc.topics[root];
  if (rootTopic) rootTopic.childIds = ['a', 'b', 'c', 'd'];
  return doc;
}

describe('文本测量与换行', () => {
  it('全角字符宽度大于半角', () => {
    const fontSize = 13;
    expect(estimateCharWidth('中', fontSize)).toBeGreaterThan(estimateCharWidth('a', fontSize));
    expect(estimateCharWidth(' ', fontSize)).toBeLessThan(estimateCharWidth('a', fontSize));
  });

  it('measureTextWidth 累加字符宽度', () => {
    expect(measureTextWidth('中文', 10)).toBe(20);
    expect(measureTextWidth('', 10)).toBe(0);
  });

  it('长文本按最大宽度换行', () => {
    const lines = wrapTopicText('这是一个很长的中文主题需要换行显示', 60, 13);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measureTextWidth(line, 13)).toBeLessThanOrEqual(60 + 13);
    }
  });

  it('保留显式换行', () => {
    expect(wrapTopicText('第一行\n第二行', 200, 13)).toEqual(['第一行', '第二行']);
  });

  it('英文优先在空白处断行且不丢字符', () => {
    const lines = wrapTopicText('alpha beta gamma delta', 80, 13);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measureTextWidth(line, 13)).toBeLessThanOrEqual(80 + 13);
    }
    // 断行不丢内容：按空白归一后应与原文一致
    expect(lines.join(' ').replace(/\s+/g, ' ').trim()).toBe('alpha beta gamma delta');
    // 不应把英文单词从中间切断：每行的词都必须是原词
    const words = ['alpha', 'beta', 'gamma', 'delta'];
    for (const line of lines) {
      for (const word of line.split(/\s+/).filter(Boolean)) {
        expect(words).toContain(word);
      }
    }
  });

  it('空文本仍占一行', () => {
    expect(wrapTopicText('', 100, 13)).toEqual(['']);
  });

  it('measureTopic 遵守最小宽度并包含内边距', () => {
    const measured = measureTopic('A', DEFAULT_MINDMAP_LAYOUT_OPTIONS);
    expect(measured.width).toBeGreaterThanOrEqual(DEFAULT_MINDMAP_LAYOUT_OPTIONS.minNodeWidth);
    expect(measured.height).toBe(
      measured.lines.length * DEFAULT_MINDMAP_LAYOUT_OPTIONS.lineHeight
        + DEFAULT_MINDMAP_LAYOUT_OPTIONS.paddingY * 2,
    );
  });
});

describe('computeMindmapLayout', () => {
  it('根节点居中于原点', () => {
    const layout = computeMindmapLayout(buildTree());
    const root = layout.nodes.find((node) => node.side === 'root');
    expect(root).toBeDefined();
    expect(root?.x).toBe(0);
    expect(root?.y).toBe(0);
    expect(root?.depth).toBe(0);
  });

  it('根的子主题均衡分派到左右两侧', () => {
    const layout = computeMindmapLayout(buildTree());
    const right = layout.nodes.filter((node) => node.side === 'right' && node.depth === 1);
    const left = layout.nodes.filter((node) => node.side === 'left' && node.depth === 1);
    expect(right).toHaveLength(2);
    expect(left).toHaveLength(2);
  });

  it('左侧节点 x 为负、右侧为正', () => {
    const layout = computeMindmapLayout(buildTree());
    for (const node of layout.nodes) {
      if (node.side === 'right' && node.depth > 0) expect(node.x).toBeGreaterThan(0);
      if (node.side === 'left' && node.depth > 0) expect(node.x).toBeLessThan(0);
    }
  });

  it('同一侧同级节点纵向不重叠', () => {
    const layout = computeMindmapLayout(buildTree());
    const rightLevel1 = layout.nodes
      .filter((node) => node.side === 'right' && node.depth === 1)
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < rightLevel1.length; i += 1) {
      const prev = rightLevel1[i - 1]!;
      const current = rightLevel1[i]!;
      expect(current.y - current.height / 2)
        .toBeGreaterThanOrEqual(prev.y + prev.height / 2);
    }
  });

  it('子主题纵向以父节点为中心对称分布', () => {
    const layout = computeMindmapLayout(buildTree());
    const parent = layout.nodes.find((node) => node.id === 'a');
    const child = layout.nodes.find((node) => node.id === 'a1');
    expect(parent).toBeDefined();
    expect(child).toBeDefined();
    // 单子节点时子节点与父节点同高
    expect(child!.y).toBe(parent!.y);
  });

  it('连线数量等于可见节点数减一', () => {
    const layout = computeMindmapLayout(buildTree());
    expect(layout.edges).toHaveLength(layout.nodes.length - 1);
    for (const edge of layout.edges) {
      expect(edge.path.startsWith('M ')).toBe(true);
      expect(edge.path).toContain(' C ');
    }
  });

  it('折叠节点隐藏其后代与连线', () => {
    const doc = buildTree();
    doc.topics.a = { ...doc.topics.a!, collapsed: true };
    const layout = computeMindmapLayout(doc);
    expect(layout.nodes.some((node) => node.id === 'a1')).toBe(false);
    expect(layout.edges.some((edge) => edge.childId === 'a1')).toBe(false);
    const a = layout.nodes.find((node) => node.id === 'a');
    expect(a?.collapsed).toBe(true);
    expect(a?.hasChildren).toBe(true);
  });

  it('bounds 覆盖所有节点', () => {
    const layout = computeMindmapLayout(buildTree());
    for (const node of layout.nodes) {
      expect(node.x - node.width / 2).toBeGreaterThanOrEqual(layout.bounds.minX - 0.01);
      expect(node.x + node.width / 2).toBeLessThanOrEqual(layout.bounds.maxX + 0.01);
      expect(node.y - node.height / 2).toBeGreaterThanOrEqual(layout.bounds.minY - 0.01);
      expect(node.y + node.height / 2).toBeLessThanOrEqual(layout.bounds.maxY + 0.01);
    }
    expect(layout.bounds.width).toBeGreaterThan(0);
    expect(layout.bounds.height).toBeGreaterThan(0);
  });

  it('单节点文档布局有效', () => {
    const layout = computeMindmapLayout(createEmptyMindMapDocument('单节点'));
    expect(layout.nodes).toHaveLength(1);
    expect(layout.edges).toHaveLength(0);
    expect(layout.bounds.width).toBeGreaterThan(0);
  });

  it('布局不修改文档（纯函数）', () => {
    const doc = buildTree();
    const before = JSON.stringify(doc);
    computeMindmapLayout(doc);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('200 节点布局在合理时间内完成', () => {
    const doc = build200Nodes();
    const start = performance.now();
    const layout = computeMindmapLayout(doc);
    const duration = performance.now() - start;
    expect(layout.nodes.length).toBe(201);
    expect(duration).toBeLessThan(500);
  });

  it('1000 节点布局完成且节点数正确', () => {
    const doc = buildWideTree(1000);
    const start = performance.now();
    const layout = computeMindmapLayout(doc);
    const duration = performance.now() - start;
    expect(layout.nodes.length).toBe(1000);
    expect(duration).toBeLessThan(3000);
  });
});

describe('computeFitViewport', () => {
  it('缩放后内容完整落入视口并居中', () => {
    const layout = computeMindmapLayout(buildTree());
    const viewport = computeFitViewport(layout.bounds, { width: 1200, height: 800 }, 48);
    expect(viewport.zoom).toBeGreaterThan(0);
    const centerX = layout.bounds.minX + layout.bounds.width / 2;
    const centerY = layout.bounds.minY + layout.bounds.height / 2;
    const screenX = centerX * viewport.zoom + viewport.x;
    const screenY = centerY * viewport.zoom + viewport.y;
    expect(screenX).toBeCloseTo(600, 0);
    expect(screenY).toBeCloseTo(400, 0);
  });

  it('空 bounds 返回安全默认视口', () => {
    const viewport = computeFitViewport(
      { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
      { width: 800, height: 600 },
    );
    expect(viewport).toEqual({ x: 400, y: 300, zoom: 1 });
  });

  it('缩放遵守上下限', () => {
    const tiny = computeFitViewport(
      { minX: 0, minY: 0, maxX: 10000, maxY: 10000, width: 10000, height: 10000 },
      { width: 800, height: 600 },
      48,
      { min: 0.1, max: 2 },
    );
    expect(tiny.zoom).toBe(0.1);
  });
});

/** 构造 200 节点（20 个一级分支 × 10 个二级）。 */
function build200Nodes(): MindMapDocument {
  const doc = createEmptyMindMapDocument('性能');
  const root = doc.rootTopicId;
  const rootTopic = doc.topics[root];
  if (!rootTopic) return doc;
  const childIds: string[] = [];
  for (let i = 0; i < 20; i += 1) {
    const id = `n${i}`;
    const grandchildren = Array.from({ length: 9 }, (_, j) => `n${i}_${j}`);
    doc.topics[id] = { id, parentId: root, childIds: grandchildren, text: `分支 ${i}` };
    for (const gid of grandchildren) {
      doc.topics[gid] = { id: gid, parentId: id, childIds: [], text: `叶 ${gid}` };
    }
    childIds.push(id);
  }
  rootTopic.childIds = childIds;
  return doc;
}

/** 构造宽树：根下 999 个一级子节点。 */
function buildWideTree(count: number): MindMapDocument {
  const doc = createEmptyMindMapDocument('宽');
  const root = doc.rootTopicId;
  const rootTopic = doc.topics[root];
  if (!rootTopic) return doc;
  const ids: string[] = [];
  for (let i = 0; i < count - 1; i += 1) {
    const id = `w${i}`;
    doc.topics[id] = { id, parentId: root, childIds: [], text: `节点 ${i}` };
    ids.push(id);
  }
  rootTopic.childIds = ids;
  return doc;
}

/* --------------------- 阶段 4A：结构布局模式（mindmap/logic/tree/org） --------------------- */

/** 以指定布局模式对同一棵测试树求布局。 */
function layoutIn(mode: MindMapLayoutMode): MindmapLayout {
  const doc = buildTree();
  doc.layoutMode = mode;
  return computeMindmapLayout(doc);
}

/** 按 id 取节点，缺失即报错（避免各用例重复写非空断言）。 */
function nodeOf(layout: MindmapLayout, id: string) {
  const node = layout.nodes.find((item) => item.id === id);
  if (!node) throw new Error(`missing node ${id}`);
  return node;
}

describe('结构布局模式：mindmap（保持现状不回归）', () => {
  it('仍为左右双侧，连线方向为 horizontal', () => {
    const layout = layoutIn('mindmap');
    expect(layout.mode).toBe('mindmap');
    expect(layout.orientation).toBe('horizontal');
    // 左右两侧都应有节点，说明没有被改成单侧布局
    expect(layout.nodes.some((node) => node.depth > 0 && node.x < 0)).toBe(true);
    expect(layout.nodes.some((node) => node.depth > 0 && node.x > 0)).toBe(true);
    for (const edge of layout.edges) expect(edge.orientation).toBe('horizontal');
  });

  it('非法 layoutMode 回退为 mindmap', () => {
    const doc = buildTree();
    (doc as { layoutMode: unknown }).layoutMode = 'radial';
    const layout = computeMindmapLayout(doc);
    expect(layout.mode).toBe('mindmap');
  });
});

describe('结构布局模式：logic（单侧向右）', () => {
  it('所有非根节点都在根右侧（x > 0）', () => {
    const layout = layoutIn('logic');
    expect(layout.mode).toBe('logic');
    const root = layout.nodes.find((node) => node.depth === 0)!;
    expect(root.x).toBe(0);
    for (const node of layout.nodes) {
      if (node.depth === 0) continue;
      expect(node.x).toBeGreaterThan(0);
    }
  });

  it('层级向右逐列展开：子节点列中心大于父节点', () => {
    const layout = layoutIn('logic');
    const parent = nodeOf(layout, 'a');
    const child = nodeOf(layout, 'a1');
    expect(child.x).toBeGreaterThan(parent.x);
    // 同一层的节点共享同一列中心
    const level1Xs = layout.nodes.filter((node) => node.depth === 1).map((node) => node.x);
    expect(new Set(level1Xs).size).toBe(1);
  });

  it('同一父节点的子节点纵向堆叠且不重叠', () => {
    const layout = layoutIn('logic');
    const siblings = layout.nodes
      .filter((node) => node.depth === 1)
      .sort((a, b) => a.y - b.y);
    expect(siblings).toHaveLength(4);
    for (let i = 1; i < siblings.length; i += 1) {
      const prev = siblings[i - 1]!;
      const current = siblings[i]!;
      expect(current.y - current.height / 2).toBeGreaterThanOrEqual(prev.y + prev.height / 2);
    }
  });

  it('连线为水平贝塞尔（orientation=horizontal）', () => {
    const layout = layoutIn('logic');
    expect(layout.edges).toHaveLength(layout.nodes.length - 1);
    for (const edge of layout.edges) {
      expect(edge.orientation).toBe('horizontal');
      expect(edge.path).toContain(' C ');
    }
  });
});

describe('结构布局模式：tree（右侧树形）', () => {
  it('方向与 logic 一致：所有非根节点 x > 0', () => {
    const layout = layoutIn('tree');
    expect(layout.mode).toBe('tree');
    for (const node of layout.nodes) {
      if (node.depth === 0) continue;
      expect(node.x).toBeGreaterThan(0);
    }
  });

  it('节点坐标与 logic 完全一致，仅连线风格不同', () => {
    // 同一份文档切换模式，保证根节点 id 一致，只比较坐标
    const doc = buildTree();
    doc.layoutMode = 'logic';
    const logic = computeMindmapLayout(doc);
    doc.layoutMode = 'tree';
    const tree = computeMindmapLayout(doc);
    const positions = (layout: MindmapLayout) => layout.nodes
      .map((node) => `${node.id}:${node.x},${node.y}`)
      .sort();
    expect(positions(tree)).toEqual(positions(logic));
  });

  it('连线为树形正交折线（含 L 指令、无 C 指令）', () => {
    const layout = layoutIn('tree');
    expect(layout.edges).toHaveLength(layout.nodes.length - 1);
    for (const edge of layout.edges) {
      expect(edge.orientation).toBe('horizontal');
      expect(edge.path.startsWith('M ')).toBe(true);
      expect(edge.path).toContain(' L ');
      expect(edge.path).not.toContain(' C ');
    }
  });
});

describe('结构布局模式：org（自上而下组织图）', () => {
  it('根在上，子节点 y 严格大于父节点 y', () => {
    const layout = layoutIn('org');
    expect(layout.mode).toBe('org');
    const root = layout.nodes.find((node) => node.depth === 0)!;
    expect(root.y).toBe(0);
    for (const node of layout.nodes) {
      if (node.depth === 0) continue;
      expect(node.y).toBeGreaterThan(root.y);
    }
    expect(nodeOf(layout, 'a1').y).toBeGreaterThan(nodeOf(layout, 'a').y);
  });

  it('同一父节点的子节点横向展开、同级对齐且不重叠', () => {
    const layout = layoutIn('org');
    const siblings = layout.nodes
      .filter((node) => node.depth === 1)
      .sort((a, b) => a.x - b.x);
    expect(siblings).toHaveLength(4);
    // 同级节点在同一行
    expect(new Set(siblings.map((node) => node.y)).size).toBe(1);
    for (let i = 1; i < siblings.length; i += 1) {
      const prev = siblings[i - 1]!;
      const current = siblings[i]!;
      expect(current.x - current.width / 2).toBeGreaterThanOrEqual(prev.x + prev.width / 2);
    }
  });

  it('所有连线为竖直贝塞尔：父节点底边中心 → 子节点顶边中心', () => {
    const layout = layoutIn('org');
    expect(layout.edges).toHaveLength(layout.nodes.length - 1);
    for (const edge of layout.edges) {
      expect(edge.orientation).toBe('vertical');
      expect(edge.path).toContain(' C ');
      const parent = nodeOf(layout, edge.parentId);
      const child = nodeOf(layout, edge.childId);
      const start = edge.path.match(/^M ([\d.-]+) ([\d.-]+)/);
      const end = edge.path.match(/([\d.-]+) ([\d.-]+)$/);
      expect(start).toBeTruthy();
      expect(end).toBeTruthy();
      // 起点 = 父节点底边中心
      expect(Number(start![1])).toBeCloseTo(parent.x, 1);
      expect(Number(start![2])).toBeCloseTo(parent.y + parent.height / 2, 1);
      // 终点 = 子节点顶边中心
      expect(Number(end![1])).toBeCloseTo(child.x, 1);
      expect(Number(end![2])).toBeCloseTo(child.y - child.height / 2, 1);
    }
  });

  it('bounds 覆盖所有节点且适配视口可用', () => {
    const layout = layoutIn('org');
    expect(layout.bounds.width).toBeGreaterThan(0);
    expect(layout.bounds.height).toBeGreaterThan(0);
    for (const node of layout.nodes) {
      expect(node.x - node.width / 2).toBeGreaterThanOrEqual(layout.bounds.minX - 0.01);
      expect(node.x + node.width / 2).toBeLessThanOrEqual(layout.bounds.maxX + 0.01);
      expect(node.y - node.height / 2).toBeGreaterThanOrEqual(layout.bounds.minY - 0.01);
      expect(node.y + node.height / 2).toBeLessThanOrEqual(layout.bounds.maxY + 0.01);
    }
    const viewport = computeFitViewport(layout.bounds, { width: 1000, height: 700 }, 48);
    expect(viewport.zoom).toBeGreaterThan(0);
    const screenX = (layout.bounds.minX + layout.bounds.width / 2) * viewport.zoom + viewport.x;
    const screenY = (layout.bounds.minY + layout.bounds.height / 2) * viewport.zoom + viewport.y;
    expect(screenX).toBeCloseTo(500, 0);
    expect(screenY).toBeCloseTo(350, 0);
  });

  it('单节点 org 布局有效', () => {
    const doc = createEmptyMindMapDocument('单节点组织图');
    doc.layoutMode = 'org';
    const layout = computeMindmapLayout(doc);
    expect(layout.nodes).toHaveLength(1);
    expect(layout.edges).toHaveLength(0);
    expect(layout.orientation).toBe('vertical');
  });
});

/* ------------------------ UX-2：边界（boundary）/ 概要（summary） ------------------------ */

/** 带「分组 A（两个子节点）」的测试树；a 在右侧、b 在左侧。 */
function buildOverlayTree(): MindMapDocument {
  const doc = createEmptyMindMapDocument('边界与概要');
  const root = doc.rootTopicId;
  doc.topics.a = { id: 'a', parentId: root, childIds: ['a1', 'a2'], text: '分组 A' };
  doc.topics.a1 = { id: 'a1', parentId: 'a', childIds: [], text: 'A1' };
  doc.topics.a2 = { id: 'a2', parentId: 'a', childIds: [], text: 'A2' };
  doc.topics.b = { id: 'b', parentId: root, childIds: ['b1'], text: '分组 B' };
  doc.topics.b1 = { id: 'b1', parentId: 'b', childIds: [], text: 'B1' };
  const rootTopic = doc.topics[root];
  if (!rootTopic) throw new Error('missing root');
  rootTopic.childIds = ['a', 'b'];
  return doc;
}

function nodeOfLayout(layout: MindmapLayout, id: string) {
  const node = layout.nodes.find((item) => item.id === id);
  if (!node) throw new Error(`missing node ${id}`);
  return node;
}

/** 节点盒的四条边（左上角坐标系）。 */
function edgesOf(node: { x: number; y: number; width: number; height: number }) {
  return {
    left: node.x - node.width / 2,
    top: node.y - node.height / 2,
    right: node.x + node.width / 2,
    bottom: node.y + node.height / 2,
  };
}

describe('UX-2 边界（boundary）', () => {
  it('未声明边界时不输出任何框', () => {
    const layout = computeMindmapLayout(buildOverlayTree());
    expect(layout.boundaries).toEqual([]);
    expect(layout.summaries).toEqual([]);
  });

  it('边界框包住「该主题 + 全部可见后代」并计入内边距', () => {
    const doc = buildOverlayTree();
    doc.topics.a = { ...doc.topics.a!, boundary: {} };
    const layout = computeMindmapLayout(doc);

    expect(layout.boundaries).toHaveLength(1);
    const frame = layout.boundaries[0]!;
    expect(frame.id).toBe('a');
    expect(frame.label).toBeUndefined();

    for (const id of ['a', 'a1', 'a2']) {
      const box = edgesOf(nodeOfLayout(layout, id));
      expect(frame.x).toBeLessThanOrEqual(box.left);
      expect(frame.y).toBeLessThanOrEqual(box.top);
      expect(frame.x + frame.width).toBeGreaterThanOrEqual(box.right);
      expect(frame.y + frame.height).toBeGreaterThanOrEqual(box.bottom);
    }
    // 内边距固定 12px：框比最小范围每侧多 12
    const a = edgesOf(nodeOfLayout(layout, 'a'));
    const a1 = edgesOf(nodeOfLayout(layout, 'a1'));
    const a2 = edgesOf(nodeOfLayout(layout, 'a2'));
    const minX = Math.min(a.left, a1.left, a2.left);
    const maxX = Math.max(a.right, a1.right, a2.right);
    // 布局会对坐标做 0.1 取整，这里允许 1px 误差
    expect(Math.abs(frame.x - (minX - MINDMAP_BOUNDARY_PADDING))).toBeLessThanOrEqual(1);
    expect(Math.abs(frame.width - (maxX - minX + MINDMAP_BOUNDARY_PADDING * 2)))
      .toBeLessThanOrEqual(1);
  });

  it('有标签时框顶为标签留出高度，标签与颜色原样透传并 trim', () => {
    const doc = buildOverlayTree();
    doc.topics.a = {
      ...doc.topics.a!,
      boundary: { label: '  阶段一  ', color: ' #2563eb ' },
    };
    const withLabel = computeMindmapLayout(doc).boundaries[0]!;
    expect(withLabel.label).toBe('阶段一');
    expect(withLabel.color).toBe('#2563eb');

    const plainDoc = buildOverlayTree();
    plainDoc.topics.a = { ...plainDoc.topics.a!, boundary: {} };
    const plain = computeMindmapLayout(plainDoc).boundaries[0]!;

    expect(withLabel.height).toBeGreaterThan(plain.height);
    expect(withLabel.height - plain.height).toBeCloseTo(MINDMAP_BOUNDARY_LABEL_HEIGHT, 0);
    expect(withLabel.y).toBeCloseTo(plain.y - MINDMAP_BOUNDARY_LABEL_HEIGHT, 0);
  });

  it('折叠后边界只包住主题自身（后代不可见）', () => {
    const doc = buildOverlayTree();
    doc.topics.a = { ...doc.topics.a!, boundary: {}, collapsed: true };
    const layout = computeMindmapLayout(doc);

    expect(layout.nodes.some((node) => node.id === 'a1')).toBe(false);
    const frame = layout.boundaries[0]!;
    const a = nodeOfLayout(layout, 'a');
    expect(frame.width).toBeCloseTo(a.width + MINDMAP_BOUNDARY_PADDING * 2, 1);
    expect(frame.height).toBeCloseTo(a.height + MINDMAP_BOUNDARY_PADDING * 2, 1);
  });

  it('嵌套边界：祖先框包住子边界框', () => {
    const doc = buildOverlayTree();
    doc.topics[doc.rootTopicId] = { ...doc.topics[doc.rootTopicId]!, boundary: {} };
    doc.topics.a = { ...doc.topics.a!, boundary: {} };
    const layout = computeMindmapLayout(doc);

    expect(layout.boundaries).toHaveLength(2);
    // 面积大的（根）排在前，便于画布从外到内绘制
    const [outer, inner] = layout.boundaries;
    expect(outer!.id).toBe(doc.rootTopicId);
    expect(inner!.id).toBe('a');
    expect(outer!.x).toBeLessThanOrEqual(inner!.x);
    expect(outer!.y).toBeLessThanOrEqual(inner!.y);
    expect(outer!.x + outer!.width).toBeGreaterThanOrEqual(inner!.x + inner!.width);
    expect(outer!.y + outer!.height).toBeGreaterThanOrEqual(inner!.y + inner!.height);
  });

  it('边界框并入 bounds，保证适配内容不裁掉框', () => {
    const plain = computeMindmapLayout(buildOverlayTree()).bounds;
    const doc = buildOverlayTree();
    doc.topics[doc.rootTopicId] = { ...doc.topics[doc.rootTopicId]!, boundary: {} };
    const withBoundary = computeMindmapLayout(doc).bounds;

    expect(withBoundary.minX).toBeLessThan(plain.minX);
    expect(withBoundary.minY).toBeLessThan(plain.minY);
    expect(withBoundary.maxX).toBeGreaterThan(plain.maxX);
    expect(withBoundary.maxY).toBeGreaterThan(plain.maxY);
    expect(withBoundary.width).toBeGreaterThan(plain.width);
  });
});

describe('UX-2 概要（summary）', () => {
  it('概要框覆盖全部可见子节点范围并透传文本', () => {
    const doc = buildOverlayTree();
    doc.topics.a = { ...doc.topics.a!, summary: '  这是概要  ' };
    const layout = computeMindmapLayout(doc);

    expect(layout.summaries).toHaveLength(1);
    const summary = layout.summaries[0]!;
    expect(summary.id).toBe('a');
    expect(summary.text).toBe('这是概要');
    expect(summary.side).toBe('right');

    const a1 = edgesOf(nodeOfLayout(layout, 'a1'));
    const a2 = edgesOf(nodeOfLayout(layout, 'a2'));
    const top = Math.min(a1.top, a2.top);
    const bottom = Math.max(a1.bottom, a2.bottom);
    expect(summary.y).toBeCloseTo(top, 1);
    expect(summary.height).toBeCloseTo(bottom - top, 1);
    // 括线在子节点范围外侧（右侧），间距 gap
    expect(summary.x).toBeCloseTo(Math.max(a1.right, a2.right) + MINDMAP_SUMMARY_GAP, 1);
  });

  it('无可见子节点（叶子 / 折叠）时忽略概要', () => {
    const leafDoc = buildOverlayTree();
    leafDoc.topics.b1 = { ...leafDoc.topics.b1!, summary: '叶子不该有概要' };
    expect(computeMindmapLayout(leafDoc).summaries).toEqual([]);

    const collapsedDoc = buildOverlayTree();
    collapsedDoc.topics.a = { ...collapsedDoc.topics.a!, summary: '折叠后无可概括', collapsed: true };
    expect(computeMindmapLayout(collapsedDoc).summaries).toEqual([]);
  });

  it('左侧分支的概要在子节点左侧', () => {
    const doc = buildOverlayTree();
    doc.topics.b = { ...doc.topics.b!, summary: '左侧概要' };
    const layout = computeMindmapLayout(doc);
    expect(layout.summaries[0]?.side).toBe('left');
    const b1 = edgesOf(nodeOfLayout(layout, 'b1'));
    expect(layout.summaries[0]!.x + layout.summaries[0]!.width).toBeLessThan(b1.left);
  });

  it('org 布局的概要放在子节点下方', () => {
    const doc = buildOverlayTree();
    doc.layoutMode = 'org';
    doc.topics.a = { ...doc.topics.a!, summary: '下方概要' };
    const layout = computeMindmapLayout(doc);
    const summary = layout.summaries[0]!;
    expect(summary.side).toBe('bottom');
    const a1 = edgesOf(nodeOfLayout(layout, 'a1'));
    const a2 = edgesOf(nodeOfLayout(layout, 'a2'));
    expect(summary.y).toBeGreaterThan(Math.max(a1.bottom, a2.bottom));
  });

  it('概要框并入 bounds', () => {
    const plain = computeMindmapLayout(buildOverlayTree()).bounds;
    const doc = buildOverlayTree();
    doc.topics.a = { ...doc.topics.a!, summary: '一段比较长的概要文本' };
    const withSummary = computeMindmapLayout(doc).bounds;
    // 概要在右侧，扩大右边界
    expect(withSummary.maxX).toBeGreaterThan(plain.maxX);
  });
});
