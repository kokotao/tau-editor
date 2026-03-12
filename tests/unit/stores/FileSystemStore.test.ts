/**
 * FileSystemStore 单元测试
 * 
 * 测试文件系统状态管理的核心功能：
 * - 文件树构建
 * - 文件夹展开/折叠
 * - 文件选中
 * - 文件读取/写入
 * - 文件创建/删除
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFileSystemStore, type FileEntry } from '@/stores/fileSystem'
import { fileCommands, TauriError } from '@/lib/tauri'

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

describe('FileSystemStore', () => {
  let store: ReturnType<typeof useFileSystemStore>

  const mockFileEntries: FileEntry[] = [
    { name: 'src', path: '/project/src', type: 'folder' },
    { name: 'tests', path: '/project/tests', type: 'folder' },
    { name: 'README.md', path: '/project/README.md', type: 'file', size: 1024, modified: Date.now() },
    { name: 'package.json', path: '/project/package.json', type: 'file', size: 512, modified: Date.now() },
  ]

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useFileSystemStore()
    vi.clearAllMocks()
  })

  describe('初始状态', () => {
    it('应初始化为空根路径', () => {
      expect(store.rootPath).toBeNull()
    })

    it('应初始化为空文件树', () => {
      expect(store.fileTree).toEqual([])
    })

    it('应初始化加载状态为 false', () => {
      expect(store.loading).toBe(false)
    })

    it('应初始化错误为 null', () => {
      expect(store.error).toBeNull()
    })

    it('应初始化选中路径为 null', () => {
      expect(store.selectedPath).toBeNull()
    })

    it('应初始化展开路径为空 Set', () => {
      expect(store.expandedPaths).toEqual(new Set())
    })
  })

  describe('设置根目录', () => {
    beforeEach(() => {
      vi.mocked(fileCommands.listFiles).mockResolvedValue(mockFileEntries)
    })

    it('setRootPath() 应设置根路径', async () => {
      await store.setRootPath('/project')

      expect(store.rootPath).toBe('/project')
    })

    it('setRootPath() 应刷新文件树', async () => {
      await store.setRootPath('/project')

      expect(fileCommands.listFiles).toHaveBeenCalledWith('/project')
    })

    it('setRootPath() 应构建树结构', async () => {
      await store.setRootPath('/project')

      expect(store.fileTree.length).toBeGreaterThan(0)
    })
  })

  describe('刷新文件树', () => {
    beforeEach(() => {
      store.rootPath = '/project'
    })

    it('refreshFileTree() 无根路径应直接返回', async () => {
      store.rootPath = null
      await store.refreshFileTree()

      expect(fileCommands.listFiles).not.toHaveBeenCalled()
    })

    it('refreshFileTree() 应设置加载状态', async () => {
      vi.mocked(fileCommands.listFiles).mockResolvedValue(mockFileEntries)

      const promise = store.refreshFileTree()
      expect(store.loading).toBe(true)

      await promise
      expect(store.loading).toBe(false)
    })

    it('refreshFileTree() 成功应清除错误', async () => {
      vi.mocked(fileCommands.listFiles).mockResolvedValue(mockFileEntries)
      store.error = 'Previous error'

      await store.refreshFileTree()

      expect(store.error).toBeNull()
    })

    it('refreshFileTree() 失败应设置错误', async () => {
      vi.mocked(fileCommands.listFiles).mockRejectedValue(new Error('Failed to list'))

      await store.refreshFileTree()

      expect(store.error).toContain('加载文件树失败')
    })

    it('refreshFileTree() 失败应清除加载状态', async () => {
      vi.mocked(fileCommands.listFiles).mockRejectedValue(new Error('Failed'))

      await store.refreshFileTree()

      expect(store.loading).toBe(false)
    })
  })

  describe('文件树构建', () => {
    it('buildTree() 应正确构建文件夹和文件', () => {
      const tree = store.buildTree(mockFileEntries)

      expect(tree.length).toBe(4)
      const folder = tree.find(e => e.name === 'src')
      expect(folder?.type).toBe('folder')
      const file = tree.find(e => e.name === 'README.md')
      expect(file?.type).toBe('file')
    })

    it('buildTree() 文件夹应有 children 数组', () => {
      const tree = store.buildTree(mockFileEntries)
      const folder = tree.find(e => e.name === 'src')

      expect(folder?.children).toEqual([])
    })

    it('buildTree() 文件应无 children', () => {
      const tree = store.buildTree(mockFileEntries)
      const file = tree.find(e => e.name === 'README.md')

      expect(file?.children).toBeUndefined()
    })
  })

  describe('文件夹展开/折叠', () => {
    beforeEach(() => {
      store.rootPath = '/project'
      store.fileTree = [
        { name: 'src', path: '/project/src', type: 'folder', children: [], isExpanded: false },
      ]
    })

    it('toggleFolder() 折叠应移除展开路径', async () => {
      store.expandedPaths.add('/project/src')
      
      await store.toggleFolder('/project/src')

      expect(store.expandedPaths.has('/project/src')).toBe(false)
    })

    it('toggleFolder() 折叠应清空 children', async () => {
      store.expandedPaths.add('/project/src')
      store.fileTree[0].children = [{ name: 'file.ts', path: '/project/src/file.ts', type: 'file' }]
      store.fileTree[0].isExpanded = true

      await store.toggleFolder('/project/src')

      expect(store.fileTree[0].children).toEqual([])
      expect(store.fileTree[0].isExpanded).toBe(false)
    })

    it('toggleFolder() 展开应添加展开路径', async () => {
      vi.mocked(fileCommands.listFiles).mockResolvedValue([
        { name: 'file.ts', path: '/project/src/file.ts', type: 'file' },
      ])

      await store.toggleFolder('/project/src')

      expect(store.expandedPaths.has('/project/src')).toBe(true)
    })

    it('toggleFolder() 展开应加载子目录', async () => {
      const childEntries = [
        { name: 'file.ts', path: '/project/src/file.ts', type: 'file' },
      ]
      vi.mocked(fileCommands.listFiles).mockResolvedValue(childEntries)

      await store.toggleFolder('/project/src')

      expect(fileCommands.listFiles).toHaveBeenCalledWith('/project/src')
      expect(store.fileTree[0].children?.length).toBe(1)
    })

    it('toggleFolder() 展开失败应设置错误', async () => {
      vi.mocked(fileCommands.listFiles).mockRejectedValue(new Error('Failed'))

      await store.toggleFolder('/project/src')

      expect(store.error).toContain('展开文件夹失败')
    })
  })

  describe('文件选中', () => {
    it('selectEntry() 应设置选中路径', () => {
      store.selectEntry('/project/README.md')

      expect(store.selectedPath).toBe('/project/README.md')
    })

    it('selectEntry() null 应清除选中', () => {
      store.selectedPath = '/project/README.md'
      store.selectEntry(null)

      expect(store.selectedPath).toBeNull()
    })

    it('selectedEntry getter 应返回选中的条目', () => {
      store.fileTree = [
        { name: 'README.md', path: '/project/README.md', type: 'file' },
      ]
      store.selectEntry('/project/README.md')

      expect(store.selectedEntry?.name).toBe('README.md')
    })

    it('selectedEntry getter 无选中应返回 null', () => {
      expect(store.selectedEntry).toBeNull()
    })
  })

  describe('路径查找', () => {
    beforeEach(() => {
      store.fileTree = [
        {
          name: 'src',
          path: '/project/src',
          type: 'folder',
          children: [
            { name: 'index.ts', path: '/project/src/index.ts', type: 'file' },
          ],
        },
      ]
    })

    it('findEntryByPath() 应找到根目录条目', () => {
      const entry = store.findEntryByPath(store.fileTree, '/project/src')

      expect(entry?.name).toBe('src')
    })

    it('findEntryByPath() 应找到嵌套条目', () => {
      const entry = store.findEntryByPath(store.fileTree, '/project/src/index.ts')

      expect(entry?.name).toBe('index.ts')
    })

    it('findEntryByPath() 不存在应返回 null', () => {
      const entry = store.findEntryByPath(store.fileTree, '/project/nonexistent')

      expect(entry).toBeNull()
    })
  })

  describe('添加条目', () => {
    beforeEach(() => {
      store.rootPath = '/project'
      store.fileTree = [
        { name: 'src', path: '/project/src', type: 'folder', children: [], isExpanded: true },
      ]
    })

    it('addEntry() 应添加文件到根目录', () => {
      store.addEntry({
        name: 'README.md',
        path: '/project/README.md',
        type: 'file',
      })

      expect(store.fileTree.length).toBe(2)
    })

    it('addEntry() 应添加文件到子目录', () => {
      store.addEntry({
        name: 'index.ts',
        path: '/project/src/index.ts',
        type: 'file',
      })

      expect(store.fileTree[0].children?.length).toBe(1)
    })

    it('addEntry() 父目录未展开应自动展开', () => {
      store.fileTree[0].isExpanded = false
      store.expandedPaths.clear()

      store.addEntry({
        name: 'index.ts',
        path: '/project/src/index.ts',
        type: 'file',
      })

      expect(store.fileTree[0].isExpanded).toBe(true)
      expect(store.expandedPaths.has('/project/src')).toBe(true)
    })
  })

  describe('移除条目', () => {
    beforeEach(() => {
      store.rootPath = '/project'
      store.fileTree = [
        {
          name: 'src',
          path: '/project/src',
          type: 'folder',
          children: [
            { name: 'index.ts', path: '/project/src/index.ts', type: 'file' },
          ],
        },
        { name: 'README.md', path: '/project/README.md', type: 'file' },
      ]
    })

    it('removeEntry() 应移除根目录文件', () => {
      store.removeEntry('/project/README.md')

      expect(store.fileTree.length).toBe(1)
    })

    it('removeEntry() 应移除子目录文件', () => {
      store.removeEntry('/project/src/index.ts')

      expect(store.fileTree[0].children?.length).toBe(0)
    })
  })

  describe('文件读取', () => {
    it('readFileContent() 应返回文件内容', async () => {
      vi.mocked(fileCommands.readFile).mockResolvedValue('file content')

      const content = await store.readFileContent('/project/README.md')

      expect(content).toBe('file content')
      expect(fileCommands.readFile).toHaveBeenCalledWith('/project/README.md')
    })

    it('readFileContent() 失败应抛出错误', async () => {
      vi.mocked(fileCommands.readFile).mockRejectedValue(new Error('Read failed'))

      await expect(store.readFileContent('/project/README.md'))
        .rejects.toThrow('读取文件失败')
    })
  })

  describe('文件写入', () => {
    beforeEach(() => {
      store.fileTree = [
        { name: 'README.md', path: '/project/README.md', type: 'file', size: 100, modified: 1000 },
      ]
    })

    it('writeFileContent() 应写入文件', async () => {
      vi.mocked(fileCommands.writeFile).mockResolvedValue()
      vi.mocked(fileCommands.getFileInfo).mockResolvedValue({
        name: 'README.md',
        path: '/project/README.md',
        size: 200,
        is_dir: false,
        modified: 2000,
      })

      await store.writeFileContent('/project/README.md', 'new content')

      expect(fileCommands.writeFile).toHaveBeenCalledWith('/project/README.md', 'new content')
    })

    it('writeFileContent() 应更新文件元数据', async () => {
      vi.mocked(fileCommands.writeFile).mockResolvedValue()
      vi.mocked(fileCommands.getFileInfo).mockResolvedValue({
        name: 'README.md',
        path: '/project/README.md',
        size: 200,
        is_dir: false,
        modified: 2000,
      })

      await store.writeFileContent('/project/README.md', 'new content')

      const entry = store.findEntryByPath(store.fileTree, '/project/README.md')
      expect(entry?.size).toBe(200)
    })

    it('writeFileContent() 失败应抛出错误', async () => {
      vi.mocked(fileCommands.writeFile).mockRejectedValue(new Error('Write failed'))

      await expect(store.writeFileContent('/project/README.md', 'content'))
        .rejects.toThrow('写入文件失败')
    })
  })

  describe('文件创建', () => {
    beforeEach(() => {
      store.rootPath = '/project'
      store.fileTree = []
    })

    it('createNewFile() 应创建文件', async () => {
      vi.mocked(fileCommands.createFile).mockResolvedValue()

      await store.createNewFile('/project/newfile.txt')

      expect(fileCommands.createFile).toHaveBeenCalledWith('/project/newfile.txt')
    })

    it('createNewFile() 应添加到文件树', async () => {
      vi.mocked(fileCommands.createFile).mockResolvedValue()

      await store.createNewFile('/project/newfile.txt')

      expect(store.fileTree.length).toBe(1)
      expect(store.fileTree[0].name).toBe('newfile.txt')
    })

    it('createNewFile() 失败应抛出错误', async () => {
      vi.mocked(fileCommands.createFile).mockRejectedValue(new Error('Create failed'))

      await expect(store.createNewFile('/project/newfile.txt'))
        .rejects.toThrow('创建文件失败')
    })
  })

  describe('文件删除', () => {
    beforeEach(() => {
      store.rootPath = '/project'
      store.fileTree = [
        { name: 'README.md', path: '/project/README.md', type: 'file' },
      ]
      store.selectedPath = '/project/README.md'
    })

    it('deleteFileOrFolder() 应删除文件', async () => {
      vi.mocked(fileCommands.deleteFile).mockResolvedValue()

      await store.deleteFileOrFolder('/project/README.md')

      expect(fileCommands.deleteFile).toHaveBeenCalledWith('/project/README.md')
    })

    it('deleteFileOrFolder() 应从文件树移除', async () => {
      vi.mocked(fileCommands.deleteFile).mockResolvedValue()

      await store.deleteFileOrFolder('/project/README.md')

      expect(store.fileTree.length).toBe(0)
    })

    it('deleteFileOrFolder() 应清除选中状态', async () => {
      vi.mocked(fileCommands.deleteFile).mockResolvedValue()

      await store.deleteFileOrFolder('/project/README.md')

      expect(store.selectedPath).toBeNull()
    })

    it('deleteFileOrFolder() 失败应抛出错误', async () => {
      vi.mocked(fileCommands.deleteFile).mockRejectedValue(new Error('Delete failed'))

      await expect(store.deleteFileOrFolder('/project/README.md'))
        .rejects.toThrow('删除失败')
    })
  })

  describe('文件重命名', () => {
    beforeEach(() => {
      store.rootPath = '/project'
      store.fileTree = [
        { name: 'old.txt', path: '/project/old.txt', type: 'file' },
      ]
      store.selectedPath = '/project/old.txt'
    })

    it('renameFileOrFolder() 应重命名文件', async () => {
      vi.mocked(fileCommands.renameFile).mockResolvedValue()

      await store.renameFileOrFolder('/project/old.txt', '/project/new.txt')

      expect(fileCommands.renameFile).toHaveBeenCalledWith('/project/old.txt', '/project/new.txt')
    })

    it('renameFileOrFolder() 应更新文件树', async () => {
      vi.mocked(fileCommands.renameFile).mockResolvedValue()

      await store.renameFileOrFolder('/project/old.txt', '/project/new.txt')

      expect(store.fileTree.length).toBe(1)
      expect(store.fileTree[0].name).toBe('new.txt')
      expect(store.fileTree[0].path).toBe('/project/new.txt')
    })

    it('renameFileOrFolder() 应更新选中路径', async () => {
      vi.mocked(fileCommands.renameFile).mockResolvedValue()

      await store.renameFileOrFolder('/project/old.txt', '/project/new.txt')

      expect(store.selectedPath).toBe('/project/new.txt')
    })

    it('renameFileOrFolder() 失败应抛出错误', async () => {
      vi.mocked(fileCommands.renameFile).mockRejectedValue(new Error('Rename failed'))

      await expect(store.renameFileOrFolder('/project/old.txt', '/project/new.txt'))
        .rejects.toThrow('重命名失败')
    })
  })

  describe('Getters', () => {
    describe('isInWorkdir', () => {
      beforeEach(() => {
        store.rootPath = '/project'
      })

      it('应检查路径是否在工作目录内', () => {
        expect(store.isInWorkdir('/project/src/file.ts')).toBe(true)
      })

      it('工作目录外应返回 false', () => {
        expect(store.isInWorkdir('/other/file.ts')).toBe(false)
      })

      it('无根路径应返回 false', () => {
        store.rootPath = null
        expect(store.isInWorkdir('/project/file.ts')).toBe(false)
      })
    })

    describe('isExpanded', () => {
      it('应检查路径是否展开', () => {
        store.expandedPaths.add('/project/src')

        expect(store.isExpanded('/project/src')).toBe(true)
      })

      it('未展开应返回 false', () => {
        expect(store.isExpanded('/project/src')).toBe(false)
      })
    })
  })
})
