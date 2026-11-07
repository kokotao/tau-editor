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

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import StatusBar from '@/components/editor/StatusBar.vue'
import { useEditorStore } from '@/stores/editor'

const createMockEditorStore = () => {
  const content = ref('')
  const lineCount = computed(() => {
    if (!content.value) return 1
    return content.value.split('\n').length
  })

  return {
    lineCount,
    setContent(value: string) {
      content.value = value
    },
  }
}

let mockEditorStore = createMockEditorStore()

vi.mock('@/stores/editor', () => ({
  useEditorStore: () => mockEditorStore,
}))

describe('StatusBar.vue', () => {
  let editorStore: ReturnType<typeof useEditorStore>

  beforeEach(() => {
    mockEditorStore = createMockEditorStore()
    editorStore = useEditorStore()
  })

  describe('渲染测试', () => {
    it('应正确渲染状态栏', () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
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
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 1, column: 1 },
          encoding: 'utf-8',
          language: 'plaintext',
        },
      })

      expect(wrapper.find('.status-left').exists()).toBe(true)
      expect(wrapper.find('.status-right').exists()).toBe(true)
      expect(wrapper.find('.status-center').exists()).toBe(true)
    })

    it('思维导图作者、工作表宿主和快捷键位于同一状态栏行', () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {
          isMindmap: true,
          mindmapCharacterCount: 28,
          mindmapTopicCount: 7,
          mindmapRelationCount: 2,
          cursorPosition: { line: 1, column: 1 },
          encoding: 'utf-8',
          language: 'plaintext',
        },
      })

      expect(wrapper.find('[data-testid="author-info-trigger"]').exists()).toBe(true)
      expect(wrapper.find('#mindmap-sheet-bar-host').exists()).toBe(true)
      expect(wrapper.find('[data-testid="mindmap-status-section"]').element.parentElement)
        .toBe(wrapper.find('[data-testid="status-bar"]').element)
      expect(wrapper.findAll('.mindmap-status-shortcut')).toHaveLength(8)
      const shortcutLabels = wrapper.findAll('.mindmap-status-shortcut')
        .map((shortcut) => [shortcut.find('kbd').text(), shortcut.find('span').text()])
      expect(shortcutLabels).toContainEqual(['Enter', '新增节点'])
      expect(shortcutLabels).toContainEqual(['Tab', '新增子节点'])
      expect(wrapper.find('[data-testid="mindmap-character-count"]').text()).toBe('字符 28')
      expect(wrapper.find('[data-testid="mindmap-topic-count"]').text()).toBe('主题 7')
      expect(wrapper.find('[data-testid="mindmap-relation-count"]').text()).toBe('关系 2')
      expect(wrapper.find('[data-testid="cursor-position"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="line-count"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="word-count"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="theme-select"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="mindmap-language-mode"]').text()).toBe('思维导图')
      expect(wrapper.find('[data-testid="author-modal-overlay"]').exists()).toBe(false)
    })

    it('普通文档不显示思维导图快捷键或工作表宿主', () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 1, column: 1 },
          encoding: 'utf-8',
          language: 'plaintext',
        },
      })

      expect(wrapper.find('[data-testid="author-info-trigger"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="mindmap-status-section"]').attributes('style')).toContain('display: none')
      expect(wrapper.find('#mindmap-sheet-bar-host').exists()).toBe(true)
    })

    it('应显示光标位置', () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 5, column: 10 },
          encoding: 'utf-8',
          language: 'plaintext',
        },
      })

      expect(wrapper.text()).toContain('行 5, 列 10')
    })

    it('应显示编码（只读展示 UTF-8，不再提供会误导的编码下拉）', () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 1, column: 1 },
          encoding: 'utf-8',
          language: 'plaintext',
        },
      })

      const readonly = wrapper.find('[data-testid="encoding-readonly"]')
      expect(readonly.exists()).toBe(true)
      expect(readonly.text()).toBe('UTF-8')
      // 关键：不能有可选下拉，避免用户以为切换编码真的会转码
      expect(wrapper.find('[data-testid="encoding-select"]').exists()).toBe(false)
    })

    it('应显示行数', () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
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
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 1, column: 1 },
        },
      })

      expect(wrapper.text()).toContain('行 1, 列 1')
    })

    it('应显示自定义光标位置', () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 100, column: 50 },
        },
      })

      expect(wrapper.text()).toContain('行 100, 列 50')
    })

    it('应显示大数值光标位置', () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 9999, column: 999 },
        },
      })

      expect(wrapper.text()).toContain('行 9999, 列 999')
    })
  })

  describe('语言模式选择', () => {
    const mountLanguageBar = (language = 'plaintext') =>
      mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 1, column: 1 },
          language,
        },
      })

    const getLanguageSelect = (wrapper: ReturnType<typeof mount>) =>
      wrapper.find('[data-testid="language-mode-display"]')

    it('应显示语言选择下拉框', () => {
      const wrapper = mountLanguageBar()

      expect(getLanguageSelect(wrapper).exists()).toBe(true)
    })

    it('应显示当前选中的语言', () => {
      const wrapper = mountLanguageBar('typescript')

      const select = getLanguageSelect(wrapper)
      expect(select.attributes('data-value')).toBe('typescript')
    })

    it('应支持所有预定义语言选项', async () => {
      const wrapper = mountLanguageBar()

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

      const select = getLanguageSelect(wrapper)
      await select.trigger('click')

      languages.forEach((lang, index) => {
        expect(wrapper.find(`[data-testid="language-mode-display-option-${lang}"]`).exists()).toBe(true)
        expect(wrapper.findAll('[role="option"]')[index].attributes('aria-selected')).toBe(
          lang === 'plaintext' ? 'true' : 'false',
        )
      })
    })

    it('语言列表应使用可滚动的自绘菜单并通过方向键选择', async () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 1, column: 1 },
          language: 'plaintext',
        },
        attachTo: document.body,
      })

      await getLanguageSelect(wrapper).trigger('click')
      const menu = wrapper.get('[data-testid="language-mode-display-menu"]')
      expect(menu.attributes('style')).toContain('position: fixed')
      expect(menu.attributes('style')).toContain('visibility: visible')
      const selectedOption = wrapper.get('[data-testid="language-mode-display-option-plaintext"]')
      expect(selectedOption.attributes('aria-selected')).toBe('true')

      await selectedOption.trigger('keydown', { key: 'ArrowDown' })
      const javascriptOption = wrapper.get('[data-testid="language-mode-display-option-javascript"]')
      expect(document.activeElement).toBe(javascriptOption.element)

      await javascriptOption.trigger('keydown', { key: 'Enter' })
      expect(wrapper.emitted('language-change')?.[0]).toEqual(['javascript'])
      expect(wrapper.find('[data-testid="language-mode-display-menu"]').exists()).toBe(false)
      wrapper.unmount()
    })

    it('改变语言应发射 language-change 事件', async () => {
      const wrapper = mountLanguageBar()

      await getLanguageSelect(wrapper).trigger('click')
      await wrapper.get('[data-testid="language-mode-display-option-typescript"]').trigger('click')

      expect(wrapper.emitted('language-change')).toBeTruthy()
      expect(wrapper.emitted('language-change')![0]).toEqual(['typescript'])
    })

    it('选择 JavaScript 应发射正确事件', async () => {
      const wrapper = mountLanguageBar()

      await getLanguageSelect(wrapper).trigger('click')
      await wrapper.get('[data-testid="language-mode-display-option-javascript"]').trigger('click')

      expect(wrapper.emitted('language-change')![0]).toEqual(['javascript'])
    })

    it('选择 Python 应发射正确事件', async () => {
      const wrapper = mountLanguageBar()

      await getLanguageSelect(wrapper).trigger('click')
      await wrapper.get('[data-testid="language-mode-display-option-python"]').trigger('click')

      expect(wrapper.emitted('language-change')![0]).toEqual(['python'])
    })

    it('选择 Markdown 应发射正确事件', async () => {
      const wrapper = mountLanguageBar()

      await getLanguageSelect(wrapper).trigger('click')
      await wrapper.get('[data-testid="language-mode-display-option-markdown"]').trigger('click')

      expect(wrapper.emitted('language-change')![0]).toEqual(['markdown'])
    })
  })

  describe('编码展示（只读）', () => {
    const mountEncodingBar = (encoding = 'utf-8') =>
      mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 1, column: 1 },
          encoding,
        },
      })

    it('不再渲染可选下拉，只展示 UTF-8（避免「选了 GBK 却不转码」的误导）', () => {
      const wrapper = mountEncodingBar()
      expect(wrapper.find('[data-testid="encoding-select"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="encoding-readonly"]').text()).toBe('UTF-8')
    })

    it('即使传入其它编码值，也只展示 UTF-8（读写链路固定 UTF-8）', () => {
      const wrapper = mountEncodingBar('gbk')
      expect(wrapper.get('[data-testid="encoding-readonly"]').text()).toBe('UTF-8')
      expect(wrapper.find('[data-testid="encoding-select"]').exists()).toBe(false)
    })
  })

  describe('云端同步状态', () => {
    const mountWithCloudState = (
      cloudSyncState: 'synced' | 'saving' | 'failed' | 'offline' | null,
      cloudSyncError: string | null = null,
    ) =>
      mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 1, column: 1 },
          cloudSyncState,
          cloudSyncError,
        },
      })

    it('失败时必须渲染可见徽标（本地已保存但云端没落地，不能静默）', () => {
      const wrapper = mountWithCloudState('failed', '令牌已过期')
      const badge = wrapper.get('[data-testid="cloud-sync-failed"]')
      expect(badge.exists()).toBe(true)
      expect(badge.attributes('title')).toBe('令牌已过期')
    })

    it('点击失败徽标应请求重试', async () => {
      const wrapper = mountWithCloudState('failed')
      await wrapper.get('[data-testid="cloud-sync-failed"]').trigger('click')
      expect(wrapper.emitted('retry-cloud-sync')).toBeTruthy()
    })

    it('已同步/未登录时不显示失败徽标', () => {
      expect(mountWithCloudState('synced').find('[data-testid="cloud-sync-failed"]').exists()).toBe(false)
      expect(mountWithCloudState(null).find('[data-testid="cloud-sync-failed"]').exists()).toBe(false)
      expect(mountWithCloudState('offline').find('[data-testid="cloud-sync-failed"]').exists()).toBe(false)
    })
  })

  describe('自动保存状态', () => {
    it('autoSaveEnabled=true 时应显示自动保存图标', () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
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
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 1, column: 1 },
          autoSaveEnabled: true,
        },
      })

      expect(wrapper.text()).toContain('自动保存')
    })

    it('autoSaveEnabled=false 时应隐藏自动保存状态', () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
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
        global: { stubs: { teleport: true } },
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
        global: { stubs: { teleport: true } },
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
        global: { stubs: { teleport: true } },
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
        global: { stubs: { teleport: true } },
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
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 1, column: 1 },
          autoSaveEnabled: true,
          lastSaveTime: undefined,
        },
      })

      // 不应显示时间相关的文本（编码是只读文本，不算「时间」）
      expect(wrapper.find('[data-testid="auto-save-status"]').exists()).toBe(false)
    })
  })

  describe('行数显示', () => {
    it('应显示来自 store 的行数', () => {
      editorStore.setContent('line1\nline2\nline3')
      
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 1, column: 1 },
        },
      })

      expect(wrapper.text()).toContain('Ln 3')
    })

    it('空内容应显示 1 行', () => {
      editorStore.setContent('')
      
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 1, column: 1 },
        },
      })

      expect(wrapper.text()).toContain('Ln 1')
    })

    it('多行内容应正确计数', () => {
      editorStore.setContent('line1\nline2\nline3\nline4\nline5')
      
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
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
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 1, column: 1 },
        },
      })

      const statusBar = wrapper.find('.status-bar')
      expect(statusBar.classes()).toContain('status-bar')
    })

    it('状态项应有 status-item 类', () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 1, column: 1 },
        },
      })

      const items = wrapper.findAll('.status-item')
      expect(items.length).toBeGreaterThanOrEqual(2)
    })

    it('状态标签应有 status-label 类', () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 1, column: 1 },
        },
      })

      expect(wrapper.find('.status-label').exists()).toBe(true)
    })

    it('语言选择框应有 status-select 类', () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 1, column: 1 },
        },
      })

      expect(wrapper.find('.status-select').exists()).toBe(true)
    })

    it('自动保存图标应有 status-icon 类', () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
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
        global: { stubs: { teleport: true } },
        props: {},
      })

      expect(wrapper.text()).toContain('行 1, 列 1')
    })

    it('应使用默认编码', () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {},
      })

      expect(wrapper.get('[data-testid="encoding-readonly"]').text()).toBe('UTF-8')
    })

    it('应使用默认语言', () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {},
      })

      const select = wrapper.find('[data-testid="language-mode-display"]')
      expect(select.attributes('data-value')).toBe('plaintext')
    })

    it('应默认启用自动保存', () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {},
      })

      expect(wrapper.find('.status-icon').exists()).toBe(true)
    })
  })

  describe('响应式更新', () => {
    it('光标位置变化应更新显示', async () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 1, column: 1 },
        },
      })

      await wrapper.setProps({ cursorPosition: { line: 10, column: 20 } })

      expect(wrapper.text()).toContain('行 10, 列 20')
    })

    it('语言变化应更新选择框', async () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {
          language: 'plaintext',
        },
      })

      await wrapper.setProps({ language: 'javascript' })

      const select = wrapper.find('[data-testid="language-mode-display"]')
      expect(select.attributes('data-value')).toBe('javascript')
    })

    it('自动保存状态变化应更新显示', async () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {
          autoSaveEnabled: true,
        },
      })

      expect(wrapper.find('.status-icon').exists()).toBe(true)

      await wrapper.setProps({ autoSaveEnabled: false })

      expect(wrapper.find('.status-icon').exists()).toBe(false)
    })
  })

  describe('作者信息弹窗', () => {
    it('点击作者入口应打开弹窗并展示 GitHub 链接', async () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 1, column: 1 },
        },
      })

      expect(wrapper.find('[data-testid="author-modal"]').exists()).toBe(false)
      await wrapper.find('[data-testid="author-info-trigger"]').trigger('click')

      const modal = wrapper.find('[data-testid="author-modal"]')
      expect(modal.exists()).toBe(true)
      const link = modal.find('a.author-link')
      expect(link.exists()).toBe(true)
      expect(link.attributes('href')).toBe('https://github.com/kokotao/tau-editor')
      expect(modal.text()).toContain('https://github.com/kokotao/tau-editor')
      expect(modal.text()).toContain('1091775563')
    })

    it('点击遮罩应关闭作者弹窗', async () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
        props: {
          cursorPosition: { line: 1, column: 1 },
        },
      })

      await wrapper.find('[data-testid="author-info-trigger"]').trigger('click')
      expect(wrapper.find('[data-testid="author-modal"]').exists()).toBe(true)
      await wrapper.find('[data-testid="author-modal-overlay"]').trigger('click')
      expect(wrapper.find('[data-testid="author-modal"]').exists()).toBe(false)
    })
  })

  describe('可点击性', () => {
    it('状态项应可点击', () => {
      const wrapper = mount(StatusBar, {
        global: { stubs: { teleport: true } },
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
        global: { stubs: { teleport: true } },
        props: {
          language: 'plaintext',
        },
      })

      const select = wrapper.find('[data-testid="language-mode-display"]')
      expect(select.attributes('aria-haspopup')).toBe('listbox')
    })
  })
})
