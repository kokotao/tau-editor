/**
 * TabService 保存路径单元测试
 * 覆盖大文件 revision 事务保存、外部冲突保护与普通文件写入回退
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriMocks = vi.hoisted(() => ({
  isTauriApp: vi.fn(() => true),
  getFileRevision: vi.fn(),
  getFileInfo: vi.fn(),
  writeFileChunked: vi.fn(),
}));

const runtimeMocks = vi.hoisted(() => ({
  resolveForFile: vi.fn(),
  readFileRevision: vi.fn(),
}));

const sessionMocks = vi.hoisted(() => ({
  commitLargeFileWithRevision: vi.fn(),
}));

vi.mock('@/lib/tauri', () => ({
  isTauriApp: tauriMocks.isTauriApp,
  workspaceCommands: {
    getFileRevision: tauriMocks.getFileRevision,
  },
  fileCommands: {
    getFileInfo: tauriMocks.getFileInfo,
    writeFileChunked: tauriMocks.writeFileChunked,
  },
}));

vi.mock('@/services/largeFileSession', () => ({
  commitLargeFileWithRevision: sessionMocks.commitLargeFileWithRevision,
}));

vi.mock('@/services/workspaceRuntimeService', () => ({
  createWorkspaceRuntimeService: () => ({ resolveForFile: runtimeMocks.resolveForFile }),
  readFileRevision: runtimeMocks.readFileRevision,
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));

import { TabService } from '@/services/tabService';
import { save } from '@tauri-apps/plugin-dialog';
import type { Tab } from '@/stores/tabs';

function makeTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: 'tab-1',
    filePath: '/work/notes/large.log',
    fileName: 'large.log',
    language: 'plaintext',
    isDirty: true,
    isUntitled: false,
    content: 'large content',
    createdAt: 1,
    isLargeFile: true,
    largeFileChunkSize: 1_048_576,
    lastKnownModified: 100,
    fileRevision: '100:13',
    externalModifiedAt: null,
    ...overrides,
  };
}

function createService(tab: Tab) {
  const tabsStore = {
    tabs: [tab],
    activeTab: tab,
    updateTab: vi.fn(),
  };
  const fileSystemStore = {
    writeFileContent: vi.fn().mockResolvedValue(undefined),
    refreshFileTree: vi.fn().mockResolvedValue(undefined),
  };
  const editorStore = { markAsSaved: vi.fn() };
  const workspaceStore = {
    currentWorkspacePath: '/work/notes',
    openSingleFile: vi.fn(),
  };
  const notificationStore = {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  };

  const service = new TabService(
    tabsStore as never,
    fileSystemStore as never,
    editorStore as never,
    workspaceStore as never,
    notificationStore as never,
  );

  return { service, tabsStore, fileSystemStore, editorStore, notificationStore };
}

describe('TabService.saveActiveTab 大文件 revision 事务', () => {
  beforeEach(() => {
    tauriMocks.isTauriApp.mockReturnValue(true);
    tauriMocks.getFileRevision.mockReset();
    tauriMocks.getFileInfo.mockReset();
    vi.mocked(save).mockReset();
    runtimeMocks.resolveForFile.mockReset();
    runtimeMocks.readFileRevision.mockReset();
    sessionMocks.commitLargeFileWithRevision.mockReset();

    runtimeMocks.resolveForFile.mockResolvedValue({
      workspaceId: 'ws-1',
      rootPath: '/work/notes',
      relativePath: 'large.log',
    });
    runtimeMocks.readFileRevision.mockResolvedValue(null);
    tauriMocks.getFileRevision.mockResolvedValue({
      exists: true,
      size: 13,
      modifiedMs: 100,
      revision: '100:13',
      contentHash: null,
    });
    sessionMocks.commitLargeFileWithRevision.mockResolvedValue({
      revision: '250:13',
      size: 13,
      modifiedMs: 250,
    });
    tauriMocks.getFileInfo.mockResolvedValue({ size: 13, modified: 250 });
  });

  it('通过工作区 revision 事务提交大文件并记录新版本', async () => {
    const tab = makeTab();
    const { service, tabsStore, fileSystemStore, editorStore, notificationStore } = createService(tab);

    await service.saveActiveTab();

    expect(runtimeMocks.resolveForFile).toHaveBeenCalledWith('/work/notes/large.log', '/work/notes');
    expect(tauriMocks.getFileRevision).not.toHaveBeenCalled();
    expect(sessionMocks.commitLargeFileWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        relativePath: 'large.log',
        content: 'large content',
        expectedRevision: '100:13',
      }),
    );
    expect(fileSystemStore.writeFileContent).not.toHaveBeenCalled();
    expect(tabsStore.updateTab).toHaveBeenCalledWith(
      'tab-1',
      expect.objectContaining({
        isDirty: false,
        lastKnownModified: 250,
        fileRevision: '250:13',
        externalModifiedAt: null,
      }),
    );
    expect(editorStore.markAsSaved).toHaveBeenCalled();
    expect(notificationStore.success).toHaveBeenCalledWith('保存成功', 'large.log');
  });

  it('提交返回 FILE_CONFLICT 时阻止保存并保留脏状态', async () => {
    const tab = makeTab();
    const { service, tabsStore, editorStore, notificationStore } = createService(tab);
    sessionMocks.commitLargeFileWithRevision.mockRejectedValue(
      Object.assign(new Error('文件已被外部修改'), { code: 'FILE_CONFLICT' }),
    );

    await service.saveActiveTab();

    expect(notificationStore.warning).toHaveBeenCalledWith(
      '保存被阻止',
      expect.stringContaining('文件已在磁盘上被修改'),
    );
    expect(tabsStore.updateTab).not.toHaveBeenCalled();
    expect(editorStore.markAsSaved).not.toHaveBeenCalled();
    expect(notificationStore.success).not.toHaveBeenCalled();
  });

  it('存在未解决的外部修改时拒绝保存', async () => {
    const tab = makeTab({ externalModifiedAt: 999 });
    const { service, tabsStore, notificationStore } = createService(tab);

    await service.saveActiveTab();

    expect(runtimeMocks.resolveForFile).not.toHaveBeenCalled();
    expect(sessionMocks.commitLargeFileWithRevision).not.toHaveBeenCalled();
    expect(tabsStore.updateTab).not.toHaveBeenCalled();
    expect(notificationStore.warning).toHaveBeenCalledWith(
      '检测到外部修改',
      expect.stringContaining('请先处理冲突'),
    );
  });

  it('大文件仍在分段加载时拒绝保存', async () => {
    const tab = makeTab({ isLoadingContent: true });
    const { service, notificationStore } = createService(tab);

    await service.saveActiveTab();

    expect(sessionMocks.commitLargeFileWithRevision).not.toHaveBeenCalled();
    expect(notificationStore.warning).toHaveBeenCalledWith(
      '文件仍在加载',
      expect.stringContaining('等待大文件分段加载完成'),
    );
  });

  it('普通文件仍走路径写入，不进入 revision 事务', async () => {
    const tab = makeTab({ isLargeFile: false, filePath: '/work/notes/small.md', fileName: 'small.md' });
    const { service, fileSystemStore, tabsStore } = createService(tab);

    await service.saveActiveTab();

    expect(fileSystemStore.writeFileContent).toHaveBeenCalledWith('/work/notes/small.md', 'large content');
    expect(sessionMocks.commitLargeFileWithRevision).not.toHaveBeenCalled();
    expect(tabsStore.updateTab).toHaveBeenCalledWith(
      'tab-1',
      expect.objectContaining({ isDirty: false, fileRevision: null }),
    );
  });

  it('Web 环境回退到分片写入', async () => {
    tauriMocks.isTauriApp.mockReturnValue(false);
    tauriMocks.writeFileChunked.mockResolvedValue(undefined);
    const tab = makeTab();
    const { service } = createService(tab);

    await service.saveActiveTab();

    expect(sessionMocks.commitLargeFileWithRevision).not.toHaveBeenCalled();
    expect(tauriMocks.writeFileChunked).toHaveBeenCalled();
  });

  it('缺少 revision 基线时拒绝保存，不重新采样磁盘版本', async () => {
    const tab = makeTab({ fileRevision: null });
    const { service, tabsStore, notificationStore } = createService(tab);

    await service.saveActiveTab();

    expect(tauriMocks.getFileRevision).not.toHaveBeenCalled();
    expect(sessionMocks.commitLargeFileWithRevision).not.toHaveBeenCalled();
    expect(tabsStore.updateTab).not.toHaveBeenCalled();
    expect(notificationStore.warning).toHaveBeenCalledWith(
      '保存被阻止',
      expect.stringContaining('缺少磁盘版本基线'),
    );
  });

  it('另存为到已存在文件时按目标 revision 走事务写入', async () => {
    vi.mocked(save).mockResolvedValue('/work/notes/copy.log');
    runtimeMocks.resolveForFile.mockImplementation(async (filePath: string) => ({
      workspaceId: 'ws-1',
      rootPath: '/work/notes',
      relativePath: filePath.split('/').pop() ?? '',
    }));
    tauriMocks.getFileRevision.mockResolvedValue({
      exists: true,
      size: 13,
      modifiedMs: 300,
      revision: '300:13',
      contentHash: null,
    });
    sessionMocks.commitLargeFileWithRevision.mockResolvedValue({
      revision: '400:13',
      size: 13,
      modifiedMs: 400,
    });
    const tab = makeTab({ fileRevision: '100:13' });
    const { service, tabsStore, fileSystemStore } = createService(tab);

    await service.saveActiveTabAs();

    expect(sessionMocks.commitLargeFileWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        relativePath: 'copy.log',
        expectedRevision: '300:13',
      }),
    );
    expect(tauriMocks.writeFileChunked).not.toHaveBeenCalled();
    expect(fileSystemStore.writeFileContent).not.toHaveBeenCalled();
    expect(tabsStore.updateTab).toHaveBeenCalledWith(
      'tab-1',
      expect.objectContaining({
        filePath: '/work/notes/copy.log',
        fileRevision: '400:13',
      }),
    );
  });

  it('另存为新路径时直接分段创建文件并回读基线', async () => {
    vi.mocked(save).mockResolvedValue('/work/notes/new.log');
    tauriMocks.getFileRevision.mockResolvedValue({
      exists: false,
      size: 0,
      modifiedMs: 0,
      revision: null,
      contentHash: null,
    });
    tauriMocks.writeFileChunked.mockResolvedValue(undefined);
    const tab = makeTab();
    const { service } = createService(tab);

    await service.saveActiveTabAs();

    expect(sessionMocks.commitLargeFileWithRevision).not.toHaveBeenCalled();
    expect(tauriMocks.writeFileChunked).toHaveBeenCalled();
    expect(runtimeMocks.readFileRevision).toHaveBeenCalledWith(
      expect.anything(),
      '/work/notes/new.log',
      '/work/notes',
    );
  });

  it('保存期间继续输入时保持脏标记并写入新基线', async () => {
    const tab = makeTab();
    const { service, tabsStore, editorStore, notificationStore } = createService(tab);
    sessionMocks.commitLargeFileWithRevision.mockImplementation(async () => {
      // 模拟事务提交期间用户继续输入。
      tab.content = 'large content plus typing';
      return { revision: '250:13', size: 13, modifiedMs: 250 };
    });

    await service.saveActiveTab();

    expect(tabsStore.updateTab).toHaveBeenCalledWith(
      'tab-1',
      expect.objectContaining({ isDirty: true, fileRevision: '250:13' }),
    );
    expect(editorStore.markAsSaved).not.toHaveBeenCalled();
    expect(notificationStore.success).toHaveBeenCalledWith('保存成功', 'large.log');
  });
});

describe('TabService.updateTabContent 内容回写路由', () => {
  const createRoutingService = () => {
    const first = makeTab({ id: 'tab-a', content: '', isLargeFile: false, fileName: 'a.txt' });
    const second = makeTab({ id: 'tab-b', content: '', isLargeFile: false, fileName: 'b.txt' });
    const tabs = [first, second];
    const tabsStore = {
      tabs,
      activeTabId: 'tab-a',
      activeTab: first,
      updateTab: vi.fn((tabId: string, patch: Partial<Tab>) => {
        const target = tabs.find((tab) => tab.id === tabId);
        if (target) Object.assign(target, patch);
      }),
    };
    const editorStore = { content: '', setContent: vi.fn(), setDirty: vi.fn() };
    const service = new TabService(
      tabsStore as never,
      {} as never,
      editorStore as never,
      {} as never,
      {} as never,
    );
    return { service, first, second, editorStore };
  };

  it('非活动标签的延迟提交只回写自身内容，不污染编辑器 store', () => {
    const { service, first, second, editorStore } = createRoutingService();

    service.updateTabContent('tab-b', 'late content');

    expect(second.content).toBe('late content');
    expect(second.isDirty).toBe(true);
    expect(first.content).toBe('');
    expect(editorStore.setContent).not.toHaveBeenCalled();
  });

  it('活动标签回写同时同步编辑器 store，未知标签直接忽略', () => {
    const { service, editorStore } = createRoutingService();

    service.updateTabContent('tab-a', 'active content');
    service.updateTabContent('tab-missing', 'ignored');

    expect(editorStore.setContent).toHaveBeenCalledWith('active content', true);
  });
});
