/**
 * @description 云文档新建（R1）：文件名净化、云端路径生成与「保存空正文即创建」。
 *
 * 后端没有独立的新建接口：`cloud_docs_save` 在 `path` 不存在时创建、存在时按 `baseVersion` 更新，
 * 因此「新建」等价于对不存在路径保存一次空正文。创建前先用 `findCloudDocByPath` 预检重名，
 * 命中时直接返回 conflict，不发起保存（避免产生第二篇同名文档或被静默覆盖）。
 * 创建成功后由宿主（App.vue）走既有落位 + 打开链路，这里不写本地文件。
 *
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-28
 */
import { findCloudDocByPath, saveCloudDoc, type CloudOutcome } from '@/services/cloudDocService';
import { toCloudDocPath } from '@/services/cloudSyncService';
import { createEmptyMindMapDocument, serializeMindMapDocument } from '@/services/mindmapService';
import { extensionOfPath, isTextDocPath } from '@/services/cloudUploadPolicy';

/** 文件名里禁止出现的字符：Windows 保留字符 `\ / : * ? " < > |`（含路径分隔符）。 */
const FORBIDDEN_NAME_CHARS = /[\\/:*?"<>|]/;

/** 未指定扩展名时自动补的默认扩展名（D1：新建的是一篇可编辑文本文档）。 */
export const DEFAULT_NEW_DOC_EXTENSION = '.md';

/** 文件名长度上限：云端路径整串上限 512，这里为 `tau/<workspace>/` 前缀留出余量。 */
export const NEW_DOC_NAME_MAX_LENGTH = 120;

/** 没有工作区、也没有分类名时的兜底路径段（D2）。 */
export const NEW_DOC_FALLBACK_SEGMENT = '未分类';

/** 文件名不可用的原因码：UI 统一映射成 `panel.newFileInvalid`，日志里保留具体原因。 */
export type NewDocNameError = 'empty' | 'invalid-chars' | 'dot-dot' | 'too-long';

export type NewDocNameResult =
  | { ok: true; name: string }
  | { ok: false; reason: NewDocNameError };

/** 是否已经带扩展名（`.md` 这类纯扩展名按「没有扩展名」处理，避免生成 `.md.md`）。 */
function hasExtension(name: string): boolean {
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1;
}

/**
 * 净化用户输入的文件名：
 * - 去首尾空白；空名、含 `..`、含 Windows 保留字符、超长一律拒绝；
 * - 没有扩展名时自动补 `.md`（设计决策 D1：默认创建 markdown 文档）。
 */
export function sanitizeNewDocName(raw: string | null | undefined): NewDocNameResult {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return { ok: false, reason: 'empty' };
  }
  if (trimmed.includes('..')) {
    return { ok: false, reason: 'dot-dot' };
  }
  if (FORBIDDEN_NAME_CHARS.test(trimmed)) {
    return { ok: false, reason: 'invalid-chars' };
  }
  const name = hasExtension(trimmed) ? trimmed : `${trimmed}${DEFAULT_NEW_DOC_EXTENSION}`;
  if (name.length > NEW_DOC_NAME_MAX_LENGTH) {
    return { ok: false, reason: 'too-long' };
  }
  return { ok: true, name };
}

/**
 * 解析路径里的工作区段（D2 的兜底链）：
 * 当前工作区名 → 右键的分类名 → `未分类`。
 */
export function resolveNewDocWorkspaceSegment(
  workspaceName: string | null | undefined,
  categoryName?: string | null,
): string {
  const workspace = (workspaceName ?? '').trim();
  if (workspace) {
    return workspace;
  }
  const category = (categoryName ?? '').trim();
  return category || NEW_DOC_FALLBACK_SEGMENT;
}

/** 云端路径 `tau/<workspace>/<fileName>`（复用云同步的路径规范化与 512 截断）。 */
export function buildNewCloudDocPath(
  workspaceName: string | null | undefined,
  fileName: string,
): string {
  return toCloudDocPath(workspaceName, fileName);
}

