import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriMocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  status: vi.fn(),
  listen: vi.fn(),
  isTauriApp: vi.fn(() => true),
}));

const eventMocks = vi.hoisted(() => ({
  listeners: [] as Array<{ handler: (payload: unknown) => void }>,
  unlisten: vi.fn(),
}));

vi.mock('@/lib/tauri', () => ({
  isTauriApp: tauriMocks.isTauriApp,
  WORKSPACE_FILE_CHANGED_EVENT: 'workspace:file-changed',
  listenWorkspaceFileChanges: tauriMocks.listen,
  watcherCommands: {
    start: tauriMocks.start,
    stop: tauriMocks.stop,
    status: tauriMocks.status,
  },
}));


import {
  createWorkspaceWatcherService,
  normalizeWorkspaceFileChange,
  normalizeWorkspaceFileChanges,
  normalizeWorkspacePath,
  WORKSPACE_FILE_CHANGED_EVENT,
} from '@/services/workspaceWatcherService';

describe('workspaceWatcherService 路径与载荷处理', () => {
  it('统一路径分隔符并忽略 Windows 盘符大小写', () => {
    expect(normalizeWorkspacePath('C:\\Work\\Notes.md')).toBe('c:/work/notes.md');
    expect(normalizeWorkspacePath('/Work/Notes.md')).toBe('/Work/Notes.md');
  });

  it('过滤非法变更条目', () => {
    expect(normalizeWorkspaceFileChange({ path: '/ws/a.md', kind: 'modified' })).toEqual({
      path: '/ws/a.md',
      oldPath: null,
      kind: 'modified',
      modifiedMs: null,
      size: null,
    });
    expect(normalizeWorkspaceFileChange({ path: '/ws/a.md', kind: 'unknown' })).toBeNull();
    expect(normalizeWorkspaceFileChange({ kind: 'modified' })).toBeNull();
    expect(normalizeWorkspaceFileChange(null)).toBeNull();
  });

  it('兼容数组与单条载荷', () => {
    expect(normalizeWorkspaceFileChanges([{ path: '/ws/a.md', kind: 'created' }])).toHaveLength(1);
    expect(normalizeWorkspaceFileChanges({ path: '/ws/b.md', kind: 'removed' })).toHaveLength(1);
    expect(normalizeWorkspaceFileChanges(undefined)).toEqual([]);
  });
});

describe('workspaceWatcherService 订阅与生命周期', () => {
  beforeEach(() => {
    eventMocks.listeners.length = 0;
    eventMocks.unlisten.mockReset();
    tauriMocks.start.mockReset();
    tauriMocks.stop.mockReset();
    tauriMocks.isTauriApp.mockReturnValue(true);
    tauriMocks.listen.mockReset();
    tauriMocks.listen.mockImplementation(async (handler: (payload: unknown) => void) => {
      eventMocks.listeners.push({ handler });
      return eventMocks.unlisten;
    });
    tauriMocks.start.mockResolvedValue({
      watching: true,
      rootPath: '/ws',
      debounceMs: 250,
    });
    tauriMocks.stop.mockResolvedValue({ watching: false, rootPath: null, debounceMs: 250 });
  });

  it('启动监听后把归一化事件分发给订阅者', async () => {
    const service = createWorkspaceWatcherService();
    const received: unknown[] = [];
    service.onChange((changes) => received.push(changes));

    const started = await service.start('/ws');
    expect(started).toBe(true);
    expect(service.watching).toBe(true);
    expect(tauriMocks.start).toHaveBeenCalledWith('/ws', 250);
    expect(tauriMocks.listen).toHaveBeenCalledTimes(1);
    expect(WORKSPACE_FILE_CHANGED_EVENT).toBe('workspace:file-changed');

    eventMocks.listeners[0]?.handler([
      { path: '/ws/a.md', kind: 'modified', modifiedMs: 42, size: 3 },
      { path: '/ws/b.md', kind: 'nope' },
    ]);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual([
      { path: '/ws/a.md', oldPath: null, kind: 'modified', modifiedMs: 42, size: 3 },
    ]);
  });

  it('重复启动同一根目录时复用已有订阅', async () => {
    const service = createWorkspaceWatcherService();
    await service.start('/ws');
    await service.start('/ws');

    expect(tauriMocks.start).toHaveBeenCalledTimes(1);
    expect(eventMocks.listeners).toHaveLength(1);
  });

  it('停止监听时释放订阅并通知后端', async () => {
    const service = createWorkspaceWatcherService();
    await service.start('/ws');
    await service.stop();

    expect(eventMocks.unlisten).toHaveBeenCalledTimes(1);
    expect(tauriMocks.stop).toHaveBeenCalledTimes(1);
    expect(service.watching).toBe(false);
  });

  it('后端启动失败时返回 false 并保持未监听状态', async () => {
    tauriMocks.start.mockRejectedValue(new Error('watch failed'));
    const service = createWorkspaceWatcherService();

    await expect(service.start('/ws')).resolves.toBe(false);
    expect(service.watching).toBe(false);
  });

  it('Web 环境不启动监听', async () => {
    tauriMocks.isTauriApp.mockReturnValue(false);
    const service = createWorkspaceWatcherService();

    await expect(service.start('/ws')).resolves.toBe(false);
    expect(tauriMocks.start).not.toHaveBeenCalled();
  });

  it('取消订阅后不再收到事件', async () => {
    const service = createWorkspaceWatcherService();
    const handler = vi.fn();
    const unsubscribe = service.onChange(handler);
    await service.start('/ws');

    unsubscribe();
    eventMocks.listeners[0]?.handler([{ path: '/ws/a.md', kind: 'modified' }]);

    expect(handler).not.toHaveBeenCalled();
  });
  it('启动过程中被停止时释放订阅且不进入监听态', async () => {
    let releaseListen: ((unlisten: () => void) => void) | null = null;
    tauriMocks.listen.mockImplementationOnce(
      () =>
        new Promise<() => void>((resolve) => {
          releaseListen = resolve;
        }),
    );
    const service = createWorkspaceWatcherService();
    const pending = service.start('/ws');
    await vi.waitFor(() => {
      expect(releaseListen).not.toBeNull();
    });

    const lateUnlisten = vi.fn();
    await service.stop();
    (releaseListen as ((unlisten: () => void) => void) | null)?.(lateUnlisten);

    await expect(pending).resolves.toBe(false);
    expect(lateUnlisten).toHaveBeenCalledTimes(1);
    expect(tauriMocks.start).not.toHaveBeenCalled();
    expect(service.watching).toBe(false);
  });
});
