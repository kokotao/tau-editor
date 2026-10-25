/**
 * @description 云文档一键分享：分享域名解析、有效期归一化、链接拼装与三条分享命令的 CloudOutcome 包装。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 16:20
 */
import {
  cloudCommands,
  isTauriApp,
  type CloudShareConfig,
  type CloudShareCreatePayload,
  type CloudShareInfo,
  type CloudShareStatus,
} from '@/lib/tauri';
import { normalizeCloudError, type CloudOutcome } from '@/services/cloudDocService';

const WEB_UNSUPPORTED_MESSAGE = '当前是 Web 构建，云文档分享仅在 Tauri 桌面端可用。';
/** 服务端 token 固定 16 位 Base62。 */
export const SHARE_TOKEN_LENGTH = 16;
/** 有效期上限兜底（服务端契约 3650 天）。 */
export const SHARE_MAX_EXPIRE_DAYS = 3650;
/** 有效期预设：null = 永久。 */
export const SHARE_EXPIRY_PRESET_DAYS: Array<number | null> = [null, 1, 7, 30];

function unsupported<T>(): CloudOutcome<T> {
  return { ok: false, kind: 'unsupported', message: WEB_UNSUPPORTED_MESSAGE };
}

function failure<T>(error: unknown): CloudOutcome<T> {
  const normalized = normalizeCloudError(error);
  return { ok: false, kind: normalized.kind, message: normalized.message };
}

/**
 * 分享域名：优先后端 config 的 `shareBaseUrl`，取不到时用「服务器地址去掉 /lizi」兜底。
 * 例：`https://note.lizipro.cn/lizi` → `https://note.lizipro.cn`
 */
export function resolveShareBaseUrl(
  config: CloudShareConfig | null | undefined,
  authBaseUrl: string | null | undefined,
): string {
  const fromConfig = config?.shareBaseUrl?.trim();
  if (fromConfig) {
    return fromConfig.replace(/\/+$/, '');
  }
  const raw = (authBaseUrl ?? '').trim();
  if (!raw) {
    return '';
  }
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/lizi\/?$/, '').replace(/\/+$/, '');
  }
}

/** 拼分享短链：`{base}/s/{token}`；后端已返回 shareUrl 时优先用后端的。 */
export function buildShareUrl(
  baseUrl: string,
  token: string | null | undefined,
  explicitUrl?: string | null,
): string {
  const explicit = (explicitUrl ?? '').trim();
  if (explicit) {
    return explicit;
  }
  const cleanBase = (baseUrl ?? '').trim().replace(/\/+$/, '');
  const cleanToken = (token ?? '').trim();
  if (!cleanBase || !cleanToken) {
    return '';
  }
  return `${cleanBase}/s/${cleanToken}`;
}

/**
 * 有效期归一化：null/<=0 → 永久（null）；其余夹取到 [1, min(maxExpireDays, 3650)]。
 */
export function normalizeExpiresInDays(
  days: number | null | undefined,
  maxExpireDays?: number | null,
): number | null {
  if (days === null || days === undefined) {
    return null;
  }
  const value = Math.floor(Number(days));
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  const serverMax = maxExpireDays && maxExpireDays > 0
    ? Math.floor(maxExpireDays)
    : SHARE_MAX_EXPIRE_DAYS;
  return Math.min(Math.max(1, value), Math.min(SHARE_MAX_EXPIRE_DAYS, serverMax));
}

/**
 * 检测 Markdown 里是否引用了**相对路径图片**（这类图片不会随文档同步，分享页会碎图）。
 * 只认 `![](...)` 与 `<img src="...">`，忽略 http(s)/data/绝对路径/锚点。
 */
export function hasRelativeMarkdownImages(markdown: string): boolean {
  // 注释里的图片不会被渲染，先剔除避免误报
  const text = (markdown ?? '').replace(/<!--[\s\S]*?-->/g, '');
  if (!text) {
    return false;
  }
  const isRelative = (raw: string): boolean => {
    const target = raw.trim().replace(/^<|>$/g, '').trim();
    if (!target) {
      return false;
    }
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(target)) {
      return false;
    }
    return true;
  };

  const markdownImage = /!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = markdownImage.exec(text)) !== null) {
    if (isRelative(match[1] ?? '')) {
      return true;
    }
  }

  const htmlImage = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  while ((match = htmlImage.exec(text)) !== null) {
    if (isRelative(match[1] ?? '')) {
      return true;
    }
  }
  return false;
}

/** 复制文本：优先 Clipboard API，失败退回 textarea + execCommand。返回是否成功。 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = text ?? '';
  if (!value) {
    return false;
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // 落到下面的兜底
  }
  try {
    if (typeof document === 'undefined') {
      return false;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand?.('copy') ?? false;
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

export async function fetchShareConfig(): Promise<CloudOutcome<CloudShareConfig>> {
  if (!isTauriApp()) {
    return unsupported<CloudShareConfig>();
  }
  try {
    return { ok: true, data: await cloudCommands.shareConfig() };
  } catch (error) {
    return failure<CloudShareConfig>(error);
  }
}

export async function getShareStatus(fileId: number): Promise<CloudOutcome<CloudShareStatus>> {
  if (!isTauriApp()) {
    return unsupported<CloudShareStatus>();
  }
  try {
    return { ok: true, data: await cloudCommands.shareStatus(fileId) };
  } catch (error) {
    return failure<CloudShareStatus>(error);
  }
}

export async function createShare(
  fileId: number,
  payload: CloudShareCreatePayload = {},
): Promise<CloudOutcome<CloudShareInfo>> {
  if (!isTauriApp()) {
    return unsupported<CloudShareInfo>();
  }
  try {
    return { ok: true, data: await cloudCommands.shareCreate(fileId, payload) };
  } catch (error) {
    return failure<CloudShareInfo>(error);
  }
}

export async function revokeShare(fileId: number): Promise<CloudOutcome<void>> {
  if (!isTauriApp()) {
    return unsupported<void>();
  }
  try {
    await cloudCommands.shareRevoke(fileId);
    return { ok: true, data: undefined };
  } catch (error) {
    return failure<void>(error);
  }
}
