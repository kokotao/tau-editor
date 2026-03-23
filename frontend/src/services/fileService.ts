/**
 * 文件操作服务
 * 
 * 协调 editor、tabs、fileSystem 三个 store 的文件操作
 * 支持防抖自动保存
 */

import type { useEditorStore } from '@/stores/editor';
import type { useTabsStore } from '@/stores/tabs';
import type { useFileSystemStore } from '@/stores/fileSystem';

type UseEditorStoreReturn = ReturnType<typeof useEditorStore>;
type UseTabsStoreReturn = ReturnType<typeof useTabsStore>;
type UseFileSystemStoreReturn = ReturnType<typeof useFileSystemStore>;

/**
 * 文件操作结果
 */
export interface FileOperationResult {
  success: boolean;
  error?: string;
}

/**
 * 文件服务类
 */
export class FileService {
  private editorStore: UseEditorStoreReturn;
  private tabsStore: UseTabsStoreReturn;
  private fileSystemStore: UseFileSystemStoreReturn;
  private readonly binaryPreviewExtensions = new Set(['pdf', 'doc', 'docx', 'db', 'sqlite', 'sqlite3']);
  
  // 防抖自动保存
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private autoSaveDebounceMs: number = 1000; // 默认 1 秒防抖

  constructor(
    editorStore: UseEditorStoreReturn,
    tabsStore: UseTabsStoreReturn,
    fileSystemStore: UseFileSystemStoreReturn
  ) {
    this.editorStore = editorStore;
    this.tabsStore = tabsStore;
    this.fileSystemStore = fileSystemStore;
  }

  /**
   * 设置防抖延迟
   */
  setAutoSaveDebounce(ms: number) {
    this.autoSaveDebounceMs = ms;
  }

  /**
   * 取消待处理的自动保存
   */
  cancelPendingAutoSave() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * 打开文件
   * 
   * @param filePath 文件路径
   * @returns 操作结果
   */
  async openFile(filePath: string): Promise<FileOperationResult> {
    try {
      // 检查文件是否已打开
      const existingTabId = this.tabsStore.getTabIdByPath(filePath);
      if (existingTabId) {
        // 已打开，直接激活
        this.tabsStore.activateTab(existingTabId);
        return { success: true };
      }

      // 读取文件内容
      const content = await this.fileSystemStore.readFileContent(filePath);
      
      // 创建新标签
      const fileName = filePath.split('/').pop() || 'Untitled';
      const language = this.detectLanguage(fileName);
      
      this.tabsStore.addTab({
        filePath,
        fileName,
        language,
        isDirty: false,
        isUntitled: false,
        content,
      });

      // 设置编辑器内容
      this.editorStore.setContent(content, false);
      this.editorStore.setLanguage(language);
      this.editorStore.markAsSaved();
      this.editorStore.updateCursorPosition(1, 1);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { 
        success: false, 
        error: `打开文件失败：${message}` 
      };
    }
  }

  /**
   * 保存文件
   * 
   * @param tabId 标签 ID，如果不传则保存当前激活标签
   * @returns 操作结果
   */
  async saveFile(tabId?: string): Promise<FileOperationResult> {
    const targetTabId = tabId || this.tabsStore.activeTabId;
    if (!targetTabId) {
      return { 
        success: false, 
        error: '没有活动的标签页' 
      };
    }

    const tab = this.tabsStore.tabs.find(t => t.id === targetTabId);
    if (!tab) {
      return { 
        success: false, 
        error: '标签页不存在' 
      };
    }

    if (this.isBinaryPreviewTab(tab)) {
      return {
        success: false,
        error: '当前文件为二进制预览，禁止直接覆盖保存',
      };
    }

    try {
      // 写入文件内容
      if (!tab.filePath) {
        return {
          success: false,
          error: '当前标签还没有文件路径，请使用另存为',
        };
      }

      await this.fileSystemStore.writeFileContent(tab.filePath, this.editorStore.content);
      
      // 更新标签状态
      this.tabsStore.updateTabDirty(targetTabId, false);
      this.editorStore.markAsSaved();

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { 
        success: false, 
        error: `保存文件失败：${message}` 
      };
    }
  }

  private isBinaryPreviewTab(tab: { filePath: string | null; content: string }): boolean {
    if (!tab.filePath || !tab.content.startsWith('[Binary File Preview]')) {
      return false;
    }

    const ext = tab.filePath.split('.').pop()?.toLowerCase() || '';
    return this.binaryPreviewExtensions.has(ext);
  }

