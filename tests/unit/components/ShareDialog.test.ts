/**
 * @description 一键分享弹窗：自动同步（默认分类）、有效期/密码 payload、链接拼装与复制、撤销、冲突覆盖。
 * 只 mock Rust 命令边界、按路径同步与剪贴板。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 16:35
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  shareConfig: vi.fn(),
  shareStatus: vi.fn(),
  shareCreate: vi.fn(),
  shareRevoke: vi.fn(),
  openExternalLink: vi.fn(),
  syncByPath: vi.fn(),
  readSyncSource: vi.fn(),
  assetsList: vi.fn(),
  inspectAssetSources: vi.fn(),
  binaryUpload: vi.fn(),
  findByPath: vi.fn(),
  fetchStats: vi.fn(),
  clipboardWrite: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauriApp: () => true,
    cloudCommands: {
      ...actual.cloudCommands,
      shareConfig: mocks.shareConfig,
      shareStatus: mocks.shareStatus,
      shareCreate: mocks.shareCreate,
      shareRevoke: mocks.shareRevoke,
      readSyncSource: mocks.readSyncSource,
      assetsList: mocks.assetsList,
      inspectAssetSources: mocks.inspectAssetSources,
      binaryUpload: mocks.binaryUpload,
    },
    appCommands: { ...actual.appCommands, openExternalLink: mocks.openExternalLink },
  };
});

vi.mock('@/services/cloudShareStatsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudShareStatsService')>();
  return { ...actual, fetchShareStats: mocks.fetchStats };
});

vi.mock('@/services/cloudDocService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudDocService')>();
  return { ...actual, findCloudDocByPath: mocks.findByPath };
});

vi.mock('@/services/cloudSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudSyncService')>();
  return { ...actual, syncDocumentByPath: mocks.syncByPath };
});

import ShareDialog from '@/components/editor/ShareDialog.vue';
import { useCloudSyncStore } from '@/stores/cloudSync';
import { useSettingsStore } from '@/stores/settings';
import { useWorkspaceStore } from '@/stores/workspace';

const FILE_PATH = '/ws/notes/a.md';
const SHARE_BASE = 'https://note.lizipro.cn';

function mountDialog() {
  return mount(ShareDialog, {
    props: { visible: true, filePath: FILE_PATH, fileName: 'a.md' },
  });
}

const settle = async () => {
  await flushPromises();
  await flushPromises();
  await flushPromises();
};

describe('ShareDialog 一键分享', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.shareConfig.mockResolvedValue({
      shareBaseUrl: SHARE_BASE,
      defaultCategory: '分享',
      maxExpireDays: 365,
    });
    mocks.shareStatus.mockResolvedValue({ shared: false });
    mocks.shareCreate.mockResolvedValue({
      shareUrl: `${SHARE_BASE}/s/abcdefgh12345678`,
      token: 'abcdefgh12345678',
      createdAt: '2026-10-25T09:00:00Z',
      expiresAt: null,
      hasPassword: false,
      visitCount: 0,
      syncedVersion: 3,
      categoryApplied: '分享',
      appliedDefaultCategory: true,
    });
    mocks.shareRevoke.mockResolvedValue(undefined);
    mocks.openExternalLink.mockResolvedValue(undefined);
    mocks.syncByPath.mockResolvedValue({ status: 'synced', fileId: 42, version: 3 });
    mocks.readSyncSource.mockResolvedValue({ content: 'plain text', contentHash: 'sha256:x', size: 10, modifiedMs: 1 });
    mocks.assetsList.mockResolvedValue([]);
    mocks.inspectAssetSources.mockResolvedValue([]);
    mocks.findByPath.mockResolvedValue({ ok: true, data: null });
    mocks.binaryUpload.mockResolvedValue({ fileId: 77, version: 1, size: 2048 });
    mocks.fetchStats.mockResolvedValue({ ok: true, data: { totalViews: 9, uniqueVisitors: 4, daily: [], recent: [] } });
    mocks.clipboardWrite.mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText: mocks.clipboardWrite } });

    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspacePath = '/ws';
    workspaceStore.currentWorkspaceName = 'ws';

    const cloudSyncStore = useCloudSyncStore();
    cloudSyncStore.signedIn = true;
    cloudSyncStore.baseUrl = 'https://note.lizipro.cn/lizi';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('打开时先自动同步，并把默认「分享」分类带上', async () => {
    const wrapper = mountDialog();
    await settle();

    expect(mocks.shareConfig).toHaveBeenCalled();
    expect(mocks.syncByPath).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: FILE_PATH, category: '分享', overwrite: false }),
    );
    expect(mocks.shareStatus).toHaveBeenCalledWith(42);
    // 未分享 → 展示生成按钮
    expect(wrapper.find('[data-testid="share-dialog-generate"]').exists()).toBe(true);
    // 明确提示「已自动同步」，证明从未同步的文档也能走通分享
    expect(wrapper.get('[data-testid="share-dialog-notice"]').text()).toContain('已自动同步');
  });

  it('显示「图片 N 张，已同步 M 张」，未同步时给出提示但允许分享', async () => {
    mocks.readSyncSource.mockResolvedValue({
      content: ['正文', '', '![a](images/a.png)', '![b](images/b.png)'].join('\n'),
      contentHash: 'sha256:y',
      size: 20,
      modifiedMs: 1,
    });
    mocks.inspectAssetSources.mockResolvedValue([
      { path: '/ws/notes/images/a.png', exists: true, size: 10, contentHash: 'sha256:a', supported: true, reason: null },
      { path: '/ws/notes/images/b.png', exists: true, size: 10, contentHash: 'sha256:b', supported: true, reason: null },
    ]);
    mocks.assetsList.mockResolvedValue([
      { assetId: 1, relPath: 'images/a.png', fileName: 'a.png', mime: 'image/png', size: 10, contentHash: 'sha256:a' },
    ]);

    const wrapper = mountDialog();
    await settle();

    expect(wrapper.get('[data-testid="share-dialog-images-status"]').text()).toContain('图片 2 张，已同步 1 张');
    expect(wrapper.get('[data-testid="share-dialog-images-unsynced"]').text()).toContain('有 1 张图片未同步');
    // 未同步不阻断分享
    expect(wrapper.find('[data-testid="share-dialog-generate"]').exists()).toBe(true);
  });

  it('图片全部已同步时不再提示未同步', async () => {
    mocks.readSyncSource.mockResolvedValue({
      content: '![a](images/a.png)',
      contentHash: 'sha256:y',
      size: 20,
      modifiedMs: 1,
    });
    mocks.inspectAssetSources.mockResolvedValue([
      { path: '/ws/notes/images/a.png', exists: true, size: 10, contentHash: 'sha256:a', supported: true, reason: null },
    ]);
    mocks.assetsList.mockResolvedValue([
      { assetId: 1, relPath: 'images/a.png', fileName: 'a.png', mime: 'image/png', size: 10, contentHash: 'sha256:a' },
    ]);
    const wrapper = mountDialog();
    await settle();

    expect(wrapper.get('[data-testid="share-dialog-images-status"]').text()).toContain('已同步 1 张');
    expect(wrapper.find('[data-testid="share-dialog-images-unsynced"]').exists()).toBe(false);
  });

  it('「同步文档内图片」关闭时提示图片不会同步', async () => {
    useSettingsStore().syncDocumentImages = false;
    mocks.readSyncSource.mockResolvedValue({
      content: '![a](images/a.png)',
      contentHash: 'sha256:y',
      size: 20,
      modifiedMs: 1,
    });
    const wrapper = mountDialog();
    await settle();

    expect(wrapper.find('[data-testid="share-dialog-images-disabled"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="share-dialog-images-unsynced"]').exists()).toBe(false);
  });

  it('二进制文档：分享前自动上传、显示类型与「仅在线预览」，不显示图片统计', async () => {
    const wrapper = mount(ShareDialog, {
      props: { visible: true, filePath: '/ws/docs/report.pdf', fileName: 'report.pdf' },
    });
    await settle();

    expect(mocks.binaryUpload).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'tau/ws/docs/report.pdf', localPath: '/ws/docs/report.pdf' }),
    );
    expect(mocks.shareStatus).toHaveBeenCalledWith(77);
    expect(wrapper.find('[data-testid="share-dialog-binary-info"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="share-dialog-binary-preview"]').text()).toContain('仅在线预览');
    expect(wrapper.find('[data-testid="share-dialog-images-status"]').exists()).toBe(false);
    // 不跑文本同步
    expect(mocks.syncByPath).not.toHaveBeenCalled();
  });

  it('二进制文档已上传过则复用 fileId，不重复上传', async () => {
    mocks.findByPath.mockResolvedValue({
      ok: true,
      data: { fileId: 42, version: 5, size: 4096, path: 'tau/ws/docs/report.pdf' },
    });
    const wrapper = mount(ShareDialog, {
      props: { visible: true, filePath: '/ws/docs/report.pdf', fileName: 'report.pdf' },
    });
    await settle();

    expect(mocks.binaryUpload).not.toHaveBeenCalled();
    expect(mocks.shareStatus).toHaveBeenCalledWith(42);
    expect(wrapper.get('[data-testid="share-dialog-notice"]').text()).toContain('直接复用');
  });

  it('二进制上传 409 时给出「暂不支持覆盖」提示', async () => {
    mocks.binaryUpload.mockRejectedValue(Object.assign(new Error('文档已存在'), { code: 'CONFLICT' }));
    const wrapper = mount(ShareDialog, {
      props: { visible: true, filePath: '/ws/docs/report.docx', fileName: 'report.docx' },
    });
    await settle();

    expect(wrapper.get('[data-testid="share-dialog-error"]').text()).toContain('暂不支持覆盖');
  });

  it('生成链接：永久=null、无密码，链接用 shareBaseUrl + /s/token 并自动复制', async () => {
    const wrapper = mountDialog();
    await settle();

    await wrapper.get('[data-testid="share-dialog-generate"]').trigger('click');
    await settle();

    expect(mocks.shareCreate).toHaveBeenCalledWith(42, {
      regenerate: false,
      expiresInDays: null,
      password: null,
      clearPassword: null,
    });
    const urlInput = wrapper.get('[data-testid="share-dialog-url"]').element as HTMLInputElement;
    expect(urlInput.value).toBe(`${SHARE_BASE}/s/abcdefgh12345678`);
    expect(mocks.clipboardWrite).toHaveBeenCalledWith(`${SHARE_BASE}/s/abcdefgh12345678`);
    expect(wrapper.get('[data-testid="share-dialog-notice"]').text()).toContain('已复制');
  });

  it('自定义有效期与访问密码进入 payload', async () => {
    const wrapper = mountDialog();
    await settle();

    await wrapper.get('[data-testid="share-dialog-expiry-custom-chip"]').trigger('click');
    const custom = wrapper.get('[data-testid="share-dialog-expiry-custom"]');
    await custom.setValue('45');
    await wrapper.get('[data-testid="share-dialog-password-toggle"]').setValue(true);
    await wrapper.get('[data-testid="share-dialog-password"]').setValue(' 1234 ');
    await wrapper.get('[data-testid="share-dialog-generate"]').trigger('click');
    await settle();

    expect(mocks.shareCreate).toHaveBeenCalledWith(42, {
      regenerate: false,
      expiresInDays: 45,
      password: '1234',
      clearPassword: null,
    });
  });

  it('已分享过时直接展示链接与访问次数', async () => {
    mocks.shareStatus.mockResolvedValue({
      shared: true,
      shareUrl: `${SHARE_BASE}/s/tok123456789012`,
      token: 'tok123456789012',
      createdAt: '2026-10-20T09:00:00Z',
      expiresAt: null,
      hasPassword: true,
      visitCount: 12,
    });
    const wrapper = mountDialog();
    await settle();

    expect(wrapper.find('[data-testid="share-dialog-generate"]').exists()).toBe(false);
    const urlInput = wrapper.get('[data-testid="share-dialog-url"]').element as HTMLInputElement;
    expect(urlInput.value).toBe(`${SHARE_BASE}/s/tok123456789012`);
    expect(wrapper.get('[data-testid="share-dialog-visits"]').text()).toBe('12');
  });

  it('重新生成带 regenerate=true，撤销后回到未分享态并提示旧链接失效', async () => {
    mocks.shareStatus.mockResolvedValue({
      shared: true,
      token: 'tok123456789012',
      visitCount: 3,
    });
    const wrapper = mountDialog();
    await settle();
    await wrapper.get('[data-testid="share-dialog-regenerate"]').trigger('click');
    await settle();
    expect(mocks.shareCreate).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ regenerate: true }),
    );

    await wrapper.get('[data-testid="share-dialog-revoke"]').trigger('click');
    await settle();
    expect(mocks.shareRevoke).toHaveBeenCalledWith(42);
    expect(wrapper.get('[data-testid="share-dialog-notice"]').text()).toContain('旧链接已失效');
    expect(wrapper.find('[data-testid="share-dialog-generate"]').exists()).toBe(true);
  });

  it('同步冲突时先确认覆盖，确认后用 overwrite=true 重试', async () => {
    mocks.syncByPath
      .mockResolvedValueOnce({ status: 'conflict', message: '云端内容不同' })
      .mockResolvedValueOnce({ status: 'synced', fileId: 42, version: 4 });
    const wrapper = mountDialog();
    await settle();

    expect(wrapper.find('[data-testid="share-dialog-conflict"]').exists()).toBe(true);
    await wrapper.get('[data-testid="share-dialog-overwrite"]').trigger('click');
    await settle();

    expect(mocks.syncByPath).toHaveBeenLastCalledWith(
      expect.objectContaining({ overwrite: true }),
    );
    expect(wrapper.find('[data-testid="share-dialog-generate"]').exists()).toBe(true);
  });

  it('分享域名未配置时提示且不复制链接', async () => {
    mocks.shareConfig.mockResolvedValue({
      shareBaseUrl: '',
      defaultCategory: '分享',
      maxExpireDays: 365,
    });
    mocks.shareCreate.mockResolvedValue({
      shareUrl: '',
      token: 'tok123456789012',
      createdAt: '2026-10-25T09:00:00Z',
      expiresAt: null,
      hasPassword: false,
      visitCount: 0,
      syncedVersion: 3,
      categoryApplied: null,
      appliedDefaultCategory: null,
    });
    const cloudSyncStore = useCloudSyncStore();
    cloudSyncStore.baseUrl = '';

    const wrapper = mountDialog();
    await settle();

    expect(wrapper.find('[data-testid="share-dialog-base-missing"]').exists()).toBe(true);
    await wrapper.get('[data-testid="share-dialog-generate"]').trigger('click');
    await settle();

    expect(mocks.clipboardWrite).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="share-dialog-notice"]').text()).toContain('分享域名未配置');
  });

  it('生成失败时展示可读错误', async () => {
    mocks.shareCreate.mockRejectedValue(
      Object.assign(new Error('没有权限分享该文档'), { code: 'FORBIDDEN' }),
    );
    const wrapper = mountDialog();
    await settle();

    await wrapper.get('[data-testid="share-dialog-generate"]').trigger('click');
    await settle();

    expect(wrapper.get('[data-testid="share-dialog-error"]').text()).toContain('没有权限分享该文档');
  });
});

describe('ShareDialog 分享统计（0.6.24）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useWorkspaceStore().currentWorkspacePath = '/ws';
    useWorkspaceStore().currentWorkspaceName = 'ws';
    useSettingsStore().syncDocumentImages = true;
    useCloudSyncStore().signedIn = true;
    mocks.shareConfig.mockResolvedValue({
      shareBaseUrl: SHARE_BASE,
      defaultCategory: '分享',
      maxExpireDays: 365,
    });
    mocks.syncByPath.mockResolvedValue({ status: 'synced', fileId: 42, version: 3 });
    mocks.readSyncSource.mockResolvedValue({ content: '正文', contentHash: 'sha256:x', size: 10, modifiedMs: 1 });
    mocks.assetsList.mockResolvedValue([]);
    mocks.inspectAssetSources.mockResolvedValue([]);
    mocks.shareStatus.mockResolvedValue({ ok: true, data: { shared: false } });
    mocks.shareCreate.mockResolvedValue({ token: 'abcdefgh12345678' });
    mocks.fetchStats.mockResolvedValue({ ok: true, data: { totalViews: 9, uniqueVisitors: 4, daily: [], recent: [] } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('已分享时展示「查看 N 次 · 独立访客 M」并可打开统计弹窗', async () => {
    const wrapper = mount(ShareDialog, {
      props: { visible: true, filePath: '/ws/notes/a.md', fileName: 'a.md' },
    });
    await settle();
    await wrapper.get('[data-testid="share-dialog-generate"]').trigger('click');
    await settle();

    const line = wrapper.get('[data-testid="share-dialog-stats-line"]');
    expect(line.text()).toContain('9');
    expect(line.text()).toContain('4');

    await wrapper.get('[data-testid="share-dialog-stats-btn"]').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('open-stats')?.[0]?.[0]).toMatchObject({ fileName: 'a.md' });
  });

  it('统计拉取失败不阻塞分享主流程（不展示统计行）', async () => {
    mocks.fetchStats.mockResolvedValue({ ok: false, kind: 'network', message: '连不上' });

    const wrapper = mount(ShareDialog, {
      props: { visible: true, filePath: '/ws/notes/a.md', fileName: 'a.md' },
    });
    await settle();
    await wrapper.get('[data-testid="share-dialog-generate"]').trigger('click');
    await settle();

    expect(wrapper.find('[data-testid="share-dialog-stats"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="share-dialog-url"]').exists()).toBe(true);
  });
});

describe('ShareDialog 重新生成的密码语义（0.6.25）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useWorkspaceStore().currentWorkspacePath = '/ws';
    useWorkspaceStore().currentWorkspaceName = 'ws';
    useSettingsStore().syncDocumentImages = true;
    useCloudSyncStore().signedIn = true;
    mocks.shareConfig.mockResolvedValue({ shareBaseUrl: SHARE_BASE, defaultCategory: '分享', maxExpireDays: 365 });
    mocks.syncByPath.mockResolvedValue({ status: 'synced', fileId: 42, version: 3 });
    mocks.readSyncSource.mockResolvedValue({ content: '正文', contentHash: 'sha256:x', size: 10, modifiedMs: 1 });
    mocks.assetsList.mockResolvedValue([]);
    mocks.inspectAssetSources.mockResolvedValue([]);
    mocks.shareStatus.mockResolvedValue({ shared: true, token: 'abcdefgh12345678', hasPassword: true });
    mocks.shareCreate.mockResolvedValue({ token: 'newtoken12345678' });
    mocks.fetchStats.mockResolvedValue({ ok: true, data: { totalViews: 0, uniqueVisitors: 0, daily: [], recent: [] } });
  });
  afterEach(() => vi.clearAllMocks());

  it('重新生成且未改密码：password 为 null（表示不修改）且不带 clearPassword', async () => {
    const wrapper = mountDialog();
    await settle();

    await wrapper.get('[data-testid="share-dialog-regenerate"]').trigger('click');
    await settle();

    const payload = mocks.shareCreate.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(mocks.shareCreate.mock.calls.at(-1)?.[0]).toBe(42);
    expect(payload.regenerate).toBe(true);
    expect(payload.password ?? null).toBeNull();
    expect(payload.clearPassword ?? null).toBeNull();
  });

  it('勾选「移除密码」时传 clearPassword: true（不是 password: null）', async () => {
    const wrapper = mountDialog();
    await settle();

    const checkbox = wrapper.get('[data-testid="share-dialog-clear-password"]');
    await checkbox.setValue(true);
    await wrapper.get('[data-testid="share-dialog-regenerate"]').trigger('click');
    await settle();

    const payload = mocks.shareCreate.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(payload.clearPassword).toBe(true);
    expect(payload.password ?? null).toBeNull();
  });
});
