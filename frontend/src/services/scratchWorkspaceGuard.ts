/**
 * @description 冷启动兜底：持久化的临时工作区（scratch）目录可能已被系统清理，别让界面假装它还在
 * @author Albert_Luo
 * @date 2026-10-27
 */
import type { useWorkspaceStore } from '@/stores/workspace';

type WorkspaceStore = ReturnType<typeof useWorkspaceStore>;

export interface ScratchWorkspaceGuardDeps {
  /**
   * 探测目录是否仍存在。
   *
   * 返回 null 表示"探测不确定"（IPC 失败、权限问题等）；调用方据此保守处理，不误清。
   */
  probeDirectoryExists: (path: string) => Promise<boolean | null>;
  /** 目录确已被清理时，给用户一次可读的提示 */
  notifyCleared: (path: string) => void;
}

export type ScratchWorkspaceGuardResult = 'kept' | 'cleared' | 'skipped';

/**
 * 冷启动时校验持久化的工作区是否还能用。
 *
 * - 非 scratch 来源（user/silent）或没有工作区：'skipped'，一律不动
 * - scratch 目录仍在，或探测结果不确定：'kept'，保持原样
 * - scratch 目录确实没了：清掉工作区上下文（回 empty 模式）+ 提示一次，返回 'cleared'
 *
 * 不重建目录：临时目录被清理意味着里面的文件已经不在了，重建只会显示一个空树。
 */
export async function guardPersistedScratchWorkspace(
  workspaceStore: WorkspaceStore,
  deps: ScratchWorkspaceGuardDeps,
): Promise<ScratchWorkspaceGuardResult> {
  const workspacePath = workspaceStore.currentWorkspacePath;
  if (workspaceStore.workspaceOrigin !== 'scratch' || !workspacePath) {
    return 'skipped';
  }

  let exists: boolean | null;
  try {
    exists = await deps.probeDirectoryExists(workspacePath);
  } catch {
    exists = null;
  }

  // 只有"确认不存在"才动手，不确定就留着，宁可多显示一个失效工作区也别误清用户上下文
  if (exists !== false) {
    return 'kept';
  }

  if (!workspaceStore.clearScratchWorkspaceContext()) {
    return 'skipped';
  }

  deps.notifyCleared(workspacePath);
  return 'cleared';
}
