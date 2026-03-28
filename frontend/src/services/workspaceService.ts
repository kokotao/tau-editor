import { open } from '@tauri-apps/plugin-dialog';
import { fileCommands } from '@/lib/tauri';
import type { useEditorStore } from '@/stores/editor';
import type { useFileSystemStore } from '@/stores/fileSystem';
import type { useNotificationStore } from '@/stores/notification';
import type { useSettingsStore } from '@/stores/settings';
import type { useTabsStore } from '@/stores/tabs';
import type { useWorkspaceStore } from '@/stores/workspace';

type FileSystemStore = ReturnType<typeof useFileSystemStore>;
type TabsStore = ReturnType<typeof useTabsStore>;
type WorkspaceStore = ReturnType<typeof useWorkspaceStore>;
type EditorStore = ReturnType<typeof useEditorStore>;
type NotificationStore = ReturnType<typeof useNotificationStore>;
type SettingsStore = ReturnType<typeof useSettingsStore>;

function getBaseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function detectLanguage(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    vue: 'vue',
    py: 'python',
    java: 'java',
    rs: 'rust',
    md: 'markdown',
    json: 'json',
    html: 'html',
    css: 'css',
    scss: 'scss',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    sql: 'sql',
    sh: 'shell',
    bat: 'shell',
    cmd: 'shell',
    go: 'go',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
  };

  return languageMap[ext] || 'plaintext';
}

const LARGE_FILE_CHUNK_LOAD_THRESHOLD_BYTES = 12 * 1024 * 1024;
const LARGE_FILE_DEFAULT_CHUNK_BYTES = 2 * 1024 * 1024;
const BINARY_PREVIEW_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'db', 'sqlite', 'sqlite3']);

function isBinaryPreviewPath(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return BINARY_PREVIEW_EXTENSIONS.has(ext);
}

