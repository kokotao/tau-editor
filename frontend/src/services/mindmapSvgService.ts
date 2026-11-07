/**
 * 思维导图 SVG 渲染（阶段 3，PNG 导出用）
 *
 * 职责：
 * 1. 由 Canonical 文档 + 布局生成独立 SVG 文本（不依赖 DOM 与组件）；
 * 2. 支持透明或纯色背景、可配内边距与缩放倍率；
 * 3. PNG 导出前先做尺寸规划与上限校验，避免超大画布导致内存问题或被裁切。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */

import { computeMindmapLayout, measureTextWidth, type MindmapLayout } from '@/services/mindmapLayoutService';
import { escapeXml } from '@/services/mindmap/xmlUtils';
import { getMindmapLineOffsets, segmentMindmapTextLine } from '@/services/mindmap/mindmapTextStyleService';
import { getMindmapImageNodes } from '@/services/mindmapImageNodeService';
import { isRainbowTheme, rainbowBranchColor, resolveMindmapTheme } from '@/services/mindmapThemeService';
import type { MindMapDocument } from '@/types/mindmap';

export type MindmapExportColorMode = 'monochrome' | 'color';

export interface SvgRenderOptions {
  /** 'transparent' 或 CSS 颜色（#fff 等）。 */
  background?: 'transparent' | string;
  padding?: number;
  /** 字号缩放（默认 1）。 */
  scale?: number;
  /** 彩色导出使用文档主题；免费导出强制使用稳定的单色配色。 */
  colorMode?: MindmapExportColorMode;
  /** 视觉导出水印。 */
  watermark?: boolean;
  /** 自定义水印文本（仅在 watermark=true 时渲染）。 */
  watermarkText?: string;
  /** 界面选定的开放许可字体栈。 */
  fontFamily?: string;
}

export interface SvgRenderResult {
  svg: string;
  width: number;
  height: number;
  layout: MindmapLayout;
}

export const PNG_EXPORT_LIMITS = {
  /** 单边最大像素（多数浏览器画布上限 16384）。 */
  maxDimension: 16384,
  /** 最大总像素，避免超大内存占用。 */
  maxPixels: 64 * 1024 * 1024,
  /** 默认导出倍率。 */
  defaultScale: 2,
};

const NODE_FILL = '#ffffff';
const NODE_STROKE = '#c7d2e2';
const ROOT_FILL = '#eaf2ff';
const ROOT_STROKE = '#7aa7e8';
const EDGE_STROKE = '#b7c4d8';
const TEXT_COLOR = '#1f2329';
const FONT_FAMILY = "'Manrope Variable', 'Manrope', 'Noto Sans SC', 'Source Han Sans SC', sans-serif";

function safeColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const color = value.trim();
  if (/^#[\da-f]{3,8}$/i.test(color)) return color;
  if (/^(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\)$/i.test(color)) return color;
  return fallback;
}

