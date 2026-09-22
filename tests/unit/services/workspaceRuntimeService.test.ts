/**
 * workspaceRuntimeService 单元测试
 * 覆盖工作区根目录推断、相对路径计算与 workspaceId 缓存
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceMocks = vi.hoisted(() => ({
  resolveWorkspace: vi.fn(),
  getFileRevision: vi.fn(),
  isTauriApp: vi.fn(() => true),
}));

vi.mock('@/lib/tauri', () => ({
  workspaceCommands: {
    resolveWorkspace: workspaceMocks.resolveWorkspace,
    getFileRevision: workspaceMocks.getFileRevision,
  },
  isTauriApp: workspaceMocks.isTauriApp,
}));

import {
  createWorkspaceRuntimeService,
  readFileRevision,
  getFileName,
  getParentDirectory,
  isPathInsideRoot,
  toRelativeWorkspacePath,
} from '@/services/workspaceRuntimeService';

describe('workspaceRuntimeService 路径工具', () => {
  it('解析父目录时同时兼容 Windows 与 POSIX 分隔符', () => {
    expect(getParentDirectory('/work/notes/a.md')).toBe('/work/notes');
    expect(getParentDirectory('C:\\work\\notes\\a.md')).toBe('C:/work/notes');
    expect(getParentDirectory('C:\\work\\notes\\')).toBe('C:/work');
    expect(getParentDirectory('/notes.md')).toBe('/');
    expect(getParentDirectory('notes.md')).toBe('');
  });

  it('判断文件是否位于根目录内部时遵循路径边界', () => {
    expect(isPathInsideRoot('/work/notes/a.md', '/work/notes')).toBe(true);
    expect(isPathInsideRoot('C:\\Work\\Notes\\A.md', 'c:/work/notes')).toBe(true);
    expect(isPathInsideRoot('/work/notes-other/a.md', '/work/notes')).toBe(false);
    expect(isPathInsideRoot('/work/notes', '/work/notes')).toBe(false);
  });

  it('计算工作区相对路径', () => {
    expect(toRelativeWorkspacePath('/work/notes/a.md', '/work/notes')).toBe('a.md');
    expect(toRelativeWorkspacePath('/work/notes/sub/a.md', '/work/notes')).toBe('sub/a.md');
    expect(toRelativeWorkspacePath('C:\\Work\\A.md', 'c:/work')).toBe('a.md');
    expect(toRelativeWorkspacePath('/other/a.md', '/work')).toBe('a.md');
  });

  it('提取文件名', () => {
    expect(getFileName('/work/notes/a.md')).toBe('a.md');
    expect(getFileName('C:\\work\\a.md')).toBe('a.md');
  });
});

describe('workspaceRuntimeService 运行期解析', () => {
  beforeEach(() => {
    workspaceMocks.resolveWorkspace.mockReset();
    workspaceMocks.resolveWorkspace.mockResolvedValue({
      workspaceId: 'runtime-1',
      rootPath: '/work/notes',
    });
    workspaceMocks.getFileRevision.mockReset();
    workspaceMocks.isTauriApp.mockReturnValue(true);
  });

  it('文件位于当前工作区时复用工作区根目录', async () => {
    const service = createWorkspaceRuntimeService();

    await expect(service.resolveForFile('/work/notes/sub/a.md', '/work/notes')).resolves.toEqual({
      workspaceId: 'runtime-1',
      rootPath: '/work/notes',
      relativePath: 'sub/a.md',
    });
    expect(workspaceMocks.resolveWorkspace).toHaveBeenCalledWith('/work/notes');
  });

  it('文件不在当前工作区时退回其所在目录', async () => {
    const service = createWorkspaceRuntimeService();

    await expect(service.resolveForFile('/tmp/other.md', '/work/notes')).resolves.toEqual({
      workspaceId: 'runtime-1',
      rootPath: '/tmp',
      relativePath: 'other.md',
    });
    expect(workspaceMocks.resolveWorkspace).toHaveBeenCalledWith('/tmp');
  });

  it('同一根目录只解析一次 workspaceId', async () => {
    const service = createWorkspaceRuntimeService();

    await service.resolveForFile('/work/notes/a.md', '/work/notes');
    await service.resolveForFile('/work/notes/b.md', '/work/notes');

    expect(workspaceMocks.resolveWorkspace).toHaveBeenCalledTimes(1);
  });

  it('解析失败时不缓存失败结果', async () => {
    workspaceMocks.resolveWorkspace.mockRejectedValueOnce(new Error('工作区不可用'));
    const service = createWorkspaceRuntimeService();

    await expect(service.resolveForFile('/work/notes/a.md', '/work/notes')).rejects.toThrow('工作区不可用');

    workspaceMocks.resolveWorkspace.mockResolvedValueOnce({
      workspaceId: 'runtime-2',
      rootPath: '/work/notes',
    });
    await expect(service.resolveForFile('/work/notes/a.md', '/work/notes')).resolves.toMatchObject({
      workspaceId: 'runtime-2',
    });
  });
});

describe('readFileRevision', () => {
  beforeEach(() => {
    workspaceMocks.resolveWorkspace.mockReset();
    workspaceMocks.getFileRevision.mockReset();
    workspaceMocks.isTauriApp.mockReset();
    workspaceMocks.resolveWorkspace.mockResolvedValue({
      workspaceId: 'runtime-1',
      rootPath: '/work/notes',
    });
    workspaceMocks.isTauriApp.mockReturnValue(true);
  });

  it('返回磁盘 revision 供保存事务使用', async () => {
    workspaceMocks.getFileRevision.mockResolvedValue({
      exists: true,
      size: 12,
      modifiedMs: 100,
      revision: '100:12',
      contentHash: null,
    });
    const service = createWorkspaceRuntimeService();

    await expect(readFileRevision(service, '/work/notes/a.md', '/work/notes')).resolves.toBe('100:12');
    expect(workspaceMocks.getFileRevision).toHaveBeenCalledWith('runtime-1', 'a.md');
  });

  it('文件不存在或读取失败时返回 null 而不抛错', async () => {
    workspaceMocks.getFileRevision.mockResolvedValueOnce({
      exists: false,
      size: 0,
      modifiedMs: 0,
      revision: null,
      contentHash: null,
    });
    const service = createWorkspaceRuntimeService();

    await expect(readFileRevision(service, '/work/notes/missing.md', '/work/notes')).resolves.toBeNull();

    workspaceMocks.getFileRevision.mockRejectedValueOnce(new Error('读取失败'));
    await expect(readFileRevision(service, '/work/notes/broken.md', '/work/notes')).resolves.toBeNull();
  });

  it('非 Tauri 环境不探测 revision', async () => {
    workspaceMocks.isTauriApp.mockReturnValue(false);
    const service = createWorkspaceRuntimeService();

    await expect(readFileRevision(service, '/work/notes/a.md', '/work/notes')).resolves.toBeNull();
    expect(workspaceMocks.getFileRevision).not.toHaveBeenCalled();
  });
});
