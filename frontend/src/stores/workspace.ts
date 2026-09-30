import { defineStore } from 'pinia';

export type AppMode = 'empty' | 'single-file' | 'workspace';

export interface RecentProject {
  path: string;
  name: string;
  openedAt: number;
}

export interface RecentFile {
  path: string;
  name: string;
  openedAt: number;
}

export interface WorkspaceState {
  mode: AppMode;
  currentWorkspacePath: string | null;
  currentWorkspaceName: string | null;
  recentProjects: RecentProject[];
  recentFiles: RecentFile[];
  initialized: boolean;
}

const STORAGE_KEY = 'text-editor-workspace';
const MAX_RECENTS = 10;

function getBaseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function normalizeWorkspacePath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  if (normalized === '/') {
    return normalized;
  }
  return normalized.replace(/\/+$/, '');
}

function isPathInWorkspace(filePath: string, workspacePath: string): boolean {
  const normalizedFilePath = normalizeWorkspacePath(filePath);
  const normalizedWorkspacePath = normalizeWorkspacePath(workspacePath);
  return normalizedFilePath === normalizedWorkspacePath
    || normalizedFilePath.startsWith(`${normalizedWorkspacePath}/`);
}

export const useWorkspaceStore = defineStore('workspace', {
  state: (): WorkspaceState => ({
    mode: 'empty',
    currentWorkspacePath: null,
    currentWorkspaceName: null,
    recentProjects: [],
    recentFiles: [],
    initialized: false,
  }),

  getters: {
    hasWorkspace: (state) => state.mode === 'workspace' && !!state.currentWorkspacePath,
    hasRecents: (state) => state.recentProjects.length > 0 || state.recentFiles.length > 0,
  },

  actions: {
    loadFromStorage() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) {
          this.initialized = true;
          return;
        }

        const parsed = JSON.parse(saved) as Partial<WorkspaceState>;
        this.mode = parsed.mode ?? 'empty';
        this.currentWorkspacePath = parsed.currentWorkspacePath ?? null;
        this.currentWorkspaceName = parsed.currentWorkspaceName ?? null;
        // 工作区上下文只对 workspace 模式有效，避免旧会话残留到单文件模式。
        if (this.mode !== 'workspace' || !this.currentWorkspacePath) {
          this.currentWorkspacePath = null;
          this.currentWorkspaceName = null;
        }
        this.recentProjects = parsed.recentProjects ?? [];
        this.recentFiles = parsed.recentFiles ?? [];
      } catch (error) {
        console.error('[Workspace] 加载工作区状态失败:', error);
      } finally {
        this.initialized = true;
      }
    },

    saveToStorage() {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            mode: this.mode,
            currentWorkspacePath: this.currentWorkspacePath,
            currentWorkspaceName: this.currentWorkspaceName,
            recentProjects: this.recentProjects,
            recentFiles: this.recentFiles,
          }),
        );
      } catch (error) {
        console.error('[Workspace] 保存工作区状态失败:', error);
      }
    },

    setMode(mode: AppMode, clearWorkspaceContext = false) {
      this.mode = mode;
      if (clearWorkspaceContext && mode !== 'workspace') {
        this.currentWorkspacePath = null;
        this.currentWorkspaceName = null;
      }
      this.saveToStorage();
    },

    setEmptyMode() {
      this.mode = 'empty';
      this.currentWorkspacePath = null;
      this.currentWorkspaceName = null;
      this.saveToStorage();
    },

    openWorkspace(path: string) {
      this.mode = 'workspace';
      this.currentWorkspacePath = path;
      this.currentWorkspaceName = getBaseName(path);
      this.registerRecentProject(path);
      this.saveToStorage();
    },

    openSingleFile(filePath: string) {
      const workspacePath = this.currentWorkspacePath;
      if (workspacePath && isPathInWorkspace(filePath, workspacePath)) {
        // 从当前工作区打开/创建的文件仍属于工作区，资源管理器必须保持可见。
        this.mode = 'workspace';
      } else {
        this.mode = 'single-file';
        this.currentWorkspacePath = null;
        this.currentWorkspaceName = null;
      }
      this.registerRecentFile(filePath);
      this.saveToStorage();
    },

    registerRecentProject(path: string) {
      const project: RecentProject = {
        path,
        name: getBaseName(path),
        openedAt: Date.now(),
      };

      this.recentProjects = [
        project,
        ...this.recentProjects.filter((item) => item.path !== path),
      ].slice(0, MAX_RECENTS);
      this.saveToStorage();
    },

    registerRecentFile(path: string) {
      const file: RecentFile = {
        path,
        name: getBaseName(path),
        openedAt: Date.now(),
      };

      this.recentFiles = [
        file,
        ...this.recentFiles.filter((item) => item.path !== path),
      ].slice(0, MAX_RECENTS);
      this.saveToStorage();
    },
  },
});
