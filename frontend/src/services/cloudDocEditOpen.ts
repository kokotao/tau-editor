/**
 * @description 云文档「可编辑打开」落位服务：把云端文档落到该云工作区对应的本地临时工作区，
 * 返回绝对路径 + 云端版本/内容哈希，交给宿主打开标签并绑定 `cloudFileId/cloudVersion/cloudContentHash`，
 * 之后内容变化就走既有的自动保存流水线（cloudDocSaveController）编辑、更新、同步回云端。
 *
 * 只读预览已被这条链路取代：预览看得到改不了，用户要的是直接在编辑器里改。
 *
 * 设计要点：
 * - 云端路径才是文档身份：`cloudPath` 原样（仅统一分隔符）随 target 返回，保存时必须用它，
 *   绝不因为“落位到临时目录”就把云端路径搬家；
 * - 本地落点用 `cloudCommands.scratchWorkspace(workspaceName)`（Rust 侧确保目录存在并返回绝对路径），
 *   即“同一个云工作区 → 同一个本地临时工作区”，同一文档反复打开永远是同一个绝对路径（幂等）；
 * - 父目录补全：`fileCommands.writeFile` 走的 Rust 命令 `write_file` 内部已经
 *   `fs::create_dir_all(parent)`（见 frontend/src-tauri/src/commands/file.rs），因此这里不再
 *   额外调 `@tauri-apps/plugin-fs` 的 mkdir，少一次 IPC 也少一份权限面；
 * - 目标文件已存在时直接覆盖：这是“本次打开的新鲜落位”，以云端内容为准；
 * - 纯逻辑（路径解析/拼接）与 I/O（IPC）分离，单测可只 mock 命令。
 *
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-27 10:05
 */
import { cloudCommands, fileCommands } from '@/lib/tauri';
import { getCloudDoc, normalizeCloudError } from '@/services/cloudDocService';

/** 云端路径的统一前缀：`tau/<workspace>/<relative...>` */
const CLOUD_PATH_PREFIX = 'tau';

/** 落位成功后交给宿主的编辑目标。 */
export interface CloudDocEditTarget {
  fileId: number;
  /** 云端完整路径（保存时要原样透传，不能因落位而“搬家”） */
  cloudPath: string;
  title: string;
  /** 本地临时工作区里的绝对路径 */
  absolutePath: string;
  version: number;
  contentHash: string;
}

export type MaterializeResult =
  | { ok: true; target: CloudDocEditTarget }
  | { ok: false; kind: string; message: string };

/**
 * 云端路径的解析结果。
 * `relativePath` 统一用 `/` 分隔（云端路径与本地拼接都不依赖平台分隔符）。
 */
export interface ParsedCloudDocPath {
  workspaceName: string;
  relativePath: string;
  /** 归一化后的云端完整路径：`tau/<workspace>/<relative...>`（保存时用它） */
  normalizedPath: string;
  /** 文件名（等于 relativePath 的最后一段），避免调用方再切一次 */
  fileName: string;
}

/** 段落里出现这些内容说明路径不可信（`..` 穿越、盘符/ADS、空段）。 */
function isUnsafeSegment(segment: string): boolean {
  if (!segment || segment === '.' || segment === '..') {
    return true;
  }
  // Windows 盘符（`C:`）与 NTFS 备用数据流（`a.md:evil`）都会把落点带出工作区
  if (segment.includes(':') || segment.includes('\0')) {
    return true;
  }
  return false;
}

/**
 * 解析云端路径 `tau/<workspace>/<relative...>`（纯函数）。
 *
 * 合法示例：`tau/分享/a.md` → { workspaceName: '分享', relativePath: 'a.md' }；
 * 深层示例：`tau/proj/src/app/main.ts` → relativePath 'src/app/main.ts'。
 *
 * 非法（返回 null，调用方报 `invalid-path`）：非 `tau/` 前缀、只有工作区没有文件名、
 * 空路径、含 `..` 穿越或盘符段。
 */
