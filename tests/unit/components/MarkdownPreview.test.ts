import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import MarkdownPreview from '@/components/editor/MarkdownPreview.vue';

vi.mock('@/services/markdownService', () => ({
  renderMarkdown: (raw: string) => `<p>${raw}</p>`,
  renderMermaidDiagrams: vi.fn(async () => undefined),
}));

describe('MarkdownPreview', () => {
  it('应渲染 markdown 内容', async () => {
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: 'hello',
        theme: 'dark',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 180));
    expect(wrapper.find('[data-testid="markdown-preview"]').html()).toContain('<p>hello</p>');
  });
});
