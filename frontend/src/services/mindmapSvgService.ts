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

import { computeMindmapLayout, type MindmapLayout } from '@/services/mindmapLayoutService';
import { escapeXml } from '@/services/mindmap/xmlUtils';
import type { MindMapDocument } from '@/types/mindmap';

export interface SvgRenderOptions {
  /** 'transparent' 或 CSS 颜色（#fff 等）。 */
  background?: 'transparent' | string;
  padding?: number;
  /** 字号缩放（默认 1）。 */
  scale?: number;
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
const FONT_FAMILY = "'Manrope','Segoe UI','Microsoft YaHei',sans-serif";

/** 依据布局与选项生成 SVG 文本。 */
export function renderMindmapSvg(
  document: MindMapDocument,
  options: SvgRenderOptions = {},
): SvgRenderResult {
  const padding = options.padding ?? 32;
  const scale = options.scale ?? 1;
  const layout = computeMindmapLayout(document);
  const { fontSize, lineHeight } = layout.options;

  const width = Math.max(1, Math.ceil((layout.bounds.width + padding * 2) * scale));
  const height = Math.max(1, Math.ceil((layout.bounds.height + padding * 2) * scale));
  const offsetX = padding - layout.bounds.minX;
  const offsetY = padding - layout.bounds.minY;

  const background = options.background && options.background !== 'transparent'
    ? `<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(options.background)}" />`
    : '';

  const edges = layout.edges.map((edge) => (
    `<path d="${edge.path}" fill="none" stroke="${EDGE_STROKE}" stroke-width="1.6" />`
  )).join('');

  const nodes = layout.nodes.map((node) => {
    const isRoot = node.side === 'root';
    const fill = isRoot ? ROOT_FILL : NODE_FILL;
    const stroke = isRoot ? ROOT_STROKE : NODE_STROKE;
    const strokeWidth = isRoot ? 1.8 : 1.4;
    const lines = node.lines.map((line, index) => {
      const y = (index - (node.lines.length - 1) / 2) * lineHeight + fontSize * 0.35;
      return `<tspan x="0" y="${round(y)}">${escapeXml(line)}</tspan>`;
    }).join('');
    return [
      `<g transform="translate(${round(node.x)} ${round(node.y)})">`,
      `<rect x="${round(-node.width / 2)}" y="${round(-node.height / 2)}" width="${node.width}" height="${node.height}" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`,
      `<text text-anchor="middle" font-family="${FONT_FAMILY}" font-size="${fontSize}" fill="${TEXT_COLOR}"${isRoot ? ' font-weight="700"' : ''}>${lines}</text>`,
      '</g>',
    ].join('');
  }).join('');

  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    background,
    `<g transform="translate(${round(offsetX)} ${round(offsetY)})">`,
    edges,
    nodes,
    '</g>',
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

/**
 * 把文档渲染成 PNG Blob。
 *
 * @throws Error 当尺寸超限、环境不支持画布或图片编码失败时。
 */
export async function exportMindmapPng(
  document: MindMapDocument,
  options: PngBlobOptions = {},
): Promise<{ blob: Blob; width: number; height: number }> {
  const rendered = renderMindmapSvg(document, options);
  const plan = planPngExport(rendered.width, rendered.height, options.scale);

  if (typeof window === 'undefined' || typeof window.document?.createElement !== 'function') {
    throw new Error('当前环境不支持画布渲染，无法导出 PNG');
  }

  const canvas = window.document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('当前环境不支持 2D 画布，无法导出 PNG');
  }

  const image = await loadSvgImage(rendered.svg);
  context.drawImage(image, 0, 0, plan.width, plan.height);

  const blob = await canvasToBlob(canvas);
  return { blob, width: plan.width, height: plan.height };
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('SVG 转图片失败'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new Error('当前环境不支持 PNG 编码'));
      return;
    }
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG 编码失败'));
    }, 'image/png');
  });
}