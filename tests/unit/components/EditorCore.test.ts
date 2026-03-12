/**
 * EditorCore.vue 组件单元测试
 * 
 * 测试 Monaco 编辑器组件的核心功能：
 * - Monaco 挂载
 * - 内容绑定
 * - 光标追踪
 * - 快捷键
 * - 暴露方法
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import EditorCore from '@/components/editor/EditorCore.vue'
import { useEditorStore } from '@/stores/editor'
import { useSettingsStore } from '@/stores/settings'

// Mock Monaco Editor
const mockCreate = vi.fn()
const mockDispose = vi.fn()
const mockGetValue = vi.fn()
const mockSetValue = vi.fn()
const mockFocus = vi.fn()
const mockLayout = vi.fn()
const mockGetSelection = vi.fn()
const mockGetModel = vi.fn()
const mockGetValueInRange = vi.fn()
const mockOnDidChangeModelContent = vi.fn()
const mockOnDidChangeCursorPosition = vi.fn()
const mockOnDidChangeCursorSelection = vi.fn()
const mockOnDidChangeModel = vi.fn()
const mockAddCommand = vi.fn()
const mockUpdateOptions = vi.fn()
const mockSetTheme = vi.fn()

vi.mock('monaco-editor', () => ({
  editor: {
    create: mockCreate,
    setTheme: mockSetTheme,
  },
  KeyMod: {
    CtrlCmd: 2048,
  },
  KeyCode: {
    KeyS: 49,
  },
}))

describe('EditorCore.vue', () => {
  let editorStore: ReturnType<typeof useEditorStore>
  let settingsStore: ReturnType<typeof useSettingsStore>
  let mockEditor: any

  beforeEach(() => {
    setActivePinia(createPinia())
    editorStore = useEditorStore()
    settingsStore = useSettingsStore()

    // 重置所有 mocks
    vi.clearAllMocks()

    // 创建 mock 编辑器实例
    mockEditor = {
      getValue: mockGetValue,
      setValue: mockSetValue,
      focus: mockFocus,
      layout: mockLayout,
      getSelection: mockGetSelection,
      getModel: mockGetModel,
      onDidChangeModelContent: mockOnDidChangeModelContent,
      onDidChangeCursorPosition: mockOnDidChangeCursorPosition,
      onDidChangeCursorSelection: mockOnDidChangeCursorSelection,
      onDidChangeModel: mockOnDidChangeModel,
      addCommand: mockAddCommand,
      updateOptions: mockUpdateOptions,
      dispose: mockDispose,
    }

    // 配置 create 返回 mock 编辑器
    mockCreate.mockReturnValue(mockEditor)
    mockGetValue.mockReturnValue('')
    mockGetSelection.mockReturnValue(null)
    mockGetModel.mockReturnValue({
      getValueInRange: mockGetValueInRange,
    })
  })

  describe('初始化', () => {
    it('应在挂载时创建 Monaco 编辑器', async () => {
      const wrapper = mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      expect(mockCreate).toHaveBeenCalled()
    })

    it('应使用容器元素创建编辑器', async () => {
      const wrapper = mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      expect(mockCreate).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.any(Object)
      )
    })

    it('应使用默认配置创建编辑器', async () => {
      const wrapper = mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      expect(mockCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          language: 'plaintext',
          theme: 'vs-dark',
          readOnly: false,
          automaticLayout: true,
        })
      )
    })

    it('应使用自定义语言配置', async () => {
      mount(EditorCore, {
        props: {
          modelId: 'test-1',
          language: 'typescript',
        },
      })

      await flushPromises()

      expect(mockCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          language: 'typescript',
        })
      )
    })

    it('应使用自定义主题配置', async () => {
      mount(EditorCore, {
        props: {
          modelId: 'test-1',
          theme: 'vs-light',
        },
      })

      await flushPromises()

      expect(mockCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          theme: 'vs-light',
        })
      )
    })

    it('应使用只读配置', async () => {
      mount(EditorCore, {
        props: {
          modelId: 'test-1',
          readOnly: true,
        },
      })

      await flushPromises()

      expect(mockCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          readOnly: true,
        })
      )
    })
  })

  describe('内容绑定', () => {
    it('应监听内容变化事件', async () => {
      const wrapper = mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      // 模拟内容变化回调
      const contentChangeCallback = mockOnDidChangeModelContent.mock.calls[0][0]
      mockGetValue.mockReturnValue('new content')

      contentChangeCallback()

      expect(wrapper.emitted('content-change')).toBeTruthy()
      expect(wrapper.emitted('content-change')![0]).toEqual(['new content'])
    })

    it('应更新 store 内容', async () => {
      mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      const contentChangeCallback = mockOnDidChangeModelContent.mock.calls[0][0]
      mockGetValue.mockReturnValue('test content')

      contentChangeCallback()

      expect(editorStore.content).toBe('test content')
    })
  })

  describe('光标追踪', () => {
    it('应监听光标位置变化', async () => {
      const wrapper = mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      expect(mockOnDidChangeCursorPosition).toHaveBeenCalled()
    })

    it('应发射光标变化事件', async () => {
      const wrapper = mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      const cursorCallback = mockOnDidChangeCursorPosition.mock.calls[0][0]
      cursorCallback({
        position: { lineNumber: 5, column: 10 },
      })

      expect(wrapper.emitted('cursor-change')).toBeTruthy()
      expect(wrapper.emitted('cursor-change')![0]).toEqual([{ line: 5, column: 10 }])
    })

    it('应更新 store 光标位置', async () => {
      mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      const cursorCallback = mockOnDidChangeCursorPosition.mock.calls[0][0]
      cursorCallback({
        position: { lineNumber: 5, column: 10 },
      })

      expect(editorStore.cursorPosition).toEqual({ line: 5, column: 10 })
    })
  })

  describe('选择区域追踪', () => {
    it('应监听选择变化', async () => {
      mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      expect(mockOnDidChangeCursorSelection).toHaveBeenCalled()
    })

    it('应更新 store 选择区域', async () => {
      mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      const mockModel = {
        getValueInRange: vi.fn().mockReturnValue('selected'),
        getOffsetAt: vi.fn()
          .mockReturnValueOnce(10)
          .mockReturnValueOnce(20),
      }
      mockGetModel.mockReturnValue(mockModel)
      mockGetSelection.mockReturnValue({
        getStartPosition: vi.fn(),
        getEndPosition: vi.fn(),
      })

      const selectionCallback = mockOnDidChangeCursorSelection.mock.calls[0][0]
      selectionCallback()

      expect(editorStore.selection).toEqual({ start: 10, end: 20 })
    })
  })

  describe('撤销重做状态', () => {
    it('应监听模型变化', async () => {
      mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      expect(mockOnDidChangeModel).toHaveBeenCalled()
    })

    it('应更新撤销重做状态', async () => {
      const mockEditorWithUndo = {
        ...mockEditor,
        hasUndoStack: vi.fn().mockReturnValue(true),
        hasRedoStack: vi.fn().mockReturnValue(false),
      }
      mockCreate.mockReturnValue(mockEditorWithUndo)

      mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      const modelCallback = mockOnDidChangeModel.mock.calls[0][0]
      modelCallback()

      expect(editorStore.canUndo).toBe(true)
      expect(editorStore.canRedo).toBe(false)
    })
  })

  describe('快捷键', () => {
    it('应注册保存快捷键', async () => {
      mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      expect(mockAddCommand).toHaveBeenCalledWith(
        expect.any(Number), // CtrlCmd | KeyS
        expect.any(Function)
      )
    })

    it('保存快捷键应触发 model-save 事件', async () => {
      const wrapper = mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      const saveCommand = mockAddCommand.mock.calls[0][1]
      saveCommand()

      expect(wrapper.emitted('model-save')).toBeTruthy()
    })
  })

  describe('暴露的方法', () => {
    it('应暴露 getContent 方法', async () => {
      mockGetValue.mockReturnValue('test content')

      const wrapper = mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      const content = wrapper.vm.getContent()
      expect(content).toBe('test content')
    })

    it('应暴露 setContent 方法', async () => {
      const wrapper = mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      wrapper.vm.setContent('new content')

      expect(mockSetValue).toHaveBeenCalledWith('new content')
    })

    it('应暴露 focus 方法', async () => {
      const wrapper = mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      wrapper.vm.focus()

      expect(mockFocus).toHaveBeenCalled()
    })

    it('应暴露 layout 方法', async () => {
      const wrapper = mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      wrapper.vm.layout()

      expect(mockLayout).toHaveBeenCalled()
    })

    it('应暴露 getSelectedText 方法', async () => {
      const mockModel = {
        getValueInRange: vi.fn().mockReturnValue('selected text'),
      }
      mockGetModel.mockReturnValue(mockModel)
      mockGetSelection.mockReturnValue({
        getStartPosition: vi.fn(),
        getEndPosition: vi.fn(),
      })

      const wrapper = mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      const selectedText = wrapper.vm.getSelectedText()
      expect(selectedText).toBe('selected text')
    })

    it('getSelectedText 在无选择时应返回空字符串', async () => {
      mockGetSelection.mockReturnValue(null)

      const wrapper = mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      const selectedText = wrapper.vm.getSelectedText()
      expect(selectedText).toBe('')
    })
  })

  describe('主题切换', () => {
    it('应响应主题 prop 变化', async () => {
      const wrapper = mount(EditorCore, {
        props: {
          modelId: 'test-1',
          theme: 'vs-dark',
        },
      })

      await flushPromises()

      await wrapper.setProps({ theme: 'vs-light' })

      expect(mockSetTheme).toHaveBeenCalledWith('vs-light')
    })
  })

  describe('设置同步', () => {
    it('应响应设置变化', async () => {
      const wrapper = mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      settingsStore.minimap = false
      await flushPromises()

      expect(mockUpdateOptions).toHaveBeenCalled()
    })
  })

  describe('销毁', () => {
    it('应在卸载时销毁编辑器', async () => {
      const wrapper = mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()
      wrapper.unmount()

      expect(mockDispose).toHaveBeenCalled()
    })

    it('应将编辑器引用设为 null', async () => {
      const wrapper = mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()
      wrapper.unmount()

      // 验证编辑器已清理
      expect(mockDispose).toHaveBeenCalled()
    })
  })

  describe('错误处理', () => {
    it('应捕获初始化错误', async () => {
      const testError = new Error('Failed to initialize')
      mockCreate.mockImplementation(() => {
        throw testError
      })

      const wrapper = mount(EditorCore, {
        props: {
          modelId: 'test-1',
        },
      })

      await flushPromises()

      expect(wrapper.emitted('error')).toBeTruthy()
      expect(wrapper.emitted('error')![0][0]).toBe(testError)
    })
  })
})
