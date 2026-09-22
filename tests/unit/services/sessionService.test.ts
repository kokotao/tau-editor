import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionService } from '@/services/sessionService';
import type { Tab } from '@/stores/tabs';

const LEGACY_SESSION_KEY = 'text-editor-session-v1';
const LEGACY_DRAFTS_KEY = 'text-editor-recovery-drafts-v1';
const RECOVERY_KEY = 'text-editor-recovery-v2';

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

describe('sessionService 恢复库 v2（Web 回退后端）', () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = installStorage();
  });

  it('保存会话与草稿后可在新实例中恢复', async () => {
    const service = new SessionService();
    await service.initialize();

    await service.save({
      mode: 'single-file',
      workspacePath: null,
      workspaceName: null,
      activeTabId: 'tab-1',
      tabs: [makeTab()],
    });
    await service.saveRecoveryDrafts([makeTab()]);

    const reopened = new SessionService();
    await reopened.initialize();

    expect(reopened.load()?.activeTabId).toBe('tab-1');
    expect(reopened.load()?.tabs).toHaveLength(1);

    const drafts = reopened.loadRecoveryDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.content).toBe('draft');
    expect(drafts[0]?.filePath).toBe('/workspace/notes.md');
    expect(drafts[0]?.recoveredAt).toBeGreaterThan(0);
  });

  it('v1 会话与草稿迁移到 v2 后清理旧键', async () => {
    storage.set(LEGACY_SESSION_KEY, JSON.stringify({
      version: 1,
      savedAt: 1,
      mode: 'workspace',
      workspacePath: '/workspace',
      workspaceName: 'workspace',
      activeTabId: 'tab-1',
      tabs: [makeTab()],
    }));
    storage.set(LEGACY_DRAFTS_KEY, JSON.stringify([
      { ...makeTab({ content: 'legacy draft' }), recoveredAt: Date.now() },
    ]));

    const service = new SessionService();
    await service.initialize();

    expect(storage.has(LEGACY_SESSION_KEY)).toBe(false);
    expect(storage.has(LEGACY_DRAFTS_KEY)).toBe(false);
    expect(service.load()?.workspacePath).toBe('/workspace');
    expect(service.load()?.mode).toBe('workspace');
    expect(service.loadRecoveryDrafts()[0]?.content).toBe('legacy draft');
  });

  it('旧版数据损坏时跳过迁移并清理脏键', async () => {
    storage.set(LEGACY_SESSION_KEY, '{ not json');
    storage.set(LEGACY_DRAFTS_KEY, 'also broken');

    const service = new SessionService();
    await service.initialize();

    expect(service.load()).toBeNull();
    expect(service.loadRecoveryDrafts()).toEqual([]);
    expect(storage.has(LEGACY_SESSION_KEY)).toBe(false);
    expect(storage.has(LEGACY_DRAFTS_KEY)).toBe(false);
  });

  it('恢复库损坏时降级为空会话且初始化不抛错', async () => {
    storage.set(RECOVERY_KEY, '{ broken json');

    const service = new SessionService();
    await expect(service.initialize()).resolves.toBeUndefined();

    expect(service.isInitialized()).toBe(true);
    expect(service.load()).toBeNull();
    expect(service.loadRecoveryDrafts()).toEqual([]);
  });

  it('草稿数量超过上限时只保留最新的 40 条', async () => {
    const service = new SessionService();
    await service.initialize();

    const tabs = Array.from({ length: 45 }, (_, index) => makeTab({
      id: `tab-${index}`,
      filePath: `/workspace/notes-${index}.md`,
      fileName: `notes-${index}.md`,
    }));
    await service.saveRecoveryDrafts(tabs);

    expect(service.loadRecoveryDrafts()).toHaveLength(40);

    const reopened = new SessionService();
    await reopened.initialize();
    expect(reopened.loadRecoveryDrafts()).toHaveLength(40);
  });

  it('非脏标签与加载中的大文件不写入恢复草稿', async () => {
    const service = new SessionService();
    await service.initialize();

    await service.saveRecoveryDrafts([
      makeTab({ id: 'clean', isDirty: false }),
      makeTab({ id: 'loading', isLoadingContent: true }),
      makeTab({ id: 'dirty' }),
    ]);

    const drafts = service.loadRecoveryDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.id).toBe('dirty');
  });

  it('丢弃单个草稿只影响目标标签', async () => {
    const service = new SessionService();
    await service.initialize();
    await service.saveRecoveryDrafts([
      makeTab({ id: 'tab-1', filePath: '/workspace/a.md', fileName: 'a.md' }),
      makeTab({ id: 'tab-2', filePath: '/workspace/b.md', fileName: 'b.md' }),
    ]);

    await service.discardRecoveryDraft('tab-1');

    expect(service.loadRecoveryDrafts().map((draft) => draft.id)).toEqual(['tab-2']);

    const reopened = new SessionService();
    await reopened.initialize();
    expect(reopened.loadRecoveryDrafts().map((draft) => draft.id)).toEqual(['tab-2']);
  });

  it('清空草稿后保留会话快照', async () => {
    const service = new SessionService();
    await service.initialize();
    await service.save({
      mode: 'single-file',
      workspacePath: null,
      workspaceName: null,
      activeTabId: 'tab-1',
      tabs: [makeTab()],
    });
    await service.saveRecoveryDrafts([makeTab()]);
    await service.clearRecoveryDrafts();

    expect(service.loadRecoveryDrafts()).toEqual([]);
    expect(service.load()?.activeTabId).toBe('tab-1');

    const reopened = new SessionService();
    await reopened.initialize();
    expect(reopened.loadRecoveryDrafts()).toEqual([]);
    expect(reopened.load()?.activeTabId).toBe('tab-1');
  });

  it('clear 同时清空会话与草稿', async () => {
    const service = new SessionService();
    await service.initialize();
    await service.save({
      mode: 'single-file',
      workspacePath: null,
      workspaceName: null,
      activeTabId: 'tab-1',
      tabs: [makeTab()],
    });
    await service.saveRecoveryDrafts([makeTab()]);

    await service.clear();

    expect(service.load()).toBeNull();
    expect(service.loadRecoveryDrafts()).toEqual([]);

    const reopened = new SessionService();
    await reopened.initialize();
    expect(reopened.load()).toBeNull();
    expect(reopened.loadRecoveryDrafts()).toEqual([]);
  });

  it('恢复半加载大文件草稿时降级为 cancelled 并保持只读', async () => {
    storage.set(RECOVERY_KEY, JSON.stringify({
      version: 2,
      session: null,
      drafts: [{
        version: 2,
        id: 'tab-large',
        path: '/workspace/big.log',
        baseFingerprint: { mtimeMs: 100, size: null },
        content: 'partial',
        updatedAt: Date.now(),
        cursor: null,
        scrollTop: null,
        tab: {
          id: 'tab-large',
          filePath: '/workspace/big.log',
          fileName: 'big.log',
          language: 'plaintext',
          isUntitled: false,
          createdAt: 1,
          isLargeFile: true,
          isLoadingContent: true,
          largeFileSize: 100,
          largeFileLoadedBytes: 40,
          largeFileLoadProgress: 40,
          largeFileLoadState: 'loading',
          largeFileLoadSessionId: 7,
          fileRevision: '100:100',
        },
      }],
    }));

    const service = new SessionService();
    await service.initialize();

    const draft = service.loadRecoveryDrafts()[0];
    expect(draft?.largeFileLoadState).toBe('cancelled');
    expect(draft?.isLoadingContent).toBe(true);
    expect(draft?.largeFileLoadedBytes).toBe(40);
    expect(draft?.largeFileLoadProgress).toBe(40);
    expect(draft?.largeFileLoadSessionId).toBeUndefined();
    expect(draft?.fileRevision).toBe('100:100');
  });

  it('恢复已完成加载的大文件草稿时保持可编辑并保留 revision', async () => {
    const service = new SessionService();
    await service.initialize();
    await service.saveRecoveryDrafts([
      makeTab({
        id: 'tab-large',
        filePath: '/workspace/big.log',
        fileName: 'big.log',
        isLargeFile: true,
        isLoadingContent: false,
        largeFileSize: 100,
        largeFileLoadedBytes: 100,
        largeFileLoadProgress: 100,
        largeFileLoadState: 'complete',
        fileRevision: '100:100',
      }),
    ]);

    const reopened = new SessionService();
    await reopened.initialize();

    const draft = reopened.loadRecoveryDrafts()[0];
    expect(draft?.isLoadingContent).toBe(false);
    expect(draft?.largeFileLoadState).toBe('complete');
    expect(draft?.fileRevision).toBe('100:100');
  });

  it('会话恢复时不允许大文件停留在 loading 状态', async () => {
    const service = new SessionService();
    await service.initialize();
    await service.save({
      mode: 'single-file',
      workspacePath: null,
      workspaceName: null,
      activeTabId: 'tab-large',
      tabs: [makeTab({
        id: 'tab-large',
        filePath: '/workspace/big.log',
        fileName: 'big.log',
        isLargeFile: true,
        isLoadingContent: true,
        largeFileSize: 100,
        largeFileLoadedBytes: 40,
        largeFileLoadState: 'loading',
        largeFileLoadSessionId: 7,
        fileRevision: '100:100',
      })],
    });

    const reopened = new SessionService();
    await reopened.initialize();

    const restored = reopened.load()?.tabs[0];
    expect(restored?.largeFileLoadState).toBe('cancelled');
    expect(restored?.isLoadingContent).toBe(true);
    expect(restored?.largeFileLoadSessionId).toBeUndefined();
    expect(restored?.fileRevision).toBe('100:100');
  });
});
