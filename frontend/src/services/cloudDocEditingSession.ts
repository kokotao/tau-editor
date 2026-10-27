/**
 * @description 云文档在线编辑流水线（纯逻辑，不做任何 I/O）：
 * 编辑基线 / 空写抑制 / 单飞保存队列 / 保存结果推进 / 409 三选一决策。
 * invoke 与网络调用一律由调用方注入（见 CloudDocSaveSnapshot 与 SaveQueueOptions.save），
 * 因此本模块可被 vitest 直接单测，不依赖 Tauri 运行时。
 * 方案依据：docs/plan/20261026140912046_云文档零工作区落位与在线编辑运维方案.md §3.2。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-26 15:20
 */
import type { CloudDocSaveResult } from '@/lib/tauri';

/**
 * 编辑基线的两种状态：
 * - `editing`：可以保存；
 * - `conflict`：收到过 409，必须等用户在「保留我的 / 用云端 / 另存副本」里选一个，
 *   期间禁止自动保存（§3.2「409 不自动重试」）。
 */
export type EditingSessionStatus = 'editing' | 'conflict';

export interface EditingSessionInput {
  fileId: number;
  /** 打开文档时 cloud_docs_get 返回的版本号，作为首个乐观锁基线 */
  version: number;
  /** 打开文档时云端内容的哈希，作为空写抑制的比对基准 */
  contentHash: string;
}

export interface EditingSession {
  fileId: number;
  /** 当前乐观锁基线：下次保存透传为 baseVersion；409 后保持旧值，绝不自动推进 */
  baseVersion: number;
  /** 云端已知内容的哈希（空写抑制的比对基准） */
  contentHash: string;
  status: EditingSessionStatus;
  /** 最近一次成功保存的时间戳（ms）；从未成功保存过为 null */
  lastSavedAt: number | null;
}

/**
 * 创建编辑基线。
 * 契约：只记录 `{ fileId, version → baseVersion, contentHash }`，不做 I/O；
 * 传入的 version 必须来自刚刚 GET 到的云端详情，否则第一次保存就会 409。
 */
export function createEditingSession(input: EditingSessionInput): EditingSession {
  const version = Number.isFinite(input.version) ? Math.trunc(input.version) : 0;
  return {
    fileId: input.fileId,
    baseVersion: version,
    contentHash: typeof input.contentHash === 'string' ? input.contentHash : '',
    status: 'editing',
    lastSavedAt: null,
  };
}

/**
 * 空写抑制判定。
 * 契约：`currentHash` 与基线哈希相同 → 返回 true（这次保存可以完全不发请求，省流量也省版本号）；
 * 以下两种情况必须返回 false：哈希未知（空串）无法证明「没变」，以及会话处于 conflict 态
 * 以外的正常可保存情况。conflict 态一律返回 true —— 409 之后不允许再自动写。
 */
export function shouldSkipSave(session: EditingSession, currentHash: string): boolean {
  if (session.status === 'conflict') {
    return true;
  }
  const next = typeof currentHash === 'string' ? currentHash.trim() : '';
  if (!next) {
    return false;
  }
  return next === session.contentHash;
}

/** 一次保存尝试的结果：与 cloudDocService 的 CloudOutcome<CloudDocSaveResult> 结构兼容，可原样传入。 */
export type SaveAttemptResult =
  | { ok: true; data: Pick<CloudDocSaveResult, 'version' | 'contentHash'> }
  | { ok: false; kind: string; message?: string };

export type SaveApplyStatus = 'applied' | 'conflict' | 'failed';

export interface SaveApplyOutcome {
  status: SaveApplyStatus;
  /** 原地更新后的同一个会话对象（便于链式读取基线） */
  session: EditingSession;
  /** failed / conflict 时的原始错误文案，供日志使用；applied 时为 null */
  message: string | null;
}

const CONFLICT_KINDS = new Set(['conflict', '409', 'version_conflict', 'file_conflict']);

/** 该次保存失败是否是版本冲突（409）。未归一化的原始 code 与 CloudErrorKind 都认。 */
export function isConflictResult(result: SaveAttemptResult): boolean {
  if (result.ok) {
    return false;
  }
  const kind = typeof result.kind === 'string' ? result.kind.trim().toLowerCase() : '';
  return CONFLICT_KINDS.has(kind);
}

