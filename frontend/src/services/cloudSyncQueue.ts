/**
 * @description 云文档同步队列：串行执行、指数退避重试、localStorage 断点续传。
 * 仅由 cloudSync store 使用；队列自身不感知网络状态，离线恢复由 store 监听 online 事件触发。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 09:40
 */

/** 队列项状态（persisted 只存 pending/failed，syncing 为运行期瞬时态） */
export type CloudQueueItemState = 'pending' | 'syncing' | 'failed';

export interface CloudQueueItem {
  /** 唯一键：`${tabId}:${filePath}` */
  id: string;
  tabId: string;
  filePath: string;
  /** 已失败次数（0 表示从未失败） */
  attempts: number;
  /** 下次允许执行的时间戳(ms) */
  nextRetryAt: number;
  lastError: string | null;
  addedAt: number;
}

/** localStorage 键：队列断点（不含任何凭据） */
export const CLOUD_QUEUE_STORAGE_KEY = 'tau-cloud-sync-queue';

/** 最大尝试次数，超过后放弃并移出队列 */
export const CLOUD_QUEUE_MAX_ATTEMPTS = 5;

/** 队列项最长保留时间（默认 7 天） */
export const CLOUD_QUEUE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** 退避基数：1s/2s/4s/8s/16s，封顶 30s */
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30_000;

/**
 * 指数退避：attempts 从 1 开始，返回下一次重试的等待毫秒数。
 * 1→1s, 2→2s, 3→4s, 4→8s, 5→16s, ≥6→30s
 */
export function computeRetryDelayMs(attempts: number): number {
  const safeAttempts = Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 1;
  const delay = RETRY_BASE_MS * Math.pow(2, safeAttempts - 1);
  return Math.min(RETRY_MAX_MS, delay);
}

/** 是否已到可执行时间 */
export function shouldRunNow(item: CloudQueueItem, now: number): boolean {
  return item.nextRetryAt <= now;
}

/** 清理超期项（默认 7 天），返回过滤后的新数组 */
export function pruneQueueItems(
  items: CloudQueueItem[],
  now: number,
  maxAgeMs: number = CLOUD_QUEUE_MAX_AGE_MS,
): CloudQueueItem[] {
  return items.filter((item) => now - item.addedAt <= maxAgeMs);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 把持久化数据还原成合法队列项（非法项静默丢弃） */
function normalizeItem(value: unknown): CloudQueueItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const tabId = typeof value.tabId === 'string' ? value.tabId : '';
  const filePath = typeof value.filePath === 'string' ? value.filePath : '';
  if (!tabId || !filePath) {
    return null;
  }
  const attempts = typeof value.attempts === 'number' && Number.isFinite(value.attempts)
    ? Math.max(0, Math.floor(value.attempts))
    : 0;
  const nextRetryAt = typeof value.nextRetryAt === 'number' && Number.isFinite(value.nextRetryAt)
    ? value.nextRetryAt
    : 0;
  const addedAt = typeof value.addedAt === 'number' && Number.isFinite(value.addedAt)
    ? value.addedAt
    : 0;
  return {
    id: `${tabId}:${filePath}`,
    tabId,
    filePath,
    attempts,
    nextRetryAt,
    lastError: typeof value.lastError === 'string' ? value.lastError : null,
    addedAt,
  };
}

function loadPersistedItems(): CloudQueueItem[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(CLOUD_QUEUE_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => normalizeItem(entry))
      .filter((entry): entry is CloudQueueItem => entry !== null);
  } catch {
    // 数据损坏时静默丢弃，避免阻塞启动
    return [];
  }
}

function persistItems(items: CloudQueueItem[]): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(CLOUD_QUEUE_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // 配额/隐私模式写入失败不影响内存队列
  }
}

export interface CloudQueueRunResult {
  status: 'synced' | 'skipped' | 'conflict' | 'failed';
  message?: string;
}

