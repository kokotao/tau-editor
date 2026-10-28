import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useSettingsStore } from '@/stores/settings';
import { useNotificationStore } from '@/stores/notification';
import MarkdownPreview from '@/components/editor/MarkdownPreview.vue';
import { renderMarkdown, renderMermaidDiagrams } from '@/services/markdownRenderService';
import { appCommands } from '@/lib/tauri';

const monacoColorizeMock = vi.hoisted(() => vi.fn(async (code: string, language: string) =>
  `<span class="mtk1" data-language="${language}">${code}</span>`,
));

vi.mock('@/services/markdownRenderService', () => ({
  renderMarkdown: vi.fn((raw: string) => `<p>${raw}</p>`),
  renderMermaidDiagrams: vi.fn(async () => undefined),
}));
vi.mock('@/lib/monaco/editor', () => ({
  editor: { colorize: monacoColorizeMock },
}));

const renderMarkdownMock = vi.mocked(renderMarkdown);
const renderMermaidMock = vi.mocked(renderMermaidDiagrams);

const flushRender = async () => {
  await vi.advanceTimersByTimeAsync(180);
  await flushPromises();
};

const menuSelector = '[data-testid="markdown-preview-context-menu"]';
const queryBody = <T extends HTMLElement = HTMLElement>(selector: string) => document.body.querySelector(selector) as T | null;
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
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => ({
      getBoundingClientRect: () => ({ left: 40, top: 40, width: 60, height: 18 }),
    }),
  } as Selection;
  Object.defineProperty(window, 'getSelection', {
    value: () => selection,
    configurable: true,
  });
};

