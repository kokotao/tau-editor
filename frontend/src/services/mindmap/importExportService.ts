/**
 * 思维导图导入导出管线（阶段 3）
 *
 * 职责：
 * 1. 统一入口：探测格式 → 选择适配器 → 解析为临时 Canonical 文档 → 校验 → 产出预览；
 * 2. 预览包含格式、版本、支持等级、有损字段与结构告警，供 UI 在确认前展示；
 * 3. 失败时返回分类错误，调用方保持当前文档/选中/历史不变（不触碰 store）；
 * 4. 文本导出（含 SVG 矢量文本）与 PNG / PDF 二进制导出入口、默认文件名与导出格式清单。
 *
 * 设计约束：本模块不修改 store、不写盘；落盘与替换由 UI 层执行。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */

import { freemindAdapter } from '@/services/mindmap/adapters/freemindAdapter';
import { markdownAdapter } from '@/services/mindmap/adapters/markdownAdapter';
import { opmlAdapter } from '@/services/mindmap/adapters/opmlAdapter';
import { taumapAdapter } from '@/services/mindmap/adapters/taumapAdapter';
import { xmindAdapter } from '@/services/mindmap/adapters/xmindAdapter';
import { detectMindMapFormat, type MindMapDetectionResult } from '@/services/mindmap/fileFormatDetector';
import { getMindMapFormatEntry } from '@/services/mindmap/formatRegistry';
import type { MindMapAdapter, MindMapExportResult } from '@/services/mindmap/mindmapAdapter';
import { exportMindmapPdf } from '@/services/mindmapPdfService';
import { renderMindmapSvg } from '@/services/mindmapSvgService';
import type { MindMapDocument, MindMapErrorCategory, MindMapValidationIssue } from '@/types/mindmap';

/** 已接入管线的适配器（顺序即优先级）。 */
export const MINDMAP_ADAPTERS: MindMapAdapter[] = [
  taumapAdapter,
  markdownAdapter,
  opmlAdapter,
  freemindAdapter,
  xmindAdapter,
];

export type MindmapSupportLevel = 'native' | 'compatible' | 'read-only' | 'unsupported';

export interface MindmapImportInput {
  fileName: string;
  /** 文本内容（文本格式必填）。 */
  content?: string;
  /** 二进制内容（.xmind 等包格式必填）。 */
  bytes?: Uint8Array;
}

export interface MindmapImportPreview {
  ok: boolean;
  formatId: string | null;
  formatName: string;
  version?: string;
  supportLevel: MindmapSupportLevel;
  /** 成功时为临时 Canonical 文档，失败为 null。 */
  document: MindMapDocument | null;
  /** 导入将有损/改写的字段说明。 */
  lossy: string[];
  warnings: MindMapValidationIssue[];
  detection: MindMapDetectionResult;
  error?: {
    category: MindMapErrorCategory;
    message: string;
    code?: string;
  };
}

function supportLevelOf(formatId: string): MindmapSupportLevel {
  const entry = getMindMapFormatEntry(formatId);
  if (!entry) return 'unsupported';
  switch (entry.capabilities.read) {
    case 'lossless':
      return 'native';
    case 'compatible':
      return 'compatible';
    case 'read-only':
      return 'read-only';
    default:
      return 'unsupported';
  }
}

function adapterFor(formatId: string): MindMapAdapter | undefined {
  return MINDMAP_ADAPTERS.find((adapter) => adapter.formatId === formatId);
}

/**
 * 导入预览：解析到临时文档并校验，不修改任何现有状态。
 */
