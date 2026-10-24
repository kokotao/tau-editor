/**
 * @description 云文档手动同步：白名单判断、云路径生成、三方决策与当前文档推送/拉取。
 * 所有网络请求都经 Rust 云命令完成，前端只处理文件内容与标签状态。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 10:30
 */
import { cloudCommands, isTauriApp, type CloudDocItem, type CloudDocSavePayload } from '@/lib/tauri';
import {
  findCloudDocByPath,
  getCloudDoc,
  normalizeCloudError,
  saveCloudDoc,
} from '@/services/cloudDocService';
import { createTabService } from '@/services/tabService';
import {
  createWorkspaceService,
  isBinaryPreviewPath,
  LARGE_FILE_CHUNK_LOAD_THRESHOLD_BYTES,
} from '@/services/workspaceService';
import {
  getFileName,
  isPathInsideRoot,
  toRelativeWorkspacePath,
} from '@/services/workspaceRuntimeService';
import { useEditorStore } from '@/stores/editor';
import { useFileConflictsStore } from '@/stores/fileConflicts';
import { useFileSystemStore } from '@/stores/fileSystem';
import { useNotificationStore } from '@/stores/notification';
import { useSettingsStore } from '@/stores/settings';
import { useTabsStore, type Tab } from '@/stores/tabs';
import { useWorkspaceStore } from '@/stores/workspace';

/** 云文档单文件上限，与 Rust 侧 `cloud_read_sync_source.max_bytes` 保持一致。 */
export const CLOUD_SYNC_MAX_BYTES = 12 * 1024 * 1024;
/** 云文档路径根段，避免与 lizi 其它业务文件混在一起。 */
export const CLOUD_DOC_PATH_ROOT = 'tau';
const CLOUD_DOC_PATH_MAX_LENGTH = 512;

export interface CloudSyncEligibility {
  eligible: boolean;
  reason?: string;
}

export type CloudSyncAction = 'create' | 'update' | 'pull' | 'skip' | 'conflict';

export interface CloudSyncResult {
  status: 'synced' | 'skipped' | 'conflict' | 'failed';
  fileId?: number;
  version?: number;
  message?: string;
}

function formatMegabytes(bytes: number): string {
  const megabytes = Math.round(bytes / (1024 * 1024));
  return `${megabytes} MB`;
}

/**
 * 同步白名单：只允许有磁盘路径的用户可编辑文本文件。
 * 二进制/图片预览与大文件标签都跳过，避免把预览占位内容推上云端。
 */
export function isCloudSyncEligibleFile(
  filePath: string | null | undefined,
  fileSize?: number | null,
): CloudSyncEligibility {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return { eligible: false, reason: '当前标签没有对应的磁盘文件' };
  }

  if (isBinaryPreviewPath(filePath)) {
    return { eligible: false, reason: '二进制或图片预览文件暂不支持云同步' };
  }

  if (
    typeof fileSize === 'number'
    && Number.isFinite(fileSize)
    && fileSize > LARGE_FILE_CHUNK_LOAD_THRESHOLD_BYTES
  ) {
    return {
      eligible: false,
      reason: `文件超过 ${formatMegabytes(LARGE_FILE_CHUNK_LOAD_THRESHOLD_BYTES)}，暂不支持云同步`,
    };
  }

  return { eligible: true };
}

function normalizePathSegments(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
    .join('/');
}

/**
 * 生成云文档路径 `tau/{workspaceName}/{relativePath}`：
 * Windows 反斜杠统一为 `/`，去掉空段与 `.`/`..`，整串截断到 512。
 */
export function toCloudDocPath(
  workspaceName: string | null | undefined,
  relativePath: string,
): string {
  const segments = [CLOUD_DOC_PATH_ROOT];
  const workspaceSegment = normalizePathSegments(workspaceName ?? '');
  if (workspaceSegment) segments.push(workspaceSegment);
  const relativeSegment = normalizePathSegments(relativePath);
  if (relativeSegment) segments.push(relativeSegment);

  const joined = segments.join('/');
  return joined.length > CLOUD_DOC_PATH_MAX_LENGTH
    ? joined.slice(0, CLOUD_DOC_PATH_MAX_LENGTH)
    : joined;
}

