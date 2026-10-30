/**
 * 思维导图文件格式探测器（阶段 0）
 *
 * 职责：
 * 1. 扩展名 + 文件头（魔数）+ 内容结构化探测，输出确定性判定；
 * 2. 处理未知、歧义（尤其是 `.map`）和损坏结果；
 * 3. 探测优先检查魔数/内容，再使用扩展名作为辅助信号。
 *
 * 说明：
 * - 探测只做「判定格式身份」，不解析业务数据；真正导入由适配器负责。
 * - `.map` 不预设格式：内容无法判定时返回 ambiguous，要求用户选择具体格式。
 *
 * @author Albert_Luo
 * @date 2026-10-29
 */

import {
  MINDMAP_FORMAT_REGISTRY,
  type MindMapFormatEntry,
} from '@/services/mindmap/formatRegistry';
import {
  isAmbiguousMapPath,
  isOpmlPath,
} from '@/services/documentTypeService';

export type MindMapDetectionStatus =
  | 'identified'
  | 'ambiguous'
  | 'unknown';

export interface MindMapDetectionResult {
  status: MindMapDetectionStatus;
  /** 确定性判定时的格式 id；歧义时为 null。 */
  formatId: string | null;
  /** 歧义时可选的候选格式 id 列表（按可信度排序）。 */
  candidates: string[];
  /** 已探测到的版本提示（如 '8'、'zen'、'0.9'），探测不到可为 undefined。 */
  version?: string;
  /** 人类可读的判定原因。 */
  reason: string;
}

export interface MindMapDetectionInput {
  /** 文件路径或文件名（扩展名作为辅助信号）。 */
  fileName: string;
  /** UTF-8 文本内容（JSON/XML/Markdown 等）；二进制容器在探测器中不可读时可为空。 */
  content?: string;
  /** 文件头字节（用于 ZIP PK 魔数等二进制判定）。 */
  headerBytes?: Uint8Array | null;
}

const ZIP_MAGIC = 0x504b0304; // PK\x03\x04
const ZIP_MAGIC_EMPTY = 0x504b0506; // PK\x05\x06

function firstFourAsLE(bytes: Uint8Array): number {
  if (bytes.length < 4) return 0;
  const b0 = bytes[0] ?? 0;
  const b1 = bytes[1] ?? 0;
  const b2 = bytes[2] ?? 0;
  const b3 = bytes[3] ?? 0;
  return b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
}

function isZipHeader(head?: Uint8Array | null): boolean {
  if (!head || head.length < 4) return false;
  const magic = firstFourAsLE(head);
  return magic === ZIP_MAGIC || magic === ZIP_MAGIC_EMPTY;
}

/** 去掉 XML 声明与注释，便于判断真正的根元素。 */
function stripXmlProlog(content: string): string {
  return content
    .replace(/^\uFEFF/, '')
    .trimStart()
    .replace(/^<\?[\s\S]*?\?>/g, '')
    .replace(/^<!--[\s\S]*?-->/g, '')
    .trimStart();
}

function looksLikeXml(content: string | undefined): boolean {
  if (!content) return false;
  const body = stripXmlProlog(content).toLowerCase();
  return body.startsWith('<') && /<(map|opml|mindnode|xmap|xmap-content)\b/.test(body);
}

function looksLikeTauMap(content: string | undefined): boolean {
  if (!content) return false;
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('{')) return false;
  try {
    const parsed = JSON.parse(trimmed) as { format?: unknown };
    return parsed?.format === 'tau-mindmap';
  } catch {
    return false;
  }
}