/** 依据布局与选项生成 SVG 文本。 */
export function renderMindmapSvg(
  document: MindMapDocument,
  options: SvgRenderOptions = {},
): SvgRenderResult {
  const padding = options.padding ?? 32;
  const scale = options.scale ?? 1;
  const layout = computeMindmapLayout(document);
  const { fontSize, lineHeight } = layout.options;
  const imageNodes = getMindmapImageNodes(document);
  const colorMode = options.colorMode ?? 'monochrome';
  const fontFamily = escapeXml(options.fontFamily?.trim() || FONT_FAMILY);
  const byTopic = new Map(layout.nodes.map((node) => [node.id, node]));
  const imageBoxes = imageNodes.flatMap((image, index) => {
    const anchor = byTopic.get(image.topicId);
    if (!anchor) return [];
    const x = anchor.x - image.width / 2;
    const y = anchor.y + anchor.height / 2 + 12 + index * 4;
    return [{ image, x, y }];
  });
  const bounds = (colorMode === 'color' ? imageBoxes : []).reduce<{ minX: number; minY: number; maxX: number; maxY: number }>((result, item) => ({
    minX: Math.min(result.minX, item.x),
    minY: Math.min(result.minY, item.y),
    maxX: Math.max(result.maxX, item.x + item.image.width),
    maxY: Math.max(result.maxY, item.y + item.image.height),
  }), {
    minX: layout.bounds.minX,
    minY: layout.bounds.minY,
    maxX: layout.bounds.maxX,
    maxY: layout.bounds.maxY,
  });

  const watermark = options.watermark === true;
  const watermarkHeight = 0;
  const width = Math.max(1, Math.ceil((bounds.maxX - bounds.minX + padding * 2) * scale));
  const contentHeight = Math.max(1, Math.ceil((bounds.maxY - bounds.minY + padding * 2) * scale));
  const height = contentHeight + watermarkHeight;
  const offsetX = padding - bounds.minX;
  const offsetY = padding - bounds.minY;
  const theme = resolveMindmapTheme(document.themeId);
  const branchIndex = new Map<string, number>();
  if (colorMode === 'color' && isRainbowTheme(theme)) {
    const assignBranch = (topicId: string, index: number): void => {
      const topic = document.topics[topicId];
      if (!topic) return;
      branchIndex.set(topicId, index);
      for (const childId of topic.childIds ?? []) assignBranch(childId, index);
    };
    const root = document.topics[document.rootTopicId];
    (root?.childIds ?? []).forEach((childId, index) => assignBranch(childId, index));
  }
  const colorOf = (nodeId: string, fallback: string): string => {
    if (colorMode !== 'color') return fallback;
    const branch = branchIndex.get(nodeId);
    return branch === undefined ? fallback : (rainbowBranchColor(theme, branch) ?? fallback);
  };
  const fillOf = (nodeId: string, isRoot: boolean): string => {
    if (colorMode !== 'color') return isRoot ? ROOT_FILL : NODE_FILL;
    return safeColor(document.topics[nodeId]?.style?.fill, isRoot ? theme.rootFill : theme.nodeFill);
  };

  const background = options.background && options.background !== 'transparent'
    ? `<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(options.background)}" />`
    : '';

  const arrowDefs = '<defs><marker id="mm-line-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#4a90e2" /></marker></defs>';
  const edges = layout.edges.map((edge) => {
    const style = document.topics[edge.childId]?.style;
    const dash = style?.edgeStyle === 'dashed' ? ' stroke-dasharray="6 4"' : style?.edgeStyle === 'dotted' ? ' stroke-dasharray="1 4" stroke-linecap="round"' : '';
    const start = style?.edgeStartArrow === 'arrow' ? ' marker-start="url(#mm-line-arrow)"' : '';
    const end = style?.edgeEndArrow === 'arrow' ? ' marker-end="url(#mm-line-arrow)"' : '';
    return `<path d="${edge.path}" fill="none" stroke="${escapeXml(safeColor(colorMode === 'color' ? style?.edgeColor || colorOf(edge.childId, theme.edge) : EDGE_STROKE, EDGE_STROKE))}" stroke-width="${Number(style?.edgeWidth) || 1.6}"${dash}${start}${end} />`;
  }).join('');
  const relations = (document.relations ?? []).flatMap((relation) => {
    const source = byTopic.get(relation.sourceTopicId);
    const target = byTopic.get(relation.targetTopicId);
    if (!source || !target) return [];
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    if (dx === 0 && dy === 0) return [];
    const startX = source.x + dx * Math.min((source.width / 2 + 3) / Math.max(Math.abs(dx), 0.001), (source.height / 2 + 3) / Math.max(Math.abs(dy), 0.001));
    const startY = source.y + dy * Math.min((source.width / 2 + 3) / Math.max(Math.abs(dx), 0.001), (source.height / 2 + 3) / Math.max(Math.abs(dy), 0.001));
    const endX = target.x - dx * Math.min((target.width / 2 + 3) / Math.max(Math.abs(dx), 0.001), (target.height / 2 + 3) / Math.max(Math.abs(dy), 0.001));
    const endY = target.y - dy * Math.min((target.width / 2 + 3) / Math.max(Math.abs(dx), 0.001), (target.height / 2 + 3) / Math.max(Math.abs(dy), 0.001));
    const dash = relation.lineStyle === 'solid' ? '' : relation.lineStyle === 'dotted' ? ' stroke-dasharray="1 4" stroke-linecap="round"' : ' stroke-dasharray="6 4"';
    const start = relation.startArrow === 'arrow' ? ' marker-start="url(#mm-line-arrow)"' : '';
    const end = relation.endArrow === 'none' ? '' : ' marker-end="url(#mm-line-arrow)"';
    const path = `M ${round(startX)} ${round(startY)} L ${round(endX)} ${round(endY)}`;
    return [`<path d="${path}" fill="none" stroke="${escapeXml(theme.accent)}" stroke-width="1.5"${dash}${start}${end} />`];
  }).join('');

  const nodes = layout.nodes.map((node) => {
    const isRoot = node.side === 'root';
    const fill = safeColor(fillOf(node.id, isRoot), isRoot ? ROOT_FILL : NODE_FILL);
    const defaultStroke = colorMode === 'color'
      ? colorOf(node.id, isRoot ? theme.rootStroke : theme.nodeStroke)
      : (isRoot ? ROOT_STROKE : NODE_STROKE);
    const stroke = safeColor(
      colorMode === 'color' ? document.topics[node.id]?.style?.borderColor || defaultStroke : defaultStroke,
      isRoot ? ROOT_STROKE : NODE_STROKE,
    );
    const text = colorMode === 'color'
      ? safeColor(document.topics[node.id]?.style?.color, safeColor(theme.text, TEXT_COLOR))
      : TEXT_COLOR;
    const strokeWidth = Number(document.topics[node.id]?.style?.borderWidth) || (isRoot ? 1.8 : 1.4);
    const nodeShape = document.topics[node.id]?.style?.shape;
    const nodeRadius = nodeShape === 'rect' ? 2 : nodeShape === 'pill' ? Math.min(node.width, node.height) / 2 : 9;
    // 层级字号：与画布共用 layout 产出的 node.fontSize，导出与所见一致
    const nodeFontSize = node.fontSize || fontSize;
    const nodeLineHeight = node.lines.length > 0
      ? Math.round((lineHeight / fontSize) * nodeFontSize)
      : lineHeight;
    const topic = document.topics[node.id];
    const lineOffsets = getMindmapLineOffsets(topic?.text ?? '', node.lines);
    const highlights = colorMode === 'color' ? node.lines.map((line, index) => {
      const segments = segmentMindmapTextLine(line, lineOffsets[index] ?? 0, topic?.textStyles);
      const total = segments.reduce((sum, segment) => sum + measureTextWidth(segment.text, nodeFontSize), 0);
      let x = -total / 2;
      const y = (index - (node.lines.length - 1) / 2) * nodeLineHeight - nodeFontSize * 0.55;
      return segments.map((segment) => {
        const width = measureTextWidth(segment.text, nodeFontSize);
        const markup = segment.background
          ? `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(nodeFontSize * 1.12)}" rx="2" fill="${escapeXml(safeColor(segment.background, 'transparent'))}" />`
          : '';
        x += width;
        return markup;
      }).join('');
    }).join('') : '';
    const lines = node.lines.map((line, index) => {
      const y = (index - (node.lines.length - 1) / 2) * nodeLineHeight + nodeFontSize * 0.35;
      const segments = colorMode === 'color'
        ? segmentMindmapTextLine(line, lineOffsets[index] ?? 0, topic?.textStyles)
        : [{ text: line }];
      const rendered = segments.map((segment) => {
        const foreground = segment.color ? ` fill="${escapeXml(safeColor(segment.color, text))}"` : '';
        return `<tspan${foreground}>${escapeXml(segment.text)}</tspan>`;
      }).join('');
      return `<tspan x="0" y="${round(y)}">${rendered}</tspan>`;
    }).join('');
    return [
      `<g transform="translate(${round(node.x)} ${round(node.y)})">`,
      `<rect x="${round(-node.width / 2)}" y="${round(-node.height / 2)}" width="${node.width}" height="${node.height}" rx="${nodeRadius}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" />`,
      highlights,
      `<text text-anchor="middle" font-family="${fontFamily}" font-size="${nodeFontSize}" fill="${escapeXml(text)}"${isRoot ? ' font-weight="700"' : ''}>${lines}</text>`,
      '</g>',
    ].join('');
  }).join('');

  const images = colorMode === 'color' ? imageBoxes.map(({ image, x, y }, index) => {
    const clipId = `mindmap-image-${index}`;
    const preserve = image.objectFit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet';
    return `<defs><clipPath id="${clipId}"><rect x="${round(x)}" y="${round(y)}" width="${image.width}" height="${image.height}" rx="6" /></clipPath></defs><rect x="${round(x)}" y="${round(y)}" width="${image.width}" height="${image.height}" rx="6" fill="#ffffff" stroke="#c7d2e2" /><image href="${escapeXml(image.src)}" x="${round(x)}" y="${round(y)}" width="${image.width}" height="${image.height}" preserveAspectRatio="${preserve}" clip-path="url(#${clipId})" />`;
  }).join('') : '';

  const watermarkText = options.watermarkText?.trim() || 'TauEditor';
  const watermarkMarkup = watermark
    ? `<g opacity="0.16" fill="#7b8491" font-family="${fontFamily}" font-size="18" font-weight="600" pointer-events="none">${Array.from({ length: Math.max(2, Math.ceil(width / 220)) }, (_, column) => Array.from({ length: Math.max(2, Math.ceil(height / 100)) }, (_, row) => `<text x="${column * 220 + 20}" y="${row * 100 + 24}" transform="rotate(-24 ${column * 220 + 20} ${row * 100 + 24})">${escapeXml(watermarkText)}</text>`).join('')).join('')}</g>`
    : '';
  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    background,
    arrowDefs,
    `<g transform="translate(${round(offsetX)} ${round(offsetY)})">`,
    edges,
    relations,
    nodes,
    images,
    '</g>',
    watermarkMarkup,
    '</svg>',
  ].join('');

  return { svg, width, height, layout };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface PngPlan {
  width: number;
  height: number;
  scale: number;
}

