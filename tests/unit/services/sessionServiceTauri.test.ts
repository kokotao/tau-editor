import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionService } from '@/services/sessionService';
import type { Tab } from '@/stores/tabs';

const tauriMocks = vi.hoisted(() => ({
  list: vi.fn(),
  write: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/lib/tauri', () => ({
  isTauriApp: () => true,
  recoveryCommands: {
    list: tauriMocks.list,
    write: tauriMocks.write,
    remove: tauriMocks.remove,
  },
}));

const LEGACY_SESSION_KEY = 'text-editor-session-v1';
const LEGACY_DRAFTS_KEY = 'text-editor-recovery-drafts-v1';
const RECOVERY_LIMITS = { maxDrafts: 40, maxTotalBytes: 32 * 1024 * 1024, maxAgeDays: 30 };

function makeTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: 'tab-1',
    filePath: '/workspace/notes.md',
    fileName: 'notes.md',
    language: 'markdown',
    isDirty: true,
    isUntitled: false,
    content: 'draft',
    createdAt: 1,
    ...overrides,
  };
}

function installStorage(): Map<string, string> {
  const storage = new Map<string, string>();
  vi.mocked(localStorage.getItem).mockImplementation((key: string) => storage.get(key) ?? null);
  vi.mocked(localStorage.setItem).mockImplementation((key: string, value: string) => {
    storage.set(key, value);
  });
  vi.mocked(localStorage.removeItem).mockImplementation((key: string) => {
    storage.delete(key);
  });
  vi.mocked(localStorage.clear).mockImplementation(() => {
    storage.clear();
  });
  return storage;
}

describe('sessionService 恢复库 v2（Tauri app-data 后端）', () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = installStorage();
    tauriMocks.list.mockReset();
    tauriMocks.write.mockReset();
    tauriMocks.remove.mockReset();
    tauriMocks.list.mockResolvedValue({ session: null, drafts: [], limits: RECOVERY_LIMITS });
    tauriMocks.write.mockResolvedValue({ writtenDrafts: 0, deletedDrafts: 0 });
    tauriMocks.remove.mockResolvedValue({ deleted: 0 });
  });

  it('读取 app-data 恢复库并还原会话与草稿', async () => {
    tauriMocks.list.mockResolvedValue({
      session: {
        version: 2,
        savedAt: 100,
        workspacePath: '/workspace',
        activeTabPath: '/workspace/notes.md',
        openTabs: [{ path: '/workspace/notes.md', viewState: null, pinned: false }],
        layout: { mode: 'workspace', workspaceName: 'workspace', activeTabId: 'tab-1' },
        recentWorkspaces: ['/workspace'],
        tabs: [makeTab()],
      },
      drafts: [{
        version: 2,
        id: 'tab-1',
        path: '/workspace/notes.md',
        baseFingerprint: { mtimeMs: 42, size: null },
        content: 'unsaved change',
        updatedAt: 200,
        cursor: null,
        scrollTop: null,
        tab: makeTab(),
      }],
      limits: RECOVERY_LIMITS,
    });

    const service = new SessionService();
    await service.initialize();

    expect(service.isInitialized()).toBe(true);
    expect(service.getLimits()).toEqual(RECOVERY_LIMITS);
    expect(service.load()?.mode).toBe('workspace');
    expect(service.load()?.workspacePath).toBe('/workspace');

    const drafts = service.loadRecoveryDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.content).toBe('unsaved change');
    expect(drafts[0]?.isDirty).toBe(true);
    expect(drafts[0]?.lastKnownModified).toBe(42);
    expect(drafts[0]?.recoveredAt).toBe(200);
  });

  it('把 v1 会话与草稿迁移进 app-data 恢复库并清理旧键', async () => {
    storage.set(LEGACY_SESSION_KEY, JSON.stringify({
      version: 1,
      savedAt: 1,
      mode: 'single-file',
      workspacePath: null,
      workspaceName: null,
      activeTabId: 'tab-1',
      tabs: [makeTab()],
    }));
    storage.set(LEGACY_DRAFTS_KEY, JSON.stringify([
      { ...makeTab({ content: 'legacy draft' }), recoveredAt: Date.now() },
    ]));

    const service = new SessionService();
    await service.initialize();

    expect(tauriMocks.write).toHaveBeenCalledTimes(1);
    const [session, drafts] = tauriMocks.write.mock.calls[0] as [Record<string, unknown>, unknown[]];
    expect(session.version).toBe(2);
    expect(session.activeTabPath).toBe('/workspace/notes.md');
    expect(drafts).toHaveLength(1);
    expect((drafts[0] as { content: string }).content).toBe('legacy draft');

    expect(storage.has(LEGACY_SESSION_KEY)).toBe(false);
    expect(storage.has(LEGACY_DRAFTS_KEY)).toBe(false);
  });

  it('迁移写入失败时保留旧键以便下次重试', async () => {
    storage.set(LEGACY_SESSION_KEY, JSON.stringify({
      version: 1,
      savedAt: 1,
      mode: 'single-file',
      workspacePath: null,
      workspaceName: null,
      activeTabId: 'tab-1',
      tabs: [makeTab()],
    }));
    tauriMocks.write.mockRejectedValue(new Error('disk full'));

    const service = new SessionService();
    await service.initialize();

    expect(storage.has(LEGACY_SESSION_KEY)).toBe(true);
  });

  it('app-data 恢复库不可用时降级为空会话', async () => {
    tauriMocks.list.mockRejectedValue(new Error('app-data unavailable'));

    const service = new SessionService();
    await expect(service.initialize()).resolves.toBeUndefined();

    expect(service.load()).toBeNull();
    expect(service.loadRecoveryDrafts()).toEqual([]);
  });

  it('保存会话时只提交 session 文档，不覆盖草稿', async () => {
    const service = new SessionService();
    await service.initialize();

    await service.save({
      mode: 'workspace',
      workspacePath: '/workspace',
      workspaceName: 'workspace',
      activeTabId: 'tab-1',
      tabs: [makeTab()],
    });

    expect(tauriMocks.write).toHaveBeenLastCalledWith(
      expect.objectContaining({
        version: 2,
        workspacePath: '/workspace',
        activeTabPath: '/workspace/notes.md',
      }),
      null,
    );
  });

  it('保存草稿时提交完整草稿集合与基线指纹', async () => {
    const service = new SessionService();
    await service.initialize();

    await service.saveRecoveryDrafts([makeTab({ lastKnownModified: 1234 })]);

    const [session, drafts] = tauriMocks.write.mock.calls.at(-1) as [null, Array<Record<string, unknown>>];
    expect(session).toBeNull();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.content).toBe('draft');
    expect(drafts[0]?.baseFingerprint).toEqual({ mtimeMs: 1234, size: null });
  });

  it('clear 提交 session 与草稿的完整清理请求', async () => {
    const service = new SessionService();
    await service.initialize();

    await service.clear();

    expect(tauriMocks.remove).toHaveBeenCalledWith({ all: true, session: true });
  });
});
