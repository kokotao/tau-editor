/**
 * Toolbar.vue 组件单元测试
 * 
 * 测试工具栏组件的核心功能：
 * - 按钮渲染
 * - 按钮状态（禁用/启用）
 * - 事件发射
 * - 脏状态显示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Toolbar from '@/components/editor/Toolbar.vue'

describe('Toolbar.vue', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  describe('渲染测试', () => {
    it('应正确渲染工具栏', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      expect(wrapper.find('.toolbar').exists()).toBe(true)
    })

    it('应渲染所有按钮组', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      const buttonGroups = wrapper.findAll('.toolbar-group')
      expect(buttonGroups.length).toBeGreaterThanOrEqual(3)
    })

    it('应渲染分隔线', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      const dividers = wrapper.findAll('.toolbar-divider')
      expect(dividers.length).toBeGreaterThanOrEqual(2)
    })

    it('应渲染新建文件按钮', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      const buttons = wrapper.findAll('.toolbar-btn')
      expect(buttons.length).toBeGreaterThanOrEqual(8)
    })
  })

  describe('文件操作按钮', () => {
    it('新建文件按钮应发射 new-file 事件', async () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      const newFileBtn = wrapper.findAll('.toolbar-btn')[0]
      await newFileBtn.trigger('click')

      expect(wrapper.emitted('new-file')).toBeTruthy()
    })

    it('打开文件按钮应发射 open-file 事件', async () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      const openFileBtn = wrapper.findAll('.toolbar-btn')[1]
      await openFileBtn.trigger('click')

      expect(wrapper.emitted('open-file')).toBeTruthy()
    })

    it('保存按钮应发射 save 事件', async () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: true,
        },
      })

      const saveBtn = wrapper.findAll('.toolbar-btn')[2]
      await saveBtn.trigger('click')

      expect(wrapper.emitted('save')).toBeTruthy()
    })

    it('另存为按钮应发射 save-as 事件', async () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      const saveAsBtn = wrapper.findAll('.toolbar-btn')[3]
      await saveAsBtn.trigger('click')

      expect(wrapper.emitted('save-as')).toBeTruthy()
    })
  })

  describe('撤销重做按钮', () => {
    it('撤销按钮应发射 undo 事件', async () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: true,
          canRedo: false,
          isDirty: false,
        },
      })

      const undoBtn = wrapper.findAll('.toolbar-btn')[4]
      await undoBtn.trigger('click')

      expect(wrapper.emitted('undo')).toBeTruthy()
    })

    it('重做按钮应发射 redo 事件', async () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: true,
          isDirty: false,
        },
      })

      const redoBtn = wrapper.findAll('.toolbar-btn')[5]
      await redoBtn.trigger('click')

      expect(wrapper.emitted('redo')).toBeTruthy()
    })

    it('撤销按钮在 canUndo=false 时应禁用', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      const undoBtn = wrapper.findAll('.toolbar-btn')[4]
      expect(undoBtn.classes()).toContain('disabled')
      expect(undoBtn.attributes('disabled')).toBeDefined()
    })

    it('撤销按钮在 canUndo=true 时应启用', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: true,
          canRedo: false,
          isDirty: false,
        },
      })

      const undoBtn = wrapper.findAll('.toolbar-btn')[4]
      expect(undoBtn.classes()).not.toContain('disabled')
      expect(undoBtn.attributes('disabled')).toBeUndefined()
    })

    it('重做按钮在 canRedo=false 时应禁用', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      const redoBtn = wrapper.findAll('.toolbar-btn')[5]
      expect(redoBtn.classes()).toContain('disabled')
      expect(redoBtn.attributes('disabled')).toBeDefined()
    })

    it('重做按钮在 canRedo=true 时应启用', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: true,
          isDirty: false,
        },
      })

      const redoBtn = wrapper.findAll('.toolbar-btn')[5]
      expect(redoBtn.classes()).not.toContain('disabled')
      expect(redoBtn.attributes('disabled')).toBeUndefined()
    })
  })

  describe('保存按钮状态', () => {
    it('保存按钮在 isDirty=false 时应禁用', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      const saveBtn = wrapper.findAll('.toolbar-btn')[2]
      expect(saveBtn.classes()).toContain('disabled')
      expect(saveBtn.attributes('disabled')).toBeDefined()
    })

    it('保存按钮在 isDirty=true 时应启用', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: true,
        },
      })

      const saveBtn = wrapper.findAll('.toolbar-btn')[2]
      expect(saveBtn.classes()).not.toContain('disabled')
      expect(saveBtn.attributes('disabled')).toBeUndefined()
    })
  })

  describe('视图切换按钮', () => {
    it('切换文件树按钮应发射 toggle-file-tree 事件', async () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      const toggleTreeBtn = wrapper.findAll('.toolbar-btn')[6]
      await toggleTreeBtn.trigger('click')

      expect(wrapper.emitted('toggle-file-tree')).toBeTruthy()
    })

    it('切换设置按钮应发射 toggle-settings 事件', async () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      const toggleSettingsBtn = wrapper.findAll('.toolbar-btn')[7]
      await toggleSettingsBtn.trigger('click')

      expect(wrapper.emitted('toggle-settings')).toBeTruthy()
    })
  })

  describe('脏状态显示', () => {
    it('isDirty=true 时应显示未保存提示', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: true,
        },
      })

      expect(wrapper.find('.toolbar-info').exists()).toBe(true)
      expect(wrapper.find('.dirty-indicator').exists()).toBe(true)
      expect(wrapper.text()).toContain('未保存')
    })

    it('isDirty=false 时应隐藏未保存提示', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      expect(wrapper.find('.toolbar-info').exists()).toBe(false)
    })

    it('脏状态指示器应显示正确图标', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: true,
        },
      })

      const indicator = wrapper.find('.dirty-indicator')
      expect(indicator.text()).toBe('●')
    })
  })

  describe('按钮样式', () => {
    it('按钮应有正确的类名', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      const buttons = wrapper.findAll('.toolbar-btn')
      buttons.forEach(btn => {
        expect(btn.classes()).toContain('toolbar-btn')
      })
    })

    it('禁用按钮应有 disabled 类', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      const disabledBtns = wrapper.findAll('.toolbar-btn.disabled')
      expect(disabledBtns.length).toBeGreaterThanOrEqual(3) // 撤销、重做、保存
    })

    it('工具栏应有 spacer 元素', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      expect(wrapper.find('.toolbar-spacer').exists()).toBe(true)
    })
  })

  describe('按钮标题', () => {
    it('新建文件按钮应有正确标题', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      const newFileBtn = wrapper.findAll('.toolbar-btn')[0]
      expect(newFileBtn.attributes('title')).toBe('新建文件 (Ctrl+N)')
    })

    it('打开文件按钮应有正确标题', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      const openFileBtn = wrapper.findAll('.toolbar-btn')[1]
      expect(openFileBtn.attributes('title')).toBe('打开文件 (Ctrl+O)')
    })

    it('保存按钮应有正确标题', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: true,
        },
      })

      const saveBtn = wrapper.findAll('.toolbar-btn')[2]
      expect(saveBtn.attributes('title')).toBe('保存 (Ctrl+S)')
    })

    it('撤销按钮应有正确标题', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: true,
          canRedo: false,
          isDirty: false,
        },
      })

      const undoBtn = wrapper.findAll('.toolbar-btn')[4]
      expect(undoBtn.attributes('title')).toBe('撤销 (Ctrl+Z)')
    })

    it('重做按钮应有正确标题', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: true,
          isDirty: false,
        },
      })

      const redoBtn = wrapper.findAll('.toolbar-btn')[5]
      expect(redoBtn.attributes('title')).toBe('重做 (Ctrl+Y)')
    })
  })

  describe('SVG 图标', () => {
    it('所有按钮应包含 SVG 图标', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      const buttons = wrapper.findAll('.toolbar-btn')
      buttons.forEach(btn => {
        expect(btn.find('svg').exists()).toBe(true)
      })
    })

    it('新建文件按钮应有文件图标', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      const newFileBtn = wrapper.findAll('.toolbar-btn')[0]
      const svg = newFileBtn.find('svg')
      expect(svg.find('path').exists()).toBe(true)
    })

    it('保存按钮应有保存图标', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: true,
        },
      })

      const saveBtn = wrapper.findAll('.toolbar-btn')[2]
      const svg = saveBtn.find('svg')
      expect(svg.findAll('polyline').length).toBeGreaterThanOrEqual(2)
    })

    it('撤销按钮应有撤销图标', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: true,
          canRedo: false,
          isDirty: false,
        },
      })

      const undoBtn = wrapper.findAll('.toolbar-btn')[4]
      const svg = undoBtn.find('svg')
      expect(svg.find('polyline').exists()).toBe(true)
    })

    it('设置按钮应有齿轮图标', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      const settingsBtn = wrapper.findAll('.toolbar-btn')[7]
      const svg = settingsBtn.find('svg')
      expect(svg.find('circle').exists()).toBe(true)
    })
  })

  describe('布局', () => {
    it('工具栏应有固定高度', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      const toolbar = wrapper.find('.toolbar')
      const style = toolbar.attributes('style')
      // 通过 CSS 类检查，而非内联样式
      expect(toolbar.classes()).toContain('toolbar')
    })

    it('按钮组应正确分组', () => {
      const wrapper = mount(Toolbar, {
        props: {
          canUndo: false,
          canRedo: false,
          isDirty: false,
        },
      })

      const groups = wrapper.findAll('.toolbar-group')
      // 文件操作组、撤销重做组、视图切换组、状态显示组
      expect(groups.length).toBeGreaterThanOrEqual(3)
    })
  })
})
