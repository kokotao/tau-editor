/**
 * @description cloudDocEditingSession 单测：空写抑制 / 单飞合并 / 409 保基线不覆盖 / 三种冲突决策 / 队列异常不死锁。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-26 15:40
 */
import { describe, expect, it, vi } from 'vitest';
import {
  CONFLICT_COPY_TAG,
  applySaveResult,
  createEditingSession,
  createSaveQueue,
  isConflictResult,
  resolveConflictChoice,
  shouldSkipSave,
  type CloudDocSaveSnapshot,
  type SaveAttemptResult,
} from '@/services/cloudDocEditingSession';

/** 把微任务 + 宏任务都放干净，避免断言踩在 await 链中间 */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeSession(overrides: Partial<Parameters<typeof applySaveResult>[0]> = {}) {
  return {
    ...createEditingSession({ fileId: 7, version: 3, contentHash: 'hash-v3' }),
    ...overrides,
  };
}

const success = (version: number, contentHash: string): SaveAttemptResult => ({
  ok: true,
  data: { version, contentHash },
});

describe('createEditingSession', () => {
  it('把 version 落成 baseVersion，初始无冲突、未保存过', () => {
    const session = createEditingSession({ fileId: 42, version: 5, contentHash: 'h5' });

    expect(session).toEqual({
      fileId: 42,
      baseVersion: 5,
      contentHash: 'h5',
      status: 'editing',
      lastSavedAt: null,
    });
  });

  it('version 非法时退化为 0 而不是 NaN', () => {
    const session = createEditingSession({ fileId: 1, version: Number.NaN, contentHash: 'h' });
    expect(session.baseVersion).toBe(0);
  });
});

describe('shouldSkipSave（空写抑制）', () => {
  it('哈希与基线一致 → 跳过（省流量、省版本号）', () => {
    const session = makeSession();
    expect(shouldSkipSave(session, 'hash-v3')).toBe(true);
  });

  it('哈希变化 → 必须保存', () => {
    const session = makeSession();
    expect(shouldSkipSave(session, 'hash-v4')).toBe(false);
  });

  it('哈希未知（空串）→ 不能跳过，宁可多存一次', () => {
    const session = makeSession();
    expect(shouldSkipSave(session, '')).toBe(false);
    expect(shouldSkipSave(session, '   ')).toBe(false);
  });

  it('conflict 态一律跳过：409 之后不允许再自动写', () => {
    const session = makeSession({ status: 'conflict' });
    expect(shouldSkipSave(session, 'hash-v3')).toBe(true);
    expect(shouldSkipSave(session, 'hash-v9')).toBe(true);
  });
});

describe('applySaveResult（保存结果处理）', () => {
  it('成功 → 推进 baseVersion 与 contentHash，状态回到 editing', () => {
    const session = makeSession();
    const outcome = applySaveResult(session, success(4, 'hash-v4'), 1_700_000_000_000);

    expect(outcome.status).toBe('applied');
    expect(outcome.message).toBeNull();
    expect(session).toMatchObject({
      baseVersion: 4,
      contentHash: 'hash-v4',
      status: 'editing',
      lastSavedAt: 1_700_000_000_000,
    });
  });

  it('409 → 返回 conflict，且基线原样保留（绝不自动覆盖）', () => {
    const session = makeSession();
    const outcome = applySaveResult(session, {
      ok: false,
      kind: 'conflict',
      message: '云端版本已更新',
    });

    expect(outcome.status).toBe('conflict');
    expect(outcome.message).toBe('云端版本已更新');
    expect(session.baseVersion).toBe(3);
    expect(session.contentHash).toBe('hash-v3');
    expect(session.status).toBe('conflict');
    expect(session.lastSavedAt).toBeNull();
  });

  it('未归一化的 409 原始 code 也识别成冲突', () => {
    const session = makeSession();
    const outcome = applySaveResult(session, { ok: false, kind: '409' });

    expect(outcome.status).toBe('conflict');
    expect(session.baseVersion).toBe(3);
  });

  it('网络失败 → failed，基线不动，状态仍是 editing（可继续重试）', () => {
    const session = makeSession();
    const outcome = applySaveResult(session, { ok: false, kind: 'network', message: '连接超时' });

    expect(outcome.status).toBe('failed');
    expect(session).toMatchObject({ baseVersion: 3, contentHash: 'hash-v3', status: 'editing' });
  });

  it('成功返回的 contentHash 为空时不覆盖旧哈希', () => {
    const session = makeSession();
    applySaveResult(session, success(4, ''));
    expect(session.baseVersion).toBe(4);
    expect(session.contentHash).toBe('hash-v3');
  });

  it('isConflictResult 只把冲突类 code 认成冲突', () => {
    expect(isConflictResult({ ok: false, kind: 'VERSION_CONFLICT' })).toBe(true);
    expect(isConflictResult({ ok: false, kind: ' file_conflict ' })).toBe(true);
    expect(isConflictResult({ ok: false, kind: 'network' })).toBe(false);
    expect(isConflictResult(success(1, 'h'))).toBe(false);
  });
});