function looksLikeMarkdown(content: string | undefined): boolean {
  if (!content) return false;
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return false;
  // 存在标题或列表结构即可作为大纲候选
  const headingOrList = lines.some((line) => /^(#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s)/.test(line));
  return headingOrList;
}

/**
 * 探测文件格式身份。
 *
 * 判定策略（优先级从高到低）：
 * 1. 内容/魔数强信号：.taumap JSON、ZIP 容器、XML 根元素；
 * 2. 扩展名与已知格式匹配；
 * 3. 命中多个候选或 `.map` 无法判定 → ambiguous；
 * 4. 未命中任何 → unknown。
 *
 * @param input 探测输入
 */
export function detectMindMapFormat(input: MindMapDetectionInput): MindMapDetectionResult {
  const { fileName, content, headerBytes } = input;
  const lowerName = fileName.toLowerCase().split(/[\\/]/).pop() ?? '';
  const ext = lowerName.includes('.') ? lowerName.slice(lowerName.lastIndexOf('.') + 1) : '';

  // --- 内容强信号（优先于扩展名） ---

  if (looksLikeTauMap(content)) {
    return {
      status: 'identified',
      formatId: 'taumap',
      candidates: ['taumap'],
      reason: '内容为 tau-mindmap JSON',
    };
  }

  if (isZipHeader(headerBytes)) {
    // ZIP 容器：按扩展名辅助区分 xmind / mindnode
    if (ext === 'xmind') {
      return {
        status: 'identified',
        formatId: 'xmind',
        candidates: ['xmind'],
        reason: 'ZIP 容器且扩展名为 .xmind',
      };
    }
    if (ext === 'mindnode' || ext === 'map' || lowerName.endsWith('.mindnode')) {
      if (ext === 'map') {
        return {
          status: 'ambiguous',
          formatId: null,
          candidates: ['xmind'],
          reason: 'ZIP 容器但 .map 扩展名歧义，可能为 XMind 或 MindNode',
        };
      }
      return {
        status: 'identified',
        formatId: 'mindnode',
        candidates: ['mindnode'],
        reason: 'ZIP 容器且扩展名为 .mindnode（按厂商包格式判断）',
      };
    }
    return {
      status: 'ambiguous',
      formatId: null,
      candidates: ['xmind', 'mindnode'],
      reason: 'ZIP 容器但扩展名无法唯一判定地图格式',
    };
  }

  if (looksLikeXml(content)) {
    const rootStart = stripXmlProlog(content ?? '').toLowerCase();
    if (/^<opml\b/.test(rootStart)) {
      return {
        status: 'identified',
        formatId: 'opml',
        candidates: ['opml'],
        version: '2.0',
        reason: 'XML 根元素为 <opml>',
      };
    }
    if (/^<map\b/.test(rootStart)) {
      return {
        status: 'identified',
        formatId: 'freemind',
        candidates: ['freemind'],
        reason: 'XML 根元素为 <map>（FreeMind/Freeplane）',
      };
    }
    return {
      status: 'identified',
      formatId: 'opml',
      candidates: ['opml'],
      reason: 'XML 结构（按公共大纲格式判定）',
    };
  }

  // --- 扩展名辅助 ---

  if (ext === 'taumap') {
    return {
      status: 'identified',
      formatId: 'taumap',
      candidates: ['taumap'],
      reason: '扩展名 .taumap',
    };
  }

  if (ext === 'xmind') {
    return {
      status: 'identified',
      formatId: 'xmind',
      candidates: ['xmind'],
      reason: '扩展名 .xmind',
    };
  }

  if (ext === 'mm') {
    return {
      status: 'identified',
      formatId: 'freemind',
      candidates: ['freemind'],
      reason: '扩展名 .mm',
    };
  }

  if (ext === 'mmap') {
    return {
      status: 'identified',
      formatId: 'mindmanager',
      candidates: ['mindmanager'],
      reason: '扩展名 .mmap',
    };
  }

  if (ext === 'mindnode') {
    return {
      status: 'identified',
      formatId: 'mindnode',
      candidates: ['mindnode'],
      reason: '扩展名 .mindnode',
    };
  }

  if (isOpmlPath(fileName) || ext === 'opml') {
    return {
      status: 'identified',
      formatId: 'opml',
      candidates: ['opml'],
      reason: '扩展名 .opml',
    };
  }

  if (ext === 'md' || ext === 'markdown') {
    if (looksLikeMarkdown(content)) {
      return {
        status: 'identified',
        formatId: 'markdown',
        candidates: ['markdown'],
        reason: '扩展名 .md 且含标题/列表大纲结构',
      };
    }
    // .md 不是任何已知地图格式的强信号；普通 Markdown 不进地图打开路径
    return { status: 'unknown', formatId: null, candidates: [], reason: '普通 Markdown，非地图格式' };
  }

  if (isAmbiguousMapPath(fileName) || ext === 'map') {
    // 内容无法判定时，.map 必须要求用户选择，不允许静默识别。
    return {
      status: 'ambiguous',
      formatId: null,
      candidates: [],
      reason: '.map 扩展名高歧义，内容无法判定具体地图格式',
    };
  }

  return { status: 'unknown', formatId: null, candidates: [], reason: '未识别的地图格式' };
}

/**
 * 按探测结果获取格式条目（探测结果 formatId 非空时）。
 */
export function resolveDetectedFormat(
  result: MindMapDetectionResult,
): MindMapFormatEntry | undefined {
  return result.formatId
    ? MINDMAP_FORMAT_REGISTRY.find((entry) => entry.id === result.formatId)
    : undefined;
}