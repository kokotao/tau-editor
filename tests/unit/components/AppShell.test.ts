import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { defineComponent } from 'vue'

const storeMocks = vi.hoisted(() => ({
  fileSystem: {
    fileTree: [],
    loading: false,
    selectedPath: null,
    syncFromWorkspace: vi.fn().mockResolvedValue(undefined),
    clearWorkspaceState: vi.fn(),
    toggleFolder: vi.fn(),
  },
  workspace: {
    mode: 'empty',
    currentWorkspacePath: null,
    currentWorkspaceName: null,
    loadFromStorage: vi.fn(),
    setEmptyMode: vi.fn(),
    openWorkspace: vi.fn(),
    setMode: vi.fn(),
  },
  tabs: {
    tabs: [],
    activeTabId: null,
    activeTab: null,
    closeAll: vi.fn(),
    restoreSession: vi.fn(),
    activateTab: vi.fn(),
    closeTab: vi.fn(),
    closeOthers: vi.fn(),
    renameTab: vi.fn(),
    updateActiveTabContent: vi.fn(),
    updateActiveTabLanguage: vi.fn(),
  },
  editor: {
    cursorPosition: { line: 1, column: 1 },
    language: 'plaintext',
    canUndo: false,
    canRedo: false,
    lineCount: 1,
    updateCursorPosition: vi.fn(),
  },
  settings: {
    sidebarCollapsed: false,
    markdownPreviewMode: 'edit',
    previewTheme: 'dark',
    markdownPreviewEnabled: true,
    monacoTheme: 'vs-dark',
    autoSaveEnabled: true,
    fileTreeWidth: 300,
    maxOpenTabs: 30,
    memoryLimitMB: 256,
    uiLanguage: 'zh-CN',
    restoreLastSession: true,
    init: vi.fn().mockResolvedValue(undefined),
    updateSettings: vi.fn().mockResolvedValue(undefined),
  },
  notification: {
    info: vi.fn(),
    error: vi.fn(),
  },
  keyboard: {
    register: vi.fn(),
    removeGlobalHandler: vi.fn(),
  },
  command: {
    paletteOpen: false,
    query: '',
    highlightedIndex: 0,
    filteredCommands: [],
    highlightedCommand: null,
    registerCommands: vi.fn(),
    closePalette: vi.fn(),
    moveHighlight: vi.fn(),
    setHighlightedIndex: vi.fn(),
    setQuery: vi.fn(),
    openPalette: vi.fn(),
  },
}))

vi.mock('@/stores/fileSystem', () => ({
  useFileSystemStore: () => storeMocks.fileSystem,
}))

vi.mock('@/stores/workspace', () => ({
  useWorkspaceStore: () => storeMocks.workspace,
}))

vi.mock('@/stores/tabs', () => ({
  useTabsStore: () => storeMocks.tabs,
}))

vi.mock('@/stores/editor', () => ({
  useEditorStore: () => storeMocks.editor,
}))

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => storeMocks.settings,
}))

vi.mock('@/stores/notification', () => ({
  useNotificationStore: () => storeMocks.notification,
}))

vi.mock('@/stores/keyboard', () => ({
  useKeyboardStore: () => storeMocks.keyboard,
}))

vi.mock('@/stores/commands', () => ({
  useCommandStore: () => storeMocks.command,
}))

vi.mock('@/services/workspaceService', () => ({
  createWorkspaceService: () => ({
    createUntitledFile: vi.fn(),
    openFile: vi.fn(),
    openFileWithPicker: vi.fn(),
    openFolderWithPicker: vi.fn().mockResolvedValue(false),
    refreshWorkspace: vi.fn(),
  }),
}))

vi.mock('@/services/tabService', () => ({
  createTabService: () => ({
    syncTabToEditor: vi.fn(),
    saveActiveTab: vi.fn(),
    saveActiveTabAs: vi.fn(),
    activateTab: vi.fn(),
    closeTab: vi.fn(),
    closeOthers: vi.fn(),
    closeAll: vi.fn(),
    renameTab: vi.fn(),
    updateActiveTabContent: vi.fn(),
    updateActiveTabLanguage: vi.fn(),
  }),
}))

