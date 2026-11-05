import { defineStore } from 'pinia';

export type AppMode = 'empty' | 'single-file' | 'workspace';

/** 工作区来源：user=用户自己打开，silent=为云文档静默打开，scratch=云文档临时工作区 */
export type WorkspaceOrigin = 'user' | 'silent' | 'scratch';

/** 云文档工作区绑定：workspaceName → 上次落在本机的目录 */
export interface CloudWorkspaceBinding {
  path: string;
  lastUsedAt: number;
  origin: WorkspaceOrigin;
}

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
  workspaceOrigin: WorkspaceOrigin;
  cloudWorkspaceBindings: Record<string, CloudWorkspaceBinding>;
  recentProjects: RecentProject[];
  recentFiles: RecentFile[];
  initialized: boolean;
}

const STORAGE_KEY = 'text-editor-workspace';
/** 绑定单独存：便于单独清理/迁移，也不让主状态膨胀 */
const BINDINGS_STORAGE_KEY = 'text-editor-cloud-workspace-bindings';
const MAX_RECENTS = 10;
const MAX_BINDINGS = 100;

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
    workspaceOrigin: 'user',
    cloudWorkspaceBindings: {},
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
        this.workspaceOrigin = parsed.workspaceOrigin ?? 'user';
        // 工作区上下文只对 workspace 模式有效，避免旧会话残留到单文件模式。
        if (this.mode !== 'workspace' || !this.currentWorkspacePath) {
          this.currentWorkspacePath = null;
          this.currentWorkspaceName = null;
        }
        this.recentProjects = parsed.recentProjects ?? [];
        this.recentFiles = parsed.recentFiles ?? [];
        this.loadBindings();
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
            workspaceOrigin: this.workspaceOrigin,
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
        this.workspaceOrigin = 'user';
      }
      this.saveToStorage();
    },

    setEmptyMode() {
      this.mode = 'empty';
      this.currentWorkspacePath = null;
      this.currentWorkspaceName = null;
      this.workspaceOrigin = 'user';
      this.saveToStorage();
    },

    /**
     * 清掉临时工作区上下文（目录已被系统清理时用）。
     *
     * 只回 empty 模式，不重建目录——里面本来就没有文件，重建只会让界面假装一切正常。
     * 非 scratch 来源一律不动：用户自己的目录可能只是暂时不可用（网络盘掉线），
     * 静默清掉反而会让人丢掉真正想恢复的上下文。
     *
     * @returns 是否真的清了
     */
    clearScratchWorkspaceContext(): boolean {
      if (this.workspaceOrigin !== 'scratch' || !this.currentWorkspacePath) {
        return false;
      }
      this.setEmptyMode();
      return true;
    },

    /**
     * 打开工作区。
     *
     * @param origin user=用户主动打开；silent=为云文档静默打开；scratch=云文档临时工作区
     */
    openWorkspace(path: string, origin: WorkspaceOrigin = 'user') {
      this.mode = 'workspace';
      this.currentWorkspacePath = path;
      this.currentWorkspaceName = getBaseName(path);
      this.workspaceOrigin = origin;
      // 临时工作区不进"最近项目"：那是给用户自己开过的目录用的，别污染
      if (origin !== 'scratch') {
        this.registerRecentProject(path);
      }
      this.saveToStorage();
    },

    /** 记住某个 workspaceName 这次落在本机哪个目录，供下次静默打开 */
    rememberCloudWorkspace(workspaceName: string, path: string, origin: WorkspaceOrigin) {
      const name = workspaceName.trim();
      if (!name || !path) {
        return;
      }
      const next: Record<string, CloudWorkspaceBinding> = {
        ...this.cloudWorkspaceBindings,
        [name]: { path, lastUsedAt: Date.now(), origin },
      };
      const entries = Object.entries(next);
      this.cloudWorkspaceBindings = entries.length > MAX_BINDINGS
        ? Object.fromEntries(entries.sort((a, b) => b[1].lastUsedAt - a[1].lastUsedAt).slice(0, MAX_BINDINGS))
        : next;
      this.saveBindings();
    },

    loadBindings() {
      try {
        const saved = localStorage.getItem(BINDINGS_STORAGE_KEY);
        if (!saved) {
          return;
        }
        const parsed = JSON.parse(saved) as Record<string, CloudWorkspaceBinding>;
        this.cloudWorkspaceBindings = parsed && typeof parsed === 'object' ? parsed : {};
      } catch (error) {
        console.error('[Workspace] 加载云文档工作区绑定失败:', error);
      }
    },

    saveBindings() {
      try {
        localStorage.setItem(BINDINGS_STORAGE_KEY, JSON.stringify(this.cloudWorkspaceBindings));
      } catch (error) {
        console.error('[Workspace] 保存云文档工作区绑定失败:', error);
      }
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
        this.workspaceOrigin = 'user';
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
