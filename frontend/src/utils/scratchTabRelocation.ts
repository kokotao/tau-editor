/**
 * @description 临时工作区「另存到工作区」后，把仍指向旧根的已打开标签重定位到新根（纯函数，便于表驱动测试）
 * @author Albert_Luo
 * @date 2026-10-27
 */

/** 规划只关心这几项，避免把 Pinia 的 Tab 类型带进纯函数 */
export interface ScratchTabLike {
  id: string;
  filePath: string | null;
  isUntitled?: boolean;
}

export interface ScratchTabMove {
  tabId: string;
  fromPath: string;
  toPath: string;
}

export type ScratchTabSkipReason = 'occupied-by-tab' | 'not-copied';

export interface ScratchTabSkip {
  tabId: string;
  fromPath: string;
  toPath: string;
  reason: ScratchTabSkipReason;
}

export interface ScratchTabPlan {
  moves: ScratchTabMove[];
  skipped: ScratchTabSkip[];
}

export interface ScratchTabPlanInput {
  tabs: readonly ScratchTabLike[];
  /** 旧根：临时工作区目录 */
  fromRoot: string;
  /** 新根：用户选定的正式工作区目录 */
  toRoot: string;
  /** 本轮真正复制过去的相对路径；缺省表示不校验，旧根下的文件一律可迁移 */
  copiedRelativePaths?: readonly string[];
}

/** 统一分隔符并去掉尾部斜杠（长度不变，切片时才敢按根长度截断） */
const toSlashes = (path: string): string => path.replace(/\\/g, '/').replace(/\/+$/, '');

const isDrivePath = (path: string): boolean => /^[a-zA-Z]:/.test(toSlashes(path));

/** 比较键：Windows 盘符路径大小写不敏感（与 normalizeCloudPath 同一约定），其余保持大小写 */
const pathKey = (path: string): string => {
  const slashed = toSlashes(path);
  return isDrivePath(slashed) ? slashed.toLowerCase() : slashed;
};

const relativeKey = (path: string): string => path.replace(/\\/g, '/').replace(/^\/+/, '');

/**
 * 取 path 相对 root 的部分；不在 root 之下（或恰好是 root 本身）返回 null。
 *
 * 只在小写化后的键上做前缀比较，切片仍用原串，保证 Windows 上文件名大小写不被改写。
 */
const relativeUnder = (path: string, root: string): string | null => {
  const slashedPath = toSlashes(path);
  const slashedRoot = toSlashes(root);
  if (!slashedRoot) {
    return null;
  }

  const key = pathKey(slashedPath);
  const rootKey = pathKey(slashedRoot);
  if (key === rootKey || !key.startsWith(`${rootKey}/`)) {
    return null;
  }

  return slashedPath.slice(slashedRoot.length + 1);
};

/**
 * 规划标签重定位：只改路径，不涉及内容与脏标记。
 *
 * - 不在旧根下的标签原样保留，也不计入 skipped（与本次另存无关）
 * - 目标已被别的标签打开（含本轮已规划的目标）→ skipped，交给调用方提示一次，不静默覆盖
 * - 给了 copiedRelativePaths 而该文件没被真正复制过去 → skipped，避免指针指向不存在的文件
 */
export function planScratchTabMoves(input: ScratchTabPlanInput): ScratchTabPlan {
  const { tabs, fromRoot, toRoot, copiedRelativePaths } = input;
  const plan: ScratchTabPlan = { moves: [], skipped: [] };

  if (!fromRoot.trim() || !toRoot.trim() || pathKey(fromRoot) === pathKey(toRoot)) {
    return plan;
  }

  const copiedKeys = copiedRelativePaths
    ? new Set(copiedRelativePaths.map((path) => relativeKey(path)))
    : null;

  const occupiedKeys = new Set<string>();
  for (const tab of tabs) {
    if (typeof tab.filePath === 'string' && tab.filePath.trim()) {
      occupiedKeys.add(pathKey(tab.filePath));
    }
  }

  const plannedKeys = new Set<string>();
  for (const tab of tabs) {
    const filePath = tab.filePath;
    if (tab.isUntitled || !filePath || !filePath.trim()) {
      continue;
    }

    const relativePath = relativeUnder(filePath, fromRoot);
    if (relativePath === null) {
      continue;
    }

    const toPath = `${toSlashes(toRoot)}/${relativePath}`;
    const targetKey = pathKey(toPath);
    const skip = { tabId: tab.id, fromPath: filePath, toPath };

    if (copiedKeys && !copiedKeys.has(relativeKey(relativePath))) {
      plan.skipped.push({ ...skip, reason: 'not-copied' });
      continue;
    }

    if (occupiedKeys.has(targetKey) || plannedKeys.has(targetKey)) {
      plan.skipped.push({ ...skip, reason: 'occupied-by-tab' });
      continue;
    }

    plannedKeys.add(targetKey);
    plan.moves.push({ tabId: tab.id, fromPath: filePath, toPath });
  }

  return plan;
}