/**
 * 应用一次保存结果并推进基线（原地更新 session，同时返回 status 供调用方分流）。
 * 契约：
 * - 成功 → baseVersion = data.version、contentHash = data.contentHash，状态回到 editing；
 * - 409  → status 置为 conflict，**baseVersion / contentHash 原样保留**（绝不推进基线，绝不自动覆盖）；
 * - 其它失败（网络 / 配额）→ 基线同样不动，状态不变，只是本次没有落地。
 */
export function applySaveResult(
  session: EditingSession,
  result: SaveAttemptResult,
  now: number = Date.now(),
): SaveApplyOutcome {
  if (result.ok) {
    const data = result.data;
    if (Number.isFinite(data.version)) {
      session.baseVersion = Math.trunc(data.version);
    }
    if (typeof data.contentHash === 'string' && data.contentHash.trim()) {
      session.contentHash = data.contentHash;
    }
    session.status = 'editing';
    session.lastSavedAt = now;
    return { status: 'applied', session, message: null };
  }

  if (isConflictResult(result)) {
    // 刻意不推进基线：下一次保存仍然用旧 baseVersion，服务端会继续 409 而不是误覆盖。
    session.status = 'conflict';
    return { status: 'conflict', session, message: typeof result.message === 'string' ? result.message : null };
  }

  return { status: 'failed', session, message: typeof result.message === 'string' ? result.message : null };
}

/** 409 之后用户的三个选择。 */
export type ConflictChoice = 'keepMine' | 'useRemote' | 'saveCopy';

/** 冲突时从云端拉到的最新版本（决策只读它，不拉取、不保存）。 */
export interface RemoteDocSnapshot {
  version: number;
  contentHash: string;
  /** 云端正文；useRemote 时直接用它替换本地缓冲，缺省表示调用方另行拉取 */
  content?: string | null;
}

export interface ConflictRetryWithRemoteBase {
  choice: 'keepMine';
  action: 'retryWithRemoteBase';
  /** 用远端版本号当新 baseVersion，本地内容重试保存 */
  baseVersion: number;
  contentHash: string;
  /** 只重试一次；再 409 就回到三选一，不做无限重试 */
  retryLimit: 1;
}

export interface ConflictReplaceLocalWithRemote {
  choice: 'useRemote';
  action: 'replaceLocalWithRemote';
  /** 替换后基线即为远端版本 */
  baseVersion: number;
  contentHash: string;
  /** 云端正文，null 表示调用方需要另行 GET 一次 */
  content: string | null;
}

export interface ConflictSaveAsCopy {
  choice: 'saveCopy';
  action: 'saveAsCopy';
  /** 副本必须按「新建」提交：baseVersion 只能是 null，否则会覆盖原文档 */
  baseVersion: null;
  /** 副本标题 / 路径后缀标记，由调用方拼接，本模块不拼路径 */
  copyTag: string;
  /** 冲突时的云端版本号，建议写进副本备注便于追溯 */
  remoteVersion: number;
}

export type ConflictDecision =
  | ConflictRetryWithRemoteBase
  | ConflictReplaceLocalWithRemote
  | ConflictSaveAsCopy;

/** 副本后缀。避免与已有文件名撞车，也让人一眼看出这是冲突产物。 */
export const CONFLICT_COPY_TAG = '（冲突副本）';

/**
 * 409 三选一 → 下一步动作描述。纯函数，**只产出决策对象，不执行任何 I/O**。
 * - keepMine  → 用 remote.version 作为新 baseVersion 重试一次（本地内容不丢）；
 * - useRemote → 用远端内容替换本地（放弃本地改动）；
 * - saveCopy  → 走「新建」另存一份，原文档保持远端内容。
 */
