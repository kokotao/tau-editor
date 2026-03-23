import { open } from '@tauri-apps/plugin-dialog';
import type { useEditorStore } from '@/stores/editor';
import type { useFileSystemStore } from '@/stores/fileSystem';
import type { useNotificationStore } from '@/stores/notification';
import type { useTabsStore } from '@/stores/tabs';
import type { useWorkspaceStore } from '@/stores/workspace';

type FileSystemStore = ReturnType<typeof useFileSystemStore>;
type TabsStore = ReturnType<typeof useTabsStore>;
type WorkspaceStore = ReturnType<typeof useWorkspaceStore>;
type EditorStore = ReturnType<typeof useEditorStore>;
type NotificationStore = ReturnType<typeof useNotificationStore>;

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

export class WorkspaceService {
  constructor(
    private readonly fileSystemStore: FileSystemStore,
    private readonly tabsStore: TabsStore,
    private readonly workspaceStore: WorkspaceStore,
    private readonly editorStore: EditorStore,
    private readonly notificationStore: NotificationStore,
  ) {}

  createUntitledFile() {
    const untitledCount = this.tabsStore.tabs.filter((tab) => tab.isUntitled).length + 1;
    const fileName = untitledCount === 1 ? 'Untitled.txt' : `Untitled-${untitledCount}.txt`;

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
      const content = await this.fileSystemStore.readFileContent(filePath);
      const fileName = getBaseName(filePath);

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
  notificationStore: NotificationStore,
) {
  return new WorkspaceService(
    fileSystemStore,
    tabsStore,
    workspaceStore,
    editorStore,
    notificationStore,
  );
}
