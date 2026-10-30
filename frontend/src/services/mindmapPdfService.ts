/**
 * 思维导图 PDF 导出与打印（阶段 4D）
 *
 * 职责：
 * 1. {@link exportMindmapPdf}: 复用 SVG→canvas 渲染管线，把完整导图写成单页 PDF 1.4
 *    （页面尺寸 = 图片像素，1px = 1pt；图片以 /DeviceRGB + /FlateDecode 图像 XObject 嵌入）；
 * 2. {@link buildPdfWithImage} / {@link buildPdfWithCompressedImage}: 纯字节组装逻辑，
 *    与 canvas / CompressionStream 解耦，便于单测直接断言 PDF 结构；
 * 3. {@link printMindmap}: 把 SVG 放进隐藏 iframe 并调用 contentWindow.print()，
 *    由浏览器原生打印对话框处理纸张与边距。
 *
 * 设计约束：本模块不修改 store、不写盘，失败时抛出明确错误（绝不产出损坏文件），
 * 落盘与 UI 提示由调用方负责。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */

import {
  renderMindmapPngCanvas,
  renderMindmapSvg,
  type PngBlobOptions,
  type SvgRenderOptions,
} from '@/services/mindmapSvgService';
import type { MindMapDocument } from '@/types/mindmap';

/** PDF 版本号（写入文件头）。 */
const PDF_VERSION = '1.4';

/** PDF 导出默认背景：页面没有「透明」概念，默认白底避免透明像素变黑。 */
const DEFAULT_PDF_BACKGROUND = '#ffffff';

/** 等待打印 iframe 载入的默认超时（ms）。 */
const DEFAULT_PRINT_LOAD_TIMEOUT = 3000;

/** 打印 iframe 兜底清理延迟（ms）：部分浏览器不触发 afterprint。 */
const PRINT_CLEANUP_DELAY = 60_000;

export interface PdfExportOptions extends PngBlobOptions {
  /** 'transparent' 或 CSS 颜色；默认 '#ffffff'。 */
  background?: 'transparent' | string;
  /** 尺寸倍率（与 PNG 导出共用 planPngExport 规划，默认 1）。 */
  scale?: number;
}

