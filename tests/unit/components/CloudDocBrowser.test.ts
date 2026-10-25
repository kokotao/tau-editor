/**
 * @description 云端文档浏览器面板：打开流程（已同步直接开 / 内容不同先确认 / 二进制拒绝）与空/错误态。
 * 只 mock Rust 命令边界（list/get/open_target/write_file）与另存为对话框。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 14:50
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
  saveDialog: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: cloudMocks.saveDialog,
}));

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
    fileCommands: {
      ...actual.fileCommands,
      writeFile: cloudMocks.writeFile,
    },
  };
});

import CloudDocBrowser from '@/components/editor/CloudDocBrowser.vue';
import { useCloudSyncStore } from '@/stores/cloudSync';
import { useWorkspaceStore } from '@/stores/workspace';

const DOC = {
  fileId: 42,
  path: 'tau/ws/notes/a.md',
  title: 'a.md',
  contentHash: 'sha256:remote',
  size: 20,
  version: 3,
  category: null,
  categoryId: null,
  tags: null,
  visibility: 'PRIVATE',
  publishedArticleId: null,
  updatedAt: '2026-10-25T09:00:00Z',
};

const TARGET_BASE = {
  cloudPath: 'tau/ws/notes/a.md',
  relativePath: 'notes/a.md',
  absolutePath: '/ws/notes/a.md',
  exists: false,
  sameContent: false,
  openable: true,
  reasonCode: null,
  reason: null,
};

describe('CloudDocBrowser 打开云端文档', () => {
  let pinia: ReturnType<typeof createPinia>;

  const mountBrowser = () => mount(CloudDocBrowser, { global: { plugins: [pinia] } });

  const openFirstFile = async (wrapper: ReturnType<typeof mountBrowser>) => {
    const buttons = wrapper.findAll('[data-testid="cloud-browser-open"]');
    expect(buttons.length).toBeGreaterThan(0);
    await buttons[0]!.trigger('click');
    await flushPromises();
  };

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    cloudMocks.isTauri.value = true;
    cloudMocks.list.mockResolvedValue({ records: [DOC], total: 1, page: 1, size: 100 });
    cloudMocks.get.mockResolvedValue({ ...DOC, content: 'cloud content', createdAt: null });
    cloudMocks.openTarget.mockResolvedValue({ ...TARGET_BASE, action: 'writeAndOpen' });
    cloudMocks.writeFile.mockResolvedValue(undefined);
    cloudMocks.saveDialog.mockResolvedValue(null);

    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspacePath = '/ws';
    workspaceStore.currentWorkspaceName = 'ws';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('挂载后拉取并渲染树与文件元信息', async () => {
    const wrapper = mountBrowser();
    await flushPromises();
    await flushPromises();

    expect(cloudMocks.list).toHaveBeenCalledWith({ keyword: null, page: 1, size: 100 });
    expect(wrapper.find('[data-testid="cloud-browser-tree"]').exists()).toBe(true);
    // 显示层按「分类 → 文件」分组，无分类的文档归入「未分类」
    expect(wrapper.findAll('[data-testid="cloud-browser-dir"]').length).toBe(1);
    expect(wrapper.get('[data-testid="cloud-browser-dir"]').text()).toContain('未分类');
    const fileRow = wrapper.get('[data-testid="cloud-browser-file"]');
    expect(fileRow.text()).toContain('a.md');
    expect(fileRow.text()).toContain('20 B');
    expect(fileRow.text()).toContain('v3');
  });

  it('已同步（哈希一致）时直接打开对应标签，不再拉内容', async () => {
    cloudMocks.openTarget.mockResolvedValue({
      ...TARGET_BASE,
      exists: true,
      sameContent: true,
      action: 'openExisting',
    });
    const wrapper = mountBrowser();
    await flushPromises();
    await flushPromises();

    await openFirstFile(wrapper);

    expect(cloudMocks.openTarget).toHaveBeenCalledWith({
      workspaceRoot: '/ws',
      workspaceName: 'ws',
      cloudPath: 'tau/ws/notes/a.md',
      remoteHash: 'sha256:remote',
    });
    expect(wrapper.emitted('open-file')?.[0]).toEqual(['/ws/notes/a.md']);
    expect(cloudMocks.get).not.toHaveBeenCalled();
    expect(cloudMocks.writeFile).not.toHaveBeenCalled();
  });

  it('本地内容不同时先弹确认；选覆盖后写盘并打开', async () => {
    cloudMocks.openTarget.mockResolvedValue({
      ...TARGET_BASE,
      exists: true,
      sameContent: false,
      action: 'confirmOverwrite',
    });
    const wrapper = mountBrowser();
    await flushPromises();
    await flushPromises();

    await openFirstFile(wrapper);

    expect(wrapper.find('[data-testid="cloud-browser-confirm"]').exists()).toBe(true);
    expect(cloudMocks.get).not.toHaveBeenCalled();
    expect(cloudMocks.writeFile).not.toHaveBeenCalled();
    expect(wrapper.emitted('open-file')).toBeUndefined();

    await wrapper.get('[data-testid="cloud-browser-confirm-overwrite"]').trigger('click');
    await flushPromises();

    expect(cloudMocks.get).toHaveBeenCalledWith(42);
    expect(cloudMocks.writeFile).toHaveBeenCalledWith('/ws/notes/a.md', 'cloud content');
    expect(wrapper.emitted('open-file')?.[0]).toEqual(['/ws/notes/a.md']);
    expect(wrapper.find('[data-testid="cloud-browser-confirm"]').exists()).toBe(false);
  });

  it('确认框选取消：不写盘、不打开，并给出可读提示', async () => {
    cloudMocks.openTarget.mockResolvedValue({
      ...TARGET_BASE,
      exists: true,
      sameContent: false,
      action: 'confirmOverwrite',
    });
    const wrapper = mountBrowser();
    await flushPromises();
    await flushPromises();

    await openFirstFile(wrapper);
    await wrapper.get('[data-testid="cloud-browser-confirm-cancel"]').trigger('click');
    await flushPromises();

    expect(cloudMocks.writeFile).not.toHaveBeenCalled();
    expect(wrapper.emitted('open-file')).toBeUndefined();
    expect(wrapper.get('[data-testid="cloud-browser-notice"]').text()).toContain('已取消');
  });

  it('确认框选另存为：写到用户选择的路径再打开', async () => {
    cloudMocks.openTarget.mockResolvedValue({
      ...TARGET_BASE,
      exists: true,
      sameContent: false,
      action: 'confirmOverwrite',
    });
    cloudMocks.saveDialog.mockResolvedValue('/tmp/copy.md');
    const wrapper = mountBrowser();
    await flushPromises();
    await flushPromises();

    await openFirstFile(wrapper);
    await wrapper.get('[data-testid="cloud-browser-confirm-saveas"]').trigger('click');
    await flushPromises();

    expect(cloudMocks.saveDialog).toHaveBeenCalled();
    expect(cloudMocks.writeFile).toHaveBeenCalledWith('/tmp/copy.md', 'cloud content');
    expect(wrapper.emitted('open-file')?.[0]).toEqual(['/tmp/copy.md']);
    // 落盘后要通知上层刷新工作区文件树
    expect(wrapper.emitted('cloud-file-saved')).toHaveLength(1);
  });

  it('空态给出诊断信息（total / 实拉条数 / 页数），并透出配额接口错误', async () => {
    cloudMocks.list.mockResolvedValue({ records: [], total: 0, page: 1, size: 100 });
    const wrapper = mountBrowser();
    await flushPromises();
    await flushPromises();

    const diagnostic = wrapper.get('[data-testid="cloud-browser-empty-diagnostic"]').text();
    expect(diagnostic).toContain('total=0');
    expect(diagnostic).toContain('0 条');

    useCloudSyncStore().spaceError = {
      kind: 'network',
      message: '获取云空间信息失败：无法连接服务器',
    };
    await flushPromises();
    const meError = wrapper.get('[data-testid="cloud-browser-me-error"]').text();
    expect(meError).toContain('network');
    expect(meError).toContain('无法连接服务器');
  });

  it('二进制/非白名单扩展名拒绝：不写盘并给出原因', async () => {
    cloudMocks.openTarget.mockResolvedValue({
      ...TARGET_BASE,
      openable: false,
      action: 'rejected',
      reasonCode: 'BINARY_FILE',
      reason: '该云端文档不是白名单内的文本文件，暂不支持在 Tau 中打开',
    });
    const wrapper = mountBrowser();
    await flushPromises();
    await flushPromises();

    await openFirstFile(wrapper);

    expect(wrapper.emitted('open-file')).toBeUndefined();
    expect(cloudMocks.writeFile).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="cloud-browser-notice"]').text())
      .toContain('白名单内的文本文件');
  });

  it('超限结果只提示前 N 条', async () => {
    cloudMocks.list.mockResolvedValue({ records: [DOC], total: 5000, page: 1, size: 100 });
    const wrapper = mountBrowser();
    await flushPromises();
    await flushPromises();

    expect(wrapper.find('[data-testid="cloud-browser-truncated"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="cloud-browser-truncated"]').text()).toContain('仅显示前 1 条');
  });

  it('空态与错误态', async () => {
    cloudMocks.list.mockResolvedValue({ records: [], total: 0, page: 1, size: 100 });
    const emptyWrapper = mountBrowser();
    await flushPromises();
    await flushPromises();
    expect(emptyWrapper.find('[data-testid="cloud-browser-empty"]').exists()).toBe(true);

    cloudMocks.list.mockRejectedValue(Object.assign(new Error('连不上服务器'), {
      code: 'NETWORK_ERROR',
    }));
    const errorWrapper = mountBrowser();
    await flushPromises();
    await flushPromises();
    expect(errorWrapper.find('[data-testid="cloud-browser-error"]').exists()).toBe(true);
    expect(errorWrapper.get('[data-testid="cloud-browser-error"]').text()).toContain('连不上服务器');
  });
});
