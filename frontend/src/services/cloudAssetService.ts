/**
 * @description Markdown 相对图片附件同步：引用解析、本地探测、只传变更、并发上传、失败汇总与拉取补图。
 * 字节与文件系统操作都在 Rust 侧（cloud_inspect_asset_sources / cloud_docs_asset_upload_file / cloud_docs_asset_download），
 * 这里只做纯逻辑编排，便于单测。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 17:55
 */
import {
  cloudCommands,
  isTauriApp,
  type CloudAssetInfo,
  type CloudAssetSourceInfo,
} from '@/lib/tauri';
import { normalizeCloudError } from '@/services/cloudDocService';

/** 单张图片上限（与后端契约一致）。 */
export const CLOUD_ASSET_MAX_BYTES = 20 * 1024 * 1024;
/** 并发上传上限。 */
export const CLOUD_ASSET_CONCURRENCY = 3;
/** 允许的图片扩展名。 */
export const CLOUD_ASSET_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'] as const;

export interface MarkdownImageRef {
  /** 原始引用文本（用于提示） */
  raw: string;
  /** 规范化后的相对路径（已解码、去掉 ./） */
  relPath: string;
  /** 本地绝对路径（解析后） */
  localPath: string;
}

export interface CloudAssetUploadFailure {
  relPath: string;
  reason: string;
}

export interface CloudAssetSyncSummary {
  /** 文档里引用的相对图片总数（不合规的也算在内） */
  total: number;
  /** 本地探测通过、需要参与同步的张数 */
  eligible: number;
  /** 已上传（新增/变更） */
  uploaded: number;
  /** 与服务端一致、跳过 */
  unchanged: number;
  /** 失败张数 */
  failed: number;
  /** 本地不合规被跳过的张数（扩展名/超限/魔数） */
  skipped: number;
  failures: CloudAssetUploadFailure[];
  /** 是否因为设置项关闭而没有执行 */
  disabled?: boolean;
}

export interface CloudAssetPullSummary {
  total: number;
  written: number;
  skippedSame: number;
  skippedConflict: number;
  failed: number;
  failures: CloudAssetUploadFailure[];
}

export function isSupportedImageName(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return (CLOUD_ASSET_EXTENSIONS as readonly string[]).includes(ext);
}

export function imageMimeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return 'application/octet-stream';
}

function decodePath(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** 是否是可同步的相对路径（跳过 http(s)/data:/绝对路径/锚点）。 */
export function isRelativeImagePath(raw: string): boolean {
  const target = raw.trim().replace(/^<|>$/g, '').trim();
  if (!target) {
    return false;
  }
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(target)) {
    return false;
  }
  return true;
}

/** 纯路径规范化：反斜杠→斜杠、去掉空段与 `./`；出现 `..` 返回 null（越界，不同步）。 */
export function normalizeRelativeAssetPath(raw: string): string | null {
  const unified = decodePath(raw.trim().replace(/^<|>$/g, '')).replace(/\\/g, '/');
  const segments: string[] = [];
  for (const segment of unified.split('/')) {
    const value = segment.trim();
    if (!value || value === '.') {
      continue;
    }
    if (value === '..') {
      return null;
    }
    segments.push(value);
  }
  return segments.length > 0 ? segments.join('/') : null;
}

/** 文档所在目录（用于把引用解析到绝对路径）。 */
export function docDirectory(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index > 0 ? normalized.slice(0, index) : '';
}

/**
 * 解析 Markdown 里的相对图片引用（`![](...)` 与 `<img src="...">`）。
 * - 跳过 http(s)/data:/绝对路径/锚点；
 * - 处理尖括号包裹、引号标题、`%xx` 编码与反斜杠；
 * - `..` 越界引用直接丢弃（不同步）。
 * 同一 relPath 只保留一次。
 */
