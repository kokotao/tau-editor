/**
 * @description 云文档服务：把 Rust 云命令包装成统一的 CloudOutcome，并把 TauriError.code 归一化为业务错误类型。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 10:20
 */
import {
  cloudCommands,
  isTauriApp,
  type CloudDocDetail,
  type CloudDocItem,
  type CloudDocPage,
  type CloudDocSavePayload,
  type CloudDocSaveResult,
  type CloudDocSpace,
  type CloudDocVersion,
} from '@/lib/tauri';

export type CloudErrorKind =
  | 'unauthorized'
  /** 已登录但无权限（如单文档非 owner 的 403）：不能当成登录失效去登出 */
  | 'forbidden'
  | 'conflict'
  | 'quota'
  | 'network'
  | 'unsupported'
  | 'unknown';

export interface CloudFailure {
  ok: false;
  kind: CloudErrorKind;
  message: string;
}

export type CloudOutcome<T> = { ok: true; data: T } | CloudFailure;

/** 服务端单页最多返回 100 条，按路径查找时用它作为翻页步长。 */
const CLOUD_DOC_PAGE_SIZE = 100;
/** 路径查找的最多翻页次数，避免异常数据导致死循环。 */
const CLOUD_DOC_MAX_PAGES = 10;

const CLOUD_FALLBACK_MESSAGE = '云端操作失败，请稍后重试。';

const WEB_UNSUPPORTED_MESSAGE = '当前是 Web 构建，云文档功能仅在 Tauri 桌面端可用。';

/**
 * 服务端业务错误码（HTTP 200 + body.code）由 Rust 转成 TauriError.code，
 * 这里只做客户端语义归类，不改动原始 message。
 * 注意：登录失败（密码错误 300 / 账号不存在 101 / FAIL 201）被 Rust 统一映射成
 * SERVER_ERROR，必须原样展示 message，不能误判成「登录已过期」。
 */
const CLOUD_ERROR_KIND_MAP: Record<string, CloudErrorKind> = {
  // 未登录 / 令牌失效
  UNAUTHORIZED: 'unauthorized',
  AUTH_REQUIRED: 'unauthorized',
  LOGIN_REQUIRED: 'unauthorized',
  TOKEN_EXPIRED: 'unauthorized',
  TOKEN_INVALID: 'unauthorized',
  '401': 'unauthorized',
  // 403 是「无权限」，不是登录失效：单独归类，避免 store 误登出
  '403': 'forbidden',
  FORBIDDEN: 'forbidden',
  PERMISSION_DENIED: 'forbidden',
  // 版本 / 路径冲突
  CONFLICT: 'conflict',
  VERSION_CONFLICT: 'conflict',
  FILE_CONFLICT: 'conflict',
  '409': 'conflict',
  // 配额与体积限制
  QUOTA_EXCEEDED: 'quota',
  STORAGE_QUOTA_EXCEEDED: 'quota',
  PAYLOAD_TOO_LARGE: 'quota',
  '413': 'quota',
  // 平台/格式不支持（Rust: BINARY_FILE / FILE_TOO_LARGE）
  UNSUPPORTED: 'unsupported',
  NOT_SUPPORTED: 'unsupported',
  WEB_UNSUPPORTED: 'unsupported',
  BINARY_FILE: 'unsupported',
  FILE_TOO_LARGE: 'unsupported',
  // 网络（Rust 统一用 NETWORK_ERROR 包装 reqwest 异常）
  NETWORK_ERROR: 'network',
  NETWORK: 'network',
  REQUEST_FAILED: 'network',
  CONNECT_ERROR: 'network',
  TIMEOUT: 'network',
};

const NETWORK_MESSAGE_PATTERN = /network|timeout|timed out|dns|fetch|连接|网络|超时/i;
const UNAUTHORIZED_MESSAGE_PATTERN = /未登录|登录已过期|请先登录|unauthorized/i;
const FORBIDDEN_MESSAGE_PATTERN = /无权限|没有权限|不属于你|owner|forbidden/i;
const QUOTA_MESSAGE_PATTERN = /空间不足|配额|quota|too large|超过.*上限/i;

function readErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return '';
  }

  const candidate = (error as { code?: unknown }).code;
  if (typeof candidate === 'string') {
    return candidate.trim().toUpperCase();
  }
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return String(candidate);
  }
  return '';
}

function readErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error.trim();
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    // 对象没有可用 message 时不要 String(error)（会得到 "[object Object]"）
    return '';
  }

  if (typeof error === 'number' || typeof error === 'boolean') {
    return String(error);
  }

  return '';
}

/**
 * 把任意异常归一化成 {kind, message}：
 * 1. Rust 已把 body.code / HTTP status 映射成字符串代码，有 code 时只按 code 归类；
 * 2. 只有完全没有 code 的异常（如 Web fetch 的 TypeError）才按消息关键字兜底。
 */
