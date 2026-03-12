/**
 * EditorTabs.vue 组件单元测试
 * 
 * 测试标签页管理组件的核心功能：
 * - 标签页渲染
 * - 标签页切换
 * - 标签页关闭
 * - 右键菜单
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import EditorTabs from '@/components/editor/EditorTabs.vue'
import { useTabsStore, type Tab } from '@/stores/tabs'
import { useEditorStore } from '@/stores/editor'

// Mock EditorCore 组件
vi.mock('@/components/editor/EditorCore.vue', () => ({
  default: {
    name: 'EditorCore',
    template: '<div data-testid="editor-core"></div>',
    props: ['modelId', 'language'],
  },
}))

describe('EditorTabs.vue', () => {
  let tabsStore: ReturnType<typeof useTabsStore>
  let editorStore: ReturnType<typeof useEditorStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    tabsStore = useTabsStore()
    editorStore = useEditorStore()

    vi.clearAllMocks()
  })

  const createTabs = (count: number) => {
    for (let i = 1; i <= count; i++) {
      tabsStore.addTab({
        filePath: `/test/file${i}.txt`,
        fileName: `file${i}.txt`,
        language: 'plaintext',
        isDirty: false,
      })
    }
  }

  describe('渲染', () => {
    it('应显示标签页容器', () => {
      const wrapper = mount(EditorTabs)

      expect(wrapper.find('.editor-tabs').exists()).toBe(true)
    })

    it('应显示标签列表', () => {
      createTabs(3)
      const wrapper = mount(EditorTabs)

      const tabs = wrapper.findAll('.tab')
      expect(tabs.length).toBe(3)
    })

    it('应高亮活动标签页', () => {
      createTabs(3)
      tabsStore.activateTab(tabsStore.tabs[1].id)
      const wrapper = mount(EditorTabs)

      const activeTab = wrapper.find('.tab.active')
      expect(activeTab.exists()).toBe(true)
    })

    it('应显示文件名', () => {
      createTabs(1)
      const wrapper = mount(EditorTabs)

      expect(wrapper.find('.tab-name').text()).toBe('file1.txt')
    })

    it('应显示脏状态指示器', () => {
      tabsStore.addTab({
        filePath: '/test/file.txt',
        fileName: 'file.txt',
        language: 'plaintext',
        isDirty: true,
      })
      const wrapper = mount(EditorTabs)

      expect(wrapper.find('.tab-icon svg').exists()).toBe(true)
    })

    it('不应显示干净标签的脏状态指示器', () => {
      tabsStore.addTab({
        filePath: '/test/file.txt',
        fileName: 'file.txt',
        language: 'plaintext',
        isDirty: false,
      })
      const wrapper = mount(EditorTabs)

      expect(wrapper.find('.tab-icon svg').exists()).toBe(false)
    })

    it('应显示关闭按钮', () => {
      createTabs(1)
      const wrapper = mount(EditorTabs)

      expect(wrapper.find('.tab-close').exists()).toBe(true)
    })

    it('无标签时应显示空状态', () => {
      const wrapper = mount(EditorTabs)

      expect(wrapper.find('.empty-state').exists()).toBe(true)
      expect(wrapper.find('.empty-text').text()).toBe('打开文件开始编辑')
    })
  })

  describe('标签页交互', () => {
    it('点击标签应激活对应标签页', async () => {
      createTabs(3)
      const wrapper = mount(EditorTabs)

      await wrapper.findAll('.tab')[1].trigger('click')

      expect(tabsStore.activeTabId).toBe(tabsStore.tabs[1].id)
    })

    it('点击标签应发射 tab-click 事件', async () => {
      createTabs(3)
      const wrapper = mount(EditorTabs)

      await wrapper.findAll('.tab')[1].trigger('click')

      expect(wrapper.emitted('tab-click')).toBeTruthy()
      expect(wrapper.emitted('tab-click')![0]).toEqual([tabsStore.tabs[1].id])
    })

    it('点击关闭按钮应关闭标签页', async () => {
      createTabs(3)
      const tabId = tabsStore.tabs[1].id
      const wrapper = mount(EditorTabs)

      await wrapper.findAll('.tab-close')[1].trigger('click')

      expect(tabsStore.tabs.find(t => t.id === tabId)).toBeUndefined()
    })

    it('点击关闭按钮应发射 tab-close 事件', async () => {
      createTabs(3)
      const tabId = tabsStore.tabs[1].id
      const wrapper = mount(EditorTabs)

      await wrapper.findAll('.tab-close')[1].trigger('click')

      expect(wrapper.emitted('tab-close')).toBeTruthy()
      expect(wrapper.emitted('tab-close')![0]).toEqual([tabId])
    })

    it('关闭按钮点击应阻止事件冒泡', async () => {
      createTabs(3)
      const wrapper = mount(EditorTabs)

      const closeEvent = await wrapper.findAll('.tab-close')[1].trigger('click')

      expect(closeEvent.stopPropagation).toHaveBeenCalled()
    })
  })

  describe('右键菜单', () => {
    it('右键点击标签应显示菜单', async () => {
      createTabs(1)
      const wrapper = mount(EditorTabs)

      await wrapper.find('.tab').trigger('contextmenu', {
        clientX: 100,
        clientY: 200,
      })

      expect(wrapper.find('.context-menu').exists()).toBe(true)
    })

    it('右键菜单应在点击位置显示', async () => {
      createTabs(1)
      const wrapper = mount(EditorTabs)

      await wrapper.find('.tab').trigger('contextmenu', {
        clientX: 100,
        clientY: 200,
      })

      const menu = wrapper.find('.context-menu')
      expect(menu.attributes('style')).toContain('top: 200px')
      expect(menu.attributes('style')).toContain('left: 100px')
    })

    it('点击其他地方应关闭菜单', async () => {
      createTabs(1)
      const wrapper = mount(EditorTabs)

      await wrapper.find('.tab').trigger('contextmenu')
      await wrapper.trigger('click')

      expect(wrapper.find('.context-menu').exists()).toBe(false)
    })

    it('选择"关闭其他"应关闭非活动标签', async () => {
      createTabs(3)
      const wrapper = mount(EditorTabs)

      await wrapper.findAll('.tab')[1].trigger('contextmenu')
      await wrapper.find('.context-menu-item').trigger('click')

      expect(tabsStore.tabs.length).toBe(1)
      expect(tabsStore.tabs[0].id).toBe(tabsStore.tabs[1].id)
    })

    it('选择"关闭其他"应发射 tab-close-others 事件', async () => {
      createTabs(3)
      const tabId = tabsStore.tabs[1].id
      const wrapper = mount(EditorTabs)

      await wrapper.findAll('.tab')[1].trigger('contextmenu')
      await wrapper.find('.context-menu-item').trigger('click')

      expect(wrapper.emitted('tab-close-others')).toBeTruthy()
      expect(wrapper.emitted('tab-close-others')![0]).toEqual([tabId])
    })

    it('选择"关闭所有"应关闭全部标签', async () => {
      createTabs(3)
      const wrapper = mount(EditorTabs)

      await wrapper.find('.tab').trigger('contextmenu')
      await wrapper.findAll('.context-menu-item')[1].trigger('click')

      expect(tabsStore.tabs.length).toBe(0)
    })

    it('选择"关闭所有"应发射 tab-close-all 事件', async () => {
      createTabs(3)
      const wrapper = mount(EditorTabs)

      await wrapper.find('.tab').trigger('contextmenu')
      await wrapper.findAll('.context-menu-item')[1].trigger('click')

      expect(wrapper.emitted('tab-close-all')).toBeTruthy()
    })
  })

  describe('内容变化处理', () => {
    it('内容变化应更新标签脏状态', async () => {
      createTabs(1)
      const tabId = tabsStore.tabs[0].id
      const wrapper = mount(EditorTabs)

      await wrapper.vm.$emit('content-change', 'new content')
      await flushPromises()

      expect(tabsStore.tabs[0].isDirty).toBe(true)
    })
  })

  describe('光标变化处理', () => {
    it('光标变化应更新 store', async () => {
      createTabs(1)
      const wrapper = mount(EditorTabs)

      await wrapper.vm.$emit('cursor-change', { line: 5, column: 10 })
      await flushPromises()

      expect(editorStore.cursorPosition).toEqual({ line: 5, column: 10 })
    })
  })

  describe('保存处理', () => {
    it('保存事件应清除脏状态', async () => {
      tabsStore.addTab({
        filePath: '/test/file.txt',
        fileName: 'file.txt',
        language: 'plaintext',
        isDirty: true,
      })
      const wrapper = mount(EditorTabs)

      await wrapper.vm.$emit('model-save')
      await flushPromises()

      expect(tabsStore.tabs[0].isDirty).toBe(false)
    })

    it('保存事件应标记 editor 为已保存', async () => {
      createTabs(1)
      const wrapper = mount(EditorTabs)

      await wrapper.vm.$emit('model-save')
      await flushPromises()

      expect(editorStore.isDirty).toBe(false)
    })
  })

  describe('错误处理', () => {
    it('应捕获并记录编辑器错误', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const wrapper = mount(EditorTabs)

      const testError = new Error('Test error')
      await wrapper.vm.$emit('error', testError)

      expect(consoleSpy).toHaveBeenCalledWith('Editor error:', testError)

      consoleSpy.mockRestore()
    })
  })

  describe('组件生命周期', () => {
    it('挂载时应添加点击事件监听器', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener')

      mount(EditorTabs)

      expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function))

      addEventListenerSpy.mockRestore()
    })

    it('卸载时应移除点击事件监听器', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')

      const wrapper = mount(EditorTabs)
      wrapper.unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function))

      removeEventListenerSpy.mockRestore()
    })
  })
})
