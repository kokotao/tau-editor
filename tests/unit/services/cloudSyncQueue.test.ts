/**
 * @description 云同步队列单元测试：退避、次数上限、持久化、冲突不重试、自动定时 flush，
 * 以及 store 侧自动同步防抖 / 队列初始化 / 启动续跑 / 偏好持久化白名单（fake timers）。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 09:45
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
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
import { CLOUD_SYNC_STORAGE_KEY, useCloudSyncStore } from '@/stores/cloudSync';
import { useTabsStore } from '@/stores/tabs';

type QueueRunResultStub = {
  status: 'synced' | 'skipped' | 'conflict' | 'failed';
  message?: string;
};

/**
 * store 的队列 runSync 注入的是 cloudSyncService.syncCurrentDocument，
 * 这里只替换这一处网络边界，队列与 store 逻辑都跑真实实现。
 */
const runSyncMock = vi.hoisted(() => ({
  fn: vi.fn(async (_tabId?: string): Promise<QueueRunResultStub> => ({
    status: 'failed',
    message: 'offline',
  })),
}));

vi.mock('@/services/cloudSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudSyncService')>();
  return { ...actual, syncCurrentDocument: runSyncMock.fn };
});

/** store.initialize() 依赖的两处网络边界：会话恢复 + 配额查询 */
const sessionMock = vi.hoisted(() => ({
  restore: vi.fn(),
  space: vi.fn(),
}));

vi.mock('@/services/cloudAuthService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudAuthService')>();
  return { ...actual, restoreCloudSession: sessionMock.restore };
});

vi.mock('@/services/cloudDocService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudDocService')>();
  return { ...actual, getCloudSpace: sessionMock.space };
});

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

// ---------------------------------------------------------------------------
// store 层：自动同步防抖 / 偏好持久化 / 队列初始化（契约 §A1 store 扩展）
// ---------------------------------------------------------------------------

