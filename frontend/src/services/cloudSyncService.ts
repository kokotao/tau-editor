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
  type CloudErrorKind,
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
import { syncMarkdownAssets, pullMarkdownAssets, describeAssetSync, type CloudAssetSyncSummary, type CloudAssetPullSummary } from '@/services/cloudAssetService';
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
  /** 失败归类（仅 failed 时有值）：store 用它判断是否需要清掉已失效的登录态。 */
  kind?: CloudErrorKind;
  /** 拉取会覆盖未保存修改：需要 UI 先确认，确认后带 overwriteDirty 重试。 */
  needsDirtyConfirm?: boolean;
  /** 本次同步的图片附件汇总（md 相对图片） */
  assets?: CloudAssetSyncSummary;
  /** 本次拉取时补齐图片的汇总 */
  assetPull?: CloudAssetPullSummary;
}

const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdx'];

/** 是否是 markdown（只有 md 才扫描相对图片）。 */
export function isMarkdownPath(filePath: string | null | undefined): boolean {
  const lower = (filePath ?? '').toLowerCase();
  return MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * 正文同步成功（或已是最新）后同步 md 引用的图片。
 * 设置项关闭时返回 disabled 汇总；图片失败只汇总，不影响正文结果。
 */
async function syncAssetsAfterSave(input: {
  filePath: string;
  fileId: number;
  content: string;
}): Promise<CloudAssetSyncSummary | undefined> {
  if (!isMarkdownPath(input.filePath)) {
    return undefined;
  }
  const settings = useSettingsStore();
  const enabled = settings.syncDocumentImages !== false;
  return syncMarkdownAssets({
    filePath: input.filePath,
    fileId: input.fileId,
    content: input.content,
    enabled,
  });
}

/** 把图片汇总拼到结果文案后面（只在有上传或失败时补充，避免噪声）。 */
function withAssetMessage(message: string | undefined, summary: CloudAssetSyncSummary | undefined): string | undefined {
  if (!summary || summary.total === 0) {
    return message;
  }
  if (summary.uploaded === 0 && summary.failed === 0) {
    return message;
  }
  const suffix = describeAssetSync(summary);
  return message ? `${message}；${suffix}` : suffix;
}

/** 拉取云端的可选行为。 */
export interface PullCloudDocumentOptions {
  /**
   * 调用方已确认「可以丢弃本地未保存修改」。
   * 冲突面板里用户显式选择「以云端为准」时置 true，避免二次弹窗。
   */
  overwriteDirty?: boolean;
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

/** docMap 中与「身份判定」相关的字段子集（结构兼容 CloudDocSyncMeta，用结构化类型避免与 store 形成类型环）。 */
export interface CloudDocIdentityMeta {
  fileId: number;
  version?: number;
  contentHash?: string | null;
  category?: string | null;
  categoryId?: string | number | null;
}

export interface CloudDocIdentity {
  /** 云端完整路径（保存时必须用它定位文档，不能再用本地路径反推） */
  cloudPath: string;
  /** 已知的云端 fileId；无法判定时为 null（说明是首次上传） */
  fileId: number | null;
  /** docMap 里命中的元数据（版本/分类/哈希） */
  meta: CloudDocIdentityMeta | null;
}

/**
 * 编辑器右键「同步至云端」的云端身份与分类回显。
 *
 * 编辑器里的本地路径可能是临时落位文件（按路径反推云端路径不可靠，
 * 也是「编辑器入口同步时分类不回显」的根因）；优先用标签上的 cloudFileId
 * 在 docMap 中定位云端记录，再退回路径推导。
 */
export interface EditorSyncIdentity {
  cloudFileId: number | null;
  cloudPath: string | null;
  category: string | null;
  categoryId: string | number | null;
}

export interface EditorSyncIdentityInput {
  cloudFileId?: number | null;
  filePath?: string | null;
  docMap?: Record<string, CloudDocIdentityMeta>;
  workspaceName?: string | null;
  workspacePath?: string | null;
}

export function resolveEditorSyncIdentity(input: EditorSyncIdentityInput): EditorSyncIdentity {
  const identity = resolveCloudDocIdentity({
    filePath: input.filePath ?? null,
    cloudFileId: input.cloudFileId ?? null,
    cloudPath: null,
    docMap: input.docMap ?? {},
    workspaceName: input.workspaceName ?? null,
    workspacePath: input.workspacePath ?? null,
  });
  // 只有 docMap 命中才算「已知云端路径」；否则保留 null，交给同步对话框按原逻辑推导，
  // 避免把临时区文件推导出的路径误当成真实云端位置。
  const knownCloudPath = identity.meta ? identity.cloudPath || null : null;
  return {
    // 标签上的 cloudFileId 即使暂时不在 docMap 里也要保留（它是权威身份）
    cloudFileId: identity.fileId ?? input.cloudFileId ?? null,
    cloudPath: knownCloudPath,
    category: identity.meta?.category ?? null,
    categoryId: identity.meta?.categoryId ?? null,
  };
}

export interface CloudDocIdentityInput {
  filePath?: string | null;
  /** 标签上的云端 fileId：一旦存在就是权威身份 */
  cloudFileId?: number | null;
  /** 明确的云端路径（来自云端文档树节点的 path） */
  cloudPath?: string | null;
  docMap?: Record<string, CloudDocIdentityMeta> | null;
  workspaceName?: string | null;
  workspacePath?: string | null;
}

/**
 * 解析「这份本地文件到底是云端哪篇文档」。
 *
 * 背景：跨工作区云文档会被落到系统临时区（scratch），本地路径已经无法反推出
 * `tau/<workspace>/<relative>`；此时若仍按本地路径推导，会把「更新同一篇文档」误判成
 * 「新建一篇文档」（旧文档留在原分类，新文档出现在新分类）。因此优先级必须是：
 * 显式 cloudPath → 标签的 cloudFileId → 最后才是本地路径推导。
 */
export function resolveCloudDocIdentity(input: CloudDocIdentityInput): CloudDocIdentity {
  const docMap = input.docMap ?? {};
  const normalize = (value: string): string =>
    value
      .replace(/\\/g, '/')
      .split('/')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0)
      .join('/');

  const findByFileId = (fileId: number): { path: string; meta: CloudDocIdentityMeta } | null => {
    for (const [path, meta] of Object.entries(docMap)) {
      if (meta && meta.fileId === fileId) {
        return { path, meta };
      }
    }
    return null;
  };

  const explicitPath = typeof input.cloudPath === 'string' ? normalize(input.cloudPath) : '';
  if (explicitPath) {
    const meta = docMap[explicitPath] ?? (input.cloudFileId != null ? findByFileId(input.cloudFileId)?.meta ?? null : null);
    return {
      cloudPath: explicitPath,
      fileId: input.cloudFileId ?? meta?.fileId ?? null,
      meta,
    };
  }

  if (input.cloudFileId != null) {
    const hit = findByFileId(input.cloudFileId);
    if (hit) {
      return { cloudPath: hit.path, fileId: hit.meta.fileId, meta: hit.meta };
    }
  }

  const derived = input.filePath
    ? normalize(resolveCloudDocPathForFile(input.filePath, input.workspaceName ?? null, input.workspacePath ?? null))
    : '';
  const derivedMeta = derived ? docMap[derived] ?? null : null;
  return {
    cloudPath: derived,
    fileId: derivedMeta?.fileId ?? null,
    meta: derivedMeta,
  };
}

/**
 * 三方决策：
 * - 云端没有文档 → create
 * - 本地与云端哈希一致 → skip
 * - 本地未动、云端变了 → pull
 * - 本地动了、云端没动 → update（可安全覆盖，baseVersion 由调用方取云端当前版本）
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

  // 云端仍是上次同步的版本、只有本地变化：正常上传，不能判成冲突，
  // 否则每次本地编辑都会弹冲突、自动同步永远传不上去。
  if (baseHash !== null && localHash !== baseHash && remoteHash === baseHash) {
    return 'update';
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
    // 显式标记来源：云冲突只点亮云同步面板，不复用磁盘外部变更的提示入口。
    source: 'cloud',
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
      kind: detailOutcome.kind,
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

  // md 拉取后补齐图片：缺失的下载写入，冲突的不覆盖
  let assetPull: CloudAssetPullSummary | undefined;
  if (isMarkdownPath(filePath)) {
    const workspaceRoot = context.workspaceStore.currentWorkspacePath ?? '';
    if (workspaceRoot) {
      assetPull = await pullMarkdownAssets({
        filePath,
        fileId: detail.fileId,
        workspaceRoot,
      });
    }
  }

  return {
    status: 'synced',
    fileId: detail.fileId,
    version: detail.version,
    message: '已从云端拉取最新内容',
    assetPull,
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
    // 与「同步至云端」同一套身份解析：临时区落位的文档必须靠 tagging 的 cloudFileId 认身份，
    // 否则会把更新误判为新建（旧文档留在原分类）。
    const { useCloudSyncStore } = await import('@/stores/cloudSync');
    const identity = resolveCloudDocIdentity({
      filePath,
      cloudFileId: tab.cloudFileId ?? null,
      docMap: useCloudSyncStore().docMap,
      workspaceName: context.workspaceStore.currentWorkspaceName,
      workspacePath: context.workspaceStore.currentWorkspacePath,
    });
    const cloudPath = identity.cloudPath;

    const remoteOutcome = await findCloudDocByPath(cloudPath);
    if (!remoteOutcome.ok) {
      return { status: 'failed', message: remoteOutcome.message };
    }

    let remote = remoteOutcome.data;
    if (!remote && identity.fileId !== null) {
      const detail = await getCloudDoc(identity.fileId);
      if (detail.ok) {
        remote = detail.data;
      }
    }
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
      const skipAssets = await syncAssetsAfterSave({
        filePath,
        fileId: remote.fileId,
        content: source.content,
      });
      return {
        status: 'skipped',
        fileId: remote.fileId,
        version: remote.version,
        message: withAssetMessage('本地内容与云端一致', skipAssets),
        assets: skipAssets,
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
        kind: savedOutcome.kind,
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

    const savedAssets = await syncAssetsAfterSave({
      filePath,
      fileId: savedOutcome.data.fileId,
      content: source.content,
    });
    return {
      status: 'synced',
      fileId: savedOutcome.data.fileId,
      version: savedOutcome.data.version,
      message: withAssetMessage(remote ? '已更新云端文档' : '已创建云端文档', savedAssets),
      assets: savedAssets,
    };
  } catch (error) {
    const normalized = normalizeCloudError(error);
    // 二进制/超限文件由 Rust 用 unsupported 类错误返回，按「跳过」而不是「失败」上报。
    return normalized.kind === 'unsupported'
      ? { status: 'skipped', message: normalized.message }
      : { status: 'failed', kind: normalized.kind, message: normalized.message };
  }
}

/** 右键「同步至云端」的入参：文件可能没在标签里打开。 */
export interface CloudDocSyncByPathInput {
  filePath: string;
  /** 云端文档 id：跨工作区落位到临时区的文档靠它判定「更新谁」，不再依赖本地路径反推 */
  fileId?: number | null;
  /** 云端完整路径（云端文档树节点的 path）：与 fileId 一起构成权威身份 */
  cloudPath?: string | null;
  /** 叶子分类名（自由文本；「新建分类」就写这里，不调管理端接口） */
  category?: string | null;
  /** 分类节点 id：雪花 id 按字符串透传（number 仅兼容旧调用方） */
  categoryId?: string | number | null;
  tags?: string | null;
  visibility?: 'PRIVATE' | 'PUBLIC';
  /** 用户已确认「覆盖云端」时置 true（冲突/需拉取的分支才需要） */
  overwrite?: boolean;
}

/**
 * 按文件路径把文档同步到云端（不要求标签已打开）：
 * 复用三方决策——同哈希视为「已同步」；云端有差异先返回 conflict 让 UI 确认，
 * 确认后再带 overwrite 覆盖（baseVersion 始终取云端最新版本）。
 * 标签正好打开且是脏的会先静默保存，避免把旧内容推上去。
 */
export async function syncDocumentByPath(
  input: CloudDocSyncByPathInput,
): Promise<CloudSyncResult> {
  if (!isTauriApp()) {
    return { status: 'skipped', message: '当前是 Web 构建，云文档同步仅在 Tauri 桌面端可用。' };
  }

  const filePath = input.filePath;
  const eligibility = isCloudSyncEligibleFile(filePath, null);
  if (!eligibility.eligible) {
    return { status: 'skipped', message: eligibility.reason ?? '当前文档不支持云同步' };
  }

  const context = createSyncContext();
  const openTab = context.tabsStore.tabs.find((item) => item.filePath === filePath) ?? null;
  // 动态引入：cloudSync store 反过来依赖本模块，静态 import 会形成循环。
  const { useCloudSyncStore } = await import('@/stores/cloudSync');
  const cloudSyncStore = useCloudSyncStore();

  try {
    if (openTab?.isDirty) {
      const saved = await context.tabService.saveTab(openTab.id, { silent: true });
      if (!saved) {
        return { status: 'failed', message: '当前文档尚未保存到磁盘，无法同步到云端' };
      }
    }

    const source = await cloudCommands.readSyncSource(filePath, CLOUD_SYNC_MAX_BYTES);
    // 身份优先级：显式 cloudPath → 标签 cloudFileId → 本地路径推导。
    // 跨工作区文档被落到系统临时区后，本地路径反推不出 tau/<workspace>/…，
    // 若仍按本地路径推导，会把「更新同一篇文档」误判成「新建文档」。
    const identity = resolveCloudDocIdentity({
      filePath,
      cloudFileId: input.fileId ?? openTab?.cloudFileId ?? null,
      cloudPath: input.cloudPath ?? null,
      docMap: cloudSyncStore.docMap,
      workspaceName: context.workspaceStore.currentWorkspaceName,
      workspacePath: context.workspaceStore.currentWorkspacePath,
    });
    const cloudPath = identity.cloudPath;

    const remoteOutcome = await findCloudDocByPath(cloudPath);
    if (!remoteOutcome.ok) {
      return { status: 'failed', message: remoteOutcome.message };
    }
    let remote = remoteOutcome.data;
    // 路径查不到但已知 fileId（例如 docMap 里路径被改名过）：按 id 再确认一次，避免误新建
    if (!remote && identity.fileId !== null) {
      const detail = await getCloudDoc(identity.fileId);
      if (detail.ok) {
        remote = detail.data;
      }
    }

    // 基线优先取标签，其次取 docMap（文件没打开时仍然有上次同步的哈希）
    const baseHash = openTab?.cloudContentHash
      ?? cloudSyncStore.docMap[cloudPath]?.contentHash
      ?? null;

    const decision = resolveCloudSyncDecision({
      localHash: source.contentHash,
      remoteHash: remote?.contentHash ?? null,
      baseHash,
    });

    // 只改分类、内容没变：仍然要提交一次「更新」（否则用户选的分类落不了地）。
    // 分类 id 两边都有时只比 id（分类改名不应被当成换了分类）。
    const categoryTouched = input.category !== undefined || input.categoryId !== undefined;
    const localCategoryId = input.categoryId ?? null;
    const remoteCategoryId = remote?.categoryId ?? null;
    const sameCategory = localCategoryId !== null || remoteCategoryId !== null
      ? String(localCategoryId ?? '') === String(remoteCategoryId ?? '')
      : (input.category ?? null) === (remote?.category ?? null);
    const categoryChanged = remote !== null && categoryTouched && !sameCategory;

    if (decision === 'skip' && remote && !categoryChanged) {
      if (openTab) {
        applySyncedMeta(context, openTab.id, {
          fileId: remote.fileId,
          version: remote.version,
          contentHash: remote.contentHash,
        });
      }
      const skipAssets = await syncAssetsAfterSave({
        filePath,
        fileId: remote.fileId,
        content: source.content,
      });
      return {
        status: 'skipped',
        fileId: remote.fileId,
        version: remote.version,
        message: withAssetMessage('已是同步状态（内容与云端一致），无需重复上传', skipAssets),
        assets: skipAssets,
      };
    }

    // 云端已有文档但内容不同（pull/conflict）：先让用户确认覆盖
    if ((decision === 'conflict' || decision === 'pull') && !input.overwrite) {
      return {
        status: 'conflict',
        fileId: remote?.fileId,
        version: remote?.version,
        message: '云端已有该文档且内容不同，确认后会覆盖云端',
      };
    }

    const payload: CloudDocSavePayload = {
      path: cloudPath,
      title: getFileName(filePath),
      content: source.content,
      contentHash: source.contentHash,
      baseVersion: remote ? remote.version : null,
    };
    if (input.category !== undefined) {
      payload.category = input.category;
    }
    if (input.categoryId !== undefined) {
      payload.categoryId = input.categoryId;
    }
    if (input.tags !== undefined) {
      payload.tags = input.tags;
    }
    if (input.visibility !== undefined) {
      payload.visibility = input.visibility;
    }

    const savedOutcome = await saveCloudDoc(payload);
    if (!savedOutcome.ok) {
      return {
        status: savedOutcome.kind === 'conflict' ? 'conflict' : 'failed',
        kind: savedOutcome.kind,
        fileId: remote?.fileId,
        version: remote?.version,
        message: savedOutcome.message,
      };
    }

    if (openTab) {
      applySyncedMeta(context, openTab.id, {
        fileId: savedOutcome.data.fileId,
        version: savedOutcome.data.version,
        contentHash: savedOutcome.data.contentHash,
      });
    }
    cloudSyncStore.rememberDoc(cloudPath, {
      fileId: savedOutcome.data.fileId,
      version: savedOutcome.data.version,
      contentHash: savedOutcome.data.contentHash,
      updatedAt: savedOutcome.data.updatedAt ?? null,
      category: input.category ?? null,
      categoryId: input.categoryId ?? null,
      tags: input.tags ?? null,
      visibility: input.visibility ?? null,
    });
    cloudSyncStore.lastSyncAt = Date.now();

    const savedAssets = await syncAssetsAfterSave({
      filePath,
      fileId: savedOutcome.data.fileId,
      content: source.content,
    });
    return {
      status: 'synced',
      fileId: savedOutcome.data.fileId,
      version: savedOutcome.data.version,
      message: withAssetMessage(remote ? '已更新云端文档' : '已创建云端文档', savedAssets),
      assets: savedAssets,
    };
  } catch (error) {
    const normalized = normalizeCloudError(error);
    return normalized.kind === 'unsupported'
      ? { status: 'skipped', message: normalized.message }
      : { status: 'failed', kind: normalized.kind, message: normalized.message };
  }
}

/**
 * 用云端内容覆盖本地标签（用户显式选择“拉取云端”时使用）。
 * 仍要求标签对应实体文件，且不触碰二进制预览与大文件标签。
 * 标签有未保存修改时必须先由调用方确认（overwriteDirty），否则不落盘。
 */
export async function pullCloudDocumentIntoLocal(
  tabId: string,
  options?: PullCloudDocumentOptions,
): Promise<CloudSyncResult> {
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

  // 未落盘的修改一旦被云端内容覆盖就找不回来：先要求 UI 确认，确认后才会带 overwriteDirty 重试。
  if (tab.isDirty && options?.overwriteDirty !== true) {
    return {
      status: 'skipped',
      needsDirtyConfirm: true,
      message: '当前文档有未保存的修改，用云端内容覆盖会丢弃这些修改',
    };
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
      : { status: 'failed', kind: normalized.kind, message: normalized.message };
  }
}
