/**
 * @description 云端文件夹（分类）分享服务：状态查询/创建/撤销的 CloudOutcome 包装、错误归一化、
 * 未登录与 Web 构建守卫、以及 `/s/f/{token}` 相对短链拼完整分享链接的规则。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-28
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  isTauri: { value: true },
  shareStatus: vi.fn(),
  shareCreate: vi.fn(),
  shareRevoke: vi.fn(),
  shareConfig: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauriApp: () => mocks.isTauri.value,
    cloudCommands: {
      ...actual.cloudCommands,
      categoryShareStatus: mocks.shareStatus,
      categoryShareCreate: mocks.shareCreate,
      categoryShareRevoke: mocks.shareRevoke,
    },
  };
});

vi.mock('@/services/cloudShareService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudShareService')>();
  return { ...actual, fetchShareConfig: mocks.shareConfig };
});

import {
  FOLDER_SHARE_URL_PREFIX,
  buildFolderShareUrl,
  createCategoryShare,
  emptyCategoryShareInfo,
  getCategoryShareStatus,
  resolveFolderShareBaseUrl,
  revokeCategoryShare,
} from '@/services/cloudCategoryShareService';
import { useCloudSyncStore } from '@/stores/cloudSync';

const SHARED = {
  shared: true,
  token: 'tok-32',
  url: `/s/f/${'tok-32'}`, // 后端返回相对短链
  hasPassword: true,
  expiresAt: '2026-11-28 00:00:00',
  includeSubCategories: true,
  docCount: 3,
  created: true,
};

beforeEach(() => {
  setActivePinia(createPinia());
  mocks.shareStatus.mockResolvedValue(SHARED);
  mocks.shareCreate.mockResolvedValue(SHARED);
  mocks.shareRevoke.mockResolvedValue(undefined);
  mocks.shareConfig.mockResolvedValue({ ok: true, data: { shareBaseUrl: 'https://note.lizipro.cn/' } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('buildFolderShareUrl 完整链接拼装', () => {
  it('绝对地址原样返回（后端换域名时不被前端拼错）', () => {
    expect(buildFolderShareUrl('https://note.lizipro.cn', { url: 'https://cdn.example.com/s/f/x' }))
      .toBe('https://cdn.example.com/s/f/x');
  });

  it('相对短链拼上分享域名（去重斜杠）', () => {
    expect(buildFolderShareUrl('https://note.lizipro.cn/', { url: '/s/f/abc' }))
      .toBe('https://note.lizipro.cn/s/f/abc');
    expect(buildFolderShareUrl('https://note.lizipro.cn', { url: '/s/f/abc' }))
      .toBe('https://note.lizipro.cn/s/f/abc');
    // 相对短链没有前导斜杠时补一个，避免拼出 https://hosts/f/abc
    expect(buildFolderShareUrl('https://note.lizipro.cn', { url: 's/f/abc' }))
      .toBe('https://note.lizipro.cn/s/f/abc');
  });

  it('只有 token 时按 /s/f/ 前缀兜底', () => {
    expect(FOLDER_SHARE_URL_PREFIX).toBe('/s/f/');
    expect(buildFolderShareUrl('https://note.lizipro.cn', { token: 'abc' }))
      .toBe('https://note.lizipro.cn/s/f/abc');
  });

  it('没有 url/token 时返回空串', () => {
    expect(buildFolderShareUrl('https://note.lizipro.cn', null)).toBe('');
    expect(buildFolderShareUrl('https://note.lizipro.cn', { url: '', token: '' })).toBe('');
    expect(buildFolderShareUrl('https://note.lizipro.cn', {})).toBe('');
  });

  it('域名缺失时退化成相对短链（总比空链接好）', () => {
    expect(buildFolderShareUrl('', { url: '/s/f/abc' })).toBe('/s/f/abc');
    expect(buildFolderShareUrl(null, { token: 'abc' })).toBe('/s/f/abc');
  });
});

describe('emptyCategoryShareInfo 空状态', () => {
  it('未分享且字段齐全，UI 不用判空', () => {
    expect(emptyCategoryShareInfo()).toEqual({
      shared: false,
      token: null,
      url: null,
      hasPassword: false,
      expiresAt: null,
      includeSubCategories: true,
      docCount: 0,
      created: false,
    });
  });
});

describe('getCategoryShareStatus 状态查询', () => {
  it('把 Rust 返回原样包成 ok', async () => {
    const outcome = await getCategoryShareStatus('2114279859393396737');

    expect(mocks.shareStatus).toHaveBeenCalledWith('2114279859393396737');
    expect(outcome).toEqual({ ok: true, data: SHARED });
  });

  it('雪花 id 按字符串透传（不过 Number，避免精度丢失）', async () => {
    await getCategoryShareStatus(' 2114279859393396737 ');

    expect(mocks.shareStatus).toHaveBeenCalledWith('2114279859393396737');
  });

  it('缺分类 id 时不发 IPC', async () => {
    const outcome = await getCategoryShareStatus('   ');

    expect(outcome.ok).toBe(false);
    expect(mocks.shareStatus).not.toHaveBeenCalled();
  });

  it('未登录（UNAUTHORIZED）归一成 unauthorized 且保留原文', async () => {
    mocks.shareStatus.mockRejectedValue(
      Object.assign(new Error('登录状态已失效，请重新登录 lizi 账号'), { code: 'UNAUTHORIZED' }),
    );

    const outcome = await getCategoryShareStatus('1001');

    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? null : outcome.kind).toBe('unauthorized');
    expect(outcome.ok ? '' : outcome.message).toContain('登录状态已失效');
  });

  it('Web 构建直接返回 unsupported，不发 IPC', async () => {
    mocks.isTauri.value = false;

    const outcome = await getCategoryShareStatus('1001');

    expect(outcome.ok ? null : outcome.kind).toBe('unsupported');
    expect(mocks.shareStatus).not.toHaveBeenCalled();
    mocks.isTauri.value = true;
  });
});

describe('createCategoryShare 创建/重新生成', () => {
  it('透传密码、有效期与含子分类', async () => {
    const outcome = await createCategoryShare('1001', {
      password: 'secret',
      expiresInDays: 30,
      includeSubCategories: false,
    });

    expect(mocks.shareCreate).toHaveBeenCalledWith('1001', {
      password: 'secret',
      expiresInDays: 30,
      includeSubCategories: false,
    });
    expect(outcome.ok).toBe(true);
  });

  it('空 payload = 只换 token（不传 password/expiresInDays，服务端保留原设置）', async () => {
    await createCategoryShare('1001');

    expect(mocks.shareCreate).toHaveBeenCalledWith('1001', {});
  });

  it('配额不足归一成 quota', async () => {
    mocks.shareCreate.mockRejectedValue(
      Object.assign(new Error('云端空间不足'), { code: 'QUOTA_EXCEEDED' }),
    );

    const outcome = await createCategoryShare('1001');

    expect(outcome.ok ? null : outcome.kind).toBe('quota');
  });

  it('分类不存在（NOT_FOUND）归类为 unknown 但保留服务端文案', async () => {
    mocks.shareCreate.mockRejectedValue(
      Object.assign(new Error('分类不存在'), { code: 'NOT_FOUND' }),
    );

    const outcome = await createCategoryShare('1001');

    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? '' : outcome.message).toBe('分类不存在');
  });
});

describe('revokeCategoryShare 撤销', () => {
  it('成功返回 ok', async () => {
    const outcome = await revokeCategoryShare('1001');

    expect(mocks.shareRevoke).toHaveBeenCalledWith('1001');
    expect(outcome).toEqual({ ok: true, data: undefined });
  });

  it('无权限（FORBIDDEN）归一成 forbidden', async () => {
    mocks.shareRevoke.mockRejectedValue(
      Object.assign(new Error('没有权限执行该操作'), { code: 'FORBIDDEN' }),
    );

    const outcome = await revokeCategoryShare('1001');

    expect(outcome.ok ? null : outcome.kind).toBe('forbidden');
  });

  it('Web 构建直接 unsupported', async () => {
    mocks.isTauri.value = false;

    const outcome = await revokeCategoryShare('1001');

    expect(outcome.ok ? null : outcome.kind).toBe('unsupported');
    mocks.isTauri.value = true;
  });
});

describe('resolveFolderShareBaseUrl 分享域名', () => {
  it('优先后端 share config 的 shareBaseUrl（去尾斜杠）', async () => {
    const base = await resolveFolderShareBaseUrl();

    expect(base).toBe('https://note.lizipro.cn');
  });

  it('config 取不到时退回登录服务器地址的同源根', async () => {
    mocks.shareConfig.mockResolvedValue({ ok: false, kind: 'network', message: '网络异常' });
    useCloudSyncStore().baseUrl = 'https://tau.example.com/lizi';

    const base = await resolveFolderShareBaseUrl();

    expect(base).toBe('https://tau.example.com');
  });
});
