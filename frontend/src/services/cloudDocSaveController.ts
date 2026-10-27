/**
 * @description 云文档保存控制器：把编辑会话 / 空写抑制 / 单飞队列 / 409 三选一串联成一个
 * 「来一次就处理一次」的服务。仍然零 UI 依赖：不发 debounce 定时器、不 import store / Vue、
 * IPC 由调用方注入（CloudDocSaveControllerOptions.save），状态变化只通过 notify 事件外抛。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-26 17:10
 */
import {
  applySaveResult,
  createEditingSession,
  createSaveQueue,
  resolveConflictChoice,
  shouldSkipSave,
  type CloudDocSaveSnapshot,
  type ConflictChoice,
  type EditingSession,
  type RemoteDocSnapshot,
  type SaveApplyStatus,
  type SaveAttemptResult,
  type SaveQueue,
  type SaveQueueOutcome,
} from '@/services/cloudDocEditingSession';

/** schedule 的分类结果：'skipped' 表示空写抑制（没发 IPC），'failed' 是保存真的没落地。 */
export type SaveScheduleResult = 'saved' | 'skipped' | 'conflict' | 'failed';

/** 状态变化事件。控制器不认识 store，只把事实抛给调用方。 */
export type SaveControllerEvent =
  | { type: 'saved'; fileId: number; version: number; contentHash: string; at: number }
  | { type: 'conflict'; fileId: number; message: string | null; at: number }
  | { type: 'failed'; fileId: number; message: string | null; at: number }
  | { type: 'skipped'; fileId: number; contentHash: string; at: number };

export interface CloudDocSaveControllerOptions {
  /** 真正的保存动作（invoke cloud_docs_save）；返回结构兼容 CloudOutcome<CloudDocSaveResult> */
  save: (snapshot: CloudDocSaveSnapshot) => Promise<SaveAttemptResult>;
  /** 状态变化通知；监听方抛异常不会打断保存流程 */
  notify?: (event: SaveControllerEvent) => void;
  /** 时间源，便于单测固定时间戳 */
  now?: () => number;
}

export interface CloudDocBaseline {
  /** 打开文档时 cloud_docs_get 返回的版本号 */
  version: number;
  /** 打开文档时云端内容的哈希 */
  contentHash: string;
}

/** 冲突「另存副本」的提交计划：副本是新建，所以 fileId / baseVersion 必须为空。 */
export interface CloudDocSaveCopyPlan {
  fileId: null;
  content: string;
  contentHash: string;
  baseVersion: null;
  /** 副本标题 / 路径后缀标记，由调用方拼接，控制器不拼路径 */
  copyTag: string;
}

export type ConflictRejectReason = 'no-session' | 'not-in-conflict' | 'no-pending-content';

export type ConflictResolutionOutcome =
  | { action: 'retried'; choice: 'keepMine'; result: SaveScheduleResult }
  | { action: 'retryExhausted'; choice: 'keepMine'; baseVersion: number }
  | {
      action: 'replaceLocalWithRemote';
      choice: 'useRemote';
      content: string | null;
      baseVersion: number;
      contentHash: string;
    }
  | { action: 'saveAsCopy'; choice: 'saveCopy'; copy: CloudDocSaveCopyPlan }
  | { action: 'rejected'; choice: ConflictChoice; reason: ConflictRejectReason };

export interface CloudDocSaveController {
  /** 打开（或切换）文档：建立新基线并让旧文档的队列结果立即失效 */
  open(fileId: number, baseline: CloudDocBaseline): Readonly<EditingSession>;
  /** 处理一次保存触发（触发时机由 UI 层决定，控制器不装定时器） */
  schedule(content: string, contentHash: string): Promise<SaveScheduleResult>;
  /** 409 之后的三选一；只做不需要新 IPC 的部分，其余交回调用方 */
  resolveConflict(choice: ConflictChoice, remote: RemoteDocSnapshot): Promise<ConflictResolutionOutcome>;
  /** 等队列彻底空闲（无在飞、无排队） */
  flush(): Promise<void>;
  /** 当前会话的只读副本，供状态栏展示；未打开文档时为 null */
  session(): Readonly<EditingSession> | null;
}

interface PendingContent {
  content: string;
  contentHash: string;
}

/** 队列层单次保存的产出：队列只负责单飞与合并，语义判定留给控制器。 */
type LaneSaveOutcome =
  | { kind: 'stale' }
  | { kind: 'skipped' }
  | { kind: 'blocked' }
  | { kind: 'attempt'; result: SaveAttemptResult; status: SaveApplyStatus };

/**
 * 一个 Lane = 一个 fileId 的完整编辑上下文（session + 自己的单飞队列 + 冲突待定内容）。
 * 换文档时整份替换，旧 Lane 的对象引用随之失权 —— 这是防「旧队列污染新 session」的根基：
 * 判定用引用相等（activeLane !== lane），不是用可变计数器，所以不存在回绕或漏加。
 */
