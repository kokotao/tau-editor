import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionService, type SessionSnapshot } from '@/services/sessionService';

const snapshot: SessionSnapshot = {
  version: 1,
  savedAt: 1,
  mode: 'single-file',
  workspacePath: null,
  workspaceName: null,
  activeTabId: 'tab-1',
  tabs: [{
    id: 'tab-1',
    filePath: '/workspace/notes.md',
    fileName: 'notes.md',
    language: 'markdown',
    isDirty: true,
    isUntitled: false,
    content: 'draft',
    createdAt: 1,
  }],
};

describe('sessionService recovery drafts', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.mocked(localStorage.getItem).mockImplementation((key) => storage.get(key) ?? null);
    vi.mocked(localStorage.setItem).mockImplementation((key, value) => storage.set(key, value));
    vi.mocked(localStorage.removeItem).mockImplementation((key) => storage.delete(key));
    vi.mocked(localStorage.clear).mockImplementation(() => storage.clear());
    localStorage.clear();
  });

  it('单独保存脏标签草稿，并支持恢复与丢弃', () => {
    sessionService.saveRecoveryDrafts(snapshot.tabs);

    expect(sessionService.loadRecoveryDrafts()).toHaveLength(1);
    expect(sessionService.loadRecoveryDrafts()[0]?.content).toBe('draft');

    sessionService.discardRecoveryDraft('tab-1');
    expect(sessionService.loadRecoveryDrafts()).toEqual([]);
  });
});
