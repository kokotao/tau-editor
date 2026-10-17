import { describe, expect, it } from 'vitest';
import {
  applyMermaidNodeBackground,
  createStandaloneHtml,
  renderMarkdown,
  renderMermaidDiagrams,
  resolveMermaidTheme,
  resolveMermaidThemeConfig,
  restoreMermaidSourceBlocks,
} from '@/services/markdownRenderService';
import {
  getMarkdownCodeFences,
  replaceMarkdownCodeFenceLanguage,
} from '@/services/markdownService';

describe('markdownService', () => {
  it('应渲染 markdown 标题', () => {
    const html = renderMarkdown('# Hello');
    expect(html).toContain('<h1 data-source-line="1">Hello</h1>');
  });

  it('应保留本地文件链接地址供预览层解析', () => {
    const html = renderMarkdown('[serialization.md](file:///workspace/docs/serialization.md)');
    expect(html).toContain('href="file:///workspace/docs/serialization.md"');
  });

  it('应为标题保留稳定的源文件行号，并跳过围栏代码中的伪标题', () => {
    const html = renderMarkdown([
      '# 重复标题',
      '',
      '```markdown',
      '# 重复标题',
      '```',
      '',
      '# 重复标题',
    ].join('\n'));

    expect(html).toContain('<h1 data-source-line="1">重复标题</h1>');
    expect(html).toContain('<h1 data-source-line="7">重复标题</h1>');
    expect(html).not.toContain('data-source-line="4"');
  });

  it('围栏关闭行带非空内容时不应提前结束代码块映射', () => {
    const html = renderMarkdown([
      '```markdown',
      '# 代码内标题',
      '```not-a-close',
      '# 仍在代码块内',
      '```',
      '',
      '# 正文标题',
    ].join('\n'));

    expect(html).toContain('<h1 data-source-line="7">正文标题</h1>');
    expect(html).not.toContain('data-source-line="2"');
    expect(html).not.toContain('data-source-line="4"');
  });

  it('应忽略 HTML comment 内的重复伪标题', () => {
    const html = renderMarkdown([
      '<!--',
      '# 重复标题',
      '-->',
      '# 重复标题',
    ].join('\n'));

    expect(html).toContain('<h1 data-source-line="4">重复标题</h1>');
    expect(html).not.toContain('data-source-line="2"');
  });

  it('应忽略 HTML block 内的伪标题', () => {
    const html = renderMarkdown([
      '<div>',
      '# 重复标题',
      '</div>',
      '',
      '# 重复标题',
    ].join('\n'));

    expect(html).toContain('<h1 data-source-line="5">重复标题</h1>');
    expect(html).not.toContain('data-source-line="2"');
  });

  it('type-6 HTML block 在 closing tag 后仍应持续到空行', () => {
    const html = renderMarkdown([
      '<div>',
      '# fake',
      '</div>',
      '# still fake',
      '',
      '# real',
    ].join('\n'));

    expect(html).toContain('<h1 data-source-line="6">real</h1>');
    expect(html).not.toContain('data-source-line="2"');
    expect(html).not.toContain('data-source-line="4"');
  });

  it('应为引用、列表与 Setext 标题保留其原始行号', () => {
    const html = renderMarkdown([
      '> # 引用标题',
      '- # 列表标题',
      '',
      'Setext 标题',
      '============',
    ].join('\n'));

    expect(html).toContain('<h1 data-source-line="1">引用标题</h1>');
    expect(html).toContain('<h1 data-source-line="2">列表标题</h1>');
    expect(html).toContain('<h1 data-source-line="4">Setext 标题</h1>');
  });

  it('script HTML block 不应因空行提前结束并映射内部伪标题', () => {
    const html = renderMarkdown([
      '<script>',
      '# 伪标题一',
      '',
      '# 伪标题二',
      '</script>',
      '',
      '# 正文标题',
    ].join('\n'));

    expect(html).not.toContain('data-source-line="2"');
    expect(html).not.toContain('data-source-line="4"');
  });

  it('CDATA HTML block 不应映射内部伪标题', () => {
    const html = renderMarkdown([
      '<![CDATA[',
      '# 伪标题',
      ']]>',
      '',
      '# 正文标题',
    ].join('\n'));

    expect(html).toContain('<h1 data-source-line="5">正文标题</h1>');
    expect(html).not.toContain('data-source-line="2"');
  });

  it('应清洗危险脚本', () => {
    const html = renderMarkdown('x<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
  });

  it('应只在最新 Markdown 内容中修改匹配的代码围栏语言', () => {
    const source = '```js\nsame()\n```\n\n```js\nsame()\n```';
    expect(getMarkdownCodeFences(source)).toHaveLength(2);

    expect(replaceMarkdownCodeFenceLanguage(
      source,
      1,
      { language: 'js', code: 'same()' },
      'python',
    )).toBe('```js\nsame()\n```\n\n```python\nsame()\n```');

    expect(replaceMarkdownCodeFenceLanguage(
      '```\nplain text\n```',
      0,
      { language: '', code: 'plain text' },
      'typescript',
    )).toBe('```typescript\nplain text\n```');

    const changedTarget = `${source.slice(0, source.lastIndexOf('same()'))}edited()${source.slice(source.lastIndexOf('same()') + 'same()'.length)}`;
    expect(replaceMarkdownCodeFenceLanguage(
      changedTarget,
      1,
      { language: 'js', code: 'same()' },
      'python',
    )).toBeNull();
  });

  it('无 mermaid 代码块时应安全返回', async () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>plain</p>';
    await expect(renderMermaidDiagrams(container, 'dark')).resolves.toBeUndefined();
  });

  it('应按预览明暗解析 Mermaid 主题，并支持独立覆盖节点背景色', () => {
    expect(resolveMermaidTheme('dark', 'auto')).toBe('dark');
    expect(resolveMermaidTheme('light', 'auto')).toBe('default');
    expect(resolveMermaidTheme('light', 'forest')).toBe('forest');

    const diagram = document.createElement('div');
    diagram.innerHTML = '<svg><g class="node"><rect width="10" height="10" /></g></svg>';
    applyMermaidNodeBackground(diagram, '#abc');

    expect(diagram.querySelector<SVGRectElement>('.node rect')?.style.getPropertyValue('fill'))
      .toBe('#aabbcc');
  });

  it('跟随预览主题时应使用对应 Mermaid palette，并支持内置彩色预设', () => {
    const ocean = resolveMermaidThemeConfig('dark', 'auto', 'deep-ocean');
    expect(ocean.theme).toBe('base');
    expect(ocean.themeVariables?.primaryColor).toBe('#1f5b77');
    expect(ocean.themeVariables?.primaryBorderColor).toBe('#4bb8d8');

    const aurora = resolveMermaidThemeConfig('light', 'aurora');
    expect(aurora.theme).toBe('base');
    expect(aurora.themeVariables?.primaryBorderColor).toBe('#0f9d8a');
  });

  it('重新渲染时应将已渲染的 Mermaid 图恢复成单个源代码块', () => {
    const container = document.createElement('div');
    container.innerHTML = [
      '<div class="markdown-mermaid-viewer">',
      '<div class="markdown-mermaid-canvas" style="height: 240px"><svg></svg></div>',
      '<pre class="markdown-mermaid-source" data-mermaid-view="code" hidden>',
      '<code class="language-mermaid">graph TD\nA-->B</code>',
      '</pre>',
      '</div>',
    ].join('');

    restoreMermaidSourceBlocks(container);

    expect(container.querySelectorAll('.markdown-mermaid-viewer')).toHaveLength(0);
    expect(container.querySelectorAll('pre code.language-mermaid')).toHaveLength(1);
    expect(container.querySelector('pre code')?.textContent).toBe('graph TD\nA-->B');
    expect(container.querySelector('pre')?.hidden).toBe(false);
    expect(container.querySelector('pre')?.dataset.mermaidCanvasHeight).toBe('240');
  });

  it('导出独立 HTML 时应包含净化后的正文与标题', () => {
    const html = createStandaloneHtml('# Release', 'Release Notes');

    expect(html).toContain('<title>Release Notes</title>');
    expect(html).toContain('<h1 data-source-line="1">Release</h1>');
    expect(html).not.toContain('<script>');
  });
});