export interface CreateCloudDocFileInput {
  /** 用户输入的原始文件名（内部会净化并补 `.md`） */
  fileName: string;
  /** 当前工作区名：没有时按 D2 退回分类名 */
  workspaceName?: string | null;
  /** 目标分类 id（`cat:<id>` 节点）；未分类 / 聚合分组为 null */
  categoryId?: string | null;
  /** 目标分类自由文本（与 categoryId 一起下发；未分类为空） */
  categoryName?: string | null;
}

/**
 * 新建文件的初始正文。
 *
 * `.taumap` 必须写入一份合法的空思维导图 JSON：空正文会让编辑器打开时
 * 直接报「思维导图文件不是合法的 JSON」，用户无法开始创作。
 */
export function initialCloudDocContent(fileName: string): string {
  if (extensionOfPath(fileName) !== 'taumap') {
    return '';
  }
  const title = fileName.replace(/\.taumap$/i, '').trim() || '未命名思维导图';
  return serializeMindMapDocument(createEmptyMindMapDocument(title));
}

/** 新建结果：fileId/version/contentHash/cloudPath 是宿主落位必需的；size/updatedAt 供合成树节点展示。 */
export interface CloudDocCreateResult {
  fileId: number;
  version: number;
  contentHash: string;
  cloudPath: string;
  size: number;
  updatedAt: string | null;
}

/**
 * 在云端新建一篇空文档。
 *
 * 流程：净化文件名 → 生成 `tau/<workspace>/<name>` → 路径预检 → 保存空正文。
 * 预检命中同名（或 `unknown` 之外的错误）都原样返回，调用方按 `kind` 展示：
 * `conflict` = 同名已存在（换名），其它 = 失败原因。
 */
export async function createCloudDocFile(
  input: CreateCloudDocFileInput,
): Promise<CloudOutcome<CloudDocCreateResult>> {
  const sanitized = sanitizeNewDocName(input.fileName);
  if (!sanitized.ok) {
    return { ok: false, kind: 'unknown', message: '文件名不可用' };
  }

  // 与后端白名单提前对齐：不支持的类型直接给出可读原因，避免服务端 400 才暴露
  if (!isTextDocPath(sanitized.name)) {
    return {
      ok: false,
      kind: 'unsupported',
      message: `云端暂不支持该文件类型（${extensionOfPath(sanitized.name) ? '.' + extensionOfPath(sanitized.name) : '无扩展名'}），请使用文本类扩展名（如 .md / .taumap）`,
    };
  }

  const categoryName = (input.categoryName ?? '').trim();
  const workspaceSegment = resolveNewDocWorkspaceSegment(input.workspaceName, categoryName);
  const cloudPath = buildNewCloudDocPath(workspaceSegment, sanitized.name);

  const existing = await findCloudDocByPath(cloudPath);
  if (!existing.ok) {
    return { ok: false, kind: existing.kind, message: existing.message };
  }
  if (existing.data) {
    return { ok: false, kind: 'conflict', message: '云端已存在同名文档' };
  }

  const saved = await saveCloudDoc({
    path: cloudPath,
    title: sanitized.name,
    content: initialCloudDocContent(sanitized.name),
    baseVersion: null,
    // 未分类：category 传空串会让服务端造出一个假的「未分类」聚合分组，因此归一成 null
    category: categoryName || null,
    categoryId: input.categoryId ?? null,
  });
  if (!saved.ok) {
    return { ok: false, kind: saved.kind, message: saved.message };
  }

  return {
    ok: true,
    data: {
      fileId: saved.data.fileId,
      version: saved.data.version,
      contentHash: saved.data.contentHash,
      cloudPath,
      size: saved.data.size,
      updatedAt: saved.data.updatedAt ?? null,
    },
  };
}
