import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workspaceCommands } from '@/lib/tauri';

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
});