export function parseMarkdownImageRefs(markdown: string, filePath: string): MarkdownImageRef[] {
  const text = (markdown ?? '').replace(/<!--[\s\S]*?-->/g, '');
  if (!text) {
    return [];
  }
  const dir = docDirectory(filePath);
  const seen = new Set<string>();
  const refs: MarkdownImageRef[] = [];

  const push = (rawTarget: string) => {
    // 兼容三种写法：<带空格路径>、`path "标题"`、纯路径
    let target = rawTarget.trim();
    const angle = /^<([^>]*)>$/.exec(target);
    if (angle) {
      target = (angle[1] ?? '').trim();
    } else {
      target = target.replace(/\s+["'][^"']*["']\s*$/, '').trim();
    }
    if (!isRelativeImagePath(target)) {
      return;
    }
    const relPath = normalizeRelativeAssetPath(target);
    if (!relPath || seen.has(relPath)) {
      return;
    }
    seen.add(relPath);
    refs.push({
      raw: target,
      relPath,
      localPath: dir ? `${dir}/${relPath}` : relPath,
    });
  };

  const markdownImage = /!\[[^\]]*\]\(\s*(<[^>]*>|[^)]+?)\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = markdownImage.exec(text)) !== null) {
    push(match[1] ?? '');
  }

  const htmlImage = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  while ((match = htmlImage.exec(text)) !== null) {
    push(match[1] ?? '');
  }

  return refs;
}

export interface AssetUploadPlan {
  /** 需要上传（新增或内容变更） */
  uploads: MarkdownImageRef[];
  /** 服务端已有同 hash，跳过 */
  unchanged: MarkdownImageRef[];
  /** 本地不存在或不合规 */
  skipped: Array<{ ref: MarkdownImageRef; reason: string }>;
}

/**
 * 归一化 contentHash 成小写 `sha256:<hex>`：
 * 服务端可能返回裸 hex，本地探测固定带前缀，不统一就永远匹配不上（「只传变更」失效）。
 */
export function normalizeAssetHash(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  return trimmed.startsWith('sha256:') ? trimmed : `sha256:${trimmed}`;
}

/**
 * 只传变更：按 relPath 匹配服务端 assets，contentHash 相同即跳过。
 */
export function planAssetUploads(
  refs: MarkdownImageRef[],
  localInfo: CloudAssetSourceInfo[],
  remoteAssets: CloudAssetInfo[],
): AssetUploadPlan {
  const localByPath = new Map(localInfo.map((item) => [item.path.replace(/\\/g, '/'), item]));
  const remoteByRel = new Map(remoteAssets.map((asset) => [asset.relPath, asset]));
  const plan: AssetUploadPlan = { uploads: [], unchanged: [], skipped: [] };

  for (const ref of refs) {
    const local = localByPath.get(ref.localPath.replace(/\\/g, '/'));
    if (!local || !local.exists) {
      plan.skipped.push({ ref, reason: '本地文件不存在' });
      continue;
    }
    if (!local.supported) {
      plan.skipped.push({ ref, reason: local.reason ?? '不支持的图片' });
      continue;
    }
    if (local.size > CLOUD_ASSET_MAX_BYTES) {
      plan.skipped.push({ ref, reason: '图片超过 20 MB 上限' });
      continue;
    }
    const remote = remoteByRel.get(ref.relPath);
    const localHash = normalizeAssetHash(local.contentHash);
    const remoteHash = normalizeAssetHash(remote?.contentHash);
    if (remote && localHash && remoteHash === localHash) {
      plan.unchanged.push(ref);
      continue;
    }
    plan.uploads.push(ref);
  }

  return plan;
}

/** 按并发上限执行任务，返回每个任务的结果（保持顺序）。 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length));
  const runners = Array.from({ length: size }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index] as T);
    }
  });
  await Promise.all(runners);
  return results;
}

export interface SyncAssetsOptions {
  filePath: string;
  fileId: number;
  content: string;
  /** 设置项「同步文档内图片」 */
  enabled: boolean;
  onProgress?: (done: number, total: number, failed: number) => void;
}

/**
 * 同步文档引用的图片：探测 → 列远端 → 只传变更（并发 3）→ 汇总。
 * 任何单张失败都不抛出，只记入 failures（不阻断正文同步）。
 */
