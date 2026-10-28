/**
 * @description 文件夹一键分享弹窗：未分享创建表单提交、已分享态展示（链接/文档数/密码状态）、
 * 复制、重新生成（只换 token）、撤销、加载与提交失败文案。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-28
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
  resolveBase: vi.fn(),
  copy: vi.fn(),
}));

vi.mock('@/services/cloudCategoryShareService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudCategoryShareService')>();
  return {
    ...actual,
    getCategoryShareStatus: mocks.status,
    createCategoryShare: mocks.create,
    revokeCategoryShare: mocks.revoke,
    resolveFolderShareBaseUrl: mocks.resolveBase,
  };
});

vi.mock('@/services/cloudShareService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudShareService')>();
  return { ...actual, copyTextToClipboard: mocks.copy };
});

import FolderShareDialog from '@/components/editor/FolderShareDialog.vue';

const UNSHARED = {
  shared: false,
  token: null,
  url: null,
  hasPassword: false,
  expiresAt: null,
  includeSubCategories: true,
  docCount: 0,
  created: false,
};

const SHARED = {
  shared: true,
  token: 'tok1',
  url: '/s/f/tok1',
  hasPassword: true,
  expiresAt: '2026-11-28 00:00:00',
  includeSubCategories: true,
  docCount: 3,
  created: true,
};

const BASE = 'https://note.lizipro.cn';

/** 弹层 Teleport 到 body，统一从 document.body 查。 */
const q = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.body.querySelector(`[data-testid="${id}"]`) as T | null;

async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    await flushPromises();
  }
}

async function setInput(id: string, value: string): Promise<void> {
  const input = q<HTMLInputElement>(id);
  if (!input) {
    throw new Error(`input ${id} not found`);
  }
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await flushPromises();
}

async function toggle(id: string, checked: boolean): Promise<void> {
  const input = q<HTMLInputElement>(id);
  if (!input) {
    throw new Error(`checkbox ${id} not found`);
  }
  input.checked = checked;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await flushPromises();
}

async function click(id: string): Promise<void> {
  const element = q(id);
  if (!element) {
    throw new Error(`element ${id} not found`);
  }
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await settle();
}

const mountDialog = (props: Record<string, unknown> = {}) => mount(FolderShareDialog, {
  props: { visible: true, categoryId: '1001', categoryName: '笔记', ...props },
});

