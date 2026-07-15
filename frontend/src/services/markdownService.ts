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
