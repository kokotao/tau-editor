import { invoke } from '@tauri-apps/api/core';

export type FileEntryType = 'file' | 'folder';

export interface FileEntry {
  name: string;
  path: string;
  type: FileEntryType;
  size?: number;
  modified?: string | number | null;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  created?: string | number | null;
  modified?: string | number | null;
  accessed?: string | number | null;
  is_dir?: boolean;
}

export interface FileChunk {
  content: string;
  offset: number;
  size: number;
  totalSize: number;
  isLast: boolean;
}

export interface LargeFileConfig {
  maxLinesForHighlighting: number;
  maxFileSizeMb: number;
  chunkSizeKb: number;
}

export interface AppVersionInfo {
  version: string;
  os: string;
  arch: string;
  buildTarget: string;
  homepageUrl: string;
}

export interface DeviceInfo {
  os: string;
  arch: string;
}

export interface FileAssociationState {
  ext: string;
  name: string;
  category: string;
  registered: boolean;
  executable: boolean;
}

export interface FileAssociationsResponse {
  supported: boolean;
  platform: string;
  items: FileAssociationState[];
}

export interface ReleaseAssetInfo {
  name: string;
  browserDownloadUrl: string;
  size: number;
  contentType?: string | null;
}

export interface GithubUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseName: string;
  releaseNotes: string;
  releaseUrl: string;
  publishedAt?: string | null;
  selectedAsset?: ReleaseAssetInfo | null;
  device: DeviceInfo;
  repositoryUrl: string;
}

export interface DownloadInstallResult {
  downloadedPath: string;
  launched: boolean;
  message: string;
}

const WEB_UNSUPPORTED =
  '当前是 Web 构建，文件系统命令仅在 Tauri 桌面端可用。';

function isTauriAvailable(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function isTauriApp(): boolean {
  return isTauriAvailable();
}

async function invokeCommand<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!isTauriAvailable()) {
    throw new TauriError(WEB_UNSUPPORTED, command);
  }

  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw TauriError.fromError(error, command);
  }
}

export class TauriError extends Error {
  command?: string;
  cause?: unknown;
  code?: string;

  constructor(message: string, command?: string, cause?: unknown, code?: string) {
    super(message);
    this.name = 'TauriError';
    this.command = command;
    this.cause = cause;
    this.code = code;
  }

  static fromError(error: unknown, command?: string): TauriError {
    if (error instanceof TauriError) {
      return error;
    }

    if (error instanceof Error) {
      return new TauriError(error.message, command, error);
    }

    if (typeof error === 'object' && error !== null) {
      const candidate = error as { code?: unknown; message?: unknown };
      const message = typeof candidate.message === 'string'
        ? candidate.message
        : String(error);
      const code = typeof candidate.code === 'string' ? candidate.code : undefined;
      return new TauriError(message, command, error, code);
    }

    return new TauriError(String(error), command, error);
  }
}

export interface ResolvedWorkspace {
  workspaceId: string;
  rootPath: string;
}

export interface FileRevision {
  exists: boolean;
  size: number | null;
  modifiedMs: number | null;
  revision: string | null;
  contentHash: string | null;
}

export interface WriteFileResponse {
  revision: string;
}

export interface GitStatusEntry {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
}

export interface GitStatusResponse {
  branch: string;
  entries: GitStatusEntry[];
}

export interface WorkspaceSearchOptions {
  isRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  maxResults: number;
}

export interface WorkspaceSearchMatch {
  path: string;
  line: number;
  column: number;
  length: number;
  preview: string;
}

export interface WorkspaceSearchResponse {
  matches: WorkspaceSearchMatch[];
  truncated: boolean;
  scannedFiles: number;
  /** 搜索被用户取消时为 true，此时 matches 只包含已扫描到的部分结果。 */
  cancelled: boolean;
}

export interface WorkspaceSearchCancelResponse {
  cancelled: boolean;
}

export interface WorkspaceReplacePreviewMatch {
  matchId: string;
  line: number;
  column: number;
  length: number;
  before: string;
  after: string;
}

export interface WorkspaceReplacePreviewFile {
  relativePath: string;
  revision: string;
  matches: WorkspaceReplacePreviewMatch[];
  truncated: boolean;
}

export interface WorkspaceReplacePreviewResponse {
  previewId: string;
  files: WorkspaceReplacePreviewFile[];
  totalMatches: number;
  scannedFiles: number;
  truncated: boolean;
}

export type WorkspaceReplaceStatus = 'applied' | 'skipped' | 'conflict' | 'failed';