vi.mock('@/services/windowService', () => ({
  createWindowService: () => ({
    attach: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn(),
  }),
}))

vi.mock('@/services/sessionService', () => ({
  sessionService: {
    clear: vi.fn(),
    load: vi.fn(() => null),
    save: vi.fn(),
  },
}))

import App from '@/App.vue'

const ToolbarStub = defineComponent({
  emits: ['toggle-settings', 'system-action'],
  template: `
    <div>
      <button data-testid="btn-settings" @click="$emit('toggle-settings')">
        toggle settings
      </button>
      <button data-testid="btn-system-toggle-settings" @click="$emit('system-action', 'toggle-settings')">
        system toggle settings
      </button>
    </div>
  `,
})

const SettingsPanelStub = defineComponent({
  emits: ['close'],
  template: `
    <div data-testid="settings-panel">
      <button data-testid="settings-panel-close" @click="$emit('close')">close</button>
    </div>
  `,
})

const MarkdownPreviewStub = defineComponent({
  props: ['content', 'theme', 'sourceFilePath', 'editorScrollState'],
  emits: ['request-preview-mode-change'],
  template: `
    <div
      data-testid="markdown-preview-stub"
      @click="$emit('request-preview-mode-change', 'preview')"
    ></div>
  `,
})

describe('AppShell', () => {
  beforeEach(() => {
    storeMocks.workspace.mode = 'empty'
    storeMocks.workspace.currentWorkspacePath = null
    storeMocks.workspace.currentWorkspaceName = null
    storeMocks.settings.sidebarCollapsed = false
    storeMocks.command.paletteOpen = false
    storeMocks.command.query = ''
    storeMocks.command.highlightedIndex = 0
    storeMocks.command.filteredCommands = []
    storeMocks.command.highlightedCommand = null
    storeMocks.tabs.tabs = []
    storeMocks.tabs.activeTab = null
    storeMocks.tabs.activeTabId = null
    vi.clearAllMocks()
  })

  it('点击工具栏设置时应渲染独立页面模式', async () => {
    const wrapper = shallowMount(App, {
      global: {
        stubs: {
          Toolbar: ToolbarStub,
          SettingsPanel: SettingsPanelStub,
        },
      },
    })

    await flushPromises()

    expect(wrapper.find('.floating-meta').exists()).toBe(false)
    expect(wrapper.find('.settings-sidebar').exists()).toBe(false)
    expect(wrapper.find('[data-testid="settings-drawer"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="settings-page"]').attributes('style')).toContain('display: none;')

    await wrapper.find('[data-testid="btn-settings"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="settings-page"]').attributes('style')).toBeUndefined()
    expect(wrapper.find('[data-testid="settings-drawer"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="shell-overlay"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="settings-panel"]').exists()).toBe(true)
  })

  it('系统菜单动作应打开设置工作区', async () => {
    const wrapper = shallowMount(App, {
      global: {
        stubs: {
          Toolbar: ToolbarStub,
          SettingsPanel: SettingsPanelStub,
        },
      },
    })

    await wrapper.find('[data-testid="btn-system-toggle-settings"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="settings-page"]').attributes('style')).toBeUndefined()
    expect(wrapper.find('[data-testid="settings-drawer"]').exists()).toBe(false)
  })

  it('快捷键应按规则切换 workspace 与 drawer，并支持 Esc 关闭', async () => {
    const wrapper = shallowMount(App, {
      global: {
        stubs: {
          Toolbar: ToolbarStub,
          SettingsPanel: SettingsPanelStub,
        },
      },
    })

    await flushPromises()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', code: 'Comma', ctrlKey: true }))
    await flushPromises()
    expect(wrapper.get('[data-testid="settings-page"]').attributes('style')).toBeUndefined()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', code: 'Comma', ctrlKey: true }))
    await flushPromises()
    expect(wrapper.get('[data-testid="settings-page"]').attributes('style')).toContain('display: none;')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '<', code: 'Comma', ctrlKey: true, shiftKey: true }))
    await flushPromises()
    expect(wrapper.find('[data-testid="settings-drawer"]').exists()).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', code: 'Comma', ctrlKey: true }))
    await flushPromises()
    expect(wrapper.get('[data-testid="settings-page"]').attributes('style')).toBeUndefined()
    expect(wrapper.find('[data-testid="settings-drawer"]').exists()).toBe(false)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.get('[data-testid="settings-page"]').attributes('style')).toContain('display: none;')
  })

  it('预览菜单请求切换模式应更新设置', async () => {
    storeMocks.tabs.activeTab = {
      id: 'tab-1',
      fileName: 'README.md',
      filePath: '/workspace/README.md',
      content: '# title',
      language: 'markdown',
      isDirty: false,
    }
    storeMocks.tabs.tabs = [storeMocks.tabs.activeTab]
    storeMocks.tabs.activeTabId = 'tab-1'
    storeMocks.settings.markdownPreviewEnabled = true
    storeMocks.settings.markdownPreviewMode = 'split'

    const wrapper = shallowMount(App, {
      global: {
        stubs: {
          Toolbar: ToolbarStub,
          SettingsPanel: SettingsPanelStub,
          MarkdownPreview: MarkdownPreviewStub,
        },
      },
    })

    await flushPromises()

    const preview = wrapper.findComponent(MarkdownPreviewStub)
    expect(preview.exists()).toBe(true)
    preview.vm.$emit('request-preview-mode-change', 'preview')
    await flushPromises()

    expect(storeMocks.settings.updateSettings).toHaveBeenCalledWith({
      markdownPreviewMode: 'preview',
    })
  })

  it('左下角应显示统一控制组且仅保留侧栏按钮', async () => {
    const wrapper = shallowMount(App, {
      global: {
        stubs: {
          Toolbar: ToolbarStub,
          SettingsPanel: SettingsPanelStub,
        },
      },
    })

    await flushPromises()

    expect(wrapper.find('[data-testid="left-bottom-controls"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="btn-sidebar-collapse"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="btn-author-entry"]').exists()).toBe(false)

    await wrapper.find('[data-testid="btn-sidebar-collapse"]').trigger('click')
    expect(storeMocks.settings.updateSettings).toHaveBeenCalledWith({ sidebarCollapsed: true })
  })

  it('markdown 分栏模式下应将编辑滚动状态同步给预览', async () => {
    storeMocks.tabs.activeTab = {
      id: 'tab-1',
      fileName: 'README.md',
      filePath: '/workspace/README.md',
      content: '# title\n\ncontent',
      language: 'markdown',
      isDirty: false,
    }
    storeMocks.tabs.tabs = [storeMocks.tabs.activeTab]
    storeMocks.tabs.activeTabId = 'tab-1'
    storeMocks.settings.markdownPreviewEnabled = true
    storeMocks.settings.markdownPreviewMode = 'split'

    const wrapper = shallowMount(App, {
      global: {
        stubs: {
          Toolbar: ToolbarStub,
          SettingsPanel: SettingsPanelStub,
          MarkdownPreview: MarkdownPreviewStub,
        },
      },
    })

    await flushPromises()

    const editorCore = wrapper.findComponent({ name: 'EditorCore' })
    expect(editorCore.exists()).toBe(true)

    const nextScrollState = { top: 120, height: 300, scrollHeight: 900 }
    editorCore.vm.$emit('scroll-change', nextScrollState)
    await flushPromises()

    const preview = wrapper.findComponent(MarkdownPreviewStub)
    expect(preview.props('editorScrollState')).toEqual(nextScrollState)
  })
})
