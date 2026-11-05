import { beforeEach, describe, expect, it, vi } from 'vitest';

const cloudMocks = vi.hoisted(() => ({
  isTauri: { value: true },
  me: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  save: vi.fn(),
  versions: vi.fn(),
  restore: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauriApp: () => cloudMocks.isTauri.value,
    cloudCommands: {
      ...actual.cloudCommands,
      me: cloudMocks.me,
      list: cloudMocks.list,
      get: cloudMocks.get,
      save: cloudMocks.save,
      versions: cloudMocks.versions,
      restore: cloudMocks.restore,
      remove: cloudMocks.remove,
    },
  };
});

import { TauriError } from '@/lib/tauri';
import {
  findCloudDocByPath,
  getCloudSpace,
  normalizeCloudError,
  saveCloudDoc,
} from '@/services/cloudDocService';

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    fileId: 7,
    path: 'tau/ws/notes/a.md',
    title: 'a.md',
    contentHash: 'sha256:aa',
    size: 12,
    version: 3,
    category: null,
    categoryId: null,
    tags: null,
    visibility: null,
    publishedArticleId: null,
    updatedAt: '2026-10-25 10:00:00',
    ...overrides,
  };
}

describe('cloudDocService normalizeCloudError', () => {
  it('应把 CONFLICT 映射为 conflict 并保留服务端文案', () => {
    const error = new TauriError('版本冲突，请先拉取最新内容', 'cloud_docs_save', null, 'CONFLICT');
    expect(normalizeCloudError(error)).toEqual({
      kind: 'conflict',
      message: '版本冲突，请先拉取最新内容',
    });
  });

  it('应把 UNAUTHORIZED 映射为 unauthorized', () => {
    const error = new TauriError('未登录或登录已过期', 'cloud_docs_me', null, 'UNAUTHORIZED');
    expect(normalizeCloudError(error).kind).toBe('unauthorized');
  });

  it('应把 QUOTA_EXCEEDED 映射为 quota', () => {
    const error = new TauriError('云端空间不足', 'cloud_docs_save', null, 'QUOTA_EXCEEDED');
    expect(normalizeCloudError(error).kind).toBe('quota');
  });

  it('应兼容 HTTP 状态码形式的 code', () => {
    expect(normalizeCloudError({ code: 409, message: '冲突' }).kind).toBe('conflict');
    expect(normalizeCloudError({ code: '413', message: '空间不足' }).kind).toBe('quota');
    expect(normalizeCloudError({ code: 401, message: '未登录' }).kind).toBe('unauthorized');
  });

  it('未知业务码应归为 unknown 且保留 message', () => {
    expect(
      normalizeCloudError({ code: 'SERVER_ERROR', message: '服务器开小差了' }),
    ).toEqual({ kind: 'unknown', message: '服务器开小差了' });
  });

  it('登录失败（Rust SERVER_ERROR）不得误判为登录过期', () => {
    // 服务端密码错=300 / 账号不存在=101 / FAIL=201，Rust 统一映射成 SERVER_ERROR。
    expect(normalizeCloudError({ code: 'SERVER_ERROR', message: '密码错误' })).toEqual({
      kind: 'unknown',
      message: '密码错误',
    });
    expect(normalizeCloudError({ code: 'SERVER_ERROR', message: '账号不存在' }).kind)
      .toBe('unknown');
  });

  it('Rust 的 BINARY_FILE / FILE_TOO_LARGE 应归为 unsupported', () => {
    expect(
      normalizeCloudError({ code: 'BINARY_FILE', message: '待同步文件不是 UTF-8 文本' }).kind,
    ).toBe('unsupported');
    expect(
      normalizeCloudError({ code: 'FILE_TOO_LARGE', message: '待同步文件超过上限' }).kind,
    ).toBe('unsupported');
  });

  it('Rust 的 NETWORK_ERROR 应归为 network', () => {
    expect(normalizeCloudError({ code: 'NETWORK_ERROR', message: '登录 lizi 账号失败' }).kind)
      .toBe('network');
  });

  it('fetch 网络异常应按关键字归为 network', () => {
    expect(normalizeCloudError(new TypeError('Failed to fetch')).kind).toBe('network');
  });

  it('缺少 code 时按中文提示兜底', () => {
    expect(normalizeCloudError('请先登录后再同步').kind).toBe('unauthorized');
    expect(normalizeCloudError('云端空间不足，请清理后再试').kind).toBe('quota');
  });

  it('空错误应返回可展示的默认文案', () => {
    expect(normalizeCloudError(undefined)).toEqual({
      kind: 'unknown',
      message: '云端操作失败，请稍后重试。',
    });
  });
});

