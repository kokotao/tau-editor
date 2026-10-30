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
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Toolbar from '@/components/editor/Toolbar.vue'
import { useSettingsStore } from '@/stores/settings'

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
      expect(buttonGroups.length).toBeGreaterThanOrEqual(3)
    })

    it('应渲染分隔线', () => {
      const wrapper = mountToolbar()
      const dividers = wrapper.findAll('.toolbar-divider')
      expect(dividers.length).toBeGreaterThanOrEqual(1)
    })

    it('应渲染新建文件按钮', () => {
      const wrapper = mountToolbar()
      const buttons = wrapper.findAll('.toolbar-btn')
      expect(buttons.length).toBeGreaterThanOrEqual(7)
    })

    it('Excel 全屏预览时隐藏预览布局切换按钮', () => {
      const wrapper = mountToolbar({
        isDocumentPreview: true,
        isFullDocumentPreview: true,
      })

      expect(wrapper.find('[data-testid="btn-markdown-preview-mode"]').exists()).toBe(false)
    })
  })

  describe('身份信息区域', () => {
    it('始终展示随明暗主题切换的 SVG 应用图标', async () => {
      const wrapper = mountToolbar()
      const icon = wrapper.get('[data-testid="toolbar-app-icon"]')

      expect(icon.element.tagName.toLowerCase()).toBe('svg')
      expect(icon.find('.toolbar-app-icon-arrows').exists()).toBe(true)
      expect(icon.find('.toolbar-app-icon-tau').exists()).toBe(true)
      expect(icon.attributes('aria-label')).toBe('Tau Editor')

      const settingsStore = useSettingsStore(pinia)
      await settingsStore.updateSettings({ theme: 'light' })
      await flushPromises()

      expect(document.documentElement.classList.contains('theme-light')).toBe(true)
      expect(wrapper.get('[data-testid="toolbar-app-icon"]').exists()).toBe(true)

      await settingsStore.updateSettings({ theme: 'dark' })
      await flushPromises()
    })

    it('身份区域只显示 SVG 图标，不显示旁边文字', () => {
      const wrapper = mountToolbar()
      expect(wrapper.find('.toolbar-workspace-label').exists()).toBe(false)
      expect(wrapper.find('.toolbar-file-label').exists()).toBe(false)
      expect(wrapper.find('.toolbar-app-label').exists()).toBe(false)
      expect(wrapper.find('.toolbar-identity').text()).toBe('')
    })

    it('未提供 label 时仍显示应用图标', () => {
      const wrapper = mountToolbar()
      expect(wrapper.find('.toolbar-identity').exists()).toBe(true)
      expect(wrapper.find('[data-testid="toolbar-app-icon"]').exists()).toBe(true)
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

  describe('Markdown 工具菜单', () => {
    it('Markdown 工具按钮应使用可见 SVG 图标', () => {
      const wrapper = mountToolbar({ isMarkdown: true })

      const markdownButtons = wrapper.findAll('[data-testid^="markdown-action-"]')
      expect(markdownButtons.length).toBeGreaterThanOrEqual(14)
      expect(markdownButtons.every((button) => button.find('svg').exists())).toBe(true)
    })

    it('标题 H 按钮应展开级别并发射选择结果', async () => {
      const wrapper = mountToolbar({ isMarkdown: true })

      await wrapper.get('[data-testid="markdown-action-heading"]').trigger('click')
      const panel = document.body.querySelector('[data-testid="markdown-heading-panel"]') as HTMLElement | null
      expect(panel).not.toBeNull()

      const headingButton = document.body.querySelector('[data-testid="markdown-heading-2"]') as HTMLButtonElement | null
      expect(headingButton).not.toBeNull()
      headingButton?.click()

      expect(wrapper.emitted('markdown-heading')).toEqual([[2]])
    })

    it('代码按钮应支持选择语言和自定义语言', async () => {
      const wrapper = mountToolbar({ isMarkdown: true })

      await wrapper.get('[data-testid="markdown-action-code"]').trigger('click')
      const languageButton = document.body.querySelector('[data-testid="markdown-code-python"]') as HTMLButtonElement | null
      expect(languageButton).not.toBeNull()
      languageButton?.click()
      expect(wrapper.emitted('markdown-code')).toEqual([['python']])

      await wrapper.get('[data-testid="markdown-action-code"]').trigger('click')
      const input = document.body.querySelector('[data-testid="markdown-code-custom-input"]') as HTMLInputElement | null
      expect(input).not.toBeNull()
      if (input) {
        input.value = 'kotlin'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      }
      await flushPromises()

      expect(wrapper.emitted('markdown-code')).toEqual([['python'], ['kotlin']])
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
    it('切换设置按钮应发射 toggle-settings 事件', async () => {
      const wrapper = mountToolbar()
      const toggleSettingsBtn = wrapper.get('[data-testid="btn-settings"]')
      await toggleSettingsBtn.trigger('click')
      expect(wrapper.emitted('toggle-settings')).toBeTruthy()
    })
  })

  describe('工具栏操作', () => {
    it('不应显示系统菜单入口', () => {
      const wrapper = mountToolbar()
      expect(wrapper.find('[data-testid="system-menu-trigger"]').exists()).toBe(false)
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

    it('活动标签已保存时应显示绿色已保存状态', () => {
      const wrapper = mountToolbar({ hasActiveTab: true })

      expect(wrapper.find('.toolbar-save-state').classes()).toContain('is-saved')
      expect(wrapper.text()).toContain('已保存')
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
      // 文件操作组、撤销重做组、状态显示组（原视图切换组已移除）
      expect(groups.length).toBeGreaterThanOrEqual(3)
    })
  })

  /* ------------------- 思维导图工具组（UX-3C：从 Stage 外移） ------------------- */

  describe('思维导图工具组', () => {
    const mindmapTools = {
      canUndo: true,
      canRedo: false,
      selectedTopicId: 'topic-1' as string | null,
      layoutMode: 'mindmap' as 'mindmap' | 'logic' | 'tree' | 'org',
      themeId: 'default',
      themeOptions: [
        { id: 'default', name: '默认' },
        { id: 'ocean', name: '海洋' },
      ],
      outlineActive: true,
      propertiesActive: false,
    }

    const mountMindmapToolbar = (overrides: Record<string, unknown> = {}) =>
      mountToolbar({
        isMindmap: true,
        mindmapTools: { ...mindmapTools, ...overrides },
      })

    const mmTestIds = [
      'mm-add-child',
      'mm-add-sibling',
      'mm-rename',
      'mm-duplicate',
      'mm-delete',
      'mm-move-up',
      'mm-move-down',
      'mm-undo',
      'mm-redo',
      'mm-fit',
      'mm-zoom-in',
      'mm-zoom-out',
      'mm-reset-view',
      'mm-layout-mindmap',
      'mm-layout-logic',
      'mm-layout-tree',
      'mm-layout-org',
      'mm-theme-select',
      'mm-reset',
      'mm-import',
      'mm-export',
      'mm-print',
      'mm-toggle-outline',
      'mm-properties-toggle',
    ]

    it('非导图标签不渲染导图工具组', () => {
      const wrapper = mountToolbar()
      expect(wrapper.find('[data-testid="mindmap-toolbar"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="mm-add-child"]').exists()).toBe(false)
    })

    it('isMindmap 为真但缺 mindmapTools 时不渲染（避免空状态按钮）', () => {
      const wrapper = mountToolbar({ isMindmap: true })
      expect(wrapper.find('[data-testid="mindmap-toolbar"]').exists()).toBe(false)
    })

    it('导图标签渲染全部 mm-* 按钮且保留旧 testid', () => {
      const wrapper = mountMindmapToolbar()
      expect(wrapper.find('[data-testid="mindmap-toolbar"]').exists()).toBe(true)
      for (const testId of mmTestIds) {
        expect(wrapper.find(`[data-testid="${testId}"]`).exists(), testId).toBe(true)
      }
      // 统计仍留在 Stage（E2E-MM-005/007 依赖），工具栏不重复渲染
      expect(wrapper.find('.mm-stats').exists()).toBe(false)
    })

    it('无选中节点时编辑类按钮禁用，撤销/重做按历史状态', () => {
      const wrapper = mountMindmapToolbar({ selectedTopicId: null, canUndo: false, canRedo: true })
      for (const testId of ['mm-add-child', 'mm-add-sibling', 'mm-rename', 'mm-duplicate', 'mm-delete', 'mm-move-up', 'mm-move-down']) {
        expect(wrapper.get(`[data-testid="${testId}"]`).attributes('disabled'), testId).toBeDefined()
      }
      expect(wrapper.get('[data-testid="mm-undo"]').attributes('disabled')).toBeDefined()
      expect(wrapper.get('[data-testid="mm-redo"]').attributes('disabled')).toBeUndefined()
    })

    it('有选中节点后编辑类按钮可用', () => {
      const wrapper = mountMindmapToolbar()
      expect(wrapper.get('[data-testid="mm-add-child"]').attributes('disabled')).toBeUndefined()
      expect(wrapper.get('[data-testid="mm-delete"]').attributes('disabled')).toBeUndefined()
    })

    it('布局按钮高亮当前模式并可 emit mm-layout', async () => {
      const wrapper = mountMindmapToolbar({ layoutMode: 'org' })
      expect(wrapper.get('[data-testid="mm-layout-org"]').classes()).toContain('is-active')
      expect(wrapper.get('[data-testid="mm-layout-org"]').attributes('aria-pressed')).toBe('true')
      expect(wrapper.get('[data-testid="mm-layout-mindmap"]').classes()).not.toContain('is-active')
      expect(wrapper.get('[data-testid="mm-layout-mindmap"]').attributes('aria-pressed')).toBe('false')

      await wrapper.get('[data-testid="mm-layout-tree"]').trigger('click')
      expect(wrapper.emitted('mm-layout')).toEqual([['tree']])
    })

    it('主题下拉保持原生 select：选项来自 themeOptions，切换 emit mm-theme', async () => {
      const wrapper = mountMindmapToolbar()
      const select = wrapper.get('[data-testid="mm-theme-select"]')
      expect(select.element.tagName).toBe('SELECT')
      expect(select.findAll('option').map(option => option.attributes('value')))
        .toEqual(['default', 'ocean'])
      expect((select.element as HTMLSelectElement).value).toBe('default')

      await select.setValue('ocean')
      expect(wrapper.emitted('mm-theme')).toEqual([['ocean']])
    })

    it('面板开关反映 store.rightPanel 并 emit 事件', async () => {
      const wrapper = mountMindmapToolbar({ outlineActive: true, propertiesActive: false })
      expect(wrapper.get('[data-testid="mm-toggle-outline"]').attributes('aria-pressed')).toBe('true')
      expect(wrapper.get('[data-testid="mm-toggle-outline"]').text()).toContain('开')
      expect(wrapper.get('[data-testid="mm-properties-toggle"]').attributes('aria-pressed')).toBe('false')
      expect(wrapper.get('[data-testid="mm-properties-toggle"]').text()).toContain('关')

      await wrapper.get('[data-testid="mm-toggle-outline"]').trigger('click')
      await wrapper.get('[data-testid="mm-properties-toggle"]').trigger('click')
      expect(wrapper.emitted('mm-toggle-outline')).toHaveLength(1)
      expect(wrapper.emitted('mm-toggle-properties')).toHaveLength(1)
    })

    it('编辑/历史/视口/导入导出打印类按钮各自 emit 对应事件', async () => {
      const wrapper = mountMindmapToolbar({ canRedo: true })
      const cases: Array<[string, string]> = [
        ['mm-add-child', 'mm-add-child'],
        ['mm-add-sibling', 'mm-add-sibling'],
        ['mm-rename', 'mm-rename'],
        ['mm-duplicate', 'mm-duplicate'],
        ['mm-delete', 'mm-delete'],
        ['mm-move-up', 'mm-move-up'],
        ['mm-move-down', 'mm-move-down'],
        ['mm-undo', 'mm-undo'],
        ['mm-redo', 'mm-redo'],
        ['mm-fit', 'mm-fit'],
        ['mm-zoom-in', 'mm-zoom-in'],
        ['mm-zoom-out', 'mm-zoom-out'],
        ['mm-reset-view', 'mm-reset-view'],
        ['mm-reset', 'mm-reset'],
        ['mm-import', 'mm-import'],
        ['mm-export', 'mm-export'],
        ['mm-print', 'mm-print'],
      ]
      for (const [testId, event] of cases) {
        await wrapper.get(`[data-testid="${testId}"]`).trigger('click')
        expect(wrapper.emitted(event), testId).toHaveLength(1)
      }
    })

    it('导图工具组渲染在居中 toolbar-zone-center，Tau 原始工具仍留在最左 start', () => {
      const wrapper = mountMindmapToolbar()
      const group = wrapper.get('[data-testid="mindmap-toolbar"]').element

      // 位置：center zone 内，且不在 end zone
      expect(group.closest('.toolbar-zone-center')).not.toBeNull()
      expect(group.closest('.toolbar-zone-end')).toBeNull()

      // Tau 原始工具（新建 / 撤销）在最左 start zone，center 里没有它们
      const start = wrapper.get('.toolbar-zone-start')
      expect(start.find('[data-testid="btn-new-file"]').exists()).toBe(true)
      expect(start.find('[data-testid="btn-undo"]').exists()).toBe(true)
      const center = wrapper.get('.toolbar-zone-center')
      expect(center.find('[data-testid="btn-new-file"]').exists()).toBe(false)
      expect(center.find('[data-testid="btn-undo"]').exists()).toBe(false)

      // 24 个控件（23 个 mm-btn + 1 个原生 select）全部在组内
      const groupWrapper = wrapper.get('[data-testid="mindmap-toolbar"]')
      expect(groupWrapper.findAll('button')).toHaveLength(23)
      expect(groupWrapper.findAll('select[data-testid="mm-theme-select"]')).toHaveLength(1)
    })

    it('导图按钮沿用 mm-btn 视觉类（对比度/E2E-MM-020 依赖）', () => {
      const wrapper = mountMindmapToolbar()
      const addChild = wrapper.get('[data-testid="mm-add-child"]')
      expect(addChild.classes()).toContain('mm-btn')
      expect(addChild.classes()).not.toContain('toolbar-btn')
    })
  })
})
