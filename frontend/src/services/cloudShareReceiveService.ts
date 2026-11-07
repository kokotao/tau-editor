/**
 * @description 接收 Tau 公开分享：解析剪贴板链接、免登录读取/验密、预览数据规整，以及复制到当前账号云端。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-11-06 10:30
 */
import {
  appCommands,
  cloudCommands,
  isTauriApp,
  type CloudShareImportResult,
  type CloudSharePublicInfo,
} from '@/lib/tauri';
import { normalizeCloudError, type CloudOutcome } from '@/services/cloudDocService';
import {
  buildImportCloudPath,
  buildImportTitle,
  resolveShareImportFileName,
  withImportSequence,
} from '@/services/shareImportService';

export const SHARE_RECEIVE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export interface ParsedTauShareLink {
  token: string;
  /** 归一化后的公开链接，只保留 origin + /s/{token}。 */
  url: string;
  origin: string;
}

function unsupported<T>(): CloudOutcome<T> {
  return { ok: false, kind: 'unsupported', message: '当前是 Web 构建，接收 Tau 分享仅在桌面端可用。' };
}

function failure<T>(error: unknown): CloudOutcome<T> {
  const normalized = normalizeCloudError(error);
  return { ok: false, kind: normalized.kind, message: normalized.message };
}

/**
 * 从任意文本中提取一个 Tau 分享链接。
 *
 * 支持直接粘贴、带说明文字，以及 API 服务地址下可能带 `/lizi/s/{token}` 的历史形态。
 * 只接受 http(s)，且要求路径中的 `s` 段紧跟 token；普通 `https://host/s/foo/bar` 不收。
 */
export function parseTauShareLink(raw: string | null | undefined): ParsedTauShareLink | null {
  const text = (raw ?? '').trim();
  if (!text) {
    return null;
  }
  const candidates = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  for (const candidate of candidates) {
    let parsed: URL;
    try {
      parsed = new URL(candidate.replace(/[),.;!?，。；！？]+$/u, ''));
    } catch {
      continue;
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    const shareIndex = segments.lastIndexOf('s');
    const token = shareIndex >= 0 ? segments[shareIndex + 1] ?? '' : '';
    if (!SHARE_RECEIVE_TOKEN_PATTERN.test(token) || segments.length !== shareIndex + 2) {
      continue;
    }
    return {
      token,
      url: `${parsed.origin}/s/${token}`,
      origin: parsed.origin,
    };
  }
  return null;
}

/** 读取系统剪贴板并提取分享链接；空剪贴板/无分享链接都返回可展示的原因。 */
export async function readShareLinkFromClipboard(): Promise<CloudOutcome<ParsedTauShareLink>> {
  if (!isTauriApp()) {
    return unsupported<ParsedTauShareLink>();
  }
  try {
    const text = await appCommands.readClipboardText();
    if (!text.trim()) {
      return { ok: false, kind: 'unknown', message: '剪贴板没有文本，请先复制 Tau 分享链接。' };
    }
    const parsed = parseTauShareLink(text);
    if (!parsed) {
      return { ok: false, kind: 'unknown', message: '剪贴板中没有可识别的 Tau 分享链接。' };
    }
    return { ok: true, data: parsed };
  } catch (error) {
    return failure<ParsedTauShareLink>(error);
  }
}

export async function readPublicShare(token: string): Promise<CloudOutcome<CloudSharePublicInfo>> {
  if (!isTauriApp()) {
    return unsupported<CloudSharePublicInfo>();
  }
  if (!SHARE_RECEIVE_TOKEN_PATTERN.test(token.trim())) {
    return { ok: false, kind: 'unknown', message: '分享链接令牌格式不正确' };
  }
  try {
    return { ok: true, data: await cloudCommands.sharePublicRead(token.trim()) };
  } catch (error) {
    return failure<CloudSharePublicInfo>(error);
  }
}

export async function verifyPublicShare(
  token: string,
  password: string,
): Promise<CloudOutcome<CloudSharePublicInfo>> {
  if (!isTauriApp()) {
    return unsupported<CloudSharePublicInfo>();
  }
  try {
    return { ok: true, data: await cloudCommands.sharePublicVerify(token.trim(), password) };
  } catch (error) {
    return failure<CloudSharePublicInfo>(error);
  }
}

/** 分享预览的稳定文本类型：Markdown 自己渲染，其余源码类统一文本显示。 */
export function resolveSharePreviewKind(info: Pick<CloudSharePublicInfo, 'fileName' | 'fileExt' | 'fileKind'>): 'markdown' | 'mindmap' | 'text' | 'unsupported' {
  const ext = (info.fileExt || info.fileName?.split('.').pop() || '').toLowerCase();
  if (['taumap', 'mm', 'opml'].includes(ext)) {
    return 'mindmap';
  }
  if (['md', 'markdown', 'mdx'].includes(ext) || (!ext && info.fileKind === 'markdown')) {
    return 'markdown';
  }
  if (typeof info.fileKind === 'string' && ['code', 'text'].includes(info.fileKind)) {
    return 'text';
  }
  return 'unsupported';
}

