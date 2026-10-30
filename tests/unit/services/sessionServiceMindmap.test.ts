import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionService } from '@/services/sessionService';
import type { Tab } from '@/stores/tabs';

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

describe('sessionService · 思维导图 documentKind 恢复（阶段 0）', () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    vi.resetAllMocks();
    storage = installStorage();
  });

  it('恢复思维导图草稿时保留 documentKind=mindmap', async () => {
    const service = new SessionService();
    await service.initialize();

    const mindmapTab = makeTab({
      id: 'mm-1',
      filePath: '/workspace/notes.taumap',
      fileName: 'notes.taumap',
      language: 'json',
      documentKind: 'mindmap',
      content: JSON.stringify({
        format: 'tau-mindmap',
        schemaVersion: 1,
        title: '草稿导图',
        topics: {},
      }),
    });
    await service.saveRecoveryDrafts([mindmapTab]);

    const reopened = new SessionService();
    await reopened.initialize();
    const drafts = reopened.loadRecoveryDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.documentKind).toBe('mindmap');
    expect(drafts[0]?.language).toBe('json');
    expect(drafts[0]?.filePath).toBe('/workspace/notes.taumap');
  });

  it('恢复外部思维导图草稿时保留 documentKind=mindmap-external', async () => {
    const service = new SessionService();
    await service.initialize();

    await service.saveRecoveryDrafts([makeTab({
      id: 'mm-2',
      filePath: '/workspace/plan.xmind',
      fileName: 'plan.xmind',
      language: 'plaintext',
      documentKind: 'mindmap-external',
    })]);

    const reopened = new SessionService();
    await reopened.initialize();
    const draft = reopened.loadRecoveryDrafts()[0];
    expect(draft?.documentKind).toBe('mindmap-external');
  });

  it('恢复普通文本草稿不注入 documentKind', async () => {
    const service = new SessionService();
    await service.initialize();

    await service.saveRecoveryDrafts([makeTab({ documentKind: undefined })]);

    const reopened = new SessionService();
    await reopened.initialize();
    const draft = reopened.loadRecoveryDrafts()[0];
    expect(draft?.documentKind).toBeUndefined();
  });
});