export async function previewMindmapImport(
  input: MindmapImportInput,
): Promise<MindmapImportPreview> {
  const detection = detectMindMapFormat({
    fileName: input.fileName,
    content: input.content,
    headerBytes: input.bytes ? input.bytes.subarray(0, 8) : null,
  });

  const base: MindmapImportPreview = {
    ok: false,
    formatId: detection.formatId,
    formatName: detection.formatId
      ? (getMindMapFormatEntry(detection.formatId)?.displayName ?? detection.formatId)
      : '未知格式',
    version: detection.version,
    supportLevel: detection.formatId ? supportLevelOf(detection.formatId) : 'unsupported',
    document: null,
    lossy: [],
    warnings: [],
    detection,
  };

  if (detection.status === 'ambiguous') {
    return {
      ...base,
      error: {
        category: 'unsupported-format',
        message: detection.reason || '该文件格式存在歧义，请明确选择具体格式',
        code: 'AMBIGUOUS_FORMAT',
      },
    };
  }
  if (detection.status === 'unknown' || !detection.formatId) {
    return {
      ...base,
      error: {
        category: 'unsupported-format',
        message: detection.reason || '无法识别该思维导图格式',
        code: 'UNKNOWN_FORMAT',
      },
    };
  }

  const adapter = adapterFor(detection.formatId);
  if (!adapter) {
    return {
      ...base,
      error: {
        category: 'unsupported-format',
        message: `暂不支持导入 ${base.formatName}`,
        code: 'ADAPTER_MISSING',
      },
    };
  }

  const listedVersion = detection.version
    ?? getMindMapFormatEntry(detection.formatId)?.capabilities.knownVersions[0];

  if (input.bytes && typeof adapter.importFromBytes === 'function') {
    const result = await adapter.importFromBytes(input.bytes, {
      sourceFormat: detection.formatId,
      sourceVersion: listedVersion,
    });
    return {
      ...base,
      ok: result.ok,
      document: result.document,
      lossy: result.lossy ?? [],
      warnings: result.warnings ?? [],
      version: detection.version ?? result.document?.sourceVersion ?? listedVersion,
      error: result.error,
    };
  }

  if (typeof adapter.importFromBytes === 'function' && !input.content) {
    return {
      ...base,
      version: listedVersion,
      error: {
        category: 'unsupported-format',
        message: `${adapter.displayName} 需要以二进制方式读取`,
        code: 'BINARY_REQUIRED',
      },
    };
  }

  const result = adapter.importFromString(input.content ?? '', {
    sourceFormat: detection.formatId,
    sourceVersion: listedVersion,
  });
  return {
    ...base,
    ok: result.ok,
    document: result.document,
    lossy: result.lossy ?? [],
    warnings: result.warnings ?? [],
    version: detection.version ?? result.document?.sourceVersion ?? listedVersion,
    error: result.error,
  };
}

/** 导出格式 id。 */
export type MindmapExportFormatId =
  | 'taumap'
  | 'markdown'
  | 'opml'
  | 'freemind'
  | 'png'
  | 'svg'
  | 'pdf';

/** 可导出格式清单（PNG/PDF 走二进制分支，SVG 走矢量文本分支）。 */
export interface MindmapExportFormat {
  id: MindmapExportFormatId;
  label: string;
  extension: string;
}

export const MINDMAP_EXPORT_FORMATS: MindmapExportFormat[] = [
  { id: 'taumap', label: 'Tau 思维导图（.taumap）', extension: 'taumap' },
  { id: 'markdown', label: 'Markdown 大纲（.md）', extension: 'md' },
  { id: 'opml', label: 'OPML 大纲（.opml）', extension: 'opml' },
  { id: 'freemind', label: 'FreeMind（.mm）', extension: 'mm' },
  { id: 'png', label: 'PNG 图片（.png）', extension: 'png' },
  { id: 'svg', label: 'SVG 矢量图（.svg）', extension: 'svg' },
  { id: 'pdf', label: 'PDF 文档（.pdf）', extension: 'pdf' },
];

/** SVG 导出选项。 */
export interface MindmapSvgExportOptions {
  /** 'transparent'（默认，不画背景）或 CSS 颜色（如 '#ffffff'）。 */
  background?: 'transparent' | string;
}

/**
 * SVG 矢量文本导出：复用布局 + SVG 渲染服务，产出可直接写入 .svg 的自包含文本。
 *
 * - 默认透明背景；传入颜色时渲染同尺寸背景矩形；
 * - 去掉 XML 声明，输出以 `<svg` 开头，便于直接内联到 HTML 或写入文件；
 * - 渲染失败（如文档结构非法）返回分类错误，不抛异常。
 */
