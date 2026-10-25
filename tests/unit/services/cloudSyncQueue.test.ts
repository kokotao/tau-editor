/**
 * @description 云同步队列单元测试：退避、次数上限、持久化、冲突不重试、自动定时 flush。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 09:45
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLOUD_QUEUE_MAX_ATTEMPTS,
  CLOUD_QUEUE_STORAGE_KEY,
  computeRetryDelayMs,
  createCloudSyncQueue,
  pruneQueueItems,
  shouldRunNow,
  type CloudQueueItem,
  type CloudQueueRunResult,
} from '@/services/cloudSyncQueue';

function makeItem(overrides: Partial<CloudQueueItem> = {}): CloudQueueItem {
  return {
    id: 'tab-1:/work/a.md',
    tabId: 'tab-1',
    filePath: '/work/a.md',
    attempts: 0,
    nextRetryAt: 0,
    lastError: null,
    addedAt: 1_000,
    ...overrides,
  };
}

/**
 * 仓库全局 setup 把 localStorage mock 成 vi.fn()（不落数据），
 * 队列的断点续传必须用真实内存实现，因此这里单独 stub 一份。
 */
function installMemoryStorage(): void {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => (map.has(key) ? map.get(key) ?? null : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  };
  vi.stubGlobal('localStorage', storage);
}

/** 退避测试用：禁用自动定时 flush，完全手动驱动，避免与 fake timers 竞争 */
const NOOP_TIMER = (() => 0) as unknown as typeof setTimeout;
const NOOP_CLEAR_TIMER = (() => undefined) as unknown as typeof clearTimeout;

describe('cloudSyncQueue 纯函数', () => {
  it('指数退避：1s/2s/4s/8s/16s，封顶 30s', () => {
    expect(computeRetryDelayMs(1)).toBe(1000);
    expect(computeRetryDelayMs(2)).toBe(2000);
    expect(computeRetryDelayMs(3)).toBe(4000);
    expect(computeRetryDelayMs(4)).toBe(8000);
    expect(computeRetryDelayMs(5)).toBe(16000);
    expect(computeRetryDelayMs(6)).toBe(30000);
    expect(computeRetryDelayMs(20)).toBe(30000);
    expect(computeRetryDelayMs(0)).toBe(1000);
  });

  it('shouldRunNow 按 nextRetryAt 判断', () => {
    expect(shouldRunNow(makeItem({ nextRetryAt: 1000 }), 1000)).toBe(true);
    expect(shouldRunNow(makeItem({ nextRetryAt: 1001 }), 1000)).toBe(false);
  });

  it('pruneQueueItems 清理超过 7 天的项', () => {
    const now = 10 * 24 * 60 * 60 * 1000;
    const fresh = makeItem({ id: 'fresh', addedAt: now - 1000 });
    const stale = makeItem({ id: 'stale', addedAt: 0 });
    const kept = pruneQueueItems([fresh, stale], now);
    expect(kept.map((item) => item.id)).toEqual(['fresh']);
  });
});

