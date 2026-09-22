/**
 * diffService 单元测试（v0.4.0）
 *
 * 覆盖大小守卫、二进制识别、语言推断与 Git/工作区对比会话构造。
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createDiffSession,
  detectDiffLanguage,
  DIFF_MAX_BYTES,
  loadGitDiffSession,
  loadWorkspaceFileDiffSession,
  looksBinary,
  textByteLength,
} from '@/services/diffService';

const loaders = (overrides: Partial<{ readFile: (path: string) => Promise<string>; gitShowFile: (workspaceId: string, relativePath: string, revision?: string) => Promise<string> }> = {}) => ({
  readFile: vi.fn(async () => 'disk content'),
  gitShowFile: vi.fn(async () => 'head content'),
  ...overrides,
});

describe('diffService', () => {
  it('creates a read-only session with layout and language', () => {
    const result = createDiffSession({
      left: { label: 'a', filePath: '/tmp/a.ts', content: 'const a = 1;' },
      right: { label: 'b', filePath: '/tmp/b.ts', content: 'const b = 2;', },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.session.readOnly).toBe(true);
    expect(result.session.layout).toBe('side-by-side');
    expect(result.session.language).toBe('typescript');
    expect(result.session.id).toMatch(/^diff-/);
  });

  it('rejects oversized or binary sides', () => {
    const oversized = createDiffSession({
      left: { label: 'left', content: 'x'.repeat(DIFF_MAX_BYTES + 1) },
      right: { label: 'right', content: '' },
    });
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) {
      expect(oversized.error.code).toBe('DIFF_TOO_LARGE');
    }

    const binary = createDiffSession({
      left: { label: 'left', content: 'ok' },
      right: { label: 'right', content: 'PK\u0003\u0004binary' },
    });
    expect(binary.ok).toBe(false);
    if (!binary.ok) {
      expect(binary.error.code).toBe('DIFF_BINARY');
    }
  });

  it('detects language and byte length helpers', () => {
    expect(detectDiffLanguage('/tmp/foo.rs')).toBe('rust');
    expect(detectDiffLanguage('C:\\repo\\a\\b.py')).toBe('python');
    expect(detectDiffLanguage('/tmp/unknown.zzz')).toBe('plaintext');
    expect(textByteLength('abc')).toBe(3);
    expect(looksBinary('plain text')).toBe(false);
    expect(looksBinary('has\u0000null')).toBe(true);
  });

  it('loads a workspace file diff with the current editor content', async () => {
    const io = loaders();
    const result = await loadWorkspaceFileDiffSession(io, {
      compareFilePath: '/tmp/other.ts',
      currentLabel: 'main.ts',
      currentFilePath: '/tmp/main.ts',
      currentContent: 'current buffer',
      currentIsDirty: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(io.readFile).toHaveBeenCalledWith('/tmp/other.ts');
    expect(result.session.left.content).toBe('disk content');
    expect(result.session.right.content).toBe('current buffer');
    expect(result.session.right.label).toContain('未保存');
  });

  it('returns a structured error when reading the compared file fails', async () => {
    const io = loaders({ readFile: vi.fn(async () => { throw new Error('EACCES'); }) });
    const result = await loadWorkspaceFileDiffSession(io, {
      compareFilePath: '/tmp/blocked.ts',
      currentLabel: 'main.ts',
      currentContent: 'buffer',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DIFF_READ_FAILED');
      expect(result.error.message).toContain('EACCES');
    }
  });

  it('loads a git diff against HEAD and tolerates new files', async () => {
    const io = loaders();
    const result = await loadGitDiffSession(io, {
      workspaceId: 'ws-1',
      rootPath: '/repo',
      relativePath: 'src/main.ts',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(io.gitShowFile).toHaveBeenCalledWith('ws-1', 'src/main.ts', 'HEAD');
    expect(result.session.left.content).toBe('head content');
    expect(result.session.right.content).toBe('disk content');
    expect(result.session.left.label).toContain('HEAD');

    const newFileIo = loaders({
      gitShowFile: vi.fn(async () => {
        throw new Error('fatal: path \'a.ts\' exists on disk, but not in \'HEAD\'');
      }),
    });
    const newFileResult = await loadGitDiffSession(newFileIo, {
      workspaceId: 'ws-1',
      rootPath: '/repo',
      relativePath: 'a.ts',
      currentContent: 'brand new',
    });
    expect(newFileResult.ok).toBe(true);
    if (newFileResult.ok) {
      expect(newFileResult.session.left.content).toBe('');
      expect(newFileResult.session.right.content).toBe('brand new');
    }
  });

  it('surfaces git read failures other than missing files', async () => {
    const io = loaders({
      gitShowFile: vi.fn(async () => {
        throw new Error('GIT_UNAVAILABLE');
      }),
    });
    const result = await loadGitDiffSession(io, {
      workspaceId: 'ws-1',
      rootPath: '/repo',
      relativePath: 'a.ts',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DIFF_READ_FAILED');
    }
  });
});
