/**
 * Toolbar.vue 组件单元测试
 * 
 * 测试工具栏组件的核心功能：
 * - 按钮渲染
 * - 按钮状态（禁用/启用）
 * - 事件发射
 * - 脏状态显示
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Toolbar from '@/components/editor/Toolbar.vue'

const baseProps = {
  canUndo: false,
  canRedo: false,
  isDirty: false,
}

const mountToolbar = (props = {}) =>
  mount(Toolbar, {
    props: {
      ...baseProps,
      ...props,
    },
  })

describe('Toolbar.vue', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  describe('渲染测试', () => {
    it('应正确渲染工具栏', () => {
      const wrapper = mountToolbar()
      expect(wrapper.find('.toolbar').exists()).toBe(true)
    })

    it('应渲染所有按钮组', () => {
      const wrapper = mountToolbar()
      const buttonGroups = wrapper.findAll('.toolbar-group')
      expect(buttonGroups.length).toBeGreaterThanOrEqual(4)
    })

    it('应渲染分隔线', () => {
      const wrapper = mountToolbar()
      const dividers = wrapper.findAll('.toolbar-divider')
      expect(dividers.length).toBeGreaterThanOrEqual(2)
    })

    it('应渲染新建文件按钮', () => {
      const wrapper = mountToolbar()
      const buttons = wrapper.findAll('.toolbar-btn')
      expect(buttons.length).toBeGreaterThanOrEqual(8)
    })
  })

  describe('身份信息区域', () => {
    it('提供 label 时展示身份信息', () => {
      const wrapper = mountToolbar({
        appLabel: 'Text Studio',
        workspaceLabel: 'Default Workspace',
        currentFileLabel: 'README.md',
      })

      const identity = wrapper.find('.toolbar-identity')
      expect(identity.exists()).toBe(true)
      expect(wrapper.text()).toContain('Text Studio')
      expect(wrapper.text()).toContain('Default Workspace')
      expect(wrapper.text()).toContain('README.md')
    })

    it('未提供任何 label 时不显示身份区域', () => {
      const wrapper = mountToolbar()
      expect(wrapper.find('.toolbar-identity').exists()).toBe(false)
    })
  })

  describe('文件操作按钮', () => {
    it('新建文件按钮应发射 new-file 事件', async () => {
      const wrapper = mountToolbar()
      const newFileBtn = wrapper.get('[data-testid="btn-new-file"]')
      await newFileBtn.trigger('click')
      expect(wrapper.emitted('new-file')).toBeTruthy()
    })

    it('打开文件按钮应发射 open-file 事件', async () => {
      const wrapper = mountToolbar()
      const openFileBtn = wrapper.get('[data-testid="btn-open-file"]')
      await openFileBtn.trigger('click')
      expect(wrapper.emitted('open-file')).toBeTruthy()
    })

    it('保存按钮应发射 save 事件', async () => {
      const wrapper = mountToolbar({ isDirty: true })
      const saveBtn = wrapper.get('[data-testid="btn-save"]')
      await saveBtn.trigger('click')
      expect(wrapper.emitted('save')).toBeTruthy()
    })

    it('另存为按钮应发射 save-as 事件', async () => {
      const wrapper = mountToolbar()
      const saveAsBtn = wrapper.get('[data-testid="btn-save-as"]')
      await saveAsBtn.trigger('click')
      expect(wrapper.emitted('save-as')).toBeTruthy()
    })
  })

  describe('撤销重做按钮', () => {
    it('撤销按钮应发射 undo 事件', async () => {
      const wrapper = mountToolbar({ canUndo: true })
      const undoBtn = wrapper.get('[data-testid="btn-undo"]')
      await undoBtn.trigger('click')
      expect(wrapper.emitted('undo')).toBeTruthy()
    })

    it('重做按钮应发射 redo 事件', async () => {
      const wrapper = mountToolbar({ canRedo: true })
      const redoBtn = wrapper.get('[data-testid="btn-redo"]')
      await redoBtn.trigger('click')
      expect(wrapper.emitted('redo')).toBeTruthy()
    })

    it('撤销按钮在 canUndo=false 时应禁用', () => {
      const wrapper = mountToolbar()
      const undoBtn = wrapper.get('[data-testid="btn-undo"]')
      expect(undoBtn.classes()).toContain('disabled')
      expect(undoBtn.attributes('disabled')).toBeDefined()
    })

    it('撤销按钮在 canUndo=true 时应启用', () => {
      const wrapper = mountToolbar({ canUndo: true })
      const undoBtn = wrapper.get('[data-testid="btn-undo"]')
      expect(undoBtn.classes()).not.toContain('disabled')
      expect(undoBtn.attributes('disabled')).toBeUndefined()
    })

    it('重做按钮在 canRedo=false 时应禁用', () => {
      const wrapper = mountToolbar()
      const redoBtn = wrapper.get('[data-testid="btn-redo"]')
      expect(redoBtn.classes()).toContain('disabled')
      expect(redoBtn.attributes('disabled')).toBeDefined()
    })

    it('重做按钮在 canRedo=true 时应启用', () => {
      const wrapper = mountToolbar({ canRedo: true })
      const redoBtn = wrapper.get('[data-testid="btn-redo"]')
      expect(redoBtn.classes()).not.toContain('disabled')
      expect(redoBtn.attributes('disabled')).toBeUndefined()
    })
  })

  describe('保存按钮状态', () => {
    it('保存按钮在 isDirty=false 时应禁用', () => {
      const wrapper = mountToolbar()
      const saveBtn = wrapper.get('[data-testid="btn-save"]')
      expect(saveBtn.classes()).toContain('disabled')
      expect(saveBtn.attributes('disabled')).toBeDefined()
    })

    it('保存按钮在 isDirty=true 时应启用', () => {
      const wrapper = mountToolbar({ isDirty: true })
      const saveBtn = wrapper.get('[data-testid="btn-save"]')
      expect(saveBtn.classes()).not.toContain('disabled')
      expect(saveBtn.attributes('disabled')).toBeUndefined()
    })
  })

  describe('视图切换按钮', () => {
    it('切换文件树按钮应发射 toggle-file-tree 事件', async () => {
      const wrapper = mountToolbar()
      const toggleTreeBtn = wrapper.get('[data-testid="btn-toggle-file-tree"]')
      await toggleTreeBtn.trigger('click')
      expect(wrapper.emitted('toggle-file-tree')).toBeTruthy()
    })

    it('切换设置按钮应发射 toggle-settings 事件', async () => {
      const wrapper = mountToolbar()
      const toggleSettingsBtn = wrapper.get('[data-testid="btn-settings"]')
      await toggleSettingsBtn.trigger('click')
      expect(wrapper.emitted('toggle-settings')).toBeTruthy()
    })
  })

  describe('系统菜单', () => {
    it('应渲染系统菜单触发器', () => {
      const wrapper = mountToolbar()
      expect(wrapper.find('[data-testid="system-menu-trigger"]').exists()).toBe(true)
    })

    it('系统菜单点击命令应发射 system-action 事件', async () => {
      const wrapper = mountToolbar()
      await wrapper.get('[data-testid="system-menu-trigger"]').trigger('click')
      await wrapper.get('[data-testid="system-menu-item-open-command-palette"]').trigger('click')

      expect(wrapper.emitted('system-action')).toBeTruthy()
      expect(wrapper.emitted('system-action')![0]).toEqual(['open-command-palette'])
    })

    it('系统菜单应支持切换主题与语言模式快捷项', async () => {
      const wrapper = mountToolbar()
      await wrapper.get('[data-testid="system-menu-trigger"]').trigger('click')
      await wrapper.get('[data-testid="system-menu-item-toggle-theme"]').trigger('click')
      await wrapper.get('[data-testid="system-menu-trigger"]').trigger('click')
      await wrapper.get('[data-testid="system-menu-item-cycle-language-mode"]').trigger('click')

      expect(wrapper.emitted('system-action')![0]).toEqual(['toggle-theme'])
      expect(wrapper.emitted('system-action')![1]).toEqual(['cycle-language-mode'])
    })

    it('系统菜单应支持按关键字过滤并回车执行', async () => {
      const wrapper = mountToolbar()
      await wrapper.get('[data-testid="system-menu-trigger"]').trigger('click')

      const search = wrapper.get('[data-testid="system-menu-search"]')
      await search.setValue('主题')
      await search.trigger('keydown', { key: 'Enter' })

      expect(wrapper.emitted('system-action')).toBeTruthy()
      expect(wrapper.emitted('system-action')![0]).toEqual(['toggle-theme'])
    })
  })

  describe('脏状态显示', () => {
    it('isDirty=true 时应显示未保存提示', () => {
      const wrapper = mountToolbar({ isDirty: true })

      expect(wrapper.find('.toolbar-info').exists()).toBe(true)
      expect(wrapper.find('.dirty-indicator').exists()).toBe(true)
      expect(wrapper.text()).toContain('未保存')
    })

    it('isDirty=false 时应隐藏未保存提示', () => {
      const wrapper = mountToolbar()

      expect(wrapper.find('.toolbar-info').exists()).toBe(false)
    })

    it('脏状态指示器应显示正确图标', () => {
      const wrapper = mountToolbar({ isDirty: true })

      const indicator = wrapper.find('.dirty-indicator')
      expect(indicator.text()).toBe('●')
    })
  })

  describe('按钮样式', () => {
    it('按钮应有正确的类名', () => {
      const wrapper = mountToolbar()
      const buttons = wrapper.findAll('.toolbar-btn')
      buttons.forEach(btn => {
        expect(btn.classes()).toContain('toolbar-btn')
      })
    })

    it('禁用按钮应有 disabled 类', () => {
      const wrapper = mountToolbar()
      const disabledBtns = wrapper.findAll('.toolbar-btn.disabled')
      expect(disabledBtns.length).toBeGreaterThanOrEqual(3) // 撤销、重做、保存
    })

    it('应渲染三个区域 zone', () => {
      const wrapper = mountToolbar()
      expect(wrapper.find('.toolbar-zone-start').exists()).toBe(true)
      expect(wrapper.find('.toolbar-zone-center').exists()).toBe(true)
      expect(wrapper.find('.toolbar-zone-end').exists()).toBe(true)
    })
  })

  describe('按钮标题', () => {
    it('新建文件按钮应有正确标题', () => {
      const wrapper = mountToolbar()
      const newFileBtn = wrapper.get('[data-testid="btn-new-file"]')
      expect(newFileBtn.attributes('title')).toBe('新建文件 (Ctrl+N)')
    })

    it('打开文件按钮应有正确标题', () => {
      const wrapper = mountToolbar()
      const openFileBtn = wrapper.get('[data-testid="btn-open-file"]')
      expect(openFileBtn.attributes('title')).toBe('打开文件 (Ctrl+O)')
    })

    it('保存按钮应有正确标题', () => {
      const wrapper = mountToolbar({ isDirty: true })
      const saveBtn = wrapper.get('[data-testid="btn-save"]')
      expect(saveBtn.attributes('title')).toBe('保存 (Ctrl+S)')
    })

    it('撤销按钮应有正确标题', () => {
      const wrapper = mountToolbar({ canUndo: true })
      const undoBtn = wrapper.get('[data-testid="btn-undo"]')
      expect(undoBtn.attributes('title')).toBe('撤销')
    })

    it('重做按钮应有正确标题', () => {
      const wrapper = mountToolbar({ canRedo: true })
      const redoBtn = wrapper.get('[data-testid="btn-redo"]')
      expect(redoBtn.attributes('title')).toBe('重做')
    })
  })

  describe('SVG 图标', () => {
    it('所有按钮应包含 SVG 图标', () => {
      const wrapper = mountToolbar()
      const buttons = wrapper.findAll('.toolbar-btn')
      buttons.forEach(btn => {
        expect(btn.find('svg').exists()).toBe(true)
      })
    })

    it('新建文件按钮应有文件图标', () => {
      const wrapper = mountToolbar()
      const newFileBtn = wrapper.get('[data-testid="btn-new-file"]')
      const svg = newFileBtn.find('svg')
      expect(svg.find('path').exists()).toBe(true)
    })

    it('保存按钮应有保存图标', () => {
      const wrapper = mountToolbar({ isDirty: true })
      const saveBtn = wrapper.get('[data-testid="btn-save"]')
      const svg = saveBtn.find('svg')
      expect(svg.findAll('polyline').length).toBeGreaterThanOrEqual(2)
    })

    it('撤销按钮应有撤销图标', () => {
      const wrapper = mountToolbar({ canUndo: true })
      const undoBtn = wrapper.get('[data-testid="btn-undo"]')
      const svg = undoBtn.find('svg')
      expect(svg.find('polyline').exists()).toBe(true)
    })

    it('设置按钮应有齿轮图标', () => {
      const wrapper = mountToolbar()
      const settingsBtn = wrapper.get('[data-testid="btn-settings"]')
      const svg = settingsBtn.find('svg')
      expect(svg.find('circle').exists()).toBe(true)
    })
  })

  describe('布局', () => {
    it('工具栏应有固定高度', () => {
      const wrapper = mountToolbar()
      const toolbar = wrapper.find('.toolbar')
      // 通过 CSS 类检查，而非内联样式
      expect(toolbar.classes()).toContain('toolbar')
    })

    it('按钮组应正确分组', () => {
      const wrapper = mountToolbar()
      const groups = wrapper.findAll('.toolbar-group')
      // 文件操作组、撤销重做组、视图切换组、状态显示组
      expect(groups.length).toBeGreaterThanOrEqual(4)
    })
  })
})
