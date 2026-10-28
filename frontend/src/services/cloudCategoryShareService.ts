/**
 * @description 云端文件夹（分类）一键分享：status / create / revoke 三条管理端命令的 CloudOutcome 包装、
 * 分享域名解析与完整链接拼装。
 *
 * 契约（设计文档 §4.1）：`POST/GET/DELETE /miniProgram/cloud/categories/{categoryId}/folder-share`。
 * 响应里的 `url` 是**相对短链** `/s/f/{token}`，完整链接必须按分享域名拼装（与 CloudShareService 的
 * `resolveShareBaseUrl` 保持一致：优先后端 share config，退回登录服务器地址的同源根）。
 * 同一用户对同一分类只有一条记录：再次 POST = 换 token（旧链接立即失效），DELETE = 撤销。
 *
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-28
 */
import {
  cloudCommands,
  isTauriApp,
  type CloudCategoryShareCreatePayload,
  type CloudCategoryShareInfo,
} from '@/lib/tauri';
import { normalizeCloudError, type CloudOutcome } from '@/services/cloudDocService';
import { fetchShareConfig, resolveShareBaseUrl } from '@/services/cloudShareService';
import { useCloudSyncStore } from '@/stores/cloudSync';

const WEB_UNSUPPORTED_MESSAGE = '当前是 Web 构建，云文档分享仅在 Tauri 桌面端可用。';

/** 文件夹分享短链前缀：后端 url 字段缺失时按 token 兜底拼装。 */
export const FOLDER_SHARE_URL_PREFIX = '/s/f/';

function unsupported<T>(): CloudOutcome<T> {
  return { ok: false, kind: 'unsupported', message: WEB_UNSUPPORTED_MESSAGE };
}

function failure<T>(error: unknown): CloudOutcome<T> {
  const normalized = normalizeCloudError(error);
  return { ok: false, kind: normalized.kind, message: normalized.message };
}

/** 未分享时的空状态：UI 不用到处判空，直接按 `shared` 分支渲染。 */
export function emptyCategoryShareInfo(): CloudCategoryShareInfo {
  return {
    shared: false,
    token: null,
    url: null,
    hasPassword: false,
    expiresAt: null,
    includeSubCategories: true,
    docCount: 0,
    created: false,
  };
}

/**
 * 拼完整分享链接：
 * 1. 后端给了绝对地址 → 原样返回（后端换域名时不会被前端拼错）；
 * 2. 相对短链 `/s/f/{token}` → `{base}{url}`；
 * 3. 只有 token → `{base}/s/f/{token}`；两者都没有 → 空串。
 */
export function buildFolderShareUrl(
  baseUrl: string | null | undefined,
  info: { url?: string | null; token?: string | null } | null | undefined,
): string {
  const explicit = (info?.url ?? '').trim();
  if (/^https?:\/\//i.test(explicit)) {
    return explicit;
  }
  const cleanBase = (baseUrl ?? '').trim().replace(/\/+$/, '');
  const token = (info?.token ?? '').trim();
  const path = explicit || (token ? `${FOLDER_SHARE_URL_PREFIX}${token}` : '');
  if (!path) {
    return '';
  }
  if (!cleanBase) {
    return path;
  }
  return `${cleanBase}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** 解析分享域名：优先后端 config 的 `shareBaseUrl`，取不到退回登录服务器地址的同源根。 */
export async function resolveFolderShareBaseUrl(): Promise<string> {
  const configOutcome = await fetchShareConfig();
  const cloudSyncStore = useCloudSyncStore();
  return resolveShareBaseUrl(configOutcome.ok ? configOutcome.data : null, cloudSyncStore.baseUrl);
}

/** 查询文件夹分享状态（未分享返回 `shared: false`）。 */
export async function getCategoryShareStatus(
  categoryId: string,
): Promise<CloudOutcome<CloudCategoryShareInfo>> {
  if (!isTauriApp()) {
    return unsupported<CloudCategoryShareInfo>();
  }
  const id = (categoryId ?? '').trim();
  if (!id) {
    return { ok: false, kind: 'unknown', message: '缺少分类 id' };
  }
  try {
    return { ok: true, data: await cloudCommands.categoryShareStatus(id) };
  } catch (error) {
    return failure<CloudCategoryShareInfo>(error);
  }
}

/**
 * 创建（或重新生成）文件夹分享链接。
 *
 * 空 payload = 只换 token：password / expiresInDays 缺省表示「不修改」，
 * 因此「重新生成」不会把已设置的密码或有效期清掉。
 */
export async function createCategoryShare(
  categoryId: string,
  payload: CloudCategoryShareCreatePayload = {},
): Promise<CloudOutcome<CloudCategoryShareInfo>> {
  if (!isTauriApp()) {
    return unsupported<CloudCategoryShareInfo>();
  }
  const id = (categoryId ?? '').trim();
  if (!id) {
    return { ok: false, kind: 'unknown', message: '缺少分类 id' };
  }
  try {
    return { ok: true, data: await cloudCommands.categoryShareCreate(id, payload) };
  } catch (error) {
    return failure<CloudCategoryShareInfo>(error);
  }
}

/** 撤销文件夹分享：旧链接立即 404。 */
export async function revokeCategoryShare(categoryId: string): Promise<CloudOutcome<void>> {
  if (!isTauriApp()) {
    return unsupported<void>();
  }
  const id = (categoryId ?? '').trim();
  if (!id) {
    return { ok: false, kind: 'unknown', message: '缺少分类 id' };
  }
  try {
    await cloudCommands.categoryShareRevoke(id);
    return { ok: true, data: undefined };
  } catch (error) {
    return failure<void>(error);
  }
}