/** 文件相对当前工作区的路径；文件在工作区外时退化为文件名。 */
export function resolveCloudDocRelativePath(
  filePath: string,
  workspaceRoot: string | null | undefined,
): string {
  if (workspaceRoot && isPathInsideRoot(filePath, workspaceRoot)) {
    return toRelativeWorkspacePath(filePath, workspaceRoot);
  }
  return getFileName(filePath);
}

/** 供 store 记录 docMap 时复用同一套路径规则。 */
export function resolveCloudDocPathForFile(
  filePath: string,
  workspaceName: string | null | undefined,
  workspaceRoot: string | null | undefined,
): string {
  return toCloudDocPath(workspaceName, resolveCloudDocRelativePath(filePath, workspaceRoot));
}

/**
 * 三方决策：
 * - 云端没有文档 → create
 * - 本地与云端哈希一致 → skip
 * - 本地未动、云端变了 → pull
 * - 双方都动了（或缺少基线且不一致）→ conflict
 */
export function resolveCloudSyncDecision(input: {
  localHash: string | null;
  remoteHash: string | null;
  baseHash: string | null;
}): CloudSyncAction {
  const { localHash, remoteHash, baseHash } = input;

  if (remoteHash === null) {
    return 'create';
  }

  if (localHash !== null && localHash === remoteHash) {
    return 'skip';
  }

  if (baseHash !== null && localHash === baseHash && remoteHash !== baseHash) {
    return 'pull';
  }

  if (baseHash !== null && remoteHash !== baseHash && localHash !== baseHash) {
    return 'conflict';
  }

  return 'conflict';
}

function createSyncContext() {
  const tabsStore = useTabsStore();
  const fileSystemStore = useFileSystemStore();
  const workspaceStore = useWorkspaceStore();
  const editorStore = useEditorStore();
  const settingsStore = useSettingsStore();
  const notificationStore = useNotificationStore();

  const workspaceService = createWorkspaceService(
    fileSystemStore,
    tabsStore,
    workspaceStore,
    editorStore,
    settingsStore,
    notificationStore,
  );
  const tabService = createTabService(
    tabsStore,
    fileSystemStore,
    editorStore,
    workspaceStore,
    notificationStore,
  );

  return {
    tabsStore,
    fileSystemStore,
    workspaceStore,
    editorStore,
    workspaceService,
    tabService,
  };
}

type SyncContext = ReturnType<typeof createSyncContext>;

function resolveTargetTab(
  tabsStore: SyncContext['tabsStore'],
  tabId?: string,
): Tab | null {
  if (tabId) {
    return tabsStore.tabs.find((item) => item.id === tabId) ?? null;
  }
  return tabsStore.activeTab;
}

/** 冲突不自动覆盖：登记到 fileConflicts store，由用户决定保留哪一份。 */
function flagCloudConflict(tab: Tab): void {
  if (!tab.filePath) {
    return;
  }

  const conflictsStore = useFileConflictsStore();
  conflictsStore.flag({
    path: tab.filePath,
    kind: 'modified',
    diskModifiedMs: tab.lastKnownModified ?? null,
    diskSize: tab.largeFileSize ?? null,
    baselineModifiedMs: tab.lastKnownModified ?? null,
  });
}

function applySyncedMeta(
  context: SyncContext,
  tabId: string,
  meta: { fileId: number; version: number; contentHash: string | null },
): void {
  context.tabsStore.updateTab(tabId, {
    cloudFileId: meta.fileId,
    cloudVersion: meta.version,
    cloudContentHash: meta.contentHash,
    lastSyncedAt: Date.now(),
  });
}

