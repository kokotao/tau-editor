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

vi.stubGlobal('document', {
  documentElement: {
    classList: mockClassList,
  },
})

// Mock window.matchMedia
const mockMatchMedia = vi.fn()
vi.stubGlobal('window', {
  matchMedia: mockMatchMedia,
})

describe('SettingsStore', () => {
  let store: ReturnType<typeof useSettingsStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useSettingsStore()
    vi.clearAllMocks()
    mockClassList.add.mockClear()
    mockClassList.remove.mockClear()
    mockClassList.toggle.mockClear()
    mockMatchMedia.mockClear()
  })

  describe('初始状态', () => {
    it('应初始化主题为 system', () => {
      expect(store.theme).toBe('system')
    })

    it('应初始化 Monaco 主题为 vs-dark', () => {
      expect(store.monacoTheme).toBe('vs-dark')
    })

    it('应初始化字体族', () => {
      expect(store.fontFamily).toBe("'JetBrains Mono', 'Fira Code', monospace")
    })

    it('应初始化字体大小为 14', () => {
      expect(store.fontSize).toBe(14)
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

    it('应初始化 Markdown 预览模式为 split', () => {
      expect(store.markdownPreviewMode).toBe('split')
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
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 14,
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

      expect(mockClassList.add).toHaveBeenCalledWith('dark')
      expect(mockClassList.remove).toHaveBeenCalledWith('light')
    })

    it('updateSettings() 非自动保存/主题设置不应调用 Tauri', async () => {
      await store.updateSettings({ fontSize: 16 })

      expect(settingsCommands.setAutoSaveInterval).not.toHaveBeenCalled()
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

      await store.resetToDefaults()

      expect(store.fontSize).toBe(14)
      expect(store.theme).toBe('system')
      expect(store.minimap).toBe(true)
    })

    it('resetToDefaults() 应同步自动保存到 Tauri', async () => {
      await store.resetToDefaults()

      expect(settingsCommands.setAutoSaveInterval).toHaveBeenCalledWith(30)
    })

    it('resetToDefaults() 应应用主题', async () => {
      mockMatchMedia.mockReturnValue({ matches: false })

      await store.resetToDefaults()

      expect(mockClassList.remove).toHaveBeenCalledWith('dark')
      expect(mockClassList.add).toHaveBeenCalledWith('light')
    })
  })

  describe('主题应用', () => {
    it('applyTheme() dark 应添加 dark 类', () => {
      store.theme = 'dark'
      store.applyTheme()

      expect(mockClassList.add).toHaveBeenCalledWith('dark')
      expect(mockClassList.remove).toHaveBeenCalledWith('light')
    })

    it('applyTheme() light 应添加 light 类', () => {
      store.theme = 'light'
      store.applyTheme()

      expect(mockClassList.add).toHaveBeenCalledWith('light')
      expect(mockClassList.remove).toHaveBeenCalledWith('dark')
    })

    it('applyTheme() system 暗色模式应添加 dark 类', () => {
      store.theme = 'system'
      mockMatchMedia.mockReturnValue({ matches: true })

      store.applyTheme()

      expect(mockClassList.add).toHaveBeenCalledWith('dark')
      expect(mockClassList.remove).toHaveBeenCalledWith('light')
    })

    it('applyTheme() system 亮色模式应添加 light 类', () => {
      store.theme = 'system'
      mockMatchMedia.mockReturnValue({ matches: false })

      store.applyTheme()

      expect(mockClassList.add).toHaveBeenCalledWith('light')
      expect(mockClassList.remove).toHaveBeenCalledWith('dark')
    })
  })

  describe('初始化', () => {
    beforeEach(() => {
      vi.mocked(settingsCommands.getAutoSaveInterval).mockResolvedValue(30)
      mockMatchMedia.mockReturnValue({ matches: false })
    })

    it('init() 应应用主题', async () => {
      await store.init()

      expect(mockClassList.add).toHaveBeenCalledWith('light')
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
