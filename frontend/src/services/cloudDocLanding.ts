/**
 * @description 云文档落位解析：无工作区时决定静默打开哪个工作区 / 落到临时工作区
 * @author Albert_Luo
 * @date 2026-10-26
 */
import type { RecentProject } from '@/stores/workspace';

export type CloudLandingKind = 'inPlace' | 'silentOpen' | 'scratch';
export type CloudLandingSource = 'current' | 'binding' | 'recent' | 'scratch';

/** 云文档工作区绑定：记住某个 workspaceName 上次落在本机哪个目录 */
export interface CloudWorkspaceBinding {
  path: string;
  lastUsedAt: number;
  origin: 'user' | 'silent' | 'scratch';
}

export interface CloudLanding {
  kind: CloudLandingKind;
  source: CloudLandingSource;
  /** scratch 时为 null：目录由调用方创建后再回填 */
  workspacePath: string | null;
  workspaceName: string;
  /** 绑定存在但目录已不在：用于提示"原工作区已不存在" */
  staleBinding: boolean;
  stalePath: string | null;
}

export interface LandingContext {
  currentWorkspacePath: string | null;
  currentWorkspaceName: string | null;
  bindings: Record<string, CloudWorkspaceBinding>;
  recentProjects: RecentProject[];
  /** 已确认存在的目录（必须用 normalizeCloudPath 规范化后放入） */
  existingPaths: Set<string>;
}

const CLOUD_PATH_PREFIX = 'tau/';

/**
 * 路径规范化：统一分隔符、去尾部斜杠；Windows 盘符路径大小写不敏感，统一转小写。
 */
export function normalizeCloudPath(path: string): string {
  const normalized = path.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  return /^[a-zA-Z]:/.test(normalized) ? normalized.toLowerCase() : normalized;
}

/**
 * 从 `tau/{workspaceName}/{relative}` 还原工作区名。
 *
 * 只有工作区目录本身（无文件名）、或前缀不是 `tau/` 时返回 null——
 * 这类路径反查不出工作区，调用方应保持"需要工作区"的原行为。
 */
export function cloudWorkspaceNameFromPath(cloudPath: string): string | null {
  const normalized = normalizeCloudPath(cloudPath).replace(/^\/+/, '');
  if (!normalized.startsWith(CLOUD_PATH_PREFIX)) {
    return null;
  }
  const rest = normalized.slice(CLOUD_PATH_PREFIX.length);
  const segments = rest.split('/');
  if (segments.length < 2) {
    return null;
  }
  const segment = segments[0]?.trim();
  if (!segment || segment === '.' || segment === '..') {
    return null;
  }
  return segment;
}

/**
 * 落位解析链（纯函数，表驱动可测）。
 *
 * - 当前工作区同名 → inPlace
 * - 已有工作区但名字不同 → null（交回调用方走只读预览/另存为，不劫持上下文）
 * - 绑定的目录仍存在 → silentOpen(binding)
 * - 最近项目里恰好一个同名且存在 → silentOpen(recent)；同名多个不猜
 * - 其余 → scratch（临时工作区），绑定失效时带上 staleBinding 供提示
 */
export function resolveCloudDocLanding(cloudPath: string, context: LandingContext): CloudLanding | null {
  const workspaceName = cloudWorkspaceNameFromPath(cloudPath);
  if (!workspaceName) {
    return null;
  }

  if (context.currentWorkspacePath) {
    if (context.currentWorkspaceName === workspaceName) {
      return {
        kind: 'inPlace',
        source: 'current',
        workspacePath: context.currentWorkspacePath,
        workspaceName,
        staleBinding: false,
        stalePath: null,
      };
    }
    return null;
  }

  const binding = context.bindings[workspaceName];
  if (binding && context.existingPaths.has(normalizeCloudPath(binding.path))) {
    return {
      kind: 'silentOpen',
      source: 'binding',
      workspacePath: binding.path,
      workspaceName,
      staleBinding: false,
      stalePath: null,
    };
  }

  const candidates = context.recentProjects.filter(
    (project) => project.name === workspaceName && context.existingPaths.has(normalizeCloudPath(project.path)),
  );
  const [onlyCandidate] = candidates;
  if (candidates.length === 1 && onlyCandidate) {
    return {
      kind: 'silentOpen',
      source: 'recent',
      workspacePath: onlyCandidate.path,
      workspaceName,
      staleBinding: false,
      stalePath: null,
    };
  }

  const stalePath = binding?.path ?? null;
  return {
    kind: 'scratch',
    source: 'scratch',
    workspacePath: null,
    workspaceName,
    staleBinding: Boolean(stalePath),
    stalePath,
  };
}
