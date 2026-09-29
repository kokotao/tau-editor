import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkspaceStore } from '@/stores/workspace'

describe('WorkspaceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(localStorage.getItem).mockReset()
    vi.mocked(localStorage.setItem).mockReset()
  })

  it('切换到单文件模式并清理上下文时应移除旧工作区信息', () => {
    const store = useWorkspaceStore()
    store.openWorkspace('/project')

    store.setMode('single-file', true)

    expect(store.mode).toBe('single-file')
    expect(store.currentWorkspacePath).toBeNull()
    expect(store.currentWorkspaceName).toBeNull()
  })

  it('工作区内调用普通 setMode 不应清理工作区上下文', () => {
    const store = useWorkspaceStore()
    store.openWorkspace('/project')

    store.setMode('single-file')

    expect(store.currentWorkspacePath).toBe('/project')
    expect(store.currentWorkspaceName).toBe('project')
  })

  it('从存储恢复单文件模式时应忽略残留工作区信息', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify({
      mode: 'single-file',
      currentWorkspacePath: '/stale-project',
      currentWorkspaceName: 'stale-project',
      recentProjects: [],
      recentFiles: [],
    }))
    const store = useWorkspaceStore()

    store.loadFromStorage()

    expect(store.mode).toBe('single-file')
    expect(store.currentWorkspacePath).toBeNull()
    expect(store.currentWorkspaceName).toBeNull()
  })
})
