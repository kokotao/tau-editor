import { save } from '@tauri-apps/plugin-dialog';
import { fileCommands } from '@/lib/tauri';
import { normalizeModifiedTimestamp } from '@/services/externalFileSync';
import type { useEditorStore } from '@/stores/editor';
import type { useFileSystemStore } from '@/stores/fileSystem';
import type { useNotificationStore } from '@/stores/notification';
import type { Tab, useTabsStore } from '@/stores/tabs';
import type { useWorkspaceStore } from '@/stores/workspace';

type FileSystemStore = ReturnType<typeof useFileSystemStore>;
type TabsStore = ReturnType<typeof useTabsStore>;
type EditorStore = ReturnType<typeof useEditorStore>;
type NotificationStore = ReturnType<typeof useNotificationStore>;
type WorkspaceStore = ReturnType<typeof useWorkspaceStore>;

function getBaseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function getDirName(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash === -1 ? '' : normalized.slice(0, lastSlash);
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

const BINARY_PREVIEW_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'db', 'sqlite', 'sqlite3']);
const LARGE_FILE_PREVIEW_PREFIX = '[Large File Preview]';
const LARGE_FILE_SAVE_CHUNK_BYTES = 1024 * 1024;
const EDITOR_STORE_CONTENT_SYNC_MAX_CHARS = 1_000_000;

function isBinaryPreviewPath(filePath: string | null | undefined): boolean {
  if (!filePath) return false;
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return BINARY_PREVIEW_EXTENSIONS.has(ext);
}

function isBinaryPreviewContent(content: string): boolean {
  return content.startsWith('[Binary File Preview]');
}

function isLargeFilePreviewContent(content: string): boolean {
  return content.startsWith(LARGE_FILE_PREVIEW_PREFIX);
}

export class TabService {
  constructor(
    private readonly tabsStore: TabsStore,
    private readonly fileSystemStore: FileSystemStore,
    private readonly editorStore: EditorStore,
    private readonly workspaceStore: WorkspaceStore,
    private readonly notificationStore: NotificationStore,
  ) {}

  activateTab(tabId: string) {
    this.tabsStore.activateTab(tabId);
  }

  closeTab(tabId: string) {
    this.tabsStore.closeTab(tabId);
  }

  closeOthers(tabId: string) {
    this.tabsStore.closeOthers(tabId);
  }

  closeAll() {
    this.tabsStore.closeAll();
  }

