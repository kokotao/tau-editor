/**
 * Markdown 大纲适配器（阶段 3）
 *
 * 支持范围（收敛，不追求完整 Markdown 解析）：
 * - 标题 `#`~`######` 与无序/有序列表 `-` `*` `+` `1.`；
 * - 列表按缩进嵌套；标题定义层级基准；
 * - 跳过围栏代码块内容，不执行 HTML，不执行链接内容；
 * - 行内强调/链接/图片/行内代码只保留纯文本。
 *
 * 导出：一级为标题，其余为缩进列表；保留文本、层级与顺序，链接可保留为 Markdown 链接。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */

import {
  countOutlineNodes,
  createDocumentFromOutline,
  documentToOutline,
  outlineDepth,
  type OutlineNode,
} from '@/services/mindmap/outlineDocument';
import { getMindMapFormatEntry } from '@/services/mindmap/formatRegistry';
import type {
  MindMapAdapter,
  MindMapExportResult,
  MindMapImportResult,
} from '@/services/mindmap/mindmapAdapter';
import type { MindMapDocument } from '@/types/mindmap';

interface ParsedLine {
  depth: number;
  text: string;
}

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

/** 去掉行内 Markdown 语法，保留纯文本；不执行任何 HTML。 */
export function stripInlineMarkdown(text: string): string {
  return String(text ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .trim();
}

/**
 * 把 Markdown 解析成线性行（含计算好的深度）。
 * 深度：标题 Hn → n；列表项 → 当前标题深度 + 1 + 缩进层级。
 */
export function parseMarkdownOutlineLines(markdown: string): ParsedLine[] {
  const lines = String(markdown ?? '').split(/\r?\n/);
  const result: ParsedLine[] = [];
  let headingDepth = 0;
  let inFence = false;

  for (const line of lines) {
    const fence = line.trim().match(/^(```|~~~)/);
    if (fence) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!line.trim()) continue;

    const heading = line.match(HEADING_RE);
    if (heading) {
      const level = (heading[1] ?? '#').length;
      const text = stripInlineMarkdown(heading[2] ?? '');
      headingDepth = level;
      if (text) result.push({ depth: level, text });
      continue;
    }

    const listItem = line.match(LIST_RE);
    if (listItem) {
      const indent = (listItem[1] ?? '').replace(/\t/g, '    ').length;
      const indentLevel = Math.floor(indent / 2);
      const text = stripInlineMarkdown(listItem[3] ?? '');
      if (!text) continue;
      result.push({ depth: headingDepth + 1 + indentLevel, text });
      continue;
    }

    // 普通段落：作为当前层级的节点（只在已进入大纲结构后接收，避免把前言当节点）
    if (headingDepth > 0 || result.length > 0) {
      const text = stripInlineMarkdown(line);
      if (text) result.push({ depth: headingDepth + 1, text });
    }
  }

  return result;
}

/** 线性行 → 大纲树（按深度栈构建）。 */
export function linesToOutline(lines: ParsedLine[]): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: Array<{ depth: number; node: OutlineNode }> = [];

  for (const line of lines) {
    const node: OutlineNode = { text: line.text, children: [] };
    while (stack.length > 0 && (stack[stack.length - 1] as { depth: number }).depth >= line.depth) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) parent.node.children.push(node);
    else roots.push(node);
    stack.push({ depth: line.depth, node });
  }
  return roots;
}

export function markdownToOutline(markdown: string): OutlineNode[] {
  return linesToOutline(parseMarkdownOutlineLines(markdown));
}

/** 大纲 → Markdown：一级标题 + 缩进列表。 */
export function outlineToMarkdown(rootText: string, nodes: OutlineNode[]): string {
  const lines: string[] = [`# ${rootText || '未命名导图'}`, ''];
  const walk = (list: OutlineNode[], depth: number) => {
    for (const node of list) {
      const indent = '  '.repeat(Math.max(0, depth));
      const text = String(node.text ?? '').replace(/\s*\r?\n\s*/g, ' ').trim();
      const label = node.link ? `[${text}](${node.link})` : text;
      lines.push(`${indent}- ${label}`);
      walk(node.children, depth + 1);
    }
  };
  walk(nodes, 1);
  return `${lines.join('\n')}\n`;
}

export const markdownAdapter: MindMapAdapter = {
  formatId: 'markdown',
  displayName: 'Markdown 大纲',
  capabilities: getMindMapFormatEntry('markdown')?.capabilities ?? {
    formatId: 'markdown',
    displayName: 'Markdown 大纲',
    extensions: ['md', 'markdown'],
    read: 'compatible',
    write: 'compatible',
    knownVersions: [],
    reversibleFields: ['text', 'hierarchy', 'order'],
    lossyFields: ['样式', '链接内容', 'HTML', '代码块语义'],
    unsupportedFeatures: [],
    securityNotes: [],
  },

  importFromString(content: string): MindMapImportResult {
    try {
      const outline = markdownToOutline(content);
      if (outline.length === 0) {
        return {
          ok: false,
          document: null,
          error: { category: 'invalid-structure', message: 'Markdown 中没有可识别的标题或列表结构' },
        };
      }
      const document = createDocumentFromOutline(outline, {
        title: '导入的 Markdown 大纲',
        sourceFormat: 'markdown-outline',
        rootFromSingleNode: true,
      });
      return {
        ok: true,
        document,
        lossy: ['行内样式（粗体/斜体/代码）已丢弃', 'HTML 与链接目标不作为内容执行'],
        warnings: [],
      };
    } catch (error) {
      return {
        ok: false,
        document: null,
        error: {
          category: 'invalid-structure',
          message: error instanceof Error ? error.message : 'Markdown 解析失败',
        },
      };
    }
  },

  exportToString(document: MindMapDocument): MindMapExportResult {
    try {
      const outline = documentToOutline(document);
      const text = outlineToMarkdown(document.title, outline);
      return {
        ok: true,
        output: text,
        lossy: ['节点备注与标记不写入 Markdown', '关系线不写入 Markdown'],
      };
    } catch (error) {
      return {
        ok: false,
        output: '',
        error: {
          category: 'invalid-structure',
          message: error instanceof Error ? error.message : 'Markdown 导出失败',
        },
      };
    }
  },
};

/** 供导入预览展示节点数与深度信息。 */
export function describeMarkdownOutline(content: string): { nodes: number; depth: number } {
  const outline = markdownToOutline(content);
  return { nodes: countOutlineNodes(outline), depth: outlineDepth(outline) };
}