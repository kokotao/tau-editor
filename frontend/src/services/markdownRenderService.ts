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
  const codeBlocks = Array.from(
    container.querySelectorAll('pre code.language-mermaid'),
  );
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