  private async writeLargeFileInChunks(path: string, content: string, chunkBytes = LARGE_FILE_SAVE_CHUNK_BYTES) {
    const chunkChars = Math.max(64 * 1024, Math.floor(chunkBytes / 2));
    let offset = 0;
    let append = false;

    while (offset < content.length) {
      const chunk = content.slice(offset, offset + chunkChars);
      await fileCommands.writeFileChunked(path, chunk, append);
      append = true;
      offset += chunk.length;

      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (content.length === 0) {
      await fileCommands.writeFileChunked(path, '', false);
    }
  }

  async saveActiveTab() {
    const tab = this.tabsStore.activeTab;
    if (!tab) {
      this.notificationStore.warning('没有可保存的文件', '请先创建文件或打开现有文件');
      return;
    }

    if (isBinaryPreviewPath(tab.filePath) && isBinaryPreviewContent(tab.content)) {
      this.notificationStore.warning('当前文件为二进制预览', '为避免破坏原始文件，暂不支持直接保存该预览内容');
      return;
    }

    if (isLargeFilePreviewContent(tab.content)) {
      this.notificationStore.warning('当前文件为大文件预览', '该标签仅加载了部分内容，暂不支持保存或覆盖原文件');
      return;
    }

    if (tab.isLoadingContent) {
      this.notificationStore.warning('文件仍在加载', '请等待大文件分段加载完成后再保存');
      return;
    }

    if (tab.isUntitled || !tab.filePath) {
      await this.saveActiveTabAs();
      return;
    }

    try {
      if (tab.isLargeFile) {
        await this.writeLargeFileInChunks(
          tab.filePath,
          tab.content,
          tab.largeFileChunkSize ?? LARGE_FILE_SAVE_CHUNK_BYTES,
        );
      } else {
        await this.fileSystemStore.writeFileContent(tab.filePath, tab.content);
      }
      let lastKnownModified: number | null = null;
      try {
        const fileInfo = await fileCommands.getFileInfo(tab.filePath);
        lastKnownModified = normalizeModifiedTimestamp(fileInfo.modified);
      } catch {
        lastKnownModified = null;
      }
      this.tabsStore.updateTab(tab.id, {
        isDirty: false,
        isUntitled: false,
        lastKnownModified,
        externalModifiedAt: null,
      });
      this.editorStore.markAsSaved();
      this.workspaceStore.openSingleFile(tab.filePath);
      this.notificationStore.success('保存成功', tab.fileName);

      if (this.workspaceStore.currentWorkspacePath && tab.filePath.startsWith(this.workspaceStore.currentWorkspacePath)) {
        await this.fileSystemStore.refreshFileTree();
      }
    } catch (error: any) {
      this.notificationStore.error('保存失败', error.message || '无法写入当前文件');
    }
  }

  async saveActiveTabAs() {
    const tab = this.tabsStore.activeTab;
    if (!tab) return;

    if (isBinaryPreviewPath(tab.filePath) && isBinaryPreviewContent(tab.content)) {
      this.notificationStore.warning('当前文件为二进制预览', '如需编辑，请先导出为文本再保存');
      return;
    }

    if (isLargeFilePreviewContent(tab.content)) {
      this.notificationStore.warning('当前文件为大文件预览', '该标签仅加载了部分内容，暂不支持另存为');
      return;
    }

    if (tab.isLoadingContent) {
      this.notificationStore.warning('文件仍在加载', '请等待大文件分段加载完成后再另存为');
      return;
    }

    try {
      const targetPath = await save({
        title: '另存为',
        defaultPath: tab.fileName,
      });

      if (!targetPath) return;

      if (tab.isLargeFile) {
        await this.writeLargeFileInChunks(
          targetPath,
          tab.content,
          tab.largeFileChunkSize ?? LARGE_FILE_SAVE_CHUNK_BYTES,
        );
      } else {
        await this.fileSystemStore.writeFileContent(targetPath, tab.content);
      }
      let lastKnownModified: number | null = null;
      try {
        const fileInfo = await fileCommands.getFileInfo(targetPath);
        lastKnownModified = normalizeModifiedTimestamp(fileInfo.modified);
      } catch {
        lastKnownModified = null;
      }
      this.tabsStore.updateTab(tab.id, {
        filePath: targetPath,
        fileName: getBaseName(targetPath),
        language: detectLanguage(targetPath),
        isDirty: false,
        isUntitled: false,
        isLargeFile: tab.isLargeFile,
        isLoadingContent: false,
        largeFileSize: tab.largeFileSize,
        largeFileChunkSize: tab.largeFileChunkSize,
        lastKnownModified,
        externalModifiedAt: null,
      });
      this.editorStore.setLanguage(detectLanguage(targetPath));
      this.editorStore.markAsSaved();
      this.workspaceStore.openSingleFile(targetPath);

      if (this.workspaceStore.currentWorkspacePath && targetPath.startsWith(this.workspaceStore.currentWorkspacePath)) {
        await this.fileSystemStore.refreshFileTree();
      }

      this.notificationStore.success('另存为成功', getBaseName(targetPath));
    } catch (error: any) {
      this.notificationStore.error('另存为失败', error.message || '无法创建新文件');
    }
  }

  async renameTab(tabId: string, nextName: string) {
    const tab = this.tabsStore.tabs.find((item) => item.id === tabId);
    if (!tab) return;

    const trimmedName = nextName.trim();
    if (!trimmedName) return;

    if (!tab.filePath || tab.isUntitled) {
      this.tabsStore.updateTab(tabId, {
        fileName: trimmedName,
        language: detectLanguage(trimmedName),
      });
      if (tabId === this.tabsStore.activeTabId) {
        this.editorStore.setLanguage(detectLanguage(trimmedName));
      }
      return;
    }

    const nextPath = `${getDirName(tab.filePath)}/${trimmedName}`;
    if (nextPath === tab.filePath) return;

    try {
      await this.fileSystemStore.renameFileOrFolder(tab.filePath, nextPath);
      this.tabsStore.updateTab(tabId, {
        filePath: nextPath,
        fileName: trimmedName,
        language: detectLanguage(trimmedName),
      });

      if (this.workspaceStore.currentWorkspacePath && nextPath.startsWith(this.workspaceStore.currentWorkspacePath)) {
        await this.fileSystemStore.refreshFileTree();
      }

      this.notificationStore.success('重命名成功', trimmedName);
    } catch (error: any) {
      this.notificationStore.error('重命名失败', error.message || '无法更新文件名');
    }
  }

  updateActiveTabContent(content: string, options?: { markDirty?: boolean }) {
    const tab = this.tabsStore.activeTab;
    if (!tab) return;

    const markDirty = options?.markDirty ?? true;
    const nextDirty = markDirty ? true : tab.isDirty;

    if (tab.content === content && this.editorStore.content === content && tab.isDirty === nextDirty) {
      return;
    }

    this.tabsStore.updateTab(tab.id, {
      content,
      isDirty: nextDirty,
    });
    if (content.length <= EDITOR_STORE_CONTENT_SYNC_MAX_CHARS) {
      this.editorStore.setContent(content, markDirty);
    } else {
      this.editorStore.setDirty(nextDirty);
    }
  }

  updateActiveTabLanguage(languageId: string) {
    this.editorStore.setLanguage(languageId);
    if (this.tabsStore.activeTab) {
      this.tabsStore.updateTab(this.tabsStore.activeTab.id, { language: languageId });
    }
  }

  syncTabToEditor(tab: Tab | null) {
    const nextContent = tab?.content ?? '';
    const shouldSyncFullContent = nextContent.length <= EDITOR_STORE_CONTENT_SYNC_MAX_CHARS;
    this.editorStore.setContent(shouldSyncFullContent ? nextContent : '', false);
    this.editorStore.setLanguage(tab?.language ?? 'plaintext');
    this.editorStore.setDirty(tab?.isDirty ?? false);
    this.editorStore.setReadOnly(Boolean(tab?.isLoadingContent));
  }
}

export function createTabService(
  tabsStore: TabsStore,
  fileSystemStore: FileSystemStore,
  editorStore: EditorStore,
  workspaceStore: WorkspaceStore,
  notificationStore: NotificationStore,
) {
  return new TabService(
    tabsStore,
    fileSystemStore,
    editorStore,
    workspaceStore,
    notificationStore,
  );
}
