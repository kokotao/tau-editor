/**
 * XMind 读取 spike 适配器（阶段 3）
 *
 * 目标（spike 范围）：
 * 1. 识别两种容器分支：XMind 8（ZIP 内 content.xml）与 Zen/Workbook（ZIP 内 content.json）；
 * 2. 读取主题树（标题 + 备注，尽力而为），转换为 Canonical 模型；
 * 3. 明确不承诺完整兼容：样式、关系线、标记、概要、附件均记为有损。
 *
 * 安全：ZIP 条目数与解压总量受限；不执行包内任何内容；超限直接失败。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */
import {
  createDocumentFromOutline,
  type OutlineNode,
} from '@/services/mindmap/outlineDocument';
import { getMindMapFormatEntry } from '@/services/mindmap/formatRegistry';
import type {
  MindMapAdapter,
  MindMapExportResult,
  MindMapImportResult,
} from '@/services/mindmap/mindmapAdapter';
import {
  isZipWithinLimits,
  listZipEntries,
  readZipEntryData,
  type ZipEntryInfo,
} from '@/services/mindmap/zipReader';
import { containsUnsafeXmlDoctype } from '@/services/mindmap/xmlUtils';
import type { MindMapDocument } from '@/types/mindmap';

export type XmindVariant = 'zen' | 'xmind8' | 'unknown';

export interface XmindVariantInfo {
  variant: XmindVariant;
  entryName: string | null;
  /** Zen 的 content.json 条目名可能是 content.json；Workbook 为 content.json */
  versionLabel: string;
}

/** 识别 XMind 容器分支（只看 ZIP 条目名，不解析内容）。 */
export function detectXmindVariant(
  bytes: Uint8Array,
  entries?: ZipEntryInfo[],
): XmindVariantInfo {
  const list = entries ?? listZipEntries(bytes);
  const names = new Set(list.map((entry) => entry.name));
  if (names.has('content.json')) {
    return { variant: 'zen', entryName: 'content.json', versionLabel: 'Zen/Workbook' };
  }
  if (names.has('content.xml')) {
    return { variant: 'xmind8', entryName: 'content.xml', versionLabel: 'XMind 8' };
  }
  return { variant: 'unknown', entryName: null, versionLabel: '未知' };
}

interface ZenTopic {
  id?: string;
  title?: string;
  notes?: { plain?: { content?: string } };
  children?: { attached?: ZenTopic[]; detached?: ZenTopic[] };
}

function zenTopicToOutline(topic: ZenTopic): OutlineNode {
  const node: OutlineNode = {
    text: typeof topic.title === 'string' ? topic.title : '',
    children: [],
  };
  const note = topic.notes?.plain?.content;
  if (note) node.note = note;
  const attached = topic.children?.attached ?? [];
  node.children = attached.map(zenTopicToOutline);
  return node;
}

/** 解析 Zen content.json 的第一张工作表。 */
export function parseZenContent(json: string): OutlineNode {
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('XMind Zen content.json 结构不符合预期');
  }
  const sheet = parsed.find((item) => {
    return typeof item === 'object' && item !== null
      && 'rootTopic' in (item as Record<string, unknown>);
  }) as { rootTopic?: ZenTopic } | undefined;
  if (!sheet?.rootTopic) {
    throw new Error('XMind Zen 文件缺少 rootTopic');
  }
  return zenTopicToOutline(sheet.rootTopic);
}