export interface WorkspaceReplaceFileResult {
  relativePath: string;
  status: WorkspaceReplaceStatus;
  appliedMatchIds: string[];
  undoable: boolean;
  message?: string | null;
}

export interface WorkspaceReplaceApplyResponse {
  previewId: string;
  undoId?: string | null;
  results: WorkspaceReplaceFileResult[];
  applied: number;
  skipped: number;
  conflicts: number;
  failed: number;
}

export interface WorkspaceReplaceUndoResponse {
  undoId: string;
  restored: string[];
  conflicts: string[];
  failed: WorkspaceReplaceFileResult[];
}

export interface MarkdownAssetImportResponse {
  relativePath: string;
  markdownSnippet: string;
  bytes: number;
  reusedExisting: boolean;
}

export type MarkdownLinkState =
  | 'ok'
  | 'missing'
  | 'outside'
  | 'external'
  | 'anchor'
  | 'unsupported'
  | 'invalid';

export interface MarkdownLinkStatus {
  target: string;
  status: MarkdownLinkState;
  resolvedRelativePath?: string | null;
  message?: string | null;
}

export interface WorkspaceTaskItem {
  line: number;
  label: string;
  completed: boolean;
}

export interface WorkspaceTaskFile {
  relativePath: string;
  tasks: WorkspaceTaskItem[];
}

export interface WorkspaceTaskResponse {
  files: WorkspaceTaskFile[];
  totalTasks: number;
  scannedFiles: number;
  truncated: boolean;
}

export interface RecoveryOpenTab {
  path: string | null;
  viewState?: unknown;
  pinned: boolean;
}

export interface RecoverySessionDocument {
  version: 2;
  savedAt: number;
  workspacePath: string | null;
  activeTabPath: string | null;
  openTabs: RecoveryOpenTab[];
  layout: unknown;
  recentWorkspaces: string[];
  tabs: unknown[];
}

export interface RecoveryBaseFingerprint {
  mtimeMs: number | null;
  size: number | null;
}

export interface RecoveryCursor {
  line: number;
  column: number;
}

export interface RecoveryDraftRecord {
  version: 2;
  id: string;
  path: string | null;
  baseFingerprint: RecoveryBaseFingerprint | null;
  content: string;
  updatedAt: number;
  cursor: RecoveryCursor | null;
  scrollTop: number | null;
  tab?: unknown;
}

export interface RecoveryLimits {
  maxDrafts: number;
  maxTotalBytes: number;
  maxAgeDays: number;
}

export interface RecoveryRecordsResponse {
  session: RecoverySessionDocument | null;
  drafts: RecoveryDraftRecord[];
  limits: RecoveryLimits;
}

export interface RecoveryWriteResponse {
  writtenDrafts: number;
  deletedDrafts: number;
}

export interface RecoveryDeleteResponse {
  deleted: number;
}

export type WorkspaceChangeKind = 'created' | 'modified' | 'removed' | 'renamed';

export interface WorkspaceFileChange {
  path: string;
  oldPath: string | null;
  kind: WorkspaceChangeKind;
  modifiedMs: number | null;
  size: number | null;
}

export interface WorkspaceWatchStatus {
  watching: boolean;
  rootPath: string | null;
  debounceMs: number;
}

export const WORKSPACE_FILE_CHANGED_EVENT = 'workspace:file-changed';

/**
 * 订阅后端工作区文件变更事件，返回解绑函数。延迟加载 Tauri 事件模块，Web 环境不会引入。
 */
export async function listenWorkspaceFileChanges(
  handler: (payload: unknown) => void,
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<unknown>(WORKSPACE_FILE_CHANGED_EVENT, (event) => handler(event.payload));
}
/**
 * v0.3.0 工作区运行时桥接。后续文件/Git 命令只能接受此处返回的 workspaceId。
 */
export const workspaceCommands = {
  async resolveWorkspace(path: string): Promise<ResolvedWorkspace> {
    return invokeCommand<ResolvedWorkspace>('resolve_workspace', { path });
  },

  async getFileRevision(
    workspaceId: string,
    relativePath: string,
    includeHash = false,
  ): Promise<FileRevision> {
    return invokeCommand<FileRevision>('get_file_revision', {
      workspaceId,
      relativePath,
      includeHash,
    });
  },

  async writeFileIfRevision(
    workspaceId: string,
    relativePath: string,
    content: string,
    expectedRevision: string,
  ): Promise<WriteFileResponse> {
    return invokeCommand<WriteFileResponse>('write_file_if_revision', {
      workspaceId,
      relativePath,
      content,
      expectedRevision,
    });
  },
};

