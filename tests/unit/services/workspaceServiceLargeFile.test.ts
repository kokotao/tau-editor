/**
 * WorkspaceService 大文件加载生命周期测试
 * 覆盖取消加载、失败后重试续传与状态守卫
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriMocks = vi.hoisted(() => ({
  readFileChunked: vi.fn(),
  getFileInfo: vi.fn(),
  getLargeFileConfig: vi.fn(),
  resolveWorkspace: vi.fn(),
  getFileRevision: vi.fn(),
  isTauriApp: vi.fn(() => true),
}));

vi.mock('@/lib/tauri', () => ({
  fileCommands: {
    readFileChunked: tauriMocks.readFileChunked,
    getFileInfo: tauriMocks.getFileInfo,
    getLargeFileConfig: tauriMocks.getLargeFileConfig,
  },
  workspaceCommands: {
    resolveWorkspace: tauriMocks.resolveWorkspace,
    getFileRevision: tauriMocks.getFileRevision,
  },
  isTauriApp: tauriMocks.isTauriApp,
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

import { WorkspaceService } from '@/services/workspaceService';
import type { Tab } from '@/stores/tabs';

function makeTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: 'tab-1',
    filePath: '/work/large.txt',
    fileName: 'large.txt',
    language: 'plaintext',
    isDirty: false,
    isUntitled: false,
    content: 'abc',
    createdAt: 1,
    isLargeFile: true,
    isLoadingContent: true,
    largeFileSize: 6,
    largeFileChunkSize: 3,
    largeFileLoadedBytes: 3,
    largeFileLoadProgress: 50,
    largeFileLoadState: 'loading',
    ...overrides,
  };
}

function createService(tab: Tab) {
  const tabs = [tab];
  const tabsStore = {
    tabs,
    activeTab: tab,
    addTab: vi.fn(),
    updateTab: vi.fn((id: string, patch: Partial<Tab>) => {
      const target = tabs.find((item) => item.id === id);
      if (target) {
        Object.assign(target, patch);
      }
    }),
    getTabIdByPath: vi.fn(() => null),
    closeTab: vi.fn(),
    activateTab: vi.fn(),
  };
  const fileSystemStore = {
    loading: false,
    selectEntry: vi.fn(),
    readFileContent: vi.fn(),
    refreshFileTree: vi.fn(),
  };
  const workspaceStore = {
    currentWorkspacePath: '/work',
    openSingleFile: vi.fn(),
    setMode: vi.fn(),
  };
  const editorStore = {
    setLanguage: vi.fn(),
    setContent: vi.fn(),
  };
  const settingsStore = {
    uiLanguage: 'zh-CN',
    maxOpenTabs: 20,
    memoryLimitMB: 512,
  };
  const notificationStore = {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  };

  const service = new WorkspaceService(
    fileSystemStore as never,
    tabsStore as never,
    workspaceStore as never,
    editorStore as never,
    settingsStore as never,
    notificationStore as never,
  );

  return { service, tab, tabsStore, fileSystemStore, notificationStore };
}

describe('WorkspaceService 大文件加载生命周期', () => {
  beforeEach(() => {
    tauriMocks.readFileChunked.mockReset();
    tauriMocks.getFileInfo.mockReset();
    tauriMocks.getLargeFileConfig.mockReset();
    tauriMocks.resolveWorkspace.mockReset();
    tauriMocks.getFileRevision.mockReset();
    tauriMocks.isTauriApp.mockReturnValue(true);
  });

  it('取消加载后保留部分内容并保持只读', () => {
    const tab = makeTab();
    const { service, notificationStore } = createService(tab);

    service.cancelLargeFileLoad('tab-1');

    expect(tab.largeFileLoadState).toBe('cancelled');
    expect(tab.isLoadingContent).toBe(true);
    expect(tab.largeFileLoadedBytes).toBe(3);
    expect(tab.largeFileLoadSessionId).toBeUndefined();
    expect(notificationStore.info).toHaveBeenCalledWith(
      '已取消大文件加载',
      expect.stringContaining('保持只读'),
    );
  });

  it('已完成加载的标签不会被取消', () => {
    const tab = makeTab({ largeFileLoadState: 'complete', isLoadingContent: false });
    const { service, notificationStore } = createService(tab);

    service.cancelLargeFileLoad('tab-1');

    expect(tab.largeFileLoadState).toBe('complete');
    expect(notificationStore.info).not.toHaveBeenCalled();
  });

  it('重试时从上次中断的字节位置续传直到完成', async () => {
    const tab = makeTab({ largeFileLoadState: 'failed' });
    const { service } = createService(tab);
    tauriMocks.readFileChunked.mockResolvedValueOnce({
      content: 'def',
      offset: 3,
      size: 3,
      totalSize: 6,
      isLast: true,
    });

    await service.retryLargeFileLoad('tab-1');

    expect(tauriMocks.readFileChunked).toHaveBeenCalledWith('/work/large.txt', 3, 3);
    expect(tab.content).toBe('abcdef');
    expect(tab.largeFileLoadState).toBe('complete');
    expect(tab.isLoadingContent).toBe(false);
    expect(tab.largeFileLoadProgress).toBe(100);
  });

  it('取消后重试同样可以继续加载', async () => {
    const tab = makeTab({ largeFileLoadState: 'cancelled' });
    const { service } = createService(tab);
    tauriMocks.readFileChunked.mockResolvedValueOnce({
      content: 'def',
      offset: 3,
      size: 3,
      totalSize: 6,
      isLast: true,
    });

    await service.retryLargeFileLoad('tab-1');

    expect(tab.largeFileLoadState).toBe('complete');
  });

  it('正在加载或已完成的标签不触发重试请求', async () => {
    const loadingTab = makeTab({ largeFileLoadState: 'loading' });
    const loadingHarness = createService(loadingTab);
    await loadingHarness.service.retryLargeFileLoad('tab-1');

    const completeTab = makeTab({ largeFileLoadState: 'complete', isLoadingContent: false });
    const completeHarness = createService(completeTab);
    await completeHarness.service.retryLargeFileLoad('tab-1');

    expect(tauriMocks.readFileChunked).not.toHaveBeenCalled();
  });

  it('打开大文件时先捕获磁盘 revision 作为保存基线', async () => {
    const largeSize = 13 * 1024 * 1024;
    tauriMocks.getFileInfo.mockResolvedValue({ size: largeSize, modified: 100 });
    tauriMocks.getLargeFileConfig.mockRejectedValue(new Error('配置不可用'));
    tauriMocks.readFileChunked.mockResolvedValue({
      content: 'head',
      offset: 0,
      size: largeSize,
      totalSize: largeSize,
      isLast: true,
    });
    tauriMocks.resolveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', rootPath: '/work' });
    tauriMocks.getFileRevision.mockResolvedValue({
      exists: true,
      size: largeSize,
      modifiedMs: 100,
      revision: '100:13',
      contentHash: null,
    });
    const { service, tabsStore } = createService(makeTab({
      isLargeFile: false,
      isLoadingContent: false,
      largeFileLoadState: 'complete',
    }));

    await service.openFile('/work/big.log');

    expect(tauriMocks.getFileRevision).toHaveBeenCalledWith('ws-1', 'big.log');
    expect(tabsStore.addTab).toHaveBeenCalledWith(expect.objectContaining({
      filePath: '/work/big.log',
      isLargeFile: true,
      isLoadingContent: false,
      fileRevision: '100:13',
    }));
  });

  it('revision 探测失败时仍打开文件，基线留空交由保存侧拦截', async () => {
    const largeSize = 13 * 1024 * 1024;
    tauriMocks.getFileInfo.mockResolvedValue({ size: largeSize, modified: 100 });
    tauriMocks.getLargeFileConfig.mockRejectedValue(new Error('配置不可用'));
    tauriMocks.readFileChunked.mockResolvedValue({
      content: 'head',
      offset: 0,
      size: largeSize,
      totalSize: largeSize,
      isLast: true,
    });
    tauriMocks.resolveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', rootPath: '/work' });
    tauriMocks.getFileRevision.mockRejectedValue(new Error('revision 不可用'));
    const { service, tabsStore } = createService(makeTab({
      isLargeFile: false,
      isLoadingContent: false,
      largeFileLoadState: 'complete',
    }));

    await service.openFile('/work/big.log');

    expect(tabsStore.addTab).toHaveBeenCalledWith(expect.objectContaining({ fileRevision: null }));
  });

  it('大文件重载走分段重新打开，不整块读入内存', async () => {
    const largeSize = 13 * 1024 * 1024;
    tauriMocks.getFileInfo.mockResolvedValue({ size: largeSize, modified: 100 });
    tauriMocks.getLargeFileConfig.mockRejectedValue(new Error('配置不可用'));
    tauriMocks.readFileChunked.mockResolvedValue({
      content: 'head',
      offset: 0,
      size: largeSize,
      totalSize: largeSize,
      isLast: true,
    });
    tauriMocks.resolveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', rootPath: '/work' });
    tauriMocks.getFileRevision.mockResolvedValue({
      exists: true,
      size: largeSize,
      modifiedMs: 100,
      revision: '100:13',
      contentHash: null,
    });
    const { service, tabsStore, fileSystemStore } = createService(makeTab());

    const replaced = await service.reloadFileFromDisk('tab-1', '/work/large.txt', 100);

    expect(replaced).toBe(false);
    expect(tabsStore.closeTab).toHaveBeenCalledWith('tab-1');
    expect(fileSystemStore.readFileContent).not.toHaveBeenCalled();
    expect(tabsStore.addTab).toHaveBeenCalledWith(expect.objectContaining({
      filePath: '/work/large.txt',
      fileRevision: '100:13',
    }));
  });

  it('普通文件重载整块读取并刷新 revision 基线', async () => {
    tauriMocks.resolveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', rootPath: '/work' });
    tauriMocks.getFileRevision.mockResolvedValue({
      exists: true,
      size: 5,
      modifiedMs: 200,
      revision: '200:5',
      contentHash: null,
    });
    const tab = makeTab({ isLargeFile: false, isLoadingContent: false, largeFileLoadState: 'complete' });
    const { service, tabsStore, fileSystemStore } = createService(tab);
    fileSystemStore.readFileContent.mockResolvedValue('disk');

    const replaced = await service.reloadFileFromDisk('tab-1', '/work/large.txt', 200);

    expect(replaced).toBe(true);
    expect(tabsStore.closeTab).not.toHaveBeenCalled();
    expect(fileSystemStore.readFileContent).toHaveBeenCalledWith('/work/large.txt');
    expect(tab.content).toBe('disk');
    expect(tab.fileRevision).toBe('200:5');
    expect(tab.externalModifiedAt).toBeNull();
  });
});
