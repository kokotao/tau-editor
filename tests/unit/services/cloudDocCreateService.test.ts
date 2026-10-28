/**
 * @description 云文档新建（R1）：文件名净化、`tau/<workspace>/<fileName>` 路径生成（含 D2 兜底）、
 * 重名预检与「保存空正文即创建」的入参契约。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-28
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findByPath: vi.fn(),
  saveDoc: vi.fn(),
}));

vi.mock('@/services/cloudDocService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudDocService')>();
  return {
    ...actual,
    findCloudDocByPath: mocks.findByPath,
    saveCloudDoc: mocks.saveDoc,
  };
});

import {
  NEW_DOC_NAME_MAX_LENGTH,
  buildNewCloudDocPath,
  createCloudDocFile,
  resolveNewDocWorkspaceSegment,
  sanitizeNewDocName,
} from '@/services/cloudDocCreateService';

/** 成功保存的响应（Rust CloudDocSaveResult 结构）。 */
const SAVED = {
  fileId: 9001,
  version: 1,
  contentHash: 'sha256:empty',
  size: 0,
  updatedAt: '2026-10-28T08:00:00Z',
};

beforeEach(() => {
  mocks.findByPath.mockResolvedValue({ ok: true, data: null });
  mocks.saveDoc.mockResolvedValue({ ok: true, data: SAVED });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('sanitizeNewDocName 文件名净化', () => {
  it('保留合法文件名与扩展名', () => {
    expect(sanitizeNewDocName('接口设计.md')).toEqual({ ok: true, name: '接口设计.md' });
    expect(sanitizeNewDocName('  notes.txt  ')).toEqual({ ok: true, name: 'notes.txt' });
  });

  it('没有扩展名时自动补 .md', () => {
    expect(sanitizeNewDocName('接口设计')).toEqual({ ok: true, name: '接口设计.md' });
    expect(sanitizeNewDocName('  todo  ')).toEqual({ ok: true, name: 'todo.md' });
  });

  it('空名被拒绝', () => {
    expect(sanitizeNewDocName('')).toEqual({ ok: false, reason: 'empty' });
    expect(sanitizeNewDocName('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(sanitizeNewDocName(null)).toEqual({ ok: false, reason: 'empty' });
  });

  it('Windows 保留字符与路径分隔符被拒绝', () => {
    for (const name of ['a/b.md', 'a\\b.md', 'a:b.md', 'a*b.md', 'a?b.md', 'a"b.md', 'a<b.md', 'a>b.md', 'a|b.md']) {
      expect(sanitizeNewDocName(name)).toEqual({ ok: false, reason: 'invalid-chars' });
    }
  });

  it('含 .. 的路径穿越被拒绝', () => {
    expect(sanitizeNewDocName('../a.md')).toEqual({ ok: false, reason: 'dot-dot' });
    expect(sanitizeNewDocName('a..md')).toEqual({ ok: false, reason: 'dot-dot' });
  });

  it('超长文件名被拒绝（补扩展名后再判长度）', () => {
    expect(sanitizeNewDocName('a'.repeat(NEW_DOC_NAME_MAX_LENGTH)).reason).toBe('too-long');
    const justFit = sanitizeNewDocName('a'.repeat(NEW_DOC_NAME_MAX_LENGTH - 3));
    expect(justFit).toEqual({ ok: true, name: `${'a'.repeat(NEW_DOC_NAME_MAX_LENGTH - 3)}.md` });
  });
});

describe('resolveNewDocWorkspaceSegment / buildNewCloudDocPath 路径生成', () => {
  it('优先用当前工作区名', () => {
    expect(resolveNewDocWorkspaceSegment('lizi-tau', '笔记')).toBe('lizi-tau');
  });

  it('没有工作区时退回分类名，都没有时退回「未分类」（D2）', () => {
    expect(resolveNewDocWorkspaceSegment('', '笔记')).toBe('笔记');
    expect(resolveNewDocWorkspaceSegment(null, '笔记')).toBe('笔记');
    expect(resolveNewDocWorkspaceSegment('  ', '  ')).toBe('未分类');
    expect(resolveNewDocWorkspaceSegment(undefined, undefined)).toBe('未分类');
  });

  it('路径固定为 tau/<workspace>/<fileName>，反斜杠与空段被规范化', () => {
    expect(buildNewCloudDocPath('ws', 'a.md')).toBe('tau/ws/a.md');
    expect(buildNewCloudDocPath('w\\s', 'a.md')).toBe('tau/w/s/a.md');
    expect(buildNewCloudDocPath('', 'a.md')).toBe('tau/a.md');
    expect(buildNewCloudDocPath('ws', 'docs\\a.md')).toBe('tau/ws/docs/a.md');
  });
});

describe('createCloudDocFile 云端新建', () => {
  it('预检无重名：保存空正文并带回 fileId/version/contentHash/cloudPath', async () => {
    const outcome = await createCloudDocFile({
      fileName: '接口设计',
      workspaceName: 'ws',
      categoryId: '1001',
      categoryName: '笔记',
    });

    expect(mocks.findByPath).toHaveBeenCalledWith('tau/ws/接口设计.md');
    expect(mocks.saveDoc).toHaveBeenCalledWith({
      path: 'tau/ws/接口设计.md',
      title: '接口设计.md',
      content: '',
      baseVersion: null,
      category: '笔记',
      categoryId: '1001',
    });
    expect(outcome).toEqual({
      ok: true,
      data: {
        fileId: 9001,
        version: 1,
        contentHash: 'sha256:empty',
        cloudPath: 'tau/ws/接口设计.md',
        size: 0,
        updatedAt: '2026-10-28T08:00:00Z',
      },
    });
  });

  it('同名已存在：返回 conflict 且不发起保存（不产生第二篇）', async () => {
    mocks.findByPath.mockResolvedValue({ ok: true, data: { fileId: 42, path: 'tau/ws/a.md' } });

    const outcome = await createCloudDocFile({ fileName: 'a.md', workspaceName: 'ws' });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? '' : outcome.kind).toBe('conflict');
    expect(mocks.saveDoc).not.toHaveBeenCalled();
  });

  it('未分类：category/categoryId 归一成 null，路径按 D2 退回分类名', async () => {
    await createCloudDocFile({ fileName: 'b.md', workspaceName: '', categoryName: '' });

    expect(mocks.findByPath).toHaveBeenCalledWith('tau/未分类/b.md');
    expect(mocks.saveDoc).toHaveBeenCalledWith({
      path: 'tau/未分类/b.md',
      title: 'b.md',
      content: '',
      baseVersion: null,
      category: null,
      categoryId: null,
    });
  });

  it('文件名不可用：不发任何请求', async () => {
    const outcome = await createCloudDocFile({ fileName: 'a/b.md', workspaceName: 'ws' });

    expect(outcome.ok).toBe(false);
    expect(mocks.findByPath).not.toHaveBeenCalled();
    expect(mocks.saveDoc).not.toHaveBeenCalled();
  });

  it('预检失败：原样透出失败归类', async () => {
    mocks.findByPath.mockResolvedValue({ ok: false, kind: 'network', message: '网络异常' });

    const outcome = await createCloudDocFile({ fileName: 'a.md', workspaceName: 'ws' });

    expect(outcome).toEqual({ ok: false, kind: 'network', message: '网络异常' });
    expect(mocks.saveDoc).not.toHaveBeenCalled();
  });

  it('保存失败（配额）：透出 quota 与后端文案', async () => {
    mocks.saveDoc.mockResolvedValue({ ok: false, kind: 'quota', message: '云端空间不足' });

    const outcome = await createCloudDocFile({ fileName: 'a.md', workspaceName: 'ws' });

    expect(outcome).toEqual({ ok: false, kind: 'quota', message: '云端空间不足' });
  });
});