export async function syncMarkdownAssets(
  options: SyncAssetsOptions,
): Promise<CloudAssetSyncSummary> {
  const summary: CloudAssetSyncSummary = {
    total: 0,
    eligible: 0,
    uploaded: 0,
    unchanged: 0,
    failed: 0,
    skipped: 0,
    failures: [],
  };
  if (!options.enabled) {
    summary.disabled = true;
    return summary;
  }
  if (!isTauriApp()) {
    return summary;
  }

  const refs = parseMarkdownImageRefs(options.content, options.filePath);
  summary.total = refs.length;
  if (refs.length === 0) {
    return summary;
  }

  let remoteAssets: CloudAssetInfo[] = [];
  try {
    remoteAssets = await cloudCommands.assetsList(options.fileId);
  } catch {
    // 列表失败仍尝试上传（按“全部是新增”处理）
    remoteAssets = [];
  }

  let localInfo: CloudAssetSourceInfo[] = [];
  try {
    localInfo = await cloudCommands.inspectAssetSources(refs.map((ref) => ref.localPath));
  } catch {
    localInfo = [];
  }

  const plan = planAssetUploads(refs, localInfo, remoteAssets);
  summary.skipped = plan.skipped.length;
  summary.unchanged = plan.unchanged.length;
  summary.eligible = plan.uploads.length + plan.unchanged.length;

  if (plan.uploads.length === 0) {
    return summary;
  }

  let done = 0;
  const results = await runWithConcurrency(
    plan.uploads,
    CLOUD_ASSET_CONCURRENCY,
    async (ref) => {
      try {
        await cloudCommands.assetUploadFile(options.fileId, ref.relPath, ref.localPath);
        summary.uploaded += 1;
        return null;
      } catch (error) {
        const normalized = normalizeCloudError(error);
        summary.failed += 1;
        return { relPath: ref.relPath, reason: normalized.message };
      } finally {
        done += 1;
        options.onProgress?.(done, plan.uploads.length, summary.failed);
      }
    },
  );

  summary.failures = results.filter((item): item is CloudAssetUploadFailure => item !== null);
  return summary;
}

export interface PullAssetsOptions {
  filePath: string;
  fileId: number;
  workspaceRoot: string;
}

/**
 * 拉取文档后补齐图片：缺失的下载写入，已存在同 hash 跳过，存在但不同跳过并提示。
 */
export async function pullMarkdownAssets(
  options: PullAssetsOptions,
): Promise<CloudAssetPullSummary> {
  const summary: CloudAssetPullSummary = {
    total: 0,
    written: 0,
    skippedSame: 0,
    skippedConflict: 0,
    failed: 0,
    failures: [],
  };
  if (!isTauriApp() || !options.workspaceRoot) {
    return summary;
  }

  let remoteAssets: CloudAssetInfo[] = [];
  try {
    remoteAssets = await cloudCommands.assetsList(options.fileId);
  } catch (error) {
    const normalized = normalizeCloudError(error);
    summary.failures.push({ relPath: '*', reason: normalized.message });
    return summary;
  }
  summary.total = remoteAssets.length;
  if (remoteAssets.length === 0) {
    return summary;
  }

  await runWithConcurrency(remoteAssets, CLOUD_ASSET_CONCURRENCY, async (asset) => {
    try {
      const result = await cloudCommands.assetDownload({
        fileId: options.fileId,
        assetId: asset.assetId,
        workspaceRoot: options.workspaceRoot,
        documentPath: options.filePath,
        relPath: asset.relPath,
        expectedHash: asset.contentHash ?? null,
      });
      if (result.status === 'written') {
        summary.written += 1;
      } else if (result.status === 'skippedSame') {
        summary.skippedSame += 1;
      } else {
        summary.skippedConflict += 1;
      }
    } catch (error) {
      const normalized = normalizeCloudError(error);
      summary.failed += 1;
      summary.failures.push({ relPath: asset.relPath, reason: normalized.message });
    }
  });

  return summary;
}

/** 汇总成一句可读文案（交给 i18n 组件拼装时也可直接用 message）。 */
export function describeAssetSync(summary: CloudAssetSyncSummary): string {
  if (summary.disabled) {
    return '同步文档内图片已关闭';
  }
  if (summary.total === 0) {
    return '文档中没有可同步的相对图片';
  }
  const parts = [`共 ${summary.total} 张图片`];
  if (summary.uploaded > 0) parts.push(`已上传 ${summary.uploaded} 张`);
  if (summary.unchanged > 0) parts.push(`${summary.unchanged} 张无变化`);
  if (summary.skipped > 0) parts.push(`${summary.skipped} 张已跳过`);
  if (summary.failed > 0) {
    // 带上后端/本地校验的第一条可读原因，避免只显示「失败」
    const first = summary.failures[0];
    parts.push(`${summary.failed} 张失败${first ? `（${first.relPath}: ${first.reason}）` : ''}`);
  }
  return parts.join('，');
}
