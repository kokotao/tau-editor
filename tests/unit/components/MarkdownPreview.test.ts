import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import MarkdownPreview from '@/components/editor/MarkdownPreview.vue';
import { renderMarkdown, renderMermaidDiagrams } from '@/services/markdownService';

vi.mock('@/services/markdownService', () => ({
  renderMarkdown: vi.fn((raw: string) => `<p>${raw}</p>`),
  renderMermaidDiagrams: vi.fn(async () => undefined),
}));

const renderMarkdownMock = vi.mocked(renderMarkdown);
const renderMermaidMock = vi.mocked(renderMermaidDiagrams);

const flushRender = async () => {
  await vi.advanceTimersByTimeAsync(180);
  await flushPromises();
};

const menuSelector = '[data-testid="markdown-preview-context-menu"]';

const openContextMenu = async (
  wrapper: ReturnType<typeof mount>,
  targetSelector = '[data-testid="markdown-preview"]',
  clientX = 120,
  clientY = 240,
) => {
  await wrapper.find(targetSelector).trigger('contextmenu', { clientX, clientY });
  await flushPromises();
};

const mockClipboard = () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  return writeText;
};

const mockSelection = (text: string, anchorNode: Node) => {
  const selection = {
    toString: () => text,
    anchorNode,
    focusNode: anchorNode,
  } as Selection;
  Object.defineProperty(window, 'getSelection', {
    value: () => selection,
    configurable: true,
  });
};

describe('MarkdownPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    renderMarkdownMock.mockImplementation((raw: string) => `<p>${raw}</p>`);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('应使用假定时器渲染 markdown 内容', async () => {
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: 'hello',
        theme: 'dark',
      },
    });

    await flushRender();

    expect(renderMarkdownMock).toHaveBeenCalledWith('hello');
    expect(renderMermaidMock).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="markdown-preview"]').html()).toContain('<p>hello</p>');
  });

  it('右键空白处应打开菜单并定位', async () => {
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: 'menu',
        theme: 'dark',
      },
    });

    await flushRender();
    await openContextMenu(wrapper);

    const menu = wrapper.find(menuSelector);
    expect(menu.exists()).toBe(true);
    const style = menu.attributes('style');
    expect(style).toContain('top: 240px');
    expect(style).toContain('left: 120px');
  });

  it('点击外部或按下 Escape 应关闭菜单', async () => {
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: 'close',
        theme: 'dark',
      },
    });

    await flushRender();
    await openContextMenu(wrapper);
    expect(wrapper.find(menuSelector).exists()).toBe(true);

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushPromises();
    expect(wrapper.find(menuSelector).exists()).toBe(false);

    await openContextMenu(wrapper);
    expect(wrapper.find(menuSelector).exists()).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find(menuSelector).exists()).toBe(false);
  });

  it('文本选区应显示复制选中文本并可执行', async () => {
    renderMarkdownMock.mockReturnValue('<p id="selection-target">Selection target</p>');
    const clipboard = mockClipboard();
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: 'selection',
        theme: 'dark',
      },
    });

    await flushRender();
    const textNode = wrapper.find('#selection-target').element.firstChild as Node;
    mockSelection('selected text', textNode);
    await openContextMenu(wrapper, '#selection-target', 60, 70);

    const copySelection = wrapper.find('[data-testid="preview-menu-copy-selection"]');
    expect(copySelection.exists()).toBe(true);
    await copySelection.trigger('click');
    await flushPromises();

    expect(clipboard).toHaveBeenCalledWith('selected text');
    expect(wrapper.find(menuSelector).exists()).toBe(false);
  });

  it('链接上下文应展示链接菜单并执行复制', async () => {
    renderMarkdownMock.mockReturnValue('<p><a href="https://example.com">Example</a></p>');
    const clipboard = mockClipboard();
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: 'link',
        theme: 'dark',
      },
    });

    await flushRender();
    await openContextMenu(wrapper, 'a', 100, 200);

    const copyLink = wrapper.find('[data-testid="preview-menu-copy-link"]');
    expect(copyLink.exists()).toBe(true);
    await copyLink.trigger('click');
    await flushPromises();

    expect(clipboard).toHaveBeenCalledWith('https://example.com/');
    expect(wrapper.find(menuSelector).exists()).toBe(false);
  });

  it('图片上下文应展示图片菜单并执行复制', async () => {
    renderMarkdownMock.mockReturnValue('<p><img src="https://example.com/a.png" alt="hero" /></p>');
    const clipboard = mockClipboard();
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: 'image',
        theme: 'dark',
      },
    });

    await flushRender();
    await openContextMenu(wrapper, 'img', 110, 210);

    const copyImage = wrapper.find('[data-testid="preview-menu-copy-image-src"]');
    expect(copyImage.exists()).toBe(true);
    await copyImage.trigger('click');
    await flushPromises();

    expect(clipboard).toHaveBeenCalledWith('https://example.com/a.png');
    expect(wrapper.find(menuSelector).exists()).toBe(false);
  });

  it('点击预览模式菜单项应发射模式切换事件', async () => {
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: 'mode',
        theme: 'dark',
      },
    });

    await flushRender();
    await openContextMenu(wrapper);

    const previewMode = wrapper.find('[data-testid="preview-menu-set-preview-mode-preview"]');
    expect(previewMode.exists()).toBe(true);
    await previewMode.trigger('click');

    expect(wrapper.emitted('request-preview-mode-change')).toEqual([['preview']]);
  });
});
