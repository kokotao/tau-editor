/**
 * 思维导图视觉导出策略。
 *
 * 会员判定只接受后端返回的 PLUS / PRO；缺失、未知或 FREE 一律按免费处理。
 * 视觉格式绘制可见水印；结构化格式通过兼容的品牌元数据/注释标记，不污染节点正文。
 */
import type { MindMapDocument } from '@/types/mindmap';
import {
  exportMindmapPdfFile,
  exportMindmapSvgText,
  exportMindmapText,
  type MindmapPdfExportOptions,
  type MindmapSvgExportOptions,
  type MindmapExportFormatId,
} from '@/services/mindmap/importExportService';
import { exportMindmapJpeg, exportMindmapPng, type PngBlobOptions } from '@/services/mindmapSvgService';

export type MindmapMembershipTier = 'FREE' | 'PLUS' | 'PRO';
export type MindmapExportColorMode = 'monochrome' | 'color';

export interface MindmapExportPolicy {
  /** 仅 PLUS / PRO 为 true；不接受本地自报的其它等级。 */
  canExportColor: boolean;
  /** 视觉导出是否应包含 TauEditor 水印。 */
  watermark: boolean;
  colorMode: MindmapExportColorMode;
  allowedFormats: readonly MindmapExportFormatId[];
  customWatermark: boolean;
}

const FREE_EXPORT_FORMATS: readonly MindmapExportFormatId[] = ['taumap', 'markdown', 'pdf', 'jpg'];
const PLUS_EXPORT_FORMATS: readonly MindmapExportFormatId[] = [...FREE_EXPORT_FORMATS, 'freemind', 'svg'];
const PRO_EXPORT_FORMATS: readonly MindmapExportFormatId[] = ['taumap', 'markdown', 'opml', 'freemind', 'png', 'jpg', 'svg', 'pdf'];

export function normalizeMindmapMembershipTier(tier: unknown): MindmapMembershipTier {
  return tier === 'PLUS' || tier === 'PRO' ? tier : 'FREE';
}

export function getAllowedMindmapExportFormats(tier: unknown): readonly MindmapExportFormatId[] {
  const normalized = normalizeMindmapMembershipTier(tier);
  return normalized === 'PRO' ? PRO_EXPORT_FORMATS : normalized === 'PLUS' ? PLUS_EXPORT_FORMATS : FREE_EXPORT_FORMATS;
}

export function canExportMindmapFormat(formatId: MindmapExportFormatId, tier: unknown): boolean {
  return getAllowedMindmapExportFormats(tier).includes(formatId);
}

export interface MindmapVisualExportOptions {
  tier?: unknown;
  background?: 'transparent' | string;
  padding?: number;
  scale?: number;
  colorMode?: MindmapExportColorMode;
  customWatermark?: string;
}

/**
 * 从真实会员档位生成导出策略。
 * 未加载时 tier 通常为 FREE；这里额外防御未知字符串，避免误开放付费功能。
 */
export function resolveMindmapExportPolicy(tier: unknown): MindmapExportPolicy {
  const canExportColor = tier === 'PLUS' || tier === 'PRO';
  return {
    canExportColor,
    watermark: !canExportColor,
    colorMode: 'monochrome',
    allowedFormats: getAllowedMindmapExportFormats(tier),
    customWatermark: canExportColor,
  };
}

/** 将用户选项收敛为策略允许的视觉导出选项。 */
export function resolveMindmapVisualExportOptions(
  options: MindmapVisualExportOptions = {},
): MindmapVisualExportOptions & { colorMode: MindmapExportColorMode; watermark: boolean; watermarkText?: string } {
  const policy = resolveMindmapExportPolicy(options.tier);
  const colorMode = policy.canExportColor
    ? (options.colorMode ?? policy.colorMode)
    : 'monochrome';
  const customWatermark = options.customWatermark?.trim();
  const watermark = policy.watermark || (policy.customWatermark && Boolean(customWatermark));
  return {
    ...options,
    colorMode,
    watermark,
    watermarkText: policy.watermark ? 'TauEditor' : customWatermark || undefined,
  };
}

/** 结构化导出也携带品牌标记，原生格式写入扩展元数据，Markdown 写入 HTML 注释。 */
export function exportMindmapBrandedText(
  formatId: MindmapExportFormatId,
  document: MindMapDocument,
  tier: unknown,
) {
  const result = exportMindmapText(formatId, document);
  if (!result.ok || normalizeMindmapMembershipTier(tier) !== 'FREE') return result;
  if (formatId === 'taumap') {
    const branded = {
      ...document,
      opaqueExtensions: { ...document.opaqueExtensions, tauEditorBrand: 'TauEditor' },
    };
    return exportMindmapText(formatId, branded);
  }
  if (formatId === 'markdown') {
    return { ...result, output: `<!-- Exported with TauEditor -->\n${result.output}` };
  }
  return result;
}

/** 视觉 SVG 导出。策略在此统一收敛，调用方不会因 UI 状态绕过水印/颜色限制。 */
export function exportMindmapVisualSvg(
  document: MindMapDocument,
  options: MindmapVisualExportOptions = {},
) {
  const resolved = resolveMindmapVisualExportOptions(options);
  const renderOptions: MindmapSvgExportOptions = {
    background: resolved.background,
    padding: resolved.padding,
    colorMode: resolved.colorMode,
    watermark: resolved.watermark,
    watermarkText: resolved.watermarkText,
  };
  return exportMindmapSvgText(document, renderOptions);
}

/** 视觉 PNG 导出，返回可直接写盘的 Blob。 */
export async function exportMindmapVisualPng(
  document: MindMapDocument,
  options: MindmapVisualExportOptions = {},
): Promise<{ blob: Blob; width: number; height: number }> {
  const resolved = resolveMindmapVisualExportOptions(options);
  const renderOptions: PngBlobOptions = {
    background: resolved.background,
    padding: resolved.padding,
    scale: resolved.scale,
    colorMode: resolved.colorMode,
    watermark: resolved.watermark,
    watermarkText: resolved.watermarkText,
  };
  return exportMindmapPng(document, renderOptions);
}

/** 视觉 JPG 导出，JPEG 默认使用白色背景以避免透明通道丢失。 */
export async function exportMindmapVisualJpeg(
  document: MindMapDocument,
  options: MindmapVisualExportOptions = {},
): Promise<{ blob: Blob; width: number; height: number }> {
  const resolved = resolveMindmapVisualExportOptions(options);
  const renderOptions: PngBlobOptions = {
    background: resolved.background === 'transparent' || !resolved.background ? '#ffffff' : resolved.background,
    padding: resolved.padding,
    scale: resolved.scale,
    colorMode: resolved.colorMode,
    watermark: resolved.watermark,
    watermarkText: resolved.watermarkText,
  };
  return exportMindmapJpeg(document, renderOptions);
}

/** 视觉 PDF 导出，返回可直接写盘的字节。 */
export async function exportMindmapVisualPdf(
  document: MindMapDocument,
  options: MindmapVisualExportOptions = {},
) {
  const resolved = resolveMindmapVisualExportOptions(options);
  const pdfOptions: MindmapPdfExportOptions = {
    background: resolved.background,
    padding: resolved.padding,
    scale: resolved.scale,
    colorMode: resolved.colorMode,
    watermark: resolved.watermark,
    watermarkText: resolved.watermarkText,
  };
  return exportMindmapPdfFile(document, pdfOptions);
}
