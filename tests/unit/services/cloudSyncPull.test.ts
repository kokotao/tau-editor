/**
 * @description 云文档「拉取覆盖本地」的未保存修改确认：脏标签未确认不得落盘，确认后落盘并刷新基线。
 * 只 mock Rust 云命令与文件修订号读取，cloudSyncService / tabService 用真实实现。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 12:40
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const cloudMocks = vi.hoisted(() => ({
  isTauri: { value: true },
  get: vi.fn(),
  list: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauriApp: () => cloudMocks.isTauri.value,
    cloudCommands: {
      ...actual.cloudCommands,
      get: cloudMocks.get,
      list: cloudMocks.list,
    },
  };
});

/** 文件修订号读取会走 Tauri 文件系统，这里只替换这一处边界。 */
const captureFileRevision = vi.hoisted(() => vi.fn(async (_path: string) => 'rev-cloud'));

vi.mock('@/services/workspaceService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/workspaceService')>();
  return {
    ...actual,
    createWorkspaceService: () => ({ captureFileRevision }),
  };
});

import { pullCloudDocumentIntoLocal } from '@/services/cloudSyncService';
import { useFileSystemStore } from '@/stores/fileSystem';
import { useTabsStore, type Tab } from '@/stores/tabs';
import { useWorkspaceStore } from '@/stores/workspace';

const REMOTE_CONTENT = 'cloud content';

const REMOTE_DOC = {
  fileId: 42,
  path: 'tau/ws/notes.md',
  title: 'notes.md',
  contentHash: 'sha256:cloud',
  size: 20,
  version: 9,
  category: null,
  categoryId: null,
  tags: null,
  visibility: 'PRIVATE',
  publishedArticleId: null,
  updatedAt: '2026-10-25T09:00:00Z',
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

/** 拦掉落盘调用并记录，避免真的触发 Tauri 文件命令。 */
function spyWriteFileContent() {
  const fileSystemStore = useFileSystemStore();
  return vi.spyOn(fileSystemStore, 'writeFileContent').mockResolvedValue(undefined);
}

describe('pullCloudDocumentIntoLocal 未保存修改保护', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    cloudMocks.isTauri.value = true;
    cloudMocks.get.mockResolvedValue({ ...REMOTE_DOC, content: REMOTE_CONTENT, createdAt: null });
    cloudMocks.list.mockResolvedValue({ records: [REMOTE_DOC], total: 1, page: 1, size: 100 });
    captureFileRevision.mockResolvedValue('rev-cloud');
  });

  it('① 有未保存修改且未确认时不落盘，返回 needsDirtyConfirm 并保留本地内容', async () => {
    const { tabsStore, tabId } = seedActiveTab({ isDirty: true, content: 'unsaved local' });
    const write = spyWriteFileContent();

    const result = await pullCloudDocumentIntoLocal(tabId);

    expect(result.status).toBe('skipped');
    expect(result.needsDirtyConfirm).toBe(true);
    expect(result.message).toContain('未保存');
    // 既不落盘，也不发任何云端请求
    expect(write).not.toHaveBeenCalled();
    expect(cloudMocks.get).not.toHaveBeenCalled();
    expect(cloudMocks.list).not.toHaveBeenCalled();

    const tab = tabsStore.tabs.find((item) => item.id === tabId);
    expect(tab?.content).toBe('unsaved local');
    expect(tab?.isDirty).toBe(true);
    expect(tab?.cloudVersion).toBe(5);
  });

  it('② 确认（overwriteDirty）后才落盘并刷新云端基线', async () => {
    const { tabsStore, tabId } = seedActiveTab({ isDirty: true, content: 'unsaved local' });
    const write = spyWriteFileContent();

    const result = await pullCloudDocumentIntoLocal(tabId, { overwriteDirty: true });

    expect(result.status).toBe('synced');
    expect(write).toHaveBeenCalledWith('/ws/notes.md', REMOTE_CONTENT);
    expect(captureFileRevision).toHaveBeenCalledWith('/ws/notes.md');

    const tab = tabsStore.tabs.find((item) => item.id === tabId);
    expect(tab?.content).toBe(REMOTE_CONTENT);
    expect(tab?.isDirty).toBe(false);
    expect(tab?.fileRevision).toBe('rev-cloud');
    // 覆盖后基线必须跟云端一致，否则下一次同步会再次误判冲突
    expect(tab?.cloudFileId).toBe(42);
    expect(tab?.cloudVersion).toBe(9);
    expect(tab?.cloudContentHash).toBe('sha256:cloud');
    expect(tab?.lastSyncedAt).toEqual(expect.any(Number));
  });

  it('③ 未修改的标签直接拉取，不需要确认', async () => {
    const { tabsStore, tabId } = seedActiveTab({ isDirty: false });
    const write = spyWriteFileContent();

    const result = await pullCloudDocumentIntoLocal(tabId);

    expect(result.status).toBe('synced');
    expect(write).toHaveBeenCalledWith('/ws/notes.md', REMOTE_CONTENT);
    expect(tabsStore.tabs.find((item) => item.id === tabId)?.content).toBe(REMOTE_CONTENT);
  });

  it('④ 云端没有该文档时不覆盖本地', async () => {
    const { tabsStore, tabId } = seedActiveTab({ isDirty: true, content: 'unsaved local' });
    cloudMocks.list.mockResolvedValue({ records: [], total: 0, page: 1, size: 100 });
    const write = spyWriteFileContent();

    const result = await pullCloudDocumentIntoLocal(tabId, { overwriteDirty: true });

    expect(result.status).toBe('skipped');
    expect(write).not.toHaveBeenCalled();
    expect(tabsStore.tabs.find((item) => item.id === tabId)?.content).toBe('unsaved local');
  });
});
