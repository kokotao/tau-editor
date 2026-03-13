import { defineStore } from 'pinia';
import { fileCommands, type FileEntry, TauriError } from '@/lib/tauri';
import { useWorkspaceStore } from '@/stores/workspace';

export interface FileTreeNode extends FileEntry {
  children?: FileTreeNode[];
  isExpanded?: boolean;
}

export interface FileSystemState {
  fileTree: FileTreeNode[];     // 文件树
  loading: boolean;             // 是否正在加载
  error: string | null;         // 错误信息
  selectedPath: string | null;  // 当前选中的文件/文件夹
  expandedPaths: Set<string>;   // 已展开的文件夹路径
}

export const useFileSystemStore = defineStore('fileSystem', {
  state: (): FileSystemState => ({
    fileTree: [],
    loading: false,
    error: null,
    selectedPath: null,
    expandedPaths: new Set(),
  }),

  getters: {
    rootPath: () => useWorkspaceStore().currentWorkspacePath,

    // 获取选中条目的详细信息
    selectedEntry: (state): FileTreeNode | null => {
      if (!state.selectedPath) return null;
      return state.fileTree.find(entry => entry.path === state.selectedPath) || null;
    },

    // 检查路径是否在工作目录内
    isInWorkdir() {
      return (path: string) => {
        const rootPath = this.rootPath;
        if (!rootPath) return false;
        return path.startsWith(rootPath);
      };
    },

    // 获取展开状态
    isExpanded: (state) => {
      return (path: string) => state.expandedPaths.has(path);
    },
  },

  actions: {
    clearWorkspaceState() {
      this.fileTree = [];
      this.error = null;
      this.selectedPath = null;
      this.expandedPaths.clear();
    },

    async syncFromWorkspace() {
      if (!this.rootPath) {
        this.clearWorkspaceState();
        return;
      }

      await this.refreshFileTree();
    },

    // 刷新文件树
    async refreshFileTree() {
      const rootPath = this.rootPath;
      if (!rootPath) {
        this.clearWorkspaceState();
        return;
      }

      this.loading = true;
      this.error = null;

      try {
        const entries = await fileCommands.listFiles(rootPath);
        this.fileTree = this.buildTree(entries);
      } catch (error) {
        const tauriError = error instanceof TauriError ? error : TauriError.fromError(error, 'list_files');
        this.error = `加载文件树失败：${tauriError.message}`;
        console.error('Failed to refresh file tree:', tauriError);
      } finally {
        this.loading = false;
      }
    },

    // 构建文件树
    buildTree(entries: FileEntry[]): FileTreeNode[] {
      const tree: FileTreeNode[] = [];
      const folderMap = new Map<string, FileTreeNode>();

      // 首先创建所有文件夹
      entries.forEach(entry => {
        if (entry.type === 'folder') {
          folderMap.set(entry.path, { 
            ...entry, 
            children: [],
            isExpanded: this.expandedPaths.has(entry.path),
          });
        }
      });

      // 然后添加文件和子文件夹
      entries.forEach(entry => {
        if (entry.type === 'folder') {
          tree.push(folderMap.get(entry.path)!);
        } else {
          // 文件，找到父文件夹添加
          const parentPath = entry.path.substring(0, entry.path.lastIndexOf('/'));
          const parent = folderMap.get(parentPath);
          if (parent && parent.children) {
            parent.children.push({ ...entry });
          } else {
            tree.push({ ...entry });
          }
        }
      });

      return tree;
    },

    // 切换文件夹展开状态
    async toggleFolder(folderPath: string) {
      const isExpanded = this.expandedPaths.has(folderPath);
      
      if (isExpanded) {
        this.expandedPaths.delete(folderPath);
        // 折叠时不需要刷新，直接从树中移除 children
        const folder = this.findEntryByPath(this.fileTree, folderPath);
        if (folder) {
          folder.isExpanded = false;
          folder.children = [];
        }
      } else {
        // 展开时需要加载子目录
        this.expandedPaths.add(folderPath);
        try {
          const entries = await fileCommands.listFiles(folderPath);
          const folder = this.findEntryByPath(this.fileTree, folderPath);
          if (folder) {
            folder.isExpanded = true;
            folder.children = this.buildTree(entries);
          }
        } catch (error) {
          const tauriError = error instanceof TauriError ? error : TauriError.fromError(error, 'list_files');
          this.error = `展开文件夹失败：${tauriError.message}`;
          console.error('Failed to toggle folder:', tauriError);
        }
      }
    },

    // 按路径查找条目
    findEntryByPath(entries: FileTreeNode[], targetPath: string): FileTreeNode | null {
      for (const entry of entries) {
        if (entry.path === targetPath) {
          return entry;
        }
        if (entry.children) {
          const found = this.findEntryByPath(entry.children, targetPath);
          if (found) return found;
        }
      }
      return null;
    },

    // 设置选中项
    selectEntry(path: string | null) {
      this.selectedPath = path;
    },

    // 添加新条目到树
    addEntry(entry: FileEntry) {
      const newNode: FileTreeNode = { ...entry, children: entry.type === 'folder' ? [] : undefined };
      const parentPath = entry.path.substring(0, entry.path.lastIndexOf('/'));
      const rootPath = this.rootPath;
      
      if (parentPath === rootPath || !parentPath) {
        this.fileTree.push(newNode);
      } else {
        const parent = this.findEntryByPath(this.fileTree, parentPath);
        if (parent && parent.children) {
          parent.children.push(newNode);
          // 如果父文件夹未展开，展开它
          if (!parent.isExpanded) {
            this.expandedPaths.add(parentPath);
            parent.isExpanded = true;
          }
        }
      }
    },

    // 从树中移除条目
    removeEntry(entryPath: string) {
      const parentPath = entryPath.substring(0, entryPath.lastIndexOf('/'));
      const rootPath = this.rootPath;
      
      if (parentPath === rootPath || !parentPath) {
        this.fileTree = this.fileTree.filter(e => e.path !== entryPath);
      } else {
        const parent = this.findEntryByPath(this.fileTree, parentPath);
        if (parent && parent.children) {
          parent.children = parent.children.filter(e => e.path !== entryPath);
        }
      }
    },

    // 更新条目
    updateEntry(entryPath: string, updates: Partial<FileEntry>) {
      const entry = this.findEntryByPath(this.fileTree, entryPath);
      if (entry) {
        Object.assign(entry, updates);
      }
    },

    // 读取文件内容
    async readFileContent(filePath: string): Promise<string> {
      try {
        return await fileCommands.readFile(filePath);
      } catch (error) {
        const tauriError = error instanceof TauriError ? error : TauriError.fromError(error, 'read_file');
        throw new Error(`读取文件失败：${tauriError.message}`);
      }
    },

    // 写入文件内容
    async writeFileContent(filePath: string, content: string): Promise<void> {
      try {
        await fileCommands.writeFile(filePath, content);
        // 更新文件树中的修改时间
        try {
          const info = await fileCommands.getFileInfo(filePath);
          this.updateEntry(filePath, { 
            size: info.size,
            modified: info.modified,
          });
        } catch (e) {
          // 忽略元数据更新失败
        }
      } catch (error) {
        const tauriError = error instanceof TauriError ? error : TauriError.fromError(error, 'write_file');
        throw new Error(`写入文件失败：${tauriError.message}`);
      }
    },

    // 创建新文件
    async createNewFile(filePath: string): Promise<void> {
      try {
        await fileCommands.createFile(filePath);
        this.addEntry({
          name: filePath.split('/').pop() || 'Untitled',
          path: filePath,
          type: 'file',
          size: 0,
          modified: Date.now(),
        });
      } catch (error) {
        const tauriError = error instanceof TauriError ? error : TauriError.fromError(error, 'create_file');
        throw new Error(`创建文件失败：${tauriError.message}`);
      }
    },

    // 删除文件
    async deleteFileOrFolder(path: string): Promise<void> {
      try {
        await fileCommands.deleteFile(path);
        this.removeEntry(path);
        if (this.selectedPath === path) {
          this.selectedPath = null;
        }
      } catch (error) {
        const tauriError = error instanceof TauriError ? error : TauriError.fromError(error, 'delete_file');
        throw new Error(`删除失败：${tauriError.message}`);
      }
    },

    // 重命名文件
    async renameFileOrFolder(oldPath: string, newPath: string): Promise<void> {
      try {
        await fileCommands.renameFile(oldPath, newPath);
        // 从树中移除旧条目，添加新条目
        const oldEntry = this.findEntryByPath(this.fileTree, oldPath);
        if (oldEntry) {
          this.removeEntry(oldPath);
          this.addEntry({
            ...oldEntry,
            name: newPath.split('/').pop() || 'Untitled',
            path: newPath,
          });
        }
        if (this.selectedPath === oldPath) {
          this.selectedPath = newPath;
        }
      } catch (error) {
        const tauriError = error instanceof TauriError ? error : TauriError.fromError(error, 'rename_file');
        throw new Error(`重命名失败：${tauriError.message}`);
      }
    },
  },

  // 持久化配置 - 暂时禁用，等待类型修复
  // persist: {
  //   storage: localStorage,
  //   paths: ['rootPath', 'expandedPaths'],
  //   serialize: (value) => {
  //     // Set 需要特殊处理
  //     const serialized = { ...value };
  //     if (value.expandedPaths instanceof Set) {
  //       (serialized as any).expandedPaths = Array.from(value.expandedPaths);
  //     }
  //     return JSON.stringify(serialized);
  //   },
  //   deserialize: (value) => {
  //     const parsed = JSON.parse(value);
  //     return {
  //       ...parsed,
  //       expandedPaths: new Set(parsed.expandedPaths || []),
  //     };
  //   },
  // },
});
