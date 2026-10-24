/**
 * @description lizi 账号登录/登出与会话恢复。桌面端全部经 Rust（keyring 保存 JWT），
 * Web 构建降级为模块内内存 token，绝不写入 localStorage/sessionStorage。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 10:25
 */
import {
  cloudCommands,
  isTauriApp,
  type CloudSessionInfo,
} from '@/lib/tauri';
import {
  normalizeCloudError,
  type CloudFailure,
  type CloudOutcome,
} from '@/services/cloudDocService';

export const DEFAULT_CLOUD_BASE_URL = 'https://note.lizipro.cn/lizi';

/** 服务端登录响应头，桌面端由 Rust 读取，Web 构建在这里读取。 */
const AUTHORIZATION_HEADER = 'X-Authorization-Lizi';

export interface CloudLoginInput {
  baseUrl?: string | null;
  username: string;
  password: string;
}

interface WebCloudSession {
  token: string;
  baseUrl: string;
  userId: string | null;
  username: string | null;
}

/**
 * Web 构建的会话只存在于模块内存，刷新页面即失效；
 * 这里刻意不使用 localStorage/sessionStorage 保存 token。
 */
let webSession: WebCloudSession | null = null;

/**
 * 归一化云文档服务器地址：缺省用默认地址，必须带 http(s) scheme，去掉尾部斜杠。
 * 非法地址抛出 Error，由 loginToLizi 转成 CloudOutcome 失败结果。
 */
export function normalizeCloudBaseUrl(raw?: string | null): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return DEFAULT_CLOUD_BASE_URL;
  }

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    throw new Error('云文档服务器地址必须以 http:// 或 https:// 开头');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('云文档服务器地址格式不正确');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('云文档服务器地址必须以 http:// 或 https:// 开头');
  }

  // 丢弃 query/hash，仅保留 origin + path，避免拼接出 /user/login?x=1。
  return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
}

function describeBaseUrlError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : '云文档服务器地址格式不正确';
}

async function readJsonBody(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await response.json();
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function readBodyCode(body: Record<string, unknown> | null): string {
  if (!body) return '';
  const raw = body.code;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  if (typeof raw === 'string' && raw.trim()) return raw.trim().toUpperCase();
  return '';
}

function readBodyMessage(body: Record<string, unknown> | null): string {
  if (!body) return '';
  const raw = body.message;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : '';
}

/** 服务端统一返回体 {success, code, message, data}：HTTP 200 时也要看 code。 */
function webResultFailure(
  response: Response,
  body: Record<string, unknown> | null,
): CloudFailure | null {
  const code = readBodyCode(body);
  const message = readBodyMessage(body);

  if (!response.ok) {
    const normalized = normalizeCloudError({
      code: code || String(response.status),
      message: message || `云端请求失败（HTTP ${response.status}）`,
    });
    return { ok: false, kind: normalized.kind, message: normalized.message };
  }

  if (body === null) {
    return { ok: false, kind: 'unknown', message: '云端响应格式不正确' };
  }

  if (body.success === false || (code !== '' && code !== '200')) {
    const normalized = normalizeCloudError({
      code: code || 'SERVER_ERROR',
      message: message || '云端请求失败',
    });
    return { ok: false, kind: normalized.kind, message: normalized.message };
  }

  return null;
}

function networkFailure(error: unknown): CloudFailure {
  const normalized = normalizeCloudError(error);
  return {
    ok: false,
    kind: normalized.kind === 'unknown' ? 'network' : normalized.kind,
    message: normalized.message,
  };
}

function webSessionInfo(session: WebCloudSession): CloudSessionInfo {
  return {
    signedIn: true,
    userId: session.userId,
    username: session.username,
    baseUrl: session.baseUrl,
  };
}

async function loginOnDesktop(
  baseUrl: string,
  username: string,
  password: string,
): Promise<CloudOutcome<CloudSessionInfo>> {
  try {
    const session = await cloudCommands.login(baseUrl, username, password);
    return { ok: true, data: session };
  } catch (error) {
    const normalized = normalizeCloudError(error);
    return { ok: false, kind: normalized.kind, message: normalized.message };
  }
}

async function loginOnWeb(
  baseUrl: string,
  username: string,
  password: string,
): Promise<CloudOutcome<CloudSessionInfo>> {
  let loginResponse: Response;
  try {
    loginResponse = await fetch(`${baseUrl}/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password }),
    });
  } catch (error) {
    return networkFailure(error);
  }

  const loginBody = await readJsonBody(loginResponse);
  const token = loginResponse.headers.get(AUTHORIZATION_HEADER);
  const loginFailure = webResultFailure(loginResponse, loginBody);
  if (loginFailure) {
    return loginFailure;
  }
  if (!token) {
    return {
      ok: false,
      kind: 'unknown',
      message: '登录响应缺少授权令牌，请确认服务器地址是否为 lizi 服务端',
    };
  }

  let meResponse: Response;
  try {
    meResponse = await fetch(`${baseUrl}/miniProgram/cloud/docs/me`, {
      headers: { [AUTHORIZATION_HEADER]: token },
    });
  } catch (error) {
    return networkFailure(error);
  }

  const meBody = await readJsonBody(meResponse);
  const meFailure = webResultFailure(meResponse, meBody);
  if (meFailure) {
    return meFailure;
  }

  const data = meBody?.data;
  let userId: string | null = null;
  if (typeof data === 'object' && data !== null) {
    const candidate = (data as { userId?: unknown }).userId;
    if (typeof candidate === 'number' || typeof candidate === 'string') {
      userId = String(candidate);
    }
  }

  webSession = { token, baseUrl, userId, username };
  return { ok: true, data: webSessionInfo(webSession) };
}

export async function loginToLizi(
  input: CloudLoginInput,
): Promise<CloudOutcome<CloudSessionInfo>> {
  const username = input.username?.trim() ?? '';
  if (!username || !input.password) {
    return { ok: false, kind: 'unknown', message: '请输入用户名和密码' };
  }

  let baseUrl: string;
  try {
    baseUrl = normalizeCloudBaseUrl(input.baseUrl);
  } catch (error) {
    return { ok: false, kind: 'unknown', message: describeBaseUrlError(error) };
  }

  if (isTauriApp()) {
    return loginOnDesktop(baseUrl, username, input.password);
  }

  return loginOnWeb(baseUrl, username, input.password);
}

export async function logoutFromLizi(): Promise<CloudOutcome<void>> {
  if (!isTauriApp()) {
    webSession = null;
    return { ok: true, data: undefined };
  }

  try {
    await cloudCommands.logout();
    return { ok: true, data: undefined };
  } catch (error) {
    const normalized = normalizeCloudError(error);
    return { ok: false, kind: normalized.kind, message: normalized.message };
  }
}

/**
 * 恢复已有会话。桌面端读 keyring 中的会话，Web 构建读模块内存；
 * 没有会话时返回 ok + null，只有真实错误才返回失败结果。
 */
export async function restoreCloudSession(): Promise<CloudOutcome<CloudSessionInfo | null>> {
  if (!isTauriApp()) {
    if (!webSession) {
      return { ok: true, data: null };
    }
    return { ok: true, data: webSessionInfo(webSession) };
  }

  try {
    const session = await cloudCommands.session();
    return { ok: true, data: session.signedIn ? session : null };
  } catch (error) {
    const normalized = normalizeCloudError(error);
    if (normalized.kind === 'unsupported') {
      return { ok: true, data: null };
    }
    console.warn('[CloudAuth] 读取云端会话失败:', normalized.message);
    return { ok: false, kind: normalized.kind, message: normalized.message };
  }
}
