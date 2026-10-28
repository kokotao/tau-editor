/**
 * @description 云文档批量上传（R2）：把用户一次多选的本地文件分类成「文本 / 二进制 / 跳过」，
 * 再串行（1 路）推送到云端指定分类。
 *
 * - 文本类走 `cloud_docs_save`（`syncDocumentByPath` 复用三方决策：同哈希跳过、云端有差异记 conflict 不覆盖）；
 * - pdf/office 走二进制上传 `cloud_docs_binary_upload`（请求体只有 category 自由文本，没有 categoryId）；
 * - 图片、宏格式、超限（文本 12MB / 二进制 50MB）文件逐条跳过并给出原因，不阻断队列；
 * - 串行 + 上限 100 个（D6）：云端一次保存产生一个版本，并发只会放大配额与冲突面；
 * - `quota` / `unauthorized` 出现后立即中止队列，避免把剩余文件全刷成失败。
 *
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-28
 */
import { fileCommands } from '@/lib/tauri';
import type { CloudErrorKind } from '@/services/cloudDocService';
import {
  BINARY_DOC_MAX_BYTES,
  isBinaryDocPath,
  isMacroDocPath,
  uploadBinaryDocument,
  validateBinaryDocLocal,
} from '@/services/cloudBinaryService';
import {
  CLOUD_SYNC_MAX_BYTES,
  isCloudSyncEligibleFile,
  resolveCloudDocPathForFile,
  syncDocumentByPath,
} from '@/services/cloudSyncService';
import { isTextDocPath, unsupportedTextReason } from '@/services/cloudUploadPolicy';
import { isImageFilePath } from '@/utils/fileTypes';

/** 单次批量上传的文件数上限（D6）；超出部分先提示再截断。 */
export const BATCH_UPLOAD_MAX_FILES = 100;

/** 计划项类型：text/binary 会上传，skipped 只带原因。 */
export type BatchUploadKind = 'text' | 'binary' | 'skipped';

/** 跳过原因：UI 用 `uploadReasonUnsupported` / `uploadReasonTooLarge` 展示。 */
export type BatchUploadSkipReason = 'unsupported' | 'too-large';

/** 列表逐条状态。 */
export type BatchUploadItemStatus = 'pending' | 'uploading' | 'done' | 'skipped' | 'failed';

/** 上传目标：右键的那个分类节点。 */
export interface BatchUploadTarget {
  /** `cat:<id>` 的真实分类 id；`group:uncategorized` / `custom:<名称>` 为 null */
  categoryId: string | null;
  /** 分类自由文本；未分类为 null（避免造出假的「未分类」聚合分组） */
  categoryName: string | null;
  workspaceName: string | null;
  workspacePath: string | null;
}

/** 待分类的本地文件（大小由 `fileCommands.getFileInfo` 补齐，纯函数只消费它）。 */
export interface BatchUploadFileEntry {
  path: string;
  size?: number | null;
}

export interface UploadPlanItem {
  localPath: string;
  fileName: string;
  kind: BatchUploadKind;
  /** kind=skipped 时的原因码 */
  reason?: BatchUploadSkipReason;
  /** kind=skipped 时的服务层原始说明（日志/排查用） */
  detail?: string;
  /** 本地文件大小；探测失败为 null */
  size: number | null;
}

/** 列表行 = 计划项 + 运行时状态 + 结果文案。 */
export interface BatchUploadRow extends UploadPlanItem {
  status: BatchUploadItemStatus;
  message?: string;
}

export interface BatchUploadItemResult {
  status: 'done' | 'skipped' | 'failed';
  kind?: CloudErrorKind;
  message?: string;
  fileId?: number;
}

export interface BatchUploadSummary {
  /** 计划项总数（含一开始就跳过的） */
  total: number;
  ok: number;
  skipped: number;
  failed: number;
  /** 是否因为配额/登录失效/用户中止而提前结束 */
  aborted: boolean;
}

export interface BatchUploadCallbacks {
  /** 用户点了「中止上传」：每项开始前检查 */
  isCancelled?: () => boolean;
  /** 某一项开始上传（UI 把状态切到 uploading） */
  onItemStart?: (index: number) => void;
  /** 某一项结束（done/skipped/failed） */
  onItem?: (index: number, result: BatchUploadItemResult) => void;
}

/** 取路径末段作为文件名（Windows 反斜杠也认）。 */
export function fileNameOf(filePath: string): string {
  return (filePath ?? '').replace(/\\/g, '/').split('/').pop() ?? '';
}

