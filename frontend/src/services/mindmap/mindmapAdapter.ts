/**
 * 思维导图适配器接口（阶段 0）
 *
 * 职责：
 * 1. 定义外部格式 → Canonical MindMap Model / 反向的适配器契约；
 * 2. 定义导入结果（含损失报告）与导出结果（含有损警告）的结构；
 * 3. 提供安全失败的统一错误路径。
 *
 * 说明：
 * - 阶段 0 只交付 taumap 原生适配器；xmind/freemind/mindmanager 等
 *   在阶段 1/3/4 接入，接口先行确保其无需改动调用方。
 * - 适配器解析失败必须作答「失败」，绝不降级返回部分文档导致静默写回。
 *
 * @author Albert_Luo
 * @date 2026-10-29
 */

import type {
  MindMapDocument,
  MindMapErrorCategory,
  MindMapFormatCapabilities,
  MindMapValidationIssue,
} from '@/types/mindmap';

export interface MindMapImportItem {
  /** 适配器探测到的格式 id */
  sourceFormat: string;
  sourceVersion?: string;
}

export interface MindMapImportResult {
  ok: boolean;
  document: MindMapDocument | null;
  /** 导入时丢失/改写的字段说明（有损报告）。 */
  lossy?: string[];
  /** 结构校验告警（如关系端点缺失）。 */
  warnings?: MindMapValidationIssue[];
  error?: {
    category: MindMapErrorCategory;
    message: string;
    code?: string;
  };
}

export interface MindMapExportResult {
  ok: boolean;
  /** 序列化结果（文本；二进制/打包格式由适配器自身写盘）。 */
  output: string;
  /** 导出时丢失/改写的字段说明。 */
  lossy?: string[];
  error?: {
    category: MindMapErrorCategory;
    message: string;
    code?: string;
  };
}

export interface MindMapAdapter {
  readonly formatId: string;
  readonly displayName: string;
  readonly capabilities: MindMapFormatCapabilities;

  /** 导入：外部/原生正文 → Canonical 文档。失败返回 ok:false，绝不抛部分结果。 */
  importFromString(content: string, origin?: MindMapImportItem): MindMapImportResult;

  /**
   * 导入二进制/包格式（如 .xmind）。文本适配器可不实现；
   * 实现后由导入管线在探测到二进制格式时优先调用。
   */
  importFromBytes?(bytes: Uint8Array, origin?: MindMapImportItem): Promise<MindMapImportResult>;

  /** 导出：Canonical 文档 → 目标格式文本。 */
  exportToString(document: MindMapDocument): MindMapExportResult;
}

/** 根据原始格式来源与映射记录，生成有损字段报告（供导入预览展示）。 */
export function buildLossReport(
  document: MindMapDocument | null,
  rawFields: string[],
): string[] {
  const lossy: string[] = [];
  if (!document) return lossy;
  if (document.relations && document.relations.length > 0
    && rawFields.includes('relations')) {
    lossy.push('独立关系线');
  }
  if (rawFields.includes('notes') || rawFields.includes('labels')
    || rawFields.includes('markers')) {
    lossy.push('节点标注（备注/标签/标记）');
  }
  if (rawFields.includes('attachments')) {
    lossy.push('附件');
  }
  return Array.from(new Set(lossy));
}