describe('resolveConflictChoice（409 三选一，只出决策不做 I/O）', () => {
  const remote = { version: 9, contentHash: 'hash-v9', content: '云端正文' };

  it('keepMine → 用 remote.version 当新 baseVersion 重试一次', () => {
    const decision = resolveConflictChoice('keepMine', remote);

    expect(decision).toEqual({
      choice: 'keepMine',
      action: 'retryWithRemoteBase',
      baseVersion: 9,
      contentHash: 'hash-v9',
      retryLimit: 1,
    });
  });

  it('useRemote → 用远端内容替换本地，基线跟着远端走', () => {
    const decision = resolveConflictChoice('useRemote', remote);

    expect(decision).toEqual({
      choice: 'useRemote',
      action: 'replaceLocalWithRemote',
      baseVersion: 9,
      contentHash: 'hash-v9',
      content: '云端正文',
    });
  });

  it('saveCopy → 按新建提交（baseVersion 必须为 null）并带副本标记', () => {
    const decision = resolveConflictChoice('saveCopy', remote);

    expect(decision.action).toBe('saveAsCopy');
    if (decision.action !== 'saveAsCopy') throw new Error('unreachable');
    expect(decision.baseVersion).toBeNull();
    expect(decision.copyTag).toBe(CONFLICT_COPY_TAG);
    expect(decision.remoteVersion).toBe(9);
  });

  it('远端内容缺失时 useRemote 显式给出 null，调用方据此另行拉取', () => {
    const decision = resolveConflictChoice('useRemote', { version: 2, contentHash: 'h2' });
    if (decision.action !== 'replaceLocalWithRemote') throw new Error('unreachable');
    expect(decision.content).toBeNull();
  });

  it('决策函数不产生副作用（remote 对象不被修改）', () => {
    const snapshot = { version: 4, contentHash: 'h4', content: 'x' };
    resolveConflictChoice('keepMine', snapshot);
    resolveConflictChoice('saveCopy', snapshot);
    expect(snapshot).toEqual({ version: 4, contentHash: 'h4', content: 'x' });
  });
});