function formatSize(size: number): string {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(2)} KB`;
  }
  return `${size} B`;
}

export class WorkspaceService {
  private readonly largeFileLoadSessions = new Map<string, number>();
  private largeFileLoadSessionSeed = 0;

  constructor(
    private readonly fileSystemStore: FileSystemStore,
    private readonly tabsStore: TabsStore,
    private readonly workspaceStore: WorkspaceStore,
    private readonly editorStore: EditorStore,
    private readonly settingsStore: SettingsStore,
    private readonly notificationStore: NotificationStore,
  ) {}

  private ensureTabCapacity(label: string, additionalContent = '', additionalBytes?: number): boolean {
    const maxOpenTabs = Math.max(1, Math.floor(this.settingsStore.maxOpenTabs));
    if (this.tabsStore.tabs.length >= maxOpenTabs) {
      const title = this.settingsStore.uiLanguage === 'en-US' ? 'Tab limit reached' : '已达到标签页上限';
      const message = this.settingsStore.uiLanguage === 'en-US'
        ? `Cannot open ${label}. Close tabs or increase max open tabs in settings.`
        : `无法打开 ${label}。请先关闭一些标签，或在设置里提高最大标签页数量。`;
      this.notificationStore.warning(title, message);
      return false;
    }

    const memoryLimitMB = Math.max(64, Math.floor(this.settingsStore.memoryLimitMB));
    const memoryLimitBytes = memoryLimitMB * 1024 * 1024;
    const estimatedBytes = this.tabsStore.tabs.reduce((total, tab) => total + tab.content.length * 2, 0)
      + (typeof additionalBytes === 'number' ? additionalBytes : additionalContent.length * 2);
    if (estimatedBytes > memoryLimitBytes) {
      const title = this.settingsStore.uiLanguage === 'en-US' ? 'Memory limit reached' : '已达到标签内存上限';
      const message = this.settingsStore.uiLanguage === 'en-US'
        ? `Estimated tab memory exceeds ${memoryLimitMB}MB. Close tabs or raise memory limit in settings.`
        : `预计标签内存将超过 ${memoryLimitMB}MB。请关闭部分标签，或在设置里提高内存上限。`;
      this.notificationStore.warning(title, message);
      return false;
    }

    return true;
  }

  private beginLargeFileLoadSession(tabId: string): number {
    this.largeFileLoadSessionSeed += 1;
    const sessionId = this.largeFileLoadSessionSeed;
    this.largeFileLoadSessions.set(tabId, sessionId);
    return sessionId;
  }

  private isLargeFileLoadSessionActive(tabId: string, sessionId: number): boolean {
    return this.largeFileLoadSessions.get(tabId) === sessionId;
  }

  private calculateLargeFileProgress(loadedBytes: number, totalBytes: number): number {
    if (totalBytes <= 0) {
      return 100;
    }
    return Math.max(0, Math.min(100, Math.round((loadedBytes / totalBytes) * 100)));
  }

  private async loadRemainingLargeFileChunks(
    tabId: string,
    filePath: string,
    fileSize: number,
    chunkSize: number,
    startOffset: number,
    fileName: string,
    sessionId: number,
    initialContent: string,
  ) {
    let offset = startOffset;
    let loadedBytes = Math.min(fileSize, startOffset);
    let fullContent = initialContent;

    try {
      while (offset < fileSize) {
        const tab = this.tabsStore.tabs.find((item) => item.id === tabId);
        if (!tab) {
          this.largeFileLoadSessions.delete(tabId);
          return;
        }
        if (!this.isLargeFileLoadSessionActive(tabId, sessionId)) {
          return;
        }

        const chunk = await fileCommands.readFileChunked(
          filePath,
          offset,
          Math.min(chunkSize, fileSize - offset),
        );
        if (chunk.size <= 0) {
          break;
        }

        fullContent += chunk.content;
        offset = chunk.offset + chunk.size;
        loadedBytes = Math.min(fileSize, offset);

        this.tabsStore.updateTab(tabId, {
          largeFileLoadedBytes: loadedBytes,
          largeFileLoadProgress: this.calculateLargeFileProgress(loadedBytes, fileSize),
        });

        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      if (!this.isLargeFileLoadSessionActive(tabId, sessionId)) {
        return;
      }

      this.largeFileLoadSessions.delete(tabId);
      this.tabsStore.updateTab(tabId, {
        content: fullContent,
        isLoadingContent: false,
        largeFileLoadedBytes: fileSize,
        largeFileLoadProgress: 100,
        largeFileLoadSessionId: undefined,
      });
      const title = this.settingsStore.uiLanguage === 'en-US' ? 'Large file loaded' : '大文件加载完成';
      const message = this.settingsStore.uiLanguage === 'en-US'
        ? `${fileName} is fully loaded and editable now.`
        : `${fileName} 已完整加载，现在可编辑。`;
      this.notificationStore.success(title, message);
    } catch (error: any) {
      if (!this.isLargeFileLoadSessionActive(tabId, sessionId)) {
        return;
      }

      this.largeFileLoadSessions.delete(tabId);
      this.tabsStore.updateTab(tabId, {
        isLoadingContent: true,
        largeFileLoadSessionId: undefined,
      });
      const title = this.settingsStore.uiLanguage === 'en-US' ? 'Large file loading failed' : '大文件加载失败';
      const message = this.settingsStore.uiLanguage === 'en-US'
        ? `${error?.message || 'Unknown error'}. Reopen the file to retry.`
        : `${error?.message || '未知错误'}。请重新打开该文件重试。`;
      this.notificationStore.error(title, message);
    }
  }

  createUntitledFile() {
    const untitledCount = this.tabsStore.tabs.filter((tab) => tab.isUntitled).length + 1;
    const fileName = untitledCount === 1 ? 'Untitled.txt' : `Untitled-${untitledCount}.txt`;
    if (!this.ensureTabCapacity(fileName)) {
      return;
    }

    this.tabsStore.addTab({
      filePath: null,
      fileName,
      language: detectLanguage(fileName),
      isDirty: false,
      isUntitled: true,
      content: '',
    });
    this.workspaceStore.setMode('single-file');
    this.editorStore.setLanguage(detectLanguage(fileName));
  }

  async openFile(filePath: string) {
    const existingTabId = this.tabsStore.getTabIdByPath(filePath);
    if (existingTabId) {
      this.tabsStore.activateTab(existingTabId);
      this.fileSystemStore.selectEntry(filePath);
      return;
    }

    try {
      this.fileSystemStore.loading = true;
      const fileName = getBaseName(filePath);
      let content = '';

      let fileSize = 0;
      try {
        const fileInfo = await fileCommands.getFileInfo(filePath);
        fileSize = fileInfo.size;
      } catch {
        fileSize = 0;
      }

      if (fileSize > 0 && !isBinaryPreviewPath(filePath)) {
        let chunkLoadThresholdBytes = LARGE_FILE_CHUNK_LOAD_THRESHOLD_BYTES;
        let chunkBytes = LARGE_FILE_DEFAULT_CHUNK_BYTES;
        try {
          const config = await fileCommands.getLargeFileConfig();
          chunkLoadThresholdBytes = Math.min(
            LARGE_FILE_CHUNK_LOAD_THRESHOLD_BYTES,
            Math.floor(config.maxFileSizeMb * 1024 * 1024),
          );
          chunkBytes = Math.max(
            256 * 1024,
            Math.floor(config.chunkSizeKb * 1024),
          );
        } catch {
          // Use fallback defaults when config is unavailable.
        }

        if (fileSize >= chunkLoadThresholdBytes) {
          const firstChunk = await fileCommands.readFileChunked(
            filePath,
            0,
            Math.min(chunkBytes, fileSize),
          );
          content = firstChunk.content;
          const initialLoadedBytes = Math.min(fileSize, firstChunk.offset + firstChunk.size);
          const initialProgress = this.calculateLargeFileProgress(initialLoadedBytes, fileSize);
          const isFullyLoaded = firstChunk.isLast || initialLoadedBytes >= fileSize;
          if (!this.ensureTabCapacity(fileName, content, fileSize * 2)) {
            return;
          }

          const tabId = this.tabsStore.addTab({
            filePath,
            fileName,
            language: detectLanguage(fileName),
            isDirty: false,
            isUntitled: false,
            content,
            isLargeFile: true,
            isLoadingContent: !isFullyLoaded,
            largeFileSize: fileSize,
            largeFileChunkSize: chunkBytes,
            largeFileLoadedBytes: initialLoadedBytes,
            largeFileLoadProgress: initialProgress,
            largeFileLoadSessionId: undefined,
          });

          this.fileSystemStore.selectEntry(filePath);
          this.workspaceStore.openSingleFile(filePath);
          if (!isFullyLoaded) {
            const sessionId = this.beginLargeFileLoadSession(tabId);
            this.tabsStore.updateTab(tabId, { largeFileLoadSessionId: sessionId });

            const title = this.settingsStore.uiLanguage === 'en-US' ? 'Loading large file' : '正在分段加载大文件';
            const message = this.settingsStore.uiLanguage === 'en-US'
              ? `${fileName} ${formatSize(fileSize)} is loading in chunks.`
              : `${fileName} (${formatSize(fileSize)}) 正在分段加载。`;
            this.notificationStore.info(title, message);

            void this.loadRemainingLargeFileChunks(
              tabId,
              filePath,
              fileSize,
              chunkBytes,
              initialLoadedBytes,
              fileName,
              sessionId,
              content,
            );
          } else {
            this.tabsStore.updateTab(tabId, {
              isLoadingContent: false,
              largeFileLoadedBytes: fileSize,
              largeFileLoadProgress: 100,
            });
          }
          return;
        }
      }

      content = await this.fileSystemStore.readFileContent(filePath);
      if (!this.ensureTabCapacity(fileName, content)) {
        return;
      }

      this.tabsStore.addTab({
        filePath,
        fileName,
        language: detectLanguage(fileName),
        isDirty: false,
        isUntitled: false,
        content,
      });

      this.fileSystemStore.selectEntry(filePath);
      this.workspaceStore.openSingleFile(filePath);
    } catch (error: any) {
      this.notificationStore.error('打开文件失败', error.message || '无法读取该文件');
    } finally {
      this.fileSystemStore.loading = false;
    }
  }

  async openFileWithPicker() {
    try {
      const selected = await open({
        title: '选择要打开的文件',
        multiple: false,
        directory: false,
      });

      const pickedPath = Array.isArray(selected) ? selected[0] : selected;
      if (typeof pickedPath === 'string' && pickedPath) {
        await this.openFile(pickedPath);
      }
    } catch (error: any) {
      this.notificationStore.error('打开文件失败', error.message || '文件选择器调用失败');
    }
  }

  async openWorkspace(path: string) {
    this.workspaceStore.openWorkspace(path);
    await this.fileSystemStore.syncFromWorkspace();
    this.fileSystemStore.selectEntry(null);
  }

  async openFolderWithPicker() {
    try {
      const selected = await open({
        title: '选择文件夹',
        multiple: false,
        directory: true,
      });

      const pickedPath = Array.isArray(selected) ? selected[0] : selected;
      if (typeof pickedPath === 'string' && pickedPath) {
        await this.openWorkspace(pickedPath);
        return true;
      }

      return false;
    } catch (error: any) {
      this.notificationStore.error('打开文件夹失败', error.message || '目录选择器调用失败');
      return false;
    }
  }

  async openRecentProject(path: string) {
    this.workspaceStore.openWorkspace(path);
    await this.fileSystemStore.syncFromWorkspace();
    this.fileSystemStore.selectEntry(null);
  }

  async refreshWorkspace() {
    if (!this.workspaceStore.currentWorkspacePath) {
      this.notificationStore.info('资源管理器为空', '先打开一个文件夹，再刷新目录');
      return;
    }

    await this.fileSystemStore.refreshFileTree();
  }
}

export function createWorkspaceService(
  fileSystemStore: FileSystemStore,
  tabsStore: TabsStore,
  workspaceStore: WorkspaceStore,
  editorStore: EditorStore,
  settingsStore: SettingsStore,
  notificationStore: NotificationStore,
) {
  return new WorkspaceService(
    fileSystemStore,
    tabsStore,
    workspaceStore,
    editorStore,
    settingsStore,
    notificationStore,
  );
}
