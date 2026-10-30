import { describe, expect, it, vi } from 'vitest';
import { inflateSync } from 'node:zlib';
import {
  buildPdfWithCompressedImage,
  buildPdfWithImage,
  buildPrintHtml,
  deflateBytes,
  exportMindmapPdf,
  extractRgbBytes,
  printMindmap,
} from '@/services/mindmapPdfService';
import { renderMindmapSvg } from '@/services/mindmapSvgService';
import { createEmptyMindMapDocument } from '@/services/mindmapService';
import type { MindMapDocument } from '@/types/mindmap';

/** 字节 → latin1 字符串（PDF 结构均为 ASCII，二进制流不影响关键标记查找）。 */
function decodeLatin1(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

function sampleDoc(): MindMapDocument {
  const doc = createEmptyMindMapDocument('中心主题');
  const root = doc.rootTopicId;
  doc.topics.a = { id: 'a', parentId: root, childIds: [], text: '分支 A' };
  const rootTopic = doc.topics[root];
  if (rootTopic) rootTopic.childIds = ['a'];
  return doc;
}

/** 2×2 的四色 RGB 像素（12 字节）。 */
function tinyRgb(): Uint8Array {
  return new Uint8Array([
    255, 0, 0,
    0, 255, 0,
    0, 0, 255,
    255, 255, 255,
  ]);
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    out.set(chunk, position);
    position += chunk.length;
  }
  return out;
}

/** 先开始读取再写入，避免可读侧背压导致写端死锁（大输出时必须这样测）。 */
async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  const reading = readAll(stream.readable);
  await writer.write(data);
  await writer.close();
  return reading;
}

async function inflateData(data: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream('deflate');
  const writer = stream.writable.getWriter();
  const reading = readAll(stream.readable);
  await writer.write(data);
  await writer.close();
  return reading;
}

/** 从 PDF 字节里取出图像 XObject 的压缩流（按 /Length 精确截取）。 */
function extractImageStream(bytes: Uint8Array): Uint8Array {
  const text = decodeLatin1(bytes);
  const lengthMatch = /\/Filter \/FlateDecode \/Length (\d+)/.exec(text);
  if (!lengthMatch) throw new Error('PDF 中未找到图像 XObject 字典');
  const length = Number(lengthMatch[1]);
  const imageDict = text.indexOf('/Subtype /Image');
  const marker = 'stream\n';
  const streamStart = text.indexOf(marker, imageDict);
  if (streamStart < 0) throw new Error('PDF 中未找到图像流起始标记');
  return bytes.subarray(streamStart + marker.length, streamStart + marker.length + length);
}

describe('buildPdfWithCompressedImage', () => {
  it('产出结构完整的单页 PDF 1.4', async () => {
    const rgb = tinyRgb();
    const compressed = await deflateRaw(rgb);
    const bytes = buildPdfWithCompressedImage({ width: 2, height: 2, compressed });
    const text = decodeLatin1(bytes);

    // 文件头 / 文件尾
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.endsWith('%%EOF\n')).toBe(true);

    // 页面与资源（1px = 1pt，MediaBox 直接取像素尺寸）
    expect(text).toContain('/Type /Page ');
    expect(text).toMatch(/\/MediaBox \[0 0 2 2\]/);
    expect(text).toContain('/XObject');
    expect(text).toContain('/Im0 Do');
    expect(text).toContain('q 2 0 0 2 0 0 cm /Im0 Do Q');

    // 图像对象：DeviceRGB + FlateDecode + 8bpc
    expect(text).toContain('/Subtype /Image');
    expect(text).toContain('/ColorSpace /DeviceRGB');
    expect(text).toContain('/BitsPerComponent 8');
    expect(text).toContain('/Filter /FlateDecode');

    // 交叉引用表 / trailer
    expect(text).toContain('xref\n0 6\n');
    expect(text).toContain('trailer\n<< /Size 6 /Root 1 0 R >>');
    expect(text).toContain('startxref\n');

    // 五个对象的 xref 偏移必须真的指向 "N 0 obj"
    const xrefOffset = Number(/startxref\n(\d+)\n/.exec(text)?.[1]);
    expect(Number.isFinite(xrefOffset)).toBe(true);
    expect(text.startsWith('xref', xrefOffset)).toBe(true);
    const lines = text.slice(xrefOffset).split('\n');
    expect(lines[0]).toBe('xref');
    expect(lines[1]).toBe('0 6');
    // lines[2] 为 0 号空闲项，之后依次是对象 1..5
    expect(lines[2]).toBe('0000000000 65535 f ');
    for (let i = 1; i <= 5; i += 1) {
      const entry = lines[i + 2] ?? '';
      expect(entry).toMatch(/^\d{10} 00000 n $/);
      const offset = Number(entry.slice(0, 10));
      expect(text.startsWith(`${i} 0 obj`, offset)).toBe(true);
    }
  });

  it('图像流可被 FlateDecode 解回原始 RGB 字节', async () => {
    const rgb = tinyRgb();
    const bytes = await buildPdfWithImage({ width: 2, height: 2, rgb });
    const stream = extractImageStream(bytes);
    // 用 Node zlib（独立实现）交叉验证：zlib 包装 + /FlateDecode 兼容
    expect(Array.from(inflateSync(stream))).toEqual(Array.from(rgb));
    const restored = await inflateData(stream);
    expect(Array.from(restored)).toEqual(Array.from(rgb));
  });

  it('缺少像素数据或尺寸非法时明确报错', async () => {
    expect(() => buildPdfWithCompressedImage({
      width: 2,
      height: 2,
      compressed: new Uint8Array(0),
    })).toThrow(/图像数据为空/);

    expect(() => buildPdfWithCompressedImage({
      width: 0,
      height: 2,
      compressed: new Uint8Array([1, 2, 3]),
    })).toThrow(/尺寸非法/);
  });
});