/** 把云端详情写回本地文件，并刷新标签的磁盘基线。 */
async function pullRemoteDocument(
  context: SyncContext,
  tab: Tab,
  remote: CloudDocItem,
): Promise<CloudSyncResult> {
  const filePath = tab.filePath;
  if (!filePath) {
    return { status: 'failed', message: '当前标签没有对应的磁盘文件' };
  }

  const detailOutcome = await getCloudDoc(remote.fileId);
  if (!detailOutcome.ok) {
    return {
      status: 'failed',
      fileId: remote.fileId,
      version: remote.version,
      message: detailOutcome.message,
    };
  }

  const detail = detailOutcome.data;
  if (detail.content === null) {
    return {
      status: 'failed',
      fileId: detail.fileId,
      version: detail.version,
      message: '云端文档没有可下载的文本内容',
    };
  }

  await context.fileSystemStore.writeFileContent(filePath, detail.content);
  const revision = await context.workspaceService.captureFileRevision(filePath);

  context.tabService.updateTabContent(tab.id, detail.content, { markDirty: false });
  context.tabsStore.updateTab(tab.id, {
    isDirty: false,
    externalModifiedAt: null,
    fileRevision: revision,
    cloudFileId: detail.fileId,
    cloudVersion: detail.version,
    cloudContentHash: detail.contentHash,
    lastSyncedAt: Date.now(),
  });

  return {
    status: 'synced',
    fileId: detail.fileId,
    version: detail.version,
    message: '已从云端拉取最新内容',
  };
}

/**
 * 同步当前文档（或指定标签）到云端。
 * 脏标签先静默保存，再用 Rust 计算的 sha256 做三方决策；冲突只登记不覆盖。
 */
export async function syncCurrentDocument(tabId?: string): Promise<CloudSyncResult> {
  if (!isTauriApp()) {
    return { status: 'skipped', message: '当前是 Web 构建，云文档同步仅在 Tauri 桌面端可用。' };
  }

  const context = createSyncContext();
  const tab = resolveTargetTab(context.tabsStore, tabId);
  if (!tab) {
    return { status: 'failed', message: '没有可同步的文档' };
  }

  const eligibility = isCloudSyncEligibleFile(tab.filePath, tab.largeFileSize ?? null);
  if (!eligibility.eligible) {
    return { status: 'skipped', message: eligibility.reason ?? '当前文档不支持云同步' };
  }

  if (tab.isLargeFile || tab.isLoadingContent) {
    return { status: 'skipped', message: '大文件标签暂不支持云同步' };
  }

  const filePath = tab.filePath;
  if (!filePath) {
    return { status: 'failed', message: '当前标签没有对应的磁盘文件' };
  }

  try {
    if (tab.isDirty) {
      // 复用保存流程：静默保存失败说明内容还只在内存里，不能当作同步源。
      const saved = await context.tabService.saveTab(tab.id, { silent: true });
      if (!saved) {
        return { status: 'failed', message: '当前文档尚未保存到磁盘，无法同步到云端' };
      }
    }

    const source = await cloudCommands.readSyncSource(filePath, CLOUD_SYNC_MAX_BYTES);
    const cloudPath = resolveCloudDocPathForFile(
      filePath,
      context.workspaceStore.currentWorkspaceName,
      context.workspaceStore.currentWorkspacePath,
    );

    const remoteOutcome = await findCloudDocByPath(cloudPath);
    if (!remoteOutcome.ok) {
      return { status: 'failed', message: remoteOutcome.message };
    }

    const remote = remoteOutcome.data;
    // 保存流程可能更新过标签，重新取一次以拿到最新云端基线。
    const currentTab = resolveTargetTab(context.tabsStore, tab.id) ?? tab;
    const decision = resolveCloudSyncDecision({
      localHash: source.contentHash,
      remoteHash: remote?.contentHash ?? null,
      baseHash: currentTab.cloudContentHash ?? null,
    });

    if (decision === 'pull' && remote) {
      return pullRemoteDocument(context, currentTab, remote);
    }

    if (decision === 'conflict') {
      flagCloudConflict(currentTab);
      return {
        status: 'conflict',
        fileId: remote?.fileId,
        version: remote?.version,
        message: '本地与云端都修改过该文档，请手动确认后再同步',
      };
    }

    if (decision === 'skip' && remote) {
      applySyncedMeta(context, currentTab.id, {
        fileId: remote.fileId,
        version: remote.version,
        contentHash: remote.contentHash,
      });
      return {
        status: 'skipped',
        fileId: remote.fileId,
        version: remote.version,
        message: '本地内容与云端一致',
      };
    }

    // create / update 走同一个保存命令：新建时 baseVersion 为 null，覆盖时带远端当前版本。
    const payload: CloudDocSavePayload = {
      path: cloudPath,
      title: currentTab.fileName,
      content: source.content,
      contentHash: source.contentHash,
      baseVersion: remote ? remote.version : null,
    };

    const savedOutcome = await saveCloudDoc(payload);
    if (!savedOutcome.ok) {
      if (savedOutcome.kind === 'conflict') {
        flagCloudConflict(currentTab);
      }
      return {
        status: savedOutcome.kind === 'conflict' ? 'conflict' : 'failed',
        fileId: remote?.fileId,
        version: remote?.version,
        message: savedOutcome.message,
      };
    }

    applySyncedMeta(context, currentTab.id, {
      fileId: savedOutcome.data.fileId,
      version: savedOutcome.data.version,
      contentHash: savedOutcome.data.contentHash,
    });

    return {
      status: 'synced',
      fileId: savedOutcome.data.fileId,
      version: savedOutcome.data.version,
      message: remote ? '已更新云端文档' : '已创建云端文档',
    };
  } catch (error) {
    const normalized = normalizeCloudError(error);
    // 二进制/超限文件由 Rust 用 unsupported 类错误返回，按「跳过」而不是「失败」上报。
    return normalized.kind === 'unsupported'
      ? { status: 'skipped', message: normalized.message }
      : { status: 'failed', message: normalized.message };
  }
}

