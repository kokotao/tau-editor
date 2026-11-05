/**
 * OPML 大纲适配器（阶段 3）
 *
 * 支持范围：
 * - 读取 `<opml><body><outline text="...">` 的层级结构，属性 text/_note/note/_link/url；
 * - 导出 `<outline>` 层级，保留文本、层级、顺序与链接；
 * - 安全：拒绝含 DOCTYPE/ENTITY 的输入（不解析外部实体），不执行任何链接内容。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */

import {
  createDocumentFromOutline,
  documentToOutline,
  type OutlineNode,
} from '@/services/mindmap/outlineDocument';
import { getMindMapFormatEntry } from '@/services/mindmap/formatRegistry';
import type {
  MindMapAdapter,
  MindMapExportResult,
  MindMapImportResult,
} from '@/services/mindmap/mindmapAdapter';
import {
  containsUnsafeXmlDoctype,
  escapeXml,
  readXmlAttribute,
  stripXmlComments,
  unescapeXml,
} from '@/services/mindmap/xmlUtils';
import type { MindMapDocument } from '@/types/mindmap';

/** 单次扫描：既匹配开始标签（含自闭合），也匹配结束标签。 */
const OUTLINE_TAG_RE = /<outline\b([^>]*?)(\/?)>|<\/outline\s*>/gi;

/**
 * 解析 OPML 的 outline 树。
 * @throws Error 当 XML 不安全时。
 */
export function parseOpmlOutline(xml: string): OutlineNode[] {
  if (containsUnsafeXmlDoctype(xml)) {
    throw new Error('OPML 包含 DOCTYPE/ENTITY，出于安全不解析');
  }
  const cleaned = stripXmlComments(xml);
  const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? (bodyMatch[1] ?? '') : cleaned;

  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];

  OUTLINE_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = OUTLINE_TAG_RE.exec(body)) !== null) {
    const full = match[0];
    if (/^<\/outline/i.test(full)) {
      stack.pop();
      continue;
    }

    const attributes = match[1] ?? '';
    const selfClosing = (match[2] ?? '') === '/';
    const rawText = readXmlAttribute(attributes, 'text');
    const node: OutlineNode = {
      text: rawText === null ? '' : unescapeXml(rawText),
      children: [],
    };
    const link = readXmlAttribute(attributes, '_link') ?? readXmlAttribute(attributes, 'url');
    if (link) node.link = unescapeXml(link);
    const note = readXmlAttribute(attributes, '_note') ?? readXmlAttribute(attributes, 'note');
    if (note) node.note = unescapeXml(note);

    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else roots.push(node);

    if (!selfClosing) stack.push(node);
  }

  if (stack.length > 0) {
    throw new Error('OPML 结构不完整（存在未闭合的 outline）');
  }
  return roots;
}

/** 生成 OPML 文本。 */
export function buildOpml(rootText: string, nodes: OutlineNode[]): string {
  const render = (list: OutlineNode[], indent: number): string => {
    const pad = '  '.repeat(indent);
    let out = '';
    for (const node of list) {
      const attrs = [`text="${escapeXml(node.text)}"`];
      if (node.link) attrs.push(`_link="${escapeXml(node.link)}"`);
      if (node.note) attrs.push(`_note="${escapeXml(node.note)}"`);
      if (node.children.length === 0) {
        out += `${pad}<outline ${attrs.join(' ')} />\n`;
      } else {
        out += `${pad}<outline ${attrs.join(' ')}>\n`;
        out += render(node.children, indent + 1);
        out += `${pad}</outline>\n`;
      }
    }
    return out;
  };

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    `    <title>${escapeXml(rootText || '未命名导图')}</title>`,
    '  </head>',
    '  <body>',
    render(nodes, 2).trimEnd(),
    '  </body>',
    '</opml>',
    '',
  ].join('\n');
}

export const opmlAdapter: MindMapAdapter = {
  formatId: 'opml',
  displayName: 'OPML 大纲',
  capabilities: getMindMapFormatEntry('opml')?.capabilities ?? {
    formatId: 'opml',
    displayName: 'OPML 大纲',
    extensions: ['opml'],
    read: 'compatible',
    write: 'compatible',
    knownVersions: ['2.0'],
    reversibleFields: ['text', 'hierarchy', 'order', 'link'],
    lossyFields: ['备注/属性', '样式', '扩展属性'],
    unsupportedFeatures: [],
    securityNotes: [],
  },

  importFromString(content: string): MindMapImportResult {
    try {
      const outline = parseOpmlOutline(content);
      if (outline.length === 0) {
        return {
          ok: false,
          document: null,
          error: { category: 'invalid-structure', message: 'OPML 中没有 outline 节点' },
        };
      }
      const document = createDocumentFromOutline(outline, {
        title: '导入的 OPML 大纲',
        sourceFormat: 'opml',
        sourceVersion: '2.0',
      });
      return { ok: true, document, lossy: ['样式与扩展属性不导入'], warnings: [] };
    } catch (error) {
      return {
        ok: false,
        document: null,
        error: {
          category: 'security-policy',
          message: error instanceof Error ? error.message : 'OPML 解析失败',
        },
      };
    }
  },

  exportToString(document: MindMapDocument): MindMapExportResult {
    try {
      const outline = documentToOutline(document);
      return {
        ok: true,
        output: buildOpml(document.title, outline),
        lossy: ['节点样式与标记不写入 OPML', '关系线不写入 OPML'],
      };
    } catch (error) {
      return {
        ok: false,
        output: '',
        error: {
          category: 'invalid-structure',
          message: error instanceof Error ? error.message : 'OPML 导出失败',
        },
      };
    }
  },
};