interface Lane {
  fileId: number;
  session: EditingSession;
  queue: SaveQueue<CloudDocSaveSnapshot, LaneSaveOutcome>;
  /** 最近一次提交的内容；合并保存只保留最新，keepMine 重试的就是它 */
  lastContent: PendingContent | null;
  /** 409 时冻结的待定内容，直到用户三选一 */
  conflictPayload: PendingContent | null;
  /** 上次 keepMine 用过的远端版本，用来落实 retryLimit = 1 */
  lastRetryBaseVersion: number | null;
}

function messageOf(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }
  return '未知错误';
}

export function createCloudDocSaveController(
  options: CloudDocSaveControllerOptions,
): CloudDocSaveController {
  const now = options.now ?? Date.now;
  let activeLane: Lane | null = null;

  function emit(event: SaveControllerEvent): void {
    try {
      options.notify?.(event);
    } catch {
      // 监听方（store / 状态栏）抛异常不影响保存流程
    }
  }

  /**
   * 队列里真正起飞的那一刻才做的事：二次空写复核、conflict 态拦截、baseVersion 刷新。
   * baseVersion 必须在这里取 —— 合并期间前一次保存可能已经把基线推进了，
   * 沿用 schedule 时的旧值会造成本不该出现的 409。
   */
  async function dispatchLane(lane: Lane, snapshot: CloudDocSaveSnapshot): Promise<LaneSaveOutcome> {
    if (activeLane !== lane) {
      return { kind: 'stale' };
    }
    if (lane.session.status === 'conflict') {
      // 409 已在会话上落地：队列里排队的追加保存一律不发 IPC，这就是「停止自动保存」的兜底
      return { kind: 'blocked' };
    }
    if (shouldSkipSave(lane.session, snapshot.contentHash)) {
      // 在飞期间前一次成功可能已经把这份内容存上去了，别为它再涨一个版本号
      return { kind: 'skipped' };
    }

    const payload: CloudDocSaveSnapshot = { ...snapshot, baseVersion: lane.session.baseVersion };

    let result: SaveAttemptResult;
    try {
      result = await options.save(payload);
    } catch (error) {
      result = { ok: false, kind: 'unknown', message: messageOf(error) };
    }

    // 结果必须在这里（而不是 schedule 的续体里）落盘：队列会在 schedule 的续体醒来之前
    // 就派发下一次出队的保存，晚一步应用基线，追加保存就会带着过期 baseVersion 起飞、凭空 409。
    const applied = applySaveResult(lane.session, result, now());
    if (applied.status === 'applied') {
      lane.conflictPayload = null;
      lane.lastRetryBaseVersion = null;
    } else if (applied.status === 'conflict') {
      // 冻结待定内容：keepMine / saveCopy 都要靠它，合并时只保留最新一次提交
      lane.conflictPayload = lane.lastContent;
    }
    return { kind: 'attempt', result, status: applied.status };
  }

  function createLane(fileId: number, baseline: CloudDocBaseline): Lane {
    const session = createEditingSession({
      fileId,
      version: baseline.version,
      contentHash: baseline.contentHash,
    });
    const lane: Lane = {
      fileId,
      session,
      lastContent: null,
      conflictPayload: null,
      lastRetryBaseVersion: null,
      queue: createSaveQueue<CloudDocSaveSnapshot, LaneSaveOutcome>({
        save: (snapshot) => dispatchLane(lane, snapshot),
      }),
    };
    return lane;
  }

  function applyLaneOutcome(
    lane: Lane,
    outcome: SaveQueueOutcome<LaneSaveOutcome>,
    attemptedHash: string,
  ): SaveScheduleResult {
    if (!outcome.ok) {
      emit({ type: 'failed', fileId: lane.fileId, message: messageOf(outcome.error), at: now() });
      return 'failed';
    }

    const value = outcome.value;
    switch (value.kind) {
      case 'stale':
        // 换文档后这次队列结果已经无主：不写 session、不发事件
        return 'failed';
      case 'skipped':
        emit({ type: 'skipped', fileId: lane.fileId, contentHash: attemptedHash, at: now() });
        return 'skipped';
      case 'blocked':
        // conflict 事件在检测到 409 时已经发过，这里只把分类结果回给调用方
        return 'conflict';
      case 'attempt': {
        // 结果已在 dispatchLane 里应用过（保证基线早于下一次派发推进），这里只负责分类与通知
        if (value.status === 'applied') {
          emit({
            type: 'saved',
            fileId: lane.fileId,
            version: lane.session.baseVersion,
            contentHash: lane.session.contentHash,
            at: now(),
          });
          return 'saved';
        }
        if (value.status === 'conflict') {
          emit({
            type: 'conflict',
            fileId: lane.fileId,
            message: value.result.ok ? null : (value.result.message ?? null),
            at: now(),
          });
          return 'conflict';
        }
        emit({
          type: 'failed',
          fileId: lane.fileId,
          message: value.result.ok ? null : (value.result.message ?? null),
          at: now(),
        });
        return 'failed';
      }
    }
  }

  async function schedule(content: string, contentHash: string): Promise<SaveScheduleResult> {
    const lane = activeLane;
    if (!lane) {
      return 'failed';
    }
    if (lane.session.status === 'conflict') {
      // 三选一之前不再自动写，连 IPC 都不发
      return 'conflict';
    }
    if (shouldSkipSave(lane.session, contentHash)) {
      emit({ type: 'skipped', fileId: lane.fileId, contentHash, at: now() });
      return 'skipped';
    }

    lane.lastContent = { content, contentHash };
    const outcome = await lane.queue.run({
      fileId: lane.fileId,
      content,
      contentHash,
      baseVersion: lane.session.baseVersion,
    });
    if (activeLane !== lane) {
      // 期间换了文档：这次结果不许动新 session，也不许发事件（旧文档的成败与当前文档无关）
      return 'failed';
    }
    return applyLaneOutcome(lane, outcome, contentHash);
  }

  async function resolveConflict(
    choice: ConflictChoice,
    remote: RemoteDocSnapshot,
  ): Promise<ConflictResolutionOutcome> {
    const lane = activeLane;
    if (!lane) {
      return { action: 'rejected', choice, reason: 'no-session' };
    }
    if (lane.session.status !== 'conflict') {
      return { action: 'rejected', choice, reason: 'not-in-conflict' };
    }

    if (choice === 'useRemote') {
      const decision = resolveConflictChoice('useRemote', remote);
      // 控制器不碰编辑器状态：把远端内容交回调用方去替换缓冲
      lane.session.baseVersion = decision.baseVersion;
      lane.session.contentHash = decision.contentHash;
      lane.session.status = 'editing';
      lane.conflictPayload = null;
      lane.lastRetryBaseVersion = null;
      lane.lastContent = null;
      return {
        action: 'replaceLocalWithRemote',
        choice: 'useRemote',
        content: decision.content,
        baseVersion: decision.baseVersion,
        contentHash: decision.contentHash,
      };
    }

    const payload = lane.conflictPayload;
    if (!payload) {
      return { action: 'rejected', choice, reason: 'no-pending-content' };
    }

    if (choice === 'keepMine') {
      const decision = resolveConflictChoice('keepMine', remote);
      if (lane.lastRetryBaseVersion === decision.baseVersion) {
        // retryLimit = 1：同一个远端版本只重放一次，再撞 409 就交回用户重新决定
        return { action: 'retryExhausted', choice: 'keepMine', baseVersion: decision.baseVersion };
      }
      lane.lastRetryBaseVersion = decision.baseVersion;
      // 用户授权把远端版本当新基线（保留我的内容，只换乐观锁基准）
      lane.session.baseVersion = decision.baseVersion;
      lane.session.contentHash = decision.contentHash;
      lane.session.status = 'editing';
      lane.conflictPayload = null;
      const result = await schedule(payload.content, payload.contentHash);
      return { action: 'retried', choice: 'keepMine', result };
    }

    const decision = resolveConflictChoice('saveCopy', remote);
    const copy: CloudDocSaveCopyPlan = {
      fileId: null,
      content: payload.content,
      contentHash: payload.contentHash,
      baseVersion: null,
      copyTag: decision.copyTag,
    };
    // 原文档转为远端基线：本地内容既然另有归处，就不再挂在这份文档上
    lane.session.baseVersion = decision.remoteVersion;
    lane.session.contentHash =
      typeof remote.contentHash === 'string' ? remote.contentHash : lane.session.contentHash;
    lane.session.status = 'editing';
    lane.conflictPayload = null;
    lane.lastRetryBaseVersion = null;
    lane.lastContent = null;
    return { action: 'saveAsCopy', choice: 'saveCopy', copy };
  }

  return {
    open(fileId: number, baseline: CloudDocBaseline): Readonly<EditingSession> {
      const lane = createLane(fileId, baseline);
      // 整份替换：旧 lane 的在飞/排队结果此后一律因 activeLane !== oldLane 被丢弃
      activeLane = lane;
      return { ...lane.session };
    },

    schedule,

    resolveConflict,

    flush(): Promise<void> {
      const lane = activeLane;
      return lane ? lane.queue.whenIdle() : Promise.resolve();
    },

    session(): Readonly<EditingSession> | null {
      return activeLane ? { ...activeLane.session } : null;
    },
  };
}
