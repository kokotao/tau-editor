import { describe, expect, it } from 'vitest';
import { renderMarkdown, renderMermaidDiagrams } from '@/services/markdownService';

describe('markdownService', () => {
  it('应渲染 markdown 标题', () => {
    const html = renderMarkdown('# Hello');
    expect(html).toContain('<h1>Hello</h1>');
  });

  it('应清洗危险脚本', () => {
    const html = renderMarkdown('x<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
  });

  it('无 mermaid 代码块时应安全返回', async () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>plain</p>';
    await expect(renderMermaidDiagrams(container, 'dark')).resolves.toBeUndefined();
  });
});
