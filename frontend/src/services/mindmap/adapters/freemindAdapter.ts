/**
 * FreeMind / Freeplane (.mm) 适配器（阶段 3）
 *
 * 支持范围：
 * - 导入：`<map><node TEXT="...">` 递归树；节点 LINK、`<richcontent TYPE="NOTE">` 备注；
 * - 导出：同结构，保留文本、层级、顺序、链接与备注；
 * - 安全：拒绝含 DOCTYPE/ENTITY 的输入；不使用外部实体与网络访问。
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
  unescapeXml,
} from '@/services/mindmap/xmlUtils';
import type { MindMapDocument } from '@/types/mindmap';

/** 去掉 HTML 标签并压缩空白（备注内容只保留纯文本）。 */
function stripTagsAndCollapse(html: string): string {
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
 * 单次扫描 FreeMind 结构：
 * - `<node ...>` / `<node ... />` / `</node>` 维护层级；
 * - `<richcontent TYPE="NOTE">` 归属当前栈顶节点。
 *
 * 不依赖 DOMParser，也不解析 DTD/外部实体。
 */
const FREEMIND_TOKEN_RE = /<node\b([^>]*?)(\/?)>|<\/node\s*>|<richcontent\b([^>]*)>([\s\S]*?)<\/richcontent\s*>/gi;

export function parseFreemindOutline(xml: string): OutlineNode | null {
  if (containsUnsafeXmlDoctype(xml)) {
    throw new Error('文件包含 DOCTYPE/ENTITY，出于安全不解析');
  }
  const cleaned = xml.replace(/<!--[\s\S]*?-->/g, '');
  if (!/<map\b/i.test(cleaned)) {
    throw new Error('不是 FreeMind 地图（缺少 <map> 根元素）');
  }

  const topLevel: OutlineNode[] = [];
  const stack: OutlineNode[] = [];

  FREEMIND_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FREEMIND_TOKEN_RE.exec(cleaned)) !== null) {
    const full = match[0];

    if (/^<\/node/i.test(full)) {
      stack.pop();
      continue;
    }

    if (/^<richcontent/i.test(full)) {
      const attributes = match[3] ?? '';
      if (!/TYPE\s*=\s*("NOTE"|'NOTE'|NOTE)/i.test(attributes)) continue;
      const note = stripTagsAndCollapse(match[4] ?? '');
      const owner = stack[stack.length - 1];
      if (owner && note) owner.note = owner.note ? `${owner.note} ${note}` : note;
      continue;
    }

    const attributes = match[1] ?? '';
    const selfClosing = (match[2] ?? '') === '/';
    const text = readXmlAttribute(attributes, 'TEXT') ?? readXmlAttribute(attributes, 'text');
    const node: OutlineNode = {
      text: text === null ? '' : unescapeXml(text),
      children: [],
    };
    const link = readXmlAttribute(attributes, 'LINK') ?? readXmlAttribute(attributes, 'link');
    if (link) node.link = unescapeXml(link);

    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else topLevel.push(node);

    if (!selfClosing) stack.push(node);
  }

  if (stack.length > 0) {
    throw new Error('FreeMind 结构不完整（存在未闭合的 node）');
  }
  return topLevel[0] ?? null;
}

/** 生成 .mm 文本。 */
export function buildFreemind(rootText: string, nodes: OutlineNode[]): string {
  const render = (list: OutlineNode[], indent: number): string => {
    const pad = '  '.repeat(indent);
    let out = '';
    for (const node of list) {
      const attrs = [`TEXT="${escapeXml(node.text)}"`];
      if (node.link) attrs.push(`LINK="${escapeXml(node.link)}"`);
      const hasChildren = node.children.length > 0;
      const hasNote = Boolean(node.note);
      if (!hasChildren && !hasNote) {
        out += `${pad}<node ${attrs.join(' ')} />\n`;
        continue;
      }
      out += `${pad}<node ${attrs.join(' ')}>\n`;
      if (hasNote) {
        out += `${pad}  <richcontent TYPE="NOTE"><html><body><p>${escapeXml(node.note ?? '')}</p></body></html></richcontent>\n`;
      }
      out += render(node.children, indent + 1);
      out += `${pad}</node>\n`;
    }
    return out;
  };

  return [
    '<map version="0.9.1">',
    `  <node TEXT="${escapeXml(rootText || '未命名导图')}">`,
    render(nodes, 1).trimEnd(),
    '  </node>',
    '</map>',
    '',
  ].join('\n');
}

export const freemindAdapter: MindMapAdapter = {
  formatId: 'freemind',
  displayName: 'FreeMind / Freeplane (.mm)',
  capabilities: getMindMapFormatEntry('freemind')?.capabilities ?? {
    formatId: 'freemind',
    displayName: 'FreeMind / Freeplane (.mm)',
    extensions: ['mm'],
    read: 'compatible',
    write: 'compatible',
    knownVersions: ['0.9'],
    reversibleFields: ['text', 'link', 'notes'],
    lossyFields: ['插件属性', '部分布局', '部分样式', '图标', '箭头'],
    unsupportedFeatures: [],
    securityNotes: [],
  },

  importFromString(content: string): MindMapImportResult {
    try {
      const root = parseFreemindOutline(content);
      if (!root) {
        return {
          ok: false,
          document: null,
          error: { category: 'invalid-structure', message: 'FreeMind 文件中没有节点' },
        };
      }
      const document = createDocumentFromOutline([root], {
        title: root.text || '导入的 FreeMind 导图',
        sourceFormat: 'freemind-mm',
        sourceVersion: '0.9',
        rootFromSingleNode: true,
      });
      return {
        ok: true,
        document,
        lossy: ['插件属性、图标与部分样式不导入'],
        warnings: [],
      };
    } catch (error) {
      return {
        ok: false,
        document: null,
        error: {
          category: 'security-policy',
          message: error instanceof Error ? error.message : 'FreeMind 解析失败',
        },
      };
    }
  },

  exportToString(document: MindMapDocument): MindMapExportResult {
    try {
      const outline = documentToOutline(document);
      return {
        ok: true,
        output: buildFreemind(document.title, outline),
        lossy: ['样式、图标与关系线不写入 FreeMind'],
      };
    } catch (error) {
      return {
        ok: false,
        output: '',
        error: {
          category: 'invalid-structure',
          message: error instanceof Error ? error.message : 'FreeMind 导出失败',
        },
      };
    }
  },
};