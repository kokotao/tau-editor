/**
 * @description 一键分享的纯逻辑：分享域名解析（去掉 /lizi）、链接拼装、有效期归一化、剪贴板兜底。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 16:30
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SHARE_MAX_EXPIRE_DAYS,
  buildShareUrl,
  copyTextToClipboard,
  normalizeExpiresInDays,
  resolveShareBaseUrl,
} from '@/services/cloudShareService';

describe('resolveShareBaseUrl 分享域名', () => {
  it('优先使用后端 config 的 shareBaseUrl', () => {
    expect(
      resolveShareBaseUrl({ shareBaseUrl: 'https://note.lizipro.cn/', defaultCategory: null, maxExpireDays: null }, 'http://other/lizi'),
    ).toBe('https://note.lizipro.cn');
  });

  it('config 缺失时用服务器地址的 origin（去掉 /lizi 及后续路径）', () => {
    expect(resolveShareBaseUrl(null, 'https://note.lizipro.cn/lizi')).toBe('https://note.lizipro.cn');
    expect(resolveShareBaseUrl(null, 'https://note.lizipro.cn/lizi/')).toBe('https://note.lizipro.cn');
    expect(resolveShareBaseUrl(null, 'https://note.lizipro.cn/other/path')).toBe('https://note.lizipro.cn');
  });

  it('两者都拿不到时返回空串', () => {
    expect(resolveShareBaseUrl(null, null)).toBe('');
    expect(resolveShareBaseUrl({ shareBaseUrl: '   ', defaultCategory: null, maxExpireDays: null }, '')).toBe('');
  });
});

describe('buildShareUrl 链接拼装', () => {
  it('后端给了 shareUrl 时原样使用', () => {
    expect(buildShareUrl('https://note.lizipro.cn', 'tok16', 'https://cdn.example/x')).toBe(
      'https://cdn.example/x',
    );
  });

  it('否则用 base + /s/ + token，绝不拼出 /lizi/s', () => {
    expect(buildShareUrl('https://note.lizipro.cn', 'abcdefgh12345678')).toBe(
      'https://note.lizipro.cn/s/abcdefgh12345678',
    );
    expect(buildShareUrl('https://note.lizipro.cn/', 'tok')).toBe('https://note.lizipro.cn/s/tok');
  });

  it('base 或 token 缺失时返回空串（不产出错误地址）', () => {
    expect(buildShareUrl('', 'tok')).toBe('');
    expect(buildShareUrl('https://note.lizipro.cn', '')).toBe('');
    expect(buildShareUrl('https://note.lizipro.cn', null)).toBe('');
  });
});

describe('normalizeExpiresInDays 有效期', () => {
  it('null / 0 / 负数 → 永久（null）', () => {
    expect(normalizeExpiresInDays(null)).toBeNull();
    expect(normalizeExpiresInDays(undefined)).toBeNull();
    expect(normalizeExpiresInDays(0)).toBeNull();
    expect(normalizeExpiresInDays(-3)).toBeNull();
    expect(normalizeExpiresInDays(Number.NaN)).toBeNull();
  });

  it('正整数按天数透传，并夹取到上限', () => {
    expect(normalizeExpiresInDays(1)).toBe(1);
    expect(normalizeExpiresInDays(7.9)).toBe(7);
    expect(normalizeExpiresInDays(45)).toBe(45);
    expect(normalizeExpiresInDays(999_999)).toBe(SHARE_MAX_EXPIRE_DAYS);
  });

  it('尊重后端 maxExpireDays', () => {
    expect(normalizeExpiresInDays(30, 7)).toBe(7);
    expect(normalizeExpiresInDays(3, 7)).toBe(3);
    // 非法上限回落到 3650
    expect(normalizeExpiresInDays(5000, 0)).toBe(SHARE_MAX_EXPIRE_DAYS);
  });
});

describe('copyTextToClipboard 复制兜底', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('优先用 Clipboard API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyTextToClipboard('https://note.lizipro.cn/s/tok')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://note.lizipro.cn/s/tok');
  });

  it('Clipboard API 失败时退回 execCommand', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal('document', {
      createElement: () => ({ style: {}, setAttribute: vi.fn(), select: vi.fn() }),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      execCommand,
    });

    await expect(copyTextToClipboard('tok')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('空文本直接返回 false', async () => {
    await expect(copyTextToClipboard('')).resolves.toBe(false);
  });
});