describe('cloudSyncStore 自动同步', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installMemoryStorage();
    localStorage.clear();
    setActivePinia(createPinia());
    // 全局 mockReset 会清掉实现，这里按用例重新装一次「失败」结果
    runSyncMock.fn.mockResolvedValue({ status: 'failed', message: 'offline' });
    // initialize() 的默认边界：已登录 + 空配额
    sessionMock.restore.mockResolvedValue({
      ok: true,
      data: {
        signedIn: true,
        userId: 'u1',
        username: 'alice',
        baseUrl: 'https://note.lizipro.cn/lizi',
      },
    });
    sessionMock.space.mockResolvedValue({
      ok: true,
      data: {
        userId: 'u1',
        usedBytes: 0,
        quotaBytes: 1024,
        fileCount: 0,
        maxVersionPerFile: 30,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** 造一个带磁盘路径的标签，让防抖回调能取到 filePath */
  function seedTab(filePath = '/ws/a.md'): string {
    const tabsStore = useTabsStore();
    return tabsStore.addTab({
      filePath,
      fileName: filePath.split('/').pop() ?? 'a.md',
      language: 'markdown',
      isDirty: false,
      isUntitled: false,
      content: 'hello',
    });
  }

  it('未登录时 scheduleAutoSync 不入队（no-op）', async () => {
    const tabId = seedTab();
    const store = useCloudSyncStore();
    store.setAutoSyncEnabled(true);

    store.scheduleAutoSync(tabId);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(runSyncMock.fn).not.toHaveBeenCalled();
    expect(store.pendingSyncCount).toBe(0);
  });

  it('已登录但未开启自动同步时 no-op', async () => {
    const tabId = seedTab();
    const store = useCloudSyncStore();
    store.signedIn = true;

    store.scheduleAutoSync(tabId);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(runSyncMock.fn).not.toHaveBeenCalled();
    expect(store.pendingSyncCount).toBe(0);
  });

  it('防抖窗口内重复调用只同步一次，失败项留在队列', async () => {
    const tabId = seedTab();
    const store = useCloudSyncStore();
    store.signedIn = true;
    store.setAutoSyncEnabled(true);
    expect(store.syncDebounceMs).toBe(3000);

    // 每 1s 调一次，3s 防抖窗口内合并成一次
    store.scheduleAutoSync(tabId);
    await vi.advanceTimersByTimeAsync(1_000);
    store.scheduleAutoSync(tabId);
    await vi.advanceTimersByTimeAsync(1_000);
    store.scheduleAutoSync(tabId);

    expect(runSyncMock.fn).not.toHaveBeenCalled();
    expect(store.pendingSyncCount).toBe(0);

    // 距最后一次调用满 3000ms（t=5000）才真正入队并同步
    await vi.advanceTimersByTimeAsync(3_000);

    expect(runSyncMock.fn).toHaveBeenCalledTimes(1);
    expect(runSyncMock.fn).toHaveBeenCalledWith(tabId);
    expect(store.pendingSyncCount).toBe(1);
    expect(store.failedSyncCount).toBe(1);
    expect(store.autoSyncAvailable).toBe(false); // 测试环境不是桌面端
  });

  it('setSyncDebounceMs 夹取 500..60000，偏好写入白名单且不含凭据', () => {
    const store = useCloudSyncStore();

    store.setSyncDebounceMs(100);
    expect(store.syncDebounceMs).toBe(500);
    store.setSyncDebounceMs(999_999);
    expect(store.syncDebounceMs).toBe(60_000);
    store.setSyncDebounceMs(2500);
    expect(store.syncDebounceMs).toBe(2500);
    store.setAutoSyncEnabled(true);

    const raw = localStorage.getItem(CLOUD_SYNC_STORAGE_KEY) ?? '';
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.autoSyncEnabled).toBe(true);
    expect(parsed.syncDebounceMs).toBe(2500);
    // 白名单：只允许 baseUrl/docMap 与两个自动同步偏好
    expect(Object.keys(parsed).sort()).toEqual([
      'autoSyncEnabled',
      'baseUrl',
      'docMap',
      'syncDebounceMs',
    ]);
    expect(raw).not.toContain('token');
    expect(raw).not.toContain('password');
  });

  it('initializeQueue 幂等，并把持久化断点恢复成队列快照', () => {
    localStorage.setItem(CLOUD_QUEUE_STORAGE_KEY, JSON.stringify([
      {
        tabId: 'tab-restored',
        filePath: '/ws/a.md',
        attempts: 2,
        nextRetryAt: 0,
        lastError: 'offline',
        addedAt: Date.now(),
      },
    ]));

    const store = useCloudSyncStore();
    store.initializeQueue();
    expect(store.pendingSyncCount).toBe(1);
    expect(store.failedSyncCount).toBe(1);
    expect(store.queueItems[0]?.tabId).toBe('tab-restored');

    // 再调一次不应重复建队列 / 丢项
    store.initializeQueue();
    expect(store.pendingSyncCount).toBe(1);
  });

  it('网络恢复（window online）时立即冲刷队列', async () => {
    localStorage.setItem(CLOUD_QUEUE_STORAGE_KEY, JSON.stringify([
      {
        tabId: 'tab-online',
        filePath: '/ws/a.md',
        attempts: 1,
        nextRetryAt: 0,
        lastError: 'offline',
        addedAt: Date.now(),
      },
    ]));

    const store = useCloudSyncStore();
    store.initializeQueue();
    expect(runSyncMock.fn).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);

    expect(runSyncMock.fn).toHaveBeenCalledWith('tab-online');
    expect(store.pendingSyncCount).toBe(1);
  });

  describe('initialize 启动续跑断点队列', () => {
    /** 写入持久化偏好 + 一条「已到期」的断点队列项 */
    function seedPersisted(autoSyncEnabled: boolean, tabId = 'tab-resume'): void {
      localStorage.setItem(
        CLOUD_SYNC_STORAGE_KEY,
        JSON.stringify({ autoSyncEnabled, syncDebounceMs: 3000 }),
      );
      localStorage.setItem(
        CLOUD_QUEUE_STORAGE_KEY,
        JSON.stringify([
          {
            tabId,
            filePath: '/ws/a.md',
            attempts: 1,
            nextRetryAt: 0,
            lastError: 'offline',
            addedAt: Date.now(),
          },
        ]),
      );
    }

    it('autoSyncEnabled=true 时 initialize 后自动续跑并清空队列', async () => {
      seedPersisted(true);
      runSyncMock.fn.mockResolvedValue({ status: 'synced' });
      const store = useCloudSyncStore();

      await store.initialize();
      await vi.advanceTimersByTimeAsync(0);

      // 会话恢复成功（signedIn 置位）后才续跑
      expect(sessionMock.restore).toHaveBeenCalledTimes(1);
      expect(store.signedIn).toBe(true);
      expect(runSyncMock.fn).toHaveBeenCalledWith('tab-resume');
      expect(store.pendingSyncCount).toBe(0);
    });

    it('autoSyncEnabled=false 时不续跑，断点项保留', async () => {
      seedPersisted(false);
      const store = useCloudSyncStore();

      await store.initialize();
      await vi.advanceTimersByTimeAsync(0);

      expect(sessionMock.restore).toHaveBeenCalledTimes(1);
      expect(runSyncMock.fn).not.toHaveBeenCalled();
      expect(store.pendingSyncCount).toBe(1);
    });
  });
});
