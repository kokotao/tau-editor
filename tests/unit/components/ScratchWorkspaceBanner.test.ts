/**
 * ScratchWorkspaceBanner.vue 组件单元测试
 *
 * 只钉一件事：另存时每个文件都走 copy_file，且「已存在→跳过 / 其它→失败」两条
 * 错误分支都不会进 copiedRelativePaths 名单——这个名单是标签迁移的唯一依据，
 * 名单错了用户的既有文件就会被静默覆盖。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>()
  return {
    ...actual,
    fileCommands: {
      ...actual.fileCommands,
      listFiles: vi.fn(),
      copyFile: vi.fn(),
    },
  }
})

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}))

import { fileCommands, type FileEntry } from '@/lib/tauri'
import { open as openDirectoryDialog } from '@tauri-apps/plugin-dialog'
import ScratchWorkspaceBanner from '@/components/editor/ScratchWorkspaceBanner.vue'
import { useNotificationStore } from '@/stores/notification'
import { useTabsStore } from '@/stores/tabs'
import { useWorkspaceStore } from '@/stores/workspace'

const SCRATCH = 'C:/Users/Administrator/AppData/Local/Temp/tau-scratch/分享'
const TARGET = 'D:/WorkSpace/分享'

const mockListFiles = vi.mocked(fileCommands.listFiles)
const mockCopyFile = vi.mocked(fileCommands.copyFile)
const mockOpenDialog = vi.mocked(openDirectoryDialog)

const file = (name: string, dir = SCRATCH): FileEntry => ({
  name,
  path: `${dir}/${name}`,
  type: 'file',
})
const folder = (name: string, dir = SCRATCH): FileEntry => ({
  name,
  path: `${dir}/${name}`,
  type: 'folder',
})

const existsError = (name: string) => new Error(`目标文件已存在：${TARGET}/${name}`)
const copyError = (name: string) => new Error(`复制文件失败：${name} 被占用`)

describe('ScratchWorkspaceBanner.vue 另存到工作区', () => {
  let wrapper: VueWrapper | null
  let relocateSpy: ReturnType<typeof vi.spyOn>
  let successSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    setActivePinia(createPinia())

    const workspaceStore = useWorkspaceStore()
    workspaceStore.mode = 'workspace'
    workspaceStore.currentWorkspacePath = SCRATCH
    workspaceStore.currentWorkspaceName = '分享'
    workspaceStore.workspaceOrigin = 'scratch'

    const tabsStore = useTabsStore()
    relocateSpy = vi
      .spyOn(tabsStore, 'relocateTabsUnderWorkspace')
      .mockReturnValue({ movedTabIds: [], skipped: [] })

    const notificationStore = useNotificationStore()
    successSpy = vi.spyOn(notificationStore, 'success').mockReturnValue('notif-success')
    vi.spyOn(notificationStore, 'warning').mockReturnValue('notif-warning')
    vi.spyOn(notificationStore, 'error').mockReturnValue('notif-error')

    mockOpenDialog.mockResolvedValue(TARGET)
    mockListFiles.mockReset()
    mockCopyFile.mockReset()

    wrapper = null
  })

  /** 挂载临时工作区徽标并点「另存到工作区…」，返回组件包装器 */
  const saveAs = async (): Promise<VueWrapper> => {
    wrapper = mount(ScratchWorkspaceBanner)
    await flushPromises()

    await wrapper.get('[data-testid="btn-save-scratch-to-workspace"]').trigger('click')
    // handleSaveAs 里有多段 await（选目录 → 遍历复制 → 迁移 → 通知），多 flush 一轮兜住
    await flushPromises()
    await flushPromises()

    return wrapper
  }

  /** 迁移名单：第三个实参就是 copiedRelativePaths */
  const relocatedPaths = (): unknown => relocateSpy.mock.calls[0]?.[2]

  /** 成功提示的第二段文案里带着 copied / skipped / failed 三个计数 */
  const successMessage = (): string => String(successSpy.mock.calls[0]?.[1] ?? '')

  it('copy_file 全部成功：copied 计数正确，名单恰好是这些相对路径（含子目录）', async () => {
    mockListFiles.mockImplementation(async (dir: string) => (
      dir === SCRATCH ? [file('a.md'), folder('sub')] : [file('b.md', `${SCRATCH}/sub`)]
    ))
    mockCopyFile.mockResolvedValue(1)

    await saveAs()

    expect(mockCopyFile).toHaveBeenCalledTimes(2)
    expect(mockCopyFile).toHaveBeenNthCalledWith(1, `${SCRATCH}/a.md`, `${TARGET}/a.md`)
    expect(mockCopyFile).toHaveBeenNthCalledWith(2, `${SCRATCH}/sub/b.md`, `${TARGET}/sub/b.md`)
    expect(relocateSpy).toHaveBeenCalledWith(SCRATCH, TARGET, ['a.md', 'sub/b.md'])
    expect(relocatedPaths()).toEqual(['a.md', 'sub/b.md'])
    expect(successMessage()).toContain('已复制 2 个文件')
    expect(successMessage()).not.toContain('跳过')
    expect(successMessage()).not.toContain('复制失败')
  })

  it('目标已存在：该文件计 skipped 且不在迁移名单里', async () => {
    mockListFiles.mockResolvedValue([file('dup.md')])
    mockCopyFile.mockRejectedValue(existsError('dup.md'))

    await saveAs()

    expect(relocateSpy).toHaveBeenCalledWith(SCRATCH, TARGET, [])
    expect(relocatedPaths()).toEqual([])
    expect(successMessage()).toContain('已复制 0 个文件')
    expect(successMessage()).toContain('跳过 1 个同名文件')
  })

  it('其它复制错误：该文件计 failed 且不在迁移名单里', async () => {
    mockListFiles.mockResolvedValue([file('busy.md')])
    mockCopyFile.mockRejectedValue(copyError('busy.md'))

    await saveAs()

    expect(relocatedPaths()).toEqual([])
    expect(successMessage()).toContain('已复制 0 个文件')
    expect(successMessage()).toContain('1 个文件复制失败')
    expect(successMessage()).not.toContain('跳过')
  })

  it('混合场景：1 成功 + 1 已存在 + 1 其它错 → 三个计数各为 1，名单只有那 1 个成功文件', async () => {
    mockListFiles.mockResolvedValue([file('ok.md'), file('dup.md'), file('busy.md')])
    mockCopyFile.mockImplementation(async (_source: string, target: string) => {
      if (target.endsWith('/dup.md')) throw existsError('dup.md')
      if (target.endsWith('/busy.md')) throw copyError('busy.md')
      return 7
    })

    await saveAs()

    expect(relocatedPaths()).toEqual(['ok.md'])
    expect(successMessage()).toContain('已复制 1 个文件')
    expect(successMessage()).toContain('跳过 1 个同名文件')
    expect(successMessage()).toContain('1 个文件复制失败')
  })

  it('子目录里的失败同样不进名单，成功项仍按遍历顺序排列', async () => {
    mockListFiles.mockImplementation(async (dir: string) => (
      dir === SCRATCH ? [file('ok.md'), folder('sub')] : [file('dup.md', `${SCRATCH}/sub`)]
    ))
    mockCopyFile.mockImplementation(async (_source: string, target: string) => {
      if (target.endsWith('/sub/dup.md')) throw existsError('sub/dup.md')
      return 3
    })

    await saveAs()

    expect(relocatedPaths()).toEqual(['ok.md'])
    expect(successMessage()).toContain('已复制 1 个文件')
    expect(successMessage()).toContain('跳过 1 个同名文件')
  })
})
