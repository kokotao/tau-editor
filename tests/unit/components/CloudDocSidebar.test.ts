/**
 * @description 左侧边栏「云端文档」面板：激活才懒加载、登录态门禁、展开目录、点文件打开、外部刷新信号。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 16:45
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const cloudMocks = vi.hoisted(() => ({
  isTauri: { value: true },
  list: vi.fn(),
  get: vi.fn(),
  openTarget: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauriApp: () => cloudMocks.isTauri.value,
    cloudCommands: {
      ...actual.cloudCommands,
      list: cloudMocks.list,
      get: cloudMocks.get,
      openTarget: cloudMocks.openTarget,
    },
    fileCommands: { ...actual.fileCommands, writeFile: cloudMocks.writeFile },
  };
});

import CloudDocSidebar from '@/components/editor/CloudDocSidebar.vue';
import { useCloudSyncStore } from '@/stores/cloudSync';
import { useWorkspaceStore } from '@/stores/workspace';

const DOC = {
  fileId: 7,
  path: 'tau/ws/notes/a.md',
  title: 'a.md',
  contentHash: 'sha256:remote',
  size: 20,
  version: 2,
  category: null,
  categoryId: null,
  tags: null,
  visibility: 'PRIVATE',
  publishedArticleId: null,
  updatedAt: '2026-10-25T09:00:00Z',
};

describe('CloudDocSidebar 云端文档面板', () => {
  let pinia: ReturnType<typeof createPinia>;

  const mountSidebar = (props: Record<string, unknown> = {}) =>
    mount(CloudDocSidebar, { props: { active: true, ...props }, global: { plugins: [pinia] } });

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    cloudMocks.isTauri.value = true;
    cloudMocks.list.mockResolvedValue({ records: [DOC], total: 1, page: 1, size: 100 });
    cloudMocks.get.mockResolvedValue({ ...DOC, content: 'cloud content', createdAt: null });
    cloudMocks.openTarget.mockResolvedValue({
      cloudPath: 'tau/ws/notes/a.md',
      relativePath: 'notes/a.md',
      absolutePath: '/ws/notes/a.md',
      exists: true,
      sameContent: true,
      openable: true,
      action: 'openExisting',
      reasonCode: null,
      reason: null,
    });
    cloudMocks.writeFile.mockResolvedValue(undefined);

    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspacePath = '/ws';
    workspaceStore.currentWorkspaceName = 'ws';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('未激活时不渲染、不发请求（懒加载）', async () => {
    useCloudSyncStore().signedIn = true;
    const wrapper = mountSidebar({ active: false });
    await flushPromises();

    expect(wrapper.find('[data-testid="cloud-doc-sidebar"]').exists()).toBe(false);
    expect(cloudMocks.list).not.toHaveBeenCalled();
  });

  it('激活后自动拉取并渲染目录与文件节点', async () => {
    useCloudSyncStore().signedIn = true;
    const wrapper = mountSidebar();
    await flushPromises();
    await flushPromises();

    expect(cloudMocks.list).toHaveBeenCalledWith({ keyword: null, page: 1, size: 100 });
    expect(wrapper.get('[data-testid="cloud-doc-sidebar"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="cloud-browser-dir"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-testid="cloud-browser-file"]')).toHaveLength(1);
  });

  it('未登录时只给登录入口、不发请求', async () => {
    const wrapper = mountSidebar();
    await flushPromises();

    expect(wrapper.find('[data-testid="cloud-doc-sidebar-signin-hint"]').exists()).toBe(true);
    expect(cloudMocks.list).not.toHaveBeenCalled();

    await wrapper.get('[data-testid="cloud-doc-sidebar-login"]').trigger('click');
    expect(wrapper.emitted('login-request')).toHaveLength(1);
  });

  it('点击文件走与面板相同的打开流程（已同步直接开）', async () => {
    useCloudSyncStore().signedIn = true;
    const wrapper = mountSidebar();
    await flushPromises();
    await flushPromises();

    await wrapper.get('[data-testid="cloud-browser-open"]').trigger('click');
    await flushPromises();

    expect(cloudMocks.openTarget).toHaveBeenCalledWith({
      workspaceRoot: '/ws',
      workspaceName: 'ws',
      cloudPath: 'tau/ws/notes/a.md',
      remoteHash: 'sha256:remote',
    });
    expect(wrapper.emitted('open-file')?.[0]).toEqual(['/ws/notes/a.md']);
    expect(cloudMocks.writeFile).not.toHaveBeenCalled();
  });

  it('落盘打开时写入本地并通知上层刷新工作区文件树', async () => {
    useCloudSyncStore().signedIn = true;
    cloudMocks.openTarget.mockResolvedValue({
      cloudPath: 'tau/ws/notes/a.md',
      relativePath: 'notes/a.md',
      absolutePath: '/ws/notes/a.md',
      exists: false,
      sameContent: false,
      openable: true,
      action: 'writeAndOpen',
      reasonCode: null,
      reason: null,
    });
    const wrapper = mountSidebar();
    await flushPromises();
    await flushPromises();

    await wrapper.get('[data-testid="cloud-browser-open"]').trigger('click');
    await flushPromises();

    expect(cloudMocks.writeFile).toHaveBeenCalledWith('/ws/notes/a.md', 'cloud content');
    expect(wrapper.emitted('open-file')?.[0]).toEqual(['/ws/notes/a.md']);
    expect(wrapper.emitted('cloud-file-saved')).toHaveLength(1);
  });

  it('刷新按钮与外部 refreshToken 都会重新拉取', async () => {
    useCloudSyncStore().signedIn = true;
    const wrapper = mountSidebar();
    await flushPromises();
    await flushPromises();
    expect(cloudMocks.list).toHaveBeenCalledTimes(1);

    await wrapper.get('[data-testid="cloud-doc-sidebar-refresh"]').trigger('click');
    await flushPromises();
    expect(cloudMocks.list).toHaveBeenCalledTimes(2);

    await wrapper.setProps({ refreshToken: 1 });
    await flushPromises();
    expect(cloudMocks.list).toHaveBeenCalledTimes(3);
  });

  it('登出后清空并回到登录提示', async () => {
    const cloudSyncStore = useCloudSyncStore();
    cloudSyncStore.signedIn = true;
    const wrapper = mountSidebar();
    await flushPromises();
    await flushPromises();
    expect(wrapper.findAll('[data-testid="cloud-browser-file"]')).toHaveLength(1);

    cloudSyncStore.signedIn = false;
    await flushPromises();

    expect(wrapper.find('[data-testid="cloud-browser-tree"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="cloud-doc-sidebar-signin-hint"]').exists()).toBe(true);
  });

  it('空态给出诊断信息并透出配额接口错误', async () => {
    const cloudSyncStore = useCloudSyncStore();
    cloudSyncStore.signedIn = true;
    cloudSyncStore.spaceError = { kind: 'unauthorized', message: '登录状态已失效' };
    cloudMocks.list.mockResolvedValue({ records: [], total: 0, page: 1, size: 100 });

    const wrapper = mountSidebar();
    await flushPromises();
    await flushPromises();

    expect(wrapper.get('[data-testid="cloud-doc-sidebar-empty-diagnostic"]').text()).toContain('total=0');
    const meError = wrapper.get('[data-testid="cloud-doc-sidebar-me-error"]').text();
    expect(meError).toContain('unauthorized');
    expect(meError).toContain('登录状态已失效');
  });

  it('接口失败时给出错误态与重试入口', async () => {
    useCloudSyncStore().signedIn = true;
    cloudMocks.list.mockRejectedValue(Object.assign(new Error('连不上服务器'), { code: 'NETWORK_ERROR' }));
    const wrapper = mountSidebar();
    await flushPromises();
    await flushPromises();

    expect(wrapper.find('[data-testid="cloud-doc-sidebar-error"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="cloud-doc-sidebar-error"]').text()).toContain('连不上服务器');
    expect(wrapper.find('[data-testid="cloud-doc-sidebar-retry"]').exists()).toBe(true);
  });
});
