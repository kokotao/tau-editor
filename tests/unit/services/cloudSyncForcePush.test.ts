import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

/**
 * P8：store.forcePushCurrentDocument（冲突时「用本地覆盖云端」）的单元测试。
 * 只 mock Rust 云命令边界，cloudDocService / cloudSyncService 用真实实现，
 * 这样能验证 baseVersion 确实取自云端当前版本。
 */
const cloudMocks = vi.hoisted(() => ({
  isTauri: { value: true },
  get: vi.fn(),
  save: vi.fn(),
  me: vi.fn(),
  list: vi.fn(),
  readSyncSource: vi.fn(),
  session: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauriApp: () => cloudMocks.isTauri.value,
    cloudCommands: {
      ...actual.cloudCommands,
      get: cloudMocks.get,
      save: cloudMocks.save,
      me: cloudMocks.me,
      list: cloudMocks.list,
      readSyncSource: cloudMocks.readSyncSource,
      session: cloudMocks.session,
    },
  };
});

import { CLOUD_SYNC_MAX_BYTES } from '@/services/cloudSyncService';
import { useCloudSyncStore } from '@/stores/cloudSync';
import { useTabsStore, type Tab } from '@/stores/tabs';
import { useWorkspaceStore } from '@/stores/workspace';

const REMOTE_DOC = {
  fileId: 42,
  path: 'tau/ws/notes.md',
  title: 'notes.md',
  contentHash: 'sha256:remote',
  size: 10,
  version: 7,
  category: null,
  categoryId: null,
  tags: null,
  visibility: 'PRIVATE',
  publishedArticleId: null,
  updatedAt: '2026-10-24T10:00:00Z',
};

function seedActiveTab(overrides: Partial<Omit<Tab, 'id' | 'createdAt'>> = {}) {
  const tabsStore = useTabsStore();
  const tabId = tabsStore.addTab({
    filePath: '/ws/notes.md',
    fileName: 'notes.md',
    language: 'markdown',
    isDirty: false,
    isUntitled: false,
    content: 'local content',
    cloudFileId: 42,
    cloudVersion: 5,
    cloudContentHash: 'sha256:base',
    ...overrides,
  });

  const workspaceStore = useWorkspaceStore();
  workspaceStore.currentWorkspacePath = '/ws';
  workspaceStore.currentWorkspaceName = 'ws';

  return { tabsStore, tabId };
}

describe('cloudSyncStore.forcePushCurrentDocument', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    cloudMocks.isTauri.value = true;
    cloudMocks.get.mockResolvedValue(REMOTE_DOC);
    cloudMocks.save.mockResolvedValue({
      fileId: 42,
      version: 8,
      contentHash: 'sha256:local',
      size: 12,
      updatedAt: '2026-10-25T09:00:00Z',
    });
    cloudMocks.me.mockResolvedValue({
      userId: 'u1',
      usedBytes: 12,
      quotaBytes: 1024,
      fileCount: 1,
      maxVersionPerFile: 30,
    });
    cloudMocks.list.mockResolvedValue({ records: [], total: 0, page: 1, size: 100 });
    cloudMocks.readSyncSource.mockResolvedValue({
      content: 'local content',
      contentHash: 'sha256:local',
      size: 12,
      modifiedMs: 1,
    });
    cloudMocks.session.mockResolvedValue({
      signedIn: true,
      userId: 'u1',
      username: 'alice',
      baseUrl: 'https://note.lizipro.cn/lizi',
    });
  });

  it('应以云端当前版本作为 baseVersion 覆盖保存本地内容', async () => {
    const { tabsStore } = seedActiveTab();
    const store = useCloudSyncStore();
    store.signedIn = true;

    const result = await store.forcePushCurrentDocument();

    expect(cloudMocks.readSyncSource).toHaveBeenCalledWith('/ws/notes.md', CLOUD_SYNC_MAX_BYTES);
    expect(cloudMocks.get).toHaveBeenCalledWith(42);
    expect(cloudMocks.save).toHaveBeenCalledTimes(1);

    const payload = cloudMocks.save.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      path: 'tau/ws/notes.md',
      content: 'local content',
      contentHash: 'sha256:local',
      baseVersion: 7,
    });

    expect(result.status).toBe('synced');
    expect(result.version).toBe(8);
    // 成功后回填标签的云端基线，避免下一次同步再次判定冲突。
    expect(tabsStore.activeTab?.cloudFileId).toBe(42);
    expect(tabsStore.activeTab?.cloudVersion).toBe(8);
    expect(tabsStore.activeTab?.cloudContentHash).toBe('sha256:local');
  });

  it('云端没有该文档时应按新建处理（baseVersion 为 null）', async () => {
    seedActiveTab({ cloudFileId: null, cloudVersion: null, cloudContentHash: null });
    cloudMocks.save.mockResolvedValue({
      fileId: 43,
      version: 1,
      contentHash: 'sha256:local',
      size: 12,
      updatedAt: null,
    });

    const store = useCloudSyncStore();
    store.signedIn = true;

    const result = await store.forcePushCurrentDocument();

    expect(cloudMocks.get).not.toHaveBeenCalled();
    const payload = cloudMocks.save.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ path: 'tau/ws/notes.md', baseVersion: null });
    expect(result.status).toBe('synced');
    expect(result.fileId).toBe(43);
  });

  it('保存仍返回版本冲突时应返回 conflict 并记录 lastError', async () => {
    seedActiveTab();
    cloudMocks.save.mockRejectedValue(Object.assign(new Error('云端版本已更新'), { code: 'CONFLICT' }));

    const store = useCloudSyncStore();
    store.signedIn = true;

    const result = await store.forcePushCurrentDocument();

    expect(result.status).toBe('conflict');
    expect(store.lastError).toContain('云端版本已更新');
  });

  it('Web 构建下应返回 skipped 且不发起任何云端请求', async () => {
    seedActiveTab();
    cloudMocks.isTauri.value = false;

    const store = useCloudSyncStore();
    const result = await store.forcePushCurrentDocument();

    expect(result.status).toBe('skipped');
    expect(cloudMocks.readSyncSource).not.toHaveBeenCalled();
    expect(cloudMocks.save).not.toHaveBeenCalled();
  });
});