export function exportMindmapSvgText(
  document: MindMapDocument,
  options: MindmapSvgExportOptions = {},
): MindMapExportResult {
  try {
    const rendered = renderMindmapSvg(document, {
      background: options.background ?? 'transparent',
    });
    const output = rendered.svg.replace(/^<\?xml[^>]*\?>\s*/i, '').trim();
    return {
      ok: true,
      output,
      lossy: ['折叠状态、选中与视口等交互信息不会写入 SVG'],
    };
  } catch (error) {
    return {
      ok: false,
      output: '',
      error: {
        category: 'invalid-structure',
        message: error instanceof Error ? error.message : 'SVG 渲染失败',
        code: 'SVG_RENDER_FAILED',
      },
    };
  }
}

/** PDF 导出选项（背景默认纯白，scale 与 PNG 共用尺寸规划）。 */
export interface MindmapPdfExportOptions {
  background?: 'transparent' | string;
  padding?: number;
  scale?: number;
}

/** PDF 二进制导出结果：失败时只给分类错误，绝不返回半成品字节。 */
export interface MindmapPdfFileResult {
  ok: boolean;
  bytes?: Uint8Array;
  width?: number;
  height?: number;
  lossy?: string[];
  error?: {
    category: MindMapErrorCategory;
    message: string;
    code?: string;
  };
}

/**
 * PDF 二进制导出：委托 mindmapPdfService 渲染并组装单页 PDF。
 *
 * 失败按原因分类（不抛异常）：
 * - 尺寸超限 → invalid-structure / PDF_SIZE_LIMIT（提示降低倍率）；
 * - 环境不支持画布或压缩 → unsupported-format / PDF_UNSUPPORTED_ENV；
 * - 其他 → io-error / PDF_EXPORT_FAILED。
 */
export async function exportMindmapPdfFile(
  document: MindMapDocument,
  options: MindmapPdfExportOptions = {},
): Promise<MindmapPdfFileResult> {
  try {
    const { bytes, width, height } = await exportMindmapPdf(document, options);
    return {
      ok: true,
      bytes,
      width,
      height,
      lossy: ['打印/PDF 不包含折叠状态、选中与视口等交互信息'],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF 导出失败';
    if (message.includes('上限') || message.includes('超出')) {
      return {
        ok: false,
        error: { category: 'invalid-structure', message, code: 'PDF_SIZE_LIMIT' },
      };
    }
    if (message.includes('不支持')) {
      return {
        ok: false,
        error: { category: 'unsupported-format', message, code: 'PDF_UNSUPPORTED_ENV' },
      };
    }
    return {
      ok: false,
      error: { category: 'io-error', message, code: 'PDF_EXPORT_FAILED' },
    };
  }
}

/**
 * 文本导出：返回序列化结果与有损说明。
 *
 * - 'taumap' | 'markdown' | 'opml' | 'freemind' 走对应适配器；
 * - 'svg' 委托 {@link exportMindmapSvgText}（矢量文本）；
 * - 'png' / 'pdf' 为二进制格式，这里返回明确错误，调用方应改用
 *   exportMindmapPng / {@link exportMindmapPdfFile}。
 */
export function exportMindmapText(
  formatId: MindmapExportFormatId,
  document: MindMapDocument,
): MindMapExportResult {
  if (formatId === 'svg') return exportMindmapSvgText(document);
  if (formatId === 'png' || formatId === 'pdf') {
    const entry = formatId === 'png' ? 'exportMindmapPng' : 'exportMindmapPdfFile';
    return {
      ok: false,
      output: '',
      error: {
        category: 'unsupported-format',
        message: `${formatId.toUpperCase()} 为二进制导出，请使用 ${entry}`,
        code: 'BINARY_EXPORT_REQUIRED',
      },
    };
  }
  const adapter = adapterFor(formatId);
  if (!adapter) {
    return {
      ok: false,
      output: '',
      error: { category: 'unsupported-format', message: `不支持导出 ${formatId}` },
    };
  }
  return adapter.exportToString(document);
}

/** 导出默认文件名：清理非法字符并补扩展名。 */
export function buildExportFileName(title: string, extension: string): string {
  const base = String(title || '思维导图')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || '思维导图';
  return `${base}.${extension}`;
}

/** 判断某格式是否支持导出（XMind 目前仅读；SVG/PDF 由本地渲染管线写入）。 */
export function canExportFormat(formatId: string): boolean {
  if (formatId === 'png') return true;
  if (formatId === 'svg') return true;
  if (formatId === 'pdf') return true;
  const entry = getMindMapFormatEntry(formatId);
  return Boolean(entry && entry.capabilities.write !== 'none');
}