export const gitCommands = {
  async status(workspaceId: string): Promise<GitStatusResponse> {
    return invokeCommand<GitStatusResponse>('git_status', { workspaceId });
  },

  async diff(workspaceId: string, relativePath: string, staged = false): Promise<string> {
    return invokeCommand<string>('git_diff', { workspaceId, relativePath, staged });
  },

  async stage(workspaceId: string, relativePaths: string[]): Promise<void> {
    await invokeCommand<void>('git_stage', { workspaceId, relativePaths });
  },

  async unstage(workspaceId: string, relativePaths: string[]): Promise<void> {
    await invokeCommand<void>('git_unstage', { workspaceId, relativePaths });
  },

  async discard(workspaceId: string, relativePaths: string[]): Promise<void> {
    await invokeCommand<void>('git_discard', { workspaceId, relativePaths });
  },
};

export const recoveryCommands = {
  async list(): Promise<RecoveryRecordsResponse> {
    return invokeCommand<RecoveryRecordsResponse>('list_recovery_records');
  },

  async write(
    session: RecoverySessionDocument | null,
    drafts: RecoveryDraftRecord[] | null,
  ): Promise<RecoveryWriteResponse> {
    return invokeCommand<RecoveryWriteResponse>('write_recovery_record', {
      session,
      drafts,
    });
  },

  async remove(options: {
    id?: string;
    path?: string;
    all?: boolean;
    session?: boolean;
  }): Promise<RecoveryDeleteResponse> {
    return invokeCommand<RecoveryDeleteResponse>('delete_recovery_record', options);
  },
};

export const watcherCommands = {
  async start(path: string, debounceMs?: number): Promise<WorkspaceWatchStatus> {
    return invokeCommand<WorkspaceWatchStatus>('start_workspace_watch', {
      path,
      debounceMs,
    });
  },

  async stop(): Promise<WorkspaceWatchStatus> {
    return invokeCommand<WorkspaceWatchStatus>('stop_workspace_watch');
  },

  async status(): Promise<WorkspaceWatchStatus> {
    return invokeCommand<WorkspaceWatchStatus>('workspace_watch_status');
  },
};

export interface FileWriteTransactionHandle {
  transactionId: string;
  expectedRevision: string;
  maxChunkBytes: number;
  maxTotalBytes: number;
}

export interface FileWriteTransactionProgress {
  transactionId: string;
  bytesWritten: number;
}

export interface FileWriteTransactionCommit {
  revision: string;
  size: number;
  modifiedMs: number;
}

export interface FileWriteTransactionAbort {
  aborted: boolean;
}

/**
 * 大文件分段写入事务：先写临时文件，提交前再校验 revision，避免覆盖外部修改。
 */
export const fileTransactionCommands = {
  async begin(
    workspaceId: string,
    relativePath: string,
    expectedRevision: string,
  ): Promise<FileWriteTransactionHandle> {
    return invokeCommand<FileWriteTransactionHandle>('begin_file_write_transaction', {
      workspaceId,
      relativePath,
      expectedRevision,
    });
  },

  async append(transactionId: string, content: string): Promise<FileWriteTransactionProgress> {
    return invokeCommand<FileWriteTransactionProgress>('append_file_write_transaction_chunk', {
      transactionId,
      content,
    });
  },

  async commit(transactionId: string): Promise<FileWriteTransactionCommit> {
    return invokeCommand<FileWriteTransactionCommit>('commit_file_write_transaction', {
      transactionId,
    });
  },

  async abort(transactionId: string): Promise<FileWriteTransactionAbort> {
    return invokeCommand<FileWriteTransactionAbort>('abort_file_write_transaction', {
      transactionId,
    });
  },
};

export const searchCommands = {
  async workspace(
    workspaceId: string,
    searchId: string,
    query: string,
    options: WorkspaceSearchOptions,
  ): Promise<WorkspaceSearchResponse> {
    return invokeCommand<WorkspaceSearchResponse>('search_workspace', {
      workspaceId,
      searchId,
      query,
      options,
    });
  },

  async cancel(searchId: string): Promise<WorkspaceSearchCancelResponse> {
    return invokeCommand<WorkspaceSearchCancelResponse>('cancel_search', { searchId });
  },
};

export const replaceCommands = {
  async preview(
    workspaceId: string,
    query: string,
    replacement: string,
    options: WorkspaceSearchOptions,
  ): Promise<WorkspaceReplacePreviewResponse> {
    return invokeCommand<WorkspaceReplacePreviewResponse>('preview_workspace_replace', {
      workspaceId,
      query,
      replacement,
      options,
    });
  },

  async apply(
    workspaceId: string,
    previewId: string,
    matchIds: string[],
  ): Promise<WorkspaceReplaceApplyResponse> {
    return invokeCommand<WorkspaceReplaceApplyResponse>('apply_workspace_replace_preview', {
      workspaceId,
      previewId,
      matchIds,
    });
  },

  async undo(workspaceId: string, undoId: string): Promise<WorkspaceReplaceUndoResponse> {
    return invokeCommand<WorkspaceReplaceUndoResponse>('undo_workspace_replace', {
      workspaceId,
      undoId,
    });
  },
};