/**
 * 明确不是「可编辑文本」的扩展名：可执行文件、压缩包、媒体、字体。
 * `isCloudSyncEligibleFile` 只按「二进制预览」判断，`.exe` / `.zip` 会漏网，
 * 这里显式挡掉，保证 D4 的「可执行文件跳过并给出原因」。
 */
const NON_TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  // 可执行 / 安装包 / 库
  'exe', 'msi', 'msix', 'dll', 'so', 'dylib', 'bin', 'app', 'apk', 'dmg', 'deb', 'rpm', 'iso', 'jar', 'com',
  // 压缩包
  'zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst',
  // 音视频
  'mp3', 'mp4', 'wav', 'flac', 'ogg', 'm4a', 'avi', 'mkv', 'mov', 'webm', 'wmv',
  // 字体
  'ttf', 'otf', 'woff', 'woff2', 'eot',
]);

/** 小写扩展名（不含点）；无扩展名返回空串。 */
function extensionOf(filePath: string): string {
  const name = fileNameOf(filePath);
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(index + 1).toLowerCase() : '';
}

/** 图片（含 svg）与可执行/压缩/媒体/字体：都不进云端文本文档。 */
function isNonTextFile(filePath: string): boolean {
  return isImageFilePath(filePath) || NON_TEXT_EXTENSIONS.has(extensionOf(filePath));
}

function tooLargeDetail(maxBytes: number): string {
  return `文件超过 ${Math.round(maxBytes / (1024 * 1024))} MB 上限`;
}

/**
 * 单个文件的归类（纯函数）：
 * 二进制白名单（pdf/office）→ binary；其余走云同步白名单 → text；不满足就给跳过原因。
 * 图片、可执行文件、宏格式、超限文件都在这里被挡掉（D4）。
 */
export function classifyUploadFile(entry: BatchUploadFileEntry): UploadPlanItem {
  const localPath = entry.path ?? '';
  const fileName = fileNameOf(localPath);
  const size = typeof entry.size === 'number' && Number.isFinite(entry.size) ? entry.size : null;
  const base = { localPath, fileName, size };

  if (!fileName) {
    return { ...base, kind: 'skipped', reason: 'unsupported', detail: '文件路径为空' };
  }

  // 二进制通道：pdf/doc/docx/xls/xlsx/ppt/pptx（含宏格式与 50MB 上限校验）
  if (isBinaryDocPath(localPath)) {
    const eligibility = validateBinaryDocLocal(localPath, size);
    if (!eligibility.eligible) {
      const tooLarge = size !== null && size > BINARY_DOC_MAX_BYTES;
      return {
        ...base,
        kind: 'skipped',
        reason: tooLarge ? 'too-large' : 'unsupported',
        detail: eligibility.reason,
      };
    }
    return { ...base, kind: 'binary' };
  }

  // 宏格式（docm/xlsm/pptm…）安全策略直接拒绝
  if (isMacroDocPath(localPath)) {
    const eligibility = validateBinaryDocLocal(localPath, size);
    return { ...base, kind: 'skipped', reason: 'unsupported', detail: eligibility.reason };
  }

  // 图片 / 可执行文件 / 压缩包 / 媒体 / 字体：不进云端文本文档（D4）
  if (isNonTextFile(localPath)) {
    return {
      ...base,
      kind: 'skipped',
      reason: 'unsupported',
      detail: '图片、可执行文件、压缩包等不支持上传到云端文档',
    };
  }

  // 文本白名单与后端逐项对齐（`cloudUploadPolicy`）：后端 `validateTextFile` 只认 51 项扩展名，
  // 无扩展名（Makefile）与 `.svelte`/`.lua` 这类都会 400。这里前置跳过，把它算进「跳过」而不是「失败」。
  if (!isTextDocPath(localPath)) {
    return { ...base, kind: 'skipped', reason: 'unsupported', detail: unsupportedTextReason(localPath) };
  }

  // 文本通道：与云同步共用 12MB 上限
  if (size !== null && size > CLOUD_SYNC_MAX_BYTES) {
    return { ...base, kind: 'skipped', reason: 'too-large', detail: tooLargeDetail(CLOUD_SYNC_MAX_BYTES) };
  }
  const textEligibility = isCloudSyncEligibleFile(localPath, null);
  if (!textEligibility.eligible) {
    return { ...base, kind: 'skipped', reason: 'unsupported', detail: textEligibility.reason };
  }
  return { ...base, kind: 'text' };
}

/** 批量归类（纯函数，可单测）：上限之外的条目由调用方先截断。 */
export function planBatchUpload(entries: BatchUploadFileEntry[]): UploadPlanItem[] {
  return entries.map((entry) => classifyUploadFile(entry));
}

