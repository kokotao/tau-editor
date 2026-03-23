/**
 * EditorCore.vue 组件单元测试（与当前实现对齐）
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { nextTick } from 'vue';
import { useEditorStore } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';

const monacoMocks = vi.hoisted(() => {
  return {
    create: vi.fn(),
    setTheme: vi.fn(),
    setModelLanguage: vi.fn(),
    remeasureFonts: vi.fn(),
  };
});

const monacoMockFactory = () => ({
  editor: {
    create: monacoMocks.create,
    setTheme: monacoMocks.setTheme,
    setModelLanguage: monacoMocks.setModelLanguage,
    remeasureFonts: monacoMocks.remeasureFonts,
  },
  KeyMod: {
    CtrlCmd: 2048,
  },
  KeyCode: {
    KeyS: 49,
  },
});

describe('EditorCore.vue', () => {
  let EditorCore: any;
  let editorStore: ReturnType<typeof useEditorStore>;
  let settingsStore: ReturnType<typeof useSettingsStore>;

  const mockDispose = vi.fn();
  const mockGetValue = vi.fn();
  const mockSetValue = vi.fn();
  const mockFocus = vi.fn();
  const mockLayout = vi.fn();
  const mockGetSelection = vi.fn();
  const mockGetModel = vi.fn();
  const mockGetAction = vi.fn();
  const mockGetScrollTop = vi.fn();
  const mockGetLayoutInfo = vi.fn();
  const mockGetScrollHeight = vi.fn();
  const mockAddCommand = vi.fn();
  const mockUpdateOptions = vi.fn();

  const mockOnDidChangeModelContent = vi.fn();
  const mockOnDidChangeCursorPosition = vi.fn();
  const mockOnDidChangeCursorSelection = vi.fn();
  const mockOnDidScrollChange = vi.fn();

  let contentCallbacks: Array<() => void> = [];
  let cursorCallback: ((event: { position: { lineNumber: number; column: number } }) => void) | null = null;
  let selectionCallback: (() => void) | null = null;
  let scrollCallback: (() => void) | null = null;

  beforeAll(async () => {
    vi.resetModules();
    vi.doMock('monaco-editor', monacoMockFactory);
    vi.doMock('monaco-editor/esm/vs/editor/editor.api', monacoMockFactory);
    vi.doMock('monaco-editor/esm/vs/editor/editor.api.js', monacoMockFactory);
    EditorCore = (await import('@/components/editor/EditorCore.vue')).default;
  });

  beforeEach(() => {
    setActivePinia(createPinia());
    editorStore = useEditorStore();
    settingsStore = useSettingsStore();

    vi.clearAllMocks();
    contentCallbacks = [];
    cursorCallback = null;
    selectionCallback = null;
    scrollCallback = null;

    const createDisposable = () => ({ dispose: vi.fn() });

    mockOnDidChangeModelContent.mockImplementation((cb: () => void) => {
      contentCallbacks.push(cb);
      return createDisposable();
    });

    mockOnDidChangeCursorPosition.mockImplementation((cb: (event: { position: { lineNumber: number; column: number } }) => void) => {
      cursorCallback = cb;
      return createDisposable();
    });

    mockOnDidChangeCursorSelection.mockImplementation((cb: () => void) => {
      selectionCallback = cb;
      return createDisposable();
    });

    mockOnDidScrollChange.mockImplementation((cb: () => void) => {
      scrollCallback = cb;
      return createDisposable();
    });

    mockGetValue.mockReturnValue('');
    mockGetSelection.mockReturnValue({
      getStartPosition: vi.fn(),
      getEndPosition: vi.fn(),
    });
    mockGetModel.mockReturnValue({
      getValueInRange: vi.fn().mockReturnValue('selected text'),
      getOffsetAt: vi
        .fn()
        .mockReturnValueOnce(10)
        .mockReturnValueOnce(20),
    });
    mockGetAction.mockReturnValue({
      run: vi.fn().mockResolvedValue(undefined),
      isSupported: vi.fn().mockReturnValue(true),
    });
    mockGetScrollTop.mockReturnValue(12);
    mockGetLayoutInfo.mockReturnValue({ height: 460 });
    mockGetScrollHeight.mockReturnValue(1200);

    monacoMocks.create.mockReturnValue({
      getValue: mockGetValue,
      setValue: mockSetValue,
      focus: mockFocus,
      layout: mockLayout,
      getSelection: mockGetSelection,
      getModel: mockGetModel,
      getAction: mockGetAction,
      getScrollTop: mockGetScrollTop,
      getLayoutInfo: mockGetLayoutInfo,
      getScrollHeight: mockGetScrollHeight,
      onDidChangeModelContent: mockOnDidChangeModelContent,
      onDidChangeCursorPosition: mockOnDidChangeCursorPosition,
      onDidChangeCursorSelection: mockOnDidChangeCursorSelection,
      onDidScrollChange: mockOnDidScrollChange,
      addCommand: mockAddCommand,
      updateOptions: mockUpdateOptions,
      dispose: mockDispose,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('挂载时应创建 Monaco 编辑器并带默认配置', async () => {
    mount(EditorCore, {
      props: { modelId: 'test-1' },
    });

    await flushPromises();

    expect(monacoMocks.create).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        language: 'plaintext',
        readOnly: false,
        automaticLayout: true,
        fontFamily: settingsStore.fontFamily,
      }),
    );
    expect(mockOnDidScrollChange).toHaveBeenCalled();
  });

  it('内容变化应发射事件并同步 store（节流）', async () => {
    vi.useFakeTimers();
    const wrapper = mount(EditorCore, {
      props: { modelId: 'test-2' },
    });

    await flushPromises();
    mockGetValue.mockReturnValue('new content');

    expect(contentCallbacks.length).toBeGreaterThanOrEqual(1);
    contentCallbacks[0]!();
    vi.advanceTimersByTime(55);
    await nextTick();

    expect(wrapper.emitted('content-change')).toBeTruthy();
    expect(editorStore.content).toBe('new content');
  });

  it('光标和选择变化应同步到 store', async () => {
    const wrapper = mount(EditorCore, {
      props: { modelId: 'test-3' },
    });

    await flushPromises();

    cursorCallback?.({ position: { lineNumber: 5, column: 10 } });
    selectionCallback?.();

    expect(wrapper.emitted('cursor-change')?.[0]).toEqual([{ line: 5, column: 10 }]);
    expect(editorStore.cursorPosition).toEqual({ line: 5, column: 10 });
    expect(editorStore.selection).toEqual({ start: 10, end: 20 });
  });

  it('应注册保存快捷键并触发 model-save', async () => {
    const wrapper = mount(EditorCore, {
      props: { modelId: 'test-4' },
    });

    await flushPromises();

    expect(mockAddCommand).toHaveBeenCalledWith(expect.any(Number), expect.any(Function));
    const saveCallback = mockAddCommand.mock.calls[0]?.[1] as (() => void);
    saveCallback();

    expect(wrapper.emitted('model-save')).toBeTruthy();
  });

  it('暴露方法应可用', async () => {
    mockGetValue.mockReturnValue('abc');
    const wrapper = mount(EditorCore, {
      props: { modelId: 'test-5' },
    });

    await flushPromises();
    const vm = wrapper.vm as any;

    expect(vm.getContent()).toBe('abc');
    vm.setContent('changed');
    vm.focus();
    vm.layout();
    expect(vm.getSelectedText()).toBe('selected text');

    expect(mockSetValue).toHaveBeenCalledWith('changed');
    expect(mockFocus).toHaveBeenCalled();
    expect(mockLayout).toHaveBeenCalled();
  });

  it('theme/language/readOnly 变化应同步到 Monaco', async () => {
    const wrapper = mount(EditorCore, {
      props: {
        modelId: 'test-6',
        theme: 'vs-dark',
        language: 'plaintext',
        readOnly: false,
      },
    });

    await flushPromises();

    await wrapper.setProps({ theme: 'vs', language: 'typescript', readOnly: true });
    await flushPromises();

    expect(monacoMocks.setTheme).toHaveBeenCalledWith('vs');
    expect(monacoMocks.setModelLanguage).toHaveBeenCalled();
    expect(mockUpdateOptions).toHaveBeenCalledWith({ readOnly: true });
  });

  it('设置变化应更新 editor options，字体家族变化应强制重测字体', async () => {
    mount(EditorCore, {
      props: { modelId: 'test-7' },
    });
    await flushPromises();

    mockUpdateOptions.mockClear();
    monacoMocks.remeasureFonts.mockClear();
    mockLayout.mockClear();

    settingsStore.minimap = false;
    settingsStore.fontFamily = "'Consolas', monospace";
    await flushPromises();

    expect(mockUpdateOptions).toHaveBeenCalled();
    expect(mockUpdateOptions).toHaveBeenCalledWith(expect.objectContaining({
      fontFamily: "'Consolas', monospace",
    }));
    expect(monacoMocks.remeasureFonts).toHaveBeenCalled();
    expect(mockLayout).toHaveBeenCalled();
  });

  it('卸载时应销毁编辑器', async () => {
    const wrapper = mount(EditorCore, {
      props: { modelId: 'test-8' },
    });

    await flushPromises();
    wrapper.unmount();

    expect(mockDispose).toHaveBeenCalled();
  });

  it('初始化异常应发射 error 事件', async () => {
    const testError = new Error('Failed to initialize');
    monacoMocks.create.mockImplementationOnce(() => {
      throw testError;
    });

    const wrapper = mount(EditorCore, {
      props: { modelId: 'test-9' },
    });

    await flushPromises();

    expect(wrapper.emitted('error')).toBeTruthy();
    expect(wrapper.emitted('error')?.[0]?.[0]).toBe(testError);
  });
});