  /**
   * 另存为新文件
   * 
   * @param newFilePath 新文件路径
   * @returns 操作结果
   */
  async saveAsFile(newFilePath: string): Promise<FileOperationResult> {
    const activeTab = this.tabsStore.activeTab;
    if (!activeTab) {
      return { 
        success: false, 
        error: '没有活动的标签页' 
      };
    }

    try {
      // 写入新文件
      await this.fileSystemStore.writeFileContent(newFilePath, this.editorStore.content);
      
      // 更新当前标签的路径
      const fileName = newFilePath.split('/').pop() || 'Untitled';
      activeTab.filePath = newFilePath;
      activeTab.fileName = fileName;
      activeTab.isDirty = false;
      activeTab.isUntitled = false;
      activeTab.content = this.editorStore.content;
      
      // 更新编辑器状态
      this.editorStore.markAsSaved();
      
      // 更新文件树
      try {
        await this.fileSystemStore.refreshFileTree();
      } catch (e) {
        // 忽略文件树刷新失败
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { 
        success: false, 
        error: `另存为失败：${message}` 
      };
    }
  }

  /**
   * 创建新文件
   * 
   * @param filePath 文件路径
   * @param content 初始内容 (可选)
   * @returns 操作结果
   */
  async createFile(filePath: string, content: string = ''): Promise<FileOperationResult> {
    try {
      // 创建文件
      await this.fileSystemStore.createNewFile(filePath);
      
      // 打开新文件
      return await this.openFile(filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { 
        success: false, 
        error: `创建文件失败：${message}` 
      };
    }
  }

  /**
   * 关闭标签页
   * 
   * @param tabId 标签 ID
   * @param force 是否强制关闭 (忽略未保存的更改)
   * @returns 操作结果
   */
  async closeTab(tabId: string, force: boolean = false): Promise<FileOperationResult> {
    const tab = this.tabsStore.tabs.find(t => t.id === tabId);
    if (!tab) {
      return { 
        success: false, 
        error: '标签页不存在' 
      };
    }

    // 检查是否有未保存的更改
    if (tab.isDirty && !force) {
      // 这里应该弹出一个确认对话框，由 UI 层处理
      // 返回一个特殊错误码表示需要确认
      return { 
        success: false, 
        error: 'UNSAVED_CHANGES' 
      };
    }

    this.tabsStore.closeTab(tabId);

    // 如果关闭的是当前标签，需要更新编辑器状态
    if (tabId === this.tabsStore.activeTabId || !this.tabsStore.activeTabId) {
      const newActiveTab = this.tabsStore.activeTab;
      if (newActiveTab) {
        // 加载新激活标签的内容
        try {
          if (newActiveTab.filePath) {
            const content = await this.fileSystemStore.readFileContent(newActiveTab.filePath);
            this.editorStore.setContent(content, false);
            this.editorStore.setLanguage(newActiveTab.language);
          } else {
            this.editorStore.setContent(newActiveTab.content, false);
            this.editorStore.setLanguage(newActiveTab.language);
          }
        } catch (e) {
          // 如果加载失败，清空编辑器
          this.editorStore.reset();
        }
      } else {
        // 没有标签了，重置编辑器
        this.editorStore.reset();
      }
    }

    return { success: true };
  }

  /**
   * 关闭所有标签页
   * 
   * @param force 是否强制关闭
   * @returns 操作结果
   */
  async closeAllTabs(force: boolean = false): Promise<FileOperationResult> {
    const dirtyTabs = this.tabsStore.dirtyTabs;
    
    if (dirtyTabs.length > 0 && !force) {
      return { 
        success: false, 
        error: 'UNSAVED_CHANGES' 
      };
    }

    // 保存所有脏标签
    if (!force) {
      for (const tab of dirtyTabs) {
        const result = await this.saveFile(tab.id);
        if (!result.success) {
          return result;
        }
      }
    }

    this.tabsStore.closeAll();
    this.editorStore.reset();

    return { success: true };
  }

  /**
   * 根据文件名检测语言模式
   */
  private detectLanguage(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'vue': 'vue',
      'py': 'python',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'h': 'c',
      'hpp': 'cpp',
      'cs': 'csharp',
      'go': 'go',
      'rs': 'rust',
      'rb': 'ruby',
      'php': 'php',
      'html': 'html',
      'htm': 'html',
      'css': 'css',
      'scss': 'scss',
      'less': 'less',
      'json': 'json',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'md': 'markdown',
      'sql': 'sql',
      'sh': 'shell',
      'bat': 'shell',
      'cmd': 'shell',
      'bash': 'shell',
      'ps1': 'powershell',
      'toml': 'toml',
      'ini': 'ini',
      'txt': 'plaintext',
    };

    return languageMap[ext] || 'plaintext';
  }

  /**
   * 自动保存所有脏标签
   */
  async autoSaveAll(): Promise<void> {
    const dirtyTabs = this.tabsStore.dirtyTabs;
    
    for (const tab of dirtyTabs) {
      // 只有当这个标签是当前激活标签时才保存
      if (tab.id === this.tabsStore.activeTabId) {
        await this.saveFile(tab.id);
      }
    }
  }
}

/**
 * 创建文件服务实例
 */
export function createFileService(
  editorStore: UseEditorStoreReturn,
  tabsStore: UseTabsStoreReturn,
  fileSystemStore: UseFileSystemStoreReturn
): FileService {
  return new FileService(editorStore, tabsStore, fileSystemStore);
}