beforeEach(() => {
  setActivePinia(createPinia());
  mocks.status.mockResolvedValue({ ok: true, data: UNSHARED });
  mocks.create.mockResolvedValue({ ok: true, data: SHARED });
  mocks.revoke.mockResolvedValue({ ok: true, data: undefined });
  mocks.resolveBase.mockResolvedValue(BASE);
  mocks.copy.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('FolderShareDialog 未分享：创建表单', () => {
  it('打开后查一次状态，未分享时显示创建表单与主按钮', async () => {
    mountDialog();
    await settle();

    expect(mocks.status).toHaveBeenCalledWith('1001');
    expect(mocks.resolveBase).toHaveBeenCalled();
    expect(q('folder-share-loading')).toBeNull();
    expect(q('folder-share-password')).not.toBeNull();
    expect(q('folder-share-expires')).not.toBeNull();
    expect(q('folder-share-include-sub')).not.toBeNull();
    expect(q('folder-share-create')?.textContent).toContain('一键分享文件夹');
    // 未分享时不出现链接与撤销
    expect(q('folder-share-link')).toBeNull();
    expect(q('folder-share-revoke')).toBeNull();
  });

  it('提交表单：密码/有效期/含子分类按输入透传，成功后切到已分享态并显示完整链接', async () => {
    mountDialog();
    await settle();

    await setInput('folder-share-password', 'secret');
    await setInput('folder-share-expires', '30');
    await toggle('folder-share-include-sub', false);
    await click('folder-share-create');

    expect(mocks.create).toHaveBeenCalledWith('1001', {
      password: 'secret',
      expiresInDays: 30,
      includeSubCategories: false,
    });
    expect(q<HTMLInputElement>('folder-share-link')?.value).toBe(`${BASE}/s/f/tok1`);
    expect(q('folder-share-revoke')).not.toBeNull();
  });

  it('有效期留空 = 永久（传 null），密码留空 = 无密码', async () => {
    mountDialog();
    await settle();

    await click('folder-share-create');

    expect(mocks.create).toHaveBeenCalledWith('1001', {
      password: null,
      expiresInDays: null,
      includeSubCategories: true,
    });
  });

  it('创建失败：显示 folderShareFailed 文案，保持表单', async () => {
    mocks.create.mockResolvedValue({ ok: false, kind: 'quota', message: '云端空间不足' });
    mountDialog();
    await settle();

    await click('folder-share-create');

    expect(q('folder-share-error')?.textContent).toContain('云端空间不足');
    expect(q('folder-share-password')).not.toBeNull();
    expect(q('folder-share-revoke')).toBeNull();
  });

  it('状态加载失败：显示失败文案，不展示表单', async () => {
    mocks.status.mockResolvedValue({ ok: false, kind: 'network', message: '网络异常' });
    mountDialog();
    await settle();

    expect(q('folder-share-error')?.textContent).toContain('网络异常');
    expect(q('folder-share-loading')).toBeNull();
  });

  it('没有分类 id（custom:* / 未分类节点）：不发请求并提示不支持', async () => {
    mountDialog({ categoryId: '' });
    await settle();

    expect(mocks.status).not.toHaveBeenCalled();
    expect(q('folder-share-error')?.textContent).toContain('没有独立分类记录');
  });
});

describe('FolderShareDialog 已分享：链接与操作', () => {
  beforeEach(() => {
    mocks.status.mockResolvedValue({ ok: true, data: SHARED });
  });

  it('展示链接、文档数、密码状态、含子分类与过期时间', async () => {
    mountDialog();
    await settle();

    expect(q<HTMLInputElement>('folder-share-link')?.value).toBe(`${BASE}/s/f/tok1`);
    expect(q('folder-share-docs')?.textContent).toContain('3');
    expect(q('folder-share-password-state')?.textContent).toContain('有密码');
    expect(q('folder-share-include-sub-state')).not.toBeNull();
    expect(q('folder-share-expires-at')?.textContent).toContain('2026-11-28');
    // 已分享态不出现创建表单
    expect(q('folder-share-password')).toBeNull();
  });

  it('复制链接：把完整地址写入剪贴板并提示已复制', async () => {
    mountDialog();
    await settle();

    await click('folder-share-copy');

    expect(mocks.copy).toHaveBeenCalledWith(`${BASE}/s/f/tok1`);
    expect(q('folder-share-copied')).not.toBeNull();
  });

  it('重新生成：发空 payload（只换 token），链接跟着更新', async () => {
    mocks.create.mockResolvedValue({
      ok: true,
      data: { ...SHARED, token: 'tok2', url: '/s/f/tok2', created: false },
    });
    mountDialog();
    await settle();

    await click('folder-share-regenerate');

    expect(mocks.create).toHaveBeenCalledWith('1001', {});
    expect(q<HTMLInputElement>('folder-share-link')?.value).toBe(`${BASE}/s/f/tok2`);
  });

  it('撤销：调用撤销命令后回到未分享态并提示已撤销', async () => {
    mountDialog();
    await settle();

    await click('folder-share-revoke');

    expect(mocks.revoke).toHaveBeenCalledWith('1001');
    expect(q('folder-share-revoked')).not.toBeNull();
    expect(q('folder-share-revoke')).toBeNull();
    expect(q('folder-share-create')).not.toBeNull();
  });

  it('撤销失败：展示后端原因，仍停留在已分享态', async () => {
    mocks.revoke.mockResolvedValue({ ok: false, kind: 'forbidden', message: '没有权限执行该操作' });
    mountDialog();
    await settle();

    await click('folder-share-revoke');

    expect(q('folder-share-error')?.textContent).toContain('没有权限执行该操作');
    expect(q('folder-share-revoke')).not.toBeNull();
  });

  it('无密码的分享显示「无密码」', async () => {
    mocks.status.mockResolvedValue({ ok: true, data: { ...SHARED, hasPassword: false } });
    mountDialog();
    await settle();

    expect(q('folder-share-password-state')?.textContent).toContain('无密码');
  });
});

describe('FolderShareDialog 关闭', () => {
  it('点关闭按钮 emit close', async () => {
    const wrapper = mountDialog();
    await settle();

    await click('folder-share-close-button');

    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
