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

export function renderMarkdown(raw: string): string {
  const parsed = marked.parse(raw) as string;
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
