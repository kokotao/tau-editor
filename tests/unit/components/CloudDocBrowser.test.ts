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
import { buildCloudDocTree } from '@/services/cloudBrowserService';
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

/** 已挂载实例：先卸载再清 body，避免残留的 Teleport 锚点/监听串到下一个用例。 */
const mountedWrappers: { unmount: () => void }[] = [];

describe('CloudDocBrowser 打开云端文档', () => {
  let pinia: ReturnType<typeof createPinia>;

  const mountBrowser = () => {
    const wrapper = mount(CloudDocBrowser, { global: { plugins: [pinia] } });
    mountedWrappers.push(wrapper);
    return wrapper;
  };

  const openFirstFile = async (wrapper: ReturnType<typeof mountBrowser>) => {
    const buttons = wrapper.findAll('[data-testid="cloud-browser-open"]');
    expect(buttons.length).toBeGreaterThan(0);
    await buttons[0]!.trigger('click');
    await flushPromises();
  };

  /** 预览/选择浮层 Teleport 到 body，wrapper.find 找不到，只能查 document.body。 */
  const bodyQuery = (id: string) =>
    document.body.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  const clickInBody = (id: string): void => {
    bodyQuery(id)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };

  /** 跨工作区 / 路径无法映射：走「只读预览 / 另存为 / 取消」分支。 */
  const openFirstFileCrossWorkspace = async (wrapper: ReturnType<typeof mountBrowser>) => {
    cloudMocks.openTarget.mockResolvedValue({
      ...TARGET_BASE,
      absolutePath: null,
      relativePath: null,
      action: 'rejected',
      reasonCode: 'CLOUD_PATH_NOT_IN_WORKSPACE',
      reason: '该云文档不属于当前工作区，无法落到本地',
    });
    await openFirstFile(wrapper);
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
    mountedWrappers.splice(0).forEach((wrapper) => wrapper.unmount());
    vi.clearAllMocks();
    // Teleport 到 body 的浮层要清掉，避免串到下一个用例
    document.body.innerHTML = '';
  });

  it('挂载后拉取并渲染树与文件元信息', async () => {
    const wrapper = mountBrowser();
    await flushPromises();
    await flushPromises();

    expect(cloudMocks.list).toHaveBeenCalledWith({ keyword: null, page: 1, size: 100 });
    expect(wrapper.find('[data-testid="cloud-browser-tree"]').exists()).toBe(true);
    // 三栏工作台同时渲染左栏目录树与中间表格两个 CloudDocTree 实例，按容器分别断言
    const sidebar = wrapper.get('[data-testid="cloud-browser-sidebar-tree"]');
    // 显示层按「分类 → 文件」分组，无分类的文档归入「未分类」
    expect(sidebar.findAll('[data-testid="cloud-browser-dir"]').length).toBe(1);
    expect(sidebar.get('[data-testid="cloud-browser-dir"]').text()).toContain('未分类');
    // 左栏是 compact 目录树（只有文件名），大小/版本/时间属于中间表格
    const fileRow = wrapper.get('[data-testid="cloud-browser-table"]').get('[data-testid="cloud-browser-file"]');
    expect(fileRow.text()).toContain('a.md');
    expect(fileRow.text()).toContain('20 B');
    expect(fileRow.text()).toContain('v3');
  });

  it('传 previewNodes 时跳过网络请求，并按三栏外壳渲染（开发预览契约）', async () => {
    const wrapper = mount(CloudDocBrowser, {
      props: {
        visible: true,
        previewNodes: buildCloudDocTree(
          [
            { ...DOC, path: 'tau/ws/notes/a.md', title: 'a.md' },
            { ...DOC, fileId: 43, path: 'tau/ws/notes/b.md', title: 'b.md', version: 1, size: 2048 },
          ],
          { stripPrefix: 'tau/ws' },
        ),
        previewTotal: 2,
      },
      global: { plugins: [pinia] },
    });
    mountedWrappers.push(wrapper);
    await flushPromises();

    // 预览模式不得触发任何云端请求
    expect(cloudMocks.list).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="cloud-browser-count"]').text()).toContain('共 2 个文件');
    expect(wrapper.get('[data-testid="cloud-browser-count"]').text()).toContain('云端匹配 2 条');
    // 三栏都在：左栏导航、中间表格、右栏检查器（默认选中第一份文档）
    expect(wrapper.find('[data-testid="cloud-browser-sidebar"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-browser-table"]').exists()).toBe(true);
    const inspector = wrapper.get('[data-testid="cloud-browser-inspector"]');
    expect(inspector.text()).toContain('a.md');
    expect(wrapper.find('[data-testid="cloud-browser-open-in-editor"]').exists()).toBe(true);
  });

  it('格式 chips 过滤中间表格；筛完为空时给出筛选空态', async () => {
    const wrapper = mount(CloudDocBrowser, {
      props: {
        visible: true,
        previewNodes: buildCloudDocTree(
          [
            { ...DOC, path: 'tau/ws/notes/a.md', title: 'a.md' },
            {
              ...DOC,
              fileId: 44,
              path: 'tau/ws/notes/spec.docx',
              title: 'spec.docx',
              version: 1,
              size: 4096,
            },
          ],
          { stripPrefix: 'tau/ws' },
        ),
        previewTotal: 2,
      },
      global: { plugins: [pinia] },
    });
    mountedWrappers.push(wrapper);
    await flushPromises();

    const table = () => wrapper.get('[data-testid="cloud-browser-table"]');
    expect(table().findAll('[data-testid="cloud-browser-file"]').length).toBe(2);

    await wrapper.get('[data-testid="cloud-browser-format-word"]').trigger('click');
    await flushPromises();
    const wordRows = table().findAll('[data-testid="cloud-browser-file"]');
    expect(wordRows.length).toBe(1);
    expect(wordRows[0]!.text()).toContain('spec.docx');

    await wrapper.get('[data-testid="cloud-browser-format-code"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="cloud-browser-filter-empty"]').exists()).toBe(true);
  });

  it('预览模式下关键字过滤仍在本地生效（不联网）', async () => {
    const wrapper = mount(CloudDocBrowser, {
      props: {
        visible: true,
        previewNodes: buildCloudDocTree(
          [
            { ...DOC, path: 'tau/ws/notes/a.md', title: 'a.md' },
            { ...DOC, fileId: 45, path: 'tau/ws/notes/b.md', title: 'b.md' },
          ],
          { stripPrefix: 'tau/ws' },
        ),
        previewTotal: 2,
      },
      global: { plugins: [pinia] },
    });
    mountedWrappers.push(wrapper);
    await flushPromises();

    const search = wrapper.get('[data-testid="cloud-browser-search"]');
    await search.setValue('b.md');
    await search.trigger('keydown.enter');
    await flushPromises();

    expect(cloudMocks.list).not.toHaveBeenCalled();
    const rows = wrapper.get('[data-testid="cloud-browser-table"]').findAll('[data-testid="cloud-browser-file"]');
    expect(rows.length).toBe(1);
    expect(rows[0]!.text()).toContain('b.md');
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

  it('跨工作区点「只读预览」：遮罩卡片里能看见正文，且不写盘', async () => {
    const wrapper = mountBrowser();
    await flushPromises();
    await flushPromises();

    await openFirstFileCrossWorkspace(wrapper);
    expect(bodyQuery('cloud-doc-choice-dialog')).not.toBeNull();

    clickInBody('cloud-doc-choice-preview');
    await flushPromises();

    // 回归点：预览浮层此前没有定位与遮罩，点完「毫无反应」
    expect(bodyQuery('cloud-doc-preview-overlay')).not.toBeNull();
    expect(bodyQuery('cloud-doc-preview-dialog')?.getAttribute('aria-modal')).toBe('true');
    expect(bodyQuery('cloud-doc-preview-content')?.textContent).toContain('cloud content');
    expect(bodyQuery('cloud-doc-choice-dialog')).toBeNull();
    expect(cloudMocks.writeFile).not.toHaveBeenCalled();
    expect(wrapper.emitted('open-file')).toBeUndefined();
  });

  it('跨工作区「另存为…」：写到选中路径后透传 open-file 自动打开', async () => {
    cloudMocks.saveDialog.mockResolvedValue('/tmp/copy.md');
    const wrapper = mountBrowser();
    await flushPromises();
    await flushPromises();

    await openFirstFileCrossWorkspace(wrapper);
    clickInBody('cloud-doc-choice-save-as');
    await flushPromises();

    expect(cloudMocks.saveDialog).toHaveBeenCalledWith({ defaultPath: 'a.md' });
    expect(cloudMocks.writeFile).toHaveBeenCalledWith('/tmp/copy.md', 'cloud content');
    // 浏览器外壳把树的 open-file 原样透给 App.vue
    expect(wrapper.emitted('open-file')?.[0]).toEqual(['/tmp/copy.md']);
    expect(bodyQuery('cloud-doc-choice-dialog')).toBeNull();
  });

  it('跨工作区「另存为…」在系统对话框取消：不写盘、不打开', async () => {
    cloudMocks.saveDialog.mockResolvedValue(null);
    const wrapper = mountBrowser();
    await flushPromises();
    await flushPromises();

    await openFirstFileCrossWorkspace(wrapper);
    clickInBody('cloud-doc-choice-save-as');
    await flushPromises();

    expect(cloudMocks.saveDialog).toHaveBeenCalled();
    expect(cloudMocks.writeFile).not.toHaveBeenCalled();
    expect(wrapper.emitted('open-file')).toBeUndefined();
    expect(bodyQuery('cloud-doc-choice-dialog')).toBeNull();
    expect(bodyQuery('cloud-doc-preview-dialog')).toBeNull();
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