export interface PdfExportResult {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface MindmapPrintOptions extends SvgRenderOptions {
  /** 等待 iframe 内容载入的超时（ms），默认 3000；超时后仍继续打印。 */
  loadTimeoutMs?: number;
}

export interface MindmapPrintResult {
  width: number;
  height: number;
}

/* ----------------------------- 纯字节工具 ----------------------------- */

/** ASCII 编码：逐字节写入，保证偏移量等于字符数（PDF 结构与 xref 偏移因此可信）。 */
function encodeAscii(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    bytes[i] = text.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/** xref 偏移量固定 10 位、右补零。 */
function padOffset(offset: number): string {
  return String(offset).padStart(10, '0');
}

/**
 * 把 RGBA 像素去掉 alpha 通道，得到 DeviceRGB 需要的 RGB 字节。
 *
 * 半透明/全透明像素按「白色背景」合成（PDF 页面默认白底），避免透明区域变黑。
 *
 * @throws Error 当长度不是 4 的倍数时。
 */
export function extractRgbBytes(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  if (rgba.length % 4 !== 0) {
    throw new Error('像素数据长度非法：期望 RGBA 四通道字节');
  }
  const pixelCount = rgba.length / 4;
  const rgb = new Uint8Array(pixelCount * 3);
  for (let i = 0; i < pixelCount; i += 1) {
    const r = rgba[i * 4] ?? 0;
    const g = rgba[i * 4 + 1] ?? 0;
    const b = rgba[i * 4 + 2] ?? 0;
    const alpha = rgba[i * 4 + 3] ?? 255;
    if (alpha === 255) {
      rgb[i * 3] = r;
      rgb[i * 3 + 1] = g;
      rgb[i * 3 + 2] = b;
    } else {
      // 按白底合成：out = c * a + 255 * (1 - a)
      rgb[i * 3] = Math.round((r * alpha + 255 * (255 - alpha)) / 255);
      rgb[i * 3 + 1] = Math.round((g * alpha + 255 * (255 - alpha)) / 255);
      rgb[i * 3 + 2] = Math.round((b * alpha + 255 * (255 - alpha)) / 255);
    }
  }
  return rgb;
}

/**
 * 用 CompressionStream('deflate') 压缩字节。
 *
 * 浏览器/Node 的 'deflate' 输出带 zlib 头（0x78 ...），与 PDF 的 /FlateDecode 兼容；
 * 若误用 'deflate-raw' 则 PDF 阅读器无法解码。
 *
 * 注意：必须「先开始读取可读侧，再写入数据」。压缩输出长度未知，
 * 若先 await writer.write()，可读侧积压超过高水位会反压写端，导致永久死锁。
 *
 * @throws Error 当环境不提供 CompressionStream 时。
 */
export async function deflateBytes(data: Uint8Array): Promise<Uint8Array> {
  const CompressionStreamCtor = (
    globalThis as typeof globalThis & { CompressionStream?: typeof CompressionStream }
  ).CompressionStream;
  if (typeof CompressionStreamCtor !== 'function') {
    throw new Error('当前环境不支持 CompressionStream，无法压缩 PDF 图像数据');
  }
  const stream = new CompressionStreamCtor('deflate');
  const writer = stream.writable.getWriter();
  const reading = readAllChunks(stream.readable);
  try {
    // TS 5.7+ 的泛型类型化数组与 stream writer 的 BufferSource 约束不兼容，此处显式收窄
    await writer.write(data as unknown as BufferSource);
    await writer.close();
  } catch (error) {
    // 写入失败：吞掉读取端的拒绝并中止流，避免悬挂的 Promise / 未处理拒绝
    reading.catch(() => undefined);
    void writer.abort().catch(() => undefined);
    throw error instanceof Error ? error : new Error(String(error));
  }
  return reading;
}

/** 读完整个可读流并合并为连续字节（不依赖 Response，兼容各运行时）。 */
async function readAllChunks(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
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

/* ----------------------------- PDF 组装 ----------------------------- */

export interface PdfCompressedImageInput {
  width: number;
  height: number;
  /** 已 zlib(deflate) 压缩的 RGB 像素数据。 */
  compressed: Uint8Array;
}

/**
 * 由「已压缩的 RGB 像素 + 尺寸」组装单页 PDF 1.4 字节。
 *
 * 结构（对象 1..5）：Catalog / Pages / Page / Image XObject / 内容流，
 * 结尾带 xref 表、trailer、startxref 与 %%EOF。纯同步函数，不触碰 canvas，
 * 单测可用小尺寸数据直接断言结构。
 *
 * @throws Error 当尺寸非法、像素数据为空或上下文环境时。
 */
export function buildPdfWithCompressedImage(input: PdfCompressedImageInput): Uint8Array {
  const width = Math.round(input.width);
  const height = Math.round(input.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`PDF 页面尺寸非法：${input.width}×${input.height}`);
  }
  const compressed = input.compressed;
  if (!(compressed instanceof Uint8Array) || compressed.byteLength === 0) {
    throw new Error('PDF 图像数据为空，无法生成文件');
  }

  // 内容流：把图像按页面尺寸铺满（1px = 1pt，cm 矩阵直接取宽高）
  const contentText = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
  const contentBytes = encodeAscii(contentText);

  const chunks: Uint8Array[] = [];
  let cursor = 0;
  /** 每个对象在文件中的起始字节偏移（xref 用）。 */
  const offsets: number[] = [];

  const pushText = (text: string): void => {
    const bytes = encodeAscii(text);
    chunks.push(bytes);
    cursor += bytes.length;
  };
  const pushBytes = (bytes: Uint8Array): void => {
    chunks.push(bytes);
    cursor += bytes.length;
  };

  pushText(`%PDF-${PDF_VERSION}\n`);

  // 1: Catalog
  offsets[1] = cursor;
  pushText('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2: Pages
  offsets[2] = cursor;
  pushText('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  // 3: Page（MediaBox = 图片像素，1px = 1pt）
  offsets[3] = cursor;
  pushText(
    '3 0 obj\n'
    + `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}]`
    + ' /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\n'
    + 'endobj\n',
  );

  // 4: 图像 XObject（DeviceRGB + FlateDecode）
  offsets[4] = cursor;
  pushText(
    '4 0 obj\n'
    + '<< /Type /XObject /Subtype /Image'
    + ` /Width ${width} /Height ${height}`
    + ' /ColorSpace /DeviceRGB /BitsPerComponent 8'
    + ` /Filter /FlateDecode /Length ${compressed.byteLength} >>\n`
    + 'stream\n',
  );
  pushBytes(compressed);
  pushText('\nendstream\nendobj\n');

  // 5: 内容流
  offsets[5] = cursor;
  pushText(`5 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
  pushBytes(contentBytes);
  pushText('\nendstream\nendobj\n');

  // xref：0 号为空闲项，每项严格 20 字节（"nnnnnnnnnn ggggg n \n"）
  const xrefOffset = cursor;
  pushText('xref\n0 6\n');
  pushText('0000000000 65535 f \n');
  for (let i = 1; i <= 5; i += 1) {
    pushText(`${padOffset(offsets[i] ?? 0)} 00000 n \n`);
  }

  pushText(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  // 合并分片
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    out.set(chunk, position);
    position += chunk.length;
  }
  return out;
}

export interface PdfImageInput {
  width: number;
  height: number;
  /** 未压缩的 RGB 像素字节，长度必须等于 width * height * 3。 */
  rgb: Uint8Array;
  /** 可注入的压缩实现（默认 {@link deflateBytes}），便于单测替换。 */
  deflate?: (data: Uint8Array) => Promise<Uint8Array>;
}

/**
 * 由「未压缩 RGB 像素 + 尺寸」组装 PDF：先 deflate 再交给
 * {@link buildPdfWithCompressedImage}，便于单测注入压缩实现。
 *
 * @throws Error 当像素长度与尺寸不匹配、压缩失败时。
 */
export async function buildPdfWithImage(input: PdfImageInput): Promise<Uint8Array> {
  const width = Math.round(input.width);
  const height = Math.round(input.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`PDF 页面尺寸非法：${input.width}×${input.height}`);
  }
  const expected = width * height * 3;
  if (input.rgb.length !== expected) {
    throw new Error(
      `PDF 像素数据长度 ${input.rgb.length} 与尺寸 ${width}×${height} 不匹配（期望 ${expected} 字节）`,
    );
  }
  const deflate = input.deflate ?? deflateBytes;
  const compressed = await deflate(input.rgb);
  if (compressed.byteLength === 0) {
    throw new Error('PDF 图像压缩结果为空，已中止导出');
  }
  return buildPdfWithCompressedImage({ width, height, compressed });
}

/* ----------------------------- 导出入口 ----------------------------- */

/**
 * 导出单页 PDF：页面尺寸 = 渲染像素（1px = 1pt），图像以 FlateDecode 嵌入。
 *
 * - 尺寸上限复用 PNG 的 {@link planPngExport}（单边 16384px / 总像素 64M）；
 * - 环境不支持画布时抛明确错误，绝不返回半成品；
 * - 失败一律抛出 Error，由 importExportService.exportMindmapPdfFile 收敛成分类错误返回 UI。
 *
 * @throws Error 尺寸超限、环境不支持画布或压缩失败。
 */
export async function exportMindmapPdf(
  document: MindMapDocument,
  options: PdfExportOptions = {},
): Promise<PdfExportResult> {
  const scale = options.scale ?? 1;
  const background = options.background ?? DEFAULT_PDF_BACKGROUND;

  let rendered: Awaited<ReturnType<typeof renderMindmapPngCanvas>>;
  try {
    rendered = await renderMindmapPngCanvas(document, {
      background,
      ...(options.padding !== undefined ? { padding: options.padding } : {}),
      scale,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 尺寸超限保持 planPngExport 的原文案（便于 UI 提示降低倍率）；其余归为环境能力不足
    if (message.includes('不支持')) {
      throw new Error(`当前环境不支持画布渲染，无法导出 PDF（${message}）`);
    }
    throw new Error(message);
  }

  const { canvas, width, height } = rendered;
  const context = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (!context || typeof context.getImageData !== 'function') {
    throw new Error('当前环境不支持读取画布像素，无法导出 PDF');
  }

  const imageData = context.getImageData(0, 0, width, height);
  const rgb = extractRgbBytes(imageData.data);
  const bytes = await buildPdfWithImage({ width, height, rgb });
  return { bytes, width, height };
}

/* ------------------------------- 打印 ------------------------------- */

/**
 * 构造打印用 HTML：内联 SVG + @page 尺寸（无页边距，页面与导图同尺寸）。
 *
 * 单独导出以便单测断言结构，不依赖 iframe。
 */
export function buildPrintHtml(svg: string, width: number, height: number): string {
  // 打印文档内联 SVG，去掉 XML 声明避免出现在 HTML 里
  const markup = svg.replace(/^<\?xml[^>]*\?>\s*/i, '').trim();
  return [
    '<!DOCTYPE html>',
    '<html><head><meta charset="utf-8" /><title>思维导图打印</title>',
    '<style>',
    `@page { size: ${width}px ${height}px; margin: 0; }`,
    'html, body { margin: 0; padding: 0; background: #ffffff; }',
    `svg { display: block; width: ${width}px; height: ${height}px; }`,
    '</style></head><body>',
    markup,
    '</body></html>',
  ].join('');
}

/**
 * 打印思维导图：把 SVG 放进隐藏 iframe，等载入后调用 contentWindow.print()。
 *
 * 使用 iframe 而非当前窗口，保证只打印导图本体、不影响编辑器页面。
 *
 * @throws Error 当环境无 DOM / iframe 不支持打印时（供 UI 提示「该环境不支持打印」）。
 */
export async function printMindmap(
  document: MindMapDocument,
  options: MindmapPrintOptions = {},
): Promise<MindmapPrintResult> {
  const rendered = renderMindmapSvg(document, {
    background: options.background ?? 'transparent',
    ...(options.padding !== undefined ? { padding: options.padding } : {}),
    ...(options.scale !== undefined ? { scale: options.scale } : {}),
  });
  const html = buildPrintHtml(rendered.svg, rendered.width, rendered.height);

  const win = typeof window !== 'undefined' ? window : undefined;
  if (!win || typeof win.document?.createElement !== 'function' || !win.document.body) {
    throw new Error('当前环境不支持打印，无法打印思维导图');
  }

  const frame = win.document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('data-mindmap-print-frame', '');
  // 用 0 尺寸 + 透明而非 display:none：部分浏览器对不参与排版的 iframe 不渲染内容
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  frame.srcdoc = html;
  win.document.body.appendChild(frame);

  const frameWindow = frame.contentWindow;
  if (!frameWindow || typeof frameWindow.print !== 'function') {
    removePrintFrame(frame);
    throw new Error('当前环境不支持打印（iframe 打印不可用），无法打印思维导图');
  }

  await waitForPrintFrameReady(frame, options.loadTimeoutMs ?? DEFAULT_PRINT_LOAD_TIMEOUT);

  const cleanup = (): void => removePrintFrame(frame);
  try {
    frameWindow.onafterprint = cleanup;
    frameWindow.print();
  } finally {
    // 兜底：用户取消或浏览器不触发 afterprint 时仍清理 iframe（延迟清理避免打印前被移除）
    const timer = win.setTimeout(cleanup, PRINT_CLEANUP_DELAY) as unknown as { unref?: () => void };
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  return { width: rendered.width, height: rendered.height };
}

/** 等待 iframe 载入；已有完整文档或超时都会 resolve（打印照常进行）。 */
function waitForPrintFrameReady(frame: HTMLIFrameElement, timeoutMs: number): Promise<void> {
  if (frame.contentDocument?.readyState === 'complete') return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      frame.removeEventListener('load', finish);
      resolve();
    };
    frame.addEventListener('load', finish);
    setTimeout(finish, Math.max(500, timeoutMs));
  });
}

/** 从 DOM 中移除打印 iframe（幂等）。 */
function removePrintFrame(frame: HTMLIFrameElement): void {
  if (frame.parentNode) frame.parentNode.removeChild(frame);
}