describe('cloudDocService 命令包装', () => {
  beforeEach(() => {
    cloudMocks.isTauri.value = true;
    cloudMocks.list.mockResolvedValue({ records: [], total: 0, page: 1, size: 100 });
    cloudMocks.me.mockResolvedValue({
      userId: '42',
      usedBytes: 1024,
      quotaBytes: 2048,
      fileCount: 1,
      maxVersionPerFile: 30,
    });
    cloudMocks.save.mockResolvedValue({
      fileId: 7,
      version: 4,
      contentHash: 'sha256:bb',
      size: 12,
      updatedAt: null,
    });
  });

  it('按路径查找时应取父目录作为 pathPrefix 并精确比较 path', async () => {
    cloudMocks.list.mockResolvedValue({
      records: [makeItem({ fileId: 9, path: 'tau/ws/notes/other.md' }), makeItem()],
      total: 2,
      page: 1,
      size: 100,
    });

    const outcome = await findCloudDocByPath('tau/ws/notes/a.md');

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data?.fileId).toBe(7);
    }
    expect(cloudMocks.list).toHaveBeenCalledWith({
      pathPrefix: 'tau/ws/notes',
      page: 1,
      size: 100,
    });
  });

  it('云端没有该路径时应返回 null 而不是失败', async () => {
    const outcome = await findCloudDocByPath('tau/ws/missing.md');
    expect(outcome).toEqual({ ok: true, data: null });
  });

  it('列表失败时应把业务码透传为 kind', async () => {
    cloudMocks.list.mockRejectedValue(
      new TauriError('未登录或登录已过期', 'cloud_docs_list', null, 'UNAUTHORIZED'),
    );

    const outcome = await findCloudDocByPath('tau/ws/a.md');

    expect(outcome).toEqual({
      ok: false,
      kind: 'unauthorized',
      message: '未登录或登录已过期',
    });
  });

  it('保存冲突时应返回 conflict', async () => {
    cloudMocks.save.mockRejectedValue(
      new TauriError('版本冲突，请先拉取最新内容', 'cloud_docs_save', null, 'CONFLICT'),
    );

    const outcome = await saveCloudDoc({ path: 'tau/ws/a.md', content: 'x', baseVersion: 2 });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('conflict');
      expect(outcome.message).toBe('版本冲突，请先拉取最新内容');
    }
  });

  it('Web 构建下应返回 unsupported 而不是抛错', async () => {
    cloudMocks.isTauri.value = false;

    const outcome = await getCloudSpace();

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('unsupported');
    }
    expect(cloudMocks.me).not.toHaveBeenCalled();
  });
});


describe('403 归类为 forbidden（0.6.25，不能误登出）', () => {
  it('FORBIDDEN / 403 都归 forbidden 而不是 unauthorized', () => {
    expect(normalizeCloudError({ code: 'FORBIDDEN', message: '没有权限' }).kind).toBe('forbidden');
    expect(normalizeCloudError({ code: 403, message: '当前账号无作者权限' }).kind).toBe('forbidden');
    expect(normalizeCloudError({ code: 'PERMISSION_DENIED', message: '' }).kind).toBe('forbidden');
  });

  it('只有 401 / 未登录文案才算登录失效', () => {
    expect(normalizeCloudError({ code: 401, message: '未登录' }).kind).toBe('unauthorized');
    expect(normalizeCloudError({ code: 'UNAUTHORIZED', message: '' }).kind).toBe('unauthorized');
  });

  it('无权限但没有 message 时给可读兜底文案', () => {
    const normalized = normalizeCloudError({ code: 'FORBIDDEN' });
    expect(normalized.kind).toBe('forbidden');
    expect(normalized.message).toContain('无权限');
  });
});
