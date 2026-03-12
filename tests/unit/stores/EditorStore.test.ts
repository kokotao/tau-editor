/**
 * EditorStore 单元测试
 * 
 * 测试编辑器状态管理的核心功能：
 * - 内容管理
 * - 光标位置
 * - 选择区域
 * - 撤销重做状态
 * - 语言模式
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useEditorStore } from '@/stores/editor'

describe('EditorStore', () => {
  let store: ReturnType<typeof useEditorStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useEditorStore()
  })

  describe('初始状态', () => {
    it('应初始化为空内容', () => {
      expect(store.content).toBe('')
    })

    it('应初始化语言为 plaintext', () => {
      expect(store.language).toBe('plaintext')
    })

    it('应初始化编码为 utf-8', () => {
      expect(store.encoding).toBe('utf-8')
    })

    it('应初始化光标位置为 (1, 1)', () => {
      expect(store.cursorPosition).toEqual({ line: 1, column: 1 })
    })

    it('应初始化选择区域为 null', () => {
      expect(store.selection).toBeNull()
    })

    it('应初始化只读模式为 false', () => {
      expect(store.isReadOnly).toBe(false)
    })

    it('应初始化脏状态为 false', () => {
      expect(store.isDirty).toBe(false)
    })

    it('应初始化撤销状态为 false', () => {
      expect(store.canUndo).toBe(false)
    })

    it('应初始化重做状态为 false', () => {
      expect(store.canRedo).toBe(false)
    })

    it('应初始化缩放级别为 1', () => {
      expect(store.zoomLevel).toBe(1)
    })
  })

  describe('内容管理', () => {
    it('setContent() 应更新内容', () => {
      store.setContent('Hello World')

      expect(store.content).toBe('Hello World')
    })

    it('setContent() 应标记为脏状态', () => {
      store.setContent('Hello World')

      expect(store.isDirty).toBe(true)
    })

    it('setContent() 覆盖空内容应标记为脏', () => {
      store.setContent('')

      expect(store.isDirty).toBe(true)
    })

    it('markAsSaved() 应清除脏状态', () => {
      store.setContent('Hello World')
      store.markAsSaved()

      expect(store.isDirty).toBe(false)
    })

    it('markAsSaved() 不应改变内容', () => {
      store.setContent('Hello World')
      store.markAsSaved()

      expect(store.content).toBe('Hello World')
    })
  })

  describe('光标位置', () => {
    it('updateCursorPosition() 应更新光标位置', () => {
      store.updateCursorPosition(5, 10)

      expect(store.cursorPosition).toEqual({ line: 5, column: 10 })
    })

    it('updateCursorPosition() 应接受最小值 (1, 1)', () => {
      store.updateCursorPosition(1, 1)

      expect(store.cursorPosition).toEqual({ line: 1, column: 1 })
    })

    it('updateCursorPosition() 应接受大值', () => {
      store.updateCursorPosition(1000, 200)

      expect(store.cursorPosition).toEqual({ line: 1000, column: 200 })
    })
  })

  describe('选择区域', () => {
    it('updateSelection() 应设置选择区域', () => {
      store.updateSelection(10, 20)

      expect(store.selection).toEqual({ start: 10, end: 20 })
    })

    it('updateSelection() 空选择应设为 null', () => {
      store.updateSelection(10, 10)

      expect(store.selection).toBeNull()
    })

    it('updateSelection() 应更新选择区域', () => {
      store.updateSelection(10, 20)
      store.updateSelection(30, 40)

      expect(store.selection).toEqual({ start: 30, end: 40 })
    })
  })

  describe('语言模式', () => {
    it('setLanguage() 应更新语言', () => {
      store.setLanguage('typescript')

      expect(store.language).toBe('typescript')
    })

    it('setLanguage() 应支持常见语言', () => {
      const languages = ['javascript', 'python', 'markdown', 'json', 'html', 'css']

      languages.forEach(lang => {
        store.setLanguage(lang)
        expect(store.language).toBe(lang)
      })
    })
  })

  describe('撤销重做状态', () => {
    it('updateUndoRedoState() 应更新撤销状态', () => {
      store.updateUndoRedoState(true, false)

      expect(store.canUndo).toBe(true)
      expect(store.canRedo).toBe(false)
    })

    it('updateUndoRedoState() 应更新重做状态', () => {
      store.updateUndoRedoState(false, true)

      expect(store.canUndo).toBe(false)
      expect(store.canRedo).toBe(true)
    })

    it('updateUndoRedoState() 应同时更新两个状态', () => {
      store.updateUndoRedoState(true, true)

      expect(store.canUndo).toBe(true)
      expect(store.canRedo).toBe(true)
    })
  })

  describe('只读模式', () => {
    it('setReadOnly(true) 应启用只读模式', () => {
      store.setReadOnly(true)

      expect(store.isReadOnly).toBe(true)
    })

    it('setReadOnly(false) 应禁用只读模式', () => {
      store.setReadOnly(true)
      store.setReadOnly(false)

      expect(store.isReadOnly).toBe(false)
    })
  })

  describe('缩放级别', () => {
    it('setZoomLevel() 应更新缩放级别', () => {
      store.setZoomLevel(1.5)

      expect(store.zoomLevel).toBe(1.5)
    })

    it('setZoomLevel() 应限制最小值为 0.5', () => {
      store.setZoomLevel(0.1)

      expect(store.zoomLevel).toBe(0.5)
    })

    it('setZoomLevel() 应限制最大值为 2', () => {
      store.setZoomLevel(3)

      expect(store.zoomLevel).toBe(2)
    })

    it('setZoomLevel() 应接受边界值 0.5', () => {
      store.setZoomLevel(0.5)

      expect(store.zoomLevel).toBe(0.5)
    })

    it('setZoomLevel() 应接受边界值 2', () => {
      store.setZoomLevel(2)

      expect(store.zoomLevel).toBe(2)
    })
  })

  describe('重置状态', () => {
    beforeEach(() => {
      store.setContent('Test content')
      store.setLanguage('typescript')
      store.updateCursorPosition(10, 20)
      store.updateSelection(5, 15)
      store.setReadOnly(true)
      store.updateUndoRedoState(true, true)
    })

    it('reset() 应清空内容', () => {
      store.reset()

      expect(store.content).toBe('')
    })

    it('reset() 应重置语言为 plaintext', () => {
      store.reset()

      expect(store.language).toBe('plaintext')
    })

    it('reset() 应重置光标位置为 (1, 1)', () => {
      store.reset()

      expect(store.cursorPosition).toEqual({ line: 1, column: 1 })
    })

    it('reset() 应清空选择区域', () => {
      store.reset()

      expect(store.selection).toBeNull()
    })

    it('reset() 应清除脏状态', () => {
      store.reset()

      expect(store.isDirty).toBe(false)
    })

    it('reset() 应重置撤销状态', () => {
      store.reset()

      expect(store.canUndo).toBe(false)
      expect(store.canRedo).toBe(false)
    })

    it('reset() 不应改变只读模式', () => {
      store.reset()

      expect(store.isReadOnly).toBe(true)
    })

    it('reset() 不应改变缩放级别', () => {
      store.reset()

      expect(store.zoomLevel).toBe(1)
    })
  })

  describe('Getters', () => {
    describe('currentLine', () => {
      it('应返回当前行内容', () => {
        store.setContent('line1\nline2\nline3')
        store.updateCursorPosition(2, 1)

        expect(store.currentLine).toBe('line2')
      })

      it('应返回第一行内容', () => {
        store.setContent('line1\nline2\nline3')
        store.updateCursorPosition(1, 1)

        expect(store.currentLine).toBe('line1')
      })

      it('空内容应返回空字符串', () => {
        store.updateCursorPosition(1, 1)

        expect(store.currentLine).toBe('')
      })

      it('超出范围应返回空字符串', () => {
        store.setContent('line1')
        store.updateCursorPosition(10, 1)

        expect(store.currentLine).toBe('')
      })
    })

    describe('selectedText', () => {
      it('应返回选中的文本', () => {
        store.setContent('Hello World')
        store.updateSelection(0, 5)

        expect(store.selectedText).toBe('Hello')
      })

      it('无选择应返回空字符串', () => {
        store.setContent('Hello World')

        expect(store.selectedText).toBe('')
      })

      it('应返回多行选中文本', () => {
        store.setContent('line1\nline2\nline3')
        store.updateSelection(0, 11)

        expect(store.selectedText).toBe('line1\nline2')
      })
    })

    describe('lineCount', () => {
      it('应返回总行数', () => {
        store.setContent('line1\nline2\nline3')

        expect(store.lineCount).toBe(3)
      })

      it('空内容应返回 1 行', () => {
        expect(store.lineCount).toBe(1)
      })

      it('单行内容应返回 1 行', () => {
        store.setContent('single line')

        expect(store.lineCount).toBe(1)
      })

      it('末尾换行应计算在内', () => {
        store.setContent('line1\nline2\n')

        expect(store.lineCount).toBe(3)
      })
    })
  })
})
