/**
 * SettingsStore 单元测试
 * 
 * 测试编辑器设置管理的核心功能：
 * - 主题切换
 * - 字体配置
 * - 自动保存设置
 * - Monaco 配置选项
 * - Tauri 同步
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '@/stores/settings'
import { settingsCommands, TauriError } from '@/lib/tauri'
import { THEME_SKINS } from '@/utils/themeResolver'

function createMediaQueryList(matches: boolean) {
  return {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }
}

// Mock Tauri commands
vi.mock('@/lib/tauri', () => ({
  fileCommands: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    listFiles: vi.fn(),
    createFile: vi.fn(),
    deleteFile: vi.fn(),
    renameFile: vi.fn(),
    getFileInfo: vi.fn(),
  },
  settingsCommands: {
    setAutoSaveInterval: vi.fn(),
    getAutoSaveInterval: vi.fn(),
  },
  TauriError: class TauriError extends Error {
    constructor(message: string, public command: string) {
      super(message)
      this.name = 'TauriError'
    }
    static fromError(error: unknown, command: string): TauriError {
      const message = error instanceof Error ? error.message : String(error)
      return new TauriError(message, command)
    }
  },
}))

// Mock document.documentElement
const mockClassList = {
  add: vi.fn(),
  remove: vi.fn(),
  toggle: vi.fn(),
}
const mockStyle = {
  setProperty: vi.fn(),
  removeProperty: vi.fn(),
}

vi.stubGlobal('document', {
  documentElement: {
    classList: mockClassList,
    style: mockStyle,
  },
})

// Mock window.matchMedia
const mockMatchMedia = vi.fn()
const localStorageState = new Map<string, string>()
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageState.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageState.set(key, String(value))
  }),
  removeItem: vi.fn((key: string) => {
    localStorageState.delete(key)
  }),
  clear: vi.fn(() => {
    localStorageState.clear()
  }),
}

vi.stubGlobal('window', {
  matchMedia: mockMatchMedia,
  localStorage: localStorageMock,
})
vi.stubGlobal('localStorage', localStorageMock)

describe('SettingsStore', () => {
  let store: ReturnType<typeof useSettingsStore>
  let pinia: ReturnType<typeof createPinia>
  const themeResetClassArgs = ['light', 'dark', 'theme-light', 'theme-dark', ...THEME_SKINS.map((skin) => `skin-${skin}`)]

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    store = useSettingsStore(pinia)
    localStorage.clear()
    vi.clearAllMocks()
    localStorageMock.getItem.mockClear()
    localStorageMock.setItem.mockClear()
    localStorageMock.removeItem.mockClear()
    localStorageMock.clear.mockClear()
    mockClassList.add.mockClear()
    mockClassList.remove.mockClear()
    mockClassList.toggle.mockClear()
    mockStyle.setProperty.mockClear()
    mockStyle.removeProperty.mockClear()
    mockMatchMedia.mockClear()
    mockMatchMedia.mockReturnValue(createMediaQueryList(false))
  })

  describe('初始状态', () => {
    it('应初始化主题为 system', () => {
      expect(store.theme).toBe('system')
    })

    it('应初始化 Monaco 主题为 vs-dark', () => {
      expect(store.monacoTheme).toBe('vs-dark')
    })

    it('应初始化主题风格为 deep-ocean', () => {
      expect(store.themeSkin).toBe('deep-ocean')
    })

    it('应初始化自定义主题颜色为空对象', () => {
      expect(store.customThemeColors).toEqual({})
    })

    it('应初始化字体族', () => {
      expect(store.fontFamily).toBe("'JetBrains Mono Variable', 'JetBrains Mono', 'Fira Code', monospace")
    })

    it('应初始化字体大小为 15', () => {
      expect(store.fontSize).toBe(15)
    })

    it('应初始化行高为 1.6', () => {
      expect(store.lineHeight).toBe(1.6)
    })

    it('应初始化 minimap 为 true', () => {
      expect(store.minimap).toBe(true)
    })

    it('应初始化自动换行为 false', () => {
      expect(store.wordWrap).toBe(false)
    })

    it('应初始化自动保存为 true', () => {
      expect(store.autoSaveEnabled).toBe(true)
    })

    it('应初始化自动保存间隔为 30 秒', () => {
      expect(store.autoSaveInterval).toBe(30)
    })

    it('应初始化 tab 大小为 2', () => {
      expect(store.tabSize).toBe(2)
    })

    it('应初始化最大标签页数量为 30', () => {
      expect(store.maxOpenTabs).toBe(30)
    })

    it('应初始化标签内存上限为 256MB', () => {
      expect(store.memoryLimitMB).toBe(256)
    })

    it('应初始化插入空格为 true', () => {
      expect(store.insertSpaces).toBe(true)
    })

    it('应初始化显示隐藏文件为 false', () => {
      expect(store.showHiddenFiles).toBe(false)
    })

    it('应初始化文件树宽度为 250', () => {
      expect(store.fileTreeWidth).toBe(250)
    })

    it('应初始化侧栏折叠状态为 false', () => {
      expect(store.sidebarCollapsed).toBe(false)
    })

    it('应初始化 Markdown 预览模式为 edit', () => {
      expect(store.markdownPreviewMode).toBe('edit')
    })

    it('应初始化 Markdown 预览主题为 docs-clean', () => {
      expect(store.markdownPreviewTheme).toBe('docs-clean')
    })

    it('应初始化关闭前确认为 true', () => {
      expect(store.confirmBeforeClose).toBe(true)
    })

    it('应初始化恢复上次会话为 true', () => {
      expect(store.restoreLastSession).toBe(true)
    })
  })

  describe('Monaco 配置选项', () => {
    it('monacoOptions 应返回正确的配置', () => {
      const options = store.monacoOptions

      expect(options).toEqual({
        fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 15,
        lineHeight: 16,
        minimap: { enabled: true },
        wordWrap: 'off',
        tabSize: 2,
        insertSpaces: true,
        trimAutoWhitespace: true,
      })
    })

    it('monacoOptions 应根据 wordWrap 返回 on/off', () => {
      store.wordWrap = true

      expect(store.monacoOptions.wordWrap).toBe('on')
    })

    it('monacoOptions 应正确计算 lineHeight', () => {
      store.lineHeight = 1.5

      expect(store.monacoOptions.lineHeight).toBe(15)
    })

    it('monacoOptions 应反映 minimap 设置', () => {
      store.minimap = false

      expect(store.monacoOptions.minimap).toEqual({ enabled: false })
    })
  })

  describe('主题解析派生值', () => {
    it('system + 浅色系统应解析为 light 预览主题', () => {
      mockMatchMedia.mockReturnValue(createMediaQueryList(false))

      expect(store.resolvedTheme).toBe('light')
      expect(store.previewTheme).toBe('light')
      expect(store.recommendedMonacoTheme).toBe('vs')
    })

    it('dark 主题应推荐 vs-dark', () => {
      store.theme = 'dark'

      expect(store.resolvedTheme).toBe('dark')
      expect(store.recommendedMonacoTheme).toBe('vs-dark')
    })

    it('应提供带推荐标记的 Monaco 主题选项', () => {
      store.theme = 'light'
      const recommended = store.monacoThemeOptions.find((option) => option.recommended)

      expect(store.monacoThemeOptions).toHaveLength(3)
      expect(recommended?.value).toBe('vs')
    })
  })

  describe('更新设置', () => {
    beforeEach(() => {
      vi.mocked(settingsCommands.setAutoSaveInterval).mockResolvedValue()
    })

    it('updateSettings() 应更新设置', async () => {
      await store.updateSettings({ fontSize: 16 })

      expect(store.fontSize).toBe(16)
    })

    it('updateSettings() 应支持多个设置', async () => {
      await store.updateSettings({ fontSize: 16, minimap: false })

      expect(store.fontSize).toBe(16)
      expect(store.minimap).toBe(false)
    })

    it('updateSettings() 更新自动保存应同步到 Tauri', async () => {
      await store.updateSettings({ autoSaveEnabled: false })

      expect(settingsCommands.setAutoSaveInterval).toHaveBeenCalledWith(0)
    })

    it('updateSettings() 更新自动保存间隔应同步到 Tauri', async () => {
      await store.updateSettings({ autoSaveInterval: 60 })

      expect(settingsCommands.setAutoSaveInterval).toHaveBeenCalledWith(60)
    })

    it('updateSettings() 更新主题应应用主题', async () => {
      await store.updateSettings({ theme: 'dark' })

      expect(mockClassList.add).toHaveBeenCalledWith('dark', 'theme-dark', 'skin-deep-ocean')
      expect(mockClassList.remove).toHaveBeenCalledWith(...themeResetClassArgs)
    })

    it('updateSettings() 更新主题风格应应用对应 skin 类', async () => {
      await store.updateSettings({ themeSkin: 'forest-moss' })

      expect(mockClassList.add).toHaveBeenCalledWith('light', 'theme-light', 'skin-forest-moss')
      expect(mockClassList.remove).toHaveBeenCalledWith(...themeResetClassArgs)
    })

    it('updateSettings() 更新自定义配色应写入 CSS 变量', async () => {
      await store.updateSettings({
        customThemeColors: {
          accentBrand: '#123456',
          stateSuccess: '#00aa66',
        },
      })

      expect(mockStyle.setProperty).toHaveBeenCalledWith('--accent-brand', '#123456')
      expect(mockStyle.setProperty).toHaveBeenCalledWith('--state-success', '#00aa66')
    })

    it('updateSettings() 非自动保存/主题设置不应调用 Tauri', async () => {
      await store.updateSettings({ fontSize: 16 })

      expect(settingsCommands.setAutoSaveInterval).not.toHaveBeenCalled()
    })

    it('updateSettings() 应持久化 Markdown 预览主题', async () => {
      await store.updateSettings({ markdownPreviewTheme: 'paper-soft' })

      expect(localStorage.setItem).toHaveBeenCalled()
      const saved = JSON.parse(
        vi.mocked(localStorage.setItem).mock.calls.at(-1)?.[1] ?? '{}',
      )
      expect(saved.markdownPreviewTheme).toBe('paper-soft')
    })
  })

  describe('重置设置', () => {
    beforeEach(() => {
      vi.mocked(settingsCommands.setAutoSaveInterval).mockResolvedValue()
    })

    it('resetToDefaults() 应重置所有设置', async () => {
      store.fontSize = 20
      store.theme = 'dark'
      store.minimap = false
      store.maxOpenTabs = 80
      store.memoryLimitMB = 512

      await store.resetToDefaults()

      expect(store.fontSize).toBe(15)
      expect(store.theme).toBe('system')
      expect(store.minimap).toBe(true)
      expect(store.maxOpenTabs).toBe(30)
      expect(store.memoryLimitMB).toBe(256)
    })

    it('resetToDefaults() 应同步自动保存到 Tauri', async () => {
      await store.resetToDefaults()

      expect(settingsCommands.setAutoSaveInterval).toHaveBeenCalledWith(30)
    })

    it('resetToDefaults() 应应用主题', async () => {
      mockMatchMedia.mockReturnValue(createMediaQueryList(false))

      await store.resetToDefaults()

      expect(mockClassList.remove).toHaveBeenCalledWith(...themeResetClassArgs)
      expect(mockClassList.add).toHaveBeenCalledWith('light', 'theme-light', 'skin-deep-ocean')
    })

    it('resetToDefaults() 应重置 Markdown 预览主题', async () => {
      store.markdownPreviewTheme = 'graphite-night'

      await store.resetToDefaults()

      expect(store.markdownPreviewTheme).toBe('docs-clean')
    })
  })

  describe('本地持久化', () => {
    it('saveToStorage() 应写入 Markdown 预览主题', () => {
      store.markdownPreviewTheme = 'editorial-warm'

      store.saveToStorage()

      expect(localStorage.setItem).toHaveBeenCalled()
      const saved = JSON.parse(
        vi.mocked(localStorage.setItem).mock.calls.at(-1)?.[1] ?? '{}',
      )
      expect(saved.markdownPreviewTheme).toBe('editorial-warm')
    })

    it('loadFromStorage() 应恢复 Markdown 预览主题', () => {
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify({
        markdownPreviewTheme: 'paper-soft',
      }))

      store.loadFromStorage()

      expect(store.markdownPreviewTheme).toBe('paper-soft')
    })
  })

  describe('主题应用', () => {
    it('applyTheme() dark 应添加 dark 类', () => {
      store.theme = 'dark'
      store.applyTheme()

      expect(mockClassList.add).toHaveBeenCalledWith('dark', 'theme-dark', 'skin-deep-ocean')
      expect(mockClassList.remove).toHaveBeenCalledWith(...themeResetClassArgs)
    })

    it('applyTheme() light 应添加 light 类', () => {
      store.theme = 'light'
      store.applyTheme()

      expect(mockClassList.add).toHaveBeenCalledWith('light', 'theme-light', 'skin-deep-ocean')
      expect(mockClassList.remove).toHaveBeenCalledWith(...themeResetClassArgs)
    })

    it('applyTheme() system 暗色模式应添加 dark 类', () => {
      store.theme = 'system'
      mockMatchMedia.mockReturnValue(createMediaQueryList(true))

      store.applyTheme()

      expect(mockClassList.add).toHaveBeenCalledWith('dark', 'theme-dark', 'skin-deep-ocean')
      expect(mockClassList.remove).toHaveBeenCalledWith(...themeResetClassArgs)
    })

    it('applyTheme() system 亮色模式应添加 light 类', () => {
      store.theme = 'system'
      mockMatchMedia.mockReturnValue(createMediaQueryList(false))

      store.applyTheme()

      expect(mockClassList.add).toHaveBeenCalledWith('light', 'theme-light', 'skin-deep-ocean')
      expect(mockClassList.remove).toHaveBeenCalledWith(...themeResetClassArgs)
    })
  })

  describe('初始化', () => {
    beforeEach(() => {
      vi.mocked(settingsCommands.getAutoSaveInterval).mockResolvedValue(30)
      mockMatchMedia.mockReturnValue(createMediaQueryList(false))
    })

    it('init() 应应用主题', async () => {
      await store.init()

      expect(mockClassList.add).toHaveBeenCalledWith('light', 'theme-light', 'skin-deep-ocean')
    })

    it('init() 应从 Tauri 加载设置', async () => {
      await store.init()

      expect(settingsCommands.getAutoSaveInterval).toHaveBeenCalled()
    })
  })

  describe('从 Tauri 加载设置', () => {
    it('loadFromTauri() 应加载自动保存间隔', async () => {
      vi.mocked(settingsCommands.getAutoSaveInterval).mockResolvedValue(60)

      await store.loadFromTauri()

      expect(store.autoSaveInterval).toBe(60)
      expect(store.autoSaveEnabled).toBe(true)
    })

    it('loadFromTauri() 间隔为 0 应禁用自动保存', async () => {
      vi.mocked(settingsCommands.getAutoSaveInterval).mockResolvedValue(0)

      await store.loadFromTauri()

      expect(store.autoSaveEnabled).toBe(false)
    })

    it('loadFromTauri() 失败应使用默认值', async () => {
      vi.mocked(settingsCommands.getAutoSaveInterval).mockRejectedValue(new Error('Failed'))
      const originalInterval = store.autoSaveInterval

      await store.loadFromTauri()

      expect(store.autoSaveInterval).toBe(originalInterval)
    })

    it('loadFromTauri() 失败不应抛出错误', async () => {
      vi.mocked(settingsCommands.getAutoSaveInterval).mockRejectedValue(new Error('Failed'))

      await expect(store.loadFromTauri()).resolves.toBeUndefined()
    })
  })

  describe('同步自动保存到 Tauri', () => {
    it('syncAutoSaveToTauri() 启用时应发送间隔', async () => {
      vi.mocked(settingsCommands.setAutoSaveInterval).mockResolvedValue()
      store.autoSaveEnabled = true
      store.autoSaveInterval = 45

      await store.syncAutoSaveToTauri()

      expect(settingsCommands.setAutoSaveInterval).toHaveBeenCalledWith(45)
    })

    it('syncAutoSaveToTauri() 禁用时应发送 0', async () => {
      vi.mocked(settingsCommands.setAutoSaveInterval).mockResolvedValue()
      store.autoSaveEnabled = false

      await store.syncAutoSaveToTauri()

      expect(settingsCommands.setAutoSaveInterval).toHaveBeenCalledWith(0)
    })

    it('syncAutoSaveToTauri() 失败应抛出错误', async () => {
      vi.mocked(settingsCommands.setAutoSaveInterval).mockRejectedValue(new Error('Failed'))

      await expect(store.syncAutoSaveToTauri()).rejects.toThrow('同步自动保存设置失败')
    })
  })

  describe('同步所有设置到 Tauri', () => {
    it('syncWithTauri() 应同步自动保存', async () => {
      vi.mocked(settingsCommands.setAutoSaveInterval).mockResolvedValue()

      await store.syncWithTauri()

      expect(settingsCommands.setAutoSaveInterval).toHaveBeenCalled()
    })
  })

  describe('设置验证', () => {
    it('应支持所有主题选项', () => {
      const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system']

      themes.forEach(theme => {
        store.theme = theme
        expect(store.theme).toBe(theme)
      })
    })

    it('应支持所有 Monaco 主题', () => {
      const monacoThemes: Array<'vs' | 'vs-dark' | 'hc-black'> = ['vs', 'vs-dark', 'hc-black']

      monacoThemes.forEach(theme => {
        store.monacoTheme = theme
        expect(store.monacoTheme).toBe(theme)
      })
    })

    it('应支持所有主题风格', () => {
      THEME_SKINS.forEach((skin) => {
        store.themeSkin = skin
        expect(store.themeSkin).toBe(skin)
      })
    })

    it('应支持自定义配色导入导出', () => {
      store.importCustomThemeColors(JSON.stringify({
        customThemeColors: {
          bgApp: '#101010',
          accentBrand: '#aa22cc',
        },
      }))

      const exported = JSON.parse(store.exportCustomThemeColors())
      expect(exported.customThemeColors.bgApp).toBe('#101010')
      expect(exported.customThemeColors.accentBrand).toBe('#aa22cc')
    })

    it('应支持合理的字体大小范围', () => {
      const sizes = [8, 10, 12, 14, 16, 18, 20, 24]

      sizes.forEach(size => {
        store.fontSize = size
        expect(store.fontSize).toBe(size)
      })
    })

    it('应支持合理的 tab 大小', () => {
      const tabSizes = [2, 4, 8]

      tabSizes.forEach(size => {
        store.tabSize = size
        expect(store.tabSize).toBe(size)
      })
    })
  })

  describe('设置组合', () => {
    it('应支持完整的开发者配置', async () => {
      await store.updateSettings({
        theme: 'dark',
        monacoTheme: 'vs-dark',
        fontFamily: "'Fira Code', monospace",
        fontSize: 16,
        lineHeight: 1.5,
        minimap: true,
        wordWrap: false,
        autoSaveEnabled: true,
        autoSaveInterval: 60,
        tabSize: 2,
        insertSpaces: true,
        showHiddenFiles: true,
        fileTreeWidth: 300,
      })

      expect(store.theme).toBe('dark')
      expect(store.monacoTheme).toBe('vs-dark')
      expect(store.fontSize).toBe(16)
      expect(store.minimap).toBe(true)
      expect(store.tabSize).toBe(2)
    })

    it('应支持简洁的写作者配置', async () => {
      await store.updateSettings({
        theme: 'light',
        monacoTheme: 'vs',
        fontSize: 18,
        lineHeight: 1.8,
        wordWrap: true,
        minimap: false,
        autoSaveEnabled: true,
        autoSaveInterval: 30,
      })

      expect(store.wordWrap).toBe(true)
      expect(store.minimap).toBe(false)
      expect(store.fontSize).toBe(18)
    })
  })
})
