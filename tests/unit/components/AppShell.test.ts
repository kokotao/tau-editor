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
  emits: ['toggle-settings'],
  template: `
    <button data-testid="btn-settings" @click="$emit('toggle-settings')">
      toggle settings
    </button>
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
  props: ['content', 'theme', 'sourceFilePath'],
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

  it('打开设置时应渲染抽屉态而不是常驻右栏', async () => {
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

    await wrapper.find('[data-testid="btn-settings"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="settings-drawer"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="shell-overlay"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="settings-panel"]').exists()).toBe(true)
  })

  it('点击遮罩应关闭设置抽屉', async () => {
    const wrapper = shallowMount(App, {
      global: {
        stubs: {
          Toolbar: ToolbarStub,
          SettingsPanel: SettingsPanelStub,
        },
      },
    })

    await wrapper.find('[data-testid="btn-settings"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="shell-overlay"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="settings-drawer"]').exists()).toBe(false)
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

  it('左下角应显示统一控制组并支持作者弹窗', async () => {
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

    await wrapper.find('[data-testid="btn-sidebar-collapse"]').trigger('click')
    expect(storeMocks.settings.updateSettings).toHaveBeenCalledWith({ sidebarCollapsed: true })

    expect(wrapper.find('[data-testid="author-modal"]').exists()).toBe(false)
    await wrapper.find('[data-testid="btn-author-entry"]').trigger('click')
    expect(wrapper.find('[data-testid="author-modal"]').exists()).toBe(true)
  })
})
