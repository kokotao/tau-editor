/**
 * @description 接收分享弹窗测试：剪贴板识别、公开预览、密码解锁、转存与关闭。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-11-06 16:20
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const mocks = vi.hoisted(() => ({
  readClipboardText: vi.fn(),
  sharePublicRead: vi.fn(),
  sharePublicVerify: vi.fn(),
  shareImport: vi.fn(),
  openExternalLink: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauriApp: () => true,
    appCommands: {
      ...actual.appCommands,
      readClipboardText: mocks.readClipboardText,
      openExternalLink: mocks.openExternalLink,
    },
    cloudCommands: {
      ...actual.cloudCommands,
      sharePublicRead: mocks.sharePublicRead,
      sharePublicVerify: mocks.sharePublicVerify,
      shareImport: mocks.shareImport,
    },
  };
});

vi.mock('@/services/markdownRenderService', () => ({
  renderMarkdown: (raw: string) => `<p>${raw}</p>`,
}));

import ShareReceiveDialog from '@/components/editor/ShareReceiveDialog.vue';

const SHARE_URL = 'https://note.lizipro.cn/s/AbCd_123-xyz';

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

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(ShareReceiveDialog, {
    props: { visible: true, ...props },
    global: { stubs: { Teleport: true } },
  });
}

const settle = async () => {
  await flushPromises();
  await flushPromises();
  await flushPromises();
};

describe('ShareReceiveDialog', () => {
  beforeEach(() => {
    mocks.readClipboardText.mockResolvedValue(`看看这个 ${SHARE_URL} 。`);
    mocks.sharePublicRead.mockResolvedValue(shareInfo());
    mocks.sharePublicVerify.mockResolvedValue(shareInfo());
    mocks.shareImport.mockResolvedValue({
      fileId: 99,
      version: 1,
      contentHash: 'sha256:abc',
      size: 10,
      path: 'tau/导入/方案.md',
      fileName: '方案.md',
      assetsTotal: 0,
      assetsCopied: 0,
      assetsFailed: 0,
    });
    mocks.openExternalLink.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('打开时自动读取剪贴板并展示 Markdown 预览', async () => {
    const wrapper = mountDialog();
    await settle();

    expect(mocks.readClipboardText).toHaveBeenCalledTimes(1);
    expect(mocks.sharePublicRead).toHaveBeenCalledWith('AbCd_123-xyz');
    expect(wrapper.get('[data-testid="share-receive-link"]').element).toHaveProperty('value', SHARE_URL);
    expect(wrapper.get('[data-testid="share-receive-preview"]').text()).toContain('方案');
    expect(wrapper.find('[data-testid="share-receive-markdown"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="share-receive-add"]').exists()).toBe(true);
  });

  it('initialUrl 直接预览，不读取剪贴板', async () => {
    const wrapper = mountDialog({ initialUrl: SHARE_URL });
    await settle();

    expect(mocks.readClipboardText).not.toHaveBeenCalled();
    expect(mocks.sharePublicRead).toHaveBeenCalledWith('AbCd_123-xyz');
    expect(wrapper.find('[data-testid="share-receive-preview"]').exists()).toBe(true);
  });

  it('密码分享先显示解锁表单，校验后展示正文', async () => {
    mocks.sharePublicRead.mockResolvedValue(shareInfo({
      passwordRequired: true,
      content: null,
    }));
    mocks.sharePublicVerify.mockResolvedValue(shareInfo());

    const wrapper = mountDialog({ initialUrl: SHARE_URL });
    await settle();

    expect(wrapper.find('[data-testid="share-receive-password-form"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="share-receive-add"]').exists()).toBe(false);

    await wrapper.get('[data-testid="share-receive-password"]').setValue('secret');
    await wrapper.get('[data-testid="share-receive-verify"]').trigger('submit');
    await settle();

    expect(mocks.sharePublicVerify).toHaveBeenCalledWith('AbCd_123-xyz', 'secret');
    expect(wrapper.find('[data-testid="share-receive-password-form"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="share-receive-markdown"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="share-receive-notice"]').text()).toContain('已解锁');

    await wrapper.get('[data-testid="share-receive-add"]').trigger('click');
    await settle();

    expect(mocks.shareImport).toHaveBeenCalledWith(expect.objectContaining({
      token: 'AbCd_123-xyz',
      password: 'secret',
    }));
  });

  it('点击添加到云端后发出 imported 事件并展示目标路径', async () => {
    const wrapper = mountDialog({ initialUrl: SHARE_URL });
    await settle();

    await wrapper.get('[data-testid="share-receive-add"]').trigger('click');
    await settle();

    expect(mocks.shareImport).toHaveBeenCalledWith(expect.objectContaining({
      token: 'AbCd_123-xyz',
      path: 'tau/导入/方案.md',
      title: '方案',
    }));
    expect(wrapper.get('[data-testid="share-receive-notice"]').text()).toContain('tau/导入/方案.md');
    expect(wrapper.emitted('imported')?.[0]?.[0]).toEqual({
      fileId: 99,
      cloudPath: 'tau/导入/方案.md',
    });
  });

  it('未登录仍可预览，点击添加时请求登录且不调用转存', async () => {
    const wrapper = mountDialog({ initialUrl: SHARE_URL, signedIn: false });
    await settle();

    expect(wrapper.find('[data-testid="share-receive-preview"]').exists()).toBe(true);
    await wrapper.get('[data-testid="share-receive-add"]').trigger('click');
    await settle();

    expect(wrapper.emitted('login-request')?.[0]?.[0]).toEqual({ url: SHARE_URL });
    expect(mocks.shareImport).not.toHaveBeenCalled();
    expect(wrapper.emitted('imported')).toBeUndefined();
  });

  it('转存失败时展示可读提示，不发出 imported', async () => {
    mocks.shareImport.mockRejectedValue(Object.assign(new Error('空间不足'), { code: 'QUOTA_EXCEEDED' }));
    const wrapper = mountDialog({ initialUrl: SHARE_URL });
    await settle();

    await wrapper.get('[data-testid="share-receive-add"]').trigger('click');
    await settle();

    expect(wrapper.get('[data-testid="share-receive-error"]').text()).toContain('空间不足');
    expect(wrapper.emitted('imported')).toBeUndefined();
  });

  it('关闭按钮发出 close，忙碌时忽略关闭', async () => {
    const wrapper = mountDialog({ initialUrl: SHARE_URL });
    await settle();

    await wrapper.get('[data-testid="share-receive-close"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