export interface CloudSyncQueueDeps {
  runSync: (tabId: string) => Promise<CloudQueueRunResult>;
  onChange?: (items: CloudQueueItem[]) => void;
  now?: () => number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export interface CloudSyncQueue {
  enqueue(tabId: string, filePath: string): void;
  flush(): Promise<void>;
  retryNow(): Promise<void>;
  items(): CloudQueueItem[];
  pendingCount(): number;
  failedCount(): number;
  clear(): void;
  dispose(): void;
}

/**
 * 创建队列实例。串行执行（同一时刻只跑一项），失败按退避自动重试。
 */
export function createCloudSyncQueue(deps: CloudSyncQueueDeps): CloudSyncQueue {
  const now = deps.now ?? (() => Date.now());
  const setTimeoutFn = deps.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = deps.clearTimeoutFn ?? clearTimeout;

  let items: CloudQueueItem[] = pruneQueueItems(loadPersistedItems(), now());
  let disposed = false;
  let flushing = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** 运行期标记：正在执行的队列项 id，避免重复执行 */
  let runningId: string | null = null;

  function emitChange(): void {
    persistItems(items);
    deps.onChange?.(items.map((item) => ({ ...item })));
  }

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeoutFn(timer);
      timer = null;
    }
  }

  /**
   * 安排下一次自动 flush：取最近一个到期待执行项，到期触发。
   * 没有待执行项时清理定时器。
   */
  function scheduleNext(): void {
    clearTimer();
    if (disposed || items.length === 0) {
      return;
    }
    const nextAt = items.reduce(
      (earliest, item) => Math.min(earliest, item.nextRetryAt),
      Number.POSITIVE_INFINITY,
    );
    if (!Number.isFinite(nextAt)) {
      return;
    }
    const delay = Math.max(0, nextAt - now());
    timer = setTimeoutFn(() => {
      timer = null;
      void flush();
    }, delay);
  }

  function removeItem(id: string): void {
    items = items.filter((item) => item.id !== id);
  }

  function markFailed(item: CloudQueueItem, message: string): void {
    const attempts = item.attempts + 1;
    if (attempts >= CLOUD_QUEUE_MAX_ATTEMPTS) {
      // 超过最大尝试次数：放弃（由 store 把最后错误展示给用户）
      removeItem(item.id);
      return;
    }
    items = items.map((entry) => (entry.id === item.id
      ? {
        ...entry,
        attempts,
        lastError: message,
        nextRetryAt: now() + computeRetryDelayMs(attempts),
      }
      : entry));
  }

  async function runItem(item: CloudQueueItem): Promise<void> {
    runningId = item.id;
    try {
      const result = await deps.runSync(item.tabId);
      if (result.status === 'failed') {
        markFailed(item, result.message ?? '云同步失败');
      } else {
        // synced / skipped / conflict 都不再自动重试
        removeItem(item.id);
      }
    } catch (error) {
      markFailed(item, error instanceof Error && error.message ? error.message : '云同步异常');
    } finally {
      runningId = null;
    }
  }

  async function flush(): Promise<void> {
    if (disposed || flushing) {
      return;
    }
    flushing = true;
    try {
      // 串行：每轮取第一个到期待执行项
      for (;;) {
        const candidate = items.find((item) => shouldRunNow(item, now()));
        if (!candidate || candidate.id === runningId) {
          break;
        }
        await runItem(candidate);
        emitChange();
        scheduleNext();
      }
    } finally {
      flushing = false;
      emitChange();
      scheduleNext();
    }
  }

  function enqueue(tabId: string, filePath: string): void {
    if (disposed || !tabId || !filePath) {
      return;
    }
    const id = `${tabId}:${filePath}`;
    const existing = items.find((item) => item.id === id);
    if (existing) {
      items = items.map((item) => (item.id === id ? { ...item, nextRetryAt: now() } : item));
    } else {
      items = [
        ...items,
        {
          id,
          tabId,
          filePath,
          attempts: 0,
          nextRetryAt: now(),
          lastError: null,
          addedAt: now(),
        },
      ];
    }
    emitChange();
    scheduleNext();
  }

  function retryNow(): Promise<void> {
    const currentNow = now();
    items = items.map((item) => ({ ...item, nextRetryAt: currentNow }));
    emitChange();
    return flush();
  }

  function clear(): void {
    items = [];
    clearTimer();
    emitChange();
  }

  function dispose(): void {
    disposed = true;
    clearTimer();
  }

  return {
    enqueue,
    flush,
    retryNow,
    items: () => items.map((item) => ({ ...item })),
    pendingCount: () => items.length,
    failedCount: () => items.filter((item) => item.attempts > 0).length,
    clear,
    dispose,
  };
}
