import { describe, expect, it, vi } from 'vitest';
import {
  PNG_EXPORT_LIMITS,
  exportMindmapPng,
  planPngExport,
  renderMindmapPngCanvas,
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

/* ------------------------- canvas 渲染（PNG/PDF 共用） ------------------------- */

interface CanvasStub {
  canvas: { width: number; height: number };
  drawImage: ReturnType<typeof vi.fn>;
  restore: () => void;
}

/**
 * 用假 canvas + 假 Image 替代真实浏览器渲染：
 * happy-dom 没有 2D 画布，无法直接跑 SVG→canvas 流程。
 */
function stubCanvasEnvironment(withToBlob = false): CanvasStub {
  const drawImage = vi.fn();
  const canvas: {
    width: number;
    height: number;
    getContext: () => unknown;
    toBlob?: (callback: (blob: Blob | null) => void, type: string) => void;
  } = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage }),
  };
  if (withToBlob) {
    canvas.toBlob = (callback: (blob: Blob | null) => void) => {
      callback(new Blob(['png-bytes'], { type: 'image/png' }));
    };
  }
  const nativeCreate = document.createElement.bind(document);
  const createSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => (
    tagName === 'canvas' ? canvas : nativeCreate(tagName)
  )) as typeof document.createElement);

  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  }
  vi.stubGlobal('Image', FakeImage);

  return {
    canvas,
    drawImage,
    restore: () => {
      createSpy.mockRestore();
      vi.unstubAllGlobals();
    },
  };
}

describe('renderMindmapPngCanvas', () => {
  it('尺寸超限时在创建画布前就抛错', async () => {
    await expect(renderMindmapPngCanvas(treeDoc(), { scale: 100000 })).rejects.toThrow(/单边上限/);
  });

  it('环境没有画布能力时抛明确错误', async () => {
    // happy-dom 的 canvas 没有 getContext
    await expect(renderMindmapPngCanvas(treeDoc())).rejects.toThrow(/不支持画布渲染/);
  });

  it('按 planPngExport 规划尺寸创建画布并绘制 SVG', async () => {
    const stub = stubCanvasEnvironment();
    try {
      const doc = treeDoc();
      const rendered = renderMindmapSvg(doc);
      const plan = planPngExport(rendered.width, rendered.height);

      const result = await renderMindmapPngCanvas(doc);

      expect(result.canvas).toBe(stub.canvas);
      expect(result.width).toBe(plan.width);
      expect(result.height).toBe(plan.height);
      expect(stub.canvas.width).toBe(plan.width);
      expect(stub.canvas.height).toBe(plan.height);
      expect(stub.drawImage).toHaveBeenCalledTimes(1);
    } finally {
      stub.restore();
    }
  });
});

describe('exportMindmapPng（复用 canvas 渲染）', () => {
  it('无画布环境抛出可读错误而非 TypeError', async () => {
    await expect(exportMindmapPng(treeDoc())).rejects.toThrow(/不支持画布渲染/);
  });

  it('尺寸超限沿用 planPngExport 错误', async () => {
    await expect(exportMindmapPng(treeDoc(), { scale: 100000 })).rejects.toThrow(/单边上限/);
  });

  it('显式倍率只应用一次（不再被二次相乘）', async () => {
    const stub = stubCanvasEnvironment(true);
    try {
      const doc = treeDoc();
      const rendered = renderMindmapSvg(doc);
      const height = Math.ceil((rendered.height - 0) * 2);

      const result = await exportMindmapPng(doc, { scale: 2 });

      expect(result.width).toBe(rendered.width * 2);
      expect(result.height).toBe(height);
    } finally {
      stub.restore();
    }
  });

  it('成功时返回 blob 与画布尺寸（对外签名不变）', async () => {
    const stub = stubCanvasEnvironment(true);
    try {
      const doc = treeDoc();
      const rendered = renderMindmapSvg(doc);
      const plan = planPngExport(rendered.width, rendered.height);

      const result = await exportMindmapPng(doc);

      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.width).toBe(plan.width);
      expect(result.height).toBe(plan.height);
    } finally {
      stub.restore();
    }
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