/**
 * 规划 PNG 输出尺寸并校验上限。
 * @throws Error 当尺寸超过单边或总像素上限时（提示用户降低倍率/拆分）。
 */
export function planPngExport(
  renderedWidth: number,
  renderedHeight: number,
  scale = PNG_EXPORT_LIMITS.defaultScale,
): PngPlan {
  const width = Math.ceil(renderedWidth * scale);
  const height = Math.ceil(renderedHeight * scale);
  if (width > PNG_EXPORT_LIMITS.maxDimension || height > PNG_EXPORT_LIMITS.maxDimension) {
    throw new Error(
      `导出尺寸 ${width}×${height} 超出单边上限 ${PNG_EXPORT_LIMITS.maxDimension}px，请降低倍率`,
    );
  }
  if (width * height > PNG_EXPORT_LIMITS.maxPixels) {
    throw new Error(
      `导出像素总量 ${width * height} 超出上限，请降低倍率或拆分导图`,
    );
  }
  return { width, height, scale };
}

export interface PngBlobOptions extends SvgRenderOptions {
  scale?: number;
}

/** 画布渲染结果：PNG / PDF 等二进制导出共用。 */
export interface MindmapPngCanvasResult {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/**
 * 把文档渲染到离屏画布（SVG → Image → canvas）。
 *
 * PNG 与 PDF 导出共用该能力：先按 {@link planPngExport} 规划尺寸并校验上限，
 * 再把 SVG 绘制到同尺寸画布上。调用方可继续 canvas.toBlob（PNG）
 * 或 canvas.getContext('2d').getImageData（PDF）。
 *
 * @throws Error 当尺寸超限、环境不支持画布渲染时。
 */
export async function renderMindmapPngCanvas(
  document: MindMapDocument,
  options: PngBlobOptions = {},
): Promise<MindmapPngCanvasResult> {
  // 注意：SVG 必须按自然尺寸渲染，倍率只由 planPngExport 应用一次，
  // 否则调用方传 scale=2 时会被「SVG 放大 + 画布再放大」乘成 4 倍。
  const rendered = renderMindmapSvg(document, { ...options, scale: 1 });
  // 尺寸规划与上限校验放在最前：超限时不必承担画布内存开销
  const plan = planPngExport(rendered.width, rendered.height, options.scale);

  if (typeof window === 'undefined' || typeof window.document?.createElement !== 'function') {
    throw new Error('当前环境不支持画布渲染，无法导出图片');
  }

  const canvas = window.document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  // happy-dom 等环境可能根本没有 getContext，不做能力检查会抛 TypeError 而非可读错误
  if (typeof canvas.getContext !== 'function') {
    throw new Error('当前环境不支持画布渲染，无法导出图片');
  }
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('当前环境不支持 2D 画布，无法导出图片');
  }

