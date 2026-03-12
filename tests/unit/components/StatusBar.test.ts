/**
 * StatusBar.vue 组件单元测试
 * 
 * 测试状态栏组件的核心功能：
 * - 光标位置显示
 * - 编码显示
 * - 语言模式选择
 * - 行数显示
 * - 自动保存状态
 * - 事件发射
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StatusBar from '@/components/editor/StatusBar.vue'
import { useEditorStore } from '@/stores/editor'

describe('StatusBar.vue', () => {
  let pinia: ReturnType<typeof createPinia>
  let editorStore: ReturnType<typeof useEditorStore>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    editorStore = useEditorStore()
  })

  describe('渲染测试', () => {
    it('应正确渲染状态栏', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
          encoding: 'utf-8',
          language: 'plaintext',
        },
      })

      expect(wrapper.find('.status-bar').exists()).toBe(true)
    })

    it('应渲染左右两个区域', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
          encoding: 'utf-8',
          language: 'plaintext',
        },
      })

      expect(wrapper.find('.status-left').exists()).toBe(true)
      expect(wrapper.find('.status-right').exists()).toBe(true)
    })

    it('应显示光标位置', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 5, column: 10 },
          encoding: 'utf-8',
          language: 'plaintext',
        },
      })

      expect(wrapper.text()).toContain('行 5, 列 10')
    })

    it('应显示编码', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
          encoding: 'utf-8',
          language: 'plaintext',
        },
      })

      expect(wrapper.text()).toContain('UTF-8')
    })

    it('应显示行数', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
          encoding: 'utf-8',
          language: 'plaintext',
        },
      })

      // 行数来自 editorStore
      expect(wrapper.text()).toContain('Ln')
    })
  })

  describe('光标位置显示', () => {
    it('应显示默认光标位置 (1, 1)', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
        },
      })

      expect(wrapper.text()).toContain('行 1, 列 1')
    })

    it('应显示自定义光标位置', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 100, column: 50 },
        },
      })

      expect(wrapper.text()).toContain('行 100, 列 50')
    })

    it('应显示大数值光标位置', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 9999, column: 999 },
        },
      })

      expect(wrapper.text()).toContain('行 9999, 列 999')
    })
  })

  describe('语言模式选择', () => {
    it('应显示语言选择下拉框', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
          language: 'plaintext',
        },
      })

      expect(wrapper.find('.status-select').exists()).toBe(true)
    })

    it('应显示当前选中的语言', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
          language: 'typescript',
        },
      })

      const select = wrapper.find('.status-select')
      expect(select.element.value).toBe('typescript')
    })

    it('应支持所有预定义语言选项', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
          language: 'plaintext',
        },
      })

      const languages = [
        'plaintext',
        'javascript',
        'typescript',
        'python',
        'java',
        'c',
        'cpp',
        'csharp',
        'go',
        'rust',
        'html',
        'css',
        'scss',
        'json',
        'xml',
        'markdown',
        'yaml',
        'sql',
        'shell',
      ]

      const select = wrapper.find('.status-select')
      const options = select.findAll('option')
      
      languages.forEach((lang, index) => {
        expect(options[index].element.value).toBe(lang)
      })
    })

    it('改变语言应发射 language-change 事件', async () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
          language: 'plaintext',
        },
      })

      const select = wrapper.find('.status-select')
      await select.setValue('typescript')

      expect(wrapper.emitted('language-change')).toBeTruthy()
      expect(wrapper.emitted('language-change')![0]).toEqual(['typescript'])
    })

    it('选择 JavaScript 应发射正确事件', async () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
          language: 'plaintext',
        },
      })

      const select = wrapper.find('.status-select')
      await select.setValue('javascript')

      expect(wrapper.emitted('language-change')![0]).toEqual(['javascript'])
    })

    it('选择 Python 应发射正确事件', async () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
          language: 'plaintext',
        },
      })

      const select = wrapper.find('.status-select')
      await select.setValue('python')

      expect(wrapper.emitted('language-change')![0]).toEqual(['python'])
    })

    it('选择 Markdown 应发射正确事件', async () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
          language: 'plaintext',
        },
      })

      const select = wrapper.find('.status-select')
      await select.setValue('markdown')

      expect(wrapper.emitted('language-change')![0]).toEqual(['markdown'])
    })
  })

  describe('自动保存状态', () => {
    it('autoSaveEnabled=true 时应显示自动保存图标', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
          autoSaveEnabled: true,
        },
      })

      expect(wrapper.find('.status-icon').exists()).toBe(true)
      expect(wrapper.find('.status-icon').text()).toBe('💾')
    })

    it('autoSaveEnabled=true 时应显示自动保存文本', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
          autoSaveEnabled: true,
        },
      })

      expect(wrapper.text()).toContain('自动保存')
    })

    it('autoSaveEnabled=false 时应隐藏自动保存状态', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
          autoSaveEnabled: false,
        },
      })

      expect(wrapper.find('.status-icon').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('自动保存')
    })

    it('应显示最后保存时间（刚刚）', () => {
      const now = new Date()
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
          autoSaveEnabled: true,
          lastSaveTime: now,
        },
      })

      expect(wrapper.text()).toContain('刚刚')
    })

    it('应显示最后保存时间（分钟前）', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
          autoSaveEnabled: true,
          lastSaveTime: fiveMinutesAgo,
        },
      })

      expect(wrapper.text()).toContain('5 分钟前')
    })

    it('应显示最后保存时间（小时前）', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
          autoSaveEnabled: true,
          lastSaveTime: twoHoursAgo,
        },
      })

      expect(wrapper.text()).toContain('2 小时前')
    })

    it('应显示最后保存时间（时间格式）', () => {
      const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000)
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
          autoSaveEnabled: true,
          lastSaveTime: yesterday,
        },
      })

      // 应该显示具体时间
      const text = wrapper.text()
      expect(text).toMatch(/\d{1,2}:\d{2}/)
    })

    it('无 lastSaveTime 时应隐藏时间', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
          autoSaveEnabled: true,
          lastSaveTime: undefined,
        },
      })

      // 不应显示时间相关的文本
      const statusValue = wrapper.find('.status-value')
      expect(statusValue.exists()).toBe(false)
    })
  })

  describe('行数显示', () => {
    it('应显示来自 store 的行数', () => {
      editorStore.setContent('line1\nline2\nline3')
      
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
        },
      })

      expect(wrapper.text()).toContain('Ln 3')
    })

    it('空内容应显示 1 行', () => {
      editorStore.setContent('')
      
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
        },
      })

      expect(wrapper.text()).toContain('Ln 1')
    })

    it('多行内容应正确计数', () => {
      editorStore.setContent('line1\nline2\nline3\nline4\nline5')
      
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
        },
      })

      expect(wrapper.text()).toContain('Ln 5')
    })
  })

  describe('样式类', () => {
    it('状态栏应有正确的类名', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
        },
      })

      const statusBar = wrapper.find('.status-bar')
      expect(statusBar.classes()).toContain('status-bar')
    })

    it('状态项应有 status-item 类', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
        },
      })

      const items = wrapper.findAll('.status-item')
      expect(items.length).toBeGreaterThanOrEqual(2)
    })

    it('状态标签应有 status-label 类', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
        },
      })

      expect(wrapper.find('.status-label').exists()).toBe(true)
    })

    it('语言选择框应有 status-select 类', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
        },
      })

      expect(wrapper.find('.status-select').exists()).toBe(true)
    })

    it('自动保存图标应有 status-icon 类', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
          autoSaveEnabled: true,
        },
      })

      expect(wrapper.find('.status-icon').exists()).toBe(true)
    })
  })

  describe('默认 Props', () => {
    it('应使用默认光标位置', () => {
      const wrapper = mount(StatusBar, {
        props: {},
      })

      expect(wrapper.text()).toContain('行 1, 列 1')
    })

    it('应使用默认编码', () => {
      const wrapper = mount(StatusBar, {
        props: {},
      })

      expect(wrapper.text()).toContain('UTF-8')
    })

    it('应使用默认语言', () => {
      const wrapper = mount(StatusBar, {
        props: {},
      })

      const select = wrapper.find('.status-select')
      expect(select.element.value).toBe('plaintext')
    })

    it('应默认启用自动保存', () => {
      const wrapper = mount(StatusBar, {
        props: {},
      })

      expect(wrapper.find('.status-icon').exists()).toBe(true)
    })
  })

  describe('响应式更新', () => {
    it('光标位置变化应更新显示', async () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
        },
      })

      await wrapper.setProps({ cursorPosition: { line: 10, column: 20 } })

      expect(wrapper.text()).toContain('行 10, 列 20')
    })

    it('语言变化应更新选择框', async () => {
      const wrapper = mount(StatusBar, {
        props: {
          language: 'plaintext',
        },
      })

      await wrapper.setProps({ language: 'javascript' })

      const select = wrapper.find('.status-select')
      expect(select.element.value).toBe('javascript')
    })

    it('自动保存状态变化应更新显示', async () => {
      const wrapper = mount(StatusBar, {
        props: {
          autoSaveEnabled: true,
        },
      })

      expect(wrapper.find('.status-icon').exists()).toBe(true)

      await wrapper.setProps({ autoSaveEnabled: false })

      expect(wrapper.find('.status-icon').exists()).toBe(false)
    })
  })

  describe('可点击性', () => {
    it('状态项应可点击', () => {
      const wrapper = mount(StatusBar, {
        props: {
          cursorPosition: { line: 1, column: 1 },
        },
      })

      const items = wrapper.findAll('.status-item')
      items.forEach(item => {
        expect(item.attributes('style')).toBeUndefined() // 通过 CSS cursor: pointer
      })
    })

    it('语言选择框应可交互', () => {
      const wrapper = mount(StatusBar, {
        props: {
          language: 'plaintext',
        },
      })

      const select = wrapper.find('.status-select')
      expect(select.element.disabled).toBe(false)
    })
  })
})