describe('buildPdfWithImage', () => {
  it('可注入压缩实现，并校验像素长度与尺寸匹配', async () => {
    const deflate = vi.fn(async (data: Uint8Array) => data);
    const rgb = tinyRgb();
    const bytes = await buildPdfWithImage({ width: 2, height: 2, rgb, deflate });
    expect(deflate).toHaveBeenCalledTimes(1);
    expect(decodeLatin1(bytes).startsWith('%PDF-1.4')).toBe(true);
    expect(decodeLatin1(bytes)).toContain('/Length 12');

    await expect(buildPdfWithImage({ width: 2, height: 2, rgb: new Uint8Array(11) }))
      .rejects.toThrow(/不匹配/);
  });
});

describe('extractRgbBytes', () => {
  it('去掉 alpha 通道，并把透明像素按白底合成', () => {
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255,
      10, 20, 30, 0,
    ]);
    expect(Array.from(extractRgbBytes(rgba))).toEqual([255, 0, 0, 255, 255, 255]);
  });

  it('长度不是 4 的倍数时报错', () => {
    expect(() => extractRgbBytes(new Uint8Array(6))).toThrow(/长度非法/);
  });
});

describe('deflateBytes', () => {
  it('输出 zlib 头（0x78）并可被 deflate 解码还原', async () => {
    const data = new TextEncoder().encode('mindmap pdf 导出');
    const compressed = await deflateBytes(data);
    // /FlateDecode 需要 zlib 包装，而非 raw deflate
    expect(compressed[0]).toBe(0x78);
    expect(Array.from(await inflateData(compressed))).toEqual(Array.from(data));
  });
});

describe('exportMindmapPdf', () => {
  it('尺寸超限时沿用 planPngExport 的错误', async () => {
    await expect(exportMindmapPdf(sampleDoc(), { scale: 100000 })).rejects.toThrow(/单边上限/);
  });

  it('环境不支持画布时抛明确错误（不产出坏文件）', async () => {
    // happy-dom 的画布没有 getContext，属于“无画布能力”环境
    await expect(exportMindmapPdf(sampleDoc())).rejects.toThrow(/不支持画布渲染，无法导出 PDF/);
  });

  it('画布可用时把像素写成单页 PDF（含真实压缩流）', async () => {
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage,
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          const data = new Uint8ClampedArray(w * h * 4);
          for (let i = 0; i < w * h; i += 1) {
            data[i * 4] = 255;      // R
            data[i * 4 + 1] = 0;    // G
            data[i * 4 + 2] = 0;    // B
            data[i * 4 + 3] = 255;  // A
          }
          return { data, width: w, height: h };
        },
      }),
    };
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

    try {
      const doc = sampleDoc();
      const natural = renderMindmapSvg(doc);
      const result = await exportMindmapPdf(doc);

      expect(result.width).toBe(natural.width);
      expect(result.height).toBe(natural.height);
      expect(drawImage).toHaveBeenCalledTimes(1);

      const text = decodeLatin1(result.bytes);
      expect(text.startsWith('%PDF-1.4')).toBe(true);
      expect(text).toContain(`/MediaBox [0 0 ${result.width} ${result.height}]`);

      // 压缩流解回后应是纯红色像素，长度 = 宽 × 高 × 3
      const restored = await inflateData(extractImageStream(result.bytes));
      expect(restored.length).toBe(result.width * result.height * 3);
      expect(Array.from(restored.subarray(0, 3))).toEqual([255, 0, 0]);
    } finally {
      createSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

describe('buildPrintHtml', () => {
  it('内联 SVG 与 @page 尺寸，且去掉 XML 声明', () => {
    const { svg, width, height } = renderMindmapSvg(sampleDoc());
    const html = buildPrintHtml(svg, width, height);

    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain(`@page { size: ${width}px ${height}px; margin: 0; }`);
    expect(html).toContain('background: #ffffff;');
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(html).toContain('中心主题');
    expect(html).not.toContain('<?xml');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });
});

describe('printMindmap', () => {
  it('环境无 iframe 打印能力时抛明确错误并清理 iframe', async () => {
    // happy-dom 的 iframe.contentWindow.print 不存在
    await expect(printMindmap(sampleDoc())).rejects.toThrow(/不支持打印/);
    expect(document.querySelector('[data-mindmap-print-frame]')).toBeNull();
  });

  it('打印成功后返回渲染尺寸并调用 print()', async () => {
    const print = vi.fn();
    const frame = document.createElement('iframe');
    Object.defineProperty(frame, 'contentWindow', {
      configurable: true,
      value: {
        print,
        onafterprint: null,
      },
    });
    const nativeCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => (
      tagName === 'iframe' ? frame : nativeCreate(tagName)
    )) as typeof document.createElement);

    try {
      const doc = sampleDoc();
      const rendered = renderMindmapSvg(doc);
      const result = await printMindmap(doc);
      expect(print).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ width: rendered.width, height: rendered.height });
      expect(frame.getAttribute('data-mindmap-print-frame')).toBe('');
      expect(frame.srcdoc).toContain('<svg');
    } finally {
      createSpy.mockRestore();
      frame.remove();
    }
  });
});
