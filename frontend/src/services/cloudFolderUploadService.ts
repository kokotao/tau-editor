/**
 * @description 工作区文件夹右键「上传该文件夹到云端」(R3)：
 * ① 递归收集（跳过构建/依赖目录与隐藏项，深度/文件数双上限，文本 12MB、二进制 50MB、扩展名白名单）；
 * ② 以文件夹名为云端分类（新建成功即用 → 失败/重名复用同名分类 → 再不行退化为自由文本分类）；
 * ③ 串行上传（文本走 syncDocumentByPath，二进制走 uploadBinaryDocument），逐条进度与汇总，
 * 遇到 quota / unauthorized 立即中止队列。
 * 云端没有「目录」实体，能表达「一组文件」的只有分类，因此整目录同步 = 一个分类 + 该目录下的文件。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-28 15:45
 */
import { fileCommands, type FileEntry } from '@/lib/tauri';
import {
  BINARY_DOC_MAX_BYTES,
  isBinaryDocPath,
  isMacroDocPath,
  uploadBinaryDocument,
  validateBinaryDocLocal,
} from '@/services/cloudBinaryService';
import {
  createCategory,
  fetchManagedCategories,
  flattenCategoryTree,
} from '@/services/cloudCategoryService';
import type { CloudErrorKind } from '@/services/cloudDocService';
import type { CloudAssetSyncSummary } from '@/services/cloudAssetService';
import {
  CLOUD_SYNC_MAX_BYTES,
  resolveCloudDocPathForFile,
  syncDocumentByPath,
} from '@/services/cloudSyncService';
import {
  isTextDocPath,
  unsupportedTextReason,
} from '@/services/cloudUploadPolicy';
import { isImageFilePath } from '@/utils/fileTypes';
import { useWorkspaceStore } from '@/stores/workspace';

/** 递归深度上限：再深的目录视为异常结构，直接跳过（避免误传整棵依赖树）。 */
export const FOLDER_UPLOAD_MAX_DEPTH = 8;
/** 单次上传的文件数上限（串行队列，云端一次保存产生一个版本，过多只会放大配额与冲突面）。 */
export const FOLDER_UPLOAD_MAX_FILES = 500;

/** 一律跳过的构建/依赖目录（不区分大小写）。 */
export const SKIP_DIR_NAMES: readonly string[] = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  '.idea',
  '.vscode',
  '__pycache__',
  '.next',
  'coverage',
  'out',
  '.turbo',
];

/**
 * 可上传为「云文档（文本）」的扩展名白名单。
 *
 * 唯一事实来源已抽到 `cloudUploadPolicy`（与后端 `CloudDocPathValidator.TEXT_EXTENSIONS` 逐项对齐），
 * 这里保留同名导出只是为了兼容既有引用；新增判断请直接用 `isTextDocPath`。
 */
export { TEXT_DOC_EXTENSIONS as TEXT_FILE_EXTENSIONS } from '@/services/cloudUploadPolicy';

/** `.` 开头的隐藏文件/目录（`.git`、`.env`、`.next`…）。 */
export function isHiddenName(name: string): boolean {
  return (name ?? '').trim().startsWith('.');
}

/**
 * 收集阶段就该跳过的条目：
 * - 空名、`.` 开头的隐藏项；
 * - 目录名命中 SKIP_DIR_NAMES（node_modules / dist / target…）。
 * 纯函数，便于单测覆盖跳过规则。
 */
export function shouldSkipEntry(name: string, isDir: boolean): boolean {
  const trimmed = (name ?? '').trim();
  if (!trimmed) {
    return true;
  }
  if (isHiddenName(trimmed)) {
    return true;
  }
  return isDir && SKIP_DIR_NAMES.includes(trimmed.toLowerCase());
}

/** 可上传文件的归类：文本走云文档保存，二进制走 multipart 上传。 */
export type FolderFileKind = 'text' | 'binary';

export interface FolderFileDecision {
  /** 可上传时的通道；null 表示跳过 */
  kind: FolderFileKind | null;
  /** 跳过原因（可读，直接展示在弹窗跳过清单里） */
  skipReason: string | null;
}