export function normalizeCloudError(error: unknown): { kind: CloudErrorKind; message: string } {
  const code = readErrorCode(error);
  const message = readErrorMessage(error) || CLOUD_FALLBACK_MESSAGE;

  if (code) {
    // 未知 code（SERVER_ERROR 密码错误、KEYRING_ERROR、INVALID_ARGUMENT 等）一律保留原 message。
    const kind = CLOUD_ERROR_KIND_MAP[code] ?? 'unknown';
    // 403 但服务端没给 message 时补一句可读的「无权限」，而不是笼统的「云端操作失败」
    if (kind === 'forbidden' && message === CLOUD_FALLBACK_MESSAGE) {
      return { kind, message: '无权限，请确认文档归属' };
    }
    return { kind, message };
  }

  if (NETWORK_MESSAGE_PATTERN.test(message)) {
    return { kind: 'network', message };
  }
  if (UNAUTHORIZED_MESSAGE_PATTERN.test(message)) {
    return { kind: 'unauthorized', message };
  }
  if (FORBIDDEN_MESSAGE_PATTERN.test(message)) {
    return { kind: 'forbidden', message: message || '无权限，请确认文档归属' };
  }
  if (QUOTA_MESSAGE_PATTERN.test(message)) {
    return { kind: 'quota', message };
  }

  return { kind: 'unknown', message };
}

function unsupportedOutcome<T>(): CloudOutcome<T> {
  return { ok: false, kind: 'unsupported', message: WEB_UNSUPPORTED_MESSAGE };
}

function failureFromError<T>(error: unknown): CloudOutcome<T> {
  const normalized = normalizeCloudError(error);
  return { ok: false, kind: normalized.kind, message: normalized.message };
}

function normalizeDocPath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment.length > 0)
    .join('/');
}

export async function getCloudSpace(): Promise<CloudOutcome<CloudDocSpace>> {
  if (!isTauriApp()) {
    return unsupportedOutcome<CloudDocSpace>();
  }

  try {
    const space = await cloudCommands.me();
    return { ok: true, data: space };
  } catch (error) {
    return failureFromError<CloudDocSpace>(error);
  }
}

export async function listCloudDocs(query?: {
  pathPrefix?: string | null;
  keyword?: string | null;
  page?: number;
  size?: number;
}): Promise<CloudOutcome<CloudDocPage>> {
  if (!isTauriApp()) {
    return unsupportedOutcome<CloudDocPage>();
  }

  try {
    const page = await cloudCommands.list(query ?? {});
    return { ok: true, data: page };
  } catch (error) {
    return failureFromError<CloudDocPage>(error);
  }
}

/**
 * 按云文档完整路径查找文档。
 * 服务端 list 的 pathPrefix 是目录前缀语义，因此取父目录做过滤后再精确比较 path。
 */
export async function findCloudDocByPath(path: string): Promise<CloudOutcome<CloudDocItem | null>> {
  if (!isTauriApp()) {
    return unsupportedOutcome<CloudDocItem | null>();
  }

  const normalized = normalizeDocPath(path);
  if (!normalized) {
    return { ok: false, kind: 'unknown', message: '云文档路径不能为空' };
  }

  const lastSlash = normalized.lastIndexOf('/');
  const pathPrefix = lastSlash > 0 ? normalized.slice(0, lastSlash) : null;

  for (let page = 1; page <= CLOUD_DOC_MAX_PAGES; page += 1) {
    const outcome = await listCloudDocs({
      pathPrefix,
      page,
      size: CLOUD_DOC_PAGE_SIZE,
    });
    if (!outcome.ok) {
      return outcome;
    }

    const matched = outcome.data.records.find(
      (item) => normalizeDocPath(item.path) === normalized,
    );
    if (matched) {
      return { ok: true, data: matched };
    }

    // 不足一页说明已经到底；避免对超大账号做无意义翻页。
    if (outcome.data.records.length < CLOUD_DOC_PAGE_SIZE) {
      break;
    }
  }

  return { ok: true, data: null };
}

export async function getCloudDoc(fileId: number): Promise<CloudOutcome<CloudDocDetail>> {
  if (!isTauriApp()) {
    return unsupportedOutcome<CloudDocDetail>();
  }

  try {
    const detail = await cloudCommands.get(fileId);
    return { ok: true, data: detail };
  } catch (error) {
    return failureFromError<CloudDocDetail>(error);
  }
}

export async function saveCloudDoc(
  payload: CloudDocSavePayload,
): Promise<CloudOutcome<CloudDocSaveResult>> {
  if (!isTauriApp()) {
    return unsupportedOutcome<CloudDocSaveResult>();
  }

  try {
    const result = await cloudCommands.save(payload);
    return { ok: true, data: result };
  } catch (error) {
    return failureFromError<CloudDocSaveResult>(error);
  }
}

export async function listCloudDocVersions(
  fileId: number,
): Promise<CloudOutcome<CloudDocVersion[]>> {
  if (!isTauriApp()) {
    return unsupportedOutcome<CloudDocVersion[]>();
  }

  try {
    const versions = await cloudCommands.versions(fileId);
    return { ok: true, data: versions };
  } catch (error) {
    return failureFromError<CloudDocVersion[]>(error);
  }
}

export async function restoreCloudDocVersion(
  fileId: number,
  versionId: number,
): Promise<CloudOutcome<CloudDocSaveResult>> {
  if (!isTauriApp()) {
    return unsupportedOutcome<CloudDocSaveResult>();
  }

  try {
    const result = await cloudCommands.restore(fileId, versionId);
    return { ok: true, data: result };
  } catch (error) {
    return failureFromError<CloudDocSaveResult>(error);
  }
}

export async function deleteCloudDoc(fileId: number): Promise<CloudOutcome<void>> {
  if (!isTauriApp()) {
    return unsupportedOutcome<void>();
  }

  try {
    await cloudCommands.remove(fileId);
    return { ok: true, data: undefined };
  } catch (error) {
    return failureFromError<void>(error);
  }
}
