import { marked } from 'marked';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';

let mermaidInitialized = false;

function ensureMermaid(theme: 'dark' | 'light') {
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: theme === 'dark' ? 'dark' : 'default',
    });
    mermaidInitialized = true;
    return;
  }

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: theme === 'dark' ? 'dark' : 'default',
  });
}

marked.setOptions({
  gfm: true,
  breaks: true,
});

export interface MarkdownTask {
  id: string;
  label: string;
  completed: boolean;
  line: number;
}

export interface MarkdownLink {
  id: string;
  label: string;
  target: string;
  external: boolean;
  line: number;
}

export interface MarkdownContext {
  tasks: MarkdownTask[];
  links: MarkdownLink[];
}

const isExternalMarkdownLink = (target: string) => /^(?:https?:|mailto:|#)/i.test(target);

export function collectMarkdownContext(content: string): MarkdownContext {
  const tasks: MarkdownTask[] = [];
  const links: MarkdownLink[] = [];
  let fence: { marker: '`' | '~'; length: number } | null = null;

  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const marker = fenceMatch?.[1];
      if (
        marker
        && marker[0] === fence.marker
        && marker.length >= fence.length
        && /^\s*(?:`{3,}|~{3,})\s*$/.test(line)
      ) {
        fence = null;
      }
      continue;
    }
    if (fenceMatch?.[1]) {
      fence = { marker: fenceMatch[1][0] as '`' | '~', length: fenceMatch[1].length };
      continue;
    }

    const lineNumber = index + 1;
    const taskMatch = line.match(/^\s*(?:[-+*]|\d+[.)])\s+\[([ xX])\]\s+(.+?)\s*$/);
    if (taskMatch?.[1] !== undefined && taskMatch[2] !== undefined) {
      tasks.push({
        id: `task-${lineNumber}`,
        label: taskMatch[2],
        completed: taskMatch[1].toLowerCase() === 'x',
        line: lineNumber,
      });
    }

    let linkIndex = 0;
    for (const match of line.matchAll(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const label = match[1];
      const target = match[2];
      if (label === undefined || target === undefined) continue;
      linkIndex += 1;
      links.push({
        id: `link-${lineNumber}-${linkIndex}`,
        label,
        target,
        external: isExternalMarkdownLink(target),
        line: lineNumber,
      });
    }
  }

  return { tasks, links };
}

const HTML_BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'base', 'basefont', 'blockquote', 'body', 'caption', 'center',
  'col', 'colgroup', 'dd', 'details', 'dialog', 'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html',
  'iframe', 'legend', 'li', 'link', 'main', 'menu', 'menuitem', 'nav', 'noframes', 'ol', 'optgroup',
  'option', 'p', 'param', 'search', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th',
  'thead', 'title', 'tr', 'track', 'ul', 'pre', 'script', 'style', 'textarea',
]);
const HTML_TYPE_ONE_BLOCK_TAGS = new Set(['pre', 'script', 'style', 'textarea']);

type HtmlBlockState = {
  closingPattern?: RegExp;
  endsOnBlankLine: boolean;
};

const stripMarkdownContainers = (line: string): string => {
  let content = line;
  let didStripPrefix = true;

  while (didStripPrefix) {
    didStripPrefix = false;
    const quotePrefix = content.match(/^ {0,3}>[ \t]?/);
    if (quotePrefix) {
      content = content.slice(quotePrefix[0].length);
      didStripPrefix = true;
      continue;
    }

    const listPrefix = content.match(/^ {0,3}(?:[-+*]|\d{1,9}[.)])(?:[ \t]+|$)/);
    if (listPrefix) {
      content = content.slice(listPrefix[0].length);
      didStripPrefix = true;
    }
  }

  return content;
};

