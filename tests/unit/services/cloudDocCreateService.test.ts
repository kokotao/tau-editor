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

  it('新建 .taumap：写入合法的空思维导图 JSON（避免打开即报非法 JSON）', async () => {
    const outcome = await createCloudDocFile({
      fileName: 'spring知识点思维导图.taumap',
      workspaceName: 'ws',
    });

    expect(outcome.ok).toBe(true);
    const payload = mocks.saveDoc.mock.calls[0]![0] as { content: string };
    const parsed = JSON.parse(payload.content) as {
      format: string;
      schemaVersion: number;
      title: string;
      topics: Record<string, unknown>;
    };
    expect(parsed.format).toBe('tau-mindmap');
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.title).toBe('spring知识点思维导图');
    expect(Object.keys(parsed.topics)).toHaveLength(1);
  });

  it('不支持的类型提前拦截：不发起保存并给出可读原因', async () => {
    const outcome = await createCloudDocFile({ fileName: 'setup.exe', workspaceName: 'ws' });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? '' : outcome.kind).toBe('unsupported');
    expect(outcome.ok ? '' : outcome.message).toContain('.exe');
    expect(mocks.saveDoc).not.toHaveBeenCalled();
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

/* ------------------- UX-3A：按类型新建（mm / opml / 自定义扩展名） ------------------- */

describe('UX-3A 按类型新建', () => {
  it('sanitizeNewDocName 支持自定义默认扩展名，且尊重用户已写的扩展名', () => {
    expect(sanitizeNewDocName('大纲', '.opml')).toEqual({ ok: true, name: '大纲.opml' });
    expect(sanitizeNewDocName('草图', 'mm')).toEqual({ ok: true, name: '草图.mm' });
    // 已有扩展名时按用户输入（不重复补）
    expect(sanitizeNewDocName('大纲.md', '.opml')).toEqual({ ok: true, name: '大纲.md' });
    // 默认仍补 .md
    expect(sanitizeNewDocName('默认')).toEqual({ ok: true, name: '默认.md' });
  });

  it('typeId=freemind + 无扩展名：补 .mm 并写入合法 FreeMind 空地图', async () => {
    const outcome = await createCloudDocFile({
      fileName: '思路',
      typeId: 'freemind',
      workspaceName: 'ws',
    });

    expect(outcome.ok).toBe(true);
    const payload = mocks.saveDoc.mock.calls[0]![0] as { title: string; content: string };
    expect(payload.title).toBe('思路.mm');
    expect(payload.content).toContain('<map version="0.9.1">');
    expect(payload.content).toContain('TEXT="思路"');
  });

  it('typeId=opml + 无扩展名：补 .opml 并写入可导入的 OPML（含 outline）', async () => {
    const outcome = await createCloudDocFile({
      fileName: '章节大纲',
      typeId: 'opml',
      workspaceName: 'ws',
    });

    expect(outcome.ok).toBe(true);
    const payload = mocks.saveDoc.mock.calls[0]![0] as { title: string; content: string };
    expect(payload.title).toBe('章节大纲.opml');
    expect(payload.content).toContain('<opml version="2.0">');
    expect(payload.content).toContain('<outline text="章节大纲"');
  });

  it('typeId 未知/省略时按 Markdown 处理（兼容旧调用）', async () => {
    await createCloudDocFile({ fileName: '旧调用', workspaceName: 'ws' });
    const payload = mocks.saveDoc.mock.calls[0]![0] as { title: string; content: string };
    expect(payload.title).toBe('旧调用.md');
    expect(payload.content).toBe('');

    mocks.saveDoc.mockClear();
    await createCloudDocFile({ fileName: '未知类型', typeId: 'not-a-type', workspaceName: 'ws' });
    const fallback = mocks.saveDoc.mock.calls[0]![0] as { title: string };
    expect(fallback.title).toBe('未知类型.md');
  });

  it('initialCloudDocContent 对 taumap / mm / opml 都返回非空合法模板', async () => {
    const { initialCloudDocContent } = await import('@/services/cloudDocCreateService');
    expect(initialCloudDocContent('a.taumap')).toContain('"format": "tau-mindmap"');
    expect(initialCloudDocContent('a.mm')).toContain('<map version="0.9.1">');
    expect(initialCloudDocContent('a.opml')).toContain('<opml version="2.0">');
    expect(initialCloudDocContent('a.md')).toBe('');
  });
});

/* ---------------------- UX-3A custom：自定义格式云端新建 ---------------------- */

describe('UX-3A custom 自定义格式', () => {
  it('白名单内扩展名：按输入补扩展名（小写、去点），不走 Markdown 回退', async () => {
    const outcome = await createCloudDocFile({
      fileName: '自定义',
      typeId: 'custom',
      customExtension: '  .TXT ',
      workspaceName: 'ws',
    });

    expect(outcome.ok).toBe(true);
    const payload = mocks.saveDoc.mock.calls[0]![0] as { title: string; content: string; path: string };
    expect(payload.title).toBe('自定义.txt');
    expect(payload.path).toBe('tau/ws/自定义.txt');
    expect(payload.content).toBe('');
  });

  it('自定义扩展名为 .taumap 时写入合法空导图 JSON', async () => {
    const outcome = await createCloudDocFile({
      fileName: '自定义导图',
      typeId: 'custom',
      customExtension: 'taumap',
      workspaceName: 'ws',
    });

    expect(outcome.ok).toBe(true);
    const payload = mocks.saveDoc.mock.calls[0]![0] as { title: string; content: string };
    expect(payload.title).toBe('自定义导图.taumap');
    expect(JSON.parse(payload.content).format).toBe('tau-mindmap');
  });

  it('文件名已带扩展名时尊重用户输入（不重复补）', async () => {
    await createCloudDocFile({
      fileName: 'a.html',
      typeId: 'custom',
      customExtension: 'doc',
      workspaceName: 'ws',
    });
    const payload = mocks.saveDoc.mock.calls[0]![0] as { title: string };
    expect(payload.title).toBe('a.html');
  });

  it('扩展名非法：不发请求并给出可读原因', async () => {
    const outcome = await createCloudDocFile({
      fileName: '坏扩展名',
      typeId: 'custom',
      customExtension: 'a/b',
      workspaceName: 'ws',
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? '' : outcome.kind).toBe('unknown');
    expect(outcome.ok ? '' : outcome.message).toContain('扩展名');
    expect(mocks.findByPath).not.toHaveBeenCalled();
    expect(mocks.saveDoc).not.toHaveBeenCalled();
  });

  it('扩展名为空：提示不能为空', async () => {
    const outcome = await createCloudDocFile({
      fileName: '空扩展名',
      typeId: 'custom',
      customExtension: '   ',
      workspaceName: 'ws',
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? '' : outcome.message).toContain('不能为空');
    expect(mocks.saveDoc).not.toHaveBeenCalled();
  });

  it('白名单外扩展名：返回 unsupported 且不保存', async () => {
    const outcome = await createCloudDocFile({
      fileName: '可执行',
      typeId: 'custom',
      customExtension: 'exe',
      workspaceName: 'ws',
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? '' : outcome.kind).toBe('unsupported');
    expect(outcome.ok ? '' : outcome.message).toContain('.exe');
    expect(mocks.saveDoc).not.toHaveBeenCalled();
  });
});