export const markdownCommands = {
  async importAsset(
    workspaceId: string,
    documentRelativePath: string,
    sourcePath: string,
  ): Promise<MarkdownAssetImportResponse> {
    return invokeCommand<MarkdownAssetImportResponse>('import_markdown_asset', {
      workspaceId,
      documentRelativePath,
      sourcePath,
    });
  },

  async checkLinks(
    workspaceId: string,
    documentRelativePath: string,
    targets: string[],
  ): Promise<MarkdownLinkStatus[]> {
    return invokeCommand<MarkdownLinkStatus[]>('check_markdown_links', {
      workspaceId,
      documentRelativePath,
      targets,
    });
  },

  async workspaceTasks(workspaceId: string): Promise<WorkspaceTaskResponse> {
    return invokeCommand<WorkspaceTaskResponse>('collect_workspace_tasks', { workspaceId });
  },
};

export const fileCommands = {
  async readFile(path: string): Promise<string> {
    return invokeCommand<string>('read_file', { path });
  },

  async writeFile(path: string, content: string): Promise<void> {
    await invokeCommand<void>('write_file', { path, content });
  },

  async listFiles(dir: string): Promise<FileEntry[]> {
    const entries = await invokeCommand<Array<Omit<FileEntry, 'type'> & { type?: FileEntryType; file_type?: FileEntryType }>>(
      'list_files',
      { dir },
    );

    return entries.map((entry) => ({
      ...entry,
      type: entry.type ?? entry.file_type ?? 'file',
    }));
  },

  async createFile(path: string): Promise<void> {
    await invokeCommand<void>('create_file', { path });
  },

  async createFolder(path: string): Promise<void> {
    await invokeCommand<void>('create_folder', { path });
  },

  async deleteFile(path: string): Promise<void> {
    await invokeCommand<void>('delete_file', { path });
  },

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    await invokeCommand<void>('rename_file', {
      oldPath,
      old_path: oldPath,
      newPath,
      new_path: newPath,
    });
  },

  async getFileInfo(path: string): Promise<FileInfo> {
    return invokeCommand<FileInfo>('get_file_info', { path });
  },

  async readFileChunked(path: string, offset: number, chunkSize: number): Promise<FileChunk> {
    const raw = await invokeCommand<{
      content: string;
      offset: number;
      size: number;
      total_size?: number;
      totalSize?: number;
      is_last?: boolean;
      isLast?: boolean;
    }>('read_file_chunked', {
      path,
      offset,
      chunkSize,
      chunk_size: chunkSize,
    });

    return {
      content: raw.content,
      offset: raw.offset,
      size: raw.size,
      totalSize: raw.totalSize ?? raw.total_size ?? raw.size,
      isLast: raw.isLast ?? raw.is_last ?? true,
    };
  },

  async getLargeFileConfig(): Promise<LargeFileConfig> {
    const raw = await invokeCommand<{
      max_lines_for_highlighting?: number;
      maxLinesForHighlighting?: number;
      max_file_size_mb?: number;
      maxFileSizeMb?: number;
      chunk_size_kb?: number;
      chunkSizeKb?: number;
    }>('get_large_file_config');

    return {
      maxLinesForHighlighting: raw.maxLinesForHighlighting ?? raw.max_lines_for_highlighting ?? 10000,
      maxFileSizeMb: raw.maxFileSizeMb ?? raw.max_file_size_mb ?? 50,
      chunkSizeKb: raw.chunkSizeKb ?? raw.chunk_size_kb ?? 1024,
    };
  },

  async writeFileChunked(path: string, content: string, append: boolean): Promise<void> {
    await invokeCommand<void>('write_file_chunked', {
      path,
      content,
      append,
    });
  },
};

