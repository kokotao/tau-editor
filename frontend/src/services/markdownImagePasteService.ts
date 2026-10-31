/**
 * @description 云文档 Markdown 图片「粘贴 / 导入即上传云端」的决策与执行（纯逻辑层）。
 *
 * 背景：云文档里粘贴/导入图片时，`import_markdown_asset(_bytes)` 只把图片写到本地
 * `assets/` 目录，Markdown 里落的是相对路径；云同步默认只传 `.md` 文本，
 * 因此用户在云端阅读时图片会裂图。方案 A：图片插进编辑器后**立即**把这张图上传到
 * 该云文档的 assets（`cloud_docs_asset_upload_file`），Markdown 仍保留相对路径。
 *
 * 设计约束：
 * - 决策与执行都放在这里，App 只负责取参数 + 弹通知，便于单测（不碰巨型组件）；
 * - 预检复用 `cloudAssetService` 的既有纯函数与上限常量，避免与「同步至云端」弹窗两套口径；
 * - 上传失败绝不抛出：插入图片是主流程，上传只是增强；失败由调用方提示可稍后重试；
 * - 方案 B（Markdown 里直接写云端 URL）不在本模块范围：`GET .../assets/{assetId}`
 *   目前需要 Authorization，`<img src>` 无法携带登录态，需要后端提供匿名/签名 URL。
 *
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-31
 */
import { cloudCommands } from '@/lib/tauri';
import { normalizeCloudError } from '@/services/cloudDocService';
import {
  CLOUD_ASSET_MAX_BYTES,
  isSupportedImageName,
  normalizeRelativeAssetPath,
} from '@/services/cloudAssetService';

/** 未上传云端的原因（用于提示文案，不阻断插入）。 */
export type CloudImageUploadSkipReason =
  /** 当前标签不是云文档（保持原有本地行为，不提示） */
  | 'no-cloud-doc'
  /** 相对路径越界 / 形如绝对路径，不能作为云端 assets 路径 */
  | 'invalid-relative-path'
  /** 云端只接受 png/jpg/jpeg/gif/webp（本地可能已导入 svg/bmp/avif） */
  | 'unsupported-extension'
  /** 超过云端单图上限（CLOUD_ASSET_MAX_BYTES） */
  | 'too-large'
  /** 拿不到本地绝对路径，无法上传 */
  | 'missing-local-path';

export interface CloudImageUploadInput {
  /** 标签绑定的云文档 id；null/undefined 表示本地文档 */
  cloudFileId?: number | null;
  /** 插入到 Markdown 的相对路径（`importMarkdownAsset*` 的返回值） */
  relativePath: string;
  /** 本地绝对路径（导入结果不返回，由调用方用 workspaceRoot + relativePath 拼） */
  absolutePath?: string | null;
  /** 资产字节数（导入结果里的 bytes；未知可传 null） */
  byteSize?: number | null;
  /** 资产文件名（默认取 relativePath 最后一段） */
  fileName?: string | null;
}

/** 决策：要么上传，要么带原因跳过（不阻断插入）。 */
export type CloudImageUploadDecision =
  | { action: 'skip'; reason: CloudImageUploadSkipReason }
  | { action: 'upload'; cloudFileId: number; relativePath: string; absolutePath: string };

/** 上传函数签名（与 `cloudCommands.assetUploadFile` 一致，便于测试注入）。 */
export type CloudAssetUploadFn = (
  cloudFileId: number,
  relativePath: string,
  absolutePath: string,
) => Promise<unknown>;

/**
 * 用工作区根目录 + 资产相对路径拼绝对路径（统一 `/` 分隔符）。
 *
 * `importMarkdownAsset*` 只返回相对路径，云端上传需要本地绝对路径，因此这里统一拼接；
 * 相对路径非法（含 `..` / 空）或根目录缺失时返回 null。
 */
export function joinAssetAbsolutePath(
  rootPath: string | null | undefined,
  relativePath: string | null | undefined,
): string | null {
  const normalizedRelative = normalizeRelativeAssetPath(String(relativePath ?? ''));
  if (!normalizedRelative) return null;
  const root = String(rootPath ?? '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!root) return null;
  return `${root}/${normalizedRelative}`;
}

/** 取资产文件名（最后一段）。 */
function assetFileNameOf(input: CloudImageUploadInput, normalizedRelativePath: string): string {
  const explicit = String(input.fileName ?? '').trim();
  if (explicit) return explicit;
  const segments = normalizedRelativePath.split('/');
  return segments[segments.length - 1] ?? '';
}

/**
 * 计算这次「粘贴/导入图片」要不要立刻上传云端。
 *
 * 顺序与「同步至云端」弹窗的预检保持一致：云文档 → 相对路径 → 扩展名 → 大小 → 本地路径。
 */
export function decideCloudImageUpload(input: CloudImageUploadInput): CloudImageUploadDecision {
  const cloudFileId = input.cloudFileId;
  if (typeof cloudFileId !== 'number' || !Number.isInteger(cloudFileId) || cloudFileId <= 0) {
    return { action: 'skip', reason: 'no-cloud-doc' };
  }

  const relativePath = normalizeRelativeAssetPath(String(input.relativePath ?? ''));
  if (!relativePath) {
    return { action: 'skip', reason: 'invalid-relative-path' };
  }

  const fileName = assetFileNameOf(input, relativePath);
  if (!isSupportedImageName(fileName)) {
    return { action: 'skip', reason: 'unsupported-extension' };
  }

  const byteSize = input.byteSize;
  if (typeof byteSize === 'number' && Number.isFinite(byteSize) && byteSize > CLOUD_ASSET_MAX_BYTES) {
    return { action: 'skip', reason: 'too-large' };
  }

  const absolutePath = String(input.absolutePath ?? '').trim();
  if (!absolutePath) {
    return { action: 'skip', reason: 'missing-local-path' };
  }

  return { action: 'upload', cloudFileId, relativePath, absolutePath };
}

/** 默认上传实现：直接走 Tauri 云文档 assets 接口。 */
const defaultUpload: CloudAssetUploadFn = (cloudFileId, relativePath, absolutePath) => (
  cloudCommands.assetUploadFile(cloudFileId, relativePath, absolutePath)
);

/**
 * 执行上传：只在决策为 upload 时发请求；失败返回可读原因（不抛出）。
 */
export async function performCloudImageUpload(
  decision: CloudImageUploadDecision,
  upload: CloudAssetUploadFn = defaultUpload,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (decision.action === 'skip') {
    return { ok: false, message: '当前图片未满足云端上传条件' };
  }
  try {
    await upload(decision.cloudFileId, decision.relativePath, decision.absolutePath);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: normalizeCloudError(error).message };
  }
}

/**
 * 一步到位：决策 + 上传（供「不需要自己维护互斥标记」的调用方使用）。
 *
 * 返回里带 `decision`，调用方据此区分「本地文档（保持原行为）」「跳过」「上传成功/失败」。
 */
export async function uploadMarkdownImageToCloud(
  input: CloudImageUploadInput,
  upload: CloudAssetUploadFn = defaultUpload,
): Promise<{
  decision: CloudImageUploadDecision;
  uploaded: boolean;
  failureMessage?: string;
}> {
  const decision = decideCloudImageUpload(input);
  if (decision.action === 'skip') {
    return { decision, uploaded: false };
  }
  const result = await performCloudImageUpload(decision, upload);
  return result.ok
    ? { decision, uploaded: true }
    : { decision, uploaded: false, failureMessage: result.message };
}