export function parseCloudDocEditPath(cloudPath: string): ParsedCloudDocPath | null {
  if (typeof cloudPath !== 'string') {
    return null;
  }
  const segments = cloudPath
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment.length > 0);

  // 至少要有「tau / 工作区 / 文件名」三段，否则没有可落位的文件
  if (segments.length < 3) {
    return null;
  }
  if (segments[0] !== CLOUD_PATH_PREFIX) {
    return null;
  }
  const workspaceName = segments[1] as string;
  const relativeSegments = segments.slice(2);
  if (isUnsafeSegment(workspaceName) || relativeSegments.some(isUnsafeSegment)) {
    return null;
  }
  const fileName = relativeSegments[relativeSegments.length - 1] as string;

  return {
    workspaceName,
    relativePath: relativeSegments.join('/'),
    normalizedPath: [CLOUD_PATH_PREFIX, workspaceName, ...relativeSegments].join('/'),
    fileName,
  };
}

/**
 * 把相对路径拼到临时工作区根目录上（纯函数）。
 *
 * 统一 `/` 分隔：Windows（`C:\...`）与 POSIX（`/tmp/...`）都接受 `/`，
 * 也保证同一路径在日志/测试里的表现稳定。根目录的盘符大小写保持 Rust 原样。
 */
export function joinScratchPath(workspaceRoot: string, relativePath: string): string {
  // 根目录只做分隔符归一与去尾斜杠：UNC 的 `//server/share` 不能被“压缩重复斜杠”破坏
  const base = (workspaceRoot ?? '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const relative = (relativePath ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment.length > 0)
    .join('/');
  if (!base) {
    return relative;
  }
  return relative ? `${base}/${relative}` : base;
}

/**
 * 云文档落位并返回编辑目标（有 I/O，命令可被单测 mock）。
 *
 * 失败分类：
 * - `invalid-path`：云端路径解析不出工作区/文件名，或 fileId 非法；
 * - `unsupported`：云端没有可下载的文本内容（二进制/超大/未同步）；
 * - `workspace-failed`：临时工作区建不出来（Rust `cloud_scratch_workspace` 失败）；
 * - `write-failed`：写本地临时文件失败；
 * - getCloudDoc 的 `kind/message` 原样透传（unauthorized / forbidden / conflict / network / quota…）。
 */
export async function materializeCloudDocForEdit(input: {
  fileId: number;
  cloudPath: string;
  title: string;
}): Promise<MaterializeResult> {
  const fileId = Number(input.fileId);
  if (!Number.isFinite(fileId) || fileId <= 0) {
    return { ok: false, kind: 'invalid-path', message: `云文档 fileId 无效：${String(input.fileId)}` };
  }

  const parsed = parseCloudDocEditPath(input.cloudPath);
  if (!parsed) {
    return {
      ok: false,
      kind: 'invalid-path',
      message: `云文档路径无法映射到本地工作区：${input.cloudPath}`,
    };
  }

  // 先取云端详情：拿不到正文就没必要建目录
  const detailOutcome = await getCloudDoc(fileId);
  if (!detailOutcome.ok) {
    return { ok: false, kind: detailOutcome.kind, message: detailOutcome.message };
  }
  const detail = detailOutcome.data;
  const content = detail.content;
  if (content === null || content === undefined) {
    return { ok: false, kind: 'unsupported', message: '该文档没有可下载的文本内容' };
  }

  // 同一个云工作区的临时目录固定：重复打开是幂等的（同一 target.absolutePath）
  let workspaceRoot: string;
  try {
    workspaceRoot = await cloudCommands.scratchWorkspace(parsed.workspaceName);
  } catch (error) {
    return { ok: false, kind: 'workspace-failed', message: normalizeCloudError(error).message };
  }
  if (!workspaceRoot || !workspaceRoot.trim()) {
    return {
      ok: false,
      kind: 'workspace-failed',
      message: `无法创建云工作区临时目录：${parsed.workspaceName}`,
    };
  }

  const absolutePath = joinScratchPath(workspaceRoot, parsed.relativePath);
  try {
    // 已有同名文件时直接覆盖：以云端内容为准（本次打开的新鲜落位）。
    // 父目录由 Rust `write_file` 内部 create_dir_all 补齐，这里不需要单独 mkdir。
    await fileCommands.writeFile(absolutePath, content);
  } catch (error) {
    return { ok: false, kind: 'write-failed', message: normalizeCloudError(error).message };
  }

  const title = input.title.trim() || detail.title || parsed.fileName;
  const version = Number.isFinite(detail.version) ? Math.trunc(detail.version) : 0;
  const contentHash = typeof detail.contentHash === 'string' ? detail.contentHash : '';

  return {
    ok: true,
    target: {
      fileId,
      cloudPath: parsed.normalizedPath,
      title,
      absolutePath,
      version,
      contentHash,
    },
  };
}
