/**
 * @description 分享接收服务测试：剪贴板识别、公开预览、密码校验、当前账号转存与图片替换。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-11-06 15:45
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isTauri: { value: true },
  readClipboard: vi.fn(),
  sharePublicRead: vi.fn(),
  sharePublicVerify: vi.fn(),
  shareImport: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauriApp: () => mocks.isTauri.value,
    appCommands: {
      ...actual.appCommands,
      readClipboardText: mocks.readClipboard,
    },
    cloudCommands: {
      ...actual.cloudCommands,
      sharePublicRead: mocks.sharePublicRead,
      sharePublicVerify: mocks.sharePublicVerify,
      shareImport: mocks.shareImport,
    },
  };
});

import {
  parseTauShareLink,
  readPublicShare,
  readShareLinkFromClipboard,
  receiveShareToCloud,
  resolveShareContent,
  resolveSharePreviewKind,
  rewriteSharedImageUrl,
  verifyPublicShare,
} from '@/services/cloudShareReceiveService';

function shareInfo(overrides: Record<string, unknown> = {}) {
  return {
    passwordRequired: false,
    title: '方案',
    content: '# 方案',
    category: null,
    updatedAt: '2026-11-06 10:00:00',
    authorName: 'albert',
    fileName: '方案.md',
    fileExt: 'md',
    fileKind: 'markdown',
    fileSize: 10,
    assets: [],
    previewUrl: null,
    previewAvailable: false,
    assetTicket: null,
    ...overrides,
  };
}

describe('分享接收服务', () => {
  beforeEach(() => {
    mocks.isTauri.value = true;
    mocks.readClipboard.mockResolvedValue('看看这个 https://note.lizipro.cn/s/AbCd_123-xyz 。');
    mocks.sharePublicRead.mockResolvedValue(shareInfo());
    mocks.sharePublicVerify.mockResolvedValue(shareInfo());
    mocks.shareImport.mockResolvedValue({
      fileId: 99,
      version: 1,
      contentHash: 'sha256:abc',
      size: 10,
      path: 'tau/导入/方案.md',
      fileName: '方案.md',
      assetsTotal: 2,
      assetsCopied: 1,
      assetsFailed: 1,
    });
  });

  it('从剪贴板识别带说明文字的分享链接', async () => {
    const outcome = await readShareLinkFromClipboard();
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.token).toBe('AbCd_123-xyz');
      expect(outcome.data.url).toBe('https://note.lizipro.cn/s/AbCd_123-xyz');
    }
  });

  it('拒绝文件夹、普通页面和非 http 链接', () => {
    expect(parseTauShareLink('https://note.lizipro.cn/s/f/AbCd_123-xyz')).toBeNull();
    expect(parseTauShareLink('https://note.lizipro.cn/blog/a')).toBeNull();
    expect(parseTauShareLink('ftp://note.lizipro.cn/s/AbCd_123-xyz')).toBeNull();
  });

  it('公开读取和密码校验走免登录接口', async () => {
    expect((await readPublicShare('AbCd_123-xyz')).ok).toBe(true);
    expect((await verifyPublicShare('AbCd_123-xyz', 'secret')).ok).toBe(true);
    expect(mocks.sharePublicRead).toHaveBeenCalledWith('AbCd_123-xyz');
    expect(mocks.sharePublicVerify).toHaveBeenCalledWith('AbCd_123-xyz', 'secret');
  });

  it('一键转存调用当前账号服务，不复用作者 fileId', async () => {
    const outcome = await receiveShareToCloud({
      info: shareInfo() as never,
      token: 'AbCd_123-xyz',
    });
    expect(outcome.ok).toBe(true);
    expect(mocks.shareImport).toHaveBeenCalledWith(expect.objectContaining({
      token: 'AbCd_123-xyz',
      path: 'tau/导入/方案.md',
      title: '方案',
      category: '导入',
    }));
    if (outcome.ok) {
      expect(outcome.data.fileId).toBe(99);
      expect(outcome.data.cloudPath).toBe('tau/导入/方案.md');
    }
  });

  it('同名冲突自动追加序号，避免覆盖已有文档', async () => {
    mocks.shareImport
      .mockRejectedValueOnce(Object.assign(new Error('文档已存在'), { code: 'CONFLICT' }))
      .mockRejectedValueOnce(Object.assign(new Error('文档已存在'), { code: 'FILE_CONFLICT' }))
      .mockResolvedValueOnce({
        fileId: 101,
        version: 1,
        contentHash: 'sha256:copy',
        size: 10,
        path: 'tau/导入/方案 (3).md',
        fileName: '方案 (3).md',
        assetsTotal: 0,
        assetsCopied: 0,
        assetsFailed: 0,
      });

    const outcome = await receiveShareToCloud({
      info: shareInfo() as never,
      token: 'AbCd_123-xyz',
    });

    expect(outcome.ok).toBe(true);
    expect(mocks.shareImport).toHaveBeenCalledTimes(3);
    expect(mocks.shareImport.mock.calls.map(([payload]) => payload)).toEqual([
      expect.objectContaining({ path: 'tau/导入/方案.md', title: '方案' }),
      expect.objectContaining({ path: 'tau/导入/方案 (2).md', title: '方案 (2)' }),
      expect.objectContaining({ path: 'tau/导入/方案 (3).md', title: '方案 (3)' }),
    ]);
    if (outcome.ok) {
      expect(outcome.data.cloudPath).toBe('tau/导入/方案 (3).md');
    }
  });

  it('非冲突错误不盲目换名重试', async () => {
    mocks.shareImport.mockRejectedValue(Object.assign(new Error('空间不足'), { code: 'QUOTA_EXCEEDED' }));

    const outcome = await receiveShareToCloud({
      info: shareInfo() as never,
      token: 'AbCd_123-xyz',
    });

    expect(outcome).toMatchObject({ ok: false, kind: 'quota' });
    expect(mocks.shareImport).toHaveBeenCalledTimes(1);
  });

  it('持续同名时尝试到 (9) 后返回冲突', async () => {
    mocks.shareImport.mockRejectedValue(Object.assign(new Error('文档已存在'), { code: 'CONFLICT' }));

    const outcome = await receiveShareToCloud({
      info: shareInfo() as never,
      token: 'AbCd_123-xyz',
    });

    expect(outcome).toMatchObject({ ok: false, kind: 'conflict' });
    expect(mocks.shareImport).toHaveBeenCalledTimes(9);
    expect(mocks.shareImport.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      path: 'tau/导入/方案 (9).md',
      title: '方案 (9)',
    }));
  });

  it('二进制或未解锁分享不能转存', async () => {
    const binary = await receiveShareToCloud({
      info: shareInfo({ fileName: '报告.pdf', fileExt: 'pdf', fileKind: 'pdf', content: null }) as never,
      token: 'AbCd_123-xyz',
    });
    expect(binary.ok).toBe(false);
    expect(mocks.shareImport).not.toHaveBeenCalled();
  });

  it('按文件类型选择 Markdown、导图或文本预览', () => {
    expect(resolveSharePreviewKind(shareInfo() as never)).toBe('markdown');
    expect(resolveSharePreviewKind(shareInfo({ fileName: 'a.taumap', fileExt: 'taumap' }) as never)).toBe('mindmap');
    expect(resolveSharePreviewKind(shareInfo({ fileName: 'a.ts', fileExt: 'ts', fileKind: 'code' }) as never)).toBe('text');
    expect(resolveSharePreviewKind(shareInfo({ fileName: 'a.map', fileExt: 'map' }) as never)).toBe('unsupported');
  });

  it('图片相对路径补全并附加密码票据', () => {
    expect(rewriteSharedImageUrl('/lizi/blog/share/t/assets/1', 'ticket', {
      origin: 'https://note.lizipro.cn',
      token: 't',
    })).toBe(
      'https://note.lizipro.cn/lizi/blog/share/t/assets/1?ticket=ticket',
    );
    expect(rewriteSharedImageUrl('https://evil.example/image.png', 'ticket', {
      origin: 'https://note.lizipro.cn',
      token: 't',
    })).toBe('https://evil.example/image.png');
    expect(rewriteSharedImageUrl('/lizi/blog/share/tampered/assets/1', 'ticket', {
      origin: 'https://note.lizipro.cn',
      token: 't',
    })).toBe('https://note.lizipro.cn/lizi/blog/share/tampered/assets/1');
    const content = resolveShareContent(shareInfo({
      content: '![图](img/a.png)',
      assets: [{ relPath: 'img/a.png', assetId: 1, url: '/lizi/blog/share/t/assets/1' }],
      assetTicket: 'ticket',
    }) as never, {
      origin: 'https://note.lizipro.cn',
      token: 't',
    });
    expect(content).toContain('https://note.lizipro.cn/lizi/blog/share/t/assets/1?ticket=ticket');
  });
});
