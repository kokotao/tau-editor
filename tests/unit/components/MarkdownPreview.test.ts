import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { useSettingsStore } from '@/stores/settings';
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
const queryBody = (selector: string) => document.body.querySelector(selector) as HTMLElement | null;
const getMenuElement = () => document.body.querySelector(menuSelector) as HTMLElement | null;
const getMenuStyle = () => getMenuElement()?.getAttribute('style') ?? '';

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
    document.body.innerHTML = '';
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
      attachTo: document.body,
      props: {
        content: 'menu',
        theme: 'dark',
      },
    });

    await flushRender();
    await openContextMenu(wrapper);

    expect(getMenuElement()).not.toBeNull();
    const style = getMenuStyle();
    expect(style).toContain('top: 240px');
    expect(style).toContain('left: 120px');
    wrapper.unmount();
  });

  it('点击外部或按下 Escape 应关闭菜单', async () => {
    const wrapper = mount(MarkdownPreview, {
      attachTo: document.body,
      props: {
        content: 'close',
        theme: 'dark',
      },
    });

    await flushRender();
    await openContextMenu(wrapper);
    expect(getMenuElement()).not.toBeNull();

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushPromises();
    expect(getMenuElement()).toBeNull();

    await openContextMenu(wrapper);
    expect(getMenuElement()).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(getMenuElement()).toBeNull();
    wrapper.unmount();
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

    const copySelection = queryBody('[data-testid="preview-menu-copy-selection"]');
    expect(copySelection).not.toBeNull();
    copySelection?.click();
    await flushPromises();

    expect(clipboard).toHaveBeenCalledWith('selected text');
    expect(getMenuElement()).toBeNull();
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

    const copyLink = queryBody('[data-testid="preview-menu-copy-link"]');
    expect(copyLink).not.toBeNull();
    copyLink?.click();
    await flushPromises();

    expect(clipboard).toHaveBeenCalledWith('https://example.com/');
    expect(getMenuElement()).toBeNull();
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

    const copyImage = queryBody('[data-testid="preview-menu-copy-image-src"]');
    expect(copyImage).not.toBeNull();
    copyImage?.click();
    await flushPromises();

    expect(clipboard).toHaveBeenCalledWith('https://example.com/a.png');
    expect(getMenuElement()).toBeNull();
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

    const previewMode = queryBody('[data-testid="preview-menu-set-preview-mode-preview"]');
    expect(previewMode).not.toBeNull();
    previewMode?.click();

    expect(wrapper.emitted('request-preview-mode-change')).toEqual([['preview']]);
  });

  it('应根据设置中的阅读主题渲染预览主题类', async () => {
    const settingsStore = useSettingsStore();
    await settingsStore.updateSettings({ markdownPreviewTheme: 'paper-soft' });
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: 'theme',
        theme: 'light',
      },
    });

    await flushRender();

    expect(wrapper.get('[data-testid="markdown-preview"]').classes()).toContain('markdown-preview--paper-soft');
  });

  it('右键菜单应提供主题切换并将当前主题标记为禁用', async () => {
    const settingsStore = useSettingsStore();
    await settingsStore.updateSettings({ markdownPreviewTheme: 'editorial-warm' });
    const wrapper = mount(MarkdownPreview, {
      attachTo: document.body,
      props: {
        content: 'theme menu',
        theme: 'light',
      },
    });

    await flushRender();
    await openContextMenu(wrapper);

    const themeTrigger = queryBody('[data-testid="preview-menu-theme-editorial-warm"]');
    const alternateTheme = queryBody('[data-testid="preview-menu-theme-graphite-night"]');

    expect(queryBody('[data-testid="preview-menu-theme-docs-clean"]')).not.toBeNull();
    expect(queryBody('[data-testid="preview-menu-theme-paper-soft"]')).not.toBeNull();
    expect(themeTrigger).not.toBeNull();
    expect(alternateTheme).not.toBeNull();
    expect(themeTrigger?.getAttribute('disabled')).not.toBeNull();

    alternateTheme?.click();
    expect(settingsStore.markdownPreviewTheme).toBe('graphite-night');
    wrapper.unmount();
  });

  it('右键菜单应通过 body teleport 渲染以避免预览面板位移动画影响定位', async () => {
    const wrapper = mount(MarkdownPreview, {
      attachTo: document.body,
      props: {
        content: 'teleport',
        theme: 'dark',
      },
    });

    await flushRender();
    await openContextMenu(wrapper, '[data-testid="markdown-preview"]', 135, 185);

    const menu = getMenuElement();
    expect(menu).not.toBeNull();
    expect(menu?.parentElement).toBe(document.body);
    expect(getMenuStyle()).toContain('top: 185px');
    expect(getMenuStyle()).toContain('left: 135px');
    wrapper.unmount();
  });
});