  const image = await loadSvgImage(rendered.svg);
  context.drawImage(image, 0, 0, plan.width, plan.height);

  return { canvas, width: plan.width, height: plan.height };
}

/**
 * 把文档渲染成 PNG Blob。
 *
 * @throws Error 当尺寸超限、环境不支持画布或图片编码失败时。
 */
export async function exportMindmapPng(
  document: MindMapDocument,
  options: PngBlobOptions = {},
): Promise<{ blob: Blob; width: number; height: number }> {
  // 复用共享画布渲染流程，保证 PNG / PDF 的尺寸规划与绘制完全一致
  const { canvas, width, height } = await renderMindmapPngCanvas(document, options);
  const blob = await canvasToBlob(canvas);
  return { blob, width, height };
}

/** 把文档渲染成 JPG Blob；JPEG 不支持透明背景，因此默认使用白色画布。 */
export async function exportMindmapJpeg(
  document: MindMapDocument,
  options: PngBlobOptions = {},
): Promise<{ blob: Blob; width: number; height: number }> {
  const { canvas, width, height } = await renderMindmapPngCanvas(document, {
    ...options,
    background: options.background === 'transparent' || !options.background ? '#ffffff' : options.background,
  });
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
  return { blob, width, height };
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('SVG 转图片失败'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new Error(`当前环境不支持 ${mimeType === 'image/jpeg' ? 'JPG' : 'PNG'} 编码`));
      return;
    }
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(`${mimeType === 'image/jpeg' ? 'JPG' : 'PNG'} 编码失败`));
    }, mimeType, quality);
  });
}
