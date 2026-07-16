import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TauriError, gitCommands, workspaceCommands } from '@/lib/tauri';

const invokeMock = vi.fn();

describe('workspaceCommands', () => {
  beforeEach(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: { invoke: invokeMock },
    });
    invokeMock.mockReset();
  });

  it('仅将根路径传给 resolve_workspace，并使用返回的 workspaceId 查询文件 revision', async () => {
    invokeMock.mockResolvedValueOnce({ workspaceId: 'runtime-id', rootPath: '/workspace' });
    invokeMock.mockResolvedValueOnce({
      exists: true,
      size: 4,
      modifiedMs: 1,
      revision: '1:4',
      contentHash: null,
    });

    await expect(workspaceCommands.resolveWorkspace('/workspace')).resolves.toEqual({
      workspaceId: 'runtime-id',
      rootPath: '/workspace',
    });
    await workspaceCommands.getFileRevision('runtime-id', 'notes.md');

    expect(invokeMock).toHaveBeenNthCalledWith(
      1,
      'resolve_workspace',
      { path: '/workspace' },
      undefined,
    );
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'get_file_revision', {
      workspaceId: 'runtime-id',
      relativePath: 'notes.md',
      includeHash: false,
    }, undefined);
  });

  it('保留结构化 FILE_CONFLICT 错误码，供冲突界面可靠分流', async () => {
    invokeMock.mockRejectedValueOnce({
      code: 'FILE_CONFLICT',
      message: '文件已被外部修改',
    });

    await expect(
      workspaceCommands.writeFileIfRevision('runtime-id', 'notes.md', 'next', '1:4'),
    ).rejects.toMatchObject({
      name: 'TauriError',
      code: 'FILE_CONFLICT',
      message: '文件已被外部修改',
    } satisfies Partial<TauriError>);
  });

  it('通过 workspaceId 查询 Git 变更，不向后端泄露任意根路径', async () => {
    invokeMock.mockResolvedValueOnce({ branch: 'main', entries: [] });

    await expect(gitCommands.status('runtime-id')).resolves.toEqual({ branch: 'main', entries: [] });
    expect(invokeMock).toHaveBeenCalledWith('git_status', { workspaceId: 'runtime-id' }, undefined);
  });

  it('对选中的相对文件请求工作区内 Git diff 与暂存', async () => {
    invokeMock.mockResolvedValueOnce('diff --git a/notes.md b/notes.md');
    invokeMock.mockResolvedValueOnce(undefined);

    await expect(gitCommands.diff('runtime-id', 'notes.md')).resolves.toContain('notes.md');
    await expect(gitCommands.stage('runtime-id', ['notes.md'])).resolves.toBeUndefined();

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'git_diff', {
      workspaceId: 'runtime-id', relativePath: 'notes.md', staged: false,
    }, undefined);
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'git_stage', {
      workspaceId: 'runtime-id', relativePaths: ['notes.md'],
    }, undefined);
  });
});
