import { isTauriApp, workspaceCommands } from '@/lib/tauri';
import { normalizeWorkspacePath } from '@/services/workspaceWatcherService';

export interface WorkspaceFileLocation {
  workspaceId: string;
  rootPath: string;
  relativePath: string;
}

export function getParentDirectory(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const trimmed = normalized.replace(/\/+$/, '');
  const lastSlash = trimmed.lastIndexOf('/');
  if (lastSlash <= 0) {
    return lastSlash === 0 ? '/' : '';
  }
  return trimmed.slice(0, lastSlash);
}

export function getFileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function isPathInsideRoot(filePath: string, rootPath: string): boolean {
  const file = normalizeWorkspacePath(filePath);
  const root = normalizeWorkspacePath(rootPath).replace(/\/+$/, '');
  if (!root || file === root) {
    return false;
  }
  return file.startsWith(`${root}/`);
}

export function toRelativeWorkspacePath(filePath: string, rootPath: string): string {
  const file = normalizeWorkspacePath(filePath);
  const root = normalizeWorkspacePath(rootPath).replace(/\/+$/, '');
  if (file === root) {
    return '';
  }
  if (!file.startsWith(`${root}/`)) {
    return getFileName(filePath);
  }
  return file.slice(root.length + 1);
}

/**
 * 为文件解析可用的工作区运行期 ID 与相对路径。
 * 优先复用已注册的工作区根目录，文件不在任何工作区内时以所在目录作为根。
 */
export class WorkspaceRuntimeService {
  private readonly workspaceIds = new Map<string, Promise<string>>();

  async resolveRoot(rootPath: string): Promise<string> {
    const key = normalizeWorkspacePath(rootPath);
    const cached = this.workspaceIds.get(key);
    if (cached) {
      return cached;
    }

    const pending = workspaceCommands
      .resolveWorkspace(rootPath)
      .then((resolved) => resolved.workspaceId)
      .catch((error) => {
        this.workspaceIds.delete(key);
        throw error;
      });

    this.workspaceIds.set(key, pending);
    return pending;
  }

  async resolveForFile(
    filePath: string,
    preferredRoot?: string | null,
  ): Promise<WorkspaceFileLocation> {
    const rootPath =
      preferredRoot && isPathInsideRoot(filePath, preferredRoot)
        ? preferredRoot
        : getParentDirectory(filePath);
    if (!rootPath) {
      throw new Error('无法确定文件所在目录');
    }

    const workspaceId = await this.resolveRoot(rootPath);
    return {
      workspaceId,
      rootPath,
      relativePath: toRelativeWorkspacePath(filePath, rootPath),
    };
  }

  clear(): void {
    this.workspaceIds.clear();
  }
}

export function createWorkspaceRuntimeService(): WorkspaceRuntimeService {
  return new WorkspaceRuntimeService();
}

/**
 * 读取文件当前磁盘 revision（mtimeNs:size）。
 * 读取失败、文件不存在或非 Tauri 环境时返回 null，由调用方决定是否放行写入。
 * 该函数不抛错，避免 revision 探测打断正常打开/重载流程。
 */
export async function readFileRevision(
  runtime: WorkspaceRuntimeService,
  filePath: string,
  preferredRoot?: string | null,
): Promise<string | null> {
  if (!isTauriApp()) {
    return null;
  }

  try {
    const location = await runtime.resolveForFile(filePath, preferredRoot);
    const revision = await workspaceCommands.getFileRevision(
      location.workspaceId,
      location.relativePath,
    );
    return revision.exists ? revision.revision : null;
  } catch (error) {
    console.warn('[WorkspaceRuntime] 读取文件 revision 失败:', error);
    return null;
  }
}
