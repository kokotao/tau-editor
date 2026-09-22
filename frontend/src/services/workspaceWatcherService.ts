import {
  isTauriApp,
  listenWorkspaceFileChanges,
  watcherCommands,
  WORKSPACE_FILE_CHANGED_EVENT,
  type WorkspaceChangeKind,
  type WorkspaceFileChange,
} from '@/lib/tauri';
export { WORKSPACE_FILE_CHANGED_EVENT };
export const DEFAULT_WATCH_DEBOUNCE_MS = 250;

const CHANGE_KINDS: WorkspaceChangeKind[] = ['created', 'modified', 'removed', 'renamed'];

/**
 * 统一路径比较键：Windows 盘符大小写不敏感，分隔符统一为正斜杠。
 */
export function normalizeWorkspacePath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return /^[a-zA-Z]:\//.test(normalized) ? normalized.toLowerCase() : normalized;
}

export function normalizeWorkspaceFileChange(value: unknown): WorkspaceFileChange | null {
  if (typeof value !== 'object' || value === null) return null;

  const record = value as Record<string, unknown>;
  const path = typeof record.path === 'string' && record.path.length > 0 ? record.path : null;
  const kind = typeof record.kind === 'string' && (CHANGE_KINDS as string[]).includes(record.kind)
    ? (record.kind as WorkspaceChangeKind)
    : null;
  if (!path || !kind) return null;

  return {
    path,
    oldPath: typeof record.oldPath === 'string' ? record.oldPath : null,
    kind,
    modifiedMs: typeof record.modifiedMs === 'number' ? record.modifiedMs : null,
    size: typeof record.size === 'number' ? record.size : null,
  };
}

export function normalizeWorkspaceFileChanges(payload: unknown): WorkspaceFileChange[] {
  const list = Array.isArray(payload) ? payload : payload == null ? [] : [payload];
  return list
    .map(normalizeWorkspaceFileChange)
    .filter((change): change is WorkspaceFileChange => change !== null);
}

export type WorkspaceFileChangeHandler = (changes: WorkspaceFileChange[]) => void;

/**
 * 订阅后端工作区监听事件；启动失败时返回 false，调用方决定是否退化到轮询。
 */
export class WorkspaceWatcherService {
  private unlisten: (() => void) | null = null;
  private handlers = new Set<WorkspaceFileChangeHandler>();
  private rootPath: string | null = null;
  /** 并发保护：启动过程中若发生 stop 或新的 start，旧流程立即作废。 */
  private startToken: symbol | null = null;

  get watching(): boolean {
    return this.rootPath !== null;
  }

  get currentRoot(): string | null {
    return this.rootPath;
  }

  onChange(handler: WorkspaceFileChangeHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async start(rootPath: string | null, debounceMs = DEFAULT_WATCH_DEBOUNCE_MS): Promise<boolean> {
    if (!isTauriApp() || !rootPath) {
      return false;
    }
    if (this.rootPath === rootPath) {
      return true;
    }

    await this.stop();

    const token = Symbol('workspace-watch-start');
    this.startToken = token;

    try {
      const unlisten = await listenWorkspaceFileChanges((payload) => {
        this.dispatch(normalizeWorkspaceFileChanges(payload));
      });
      if (this.startToken !== token) {
        unlisten();
        return false;
      }
      this.unlisten = unlisten;

      const status = await watcherCommands.start(rootPath, debounceMs);
      if (this.startToken !== token || !status.watching) {
        await this.stop();
        return false;
      }

      this.rootPath = status.rootPath ?? rootPath;
      return true;
    } catch (error) {
      console.warn('[Watcher] 启动工作区监听失败:', error);
      await this.stop();
      return false;
    }
  }

  async stop(): Promise<void> {
    this.startToken = null;
    this.unlisten?.();
    this.unlisten = null;

    if (this.rootPath !== null) {
      try {
        await watcherCommands.stop();
      } catch (error) {
        console.warn('[Watcher] 停止工作区监听失败:', error);
      }
    }

    this.rootPath = null;
  }

  private dispatch(changes: WorkspaceFileChange[]) {
    if (changes.length === 0) return;

    for (const handler of [...this.handlers]) {
      try {
        handler(changes);
      } catch (error) {
        console.error('[Watcher] 处理文件变更失败:', error);
      }
    }
  }
}

export function createWorkspaceWatcherService(): WorkspaceWatcherService {
  return new WorkspaceWatcherService();
}