describe('createCloudSyncQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installMemoryStorage();
    localStorage.clear();
    vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('enqueue 去重并重置 nextRetryAt，pendingCount/failedCount 正确', () => {
    const queue = createCloudSyncQueue({ runSync: vi.fn() });
    queue.enqueue('t1', '/a.md');
    queue.enqueue('t1', '/a.md');
    queue.enqueue('t2', '/b.md');
    expect(queue.pendingCount()).toBe(2);
    expect(queue.failedCount()).toBe(0);
    queue.dispose();
  });

  it('synced/skipped/conflict 均移出队列且不重试', async () => {
    const results: CloudQueueRunResult[] = [
      { status: 'synced' },
      { status: 'skipped' },
      { status: 'conflict' },
    ];
    const runSync = vi.fn(async () => results.shift() ?? { status: 'synced' });
    const queue = createCloudSyncQueue({ runSync });

    queue.enqueue('t1', '/a.md');
    await queue.flush();
    queue.enqueue('t2', '/b.md');
    await queue.flush();
    queue.enqueue('t3', '/c.md');
    await queue.flush();

    expect(runSync).toHaveBeenCalledTimes(3);
    expect(queue.pendingCount()).toBe(0);
    queue.dispose();
  });

  it('failed 递增 attempts 并按退避安排下次执行，5 次后放弃', async () => {
    const runSync = vi.fn(async () => ({ status: 'failed' as const, message: '网络错误' }));
    const queue = createCloudSyncQueue({
      runSync,
      setTimeoutFn: NOOP_TIMER,
      clearTimeoutFn: NOOP_CLEAR_TIMER,
    });
    queue.enqueue('t1', '/a.md');

    for (let attempt = 1; attempt < CLOUD_QUEUE_MAX_ATTEMPTS; attempt += 1) {
      await queue.flush();
      const [item] = queue.items();
      expect(item?.attempts).toBe(attempt);
      expect(item?.lastError).toBe('网络错误');
      // 下一次重试时间 = 当前时间 + 退避
      expect(item?.nextRetryAt).toBe(Date.now() + computeRetryDelayMs(attempt));
      // 手动推进到下次可执行时间（无自动定时器）
      vi.setSystemTime(Date.now() + computeRetryDelayMs(attempt));
    }

    // 第 5 次失败后放弃（移出队列）
    await queue.flush();
    expect(queue.pendingCount()).toBe(0);
    queue.dispose();
  });

  it('retryNow 忽略退避时间立即执行', async () => {
    let succeed = false;
    const runSync = vi.fn(async () => (succeed
      ? { status: 'synced' as const }
      : { status: 'failed' as const, message: 'boom' }));
    const queue = createCloudSyncQueue({ runSync });
    queue.enqueue('t1', '/a.md');
    await queue.flush();
    expect(queue.pendingCount()).toBe(1);

    succeed = true;
    await queue.retryNow();
    expect(queue.pendingCount()).toBe(0);
    expect(runSync).toHaveBeenCalledTimes(2);
    queue.dispose();
  });

  it('队列项持久化到 localStorage，可在新实例恢复', async () => {
    const queue = createCloudSyncQueue({
      runSync: vi.fn(async () => ({ status: 'failed' as const, message: 'offline' })),
    });
    queue.enqueue('t1', '/a.md');
    await queue.flush();
    queue.dispose();

    const raw = localStorage.getItem(CLOUD_QUEUE_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const restored = createCloudSyncQueue({ runSync: vi.fn() });
    expect(restored.pendingCount()).toBe(1);
    expect(restored.items()[0]?.filePath).toBe('/a.md');
    restored.dispose();
  });

  it('损坏的持久化数据静默丢弃', () => {
    localStorage.setItem(CLOUD_QUEUE_STORAGE_KEY, '{not-json');
    const queue = createCloudSyncQueue({ runSync: vi.fn() });
    expect(queue.pendingCount()).toBe(0);
    queue.dispose();

    localStorage.setItem(CLOUD_QUEUE_STORAGE_KEY, JSON.stringify([{ tabId: 't1' }, null, 42]));
    const second = createCloudSyncQueue({ runSync: vi.fn() });
    expect(second.pendingCount()).toBe(0);
    second.dispose();
  });

  it('到期后自动 flush（无需手动调用）', async () => {
    const runSync = vi.fn(async () => ({ status: 'synced' as const }));
    const queue = createCloudSyncQueue({ runSync });
    queue.enqueue('t1', '/a.md');

    await vi.advanceTimersByTimeAsync(0);
    expect(runSync).toHaveBeenCalledTimes(1);
    expect(queue.pendingCount()).toBe(0);
    queue.dispose();
  });

  it('onChange 在变更时被调用；dispose 后不再自动执行', async () => {
    const onChange = vi.fn();
    const runSync = vi.fn(async () => ({ status: 'failed' as const, message: 'x' }));
    const queue = createCloudSyncQueue({ runSync, onChange });
    queue.enqueue('t1', '/a.md');
    expect(onChange).toHaveBeenCalled();
    await queue.flush();
    const callsAfterFlush = runSync.mock.calls.length;

    queue.dispose();
    vi.advanceTimersByTime(60_000);
    expect(runSync.mock.calls.length).toBe(callsAfterFlush);
  });

  it('clear 清空队列并清理定时器', async () => {
    const runSync = vi.fn(async () => ({ status: 'failed' as const, message: 'x' }));
    const queue = createCloudSyncQueue({ runSync });
    queue.enqueue('t1', '/a.md');
    await queue.flush();
    queue.clear();
    expect(queue.pendingCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(runSync).toHaveBeenCalledTimes(1);
    queue.dispose();
  });
});
