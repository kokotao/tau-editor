import { invoke } from '@tauri-apps/api/core';

export type FileEntryType = 'file' | 'folder';

export interface FileEntry {
  name: string;
  path: string;
  type: FileEntryType;
  size?: number;
  created?: string | number | null;
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

export interface WindowTransferCursor {
  line: number;
  column: number;
}

export interface WindowTransferTab {
  filePath: string | null;
  fileName: string;
  content: string;
  isDirty: boolean;
  isUntitled: boolean;
  language: string | null;
  cursor?: WindowTransferCursor;
}

export interface WindowTransferPayload {
  tabs: WindowTransferTab[];
  activeIndex: number;
  sourceWorkspacePath: string | null;
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
 * LSP 原始 JSON-RPC 消息事件名，与 Rust Supervisor 保持一致。
 */
export const LSP_MESSAGE_EVENT = 'lsp:message';
export const LSP_STATE_EVENT = 'lsp:state';

export interface LspSessionStartOptions {
  sessionId: string;
  workspaceId: string;
  languageId: string;
  rootPath: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface LspRequestPayload {
  sessionId: string;
  method: string;
  params?: unknown;
}

export interface LspNotificationPayload {
  sessionId: string;
  method: string;
  params?: unknown;
}

export interface LspMessageEventPayload {
  sessionId: string;
  direction: 'clientToServer' | 'serverToClient';
  message: unknown;
}

export interface LspSessionStatus {
  sessionId: string;
  workspaceId: string;
  languageId: string;
  rootPath: string;
  command: string;
  state: 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed' | 'failed';
  pid?: number | null;
  pendingRequests: number;
  restartCount: number;
  error?: string | null;
}

export interface LspResponse {
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown } | null;
}

export interface LspServerProbe {
  id: string;
  languageIds: string[];
  command: string;
  installed: boolean;
  available: boolean;
  path?: string | null;
  version?: string | null;
  reason?: string | null;
}

export interface LspProbeResponse {
  servers: LspServerProbe[];
}

export interface LspPlatformInfo {
  platform: string;
  arch: string;
}

/** 应用私有语言服务器的探测结果。后端不存在时前端会自动降级到 PATH 探测。 */
export interface ManagedLspServerProbe {
  id: string;
  state: 'ready' | 'not_ready' | 'preparing' | 'failed';
  installDir?: string | null;
  executablePath?: string | null;
  launchCommand?: string | null;
  launchArgs?: string[];
  launchEnv?: Record<string, string>;
  version?: string | null;
  cached?: boolean;
  reason?: string | null;
}

export interface ManagedLspProbeResponse {
  servers: ManagedLspServerProbe[];
}

export interface ManagedLspProvisionResult {
  serverId: string;
  state: 'ready' | 'preparing' | 'failed';
  installed?: boolean;
  installDir?: string | null;
  executablePath?: string | null;
  launchCommand?: string | null;
  launchArgs?: string[];
  launchEnv?: Record<string, string>;
  version?: string | null;
  cached?: boolean;
  sha256?: string | null;
  sizeBytes?: number | null;
  error?: string | null;
  message?: string | null;
}

export interface LspInstallRequest {
  serverId: string;
  version: string;
  downloadUrl: string;
  sha256: string;
  archiveFormat?: 'binary' | 'zip' | 'tarGz' | 'gzip';
  executablePath?: string | null;
  launchCommand?: string | null;
  launchArgs?: string[];
  launchEnv?: Record<string, string>;
}

/**
 * 订阅 Rust LSP Supervisor 推送的 JSON-RPC 消息；Web 环境不会引入 Tauri event 模块。
 */
export async function listenLspMessages(
  handler: (payload: LspMessageEventPayload) => void,
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<LspMessageEventPayload>(LSP_MESSAGE_EVENT, (event) => handler(event.payload));
}

/**
 * LSP Supervisor Tauri 命令桥接。命令参数保留 request 包装层，与 Rust #[tauri::command] 参数名一致。
 */
export const lspCommands = {
  async startSession(options: LspSessionStartOptions): Promise<LspSessionStatus> {
    return invokeCommand<LspSessionStatus>('lsp_start_session', {
      request: {
        ...options,
        args: options.args ?? [],
        env: options.env ?? {},
      },
    });
  },

  async sendRequest(payload: LspRequestPayload): Promise<LspResponse> {
    return invokeCommand<LspResponse>('lsp_send_request', { request: payload });
  },

  async sendNotification(payload: LspNotificationPayload): Promise<void> {
    await invokeCommand<void>('lsp_send_notification', { notification: payload });
  },

  async stopSession(sessionId: string): Promise<LspSessionStatus> {
    return invokeCommand<LspSessionStatus>('lsp_stop_session', { sessionId });
  },

  async sessionStatus(sessionId?: string): Promise<{ sessions: LspSessionStatus[] }> {
    return invokeCommand<{ sessions: LspSessionStatus[] }>('lsp_session_status', {
      request: sessionId ? { sessionId } : null,
    });
  },

  async probeServers(): Promise<LspProbeResponse> {
    return invokeCommand<LspProbeResponse>('lsp_probe_servers');
  },

  async platformInfo(): Promise<LspPlatformInfo> {
    return invokeCommand<LspPlatformInfo>('lsp_platform_info');
  },

  /** 返回应用私有、按工作区隔离的 LSP 数据目录；不会写入用户项目目录。 */
  async workspaceDataDir(rootPath: string): Promise<string> {
    return invokeCommand<string>('lsp_workspace_data_dir', { rootPath });
  },

  /** 探测应用私有语言服务器缓存；旧版本后端未提供时由调用方捕获并降级。 */
  async probeManaged(): Promise<ManagedLspProbeResponse> {
    const response = await invokeCommand<{ servers: ManagedLspProvisionResult[] }>('lsp_provision_status', {
      request: null,
    });
    return {
      servers: response.servers.map((status) => ({
        id: status.serverId,
        state: status.installed && status.executablePath ? 'ready' : 'not_ready',
        installDir: status.installDir ?? null,
        executablePath: status.executablePath ?? null,
        launchCommand: status.launchCommand ?? null,
        launchArgs: status.launchArgs ?? [],
        launchEnv: status.launchEnv ?? {},
        version: status.version ?? null,
        cached: status.installed,
        reason: status.error ?? null,
      })),
    };
  },

  /** 兼容调用方旧命名。 */
  async probeManagedServers(): Promise<ManagedLspProbeResponse> {
    return this.probeManaged();
  },

  /** 按需下载/校验并准备一个应用私有语言服务器。 */
  async installServer(request: LspInstallRequest): Promise<ManagedLspProvisionResult> {
    return invokeCommand<ManagedLspProvisionResult>('lsp_install_server', { request });
  },

  /** 兼容调用方旧命名。 */
  async provisionServer(serverId: string): Promise<ManagedLspProvisionResult> {
    throw new TauriError(`语言服务器 ${serverId} 尚未配置受信任的下载资产`, 'lsp_install_server');
  },
};

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

export const windowCommands = {
  async openEditorWindow(payload: WindowTransferPayload): Promise<string> {
    return invokeCommand<string>('open_editor_window', { payload });
  },

  async consumeWindowTransfer(): Promise<WindowTransferPayload | null> {
    return invokeCommand<WindowTransferPayload | null>('consume_window_transfer');
  },
};

export const gitCommands = {
  async status(workspaceId: string): Promise<GitStatusResponse> {
    return invokeCommand<GitStatusResponse>('git_status', { workspaceId });
  },

  async diff(workspaceId: string, relativePath: string, staged = false): Promise<string> {
    return invokeCommand<string>('git_diff', { workspaceId, relativePath, staged });
  },

  async showFile(workspaceId: string, relativePath: string, revision = 'HEAD'): Promise<string> {
    return invokeCommand<string>('git_show_file', { workspaceId, relativePath, revision });
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

  async importAssetBytes(
    workspaceId: string,
    documentRelativePath: string,
    fileName: string,
    bytes: Uint8Array | number[],
  ): Promise<MarkdownAssetImportResponse> {
    return invokeCommand<MarkdownAssetImportResponse>('import_markdown_asset_bytes', {
      workspaceId,
      documentRelativePath,
      fileName,
      // Tauri serializes command arguments as JSON; normalize typed arrays to a
      // plain number array so clipboard image bytes arrive losslessly in Rust.
      bytes: Array.from(bytes),
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

  async readFileBytes(path: string): Promise<Uint8Array> {
    const bytes = await invokeCommand<number[]>('read_file_bytes', { path });
    return Uint8Array.from(bytes);
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

  async downloadAndInstallUpdate(
    downloadUrl: string,
    fileName: string,
    expectedSize?: number,
  ): Promise<DownloadInstallResult> {
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
      expectedSize,
      expected_size: expectedSize,
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
  async writeImage(bytes: Uint8Array | number[]): Promise<void> {
    await invokeCommand<void>('write_clipboard_image', {
      bytes: Array.from(bytes),
    });
  },

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

export interface CloudSessionInfo {
  signedIn: boolean;
  userId: string | null;
  username: string | null;
  baseUrl: string;
}

export interface CloudDocSpace {
  userId: string;
  usedBytes: number;
  quotaBytes: number;
  fileCount: number;
  maxVersionPerFile: number;
}

export interface CloudDocItem {
  fileId: number;
  path: string;
  title: string;
  contentHash: string | null;
  size: number;
  version: number;
  category: string | null;
  categoryId: number | null;
  tags: string | null;
  visibility: string | null;
  publishedArticleId: number | null;
  updatedAt: string | null;
}

/** Rust 侧对 CloudDocItem 使用 serde(flatten)，因此详情字段与列表项同层展开。 */
export interface CloudDocDetail extends CloudDocItem {
  content: string | null;
  createdAt: string | null;
}

export interface CloudDocVersion {
  versionId: number;
  version: number;
  contentHash: string | null;
  size: number;
  remark: string | null;
  createdAt: string | null;
}

export interface CloudDocPage {
  records: CloudDocItem[];
  total: number;
  page: number;
  size: number;
}

export interface CloudDocSavePayload {
  path: string;
  title?: string | null;
  content?: string | null;
  contentBase64?: string | null;
  contentHash?: string | null;
  baseVersion?: number | null;
  category?: string | null;
  categoryId?: number | null;
  tags?: string | null;
  visibility?: string | null;
}

export interface CloudDocSaveResult {
  fileId: number;
  version: number;
  contentHash: string;
  size: number;
  updatedAt: string | null;
}

export interface CloudSyncSource {
  content: string;
  contentHash: string;
  size: number;
  modifiedMs: number | null;
}

/** 云端文档打开方式（Rust `CloudOpenAction`）。 */
export type CloudDocOpenAction =
  | 'openExisting'
  | 'writeAndOpen'
  | 'confirmOverwrite'
  | 'rejected';

/** 云端文档在本机的落点与打开方式（Rust `cloud_doc_open_target`）。 */
export interface CloudDocOpenTarget {
  cloudPath: string;
  relativePath: string;
  absolutePath: string;
  exists: boolean;
  sameContent: boolean;
  openable: boolean;
  action: CloudDocOpenAction;
  reasonCode: string | null;
  reason: string | null;
}

/** 云文档图片附件（Rust `CloudAssetInfo`）。 */
export interface CloudAssetInfo {
  assetId: number;
  relPath: string;
  fileName: string;
  mime?: string | null;
  size?: number;
  contentHash?: string | null;
}

/** 本地图片探测结果（Rust `CloudAssetSourceInfo`）。 */
export interface CloudAssetSourceInfo {
  path: string;
  exists: boolean;
  size: number;
  contentHash: string | null;
  supported: boolean;
  reason: string | null;
}

/** 图片下载落盘结果（Rust `CloudAssetDownloadResult`）。 */
export interface CloudAssetDownloadResult {
  status: 'written' | 'skippedSame' | 'skippedConflict';
  localPath: string;
  size: number;
  reason: string | null;
}

/** 二进制文档上传结果（Rust `CloudBinaryUploadResult`）。 */
export interface CloudBinaryUploadResult {
  fileId: number;
  version: number;
  contentHash?: string | null;
  size?: number;
  updatedAt?: string | null;
}

/** 分享创建结果（Rust `CloudShareInfo`）。 */
export interface CloudShareInfo {
  shareUrl: string;
  token: string;
  createdAt: string | null;
  expiresAt: string | null;
  hasPassword: boolean;
  visitCount: number;
  syncedVersion: number | null;
  categoryApplied: string | null;
  appliedDefaultCategory: boolean | null;
  /** 文件扩展名（不含点），分享页据此选择渲染器 */
  fileExt?: string | null;
  /** markdown / code / text / image / pdf / office / other */
  fileKind?: string | null;
  fileName?: string | null;
}

/** 分享状态（Rust `CloudShareStatus`）。 */
export interface CloudShareStatus {
  shared: boolean;
  shareUrl?: string | null;
  token?: string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  hasPassword?: boolean | null;
  visitCount?: number | null;
  fileExt?: string | null;
  fileKind?: string | null;
  fileName?: string | null;
}

/** 分享站点配置（Rust `CloudShareConfig`）。 */
export interface CloudShareConfig {
  shareBaseUrl: string | null;
  defaultCategory: string | null;
  maxExpireDays: number | null;
}

/** 分享创建入参：`expiresInDays` 为 null 表示永久，`password` 为空表示无密码。 */
export interface CloudShareCreatePayload {
  regenerate?: boolean;
  expiresInDays?: number | null;
  password?: string | null;
}

/**
 * 博客分类节点（云文档属性面板的分类候选）。
 * 服务端 `category` 表为多级树，id/parentId 是被序列化成字符串的雪花 ID；
 * 根节点 parentId 统一为 null。分类表为空时 Rust 侧会把「分类名数组」归一化成同结构的扁平节点。
 */
export interface CloudCategoryNode {
  id: string;
  name: string;
  parentId: string | null;
  children: CloudCategoryNode[];
}

/**
 * 云文档桥接。桌面端的网络请求、JWT 与 keyring 全部在 Rust 侧完成，
 * 前端只负责传参，不持有也不落盘任何凭据。
 */
export const cloudCommands = {
  async login(
    baseUrl: string | null,
    username: string,
    password: string,
  ): Promise<CloudSessionInfo> {
    return invokeCommand<CloudSessionInfo>('cloud_login', { baseUrl, username, password });
  },

  async logout(): Promise<void> {
    await invokeCommand<void>('cloud_logout');
  },

  async session(): Promise<CloudSessionInfo> {
    return invokeCommand<CloudSessionInfo>('cloud_session');
  },

  async me(): Promise<CloudDocSpace> {
    return invokeCommand<CloudDocSpace>('cloud_docs_me');
  },

  async list(query: {
    pathPrefix?: string | null;
    keyword?: string | null;
    page?: number;
    size?: number;
  }): Promise<CloudDocPage> {
    return invokeCommand<CloudDocPage>('cloud_docs_list', {
      pathPrefix: query.pathPrefix ?? null,
      keyword: query.keyword ?? null,
      page: query.page ?? 1,
      size: query.size ?? 50,
    });
  },

  async get(fileId: number): Promise<CloudDocDetail> {
    return invokeCommand<CloudDocDetail>('cloud_docs_get', { fileId });
  },

  async save(payload: CloudDocSavePayload): Promise<CloudDocSaveResult> {
    return invokeCommand<CloudDocSaveResult>('cloud_docs_save', { payload });
  },

  async versions(fileId: number): Promise<CloudDocVersion[]> {
    return invokeCommand<CloudDocVersion[]>('cloud_docs_versions', { fileId });
  },

  async restore(fileId: number, versionId: number): Promise<CloudDocSaveResult> {
    return invokeCommand<CloudDocSaveResult>('cloud_docs_restore', { fileId, versionId });
  },

  async remove(fileId: number): Promise<void> {
    await invokeCommand<void>('cloud_docs_delete', { fileId });
  },

  /** 判定云文档在本机的落点与打开方式（纯本地探测，不产生云端请求）。 */
  async openTarget(input: {
    workspaceRoot: string;
    workspaceName: string;
    cloudPath: string;
    remoteHash?: string | null;
  }): Promise<CloudDocOpenTarget> {
    return invokeCommand<CloudDocOpenTarget>('cloud_doc_open_target', {
      workspaceRoot: input.workspaceRoot,
      workspaceName: input.workspaceName,
      cloudPath: input.cloudPath,
      remoteHash: input.remoteHash ?? null,
    });
  },

  /** 读取本地待同步源文件并返回内容与 sha256（Rust 计算，避免前端重复实现哈希）。 */
  async readSyncSource(path: string, maxBytes: number): Promise<CloudSyncSource> {
    return invokeCommand<CloudSyncSource>('cloud_read_sync_source', { path, maxBytes });
  },

  /**
   * 博客分类树（公开接口，未登录也可取；Rust 已把「分类表树」与「分类名数组」归一化成同结构）。
   */
  async blogCategories(): Promise<CloudCategoryNode[]> {
    return invokeCommand<CloudCategoryNode[]>('cloud_blog_categories');
  },

  /** 博客标签候选（公开接口，未登录也可取；Rust 侧已去重并按字典序排序）。 */
  async blogTags(): Promise<string[]> {
    return invokeCommand<string[]>('cloud_blog_tags');
  },

  /** 生成/复用云文档分享链接。 */
  async shareCreate(fileId: number, payload: CloudShareCreatePayload = {}): Promise<CloudShareInfo> {
    return invokeCommand<CloudShareInfo>('cloud_docs_share_create', {
      fileId,
      regenerate: payload.regenerate ?? false,
      expiresInDays: payload.expiresInDays ?? null,
      password: payload.password ?? null,
    });
  },

  /** 查询云文档当前分享状态。 */
  async shareStatus(fileId: number): Promise<CloudShareStatus> {
    return invokeCommand<CloudShareStatus>('cloud_docs_share_status', { fileId });
  },

  /** 撤销分享（旧链接立即失效）。 */
  async shareRevoke(fileId: number): Promise<void> {
    await invokeCommand<void>('cloud_docs_share_revoke', { fileId });
  },

  /** 分享站点配置：分享域名 / 默认分类 / 有效期上限。 */
  async shareConfig(): Promise<CloudShareConfig> {
    return invokeCommand<CloudShareConfig>('cloud_share_config');
  },

  /** 云端分类树（管理接口，需登录）。 */
  async categoriesList(): Promise<CloudCategoryNode[]> {
    return invokeCommand<CloudCategoryNode[]>('cloud_categories_list');
  },

  /** 新建分类（POST /categories）。 */
  async categoryCreate(name: string, parentId?: string | null): Promise<CloudCategoryNode> {
    return invokeCommand<CloudCategoryNode>('cloud_category_create', {
      name,
      parentId: parentId ?? null,
    });
  },

  /** 重命名分类（PUT /categories/{id}，body 只带 name）。 */
  async categoryUpdate(id: string, name: string): Promise<CloudCategoryNode> {
    return invokeCommand<CloudCategoryNode>('cloud_category_update', { id, name });
  },

  /** 删除分类（DELETE /categories/{id}）。 */
  async categoryDelete(id: string): Promise<void> {
    await invokeCommand<void>('cloud_category_delete', { id });
  },

  /** 把云文档移动到指定分类（categoryId 为 null 表示取消分类）。 */
  async moveDocCategory(fileId: number, categoryId: number | null): Promise<void> {
    await invokeCommand<void>('cloud_docs_move_category', { fileId, categoryId });
  },

  /** 上传二进制文档（pdf/doc/xls/ppt 等，multipart，字节不经前端）。 */
  async binaryUpload(input: {
    path: string;
    title?: string | null;
    category?: string | null;
    tags?: string | null;
    localPath: string;
  }): Promise<CloudBinaryUploadResult> {
    return invokeCommand<CloudBinaryUploadResult>('cloud_docs_binary_upload', {
      path: input.path,
      title: input.title ?? null,
      category: input.category ?? null,
      tags: input.tags ?? null,
      localPath: input.localPath,
    });
  },

  /** 文档图片附件列表。 */
  async assetsList(fileId: number): Promise<CloudAssetInfo[]> {
    return invokeCommand<CloudAssetInfo[]>('cloud_docs_assets_list', { fileId });
  },

  /** 探测一批本地图片（存在性/大小/hash/扩展名/魔数）。 */
  async inspectAssetSources(paths: string[]): Promise<CloudAssetSourceInfo[]> {
    return invokeCommand<CloudAssetSourceInfo[]>('cloud_inspect_asset_sources', { paths });
  },

  /** 上传单张本地图片（Rust 侧做大小/扩展名/魔数校验）。 */
  async assetUploadFile(fileId: number, relPath: string, localPath: string): Promise<CloudAssetInfo> {
    return invokeCommand<CloudAssetInfo>('cloud_docs_asset_upload_file', { fileId, relPath, localPath });
  },

  /** 下载云端图片并写入 workspace 相对路径（同 hash 跳过、冲突不覆盖）。 */
  async assetDownload(input: {
    fileId: number;
    assetId: number;
    workspaceRoot: string;
    documentPath: string;
    relPath: string;
    expectedHash?: string | null;
  }): Promise<CloudAssetDownloadResult> {
    return invokeCommand<CloudAssetDownloadResult>('cloud_docs_asset_download', {
      fileId: input.fileId,
      assetId: input.assetId,
      workspaceRoot: input.workspaceRoot,
      documentPath: input.documentPath,
      relPath: input.relPath,
      expectedHash: input.expectedHash ?? null,
    });
  },
};