const getHeadingSourceLines = (raw: string): number[] => {
  const headingLines: number[] = [];
  let activeFence: { marker: '`' | '~'; length: number } | null = null;
  let activeHtmlBlock: HtmlBlockState | null = null;
  let isInsideHtmlComment = false;
  let previousTextLine: number | null = null;

  for (const [index, sourceLine] of raw.split(/\r?\n/).entries()) {
    let content = stripMarkdownContainers(sourceLine);
    const sourceLineNumber = index + 1;

    const fenceMatch = content.match(/^ {0,3}(`{3,}|~{3,})/);
    if (activeFence) {
      if (
        fenceMatch
        && fenceMatch[1]![0] === activeFence.marker
        && fenceMatch[1]!.length >= activeFence.length
        && /^ {0,3}(?:`{3,}|~{3,})[ \t]*$/.test(content)
      ) {
        activeFence = null;
      }
      previousTextLine = null;
      continue;
    }

    if (fenceMatch) {
      activeFence = {
        marker: fenceMatch[1]![0] as '`' | '~',
        length: fenceMatch[1]!.length,
      };
      previousTextLine = null;
      continue;
    }

    if (activeHtmlBlock) {
      if (
        activeHtmlBlock.closingPattern?.test(content)
        || (activeHtmlBlock.endsOnBlankLine && /^[ \t]*$/.test(content))
      ) {
        activeHtmlBlock = null;
      }
      previousTextLine = null;
      continue;
    }

    while (isInsideHtmlComment || content.includes('<!--')) {
      const commentStart = isInsideHtmlComment ? 0 : content.indexOf('<!--');
      const commentEnd = content.indexOf('-->', commentStart + (isInsideHtmlComment ? 0 : 4));
      if (commentEnd < 0) {
        content = content.slice(0, commentStart);
        isInsideHtmlComment = true;
        break;
      }
      content = content.slice(0, commentStart) + content.slice(commentEnd + 3);
      isInsideHtmlComment = false;
    }

    if (/^<!\[CDATA\[/.test(content)) {
      if (!/\]\]>/.test(content)) {
        activeHtmlBlock = { closingPattern: /\]\]>/, endsOnBlankLine: false };
      }
      previousTextLine = null;
      continue;
    }

    if (/^<\?/.test(content)) {
      if (!/\?>/.test(content)) {
        activeHtmlBlock = { closingPattern: /\?>/, endsOnBlankLine: false };
      }
      previousTextLine = null;
      continue;
    }

    if (/^<![A-Z]/i.test(content)) {
      if (!/>/.test(content)) {
        activeHtmlBlock = { closingPattern: />/, endsOnBlankLine: false };
      }
      previousTextLine = null;
      continue;
    }

    const htmlBlockMatch = content.match(/^ {0,3}<([A-Za-z][\w-]*)\b[^>]*>/);
    if (htmlBlockMatch && HTML_BLOCK_TAGS.has(htmlBlockMatch[1]!.toLowerCase())) {
      const tagName = htmlBlockMatch[1]!.toLowerCase();
      const closingPattern = new RegExp(`</${tagName}\\s*>`, 'i');
      if (!closingPattern.test(content)) {
        activeHtmlBlock = {
          closingPattern: HTML_TYPE_ONE_BLOCK_TAGS.has(tagName) ? closingPattern : undefined,
          endsOnBlankLine: !HTML_TYPE_ONE_BLOCK_TAGS.has(tagName),
        };
      }
      previousTextLine = null;
      continue;
    }

    if (/^ {0,3}#{1,6}(?:[ \t]+|$)/.test(content)) {
      headingLines.push(sourceLineNumber);
      previousTextLine = null;
      continue;
    }

    if (
      previousTextLine !== null
      && /^ {0,3}(?:=+|-+)[ \t]*$/.test(content)
    ) {
      headingLines.push(previousTextLine);
      previousTextLine = null;
      continue;
    }

    previousTextLine = /^[ \t]*$/.test(content) ? null : sourceLineNumber;
  }

  return headingLines;
};

export function renderMarkdown(raw: string): string {
  const headingSourceLines = getHeadingSourceLines(raw);
  let headingIndex = 0;
  const renderer = new marked.Renderer();
  const renderHeading = renderer.heading.bind(renderer);

  renderer.heading = ((...args: Parameters<typeof renderer.heading>) => {
    const sourceLine = headingSourceLines[headingIndex];
    headingIndex += 1;
    const rendered = renderHeading(...args);
    return sourceLine === undefined
      ? rendered
      : rendered.replace(/^<h([1-6])/, `<h$1 data-source-line="${sourceLine}"`);
  }) as typeof renderer.heading;

  const parsed = marked.parse(raw, { renderer }) as string;
  return DOMPurify.sanitize(parsed);
}

const escapeHtmlText = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export function createStandaloneHtml(markdown: string, title: string): string {
  const safeTitle = escapeHtmlText(title || 'Tau Editor Export');
  const body = renderMarkdown(markdown);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>body{max-width:860px;margin:48px auto;padding:0 24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.7;color:#1f2937}pre{overflow:auto;padding:16px;background:#f3f4f6;border-radius:8px}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}img{max-width:100%;height:auto}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export async function renderMermaidDiagrams(
  container: HTMLElement,
  theme: 'dark' | 'light',
): Promise<void> {
  ensureMermaid(theme);
  const codeBlocks = Array.from(
    container.querySelectorAll('pre code.language-mermaid'),
  );

  for (const [i, block] of codeBlocks.entries()) {
    const source = block.textContent ?? '';
    const wrapper = block.closest('pre');
    if (!wrapper) continue;

    try {
      const id = `mermaid-${Date.now()}-${i}`;
      const rendered = await mermaid.render(id, source);
      const output = document.createElement('div');
      output.className = 'markdown-mermaid-diagram';
      output.innerHTML = rendered.svg;
      wrapper.replaceWith(output);
    } catch (error: any) {
      const failure = document.createElement('div');
      failure.className = 'markdown-mermaid-error';
      failure.textContent = `Mermaid 渲染失败: ${error?.message ?? '未知错误'}`;
      wrapper.replaceWith(failure);
    }
  }
}