describe('MarkdownPreview', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.useFakeTimers();
    monacoColorizeMock.mockImplementation(async (code, language) =>
      `<span class="mtk1" data-language="${language}">${code}</span>`,
    );
    renderMarkdownMock.mockImplementation((raw: string) => `<p>${raw}</p>`);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    Reflect.deleteProperty(document, 'caretRangeFromPoint');
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

  it('代码块语言选择应更新 Markdown 围栏语言并发出原文变更', async () => {
    renderMarkdownMock.mockReturnValue('<pre><code class="language-js">const value = 1;</code></pre>');
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: '```js\nconst value = 1;\n```',
        theme: 'dark',
      },
    });

    await flushRender();

    const languageSelect = wrapper.get('[data-testid="markdown-code-language-select"]');
    expect(languageSelect.element.tagName).toBe('BUTTON');
    expect(languageSelect.text()).toContain('JavaScript');
    await flushPromises();
    expect(monacoColorizeMock).toHaveBeenCalledWith(
      'const value = 1;',
      'javascript',
      expect.objectContaining({ tabSize: 4 }),
    );
    await languageSelect.trigger('click');
    expect(languageSelect.attributes('aria-expanded')).toBe('true');
    const languageList = document.getElementById(languageSelect.attributes('aria-controls')!);
    expect(languageList).not.toBeNull();
    languageList?.querySelector<HTMLButtonElement>('.markdown-code-language-option[data-language="python"]')?.click();
    await flushPromises();

    expect(wrapper.emitted('code-language-change')).toEqual([[
      {
        fenceIndex: 0,
        originalLanguage: 'js',
        code: 'const value = 1;',
        language: 'python',
      },
    ]]);
    renderMarkdownMock.mockReturnValue('<pre><code class="language-python">const value = 1;</code></pre>');
    await wrapper.setProps({ content: '```python\nconst value = 1;\n```' });
    await flushRender();
    await flushPromises();
    expect(wrapper.get('pre').attributes('data-code-language')).toBe('python');
    expect(wrapper.get('code').classes()).toContain('language-python');
    expect(wrapper.get('code').text()).toBe('const value = 1;');
    expect(monacoColorizeMock).toHaveBeenLastCalledWith(
      'const value = 1;',
      'python',
      expect.objectContaining({ tabSize: 4 }),
    );
  });

  it('相同内容的多个代码块应只更新所选块，且支持无语言标记的波浪围栏', async () => {
    const markdown = '~~~js\nsame()\n~~~\n\n~~~js\nsame()\n~~~';
    renderMarkdownMock.mockReturnValue(
      '<pre><code class="language-js">same()</code></pre><pre><code class="language-js">same()</code></pre>',
    );
    const wrapper = mount(MarkdownPreview, {
      props: { content: markdown, theme: 'dark' },
    });

    await flushRender();
    const selects = wrapper.findAll('[data-testid="markdown-code-language-select"]');
    await selects[1]!.trigger('click');
    document.body.querySelector<HTMLButtonElement>('.markdown-code-language-option[data-language="python"]')?.click();
    await flushPromises();
    expect(wrapper.emitted('code-language-change')?.[0]).toEqual([{
      fenceIndex: 1,
      originalLanguage: 'js',
      code: 'same()',
      language: 'python',
    }]);

    const emptyLanguage = '```\nplain text\n```';
    renderMarkdownMock.mockReturnValue('<pre><code>plain text</code></pre>');
    await wrapper.setProps({ content: emptyLanguage });
    await flushRender();
    await wrapper.get('[data-testid="markdown-code-language-select"]').trigger('click');
    document.body.querySelector<HTMLButtonElement>('.markdown-code-language-option[data-language="typescript"]')?.click();
    await flushPromises();
    expect(wrapper.emitted('code-language-change')?.[1]).toEqual([{
      fenceIndex: 0,
      originalLanguage: '',
      code: 'plain text',
      language: 'typescript',
    }]);
  });

  it('代码块复制按钮应复制代码文本并报告成功', async () => {
    renderMarkdownMock.mockReturnValue('<pre><code class="language-js">const value = 1;</code></pre>');
    const clipboard = mockClipboard();
    const notificationStore = useNotificationStore();
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: '```js\nconst value = 1;\n```',
        theme: 'dark',
      },
    });

    await flushRender();
    await wrapper.get('.markdown-code-copy-button').trigger('click');
    await flushPromises();

    expect(clipboard).toHaveBeenCalledWith('const value = 1;');
    expect(notificationStore.notifications.at(-1)?.type).toBe('success');
  });

  it('Mermaid 图表工具栏应支持图表/代码切换、缩放和全屏', async () => {
    renderMarkdownMock.mockReturnValue(
      '<div class="markdown-mermaid-viewer"><div class="markdown-mermaid-canvas" data-mermaid-view="diagram"><svg width="260" height="200"></svg></div><pre class="markdown-mermaid-source" data-mermaid-view="code" hidden><code class="language-mermaid">flowchart TD</code></pre></div>',
    );
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: '```mermaid\nflowchart TD\n```',
        theme: 'dark',
      },
    });

    await flushRender();

    const viewer = wrapper.get('.markdown-mermaid-viewer');
    const diagram = viewer.get('[data-mermaid-view="diagram"]');
    const source = viewer.get('[data-mermaid-view="code"]');
    const canvas = viewer.get('.markdown-mermaid-canvas').element as HTMLElement;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 300,
      bottom: 240,
      width: 300,
      height: 240,
      toJSON: () => ({}),
    } as DOMRect);
    delete canvas.dataset.baseHeight;
    canvas.style.height = '';
    expect(viewer.find('[data-testid="markdown-mermaid-toolbar"]').exists()).toBe(true);
    expect((source.element as HTMLElement).hidden).toBe(true);

    await viewer.get('[data-mermaid-action="code"]').trigger('click');
    expect((source.element as HTMLElement).hidden).toBe(false);
    expect((diagram.element as HTMLElement).hidden).toBe(true);
    expect(source.text()).toBe('flowchart TD');

    await viewer.get('[data-mermaid-action="diagram"]').trigger('click');
    await viewer.get('[data-mermaid-action="zoom-in"]').trigger('click');
    expect(viewer.get('.markdown-mermaid-zoom-level').text()).toBe('125%');
    expect((diagram.get('svg').element as SVGSVGElement).style.transform).toBe('');
    expect((diagram.get('svg').element as SVGSVGElement).style.width).toBe('325px');
    expect(canvas.style.height).toBe('240px');
    expect(canvas.querySelector('.markdown-mermaid-canvas-content')?.style.width).toBe('325px');
    expect(canvas.style.overflow).toBe('scroll');
    await viewer.get('[data-mermaid-action="zoom-in"]').trigger('click');
    expect(viewer.get('.markdown-mermaid-zoom-level').text()).toBe('150%');
    expect(canvas.style.height).toBe('240px');
    await viewer.get('[data-mermaid-action="zoom-out"]').trigger('click');
    expect(viewer.get('.markdown-mermaid-zoom-level').text()).toBe('125%');
    expect(canvas.style.height).toBe('240px');
    await viewer.get('[data-mermaid-action="zoom-out"]').trigger('click');
    expect(viewer.get('.markdown-mermaid-zoom-level').text()).toBe('100%');
    expect(canvas.style.height).toBe('');
    expect(canvas.style.overflow).toBe('hidden');
    await viewer.get('[data-mermaid-action="zoom-out"]').trigger('click');
    expect(viewer.get('.markdown-mermaid-zoom-level').text()).toBe('75%');
    expect((diagram.get('svg').element as SVGSVGElement).style.width).toBe('195px');
    expect(canvas.style.height).toBe('190px');
    await viewer.get('[data-mermaid-action="zoom-out"]').trigger('click');
    expect(viewer.get('.markdown-mermaid-zoom-level').text()).toBe('50%');
    expect((diagram.get('svg').element as SVGSVGElement).style.width).toBe('130px');
    expect(canvas.style.height).toBe('140px');

    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(viewer.element, 'requestFullscreen', {
      value: requestFullscreen,
      configurable: true,
    });
    await viewer.get('.markdown-mermaid-fullscreen-button').trigger('click');
    await flushPromises();
    expect(requestFullscreen).toHaveBeenCalledOnce();
  });

  it('Mermaid 图表工具栏应支持复制为图片', async () => {
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    const clipboardItem = vi.fn();
    Object.defineProperty(navigator, 'clipboard', {
      value: { write: clipboardWrite },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'ClipboardItem', {
      value: clipboardItem,
      configurable: true,
    });
    class MockImage {
      decoding = 'async';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    Object.defineProperty(globalThis, 'Image', { value: MockImage, configurable: true });
    clipboardItem.mockImplementation((value: unknown) => value);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mermaid');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: (callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' })),
      configurable: true,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: () => ({
        setTransform: vi.fn(),
        drawImage: vi.fn(),
      }),
      configurable: true,
    });
    renderMarkdownMock.mockReturnValue(
      '<div class="markdown-mermaid-viewer"><div class="markdown-mermaid-canvas" data-mermaid-view="diagram"><svg viewBox="0 0 100 40"><text>Flow</text></svg></div><pre class="markdown-mermaid-source" data-mermaid-view="code" hidden><code>flowchart TD</code></pre></div>',
    );
    const wrapper = mount(MarkdownPreview, {
      props: { content: '```mermaid\nflowchart TD\n```', theme: 'dark' },
    });

    await flushRender();
    await wrapper.get('[data-mermaid-action="copy-image"]').trigger('click');
    await flushPromises();

    expect(clipboardItem).toHaveBeenCalledWith(expect.objectContaining({ 'image/png': expect.any(Promise) }));
    expect(clipboardWrite).toHaveBeenCalledOnce();
  });

  it('Mermaid 图表工具栏应下载 PNG 和 SVG，并使用对应文件名与 MIME 类型', async () => {
    class MockImage {
      decoding = 'async';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    Object.defineProperty(globalThis, 'Image', { value: MockImage, configurable: true });
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: (callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' })),
      configurable: true,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: () => ({
        setTransform: vi.fn(),
        drawImage: vi.fn(),
      }),
      configurable: true,
    });
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mermaid-download');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const downloadedNames: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      downloadedNames.push(this.download);
    });
    renderMarkdownMock.mockReturnValue(
      '<div class="markdown-mermaid-viewer"><div class="markdown-mermaid-canvas" data-mermaid-view="diagram"><svg viewBox="0 0 100 40"><text>Flow</text></svg></div><pre class="markdown-mermaid-source" data-mermaid-view="code" hidden><code>flowchart TD</code></pre></div>',
    );
    const wrapper = mount(MarkdownPreview, {
      props: { content: '```mermaid\nflowchart TD\n```', theme: 'dark' },
    });

    await flushRender();
    const toolbar = wrapper.get('[data-testid="markdown-mermaid-toolbar"]');
    const directToolbarActions = Array.from(toolbar.element.children)
      .map((child) => (child as HTMLElement).dataset.mermaidAction);
    expect(directToolbarActions).not.toContain('download-png');
    expect(directToolbarActions).not.toContain('download-svg');
    expect(wrapper.find('[data-mermaid-action="export-menu"]').exists()).toBe(true);
    const exportMenu = wrapper.get('.markdown-mermaid-export-menu');
    expect(exportMenu.find('[data-mermaid-action="download-png"]').exists()).toBe(true);
    expect(exportMenu.find('[data-mermaid-action="download-svg"]').exists()).toBe(true);
    expect(exportMenu.find('[data-mermaid-action="copy-image"]').exists()).toBe(true);
    expect((exportMenu.get('.markdown-mermaid-export-options').element as HTMLElement).hidden).toBe(true);
    await exportMenu.get('[data-mermaid-action="export-menu"]').trigger('click');
    expect((exportMenu.get('.markdown-mermaid-export-options').element as HTMLElement).hidden).toBe(false);
    await exportMenu.get('[data-mermaid-action="download-svg"]').trigger('click');
    await flushPromises();
    await exportMenu.get('[data-mermaid-action="download-png"]').trigger('click');
    await flushPromises();

    expect(downloadedNames).toEqual(['mermaid-diagram.svg', 'mermaid-diagram.png']);
    const blobTypes = createObjectURL.mock.calls.map(([value]) => (value as Blob).type);
    expect(blobTypes).toContain('image/svg+xml');
    expect(blobTypes).toContain('image/png');
  });

  it('桌面端应将 PNG 字节写入原生图片剪贴板', async () => {
    const writeImage = vi.spyOn(appCommands, 'writeImage').mockResolvedValue(undefined);
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    });
    class MockImage {
      decoding = 'async';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    Object.defineProperty(globalThis, 'Image', { value: MockImage, configurable: true });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mermaid-native');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: (callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' })),
      configurable: true,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: () => ({
        setTransform: vi.fn(),
        drawImage: vi.fn(),
      }),
      configurable: true,
    });
    renderMarkdownMock.mockReturnValue(
      '<div class="markdown-mermaid-viewer"><div class="markdown-mermaid-canvas" data-mermaid-view="diagram"><svg viewBox="0 0 100 40"><text>Flow</text></svg></div><pre class="markdown-mermaid-source" data-mermaid-view="code" hidden><code>flowchart TD</code></pre></div>',
    );
    const wrapper = mount(MarkdownPreview, {
      props: { content: '```mermaid\nflowchart TD\n```', theme: 'dark' },
    });

    await flushRender();
    await wrapper.get('[data-mermaid-action="copy-image"]').trigger('click');
    await flushPromises();

    expect(writeImage).toHaveBeenCalledOnce();
    expect(writeImage.mock.calls[0][0]).toEqual(expect.any(Uint8Array));
    expect((writeImage.mock.calls[0][0] as Uint8Array).length).toBeGreaterThan(0);
  });

  it('浏览器拒绝 PNG 图片写入时应回退复制 SVG 源码文本', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboardWrite = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    const clipboardItem = vi.fn().mockImplementation((value: unknown) => value);
    Object.defineProperty(navigator, 'clipboard', {
      value: { write: clipboardWrite, writeText },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'ClipboardItem', {
      value: clipboardItem,
      configurable: true,
    });
    renderMarkdownMock.mockReturnValue(
      '<div class="markdown-mermaid-viewer"><div class="markdown-mermaid-canvas" data-mermaid-view="diagram"><svg viewBox="0 0 100 40"><text>Flow</text></svg></div><pre class="markdown-mermaid-source" data-mermaid-view="code" hidden><code>flowchart TD</code></pre></div>',
    );
    const wrapper = mount(MarkdownPreview, {
      props: { content: '```mermaid\nflowchart TD\n```', theme: 'dark' },
    });

    await flushRender();
    await wrapper.get('[data-mermaid-action="copy-image"]').trigger('click');
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('<svg'));
  });

  it('超宽表格应包裹在预览区域内的横向滚动容器中', async () => {
    renderMarkdownMock.mockReturnValue('<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>');
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: '| Header |\n| --- |\n| Cell |',
        theme: 'dark',
      },
    });

    await flushRender();

    const tableScroll = wrapper.find('.markdown-table-scroll');
    expect(tableScroll.exists()).toBe(true);
    expect(tableScroll.find('table').exists()).toBe(true);
  });

  it('预览右键菜单应提供 Markdown 标题、正文和表格插入', async () => {
    const wrapper = mount(MarkdownPreview, {
      props: { content: '已有内容', theme: 'dark' },
    });
    await flushRender();

    await openContextMenu(wrapper);
    await queryBody('[data-testid="preview-menu-insert-heading"]')?.click();
    await flushPromises();
    expect(wrapper.emitted('markdown-change')?.[0]).toEqual(['已有内容\n\n## 标题\n']);
  });

  it('预览表格边缘加号应新增行和左右列', async () => {
    renderMarkdownMock.mockReturnValue('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>');
    const source = '| A | B |\n| --- | --- |\n| 1 | 2 |';
    const wrapper = mount(MarkdownPreview, {
      props: { content: source, theme: 'dark' },
    });
    await flushRender();

    await wrapper.get('[data-testid="markdown-table-add-row"]').trigger('click');
    expect(wrapper.emitted('markdown-change')?.[0]).toEqual(['| A | B |\n| --- | --- |\n| 1 | 2 |\n| 内容 | 内容 |']);

    await wrapper.get('[data-testid="markdown-table-add-column-left"]').trigger('click');
    expect(wrapper.emitted('markdown-change')?.[1]).toEqual(['| 内容 | A | B |\n| --- | --- | --- |\n| 内容 | 1 | 2 |']);

    await wrapper.get('[data-testid="markdown-table-add-column-right"]').trigger('click');
    expect(wrapper.emitted('markdown-change')?.[2]).toEqual(['| A | B | 内容 |\n| --- | --- | --- |\n| 1 | 2 | 内容 |']);
  });

  it('预览表格删除按钮应删除整张表格并发出变更', async () => {
    renderMarkdownMock.mockReturnValue('<p>前文</p><table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table><p>后文</p>');
    const wrapper = mount(MarkdownPreview, {
      props: { content: '前文\n\n| A |\n| --- |\n| 1 |\n\n后文', theme: 'dark' },
    });
    await flushRender();
    const preview = wrapper.get('[data-testid="markdown-preview"]').element as HTMLElement;
    preview.scrollTop = 380;

    await wrapper.get('[data-testid="markdown-table-remove"]').trigger('click');
    await flushPromises();
    expect(queryBody('[data-testid="markdown-table-delete-confirm"]')).not.toBeNull();
    queryBody<HTMLButtonElement>('[data-testid="markdown-table-delete-confirm-button"]')?.click();
    await flushPromises();
    const nextContent = wrapper.emitted('markdown-change')?.[0]?.[0] as string;
    expect(nextContent).toBe('前文\n后文');
    await wrapper.setProps({
      content: nextContent,
      editorScrollState: { top: 0, height: 400, scrollHeight: 2400 },
    });
    await flushPromises();
    expect(wrapper.find('table').exists()).toBe(false);
    expect(preview.scrollTop).toBe(380);
  });

  it('预览滚动时应按比例向编辑器发出同步事件', async () => {
    renderMarkdownMock.mockReturnValue('<h1>标题</h1><p>正文</p>'.repeat(60));
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: '# 标题\n\n正文'.repeat(60),
        theme: 'dark',
        editorScrollState: { top: 0, height: 400, scrollHeight: 2400 },
      },
    });
    await flushRender();

    const preview = wrapper.get('[data-testid="markdown-preview"]').element as HTMLElement;
    Object.defineProperty(preview, 'scrollHeight', { configurable: true, value: 2400 });
    Object.defineProperty(preview, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(preview, 'scrollTop', { configurable: true, value: 1000, writable: true });
    await wrapper.get('[data-testid="markdown-preview"]').trigger('scroll');
    await nextTick();

    const events = wrapper.emitted('scroll-sync');
    expect(events).toBeTruthy();
    const state = events?.[0]?.[0] as { top: number; height: number; scrollHeight: number };
    expect(Number(state.top.toFixed(2))).toBe(1000);
    expect(state.height).toBe(400);
    expect(state.scrollHeight).toBe(2400);
  });

  it('预览滚动时应按 data-source-line 发出当前标题行（rAF 节流）', async () => {
    renderMarkdownMock.mockReturnValue(
      '<h1 data-source-line="1">一</h1><p>甲</p>'
      + '<h2 data-source-line="2">二</h2><p>乙</p>'
      + '<h2 data-source-line="3">三</h2><p>丙</p>',
    );
    const wrapper = mount(MarkdownPreview, {
      props: { content: '# 一\n\n甲\n\n## 二\n\n乙\n\n## 三\n\n丙', theme: 'dark' },
    });
    const preview = wrapper.get('[data-testid="markdown-preview"]').element as HTMLElement;
    Object.defineProperty(preview, 'clientWidth', { configurable: true, value: 800 });

    // jsdom 没有布局：按 data-source-line 造出间隔 100px 的标题位置。
    const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const line = Number.parseInt((this as HTMLElement).dataset?.sourceLine ?? '', 10);
      const top = Number.isFinite(line) ? line * 100 : 0;
      return { top, left: 0, right: 0, bottom: top, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    });

    try {
      await flushRender();

      Object.defineProperty(preview, 'scrollTop', { configurable: true, value: 250, writable: true });
      await wrapper.get('[data-testid="markdown-preview"]').trigger('scroll');
      await vi.advanceTimersByTimeAsync(40);

      // scrollTop=250 落在第二个标题（200px）之后、第三个标题（300px）之前。
      expect(wrapper.emitted('active-line')?.[0]).toEqual([2]);
    } finally {
      rectSpy.mockRestore();
    }
  });

  it('预览标题缺少 data-source-line 时不发 active-line', async () => {
    renderMarkdownMock.mockReturnValue('<h1>标题</h1><p>正文</p>');
    const wrapper = mount(MarkdownPreview, {
      props: { content: '# 标题\n\n正文', theme: 'dark' },
    });
    const preview = wrapper.get('[data-testid="markdown-preview"]').element as HTMLElement;
    Object.defineProperty(preview, 'clientWidth', { configurable: true, value: 800 });
    Object.defineProperty(preview, 'scrollHeight', { configurable: true, value: 2400 });
    Object.defineProperty(preview, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(preview, 'scrollTop', { configurable: true, value: 320, writable: true });
    await flushRender();

    await wrapper.get('[data-testid="markdown-preview"]').trigger('scroll');
    await vi.advanceTimersByTimeAsync(40);

    expect(wrapper.emitted('active-line')).toBeUndefined();
  });

  it('取消删除整张表格时不应发出变更', async () => {
    renderMarkdownMock.mockReturnValue('<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>');
    const wrapper = mount(MarkdownPreview, {
      props: { content: '| A |\n| --- |\n| 1 |', theme: 'dark' },
    });
    await flushRender();

    await wrapper.get('[data-testid="markdown-table-remove"]').trigger('click');
    await flushPromises();
    queryBody<HTMLButtonElement>('[data-testid="markdown-table-delete-cancel"]')?.click();
    await flushPromises();
    expect(wrapper.emitted('markdown-change')).toBeUndefined();
    expect(wrapper.get('table').exists()).toBe(true);
  });

  it('表格修改后保留原表格 DOM，避免整个预览闪回顶部', async () => {
    const source = '| 表格一 |\n| --- |\n| 内容 |\n\n| 表格二 |\n| --- |\n| 内容 |';
    renderMarkdownMock.mockImplementation((raw: string) => {
      if (raw.includes('表格一') && raw.includes('表格二')) {
        return '<table><thead><tr><th>表格一</th></tr></thead><tbody><tr><td>内容</td></tr></tbody></table><table><thead><tr><th>表格二</th></tr></thead><tbody><tr><td>内容</td></tr></tbody></table>';
      }
      return '<table><thead><tr><th>表格一</th></tr></thead><tbody><tr><td>内容</td></tr><tr><td>新增</td></tr></tbody></table>';
    });
    const wrapper = mount(MarkdownPreview, { props: { content: source, theme: 'dark' } });
    await flushRender();
    const secondTable = wrapper.findAll('table')[1]?.element;
    const preview = wrapper.get('[data-testid="markdown-preview"]').element as HTMLElement;
    preview.scrollTop = 420;

    await wrapper.get('[data-testid="markdown-table-add-row"]').trigger('click');
    const nextContent = wrapper.emitted('markdown-change')?.[0]?.[0] as string;
    await wrapper.setProps({ content: nextContent });
    await flushPromises();

    expect(wrapper.findAll('table')[1]?.element).toBe(secondTable);
    expect(wrapper.findAll('table')[0]?.text()).toContain('新增');
    expect(preview.scrollTop).toBe(420);
  });

  it('预览中的纯文本标题和段落应支持双击原位编辑并写回 Markdown', async () => {
    renderMarkdownMock.mockReturnValue('<h2 data-source-line="1">原有标题</h2><p>原有正文</p>');
    const wrapper = mount(MarkdownPreview, {
      props: { content: '## 原有标题\n\n原有正文', theme: 'dark' },
    });
    await flushRender();

    const heading = wrapper.get('h2');
    await heading.trigger('dblclick');
    expect(heading.attributes('contenteditable')).toBe('true');
    (heading.element as HTMLElement).textContent = '新标题';
    await heading.trigger('focusout');
    expect(wrapper.emitted('markdown-change')?.[0]).toEqual(['## 新标题\n\n原有正文']);

    const paragraph = wrapper.get('p');
    await paragraph.trigger('dblclick');
    expect(paragraph.attributes('contenteditable')).toBe('true');
    (paragraph.element as HTMLElement).textContent = '新的正文';
    await paragraph.trigger('focusout');
    expect(wrapper.emitted('markdown-change')?.[1]).toEqual(['## 原有标题\n\n新的正文']);
  });

  it('含嵌套 Markdown 标记的预览块双击也应进入编辑并保留折叠光标', async () => {
    renderMarkdownMock.mockReturnValue('<h2 data-source-line="1">带 <strong>强调</strong> 的标题</h2>');
    const wrapper = mount(MarkdownPreview, {
      props: { content: '## 带 **强调** 的标题', theme: 'dark' },
    });
    await flushRender();

    const heading = wrapper.get('h2');
    const emphasis = heading.get('strong');
    const emphasisText = emphasis.element.firstChild as Text;
    const caretRange = document.createRange();
    caretRange.setStart(emphasisText, 2);
    caretRange.collapse(true);
    const caretFromPoint = vi.fn(() => caretRange);
    Object.defineProperty(document, 'caretRangeFromPoint', { value: caretFromPoint, configurable: true });
    await emphasis.trigger('dblclick', { clientX: 24, clientY: 12 });

    expect(heading.attributes('contenteditable')).toBe('true');
    expect(caretFromPoint).toHaveBeenCalledWith(24, 12);
    const selection = window.getSelection();
    expect(selection?.rangeCount).toBe(1);
    expect(selection?.isCollapsed).toBe(true);
    expect(selection?.anchorNode).toBe(emphasisText);
    expect(selection?.anchorOffset).toBe(2);

    (emphasis.element as HTMLElement).textContent = '强调更新';
    await heading.trigger('focusout');
    expect(wrapper.emitted('markdown-change')?.[0]).toEqual(['## 带 **强调更新** 的标题']);
  });

  it('scrollToSourceLine 应滚动到对应源代码行的标题', async () => {
    renderMarkdownMock.mockReturnValue('<h2 data-source-line="3">Target</h2>');
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: scrollIntoView,
      configurable: true,
    });
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: '## Target',
        theme: 'dark',
      },
    });

    await flushRender();
    (wrapper.vm as any).scrollToSourceLine(3);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
  });

  it('旧 Mermaid 渲染完成时不应将最新预览标记为可定位', async () => {
    renderMarkdownMock.mockImplementation((raw) => `<h2 data-source-line="1">${raw}</h2>`);
    let resolveFirstRender: (() => void) | undefined;
    let resolveSecondRender: (() => void) | undefined;
    const firstRender = new Promise<void>((resolve) => {
      resolveFirstRender = resolve;
    });
    const secondRender = new Promise<void>((resolve) => {
      resolveSecondRender = resolve;
    });
    renderMermaidMock.mockReturnValueOnce(firstRender).mockReturnValueOnce(secondRender);

    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: scrollIntoView,
      configurable: true,
    });
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: 'first',
        theme: 'dark',
      },
    });

    vi.advanceTimersByTime(180);
    await flushPromises();
    await wrapper.setProps({ content: 'second' });
    vi.advanceTimersByTime(180);
    await flushPromises();

    resolveFirstRender?.();
    await flushPromises();
    (wrapper.vm as any).scrollToSourceLine(1);
    expect(scrollIntoView).not.toHaveBeenCalled();

    resolveSecondRender?.();
    await flushPromises();
    (wrapper.vm as any).scrollToSourceLine(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
  });

  it('新 Mermaid 渲染先完成时仍应等待旧渲染结束后才允许定位', async () => {
    renderMarkdownMock.mockImplementation((raw) => `<h2 data-source-line="1">${raw}</h2>`);
    let resolveFirstRender: (() => void) | undefined;
    let resolveSecondRender: (() => void) | undefined;
    const firstRender = new Promise<void>((resolve) => {
      resolveFirstRender = resolve;
    });
    const secondRender = new Promise<void>((resolve) => {
      resolveSecondRender = resolve;
    });
    renderMermaidMock.mockReturnValueOnce(firstRender).mockReturnValueOnce(secondRender);

    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: scrollIntoView,
      configurable: true,
    });
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: 'first',
        theme: 'dark',
      },
    });

    vi.advanceTimersByTime(180);
    await flushPromises();
    await wrapper.setProps({ content: 'second' });
    vi.advanceTimersByTime(180);
    await flushPromises();

    resolveSecondRender?.();
    await flushPromises();
    (wrapper.vm as any).scrollToSourceLine(1);
    expect(scrollIntoView).not.toHaveBeenCalled();

    resolveFirstRender?.();
    await flushPromises();
    (wrapper.vm as any).scrollToSourceLine(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
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

  it('选中文字后点击浮动工具栏 B 应写回加粗 Markdown', async () => {
    renderMarkdownMock.mockReturnValue('<p id="selection-target">Selection target</p>');
    const wrapper = mount(MarkdownPreview, {
      props: { content: 'Selection target', theme: 'dark', previewMode: 'preview' },
    });
    await flushRender();

    const textNode = wrapper.find('#selection-target').element.firstChild as Node;
    mockSelection('Selection', textNode);
    await wrapper.get('[data-testid="markdown-preview"]').trigger('mouseup');
    expect(wrapper.get('[data-testid="markdown-selection-toolbar"]').exists()).toBe(true);

    await wrapper.get('[data-testid="selection-bold"]').trigger('pointerdown');
    await wrapper.get('[data-testid="selection-bold"]').trigger('mousedown');
    Object.defineProperty(window, 'getSelection', {
      value: () => ({
        toString: () => '',
        isCollapsed: true,
        anchorNode: textNode,
        focusNode: textNode,
      }),
      configurable: true,
    });
    await wrapper.get('[data-testid="selection-bold"]').trigger('click');
    expect(wrapper.emitted('markdown-change')?.at(-1)).toEqual(['**Selection** target']);
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

  it('点击 Markdown 网页链接应交给系统浏览器而不是 WebView 导航', async () => {
    renderMarkdownMock.mockReturnValue('<p><a href="https://example.com/docs">Example</a></p>');
    const openExternalLink = vi.spyOn(appCommands, 'openExternalLink').mockResolvedValue(undefined);
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: 'link',
        theme: 'dark',
      },
    });

    await flushRender();
    await wrapper.find('a').trigger('click');

    expect(openExternalLink).toHaveBeenCalledWith('https://example.com/docs');
    openExternalLink.mockRestore();
  });

  it('点击 Markdown 相对文件链接应发出 open-file 事件并解析到源文件目录', async () => {
    renderMarkdownMock.mockReturnValue('<p><a href="serialization.md">查看文档</a></p>');
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: '[查看文档](serialization.md)',
        sourceFilePath: '/workspace/docs/readme.md',
        theme: 'dark',
      },
    });

    await flushRender();
    await wrapper.find('a').trigger('click');

    expect(wrapper.emitted('open-file')).toEqual([[
      { path: '/workspace/docs/serialization.md', href: 'file:///workspace/docs/serialization.md' },
    ]]);
  });

  it('点击 Windows 盘符文件链接时不应按外链处理', async () => {
    renderMarkdownMock.mockReturnValue('<p><a href="C:\\docs\\guide.md">指南</a></p>');
    const openExternalLink = vi.spyOn(appCommands, 'openExternalLink').mockResolvedValue(undefined);
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: '[指南](C:/docs/guide.md)',
        theme: 'dark',
      },
    });

    await flushRender();
    await wrapper.find('a').trigger('click');

    expect(wrapper.emitted('open-file')).toEqual([[
      { path: 'C:/docs/guide.md', href: 'file:///C:/docs/guide.md' },
    ]]);
    expect(openExternalLink).not.toHaveBeenCalled();
    openExternalLink.mockRestore();
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

  it('双击图片应发射原始地址、替代文本和解析后的地址', async () => {
    renderMarkdownMock.mockReturnValue('<p><img src="assets/hero.png" alt="hero" /></p>');
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: 'image',
        theme: 'dark',
        sourceFilePath: '/Users/albertluo/docs/readme.md',
      },
    });

    await flushRender();
    await wrapper.find('img').trigger('dblclick');

    expect(wrapper.emitted('open-image')).toEqual([[
      {
        src: 'assets/hero.png',
        alt: 'hero',
        resolvedSrc: 'file:///Users/albertluo/docs/assets/hero.png',
      },
    ]]);
  });

  it('无法解析图片地址时应回传原始地址作为 resolvedSrc', async () => {
    renderMarkdownMock.mockReturnValue('<p><img src="hero.png" /></p>');
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: 'image',
        theme: 'dark',
      },
    });

    await flushRender();
    await wrapper.find('img').trigger('dblclick');

    expect(wrapper.emitted('open-image')).toEqual([[
      {
        src: 'hero.png',
        alt: undefined,
        resolvedSrc: 'hero.png',
      },
    ]]);
  });

  it('仅预览模式下应通过 Ctrl/Cmd +/- 调整当前预览字号并支持 0 重置', async () => {
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: 'font size',
        theme: 'dark',
        previewMode: 'preview',
        previewFontSize: 16,
      },
    });

    await flushRender();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', code: 'Equal', ctrlKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', code: 'Minus', metaKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', code: 'Digit0', ctrlKey: true }));

    expect(wrapper.emitted('preview-font-size-change')).toEqual([[17], [16], [16]]);

    await wrapper.setProps({ previewMode: 'split' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', code: 'Equal', ctrlKey: true }));
    expect(wrapper.emitted('preview-font-size-change')).toHaveLength(3);
  });

  it('图片悬浮时应提示双击放大查看并使用放大指针', async () => {
    renderMarkdownMock.mockReturnValue('<p><img src="hero.png" alt="hero" /></p>');
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: 'image',
        theme: 'dark',
      },
    });

    await flushRender();

    const image = wrapper.get('img');
    expect(image.attributes('title')).toContain('双击');
    expect(image.attributes('alt')).toBe('hero');
    expect(image.attributes('aria-label')).toBeUndefined();
    expect(image.classes()).toContain('markdown-preview-image');
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

  it('Mermaid 渲染应使用偏好中的主题、节点颜色和 Markdown 预览主题', async () => {
    const settingsStore = useSettingsStore();
    settingsStore.markdownMermaidTheme = 'forest';
    settingsStore.markdownMermaidNodeColor = '#aabbcc';
    settingsStore.markdownPreviewTheme = 'paper-soft';
    const wrapper = mount(MarkdownPreview, {
      props: { content: '```mermaid\ngraph TD\nA-->B\n```', theme: 'dark' },
      global: { plugins: [pinia] },
    });

    await flushRender();
    expect(renderMermaidMock).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      'dark',
      'forest',
      '#aabbcc',
      'paper-soft',
    );
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
    expect(queryBody('[data-testid="preview-menu-theme-mint-grove"]')).not.toBeNull();
    expect(queryBody('[data-testid="preview-menu-theme-lavender-letter"]')).not.toBeNull();
    expect(queryBody('[data-testid="preview-menu-theme-deep-ocean"]')).not.toBeNull();
    expect(themeTrigger).not.toBeNull();
    expect(alternateTheme).not.toBeNull();
    expect(themeTrigger?.getAttribute('disabled')).not.toBeNull();

    alternateTheme?.click();
    expect(settingsStore.markdownPreviewTheme).toBe('graphite-night');
    wrapper.unmount();
  });

  it('应应用新增的深海蓝调预览风格', async () => {
    const settingsStore = useSettingsStore();
    const wrapper = mount(MarkdownPreview, {
      attachTo: document.body,
      props: {
        content: 'ocean theme',
        theme: 'dark',
      },
      global: {
        plugins: [pinia],
      },
    });

    await flushRender();
    await openContextMenu(wrapper);
    const deepOceanOption = queryBody('[data-testid="preview-menu-theme-deep-ocean"]');
    expect(deepOceanOption).not.toBeNull();
    deepOceanOption?.click();
    await flushPromises();
    await nextTick();

    expect(settingsStore.markdownPreviewTheme).toBe('deep-ocean');
    expect(wrapper.get('[data-testid="markdown-preview"]').classes()).toContain('markdown-preview--deep-ocean');
    await openContextMenu(wrapper);
    expect(getMenuElement()?.classList.contains('markdown-preview--deep-ocean')).toBe(true);
    expect(queryBody('[data-testid="preview-menu-theme-deep-ocean"]')?.hasAttribute('disabled')).toBe(true);
    wrapper.unmount();
  });

  it('右键菜单应通过 body teleport 渲染以避免预览面板位移动画影响定位', async () => {
    const settingsStore = useSettingsStore();
    await settingsStore.updateSettings({ markdownPreviewTheme: 'paper-soft' });
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
    expect(menu?.classList.contains('markdown-preview--paper-soft')).toBe(true);
    expect(getMenuStyle()).toContain('top: 185px');
    expect(getMenuStyle()).toContain('left: 135px');
    wrapper.unmount();
  });
});
