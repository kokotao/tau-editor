/**
 * Markdown 渲染服务（v0.4.0）
 *
 * 这个模块承载 marked / DOMPurify / mermaid 三个重依赖，只允许被动态 import：
 * - MarkdownPreview 组件挂载后才加载；
 * - 导出独立 HTML 时才加载。
 *
 * 这样入口 chunk 不再包含渲染库，首屏只承担编辑器与工作区逻辑。
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
import { getHeadingSourceLines } from '@/services/markdownService';

let mermaidInitialized = false;

/**
 * Mermaid 支持的常见 fenced code language 标识。
 *
 * Markdown 编辑器通常把围栏信息直接编码为 `language-${info}` class，
 * 因此这里使用白名单而不是模糊匹配，避免把 `language-mermaid-js` 等普通
 * 代码块误交给 Mermaid。
 */
export const MERMAID_FENCE_LANGUAGES = new Set([
  'mermaid',
  'graph',
  'flowchart',
  'flowchart-v2',
  'flowchart-elk',
  'sequence',
  'sequenceDiagram',
  'class',
  'classDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'state',
  'er',
  'erDiagram',
  'gantt',
  'pie',
  'journey',
  'gitGraph',
  'mindmap',
  'timeline',
  'quadrantChart',
  'xychart',
  'xychart-beta',
  'block-beta',
  'block',
  'sankey-beta',
  'sankey',
  'packet-beta',
  'packet',
  'kanban',
  'architecture-beta',
  'architecture',
  'requirementDiagram',
  'requirement',
  'C4Context',
  'c4',
  'zenuml',
  'radar',
  'radar-beta',
  'ishikawa',
  'treemap',
  'venn',
  'venn-beta',
]);

const MERMAID_FENCE_LANGUAGES_NORMALIZED = new Set(
  Array.from(MERMAID_FENCE_LANGUAGES, (language) => language.toLowerCase()),
);

const isMermaidCodeBlock = (code: Element): boolean => {
  for (const className of Array.from(code.classList)) {
    if (!className.startsWith('language-')) {
      continue;
    }

    const language = className.slice('language-'.length);
    if (MERMAID_FENCE_LANGUAGES_NORMALIZED.has(language.toLowerCase())) {
      return true;
    }
  }
  return false;
};

function ensureMermaid(theme: 'dark' | 'light') {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: theme === 'dark' ? 'dark' : 'default',
  });
  mermaidInitialized = true;
}

marked.setOptions({
  gfm: true,
  breaks: true,
});

const IMAGE_ATTRIBUTE_PATTERN = /\{\s*((?:width|height)\s*=\s*[^\s}]+)\s*((?:width|height)\s*=\s*[^\s}]+)?\s*\}$/i;

const sanitizeImageDimension = (value: string): string | null =>
  /^\d+(?:\.\d+)?(?:px|%|em|rem|vw|vh)?$/i.test(value) ? value : null;

const enhanceImageDimensions = (html: string): string => html.replace(
  /<img\b([^>]*?)>/gi,
  (full, attributes: string) => {
    const altMatch = attributes.match(/\salt="([^"]*)"/i);
    const alt = altMatch?.[1] ?? '';
    const marker = alt.match(IMAGE_ATTRIBUTE_PATTERN);
    if (!marker) return full;

    const dimensions = [marker[1], marker[2]].filter((part): part is string => Boolean(part)).map((part) => {
      const [key, value] = part.split('=').map((item) => item.trim());
      return [(key ?? '').toLowerCase(), value ?? ''] as const;
    });
    const width = sanitizeImageDimension(dimensions.find(([key]) => key === 'width')?.[1] ?? '');
    const height = sanitizeImageDimension(dimensions.find(([key]) => key === 'height')?.[1] ?? '');
    const cleanAlt = alt.replace(IMAGE_ATTRIBUTE_PATTERN, '').trim().replace(/"/g, '&quot;');
    let nextAttributes = altMatch ? attributes.replace(altMatch[0], ` alt="${cleanAlt}"`) : attributes;
    const styles = [width ? `width:${width}` : '', height ? `height:${height}` : ''].filter(Boolean);
    if (styles.length > 0) {
      nextAttributes += ` style="max-width:100%;${styles.join(';')};"`;
    }
    return `<img${nextAttributes}>`;
  },
);

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
  return enhanceImageDimensions(DOMPurify.sanitize(parsed));
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
  const codeBlocks = Array.from(
    container.querySelectorAll('pre code'),
  ).filter(isMermaidCodeBlock);
  if (codeBlocks.length === 0) {
    return;
  }

  if (!mermaidInitialized || container.dataset.mermaidTheme !== theme) {
    ensureMermaid(theme);
    container.dataset.mermaidTheme = theme;
  }

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
