import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/tauri', () => ({
  fileCommands: {
    getFileInfo: vi.fn(),
    getLargeFileConfig: vi.fn(),
  },
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

import { WorkspaceService } from '@/services/workspaceService';
import { createEmptyMindMapDocument, serializeMindMapDocument } from '@/services/mindmapService';

function buildStores() {
  const tabs = [
    {
      id: 'tab1',
      filePath: null,
      fileName: 'x.txt',
      language: 'plaintext',
      contentType: 'text',
      isDirty: false,
      isUntitled: true,
      content: '',
    },
  ];
  const tabsStore = {
    tabs,
    addTab: vi.fn(),
    getTabIdByPath: vi.fn(() => null),
  };
  const workspaceStore = { currentWorkspacePath: null, setMode: vi.fn(), openSingleFile: vi.fn() };
  const editorStore = { setLanguage: vi.fn() };
  const settingsStore = { maxOpenTabs: 20, memoryLimitMB: 512, uiLanguage: 'zh-CN' };
  const notificationStore = { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() };
  const fileSystemStore = { selectEntry: vi.fn(), readFileContent: vi.fn() };

  const service = new WorkspaceService(
    fileSystemStore as never,
    tabsStore as never,
    workspaceStore as never,
    editorStore as never,
    settingsStore as never,
    notificationStore as never,
  );
  return { service, tabsStore, workspaceStore, editorStore, fileSystemStore, notificationStore };
}

describe('WorkspaceService · 思维导图阶段 0', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createUntitledMindMap 创建 documentKind=mindmap 的标签', () => {
    const { service, tabsStore, workspaceStore } = buildStores();
    const ok = service.createUntitledMindMap('MyMap.taumap');

    expect(ok).toBe(true);
    expect(tabsStore.addTab).toHaveBeenCalledTimes(1);
    const tab = tabsStore.addTab.mock.calls[0][0];
    expect(tab.documentKind).toBe('mindmap');
    expect(tab.fileName).toBe('MyMap.taumap');
    expect(tab.isUntitled).toBe(true);
    expect(tab.language).toBe('json');
    // 内容是可被 mindmapService 解析的合法 .taumap
    expect(tab.content).toContain('"format": "tau-mindmap"');
    expect(workspaceStore.setMode).toHaveBeenCalledWith('single-file');
  });

  it('createUntitledMindMap 在已有工作区时不切单文件模式', () => {
    const { service, workspaceStore } = buildStores();
    workspaceStore.currentWorkspacePath = '/project';
    service.createUntitledMindMap();
    expect(workspaceStore.setMode).toHaveBeenCalledWith('workspace');
    expect(workspaceStore.setMode).not.toHaveBeenCalledWith('single-file');
  });

  it('openFile 打开 .taumap 时标记 documentKind=mindmap（普通路径）', async () => {
    const { service, tabsStore, fileSystemStore } = buildStores();
    const document = createEmptyMindMapDocument('打开测试');
    const content = serializeMindMapDocument(document);

    fileSystemStore.readFileContent.mockResolvedValue(content);
    (await import('@/lib/tauri')).fileCommands.getFileInfo.mockResolvedValue({
      size: content.length,
      modified: 1234567890,
    });
    (await import('@/lib/tauri')).fileCommands.getLargeFileConfig.mockRejectedValue(
      new Error('no config'),
    );

    await service.openFile('/data/hi.taumap');

    expect(tabsStore.addTab).toHaveBeenCalledTimes(1);
    const tab = tabsStore.addTab.mock.calls[0][0];
    expect(tab.documentKind).toBe('mindmap');
    expect(tab.filePath).toBe('/data/hi.taumap');
    expect(tab.isUntitled).toBe(false);
  });

  it('openFile 打开 .xmind 时标记 documentKind=mindmap-external', async () => {
    const { service, tabsStore, fileSystemStore } = buildStores();
    fileSystemStore.readFileContent.mockResolvedValue('PK\x03\x04 fake');
    (await import('@/lib/tauri')).fileCommands.getFileInfo.mockResolvedValue({
      size: 100,
      modified: 1234567890,
    });
    (await import('@/lib/tauri')).fileCommands.getLargeFileConfig.mockRejectedValue(
      new Error('no config'),
    );

    await service.openFile('/data/plan.xmind');

    expect(tabsStore.addTab).toHaveBeenCalledTimes(1);
    const tab = tabsStore.addTab.mock.calls[0][0];
    expect(tab.documentKind).toBe('mindmap-external');
  });

  it('openFile 打开普通 .txt 不设置 documentKind', async () => {
    const { service, tabsStore, fileSystemStore } = buildStores();
    fileSystemStore.readFileContent.mockResolvedValue('hello');
    (await import('@/lib/tauri')).fileCommands.getFileInfo.mockResolvedValue({
      size: 5,
      modified: 1234567890,
    });
    (await import('@/lib/tauri')).fileCommands.getLargeFileConfig.mockRejectedValue(
      new Error('no config'),
    );

    await service.openFile('/data/a.txt');

    const tab = tabsStore.addTab.mock.calls[0][0];
    expect(tab.documentKind).toBeUndefined();
    expect(tab.language).toBe('plaintext');
  });
});