/** 去掉标签并压缩空白（XMind 备注只保留纯文本）。 */
function plainText(html: string): string {
  return String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 解析 XMind 8 的 content.xml（词法扫描，不依赖 DOMParser）。
 *
 * 支持的标签：topic / title / children / topics(type=attached) / notes。
 * 非 attached 分支（detached、summary 等）本阶段不导入。
 */
const XMIND8_TOKEN_RE = /<topic\b([^>]*?)(\/?)>|<\/topic\s*>|<title\b[^>]*>([\s\S]*?)<\/title\s*>|<topics\b([^>]*)>|<\/topics\s*>|<notes\b[^>]*>([\s\S]*?)<\/notes\s*>/gi;

export function parseXmind8Xml(xml: string): OutlineNode {
  if (containsUnsafeXmlDoctype(xml)) {
    throw new Error('XMind content.xml 包含 DOCTYPE/ENTITY，出于安全不解析');
  }
  const cleaned = xml.replace(/<!--[\s\S]*?-->/g, '');
  if (!/<xmap-content\b|<sheet\b/i.test(cleaned)) {
    throw new Error('XMind 8 content.xml 结构不符合预期');
  }

  const topLevel: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  let skippedTopicsDepth = 0;

  XMIND8_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = XMIND8_TOKEN_RE.exec(cleaned)) !== null) {
    const full = match[0];

    if (/^<\/topic/i.test(full)) {
      if (skippedTopicsDepth === 0) stack.pop();
      continue;
    }
    if (/^<topics/i.test(full)) {
      const attributes = match[4] ?? '';
      const type = /type\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attributes);
      const typeValue = type ? (type[2] ?? type[3] ?? '') : '';
      if (typeValue && typeValue.toLowerCase() !== 'attached') {
        skippedTopicsDepth += 1;
      }
      continue;
    }
    if (/^<\/topics/i.test(full)) {
      if (skippedTopicsDepth > 0) skippedTopicsDepth -= 1;
      continue;
    }

    if (/^<title/i.test(full)) {
      if (skippedTopicsDepth > 0) continue;
      const owner = stack[stack.length - 1];
      if (owner) owner.text = plainText(match[3] ?? '');
      continue;
    }

    if (/^<notes/i.test(full)) {
      if (skippedTopicsDepth > 0) continue;
      const owner = stack[stack.length - 1];
      const note = plainText(match[5] ?? '');
      if (owner && note) owner.note = note;
      continue;
    }

    // topic 开始标签
    if (skippedTopicsDepth > 0) continue;
    const selfClosing = (match[2] ?? '') === '/';
    const attributes = match[1] ?? '';
    const attrTitle = /title\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attributes);
    const node: OutlineNode = {
      text: attrTitle ? (attrTitle[2] ?? attrTitle[3] ?? '') : '',
      children: [],
    };
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else topLevel.push(node);
    if (!selfClosing) stack.push(node);
  }

  const root = topLevel[0];
  if (!root) {
    throw new Error('XMind 8 文件缺少根 topic');
  }
  return root;
}

async function readXmindOutline(bytes: Uint8Array): Promise<{ root: OutlineNode; info: XmindVariantInfo }> {
  const entries = listZipEntries(bytes);
  if (entries.length === 0) {
    throw new Error('不是有效的 XMind ZIP 容器');
  }
  if (!isZipWithinLimits(entries)) {
    throw new Error('XMind 压缩包超出安全上限（条目数或解压大小）');
  }
  const info = detectXmindVariant(bytes, entries);
  if (info.variant === 'unknown' || !info.entryName) {
    throw new Error('未识别的 XMind 容器（既无 content.json 也无 content.xml）');
  }
  const target = entries.find((entry) => entry.name === info.entryName);
  if (!target) throw new Error(`XMind 容器缺少 ${info.entryName}`);
  const data = await readZipEntryData(bytes, target);
  const text = new TextDecoder('utf-8').decode(data);
  const root = info.variant === 'zen' ? parseZenContent(text) : parseXmind8Xml(text);
  return { root, info };
}

export const xmindAdapter: MindMapAdapter = {
  formatId: 'xmind',
  displayName: 'XMind',
  capabilities: getMindMapFormatEntry('xmind')?.capabilities ?? {
    formatId: 'xmind',
    displayName: 'XMind',
    extensions: ['xmind'],
    read: 'compatible',
    write: 'none',
    knownVersions: ['8', 'zen'],
    reversibleFields: ['topics', 'text'],
    lossyFields: ['style', 'relations', 'summary', 'markers', 'labels', 'notes', 'attachments'],
    unsupportedFeatures: [],
    securityNotes: [],
  },

  /** 文本形态无法承载 XMind 包；提示走二进制导入。 */
  importFromString(): MindMapImportResult {
    return {
      ok: false,
      document: null,
      error: {
        category: 'unsupported-format',
        message: 'XMind 是 ZIP 包格式，需以二进制方式导入',
        code: 'BINARY_REQUIRED',
      },
    };
  },

  async importFromBytes(bytes: Uint8Array): Promise<MindMapImportResult> {
    try {
      const { root, info } = await readXmindOutline(bytes);
      const document = createDocumentFromOutline([root], {
        title: root.text || '导入的 XMind 导图',
        sourceFormat: info.variant === 'zen' ? 'xmind-zen' : 'xmind-8',
        sourceVersion: info.versionLabel,
        rootFromSingleNode: true,
      });
      return {
        ok: true,
        document,
        lossy: [
          '样式、主题、图标与标记不导入',
          '关系线、概要、边界不导入',
          '附件与图片不导入',
        ],
        warnings: [],
      };
    } catch (error) {
      return {
        ok: false,
        document: null,
        error: {
          category: 'corrupt-content',
          message: error instanceof Error ? error.message : 'XMind 读取失败',
        },
      };
    }
  },

  /** XMind 写出未纳入本阶段（write: none）。 */
  exportToString(): MindMapExportResult {
    return {
      ok: false,
      output: '',
      error: {
        category: 'unsupported-format',
        message: 'XMind 导出尚未支持，请另存为 .taumap / Markdown / OPML / FreeMind',
        code: 'EXPORT_UNSUPPORTED',
      },
    };
  },
};