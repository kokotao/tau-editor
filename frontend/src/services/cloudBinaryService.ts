/**
 * @description 二进制文档（pdf/doc/docx/xls/xlsx/ppt/pptx）上传与分享前校验：
 * 扩展名白名单、宏格式拒绝、50MB 上限、409（同 path 已存在）与病毒扫描类错误的可读文案。
 * 字节由 Rust 走 multipart 上传，前端只传本地路径。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 18:25
 */
import { cloudCommands, isTauriApp, type CloudBinaryUploadResult } from '@/lib/tauri';
import {
  findCloudDocByPath,
  normalizeCloudError,
  type CloudErrorKind,
  type CloudOutcome,
} from '@/services/cloudDocService';

/** 二进制文档单文件上限（与后端契约一致）。 */
export const BINARY_DOC_MAX_BYTES = 50 * 1024 * 1024;
/** 允许上传/在线预览的格式。 */
export const BINARY_DOC_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'] as const;
/** 宏格式一律拒绝（安全策略）。 */
export const MACRO_DOC_EXTENSIONS = ['docm', 'xlsm', 'pptm', 'ppsm', 'dotm', 'xltm'] as const;

/** 二进制文档类型（用于分享弹窗展示）。 */
export type BinaryDocKind = 'pdf' | 'office';

export interface BinaryDocEligibility {
  eligible: boolean;
  kind: BinaryDocKind | null;
  reason?: string;
}

function extensionOf(filePath: string | null | undefined): string {
  const name = (filePath ?? '').replace(/\\/g, '/').split('/').pop() ?? '';
  return name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '';
}

/** 是否是可上传的二进制文档格式。 */
export function isBinaryDocPath(filePath: string | null | undefined): boolean {
  return (BINARY_DOC_EXTENSIONS as readonly string[]).includes(extensionOf(filePath));
}

/** 是否是宏格式（docm/xlsm/pptm…），这类文件直接拒绝。 */
export function isMacroDocPath(filePath: string | null | undefined): boolean {
  return (MACRO_DOC_EXTENSIONS as readonly string[]).includes(extensionOf(filePath));
}

/** 二进制文档类型：pdf → pdf，其余办公格式 → office。 */
export function binaryDocKind(filePath: string | null | undefined): BinaryDocKind | null {
  if (!isBinaryDocPath(filePath)) {
    return null;
  }
  return extensionOf(filePath) === 'pdf' ? 'pdf' : 'office';
}

/**
 * 上传前的本地校验：宏格式 → 扩展名白名单 → 50MB 上限。
 * `fileSize` 未知时只校验扩展名（Rust 侧仍会按真实大小再拦一次）。
 */
export function validateBinaryDocLocal(
  filePath: string | null | undefined,
  fileSize?: number | null,
): BinaryDocEligibility {
  if (isMacroDocPath(filePath)) {
    return {
      eligible: false,
      kind: null,
      reason: '不支持含宏的 Office 文件（docm/xlsm/pptm），请另存为普通格式后再上传',
    };
  }
  const kind = binaryDocKind(filePath);
  if (!kind) {
    return {
      eligible: false,
      kind: null,
      reason: '仅支持 pdf/doc/docx/xls/xlsx/ppt/pptx 文档',
    };
  }
  if (typeof fileSize === 'number' && Number.isFinite(fileSize) && fileSize > BINARY_DOC_MAX_BYTES) {
    return { eligible: false, kind, reason: '文件超过 50 MB 上限' };
  }
  return { eligible: true, kind };
}

/** 服务端可读错误兜底文案（服务端给了 message 时优先用服务端的）。 */
export function describeBinaryUploadError(kind: CloudErrorKind, message: string): string {
  if (kind === 'conflict') {
    return '该路径已有云端文件，暂不支持覆盖，请改名或删除后再试';
  }
  if (kind === 'quota') {
    return message || '云端空间不足，请清理后重试';
  }
  if (kind === 'unsupported') {
    return message || '文件未通过云端安全检查（可能含宏或病毒），无法上传或预览';
  }
  if (kind === 'unauthorized') {
    return '登录状态已失效，请重新登录 lizi 账号';
  }
  return message || '上传失败，请稍后重试';
}

export interface UploadBinaryDocInput {
  /** 云端路径 `tau/{workspace}/{rel}` */
  cloudPath: string;
  localPath: string;
  title?: string | null;
  category?: string | null;
  tags?: string | null;
}

/**
 * 上传二进制文档。本地校验不通过时直接返回可读原因（skipped），不发起请求。
 */
export async function uploadBinaryDocument(
  input: UploadBinaryDocInput,
  options: { fileSize?: number | null } = {},
): Promise<CloudOutcome<CloudBinaryUploadResult>> {
  if (!isTauriApp()) {
    return { ok: false, kind: 'unsupported', message: '当前是 Web 构建，云文档功能仅在 Tauri 桌面端可用。' };
  }

  const eligibility = validateBinaryDocLocal(input.localPath, options.fileSize ?? null);
  if (!eligibility.eligible) {
    return { ok: false, kind: 'unsupported', message: eligibility.reason ?? '该文件不支持云端二进制上传' };
  }

  try {
    const result = await cloudCommands.binaryUpload({
      path: input.cloudPath,
      title: input.title ?? null,
      category: input.category ?? null,
      tags: input.tags ?? null,
      localPath: input.localPath,
    });
    return { ok: true, data: result };
  } catch (error) {
    const normalized = normalizeCloudError(error);
    return {
      ok: false,
      kind: normalized.kind,
      message: describeBinaryUploadError(normalized.kind, normalized.message),
    };
  }
}

/**
 * 分享前解析云端文档：已上传过则直接复用 fileId，否则上传后再返回。
 * 返回 `alreadyUploaded` 便于 UI 显示「已同步」。
 */
export async function ensureBinaryDocumentUploaded(
  input: UploadBinaryDocInput,
  options: { fileSize?: number | null } = {},
): Promise<CloudOutcome<{ fileId: number; version: number | null; alreadyUploaded: boolean; size: number | null }>> {
  const existing = await findCloudDocByPath(input.cloudPath);
  if (existing.ok && existing.data) {
    return {
      ok: true,
      data: {
        fileId: existing.data.fileId,
        version: existing.data.version,
        alreadyUploaded: true,
        size: typeof existing.data.size === 'number' ? existing.data.size : null,
      },
    };
  }

  const uploaded = await uploadBinaryDocument(input, options);
  if (!uploaded.ok) {
    return { ok: false, kind: uploaded.kind, message: uploaded.message };
  }
  return {
    ok: true,
    data: {
      fileId: uploaded.data.fileId,
      version: uploaded.data.version,
      alreadyUploaded: false,
      size: typeof uploaded.data.size === 'number' ? uploaded.data.size : null,
    },
  };
}

/** 文件大小展示。 */
export function formatBinarySize(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
    return '';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index] ?? 'B'}`;
}
