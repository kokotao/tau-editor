/**
 * TabsStore 单元测试
 * 
 * 测试标签页状态管理的核心功能：
 * - 添加/关闭标签页
 * - 标签页切换
 * - 脏状态管理
 * - 最近关闭记录
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTabsStore, type Tab } from '@/stores/tabs'

describe('TabsStore', () => {
  let store: ReturnType<typeof useTabsStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useTabsStore()
  })

  describe('初始状态', () => {
    it('应初始化为空标签列表', () => {
      expect(store.tabs).toEqual([])
    })

    it('应初始化 activeTabId 为 null', () => {
      expect(store.activeTabId).toBeNull()
    })

    it('应初始化 recentTabs 为空数组', () => {
      expect(store.recentTabs).toEqual([])
    })
  })

  describe('添加标签', () => {
    it('addTab() 应创建新标签并返回 ID', () => {
      const tabData = {
        filePath: '/test/file.txt',
        fileName: 'file.txt',
        language: 'plaintext',
        isDirty: false,
      }

      const tabId = store.addTab(tabData)

      expect(tabId).toBeDefined()
      expect(tabId).toMatch(/^tab-\d+-[a-z0-9]+$/)
    })

    it('addTab() 应自动生成唯一 ID', () => {
      const tabId1 = store.addTab({
        filePath: '/test/file1.txt',
        fileName: 'file1.txt',
        language: 'plaintext',
        isDirty: false,
      })

      const tabId2 = store.addTab({
        filePath: '/test/file2.txt',
        fileName: 'file2.txt',
        language: 'plaintext',
        isDirty: false,
      })

      expect(tabId1).not.toBe(tabId2)
    })

    it('addTab() 应设置创建时间戳', () => {
      const before = Date.now()
      store.addTab({
        filePath: '/test/file.txt',
        fileName: 'file.txt',
        language: 'plaintext',
        isDirty: false,
      })
      const after = Date.now()

      const tab = store.tabs[0]
      expect(tab.createdAt).toBeGreaterThanOrEqual(before)
      expect(tab.createdAt).toBeLessThanOrEqual(after)
    })

    it('addTab() 应自动激活新标签', () => {
      const tabId = store.addTab({
        filePath: '/test/file.txt',
        fileName: 'file.txt',
        language: 'plaintext',
        isDirty: false,
      })

      expect(store.activeTabId).toBe(tabId)
    })

    it('addTab() 应将标签添加到列表', () => {
      store.addTab({
        filePath: '/test/file.txt',
        fileName: 'file.txt',
        language: 'plaintext',
        isDirty: false,
      })

      expect(store.tabs.length).toBe(1)
      expect(store.tabs[0].fileName).toBe('file.txt')
    })
  })

  describe('关闭标签', () => {
    beforeEach(() => {
      store.addTab({
        filePath: '/test/file1.txt',
        fileName: 'file1.txt',
        language: 'plaintext',
        isDirty: false,
      })
      store.addTab({
        filePath: '/test/file2.txt',
        fileName: 'file2.txt',
        language: 'plaintext',
        isDirty: false,
      })
      store.addTab({
        filePath: '/test/file3.txt',
        fileName: 'file3.txt',
        language: 'plaintext',
        isDirty: false,
      })
    })

    it('closeTab() 应移除指定标签', () => {
      const tabId = store.tabs[1].id
      store.closeTab(tabId)

      expect(store.tabs.length).toBe(2)
      expect(store.tabs.find(t => t.id === tabId)).toBeUndefined()
    })

    it('closeTab() 关闭活动标签应切换到下一个标签', () => {
      store.activateTab(store.tabs[1].id)
      const activeTabId = store.activeTabId

      store.closeTab(activeTabId!)

      expect(store.activeTabId).toBe(store.tabs[1].id)
    })

    it('closeTab() 关闭最后一个标签应切换到前一个标签', () => {
      store.activateTab(store.tabs[2].id)
      const activeTabId = store.activeTabId

      store.closeTab(activeTabId!)

      expect(store.activeTabId).toBe(store.tabs[1].id)
    })

    it('closeTab() 关闭唯一标签应清空 activeTabId', () => {
      store.closeTab(store.tabs[0].id)
      store.closeTab(store.tabs[0].id)
      store.closeTab(store.tabs[0].id)

      expect(store.activeTabId).toBeNull()
    })

    it('closeTab() 应将路径添加到 recentTabs', () => {
      const tabId = store.tabs[0].id
      const filePath = store.tabs[0].filePath

      store.closeTab(tabId)

      expect(store.recentTabs[0]).toBe(filePath)
    })

    it('closeTab() 应限制 recentTabs 最多 10 个', () => {
      // 先清空现有标签
      store.closeAll()

      // 添加并关闭 15 个标签
      for (let i = 0; i < 15; i++) {
        const tabId = store.addTab({
          filePath: `/test/file${i}.txt`,
          fileName: `file${i}.txt`,
          language: 'plaintext',
          isDirty: false,
        })
        store.closeTab(tabId)
      }

      expect(store.recentTabs.length).toBe(10)
    })

    it('closeTab() 关闭不存在的标签应无效果', () => {
      const initialLength = store.tabs.length
      store.closeTab('nonexistent-id')

      expect(store.tabs.length).toBe(initialLength)
    })
  })

  describe('批量关闭', () => {
    beforeEach(() => {
      store.addTab({
        filePath: '/test/file1.txt',
        fileName: 'file1.txt',
        language: 'plaintext',
        isDirty: false,
      })
      store.addTab({
        filePath: '/test/file2.txt',
        fileName: 'file2.txt',
        language: 'plaintext',
        isDirty: false,
      })
      store.addTab({
        filePath: '/test/file3.txt',
        fileName: 'file3.txt',
        language: 'plaintext',
        isDirty: false,
      })
    })

    it('closeOthers() 应只保留指定标签', () => {
      const keepTabId = store.tabs[1].id

      store.closeOthers(keepTabId)

      expect(store.tabs.length).toBe(1)
      expect(store.tabs[0].id).toBe(keepTabId)
    })

    it('closeOthers() 应设置保留的标签为活动', () => {
      const keepTabId = store.tabs[1].id

      store.closeOthers(keepTabId)

      expect(store.activeTabId).toBe(keepTabId)
    })

    it('closeAll() 应清空所有标签', () => {
      store.closeAll()

      expect(store.tabs.length).toBe(0)
    })

    it('closeAll() 应清空 activeTabId', () => {
      store.closeAll()

      expect(store.activeTabId).toBeNull()
    })
  })

  describe('标签激活', () => {
    beforeEach(() => {
      store.addTab({
        filePath: '/test/file1.txt',
        fileName: 'file1.txt',
        language: 'plaintext',
        isDirty: false,
      })
      store.addTab({
        filePath: '/test/file2.txt',
        fileName: 'file2.txt',
        language: 'plaintext',
        isDirty: false,
      })
    })

    it('activateTab() 应更新 activeTabId', () => {
      const tabId = store.tabs[1].id

      store.activateTab(tabId)

      expect(store.activeTabId).toBe(tabId)
    })

    it('activateTab() 激活不存在的标签应无效', () => {
      const initialActiveId = store.activeTabId

      store.activateTab('nonexistent-id')

      expect(store.activeTabId).toBe(initialActiveId)
    })
  })

  describe('脏状态管理', () => {
    beforeEach(() => {
      store.addTab({
        filePath: '/test/file.txt',
        fileName: 'file.txt',
        language: 'plaintext',
        isDirty: false,
      })
    })

    it('updateTabDirty() 应设置脏状态为 true', () => {
      const tabId = store.tabs[0].id

      store.updateTabDirty(tabId, true)

      expect(store.tabs[0].isDirty).toBe(true)
    })

    it('updateTabDirty() 应设置脏状态为 false', () => {
      const tabId = store.tabs[0].id
      store.updateTabDirty(tabId, true)

      store.updateTabDirty(tabId, false)

      expect(store.tabs[0].isDirty).toBe(false)
    })

    it('updateTabDirty() 更新不存在的标签应无效果', () => {
      store.updateTabDirty('nonexistent-id', true)

      expect(store.tabs[0].isDirty).toBe(false)
    })
  })

  describe('Getters', () => {
    beforeEach(() => {
      store.addTab({
        filePath: '/test/file1.txt',
        fileName: 'file1.txt',
        language: 'plaintext',
        isDirty: false,
      })
      store.addTab({
        filePath: '/test/file2.txt',
        fileName: 'file2.txt',
        language: 'typescript',
        isDirty: true,
      })
      store.addTab({
        filePath: '/test/file3.txt',
        fileName: 'file3.txt',
        language: 'plaintext',
        isDirty: false,
      })
      store.activateTab(store.tabs[1].id)
    })

    it('activeTab 应返回当前活动标签', () => {
      expect(store.activeTab).toBe(store.tabs[1])
    })

    it('activeTab 在无活动标签时应返回 null', () => {
      store.closeAll()

      expect(store.activeTab).toBeNull()
    })

    it('tabCount 应返回标签数量', () => {
      expect(store.tabCount).toBe(3)
    })

    it('dirtyTabs 应返回所有未保存标签', () => {
      expect(store.dirtyTabs.length).toBe(1)
      expect(store.dirtyTabs[0].fileName).toBe('file2.txt')
    })

    it('isFileOpen() 应检查文件是否已打开', () => {
      expect(store.isFileOpen('/test/file1.txt')).toBe(true)
      expect(store.isFileOpen('/test/nonexistent.txt')).toBe(false)
    })

    it('getTabIdByPath() 应返回对应标签 ID', () => {
      const tabId = store.getTabIdByPath('/test/file1.txt')

      expect(tabId).toBe(store.tabs[0].id)
    })

    it('getTabIdByPath() 对不存在的文件应返回 null', () => {
      const tabId = store.getTabIdByPath('/test/nonexistent.txt')

      expect(tabId).toBeNull()
    })
  })

  describe('重新打开标签', () => {
    it('reopenClosedTab() 应返回最近关闭的文件路径', () => {
      const tabId = store.addTab({
        filePath: '/test/file.txt',
        fileName: 'file.txt',
        language: 'plaintext',
        isDirty: false,
      })
      store.closeTab(tabId)

      const filePath = store.reopenClosedTab()

      expect(filePath).toBe('/test/file.txt')
    })

    it('reopenClosedTab() 应从 recentTabs 移除路径', () => {
      const tabId = store.addTab({
        filePath: '/test/file.txt',
        fileName: 'file.txt',
        language: 'plaintext',
        isDirty: false,
      })
      store.closeTab(tabId)

      store.reopenClosedTab()

      expect(store.recentTabs.length).toBe(0)
    })

    it('reopenClosedTab() 在无记录时应返回 null', () => {
      const filePath = store.reopenClosedTab()

      expect(filePath).toBeNull()
    })
  })
})