describe('createSaveQueue（单飞 + 合并 + 异常不死锁）', () => {
  type Snapshot = { id: number };

  it('基线快照的形状能被队列直接承载（fileId/contentHash/baseVersion 透传）', () => {
    const snapshot: CloudDocSaveSnapshot = {
      fileId: 7,
      content: 'hello',
      contentHash: 'h1',
      baseVersion: 3,
    };
    expect(Object.keys(snapshot).sort()).toEqual(['baseVersion', 'content', 'contentHash', 'fileId']);
  });

  it('同一时刻只有 1 个保存在飞，在飞期间多次触发合并成 1 次追加保存（用最新内容）', async () => {
    const calls: Snapshot[] = [];
    const gates: Array<ReturnType<typeof deferred<number>>> = [];
    const save = vi.fn((snapshot: Snapshot) => {
      calls.push(snapshot);
      const gate = deferred<number>();
      gates.push(gate);
      return gate.promise;
    });
    const queue = createSaveQueue<Snapshot, number>({ save });

    const first = queue.run({ id: 1 });
    await flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(queue.isSaving()).toBe(true);

    const second = queue.run({ id: 2 });
    const third = queue.run({ id: 3 });
    const fourth = queue.run({ id: 4 });
    await flush();
    // 在飞期间不并发：仍然只有第一次调用
    expect(save).toHaveBeenCalledTimes(1);
    expect(queue.hasPending()).toBe(true);

    gates[0]!.resolve(10);
    expect(await first).toEqual({ ok: true, value: 10 });

    await flush();
    // 合并成「最多 1 次追加保存」，且内容是最后一次触发的内容
    expect(save).toHaveBeenCalledTimes(2);
    expect(calls[1]).toEqual({ id: 4 });

    gates[1]!.resolve(20);
    expect(await second).toEqual({ ok: true, value: 20 });
    expect(await third).toEqual({ ok: true, value: 20 });
    expect(await fourth).toEqual({ ok: true, value: 20 });

    await queue.whenIdle();
    expect(queue.isSaving()).toBe(false);
    expect(queue.hasPending()).toBe(false);
  });

  it('save 抛异常时该次触发返回 ok:false，队列不死锁且后续仍可正常保存', async () => {
    let round = 0;
    const queue = createSaveQueue<Snapshot, string>({
      save: async (snapshot) => {
        round += 1;
        if (round === 1) {
          throw new Error('invoke failed');
        }
        return `saved-${snapshot.id}`;
      },
    });

    const failed = await queue.run({ id: 1 });
    expect(failed.ok).toBe(false);
    if (failed.ok) throw new Error('unreachable');
    expect((failed.error as Error).message).toBe('invoke failed');

    expect(queue.isSaving()).toBe(false);
    expect(await queue.run({ id: 2 })).toEqual({ ok: true, value: 'saved-2' });
    expect(queue.isSaving()).toBe(false);
  });

  it('在飞期间触发的那次也失败时，队列既不死锁也不丢触发（后续可直接恢复）', async () => {
    const gates: Array<ReturnType<typeof deferred<number>>> = [];
    const save = vi.fn(() => {
      const gate = deferred<number>();
      gates.push(gate);
      return gate.promise;
    });
    const queue = createSaveQueue<Snapshot, number>({ save });

    const first = queue.run({ id: 1 });
    await flush();
    const second = queue.run({ id: 2 });
    const third = queue.run({ id: 3 });
    expect(save).toHaveBeenCalledTimes(1);

    gates[0]!.reject(new Error('boom-1'));
    expect((await first).ok).toBe(false);

    await flush();
    // 合并后的追加保存确实发生，触发方没有被丢掉
    expect(save).toHaveBeenCalledTimes(2);
    gates[1]!.reject(new Error('boom-2'));
    expect((await second).ok).toBe(false);
    expect((await third).ok).toBe(false);
    await queue.whenIdle();
    expect(queue.isSaving()).toBe(false);

    // 失败之后同一个队列仍能正常保存
    const recovered = queue.run({ id: 4 });
    await flush();
    expect(save).toHaveBeenCalledTimes(3);
    gates[2]!.resolve(42);
    expect(await recovered).toEqual({ ok: true, value: 42 });
  });

  it('空闲时 whenIdle 立即 resolve', async () => {
    const queue = createSaveQueue<Snapshot, number>({ save: async () => 1 });
    await expect(queue.whenIdle()).resolves.toBeUndefined();
  });

  it('串行触发（前一次已完成）各自都会真正落地', async () => {
    const save = vi.fn(async (snapshot: Snapshot) => snapshot.id * 2);
    const queue = createSaveQueue<Snapshot, number>({ save });

    expect(await queue.run({ id: 1 })).toEqual({ ok: true, value: 2 });
    expect(await queue.run({ id: 2 })).toEqual({ ok: true, value: 4 });
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe('组合场景：队列 + 结果处理', () => {
  it('第一次成功推进基线，第二次 409 保留基线并要求用户三选一', async () => {
    const session = makeSession();
    const results: SaveAttemptResult[] = [success(4, 'hash-v4'), { ok: false, kind: 'conflict' }];
    let index = 0;
    const queue = createSaveQueue<CloudDocSaveSnapshot, SaveAttemptResult>({
      save: async () => {
        const result = results[index];
        index += 1;
        if (!result) throw new Error('unexpected extra save');
        return result;
      },
    });

    const snapshot: CloudDocSaveSnapshot = {
      fileId: 7,
      content: 'body',
      contentHash: 'hash-v4',
      baseVersion: session.baseVersion,
    };

    const first = await queue.run(snapshot);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('unreachable');
    expect(applySaveResult(session, first.value).status).toBe('applied');
    expect(session.baseVersion).toBe(4);

    const second = await queue.run({ ...snapshot, baseVersion: session.baseVersion });
    if (!second.ok) throw new Error('unreachable');
    expect(applySaveResult(session, second.value).status).toBe('conflict');
    expect(session.baseVersion).toBe(4);
    expect(shouldSkipSave(session, 'hash-v5')).toBe(true);
  });
});
