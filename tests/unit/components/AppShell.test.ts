import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'

const componentStubs = vi.hoisted(() => ({
  toolbar: {
    emits: ['toggle-settings', 'cycle-markdown-preview'],
    template: `
      <div>
        <button data-testid="btn-settings" @click="$emit('toggle-settings')">toggle settings</button>
        <button data-testid="btn-cycle-preview" @click="$emit('cycle-markdown-preview')">cycle preview</button>
      </div>
    `,
  },
  settingsPanel: {
    emits: ['close'],
    template: '<div data-testid="settings-panel"><button data-testid="settings-panel-close" @click="$emit(\'close\')">close</button></div>',
  },
  markdownPreview: {
    props: ['content', 'theme', 'sourceFilePath', 'editorScrollState', 'previewMode', 'previewFontSize'],
    emits: ['request-preview-mode-change', 'preview-font-size-change', 'open-image', 'open-file'],
    methods: { scrollToSourceLine: vi.fn() },
    template: '<div data-testid="markdown-preview-stub" :data-mode="previewMode" :data-font-size="previewFontSize" @click="$emit(\'request-preview-mode-change\', \'preview\')"></div>',
  },
  imagePreview: {
    props: ['filePath', 'fileName', 'src', 'alt'],
    emits: ['open', 'open-image'],
    template: '<div data-testid="image-preview-stub"></div>',
  },
  imageViewer: {
    props: ['visible', 'src', 'alt'],
    emits: ['close'],
    template: '<div data-testid="image-viewer-stub" :data-visible="visible ? \'true\' : \'false\'"></div>',
  },
  editorCore: {
    emits: ['scroll-change'],
    methods: {
      getPosition: vi.fn(() => null),
      revealLine: vi.fn(),
      triggerFindWidget: vi.fn(),
      triggerGoToLine: vi.fn(),
      focusAtStart: vi.fn(),
      layout: vi.fn(),
    },
    template: '<div data-testid="editor-core-stub"></div>',
  },
  contextRail: {
    emits: ['navigate', 'find', 'go-to-line', 'toggle-collapse'],
    template: `
      <div data-testid="context-rail-stub">
        <button data-testid="context-rail-navigate" @click="$emit('navigate', 7)">navigate</button>
        <button data-testid="context-rail-find" @click="$emit('find')">find</button>
        <button data-testid="context-rail-go-to-line" @click="$emit('go-to-line')">go to line</button>
        <button data-testid="context-rail-collapse" @click="$emit('toggle-collapse')">collapse</button>
      </div>
    `,
  },
  externalChangeDialog: {
    props: ['visible', 'conflict', 'fileName', 'locale', 'busy'],
    emits: ['close', 'reload', 'keep', 'save-as'],
    template: '<div data-testid="external-change-dialog-stub"></div>',
  },
}))

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
    recentProjects: [],
    loadFromStorage: vi.fn(),
    setEmptyMode: vi.fn(),
    openWorkspace: vi.fn(),
    openFile: vi.fn(),
    openRecentProject: vi.fn().mockResolvedValue(undefined),
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
    updateTabContent: vi.fn(),
    updateTab: vi.fn(),
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
    contextRailCollapsed: false,
    markdownPreviewMode: 'edit',
    previewTheme: 'dark',
    markdownPreviewEnabled: true,
    monacoTheme: 'vs-dark',
    autoSaveEnabled: true,
    fileTreeWidth: 300,
    contextRailWidth: 300,
    theme: 'dark',
    themeSkin: 'deep-ocean',
    resolvedTheme: 'dark',
    themeSkinOptions: [],
    monacoThemeOptions: [],
    customThemeColors: {},
    fontFamily: 'monospace',
    fontSize: 15,
    lineHeight: 1.6,
    minimap: true,
    wordWrap: false,
    autoSaveInterval: 30,
    tabSize: 2,
    setCustomThemeColor: vi.fn(),
    resetCustomThemeColors: vi.fn(),
    exportCustomThemeColors: vi.fn(),
    importCustomThemeColors: vi.fn(),
    adjustFontSize: vi.fn(),
    resetFontSize: vi.fn(),
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
    warning: vi.fn(),
  },
  keyboard: {
    register: vi.fn(),
    unregister: vi.fn(),
    removeGlobalHandler: vi.fn(),
  },
  fileConflicts: {
    count: 0,
    hasConflicts: false,
    records: {},
    find: vi.fn(() => null),
    flag: vi.fn(() => true),
    resolve: vi.fn(),
    retainOnly: vi.fn(),
    clear: vi.fn(),
  },
  workspaceWatcher: {
    start: vi.fn().mockResolvedValue(true),
    stop: vi.fn().mockResolvedValue(undefined),
    onChange: vi.fn(() => vi.fn()),
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
  CUSTOM_THEME_COLOR_KEYS: [],
  CUSTOM_THEME_COLOR_FALLBACKS: {},
  MARKDOWN_PREVIEW_THEMES: [],
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

vi.mock('@/stores/fileConflicts', () => ({
  useFileConflictsStore: () => storeMocks.fileConflicts,
}))

vi.mock('@/services/workspaceWatcherService', () => ({
  createWorkspaceWatcherService: () => storeMocks.workspaceWatcher,
  normalizeWorkspacePath: (path: string) => path.replace(/\\/g, '/'),
}))

vi.mock('@/services/workspaceService', () => ({
  createWorkspaceService: () => ({
    createUntitledFile: vi.fn(),
    openFile: storeMocks.workspace.openFile,
    openFileWithPicker: vi.fn(),
    openFolderWithPicker: vi.fn().mockResolvedValue(false),
    openRecentProject: storeMocks.workspace.openRecentProject,
    reloadFileFromDisk: vi.fn().mockResolvedValue(false),
    refreshWorkspace: vi.fn(),
  }),
}))

vi.mock('@/services/tabService', () => ({
  createTabService: () => ({
    syncTabToEditor: vi.fn(),
    captureFileRevision: vi.fn().mockResolvedValue(null),
    saveActiveTab: vi.fn(),
    saveActiveTabAs: vi.fn(),
    activateTab: vi.fn(),
    closeTab: vi.fn(),
    closeOthers: vi.fn(),
    closeAll: vi.fn(),
    renameTab: vi.fn(),
    updateActiveTabContent: vi.fn(),
    updateTabContent: vi.fn(),
    updateActiveTabLanguage: vi.fn(),
  }),
}))

vi.mock('@/services/windowService', () => ({
  createWindowService: () => ({
    onBeforeClose: vi.fn(),
    attach: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn(),
  }),
}))

vi.mock('@/services/sessionService', () => ({
  sessionService: {
    initialize: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
    load: vi.fn(() => null),
    save: vi.fn(),
    loadRecoveryDrafts: vi.fn(() => []),
    saveRecoveryDrafts: vi.fn(),
    clearRecoveryDrafts: vi.fn(),
    discardRecoveryDraft: vi.fn(),
  },
}))

import App from '@/App.vue'

const ToolbarStub = componentStubs.toolbar
const SettingsPanelStub = componentStubs.settingsPanel
const MarkdownPreviewStub = componentStubs.markdownPreview
const ImagePreviewStub = componentStubs.imagePreview
const ImageViewerStub = componentStubs.imageViewer
const ContextRailStub = componentStubs.contextRail
vi.mock('../../../frontend/src/components/editor/Toolbar.vue', () => ({ default: componentStubs.toolbar }))
vi.mock('../../../frontend/src/components/editor/SettingsPanel.vue', () => ({ default: componentStubs.settingsPanel }))
vi.mock('../../../frontend/src/components/editor/MarkdownPreview.vue', () => ({ default: componentStubs.markdownPreview }))
vi.mock('../../../frontend/src/components/editor/ImagePreview.vue', () => ({ default: componentStubs.imagePreview }))
vi.mock('../../../frontend/src/components/editor/ImageViewer.vue', () => ({ default: componentStubs.imageViewer }))
vi.mock('../../../frontend/src/components/editor/EditorCore.vue', () => ({ default: componentStubs.editorCore }))
vi.mock('../../../frontend/src/components/editor/LazyEditorCore', () => ({ LazyEditorCore: componentStubs.editorCore }))
vi.mock('../../../frontend/src/components/editor/ContextRail.vue', () => ({ default: componentStubs.contextRail }))
vi.mock('../../../frontend/src/components/editor/ExternalChangeDialog.vue', () => ({ default: componentStubs.externalChangeDialog }))

const appShellStubs = {
  Toolbar: false,
  SettingsPanel: false,
  MarkdownPreview: false,
  ImagePreview: false,
  ImageViewer: false,
  EditorCore: false,
  LazyEditorCore: false,
  ExternalChangeDialog: false,
  ContextRail: false,
  Transition: false,
}

describe('AppShell', () => {
  beforeEach(() => {
    storeMocks.workspace.mode = 'empty'
    storeMocks.workspace.currentWorkspacePath = null
    storeMocks.workspace.currentWorkspaceName = null
    storeMocks.workspace.recentProjects = []
    storeMocks.settings.sidebarCollapsed = false
    storeMocks.settings.contextRailCollapsed = false
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

  it('无工作区时显示最近打开的文件夹并支持点击打开', async () => {
    storeMocks.workspace.recentProjects = [
      { path: '/workspace/project', name: 'project', openedAt: Date.now() },
    ]
    const wrapper = shallowMount(App, {
      global: {
        stubs: appShellStubs,
      },
    })

    await flushPromises()

    expect(wrapper.get('[data-testid="recent-workspaces"]').text()).toContain('project')
    await wrapper.get('.recent-workspace-card').trigger('click')
    await flushPromises()

    expect(storeMocks.workspace.openRecentProject).toHaveBeenCalledWith('/workspace/project')
  })

  it('点击工具栏设置时应渲染独立页面模式', async () => {
    const wrapper = shallowMount(App, {
      global: {
        stubs: appShellStubs,
      },
    })

    await flushPromises()

    expect(wrapper.find('.floating-meta').exists()).toBe(false)
    expect(wrapper.find('.settings-sidebar').exists()).toBe(false)
    expect(wrapper.find('[data-testid="settings-drawer"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="settings-page"]').attributes('data-active')).toBe('false')

    await wrapper.find('[data-testid="btn-settings"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="settings-page"]').attributes('data-active')).toBe('true')
    expect(wrapper.find('[data-testid="settings-drawer"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="shell-overlay"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="settings-panel"]').exists()).toBe(true)
  })

  it('单文件模式的资源区不显示空状态提示', async () => {
    const wrapper = shallowMount(App, {
      global: {
        stubs: appShellStubs,
      },
    })

    await flushPromises()

    expect(wrapper.find('.sidebar-empty').exists()).toBe(false)
    expect(wrapper.find('.file-tree-empty').exists()).toBe(false)
  })

  it('快捷键应按规则切换 workspace 与 drawer，并支持 Esc 关闭', async () => {
    const wrapper = shallowMount(App, {
      global: {
        stubs: appShellStubs,
      },
    })

    await flushPromises()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', code: 'Comma', ctrlKey: true }))
    await flushPromises()
    expect(wrapper.get('[data-testid="settings-page"]').attributes('style')).toBeUndefined()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', code: 'Comma', ctrlKey: true }))
    await flushPromises()
    expect(wrapper.get('[data-testid="settings-page"]').attributes('data-active')).toBe('false')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '<', code: 'Comma', ctrlKey: true, shiftKey: true }))
    await flushPromises()
    expect(wrapper.find('[data-testid="settings-drawer"]').exists()).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', code: 'Comma', ctrlKey: true }))
    await flushPromises()
    expect(wrapper.get('[data-testid="settings-page"]').attributes('data-active')).toBe('true')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.get('[data-testid="settings-page"]').attributes('data-active')).toBe('false')
  })

  it('预览菜单请求切换模式应更新当前 Markdown 标签而非全局设置', async () => {
    storeMocks.tabs.activeTab = {
      id: 'tab-1',
      fileName: 'README.md',
      filePath: '/workspace/README.md',
      content: '# title',
      language: 'markdown',
      isDirty: false,
      markdownPreviewMode: 'split',
      markdownPreviewFontSize: 19,
    }
    storeMocks.tabs.tabs = [storeMocks.tabs.activeTab]
    storeMocks.tabs.activeTabId = 'tab-1'
    storeMocks.settings.markdownPreviewEnabled = true
    storeMocks.settings.markdownPreviewMode = 'split'

    const wrapper = shallowMount(App, {
      global: {
        stubs: appShellStubs,
      },
    })

    await flushPromises()

    const preview = wrapper.findComponent(MarkdownPreviewStub)
    expect(preview.exists()).toBe(true)
    expect(preview.props('previewMode')).toBe('split')
    expect(preview.props('previewFontSize')).toBe(19)
    preview.vm.$emit('request-preview-mode-change', 'preview')
    await flushPromises()

    expect(storeMocks.tabs.updateTab).toHaveBeenCalledWith('tab-1', { markdownPreviewMode: 'preview' })
    expect(storeMocks.settings.updateSettings).not.toHaveBeenCalledWith({ markdownPreviewMode: 'preview' })
    preview.vm.$emit('preview-font-size-change', 20)
    expect(storeMocks.tabs.updateTab).toHaveBeenCalledWith('tab-1', { markdownPreviewFontSize: 20 })
  })

  it('HTML 预览切换模式应只更新当前标签而不修改全局 Markdown 设置', async () => {
    const htmlTab = {
      id: 'tab-html',
      fileName: 'index.html',
      filePath: '/workspace/index.html',
      content: '<h1>Hello</h1>',
      language: 'html',
      isDirty: false,
      markdownPreviewMode: 'split' as const,
    }
    storeMocks.tabs.activeTab = htmlTab
    storeMocks.tabs.tabs = [htmlTab]
    storeMocks.tabs.activeTabId = htmlTab.id
    storeMocks.settings.markdownPreviewEnabled = true
    storeMocks.settings.markdownPreviewMode = 'edit'

    const wrapper = shallowMount(App, {
      global: { stubs: appShellStubs },
    })

    await flushPromises()

    const toggle = wrapper.get('[data-testid="btn-cycle-preview"]')
    await toggle.trigger('click')

    expect(storeMocks.tabs.updateTab).toHaveBeenCalledWith('tab-html', { markdownPreviewMode: 'preview' })
    expect(storeMocks.settings.updateSettings).not.toHaveBeenCalledWith({ markdownPreviewMode: 'preview' })
  })

  it('Markdown 图片双击事件应打开图片查看器，关闭时不关闭当前标签页', async () => {
    const imageTab = {
      id: 'tab-image',
      fileName: 'photo.png',
      filePath: '/workspace/photo.png',
      content: '',
      language: 'plaintext',
      isDirty: false,
    }
    storeMocks.tabs.activeTab = imageTab
    storeMocks.tabs.tabs = [imageTab]
    storeMocks.tabs.activeTabId = imageTab.id

    const wrapper = shallowMount(App, {
      global: { stubs: appShellStubs },
    })
    await flushPromises()

    const imagePreview = wrapper.findComponent(ImagePreviewStub)
    expect(imagePreview.exists()).toBe(true)
    imagePreview.vm.$emit('open', {
      src: 'asset:///workspace/photo.png',
      alt: 'photo.png',
    })
    await flushPromises()

    const viewer = wrapper.findComponent(ImageViewerStub)
    expect(viewer.props('visible')).toBe(true)
    expect(viewer.props('src')).toBe('asset:///workspace/photo.png')
    expect(viewer.props('alt')).toBe('photo.png')

    viewer.vm.$emit('close')
    await flushPromises()
    expect(wrapper.findComponent(ImageViewerStub).props('visible')).toBe(false)
    expect(storeMocks.tabs.tabs).toHaveLength(1)
    expect(storeMocks.tabs.activeTabId).toBe(imageTab.id)
  })

  it('MarkdownPreview open-image 应优先使用 resolvedSrc 打开图片查看器', async () => {
    const markdownTab = {
      id: 'tab-md',
      fileName: 'README.md',
      filePath: '/workspace/README.md',
      content: '![logo](./logo.png)',
      language: 'markdown',
      isDirty: false,
    }
    storeMocks.tabs.activeTab = markdownTab
    storeMocks.tabs.tabs = [markdownTab]
    storeMocks.tabs.activeTabId = markdownTab.id
    storeMocks.settings.markdownPreviewEnabled = true
    storeMocks.settings.markdownPreviewMode = 'preview'

    const wrapper = shallowMount(App, {
      global: { stubs: appShellStubs },
    })
    await flushPromises()

    const preview = wrapper.findComponent(MarkdownPreviewStub)
    preview.vm.$emit('open-image', {
      src: './logo.png',
      resolvedSrc: 'asset:///workspace/logo.png',
      alt: 'logo',
    })
    await flushPromises()

    const viewer = wrapper.findComponent(ImageViewerStub)
    expect(viewer.props('visible')).toBe(true)
    expect(viewer.props('src')).toBe('asset:///workspace/logo.png')
    expect(viewer.props('alt')).toBe('logo')
  })

  it('MarkdownPreview open-file 应交给工作区打开服务', async () => {
    const markdownTab = {
      id: 'tab-md-link',
      fileName: 'README.md',
      filePath: '/workspace/README.md',
      content: '[文档](serialization.md)',
      language: 'markdown',
      isDirty: false,
    }
    storeMocks.tabs.activeTab = markdownTab
    storeMocks.tabs.tabs = [markdownTab]
    storeMocks.tabs.activeTabId = markdownTab.id
    storeMocks.settings.markdownPreviewEnabled = true
    storeMocks.settings.markdownPreviewMode = 'preview'

    const wrapper = shallowMount(App, {
      global: { stubs: appShellStubs },
    })
    await flushPromises()

    const preview = wrapper.findComponent(MarkdownPreviewStub)
    preview.vm.$emit('open-file', {
      path: '/workspace/serialization.md',
      href: 'file:///workspace/serialization.md',
    })
    await flushPromises()

    expect(storeMocks.workspace.openFile).toHaveBeenCalledWith('/workspace/serialization.md')
  })

  it('左下角应显示统一控制组且仅保留侧栏按钮', async () => {
    const wrapper = shallowMount(App, {
      global: {
        stubs: appShellStubs,
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
        stubs: appShellStubs,
      },
    })

    await flushPromises()

    const editorCore = wrapper.findComponent(componentStubs.editorCore)
    expect(editorCore.exists()).toBe(true)

    const nextScrollState = { top: 120, height: 300, scrollHeight: 900 }
    editorCore.vm.$emit('scroll-change', nextScrollState)
    await flushPromises()

    const preview = wrapper.findComponent(MarkdownPreviewStub)
    expect(preview.props('editorScrollState')).toEqual(nextScrollState)
  })

  it('窄屏默认收起 ContextRail（展开入口在 Tauri 标题栏，由 E2E 覆盖）', async () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 799 })

    const wrapper = shallowMount(App, {
      global: { stubs: appShellStubs },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="context-rail-shell"]').exists()).toBe(false)

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
  })

  it('窄屏默认收起文件树（展开入口在 Tauri 标题栏，由 E2E 覆盖）', async () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 799 })

    const wrapper = shallowMount(App, {
      global: { stubs: appShellStubs },
    })
    await flushPromises()

    expect(wrapper.find('.sidebar-shell').exists()).toBe(false)

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
  })
})
