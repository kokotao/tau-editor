import { describe, expect, it } from 'vitest';
import { renderMarkdown, renderMermaidDiagrams } from '@/services/markdownService';

describe('markdownService', () => {
  it('应渲染 markdown 标题', () => {
    const html = renderMarkdown('# Hello');
    expect(html).toContain('<h1 data-source-line="1">Hello</h1>');
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

  it('无 mermaid 代码块时应安全返回', async () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>plain</p>';
    await expect(renderMermaidDiagrams(container, 'dark')).resolves.toBeUndefined();
  });
});