/**
 * 强制用云端内容覆盖本地标签（用户显式选择“拉取云端”时使用）。
 * 仍要求标签对应实体文件，且不触碰二进制预览与大文件标签。
 */
export async function pullCloudDocumentIntoLocal(tabId: string): Promise<CloudSyncResult> {
  if (!isTauriApp()) {
    return { status: 'skipped', message: '当前是 Web 构建，云文档同步仅在 Tauri 桌面端可用。' };
  }

  const context = createSyncContext();
  const tab = resolveTargetTab(context.tabsStore, tabId);
  if (!tab) {
    return { status: 'failed', message: '没有可拉取的文档' };
  }

  const eligibility = isCloudSyncEligibleFile(tab.filePath, tab.largeFileSize ?? null);
  if (!eligibility.eligible) {
    return { status: 'skipped', message: eligibility.reason ?? '当前文档不支持云同步' };
  }

  if (tab.isLargeFile || tab.isLoadingContent) {
    return { status: 'skipped', message: '大文件标签暂不支持云同步' };
  }

  const filePath = tab.filePath;
  if (!filePath) {
    return { status: 'failed', message: '当前标签没有对应的磁盘文件' };
  }

  try {
    const cloudPath = resolveCloudDocPathForFile(
      filePath,
      context.workspaceStore.currentWorkspaceName,
      context.workspaceStore.currentWorkspacePath,
    );

    const remoteOutcome = await findCloudDocByPath(cloudPath);
    if (!remoteOutcome.ok) {
      return { status: 'failed', message: remoteOutcome.message };
    }

    const remote = remoteOutcome.data;
    if (!remote) {
      return { status: 'skipped', message: '云端还没有该文档' };
    }

    return await pullRemoteDocument(context, tab, remote);
  } catch (error) {
    const normalized = normalizeCloudError(error);
    // 二进制/超限文件由 Rust 用 unsupported 类错误返回，按「跳过」而不是「失败」上报。
    return normalized.kind === 'unsupported'
      ? { status: 'skipped', message: normalized.message }
      : { status: 'failed', message: normalized.message };
  }
}