/**
 * 收集文件大小后生成上传计划：`fileCommands.getFileInfo` 逐个探测。
 * 探测失败（文件已被删除/无权限）不阻断队列，按扩展名归类，让逐条结果说明问题。
 */
export async function collectBatchUploadPlan(paths: string[]): Promise<UploadPlanItem[]> {
  const limited = paths.slice(0, BATCH_UPLOAD_MAX_FILES);
  const entries: BatchUploadFileEntry[] = [];
  for (const path of limited) {
    let size: number | null = null;
    try {
      const info = await fileCommands.getFileInfo(path);
      if (typeof info.size === 'number' && Number.isFinite(info.size)) {
        size = info.size;
      }
    } catch (error) {
      console.warn('[cloud-upload] 读取文件大小失败', { path, error });
    }
    entries.push({ path, size });
  }
  return planBatchUpload(entries);
}

/** 文本类：走云同步的三方决策；conflict 视为「已存在，未覆盖」（skipped），不是失败。 */
async function uploadTextItem(
  item: UploadPlanItem,
  target: BatchUploadTarget,
): Promise<BatchUploadItemResult> {
  const cloudPath = resolveCloudDocPathForFile(
    item.localPath,
    target.workspaceName,
    target.workspacePath,
  );
  const outcome = await syncDocumentByPath({
    filePath: item.localPath,
    cloudPath,
    category: target.categoryName,
    categoryId: target.categoryId,
  });
  if (outcome.status === 'synced') {
    return { status: 'done', fileId: outcome.fileId, message: outcome.message };
  }
  if (outcome.status === 'conflict') {
    return { status: 'skipped', kind: 'conflict', message: outcome.message };
  }
  if (outcome.status === 'skipped') {
    return { status: 'skipped', message: outcome.message };
  }
  return { status: 'failed', kind: outcome.kind, message: outcome.message };
}

/** 二进制类：pdf/office 走 multipart 上传（云端路径仍按 tau/<workspace>/<rel> 生成）。 */
async function uploadBinaryItem(
  item: UploadPlanItem,
  target: BatchUploadTarget,
): Promise<BatchUploadItemResult> {
  const cloudPath = resolveCloudDocPathForFile(
    item.localPath,
    target.workspaceName,
    target.workspacePath,
  );
  const outcome = await uploadBinaryDocument(
    {
      cloudPath,
      localPath: item.localPath,
      title: item.fileName,
      category: target.categoryName,
    },
    { fileSize: item.size },
  );
  if (outcome.ok) {
    return { status: 'done', fileId: outcome.data.fileId };
  }
  if (outcome.kind === 'conflict') {
    return { status: 'skipped', kind: 'conflict', message: outcome.message };
  }
  return { status: 'failed', kind: outcome.kind, message: outcome.message };
}

/** 立刻中止队列的错误类型：配额打满、登录失效，继续跑只会把剩余文件全刷成失败。 */
function shouldAbort(kind: CloudErrorKind | undefined): boolean {
  return kind === 'quota' || kind === 'unauthorized';
}

/**
 * 串行执行上传计划（1 路），逐条回调状态。
 *
 * 中止条件（D6）：用户点中止（`isCancelled`）、或某条返回 `quota`/`unauthorized`。
 * 单条失败不中断队列——汇总里逐条可查。
 */
export async function runBatchUpload(
  items: UploadPlanItem[],
  target: BatchUploadTarget,
  callbacks: BatchUploadCallbacks = {},
): Promise<BatchUploadSummary> {
  let ok = 0;
  let skipped = 0;
  let failed = 0;
  let aborted = false;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] as UploadPlanItem;
    if (callbacks.isCancelled?.()) {
      aborted = true;
      break;
    }

    if (item.kind === 'skipped') {
      skipped += 1;
      callbacks.onItem?.(index, {
        status: 'skipped',
        kind: 'unsupported',
        message: item.detail,
      });
      continue;
    }

    callbacks.onItemStart?.(index);
    const result = item.kind === 'binary'
      ? await uploadBinaryItem(item, target)
      : await uploadTextItem(item, target);

    if (result.status === 'done') {
      ok += 1;
    } else if (result.status === 'skipped') {
      skipped += 1;
    } else {
      failed += 1;
    }
    callbacks.onItem?.(index, result);

    if (result.status === 'failed' && shouldAbort(result.kind)) {
      aborted = true;
      break;
    }
  }

  return { total: items.length, ok, skipped, failed, aborted };
}
