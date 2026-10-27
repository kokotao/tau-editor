/**
 * @description autoSaveScheduler 单测：连续编辑只触发 1 次、失焦/ Ctrl+S 立即触发、
 * destroy 后不再触发（标签关闭泄漏），以及与保存控制器接线后的"同 hash 不发请求"。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-27 10:55
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTO_SAVE_DEBOUNCE_MS, createAutoSaveScheduler } from '@/utils/autoSaveScheduler';
import { computeContentHash } from '@/utils/contentHash';
import { createCloudDocSaveController } from '@/services/cloudDocSaveController';
import type { SaveAttemptResult } from '@/services/cloudDocEditingSession';

beforeEach(() => {
  // 只假 setTimeout/clearTimeout：crypto.subtle.digest 在 webview/Node 上会用到底层
  // 平台回调，把 setImmediate 之类一起假掉会让哈希永远等不到结果（接线用例会假绿）。
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('debounce（编辑空闲触发）', () => {
  it('连续 5 次编辑只触发 1 次', async () => {
    const onTrigger = vi.fn();
    const scheduler = createAutoSaveScheduler({ onTrigger });

    for (let i = 0; i < 5; i += 1) {
      scheduler.notifyEditing();
      await vi.advanceTimersByTimeAsync(1000);
    }
    // 5 秒过去但每次编辑都重置了窗口，一次都不该触发
    expect(onTrigger).not.toHaveBeenCalled();
    expect(scheduler.isPending()).toBe(true);

    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS);
    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(onTrigger).toHaveBeenCalledWith('debounce');
    expect(scheduler.isPending()).toBe(false);
  });

  it('窗口可配置，且默认值是 2500ms', async () => {
    expect(AUTO_SAVE_DEBOUNCE_MS).toBe(2500);

    const onTrigger = vi.fn();
    const scheduler = createAutoSaveScheduler({ onTrigger, delayMs: 500 });
    scheduler.notifyEditing();
    await vi.advanceTimersByTimeAsync(499);
    expect(onTrigger).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('触发后再次编辑会重新计时（不是一次性）', async () => {
    const onTrigger = vi.fn();
    const scheduler = createAutoSaveScheduler({ onTrigger, delayMs: 100 });

    scheduler.notifyEditing();
    await vi.advanceTimersByTimeAsync(100);
    scheduler.notifyEditing();
    await vi.advanceTimersByTimeAsync(100);

    expect(onTrigger).toHaveBeenCalledTimes(2);
  });
});

describe('立即触发（失焦 / Ctrl+S）', () => {
  it('失焦立即触发，并取消未到期的去抖窗口（同一次编辑不会存两遍）', async () => {
    const onTrigger = vi.fn();
    const scheduler = createAutoSaveScheduler({ onTrigger });

    scheduler.notifyEditing();
    await vi.advanceTimersByTimeAsync(1000);
    await scheduler.triggerNow('blur');

    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(onTrigger).toHaveBeenCalledWith('blur');
    expect(scheduler.isPending()).toBe(false);

    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS * 4);
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+S 走 manual 通道', async () => {
    const onTrigger = vi.fn();
    const scheduler = createAutoSaveScheduler({ onTrigger });

    await scheduler.triggerNow('manual');
    expect(onTrigger).toHaveBeenCalledWith('manual');
  });
});

describe('destroy（标签关闭 / 换文档的泄漏防护）', () => {
  it('destroy 后未到期的窗口不再触发', async () => {
    const onTrigger = vi.fn();
    const scheduler = createAutoSaveScheduler({ onTrigger });

    scheduler.notifyEditing();
    scheduler.destroy();
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS * 4);

    expect(onTrigger).not.toHaveBeenCalled();
    expect(scheduler.isPending()).toBe(false);
  });

  it('destroy 后新的编辑与立即触发都无效（组件卸载后不再有任何保存动作）', async () => {
    const onTrigger = vi.fn();
    const scheduler = createAutoSaveScheduler({ onTrigger });
    scheduler.destroy();

    scheduler.notifyEditing();
    await scheduler.triggerNow('blur');
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS * 2);

    expect(onTrigger).not.toHaveBeenCalled();
  });
});

describe('onTrigger 容错', () => {
  it('同步抛异常 / 异步 reject 都不会卡住后续触发，也不会冒泡成未捕获异常', async () => {
    const onTrigger = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('boom-sync');
      })
      .mockRejectedValueOnce(new Error('boom-async'))
      .mockImplementationOnce(() => undefined);
    const scheduler = createAutoSaveScheduler({ onTrigger, delayMs: 10 });

    await expect(scheduler.triggerNow('manual')).resolves.toBeUndefined();
    await expect(scheduler.triggerNow('blur')).resolves.toBeUndefined();

    scheduler.notifyEditing();
    await vi.advanceTimersByTimeAsync(10);
    expect(onTrigger).toHaveBeenCalledTimes(3);
  });
});

describe('与保存控制器接线语义（真实计时器 + 真实哈希）', () => {
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  beforeEach(() => {
    // 接线用例要跑真实的 crypto.subtle.digest，假计时器会把哈希的完成时机搅在一起
    vi.useRealTimers();
  });

  it('同 hash 不发请求：编辑器内容没变时一次 IPC 都不产生', async () => {
    const save = vi.fn(
      async (): Promise<SaveAttemptResult> => ({ ok: true, data: { version: 2, contentHash: 'sha256:next' } }),
    );
    const controller = createCloudDocSaveController({ save });
    const content = '没有改动过的内容';
    controller.open(9, { version: 1, contentHash: await computeContentHash(content) });

    const scheduler = createAutoSaveScheduler({
      delayMs: 20,
      onTrigger: async () => {
        const currentHash = await computeContentHash(content);
        await controller.schedule(content, currentHash);
      },
    });

    scheduler.notifyEditing();
    await sleep(80);
    await scheduler.triggerNow('blur');

    expect(save).not.toHaveBeenCalled();
    scheduler.destroy();
  });

  it('内容变了才发请求，且失飞与 debounce 的重复触发被控制器合并', async () => {
    const gates: Array<{ resolve: (value: SaveAttemptResult) => void }> = [];
    const save = vi.fn(
      () =>
        new Promise<SaveAttemptResult>((resolve) => {
          gates.push({ resolve });
        }),
    );
    const controller = createCloudDocSaveController({ save });
    const nextHash = await computeContentHash('新内容');
    controller.open(9, { version: 1, contentHash: await computeContentHash('旧内容') });

    const scheduler = createAutoSaveScheduler({
      delayMs: 20,
      onTrigger: async () => {
        await controller.schedule('新内容', nextHash);
      },
    });

    scheduler.notifyEditing();
    await sleep(60);
    expect(save).toHaveBeenCalledTimes(1);

    // 在飞期间再来一次（失焦），被队列合并成"最多一次追加保存"
    const blur = scheduler.triggerNow('blur');
    await sleep(10);
    expect(save).toHaveBeenCalledTimes(1);

    gates[0]!.resolve({ ok: true, data: { version: 2, contentHash: nextHash } });
    await blur;
    await controller.flush();

    // 追加那次起飞前二次复核空写 → 不再发 IPC
    expect(save).toHaveBeenCalledTimes(1);
    expect(controller.session()!.baseVersion).toBe(2);
    scheduler.destroy();
  });
});
