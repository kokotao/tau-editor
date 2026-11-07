/**
 * @description 分享转存纯逻辑测试：链接识别、文件名净化、目标路径与可转存判定。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-11-06 15:20
 */
import { describe, expect, it } from 'vitest';
import type { CloudSharePublicInfo } from '@/lib/tauri';
import {
  buildImportCloudPath,
  buildImportTitle,
  canImportSharedDocument,
  describeImportBlock,
  describeImportSuccess,
  resolveShareImportFileName,
  sanitizeImportFileName,
  withImportSequence,
} from '@/services/shareImportService';
import { parseTauShareLink, rewriteSharedImageUrl } from '@/services/cloudShareReceiveService';

function shareInfo(overrides: Partial<CloudSharePublicInfo> = {}): CloudSharePublicInfo {
  return {
    passwordRequired: false,
    title: '方案',
    content: '# 方案',
    category: null,
    updatedAt: null,
    authorName: null,
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

describe('parseTauShareLink', () => {
  it('从带说明文字的剪贴板文本中提取文档分享链接', () => {
    expect(parseTauShareLink('看看这个 https://note.lizipro.cn/s/AbCd_123-xyz 。')).toEqual({
      token: 'AbCd_123-xyz',
      url: 'https://note.lizipro.cn/s/AbCd_123-xyz',
      origin: 'https://note.lizipro.cn',
    });
  });

  it('兼容 API 前缀下的历史分享链接', () => {
    expect(parseTauShareLink('https://note.lizipro.cn/lizi/s/token_123456')?.token).toBe('token_123456');
  });

  it('拒绝普通网页和文件夹分享', () => {
    expect(parseTauShareLink('https://note.lizipro.cn/blog/a')).toBeNull();
    expect(parseTauShareLink('https://note.lizipro.cn/s/f/token_123456')).toBeNull();
  });
});

describe('分享转存目标', () => {
  it('净化文件名并固定落到 tau/导入', () => {
    expect(sanitizeImportFileName('../../a:b?.md')).toBe('ab.md');
    expect(buildImportCloudPath('方案.md')).toBe('tau/导入/方案.md');
    expect(buildImportCloudPath('方案.md', 2)).toBe('tau/导入/方案 (2).md');
    expect(buildImportTitle('方案.md')).toBe('方案');
  });

  it('无扩展名时补 .md，并保留旧分享标题兜底', () => {
    expect(resolveShareImportFileName({ fileName: null, title: '会议记录' })).toBe('会议记录.md');
    expect(withImportSequence('会议记录.md', 3)).toBe('会议记录 (3).md');
  });
});

describe('分享可转存判定', () => {
  it('文本分享可转存，二进制分享只允许预览', () => {
    expect(canImportSharedDocument(shareInfo())).toBe(true);
    expect(canImportSharedDocument(shareInfo({ fileName: '报告.pdf', fileExt: 'pdf', fileKind: 'pdf', content: null }))).toBe(false);
    expect(describeImportBlock(shareInfo({ fileName: '报告.pdf', fileExt: 'pdf', fileKind: 'pdf', content: null })))
      .toContain('仅支持在线预览');
  });

  it('密码未验证时不可转存', () => {
    const info = shareInfo({ passwordRequired: true, content: null });
    expect(canImportSharedDocument(info)).toBe(false);
    expect(describeImportBlock(info)).toContain('访问密码');
  });

  it('成功文案包含附件失败数量', () => {
    expect(describeImportSuccess({
      fileId: 1,
      version: 1,
      path: 'tau/导入/a.md',
      assetsTotal: 3,
      assetsCopied: 2,
      assetsFailed: 1,
    })).toContain('1/3');
  });
});

describe('rewriteSharedImageUrl', () => {
  it('只给同源分享附件补全 URL 和密码票据', () => {
    expect(rewriteSharedImageUrl('/lizi/blog/share/t/assets/1', 'ticket', {
      origin: 'https://note.lizipro.cn',
      token: 't',
    })).toBe(
      'https://note.lizipro.cn/lizi/blog/share/t/assets/1?ticket=ticket',
    );
    expect(rewriteSharedImageUrl('https://cdn.example/a.png?x=1', 'ticket', {
      origin: 'https://note.lizipro.cn',
      token: 't',
    })).toBe(
      'https://cdn.example/a.png?x=1',
    );
  });
});
