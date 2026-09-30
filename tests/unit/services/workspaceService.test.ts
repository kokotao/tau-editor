import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/tauri', () => ({
  fileCommands: {},
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

import { WorkspaceService } from '@/services/workspaceService';

describe('WorkspaceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('工作区内新建未保存文件不应切换到单文件模式', () => {
    const tabsStore = {
      tabs: [],
      addTab: vi.fn(),
    };
    const workspaceStore = {
      currentWorkspacePath: '/project',
      setMode: vi.fn(),
    };
    const editorStore = {
      setLanguage: vi.fn(),
    };
    const settingsStore = {
      maxOpenTabs: 20,
      memoryLimitMB: 512,
      uiLanguage: 'zh-CN',
    };
    const notificationStore = {
      warning: vi.fn(),
    };

    const service = new WorkspaceService(
      {} as never,
      tabsStore as never,
      workspaceStore as never,
      editorStore as never,
      settingsStore as never,
      notificationStore as never,
    );

    service.createUntitledFile();

    expect(workspaceStore.setMode).toHaveBeenCalledWith('workspace');
    expect(workspaceStore.setMode).not.toHaveBeenCalledWith('single-file');
  });
});
