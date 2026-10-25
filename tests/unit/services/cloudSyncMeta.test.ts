import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

/**
 * P3：云文档属性（分类/标签/可见性）随同步上传 + docMap 持久化。
 * 只 mock Rust 云命令边界，cloudDocService / cloudSyncService 用真实实现。
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
import { CLOUD_SYNC_STORAGE_KEY, useCloudSyncStore } from '@/stores/cloudSync';
import { useTabsStore, type Tab } from '@/stores/tabs';
import { useWorkspaceStore } from '@/stores/workspace';

const REMOTE_DOC = {
  fileId: 42,
  path: 'tau/ws/notes.md',
  title: 'notes.md',
  contentHash: 'sha256:remote',
  size: 10,
  version: 7,
  category: '笔记',
  categoryId: 1001,
  tags: '旧标签',
  visibility: 'PUBLIC',
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

/**
 * 仓库全局 setup 把 localStorage mock 成 vi.fn()（不落数据），
 * 属性持久化断言需要真实内存实现，这里与 cloudSyncQueue 测试一样单独 stub 一份。
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

/** 读取最近一次写入 `tau-cloud-sync` 的原始 JSON。 */
function readPersistedPayload(): string | null {
  return localStorage.getItem(CLOUD_SYNC_STORAGE_KEY);
}

describe('cloudSyncStore 文档属性（P3）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    installMemoryStorage();
    localStorage.clear();
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forcePush 带 meta 时应把分类/标签/可见性并入保存 payload', async () => {
    seedActiveTab();
    const store = useCloudSyncStore();
    store.signedIn = true;

    const result = await store.forcePushCurrentDocument(undefined, {
      category: '笔记',
      categoryId: 1001,
      tags: '标签A,标签B',
      visibility: 'PUBLIC',
    });

    expect(cloudMocks.readSyncSource).toHaveBeenCalledWith('/ws/notes.md', CLOUD_SYNC_MAX_BYTES);
    expect(result.status).toBe('synced');
    const payload = cloudMocks.save.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      path: 'tau/ws/notes.md',
      content: 'local content',
      baseVersion: 7,
      category: '笔记',
      categoryId: 1001,
      tags: '标签A,标签B',
      visibility: 'PUBLIC',
    });
  });

  it('保存成功后属性应写入 docMap 并持久化，且不落盘任何凭据', async () => {
    seedActiveTab();
    const store = useCloudSyncStore();
    store.signedIn = true;

    await store.forcePushCurrentDocument(undefined, {
      category: '笔记',
      categoryId: 1001,
      tags: '标签A',
      visibility: 'PRIVATE',
    });

    const entry = store.docMap['tau/ws/notes.md'];
    expect(entry).toMatchObject({
      fileId: 42,
      version: 8,
      category: '笔记',
      categoryId: 1001,
      tags: '标签A',
      visibility: 'PRIVATE',
    });

    const raw = readPersistedPayload();
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? '{}') as {
      docMap?: Record<string, Record<string, unknown>>;
    };
    expect(parsed.docMap?.['tau/ws/notes.md']).toMatchObject({
      category: '笔记',
      categoryId: 1001,
      tags: '标签A',
      visibility: 'PRIVATE',
    });
    // 白名单只允许 baseUrl/docMap/自动同步偏好，绝不能出现凭据
    expect(raw ?? '').not.toMatch(/token/i);
    expect(raw ?? '').not.toMatch(/password/i);
    expect(raw ?? '').not.toMatch(/authorization/i);
  });

  it('forcePush 不带 meta 时不应改写已有属性，payload 也不含属性键', async () => {
    seedActiveTab();
    const store = useCloudSyncStore();
    store.signedIn = true;
    store.rememberDoc('tau/ws/notes.md', {
      fileId: 42,
      version: 5,
      contentHash: 'sha256:base',
      updatedAt: null,
      category: '旧分类',
      categoryId: 9,
      tags: '旧标签',
      visibility: 'PRIVATE',
    });

    const result = await store.forcePushCurrentDocument();

    expect(result.status).toBe('synced');
    const payload = cloudMocks.save.mock.calls[0]?.[0];
    expect(payload).not.toHaveProperty('category');
    expect(payload).not.toHaveProperty('categoryId');
    expect(payload).not.toHaveProperty('tags');
    expect(payload).not.toHaveProperty('visibility');

    expect(store.docMap['tau/ws/notes.md']).toMatchObject({
      category: '旧分类',
      categoryId: 9,
      tags: '旧标签',
      visibility: 'PRIVATE',
    });
  });

  it('loadDocMeta 应按 fileId 读取云端属性并回填 docMap', async () => {
    seedActiveTab();
    const store = useCloudSyncStore();

    const outcome = await store.loadDocMeta(42);

    expect(cloudMocks.get).toHaveBeenCalledWith(42);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.data).toEqual({
      category: '笔记',
      categoryId: 1001,
      tags: '旧标签',
      visibility: 'PUBLIC',
    });
    expect(store.docMap['tau/ws/notes.md']).toMatchObject({
      fileId: 42,
      version: 7,
      category: '笔记',
      categoryId: 1001,
      tags: '旧标签',
      visibility: 'PUBLIC',
    });
  });

  it('loadDocMeta 未传 fileId 时应回退到当前标签的云端映射', async () => {
    seedActiveTab();
    const store = useCloudSyncStore();

    const outcome = await store.loadDocMeta();

    expect(cloudMocks.get).toHaveBeenCalledWith(42);
    expect(outcome.ok).toBe(true);
  });

  it('loadDocMeta 在没有云端映射时应返回失败而不是抛错', async () => {
    const store = useCloudSyncStore();

    const outcome = await store.loadDocMeta();

    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.kind).toBe('unknown');
    expect(cloudMocks.get).not.toHaveBeenCalled();
  });
});
