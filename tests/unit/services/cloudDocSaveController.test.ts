/**
 * @description cloudDocSaveController 单测：空写抑制 / 单飞合并 / 409 停止自动保存 / 三选一执行 /
 * retryLimit / 换文档竞态（旧队列结果不污染新 session）。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-26 17:50
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createCloudDocSaveController,
  type CloudDocSaveControllerOptions,
  type SaveControllerEvent,
} from '@/services/cloudDocSaveController';
import type { CloudDocSaveSnapshot, SaveAttemptResult } from '@/services/cloudDocEditingSession';

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

const success = (version: number, contentHash: string): SaveAttemptResult => ({
  ok: true,
  data: { version, contentHash },
});
const conflictResult = (message = '云端已有新版本'): SaveAttemptResult => ({
  ok: false,
  kind: 'conflict',
  message,
});

function makeController(
  save: CloudDocSaveControllerOptions['save'],
  extra: Partial<CloudDocSaveControllerOptions> = {},
) {
  const events: SaveControllerEvent[] = [];
  const controller = createCloudDocSaveController({
    save,
    notify: (event) => events.push(event),
    ...extra,
  });
  return { controller, events };
}

describe('open / session（编辑基线）', () => {
  it('open 建立基线，session() 返回只读副本（外部改动影响不到内部状态）', () => {
    const { controller } = makeController(vi.fn());

    const opened = controller.open(7, { version: 3, contentHash: 'h3' });
    expect(opened).toEqual({
      fileId: 7,
      baseVersion: 3,
      contentHash: 'h3',
      status: 'editing',
      lastSavedAt: null,
    });

    const snapshot = controller.session() as { baseVersion: number };
    snapshot.baseVersion = 99;
    expect(controller.session()!.baseVersion).toBe(3);
  });

  it('未打开文档时 session() 为 null，schedule 返回 failed 且不发 IPC', async () => {
    const save = vi.fn();
    const { controller, events } = makeController(save);

    expect(controller.session()).toBeNull();
    expect(await controller.schedule('内容', 'h')).toBe('failed');
    expect(save).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
  });
});

describe('schedule（空写抑制 / 成功 / 失败）', () => {
  it('哈希与基线一致 → skipped，绝不发 IPC', async () => {
    const save = vi.fn();
    const { controller, events } = makeController(save);
    controller.open(7, { version: 3, contentHash: 'h3' });

    expect(await controller.schedule('没改过的内容', 'h3')).toBe('skipped');
    expect(save).not.toHaveBeenCalled();
    expect(events).toEqual([
      { type: 'skipped', fileId: 7, contentHash: 'h3', at: expect.any(Number) },
    ]);
  });

  it('内容变了 → saved，透传 baseVersion 并推进基线，事件带新 version', async () => {
    const save = vi.fn(async () => success(4, 'h4'));
    const { controller, events } = makeController(save);
    controller.open(7, { version: 3, contentHash: 'h3' });

    expect(await controller.schedule('新内容', 'h4')).toBe('saved');

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      fileId: 7,
      content: '新内容',
      contentHash: 'h4',
      baseVersion: 3,
    });
    expect(controller.session()).toMatchObject({ baseVersion: 4, contentHash: 'h4', status: 'editing' });
    expect(events).toEqual([
      { type: 'saved', fileId: 7, version: 4, contentHash: 'h4', at: expect.any(Number) },
    ]);
  });

  it('网络类失败 → failed，基线不动、状态仍可继续保存', async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, kind: 'network', message: '连接超时' })
      .mockResolvedValueOnce(success(4, 'h4'));
    const { controller, events } = makeController(save);
    controller.open(7, { version: 3, contentHash: 'h3' });

    expect(await controller.schedule('内容', 'h4')).toBe('failed');
    expect(controller.session()).toMatchObject({ baseVersion: 3, contentHash: 'h3', status: 'editing' });
    expect(events[0]).toMatchObject({ type: 'failed', fileId: 7, message: '连接超时' });

    expect(await controller.schedule('内容', 'h4')).toBe('saved');
    expect(controller.session()!.baseVersion).toBe(4);
  });

  it('注入的 save 直接抛异常也归一成 failed（不冒泡、不打断控制器）', async () => {
    const save = vi.fn(async () => {
      throw new Error('invoke rejected');
    });
    const { controller, events } = makeController(save);
    controller.open(7, { version: 3, contentHash: 'h3' });

    expect(await controller.schedule('内容', 'h4')).toBe('failed');
    expect(events[0]).toMatchObject({ type: 'failed', message: 'invoke rejected' });
    expect(controller.session()!.status).toBe('editing');
  });

  it('时间源可注入：事件 at 与 lastSavedAt 用注入的时钟', async () => {
    const { controller, events } = makeController(async () => success(4, 'h4'), {
      now: () => 1_700_000_000_123,
    });
    controller.open(7, { version: 3, contentHash: 'h3' });

    await controller.schedule('内容', 'h4');
    expect(events[0]!.at).toBe(1_700_000_000_123);
    expect(controller.session()!.lastSavedAt).toBe(1_700_000_000_123);
  });
});

describe('schedule（单飞 + 合并 + 起飞时刷新基线）', () => {
  it('在飞期间的追加保存拿的是出队时刻的最新 baseVersion，不是 schedule 时刻的旧值', async () => {
    const gates: Array<ReturnType<typeof deferred<SaveAttemptResult>>> = [];
    const payloads: CloudDocSaveSnapshot[] = [];
    const save = vi.fn((snapshot: CloudDocSaveSnapshot) => {
      payloads.push(snapshot);
      const gate = deferred<SaveAttemptResult>();
      gates.push(gate);
      return gate.promise;
    });
    const { controller } = makeController(save);
    controller.open(7, { version: 3, contentHash: 'h3' });

    const first = controller.schedule('A 内容', 'ha');
    await flush();
    const second = controller.schedule('B 内容', 'hb');
    expect(save).toHaveBeenCalledTimes(1);
    // schedule 时基线还是 3，但不要把它烧进待发快照里
    expect(payloads[0]!.baseVersion).toBe(3);

    gates[0]!.resolve(success(4, 'ha'));
    expect(await first).toBe('saved');

    await flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(payloads[1]).toEqual({ fileId: 7, content: 'B 内容', contentHash: 'hb', baseVersion: 4 });

    gates[1]!.resolve(success(5, 'hb'));
    expect(await second).toBe('saved');
    expect(controller.session()).toMatchObject({ baseVersion: 5, contentHash: 'hb' });
    await controller.flush();
  });

  it('在飞期间重复提交同一份内容 → 出队时二次复核空写，直接 skipped（不多涨一个版本号）', async () => {
    const gates: Array<ReturnType<typeof deferred<SaveAttemptResult>>> = [];
    const save = vi.fn(() => {
      const gate = deferred<SaveAttemptResult>();
      gates.push(gate);
      return gate.promise;
    });
    const { controller, events } = makeController(save);
    controller.open(7, { version: 3, contentHash: 'h3' });

    const first = controller.schedule('同样的内容', 'h4');
    await flush();
    const second = controller.schedule('同样的内容', 'h4');

    gates[0]!.resolve(success(4, 'h4'));
    expect(await first).toBe('saved');
    expect(await second).toBe('skipped');
    expect(save).toHaveBeenCalledTimes(1);
    expect(events.map((event) => event.type)).toEqual(['saved', 'skipped']);
    await controller.flush();
  });
});

describe('409：置 conflict 并停止自动保存', () => {
  it('409 → conflict，保留旧基线；后续 schedule 直接返回 conflict 且不再发 IPC', async () => {
    const save = vi.fn(async () => conflictResult('别人先存了'));
    const { controller, events } = makeController(save);
    controller.open(7, { version: 3, contentHash: 'h3' });

    expect(await controller.schedule('我的内容', 'hmine')).toBe('conflict');
    expect(controller.session()).toMatchObject({
      baseVersion: 3,
      contentHash: 'h3',
      status: 'conflict',
    });
    expect(events).toEqual([
      { type: 'conflict', fileId: 7, message: '别人先存了', at: expect.any(Number) },
    ]);

    expect(await controller.schedule('又改了', 'hmine2')).toBe('conflict');
    expect(save).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
  });

  it('409 落地后队列里排队的那次追加保存也不再发 IPC（队列层拦住）', async () => {
    const gates: Array<ReturnType<typeof deferred<SaveAttemptResult>>> = [];
    const save = vi.fn(() => {
      const gate = deferred<SaveAttemptResult>();
      gates.push(gate);
      return gate.promise;
    });
    const { controller } = makeController(save);
    controller.open(7, { version: 3, contentHash: 'h3' });

    const first = controller.schedule('A', 'ha');
    await flush();
    const second = controller.schedule('B', 'hb');

    gates[0]!.resolve(conflictResult());
    expect(await first).toBe('conflict');
    expect(await second).toBe('conflict');
    expect(save).toHaveBeenCalledTimes(1);
    expect(controller.session()!.status).toBe('conflict');
  });
});

describe('resolveConflict（三选一）', () => {
  it('keepMine → 用 remote.version 当新 baseVersion 重放一次我的内容，成功后基线前进', async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce(conflictResult())
      .mockResolvedValueOnce(success(10, 'hmine'));
    const { controller } = makeController(save);
    controller.open(7, { version: 3, contentHash: 'h3' });
    await controller.schedule('我的内容', 'hmine');

    const outcome = await controller.resolveConflict('keepMine', {
      version: 9,
      contentHash: 'h9',
      content: '云端内容',
    });

    expect(outcome).toEqual({ action: 'retried', choice: 'keepMine', result: 'saved' });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({
      fileId: 7,
      content: '我的内容',
      contentHash: 'hmine',
      baseVersion: 9,
    });
    expect(controller.session()).toMatchObject({
      baseVersion: 10,
      contentHash: 'hmine',
      status: 'editing',
    });
  });

  it('keepMine 的 retryLimit=1：同一远端版本重放后再撞 409 就交回用户，不自动无限重试', async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce(conflictResult())
      .mockResolvedValueOnce(conflictResult());
    const { controller } = makeController(save);
    controller.open(7, { version: 3, contentHash: 'h3' });
    await controller.schedule('我的内容', 'hmine');

    const first = await controller.resolveConflict('keepMine', { version: 9, contentHash: 'h9' });
    expect(first).toEqual({ action: 'retried', choice: 'keepMine', result: 'conflict' });
    expect(save).toHaveBeenCalledTimes(2);
    expect(controller.session()!.status).toBe('conflict');

    const second = await controller.resolveConflict('keepMine', { version: 9, contentHash: 'h9' });
    expect(second).toEqual({ action: 'retryExhausted', choice: 'keepMine', baseVersion: 9 });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('useRemote → 只把远端内容交回调用方，控制器不发 IPC、不碰编辑器状态', async () => {
    const save = vi.fn(async () => conflictResult());
    const { controller } = makeController(save);
    controller.open(7, { version: 3, contentHash: 'h3' });
    await controller.schedule('我的内容', 'hmine');

    const outcome = await controller.resolveConflict('useRemote', {
      version: 9,
      contentHash: 'h9',
      content: '云端内容',
    });

    expect(outcome).toEqual({
      action: 'replaceLocalWithRemote',
      choice: 'useRemote',
      content: '云端内容',
      baseVersion: 9,
      contentHash: 'h9',
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(controller.session()).toMatchObject({
      baseVersion: 9,
      contentHash: 'h9',
      status: 'editing',
    });

    // 解除冲突后可以照常保存，且新基线是远端版本
    save.mockResolvedValueOnce(success(10, 'h10'));
    expect(await controller.schedule('改过的云端内容', 'h10')).toBe('saved');
    expect(save).toHaveBeenLastCalledWith({
      fileId: 7,
      content: '改过的云端内容',
      contentHash: 'h10',
      baseVersion: 9,
    });
  });

  it('saveCopy → 返回 baseVersion=null 的副本计划（我本地内容），原文档转远端基线', async () => {
    const save = vi.fn(async () => conflictResult());
    const { controller } = makeController(save);
    controller.open(7, { version: 3, contentHash: 'h3' });
    await controller.schedule('我的内容', 'hmine');

    const outcome = await controller.resolveConflict('saveCopy', {
      version: 9,
      contentHash: 'h9',
      content: '云端内容',
    });

    expect(outcome).toEqual({
      action: 'saveAsCopy',
      choice: 'saveCopy',
      copy: {
        fileId: null,
        content: '我的内容',
        contentHash: 'hmine',
        baseVersion: null,
        copyTag: '（冲突副本）',
      },
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(controller.session()).toMatchObject({
      baseVersion: 9,
      contentHash: 'h9',
      status: 'editing',
    });
  });

  it('不在冲突态 / 没有会话时调用 → rejected，且不误发 IPC', async () => {
    const save = vi.fn();
    const { controller } = makeController(save);

    expect(await controller.resolveConflict('keepMine', { version: 9, contentHash: 'h9' })).toEqual({
      action: 'rejected',
      choice: 'keepMine',
      reason: 'no-session',
    });

    controller.open(7, { version: 3, contentHash: 'h3' });
    expect(await controller.resolveConflict('useRemote', { version: 9, contentHash: 'h9' })).toEqual({
      action: 'rejected',
      choice: 'useRemote',
      reason: 'not-in-conflict',
    });
    expect(save).not.toHaveBeenCalled();
  });
});

describe('换文档竞态：旧队列结果不得污染新 session', () => {
  it('保存在飞时换文档 → 旧结果不写新 session、不发事件；排队的追加保存直接作废', async () => {
    const gates: Array<ReturnType<typeof deferred<SaveAttemptResult>>> = [];
    const payloads: CloudDocSaveSnapshot[] = [];
    const save = vi.fn((snapshot: CloudDocSaveSnapshot) => {
      payloads.push(snapshot);
      const gate = deferred<SaveAttemptResult>();
      gates.push(gate);
      return gate.promise;
    });
    const { controller, events } = makeController(save);

    controller.open(1, { version: 3, contentHash: 'a3' });
    const oldInFlight = controller.schedule('文档 A 的内容', 'a4');
    await flush();
    const oldQueued = controller.schedule('文档 A 的第二版', 'a5');
    expect(payloads[0]!.fileId).toBe(1);

    // 换文档：整份 Lane 被替换，旧 lane 从此失权
    controller.open(2, { version: 50, contentHash: 'b50' });

    gates[0]!.resolve(success(4, 'a4'));
    expect(await oldInFlight).toBe('failed');
    expect(await oldQueued).toBe('failed');
    await controller.flush();

    // 旧文档排队那次没有起飞（只有已经在飞的那一次调用）
    expect(save).toHaveBeenCalledTimes(1);
    // 新 session 完全没被 fileId=1 的结果动过
    expect(controller.session()).toMatchObject({
      fileId: 2,
      baseVersion: 50,
      contentHash: 'b50',
      status: 'editing',
      lastSavedAt: null,
    });
    // 旧文档的 saved 事件一条都不许冒出来
    expect(events).toHaveLength(0);
  });

  it('换文档后新文档的保存独立工作，且用的是自己的 baseVersion', async () => {
    const payloads: CloudDocSaveSnapshot[] = [];
    const save = vi.fn(async (snapshot: CloudDocSaveSnapshot) => {
      payloads.push(snapshot);
      return success(51, 'b51');
    });
    const { controller, events } = makeController(save);

    controller.open(1, { version: 3, contentHash: 'a3' });
    controller.open(2, { version: 50, contentHash: 'b50' });

    expect(await controller.schedule('文档 B 的内容', 'b51')).toBe('saved');
    expect(payloads[0]).toEqual({
      fileId: 2,
      content: '文档 B 的内容',
      contentHash: 'b51',
      baseVersion: 50,
    });
    expect(events).toEqual([
      { type: 'saved', fileId: 2, version: 51, contentHash: 'b51', at: expect.any(Number) },
    ]);
  });

  it('旧文档的 409 迟到也不会把新 session 打成 conflict', async () => {
    const gates: Array<ReturnType<typeof deferred<SaveAttemptResult>>> = [];
    const save = vi.fn(() => {
      const gate = deferred<SaveAttemptResult>();
      gates.push(gate);
      return gate.promise;
    });
    const { controller, events } = makeController(save);

    controller.open(1, { version: 3, contentHash: 'a3' });
    const oldSave = controller.schedule('文档 A 的内容', 'a4');
    await flush();

    controller.open(2, { version: 50, contentHash: 'b50' });

    gates[0]!.resolve(conflictResult('A 的冲突'));
    expect(await oldSave).toBe('failed');
    await controller.flush();

    expect(controller.session()).toMatchObject({ fileId: 2, status: 'editing', baseVersion: 50 });
    expect(events).toHaveLength(0);
  });
});

describe('notify 容错', () => {
  it('监听方抛异常不影响保存流程与基线推进', async () => {
    const notify = vi.fn(() => {
      throw new Error('listener boom');
    });
    const controller = createCloudDocSaveController({
      save: async () => success(4, 'h4'),
      notify,
    });
    controller.open(7, { version: 3, contentHash: 'h3' });

    expect(await controller.schedule('内容', 'h4')).toBe('saved');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(controller.session()!.baseVersion).toBe(4);
  });
});
