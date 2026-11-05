/**
 * 冷启动 scratch 工作区兜底的单元测试
 *
 * 覆盖三件事：目录还在→保留；目录已被清理→清上下文并提示一次；
 * 非 scratch 来源（user/silent）一律不动——网络盘掉线不该被静默清掉。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { guardPersistedScratchWorkspace } from '@/services/scratchWorkspaceGuard'
import { useWorkspaceStore } from '@/stores/workspace'

const SCRATCH = 'C:/Users/Administrator/AppData/Local/Temp/tau-scratch/分享'
const USER_DIR = 'D:/WorkSpace/分享'

describe('guardPersistedScratchWorkspace', () => {
  let workspaceStore: ReturnType<typeof useWorkspaceStore>
  let notifyCleared: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setActivePinia(createPinia())
    workspaceStore = useWorkspaceStore()
    notifyCleared = vi.fn()
  })

  const probeReturning = (value: boolean | null) => vi.fn(async () => value)

  it('临时工作区目录仍在 → 保留原上下文，不提示', async () => {
    workspaceStore.openWorkspace(SCRATCH, 'scratch')
    const probe = probeReturning(true)

    const result = await guardPersistedScratchWorkspace(workspaceStore, {
      probeDirectoryExists: probe,
      notifyCleared,
    })

    expect(result).toBe('kept')
    expect(probe).toHaveBeenCalledWith(SCRATCH)
    expect(workspaceStore.mode).toBe('workspace')
    expect(workspaceStore.currentWorkspacePath).toBe(SCRATCH)
    expect(workspaceStore.currentWorkspaceName).toBe('分享')
    expect(workspaceStore.workspaceOrigin).toBe('scratch')
    expect(notifyCleared).not.toHaveBeenCalled()
  })

  it('临时工作区目录已被清理 → 回 empty 模式并提示一次', async () => {
    workspaceStore.openWorkspace(SCRATCH, 'scratch')

    const result = await guardPersistedScratchWorkspace(workspaceStore, {
      probeDirectoryExists: probeReturning(false),
      notifyCleared,
    })

    expect(result).toBe('cleared')
    expect(workspaceStore.mode).toBe('empty')
    expect(workspaceStore.currentWorkspacePath).toBeNull()
    expect(workspaceStore.currentWorkspaceName).toBeNull()
    expect(workspaceStore.workspaceOrigin).toBe('user')
    expect(notifyCleared).toHaveBeenCalledTimes(1)
    expect(notifyCleared).toHaveBeenCalledWith(SCRATCH)
  })

  it('用户自己打开的工作区目录不可用 → 不动（可能是网络盘暂时掉线）', async () => {
    workspaceStore.openWorkspace(USER_DIR, 'user')

    const result = await guardPersistedScratchWorkspace(workspaceStore, {
      probeDirectoryExists: probeReturning(false),
      notifyCleared,
    })

    expect(result).toBe('skipped')
    expect(workspaceStore.mode).toBe('workspace')
    expect(workspaceStore.currentWorkspacePath).toBe(USER_DIR)
    expect(workspaceStore.workspaceOrigin).toBe('user')
    expect(notifyCleared).not.toHaveBeenCalled()
  })

  it('为云文档静默打开的工作区目录不可用 → 同样不动', async () => {
    workspaceStore.openWorkspace(USER_DIR, 'silent')

    const result = await guardPersistedScratchWorkspace(workspaceStore, {
      probeDirectoryExists: probeReturning(false),
      notifyCleared,
    })

    expect(result).toBe('skipped')
    expect(workspaceStore.currentWorkspacePath).toBe(USER_DIR)
    expect(workspaceStore.workspaceOrigin).toBe('silent')
    expect(notifyCleared).not.toHaveBeenCalled()
  })

  it('探测结果不确定（返回 null）→ 保守保留，不误清', async () => {
    workspaceStore.openWorkspace(SCRATCH, 'scratch')

    const result = await guardPersistedScratchWorkspace(workspaceStore, {
      probeDirectoryExists: probeReturning(null),
      notifyCleared,
    })

    expect(result).toBe('kept')
    expect(workspaceStore.currentWorkspacePath).toBe(SCRATCH)
    expect(workspaceStore.workspaceOrigin).toBe('scratch')
    expect(notifyCleared).not.toHaveBeenCalled()
  })

  it('探测本身抛错 → 不崩，按不确定处理', async () => {
    workspaceStore.openWorkspace(SCRATCH, 'scratch')

    const result = await guardPersistedScratchWorkspace(workspaceStore, {
      probeDirectoryExists: async () => {
        throw new Error('IPC 挂了')
      },
      notifyCleared,
    })

    expect(result).toBe('kept')
    expect(workspaceStore.currentWorkspacePath).toBe(SCRATCH)
    expect(notifyCleared).not.toHaveBeenCalled()
  })

  it('没有持久化工作区 → skipped，连探测都不做', async () => {
    const probe = probeReturning(false)

    const result = await guardPersistedScratchWorkspace(workspaceStore, {
      probeDirectoryExists: probe,
      notifyCleared,
    })

    expect(result).toBe('skipped')
    expect(probe).not.toHaveBeenCalled()
    expect(notifyCleared).not.toHaveBeenCalled()
  })
})
