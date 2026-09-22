import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TauriError, gitCommands, searchCommands, workspaceCommands } from '@/lib/tauri';
import { replaceCommands } from '@/lib/tauri';

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

  it('通过 workspaceId 发起取消暂存和恢复工作区文件请求', async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    invokeMock.mockResolvedValueOnce(undefined);

    await gitCommands.unstage('runtime-id', ['notes.md']);
    await gitCommands.discard('runtime-id', ['notes.md']);

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'git_unstage', {
      workspaceId: 'runtime-id', relativePaths: ['notes.md'],
    }, undefined);
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'git_discard', {
      workspaceId: 'runtime-id', relativePaths: ['notes.md'],
    }, undefined);
  });

  it('将 searchId、搜索选项和 workspaceId 一起提交给受限项目搜索命令', async () => {
    invokeMock.mockResolvedValueOnce({
      matches: [],
      truncated: false,
      scannedFiles: 2,
      cancelled: false,
    });

    await expect(searchCommands.workspace('runtime-id', 'search-1', 'release', {
      isRegex: false,
      caseSensitive: false,
      wholeWord: false,
      maxResults: 50,
    })).resolves.toMatchObject({ scannedFiles: 2 });
    expect(invokeMock).toHaveBeenCalledWith('search_workspace', {
      workspaceId: 'runtime-id',
      searchId: 'search-1',
      query: 'release',
      options: { isRegex: false, caseSensitive: false, wholeWord: false, maxResults: 50 },
    }, undefined);
  });

  it('通过 cancel_search 取消指定搜索会话', async () => {
    invokeMock.mockResolvedValueOnce({ cancelled: true });

    await expect(searchCommands.cancel('search-1')).resolves.toEqual({ cancelled: true });
    expect(invokeMock).toHaveBeenCalledWith('cancel_search', { searchId: 'search-1' }, undefined);
  });

  it('提交替换预览、按计划执行与撤销请求', async () => {
    invokeMock.mockResolvedValueOnce({
      previewId: 'preview-1',
      files: [],
      totalMatches: 0,
      scannedFiles: 0,
      truncated: false,
    });
    invokeMock.mockResolvedValueOnce({
      previewId: 'preview-1',
      undoId: 'undo-1',
      results: [],
      applied: 1,
      skipped: 0,
      conflicts: 0,
      failed: 0,
    });
    invokeMock.mockResolvedValueOnce({ undoId: 'undo-1', restored: ['notes.md'], conflicts: [], failed: [] });

    await replaceCommands.preview('runtime-id', 'release', 'RELEASE', {
      isRegex: false,
      caseSensitive: false,
      wholeWord: false,
      maxResults: 50,
    });
    await replaceCommands.apply('runtime-id', 'preview-1', ['notes.md#0']);
    await replaceCommands.undo('runtime-id', 'undo-1');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'preview_workspace_replace', {
      workspaceId: 'runtime-id',
      query: 'release',
      replacement: 'RELEASE',
      options: { isRegex: false, caseSensitive: false, wholeWord: false, maxResults: 50 },
    }, undefined);
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'apply_workspace_replace_preview', {
      workspaceId: 'runtime-id',
      previewId: 'preview-1',
      matchIds: ['notes.md#0'],
    }, undefined);
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'undo_workspace_replace', {
      workspaceId: 'runtime-id',
      undoId: 'undo-1',
    }, undefined);
  });
});