/** 把公开分享中的相对图片替换为服务端公开附件 URL（带密码分享附 ticket）。 */
export interface SharedImageUrlOptions {
  /** 分享链接的 origin，用于把服务端相对 URL 解析成 Tauri WebView 可加载的绝对 URL。 */
  origin?: string | null;
  /** 分享令牌，用于限制 assetTicket 只能发给本分享的附件路径。 */
  token?: string | null;
}

export function resolveShareContent(info: CloudSharePublicInfo, options: SharedImageUrlOptions = {}): string {
  let content = info.content ?? '';
  if (!content || info.assets.length === 0) {
    return content;
  }
  for (const asset of info.assets) {
    const relPath = (asset.relPath ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
    const url = asset.url?.trim();
    if (!relPath || !url) {
      continue;
    }
    const escaped = relPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const withTicket = rewriteSharedImageUrl(url, info.assetTicket, options);
    content = content.replace(new RegExp(`(!\\[[^\\]]*\\]\\()(?:<|\\./)?${escaped}(?:>)?(\\))`, 'g'), `$1${withTicket}$2`);
  }
  return content;
}

/** 分享预览中可加载的图片 URL（密码分享自动附加 30 分钟有效票据）。 */
export function rewriteSharedImageUrl(
  url: string,
  ticket?: string | null,
  options: SharedImageUrlOptions = {},
): string {
  const value = url.trim();
  if (!value) {
    return value;
  }
  let parsed: URL;
  try {
    parsed = /^https?:\/\//i.test(value)
      ? new URL(value)
      : options.origin
        ? new URL(value, `${options.origin.replace(/\/+$/, '')}/`)
        : new URL(`${value.startsWith('/') ? '' : '/'}${value}`, 'http://tau.invalid');
  } catch {
    return value;
  }
  const expectedOrigin = options.origin?.replace(/\/+$/, '') || '';
  const shareToken = options.token?.trim() || '';
  const pathSegments = parsed.pathname.split('/').filter(Boolean);
  const shareSegmentIndex = pathSegments.lastIndexOf('share');
  const trustedPath = Boolean(
    expectedOrigin
    && shareToken
    && parsed.origin === expectedOrigin
    && shareSegmentIndex > 0
    && pathSegments[shareSegmentIndex - 1] === 'blog'
    && pathSegments[shareSegmentIndex + 1] === shareToken
    && pathSegments[shareSegmentIndex + 2] === 'assets'
    && shareSegmentIndex + 3 < pathSegments.length,
  );
  const ticketToken = ticket?.trim();
  if (ticketToken && trustedPath) {
    parsed.searchParams.set('ticket', ticketToken);
  }
  if (/^https?:\/\//i.test(value) || options.origin) {
    return parsed.toString();
  }
  return `${parsed.pathname}${parsed.search}`;
}

export interface ReceiveShareInput {
  info: CloudSharePublicInfo;
  workspaceName?: string | null;
  categoryName?: string | null;
  categoryId?: string | number | null;
}

export interface ReceiveShareResult {
  fileId: number;
  version: number;
  contentHash: string;
  cloudPath: string;
  size: number;
}

/**
 * 将公开分享转存为当前账号的新云文档。
 *
 * 正文与图片附件由服务端按分享权限复制，目标路径固定在当前账号的导入目录；
 * 同名自动追加 (2)..(9) 创建副本，绝不覆盖自己的已有文档。
 */
export async function receiveShareToCloud(
  input: ReceiveShareInput & { token: string; password?: string | null },
): Promise<CloudOutcome<ReceiveShareResult>> {
  if (!isTauriApp()) {
    return unsupported<ReceiveShareResult>();
  }
  const info = input.info;
  const rawName = resolveShareImportFileName(info);
  if (typeof info.content !== 'string') {
    return { ok: false, kind: 'unsupported', message: '该分享没有可复制的文本正文（二进制或受保护文档暂不支持添加）。' };
  }
  for (let sequence = 1; sequence <= 9; sequence += 1) {
    const fileName = withImportSequence(rawName, sequence);
    try {
      const result: CloudShareImportResult = await cloudCommands.shareImport({
        token: input.token,
        password: input.password ?? null,
        path: buildImportCloudPath(rawName, sequence),
        title: buildImportTitle(fileName),
        category: input.categoryName || '导入',
      });
      return {
        ok: true,
        data: {
          fileId: result.fileId,
          version: result.version,
          contentHash: result.contentHash ?? '',
          cloudPath: result.path,
          size: result.size ?? 0,
        },
      };
    } catch (error) {
      const normalized = normalizeCloudError(error);
      if (normalized.kind !== 'conflict' || sequence === 9) {
        return { ok: false, kind: normalized.kind, message: normalized.message };
      }
    }
  }
  return { ok: false, kind: 'conflict', message: '同名文档过多，请修改分享文件名后重试。' };
}