export const settingsCommands = {
  async getAutoSaveInterval(): Promise<number> {
    if (!isTauriAvailable()) {
      return 0;
    }

    return invokeCommand<number>('get_auto_save_interval');
  },

  async setAutoSaveInterval(interval: number): Promise<void> {
    if (!isTauriAvailable()) {
      return;
    }

    await invokeCommand<void>('auto_save_config', { interval });
  },

  async getAppVersionInfo(): Promise<AppVersionInfo> {
    if (!isTauriAvailable()) {
      const fallbackDevice = getBrowserDeviceInfo();
      return {
        version: 'web',
        os: fallbackDevice.os,
        arch: fallbackDevice.arch,
        buildTarget: `web-${fallbackDevice.os}`,
        homepageUrl: PROJECT_HOMEPAGE_URL,
      };
    }

    return invokeCommand<AppVersionInfo>('get_app_version_info');
  },

  async checkGithubUpdate(repoUrl?: string): Promise<GithubUpdateInfo> {
    if (!isTauriAvailable()) {
      const fallbackVersion = await settingsCommands.getAppVersionInfo();
      return {
        currentVersion: fallbackVersion.version,
        latestVersion: fallbackVersion.version,
        hasUpdate: false,
        releaseName: '',
        releaseNotes: '',
        releaseUrl: repoUrl ?? PROJECT_HOMEPAGE_URL,
        publishedAt: null,
        selectedAsset: null,
        device: {
          os: fallbackVersion.os,
          arch: fallbackVersion.arch,
        },
        repositoryUrl: repoUrl ?? PROJECT_HOMEPAGE_URL,
      };
    }

    return invokeCommand<GithubUpdateInfo>('check_github_update', {
      repoUrl,
      repo_url: repoUrl,
    });
  },

  async downloadAndInstallUpdate(downloadUrl: string, fileName: string): Promise<DownloadInstallResult> {
    if (!isTauriAvailable()) {
      if (typeof window !== 'undefined') {
        window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      }
      return {
        downloadedPath: '',
        launched: true,
        message: 'Web 模式下已在新窗口打开下载链接。',
      };
    }

    return invokeCommand<DownloadInstallResult>('download_and_install_update', {
      downloadUrl,
      download_url: downloadUrl,
      fileName,
      file_name: fileName,
    });
  },

  async getFileAssociations(): Promise<FileAssociationsResponse> {
    if (!isTauriAvailable()) {
      const fallbackDevice = getBrowserDeviceInfo();
      return {
        supported: false,
        platform: fallbackDevice.os,
        items: [],
      };
    }

    return invokeCommand<FileAssociationsResponse>('get_file_associations');
  },

  async setFileAssociation(ext: string, enabled: boolean): Promise<void> {
    if (!isTauriAvailable()) {
      throw new TauriError(WEB_UNSUPPORTED, 'set_file_association');
    }

    await invokeCommand<void>('set_file_association', { ext, enabled });
  },
};

const PROJECT_HOMEPAGE_URL = 'https://github.com/kokotao/tau-editor';

function getBrowserDeviceInfo(): DeviceInfo {
  if (typeof navigator === 'undefined') {
    return { os: 'web', arch: 'unknown' };
  }

  const lowerUA = navigator.userAgent.toLowerCase();
  const lowerPlatform = navigator.platform.toLowerCase();

  const os = lowerUA.includes('windows')
    ? 'windows'
    : lowerUA.includes('mac')
      ? 'macos'
      : lowerUA.includes('linux')
        ? 'linux'
        : 'web';

  const arch = lowerUA.includes('arm64') || lowerUA.includes('aarch64')
    ? 'aarch64'
    : lowerUA.includes('x86_64') || lowerUA.includes('win64') || lowerPlatform.includes('x86_64')
      ? 'x86_64'
      : 'unknown';

  return { os, arch };
}

export const appCommands = {
  async consumePendingOpenPaths(): Promise<string[]> {
    if (!isTauriAvailable()) {
      return [];
    }

    return invokeCommand<string[]>('consume_pending_open_paths');
  },

  async openProjectHomepage(): Promise<void> {
    if (!isTauriAvailable()) {
      if (typeof window !== 'undefined') {
        window.open(PROJECT_HOMEPAGE_URL, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    try {
      await invokeCommand<void>('open_project_homepage');
    } catch (error) {
      if (typeof window !== 'undefined') {
        window.open(PROJECT_HOMEPAGE_URL, '_blank', 'noopener,noreferrer');
        return;
      }
      throw TauriError.fromError(error, 'open_project_homepage');
    }
  },

  async openExternalLink(url: string): Promise<void> {
    if (!isTauriAvailable()) {
      if (typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    await invokeCommand<void>('open_external_link', {
      url,
    });
  },

  async revealInFileManager(path: string): Promise<void> {
    if (!path.trim()) {
      return;
    }

    if (!isTauriAvailable()) {
      throw new TauriError('仅桌面端支持打开文件所在位置', 'reveal_in_file_manager');
    }

    await invokeCommand<void>('reveal_in_file_manager', {
      path,
    });
  },
};