export function resolveConflictChoice(
  choice: 'keepMine',
  remote: RemoteDocSnapshot,
): ConflictRetryWithRemoteBase;
export function resolveConflictChoice(
  choice: 'useRemote',
  remote: RemoteDocSnapshot,
): ConflictReplaceLocalWithRemote;
export function resolveConflictChoice(choice: 'saveCopy', remote: RemoteDocSnapshot): ConflictSaveAsCopy;
export function resolveConflictChoice(choice: ConflictChoice, remote: RemoteDocSnapshot): ConflictDecision;
export function resolveConflictChoice(choice: ConflictChoice, remote: RemoteDocSnapshot): ConflictDecision {
  const baseVersion = Number.isFinite(remote.version) ? Math.trunc(remote.version) : 0;
  const contentHash = typeof remote.contentHash === 'string' ? remote.contentHash : '';

  switch (choice) {
    case 'keepMine':
      return {
        choice: 'keepMine',
        action: 'retryWithRemoteBase',
        baseVersion,
        contentHash,
        retryLimit: 1,
      };
    case 'useRemote':
      return {
        choice: 'useRemote',
        action: 'replaceLocalWithRemote',
        baseVersion,
        contentHash,
        content: typeof remote.content === 'string' ? remote.content : null,
      };
    case 'saveCopy':
      return {
        choice: 'saveCopy',
        action: 'saveAsCopy',
        baseVersion: null,
        copyTag: CONFLICT_COPY_TAG,
        remoteVersion: baseVersion,
      };
    default:
      throw new Error(`未知的冲突处理选项：${String(choice)}`);
  }
}

/** 一次保存要提交的快照。baseVersion 必须来自编辑会话（服务端靠它做乐观锁）。 */
export interface CloudDocSaveSnapshot {
  fileId: number;
  content: string;
  contentHash: string;
  baseVersion: number;
}

/** 队列单次触发的结果。刻意不 reject：调用方不必 try/catch，队列也不会因异常死锁。 */
export type SaveQueueOutcome<R> = { ok: true; value: R } | { ok: false; error: unknown };

export interface SaveQueueOptions<S, R> {
  /** 真正的保存动作（注入 cloudCommands.save / saveCloudDoc 或测试替身） */
  save: (snapshot: S) => Promise<R>;
}

export interface SaveQueue<S, R> {
  /**
   * 触发一次保存。
   * 契约：该次触发的最终结果以 SaveQueueOutcome 返回（永不 reject）；
   * 同一队列同时最多 1 个 save 在飞，在飞期间的多次触发合并成「最新快照」，落地为最多 1 次追加保存。
   */
  run(snapshot: S): Promise<SaveQueueOutcome<R>>;
  /** 当前是否有 save 在飞 */
  isSaving(): boolean;
  /** 是否有已排队但尚未开始的快照 */
  hasPending(): boolean;
  /** 队列彻底空闲（无在飞、无排队）时 resolve */
  whenIdle(): Promise<void>;
}

/**
 * 创建单飞保存队列。一个队列实例对应一个 fileId（同一文档的多端并发由服务端 409 兜底），
 * 不同文档请各建一个队列，否则会被串行化。
 */
export function createSaveQueue<S, R>(options: SaveQueueOptions<S, R>): SaveQueue<S, R> {
  const { save } = options;

  let draining = false;
  let pendingSnapshot: S | null = null;
  let pendingResolvers: Array<(outcome: SaveQueueOutcome<R>) => void> = [];
  let idleResolvers: Array<() => void> = [];

  async function attempt(snapshot: S): Promise<SaveQueueOutcome<R>> {
    try {
      return { ok: true, value: await save(snapshot) };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async function drain(): Promise<void> {
    if (draining) {
      return;
    }
    draining = true;
    try {
      while (pendingSnapshot !== null) {
        const snapshot: S = pendingSnapshot;
        const resolvers = pendingResolvers;
        // 先清空再 await：在飞期间新来的触发会写进新的 pending，最多追加一次保存。
        pendingSnapshot = null;
        pendingResolvers = [];
        const outcome = await attempt(snapshot);
        for (const resolve of resolvers) {
          resolve(outcome);
        }
      }
    } finally {
      draining = false;
      if (pendingSnapshot !== null) {
        // 收尾窗口里又有人推入快照，再起一轮，避免触发方永远等不到结果。
        void drain();
      } else {
        const resolvers = idleResolvers;
        idleResolvers = [];
        for (const resolve of resolvers) {
          resolve();
        }
      }
    }
  }

  return {
    run(snapshot: S): Promise<SaveQueueOutcome<R>> {
      const promise = new Promise<SaveQueueOutcome<R>>((resolve) => {
        pendingResolvers.push(resolve);
      });
      // 覆盖式合并：内容以最新一次触发为准，中间态无需逐个保存。
      pendingSnapshot = snapshot;
      if (!draining) {
        void drain();
      }
      return promise;
    },

    isSaving(): boolean {
      return draining;
    },

    hasPending(): boolean {
      return pendingSnapshot !== null;
    },

    whenIdle(): Promise<void> {
      if (!draining) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        idleResolvers.push(resolve);
      });
    },
  };
}