function formatMegabytes(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

/**
 * 单文件归类（纯函数）：
 * 宏格式拒绝 → 二进制白名单 → 图片跳过 → 文本扩展名白名单 → 体积上限。
 */
export function classifyFolderFile(
  filePath: string,
  fileSize?: number | null,
  limits: { textMaxBytes?: number; binaryMaxBytes?: number } = {},
): FolderFileDecision {
  const textMaxBytes = limits.textMaxBytes ?? CLOUD_SYNC_MAX_BYTES;
  const binaryMaxBytes = limits.binaryMaxBytes ?? BINARY_DOC_MAX_BYTES;
  const size = typeof fileSize === 'number' && Number.isFinite(fileSize) ? fileSize : null;

  // 宏格式即使扩展名在白名单外也必须先拒绝，给出比「不支持的类型」更具体的原因
  if (isMacroDocPath(filePath)) {
    return { kind: null, skipReason: '不支持含宏的 Office 文件（docm/xlsm/pptm）' };
  }

  if (isBinaryDocPath(filePath)) {
    const eligibility = validateBinaryDocLocal(filePath, size);
    if (!eligibility.eligible) {
      return { kind: null, skipReason: eligibility.reason ?? '该文件不支持云端二进制上传' };
    }
    if (size !== null && size > binaryMaxBytes) {
      return { kind: null, skipReason: `文件超过 ${formatMegabytes(binaryMaxBytes)} MB 上限` };
    }
    return { kind: 'binary', skipReason: null };
  }

  if (isImageFilePath(filePath)) {
    // 图片本身不是云文档（后端二进制白名单只有 pdf/office）：它们只能作为
    // Markdown 的「文档附件」跟着 md 一起同步，所以这里跳过并说明清楚，避免用户以为漏传。
    return { kind: null, skipReason: '图片会随引用的 Markdown 作为附件上传，不单独作为云文档' };
  }

  // 文本白名单与后端逐项对齐（`cloudUploadPolicy`）：后端 `validateTextFile` 只认这 51 项，
  // 无扩展名（Makefile / LICENSE / .env）同样会被 400 拒绝，这里提前跳过并给可读原因，
  // 避免它们先显示「将上传」、再逐条变成「失败」。
  if (!isTextDocPath(filePath)) {
    return { kind: null, skipReason: unsupportedTextReason(filePath) };
  }

  if (size !== null && size > textMaxBytes) {
    return { kind: null, skipReason: `文件超过 ${formatMegabytes(textMaxBytes)} MB 上限` };
  }

  return { kind: 'text', skipReason: null };
}

/** 待上传文件（收集结果）。 */
export interface FolderFileEntry {
  /** 本地绝对路径 */
  path: string;
  /** 相对收集根目录的路径（统一用 `/`，用于展示） */
  relativePath: string;
  name: string;
  /** 文件体积（无法获取时为 null，交给 Rust 侧再校验一次） */
  size: number | null;
  kind: FolderFileKind;
}

/** 被跳过的条目（目录本身或文件），带可读原因。 */
export interface FolderSkipEntry {
  path: string;
  relativePath: string;
  name: string;
  /** 该条目是目录（目录跳过通常是构建/依赖目录或层级超限） */
  isDirectory: boolean;
  reason: string;
}

export interface CollectFolderResult {
  files: FolderFileEntry[];
  skipped: FolderSkipEntry[];
  /** 是否因为文件数/层级上限被截断（结果不完整） */
  truncated: boolean;
  /** 截断原因（truncated 时有值，直接展示给用户） */
  truncatedReason: string | null;
}

export interface CollectFolderOptions {
  maxDepth?: number;
  maxFiles?: number;
  textMaxBytes?: number;
  binaryMaxBytes?: number;
}

/** 拼接本地路径：沿用根路径的分隔符，避免 Windows 混用 `/` 与 `\`。 */
function joinLocalPath(dir: string, name: string): string {
  if (dir.endsWith('/') || dir.endsWith('\\')) {
    return `${dir}${name}`;
  }
  const separator = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
  return `${dir}${separator}${name}`;
}

function toRelativePath(relDir: string, name: string): string {
  return relDir ? `${relDir}/${name}` : name;
}

/**
 * 递归收集文件夹下可上传的文件。
 *
 * - 目录/隐藏项按 shouldSkipEntry 跳过，并记录原因；
 * - 文件按 classifyFolderFile 归类，不可上传的同样进 skipped；
 * - 文件数超过 maxFiles 时截断（truncated=true）；目录层级超过 maxDepth 时跳过该目录并标记截断；
 * - 单个目录读取失败只记录跳过，不中断整体收集。
 */
export async function collectFolderFiles(
  rootPath: string,
  options: CollectFolderOptions = {},
): Promise<CollectFolderResult> {
  const maxDepth = options.maxDepth ?? FOLDER_UPLOAD_MAX_DEPTH;
  const maxFiles = options.maxFiles ?? FOLDER_UPLOAD_MAX_FILES;
  const limits = {
    textMaxBytes: options.textMaxBytes,
    binaryMaxBytes: options.binaryMaxBytes,
  };

  const files: FolderFileEntry[] = [];
  const skipped: FolderSkipEntry[] = [];
  let truncated = false;
  let truncatedReason: string | null = null;
  /** 仅文件数上限会硬停整个收集 */
  let hardStop = false;

  const walk = async (dir: string, relDir: string, depth: number): Promise<void> => {
    if (hardStop) {
      return;
    }

    let entries: FileEntry[];
    try {
      entries = await fileCommands.listFiles(dir);
    } catch {
      skipped.push({
        path: dir,
        relativePath: relDir,
        name: relDir.split('/').pop() || dir,
        isDirectory: true,
        reason: '无法读取目录',
      });
      return;
    }

    // 目录项顺序由文件系统决定，排序后进度与跳过清单才稳定可复现
    const sorted = [...entries].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

    for (const entry of sorted) {
      if (hardStop) {
        return;
      }
      const isDirectory = entry.type === 'folder';
      const relativePath = toRelativePath(relDir, entry.name);

      if (shouldSkipEntry(entry.name, isDirectory)) {
        skipped.push({
          path: entry.path || joinLocalPath(dir, entry.name),
          relativePath,
          name: entry.name,
          isDirectory,
          reason: isHiddenName(entry.name) ? '隐藏项' : '构建或依赖目录',
        });
        continue;
      }

      if (isDirectory) {
        if (depth + 1 > maxDepth) {
          truncated = true;
          truncatedReason = truncatedReason ?? `目录层级超过 ${maxDepth} 层上限`;
          skipped.push({
            path: entry.path || joinLocalPath(dir, entry.name),
            relativePath,
            name: entry.name,
            isDirectory: true,
            reason: `目录层级超过 ${maxDepth} 层上限`,
          });
          continue;
        }
        await walk(entry.path || joinLocalPath(dir, entry.name), relativePath, depth + 1);
        continue;
      }

      const localPath = entry.path || joinLocalPath(dir, entry.name);
      const size = typeof entry.size === 'number' && Number.isFinite(entry.size) ? entry.size : null;
      const decision = classifyFolderFile(localPath, size, limits);
      if (!decision.kind) {
        skipped.push({
          path: localPath,
          relativePath,
          name: entry.name,
          isDirectory: false,
          reason: decision.skipReason ?? '不支持上传',
        });
        continue;
      }

      if (files.length >= maxFiles) {
        truncated = true;
        truncatedReason = truncatedReason ?? `文件数超过 ${maxFiles} 个上限，已截断`;
        hardStop = true;
        return;
      }

      files.push({ path: localPath, relativePath, name: entry.name, size, kind: decision.kind });
    }
  };

  await walk(rootPath, '', 1);

  return { files, skipped, truncated, truncatedReason };
}

/** 文件夹 → 云端分类的落地结果。 */
export interface FolderCategoryTarget {
  /** 自由文本分类名（二进制上传只有 category，文本保存也用它兜底） */
  category: string | null;
  /** 真实分类 id；为 null 说明只能退化成自由文本分类 */
  categoryId: string | null;
  /** 是否本次新建 */
  created: boolean;
  /** 分类落地说明 / 退化原因（展示在弹窗里，null 表示无话可说） */
  note: string | null;
}

/**
 * 以文件夹名为云端分类：
 * 1. createCategory 成功即用；
 * 2. 失败（多为同名 409）→ fetchManagedCategories 里找同名分类复用；
 * 3. 仍然拿不到 → 退化为自由文本 category（文档照样归到「文件夹名」这个分类名下）。
 */
export async function ensureCategoryForFolder(folderName: string): Promise<FolderCategoryTarget> {
  const name = (folderName ?? '').trim();
  if (!name) {
    return { category: null, categoryId: null, created: false, note: '文件夹名为空，本次不指定云端分类' };
  }

  const created = await createCategory(name);
  if (created.ok) {
    return {
      category: created.data.name?.trim() || name,
      categoryId: created.data.id ? String(created.data.id) : null,
      created: true,
      note: null,
    };
  }

  // 新建失败：最可能是同名分类已存在（409），查一遍现有分类树复用同名的那个
  const listed = await fetchManagedCategories();
  if (listed.ok) {
    const matched = flattenCategoryTree(listed.data).find((row) => row.name.trim() === name);
    if (matched) {
      return { category: matched.name, categoryId: matched.id, created: false, note: '已复用同名云端分类' };
    }
  }

  return {
    category: name,
    categoryId: null,
    created: false,
    note: created.message || '未能创建云端分类，已按分类名归入',
  };
}

/** 单条上传结果状态。 */
export type FolderUploadItemStatus = 'uploaded' | 'unchanged' | 'conflict' | 'skipped' | 'failed';

/**
 * 整目录上传期间「Markdown 图片附件」的聚合汇总。
 * 图片走的是「文档附件」通道（跟着 md 一起同步），所以不会出现在逐条文件结果里，
 * 必须单独汇总，否则用户只会看到「图片没上传」却没有任何解释。
 */
export interface FolderUploadAssetsSummary {
  /** 可同步的相对图片引用总数（不含 unsupported） */
  total: number;
  /** 新上传/变更 */
  uploaded: number;
  /** 云端已是同一张，跳过 */
  unchanged: number;
  failed: number;
  /** 本地不合规被跳过（不存在 / 超 20MB / 魔数不对） */
  skipped: number;
  /** 引用本身不可能同步的处数（外链 / 绝对路径 / `..` 跨目录 / 格式不支持） */
  unsupported: number;
  /** 设置里关掉了「同步 Markdown 图片附件」 */
  disabled: boolean;
}

/** 空汇总（没有 md、或没有图片引用时的默认值）。 */
export function emptyFolderAssetsSummary(): FolderUploadAssetsSummary {
  return { total: 0, uploaded: 0, unchanged: 0, failed: 0, skipped: 0, unsupported: 0, disabled: false };
}

/** 图片附件的「成功」口径：新上传 + 云端已是最新（两者都不需要用户再处理）。 */
export function folderAssetsOk(assets: FolderUploadAssetsSummary | null | undefined): number {
  return assets ? assets.uploaded + assets.unchanged : 0;
}

/**
 * 是否有图片附件的「计数」需要展示（total / failed / skipped）。
 * - `unsupported` 是「引用压根不同步」，由调用方单独一行展示（此时 total 往往还是 0，
 *   展示「已同步 0 张」只会是噪声）；
 * - 「设置里关掉了图片同步」同样不算计数，由调用方单独提示。
 */
export function shouldShowFolderAssets(assets: FolderUploadAssetsSummary | null | undefined): boolean {
  if (!assets) {
    return false;
  }
  return assets.total > 0 || assets.failed > 0 || assets.skipped > 0;
}

/** 把单条文档的图片汇总累加进整目录汇总（纯累加，不做格式化）。 */
function accumulateFolderAssets(
  target: FolderUploadAssetsSummary,
  assets: CloudAssetSyncSummary | undefined,
): void {
  if (!assets) {
    return;
  }
  target.total += assets.total;
  target.uploaded += assets.uploaded;
  target.unchanged += assets.unchanged;
  target.failed += assets.failed;
  target.skipped += assets.skipped;
  target.unsupported += assets.unsupported;
  if (assets.disabled) {
    target.disabled = true;
  }
}

export interface FolderUploadResultItem {
  path: string;
  relativePath: string;
  name: string;
  kind: FolderFileKind;
  status: FolderUploadItemStatus;
  /** 一行可读结论 */
  message: string;
  /** 服务端/服务层的原始说明（悬停可见，便于排查） */
  detail?: string;
  /** 文本文件同步时夹带的图片附件汇总（非 md/失败时没有） */
  assets?: CloudAssetSyncSummary;
}

export interface FolderUploadSummary {
  /** 计划上传的文件总数（不含 collect 阶段跳过的） */
  total: number;
  /** 新上传成功 */
  uploaded: number;
  /** 云端已是最新，无需上传 */
  unchanged: number;
  /** 本轮按规则跳过（Rust 侧 unsupported 等） */
  skipped: number;
  /** 云端已存在且内容不同 → 默认不覆盖 */
  conflict: number;
  failed: number;
  /** 队列是否被中止（配额/登录失效/用户取消） */
  aborted: boolean;
  abortKind: CloudErrorKind | null;
  abortMessage: string | null;
  category: FolderCategoryTarget;
  /** 图片附件（Markdown 相对图片）聚合汇总 */
  assets: FolderUploadAssetsSummary;
  items: FolderUploadResultItem[];
}

export interface RunFolderUploadInput {
  /** 收集根目录（本地绝对路径） */
  rootPath: string;
  /** 文件夹名 → 云端分类名 */
  folderName: string;
  files: FolderFileEntry[];
}

export interface FolderUploadCallbacks {
  /** 分类落地后回调（新建/复用/退化三种情况都能提示到用户） */
  onCategoryReady?: (target: FolderCategoryTarget) => void;
  /** 每完成一个文件回调一次：done 为已完成数量（1..total） */
  onProgress?: (done: number, total: number, item: FolderUploadResultItem) => void;
}

export interface RunFolderUploadOptions {
  workspaceName?: string | null;
  workspacePath?: string | null;
  /** 用户取消 / 组件卸载时置为 aborted，队列在下一个文件前停下 */
  signal?: AbortSignal;
}

/** 未显式传入工作区信息时，回落到当前工作区 store（与「同步至云端」同一套路径规则）。 */
function resolveWorkspaceHint(options: RunFolderUploadOptions): { name: string | null; path: string | null } {
  if (options.workspaceName !== undefined || options.workspacePath !== undefined) {
    return { name: options.workspaceName ?? null, path: options.workspacePath ?? null };
  }
  const workspaceStore = useWorkspaceStore();
  return {
    name: workspaceStore.currentWorkspaceName ?? null,
    path: workspaceStore.currentWorkspacePath ?? null,
  };
}

/**
 * 串行上传收集到的文件。
 *
 * - 文本：`syncDocumentByPath({ filePath, category, categoryId })`，conflict ⇒「已存在，未覆盖」；
 * - 二进制：`uploadBinaryDocument({ cloudPath, localPath, title, category })`；
 * - `quota` / `unauthorized` 立即中止队列（继续只会把配额与登录问题放大）；
 * - 单条失败不影响后续条目，汇总里逐条可查。
 */
export async function runFolderUpload(
  input: RunFolderUploadInput,
  callbacks: FolderUploadCallbacks = {},
  options: RunFolderUploadOptions = {},
): Promise<FolderUploadSummary> {
  const files = input.files ?? [];
  const total = files.length;

  const summary: FolderUploadSummary = {
    total,
    uploaded: 0,
    unchanged: 0,
    skipped: 0,
    conflict: 0,
    failed: 0,
    aborted: false,
    abortKind: null,
    abortMessage: null,
    category: { category: null, categoryId: null, created: false, note: null },
    assets: emptyFolderAssetsSummary(),
    items: [],
  };

  /** 统一把一条结果记进汇总 */
  const record = (item: FolderUploadResultItem, done: number): void => {
    summary.items.push(item);
    if (item.status === 'uploaded') summary.uploaded += 1;
    else if (item.status === 'unchanged') summary.unchanged += 1;
    else if (item.status === 'conflict') summary.conflict += 1;
    else if (item.status === 'skipped') summary.skipped += 1;
    else summary.failed += 1;
    // 图片附件是「跟着 md 走的」，逐条文件结果里看不到，只能在这里累加
    accumulateFolderAssets(summary.assets, item.assets);
    callbacks.onProgress?.(done, total, item);
  };

  const abortWith = (kind: CloudErrorKind | null, message: string): void => {
    summary.aborted = true;
    summary.abortKind = kind;
    summary.abortMessage = message;
  };

  if (total === 0) {
    return summary;
  }

  // 二进制上传要自己拼云路径，工作区信息按需解析（空列表时不碰 store）
  const workspace = resolveWorkspaceHint(options);

  // 分类先落地：整目录共用同一个分类，避免每个文件各自建分类。
  // 分类是「锦上添花」的一步：任何意外异常都不能挡住文件上传，退化成自由文本即可。
  let category: FolderCategoryTarget;
  try {
    category = await ensureCategoryForFolder(input.folderName);
  } catch (error) {
    category = {
      category: (input.folderName ?? '').trim() || null,
      categoryId: null,
      created: false,
      note: error instanceof Error ? error.message : String(error),
    };
  }
  summary.category = category;
  callbacks.onCategoryReady?.(category);

  /** abortKind 有值 ⇒ 该条结果要求中止整个队列 */
  const runText = async (file: FolderFileEntry): Promise<{ item: FolderUploadResultItem; abortKind: CloudErrorKind | null }> => {
    const result = await syncDocumentByPath({
      filePath: file.path,
      category: category.category,
      // categoryId 为 null 时不传，避免把「只改分类」的判定误触发成一次覆盖更新
      ...(category.categoryId ? { categoryId: category.categoryId } : {}),
    });
    // 图片附件（md 相对图片）的同步结果夹在 CloudSyncResult.assets 里，挂到逐条结果上供汇总
    const assetPatch = result.assets ? { assets: result.assets } : {};

    if (result.status === 'synced') {
      return {
        item: { ...pickFile(file), ...assetPatch, status: 'uploaded', message: '已上传', detail: result.message },
        abortKind: null,
      };
    }
    if (result.status === 'skipped') {
      return {
        item: {
          ...pickFile(file),
          ...assetPatch,
          status: 'unchanged',
          message: '云端已是最新，未重复上传',
          detail: result.message,
        },
        abortKind: null,
      };
    }
    if (result.status === 'conflict') {
      return {
        item: {
          ...pickFile(file),
          ...assetPatch,
          status: 'conflict',
          message: '云端已存在且内容不同，未覆盖',
          detail: result.message,
        },
        abortKind: null,
      };
    }
    return {
      item: {
        ...pickFile(file),
        ...assetPatch,
        status: 'failed',
        message: result.message || '上传失败',
        detail: result.message,
      },
      abortKind: result.kind === 'quota' || result.kind === 'unauthorized' ? result.kind : null,
    };
  };

  const runBinary = async (file: FolderFileEntry): Promise<{ item: FolderUploadResultItem; abortKind: CloudErrorKind | null }> => {
    const cloudPath = resolveCloudDocPathForFile(file.path, workspace.name, workspace.path);
    const outcome = await uploadBinaryDocument(
      {
        cloudPath,
        localPath: file.path,
        title: file.name,
        category: category.category,
      },
      { fileSize: file.size },
    );

    if (outcome.ok) {
      return {
        item: { ...pickFile(file), status: 'uploaded', message: '已上传', detail: `v${outcome.data.version}` },
        abortKind: null,
      };
    }
    const status: FolderUploadItemStatus = outcome.kind === 'conflict'
      ? 'conflict'
      : outcome.kind === 'unsupported'
        ? 'skipped'
        : 'failed';
    return {
      item: {
        ...pickFile(file),
        status,
        message: outcome.message || '上传失败',
        detail: outcome.message,
      },
      abortKind: outcome.kind === 'quota' || outcome.kind === 'unauthorized' ? outcome.kind : null,
    };
  };

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]!;
    if (options.signal?.aborted) {
      abortWith(null, '上传已取消');
      break;
    }

    let outcome: { item: FolderUploadResultItem; abortKind: CloudErrorKind | null };
    try {
      outcome = file.kind === 'binary' ? await runBinary(file) : await runText(file);
    } catch (error) {
      // 服务层通常自己兜住异常，这里只是兜底：单条异常不能打断整个队列
      outcome = {
        item: {
          ...pickFile(file),
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
        },
        abortKind: null,
      };
    }

    record(outcome.item, index + 1);

    if (outcome.abortKind) {
      abortWith(outcome.abortKind, outcome.item.message);
      break;
    }
  }

  return summary;
}

/** 结果条目只保留文件描述字段，避免把内部字段带到 UI。 */
function pickFile(file: FolderFileEntry): Pick<FolderUploadResultItem, 'path' | 'relativePath' | 'name' | 'kind'> {
  return {
    path: file.path,
    relativePath: file.relativePath,
    name: file.name,
    kind: file.kind,
  };
}
