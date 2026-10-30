import { describe, expect, it } from 'vitest';
import {
  PNG_EXPORT_LIMITS,
  planPngExport,
  renderMindmapSvg,
} from '@/services/mindmapSvgService';
import { createEmptyMindMapDocument } from '@/services/mindmapService';
import type { MindMapDocument } from '@/types/mindmap';

function treeDoc(): MindMapDocument {
  const doc = createEmptyMindMapDocument('中心 <&> 主题');
  const root = doc.rootTopicId;
  doc.topics.a = { id: 'a', parentId: root, childIds: ['a1'], text: '分支 A' };
  doc.topics.a1 = { id: 'a1', parentId: 'a', childIds: [], text: 'A1 🚀' };
  doc.topics.b = { id: 'b', parentId: root, childIds: [], text: '分支 B' };
  const rootTopic = doc.topics[root];
  if (rootTopic) rootTopic.childIds = ['a', 'b'];
  return doc;
}

describe('renderMindmapSvg', () => {
  it('渲染全部节点与连线', () => {
    const { svg, layout } = renderMindmapSvg(treeDoc());
    expect(layout.nodes).toHaveLength(4);
    expect(layout.edges).toHaveLength(3);
    // 每个节点一个 rect；连线为 path
    expect((svg.match(/<rect /g) ?? []).length).toBe(4);
    expect((svg.match(/<path /g) ?? []).length).toBe(3);
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
  });

  it('尺寸包含内边距且与布局一致', () => {
    const padding = 24;
    const { svg, width, height, layout } = renderMindmapSvg(treeDoc(), { padding });
    expect(width).toBe(Math.ceil(layout.bounds.width + padding * 2));
    expect(height).toBe(Math.ceil(layout.bounds.height + padding * 2));
    expect(svg).toContain(`width="${width}" height="${height}"`);
  });

  it('透明背景不绘制底色矩形', () => {
    const { svg } = renderMindmapSvg(treeDoc(), { background: 'transparent' });
    expect(svg).not.toContain('<rect x="0" y="0"');
    expect((svg.match(/<rect /g) ?? []).length).toBe(4);
  });

  it('纯色背景绘制整幅底色', () => {
    const { svg, width, height } = renderMindmapSvg(treeDoc(), { background: '#f5f5f5' });
    expect(svg).toContain(`<rect x="0" y="0" width="${width}" height="${height}" fill="#f5f5f5" />`);
  });

  it('XML 特殊字符被转义，Unicode 保留', () => {
    const { svg } = renderMindmapSvg(treeDoc());
    expect(svg).toContain('&lt;&amp;&gt;');
    expect(svg).toContain('🚀');
  });

  it('根节点加粗、多行文本使用 tspan', () => {
    const doc = createMindmapWithLongText();
    const { svg } = renderMindmapSvg(doc);
    expect(svg).toContain('font-weight="700"');
    expect((svg.match(/<tspan /g) ?? []).length).toBeGreaterThan(1);
  });
});

describe('planPngExport', () => {
  it('正常尺寸按倍率放大', () => {
    const plan = planPngExport(400, 300, 2);
    expect(plan).toEqual({ width: 800, height: 600, scale: 2 });
  });

  it('默认倍率为 2', () => {
    expect(PNG_EXPORT_LIMITS.defaultScale).toBe(2);
    expect(planPngExport(10, 10).scale).toBe(2);
  });

  it('单边超限抛错', () => {
    expect(() => planPngExport(PNG_EXPORT_LIMITS.maxDimension, 100, 2)).toThrow(/单边上限/);
  });

  it('总像素超限抛错', () => {
    const side = 9000;
    expect(() => planPngExport(side, side, 1)).toThrow(/像素总量/);
  });
});

function createMindmapWithLongText(): MindMapDocument {
  const doc = createEmptyMindMapDocument('中心');
  const root = doc.rootTopicId;
  doc.topics.long = {
    id: 'long',
    parentId: root,
    childIds: [],
    text: '这是一个非常长的中文主题，用来验证自动换行与多行 tspan 渲染是否正确',
  };
  const rootTopic = doc.topics[root];
  if (rootTopic) rootTopic.childIds = ['long'];
  return doc;
}