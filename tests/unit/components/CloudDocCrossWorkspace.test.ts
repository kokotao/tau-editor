/**
 * @description 跨工作区云文档：不再直接报错，提供「只读预览 / 另存为 / 取消」；取消不写盘。
 * 同时覆盖商业错误兜底（IPC 异常不再静默）。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 21:25
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  isTauri: { value: true },
  openTarget: vi.fn(),
  getDoc: vi.fn(),
  cloudGet: vi.fn(),
  writeFile: vi.fn(),
  saveDialog: vi.fn(),
  categoriesList: vi.fn(),
  moveDocCategory: vi.fn(),
  categoryCreate: vi.fn(),
  categoryUpdate: vi.fn(),
  categoryDelete: vi.fn(),
  deleteCloudDoc: vi.fn(),
  listVersions: vi.fn(),
  restoreVersion: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: mocks.saveDialog,
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauriApp: () => mocks.isTauri.value,
    fileCommands: { ...actual.fileCommands, writeFile: mocks.writeFile },
    cloudCommands: {
      ...actual.cloudCommands,
      openTarget: mocks.openTarget,
      get: mocks.cloudGet,
      categoriesList: mocks.categoriesList,
      moveDocCategory: mocks.moveDocCategory,
      categoryCreate: mocks.categoryCreate,
      categoryUpdate: mocks.categoryUpdate,
      categoryDelete: mocks.categoryDelete,
    },
  };
});

vi.mock('@/services/cloudDocService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudDocService')>();
  return {
    ...actual,
    getCloudDoc: mocks.getDoc,
    deleteCloudDoc: mocks.deleteCloudDoc,
    listCloudDocVersions: mocks.listVersions,
    restoreCloudDocVersion: mocks.restoreVersion,
  };
});

vi.mock('@/services/cloudShareService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudShareService')>();
  return { ...actual, getShareStatus: vi.fn().mockResolvedValue({ ok: true, data: { shared: false } }) };
});

import CloudDocTree from '@/components/editor/CloudDocTree.vue';
import type { CloudDocTreeNode } from '@/services/cloudBrowserService';
import { useWorkspaceStore } from '@/stores/workspace';

const q = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.body.querySelector(`[data-testid="${id}"]`) as T | null;

function clickEl(id: string): void {
  q(id)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

/** 浮层都 Teleport 到 body：Esc 监听挂在 window 上，直接对 window 派发最稳。 */
function pressEscape(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
}

/** 已挂载的实例：afterEach 里逐个 unmount，避免残留的 window 监听与 Teleport 锚点干扰下一个用例。 */
const mountedWrappers: ReturnType<typeof mountTree>[] = [];

const FILE: CloudDocTreeNode = {
  key: 'tau/other-ws/a.md',
  name: 'a.md',
  path: 'tau/other-ws/a.md',
  kind: 'file',
  children: [],
  file: {
    fileId: 77,
    path: 'tau/other-ws/a.md',
    title: 'a.md',
    contentHash: 'sha256:x',
    size: 12,
    version: 1,
    category: null,
    categoryId: null,
    tags: null,
    visibility: 'PRIVATE',
    publishedArticleId: null,
    updatedAt: null,
  },
};

const CATEGORY: CloudDocTreeNode = {
  key: 'cat:1001',
  name: '笔记',
  path: 'cat:1001',
  kind: 'dir',
  children: [FILE],
  file: null,
};

function mountTree(nodes: CloudDocTreeNode[] = [CATEGORY]) {
  const wrapper = mount(CloudDocTree, { props: { nodes } });
  mountedWrappers.push(wrapper);
  return wrapper;
}

async function openDocMenu(wrapper: ReturnType<typeof mountTree>) {
  await wrapper.get('[data-testid="cloud-browser-file"]').trigger('contextmenu', { clientX: 20, clientY: 20 });
  await flushPromises();
  clickEl('cloud-doc-menu-open');
  await flushPromises();
}

describe('CloudDocTree 跨工作区云文档', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useWorkspaceStore().currentWorkspacePath = '/ws';
    useWorkspaceStore().currentWorkspaceName = 'ws';
    mocks.openTarget.mockResolvedValue({
      cloudPath: 'tau/other-ws/a.md',
      relativePath: null,
      absolutePath: null,
      exists: false,
      sameContent: false,
      openable: true,
      action: 'rejected',
      reasonCode: 'CLOUD_PATH_NOT_IN_WORKSPACE',
      reason: '该云文档不属于当前工作区，无法落到本地',
    });
    mocks.cloudGet.mockResolvedValue({
      fileId: 77,
      path: 'tau/other-ws/a.md',
      title: 'a.md',
      content: '# 正文',
      contentHash: 'sha256:x',
      size: 12,
      version: 1,
      updatedAt: null,
    });
    mocks.getDoc.mockResolvedValue({
      ok: true,
      data: { ...FILE.file, content: '# 跨工作区文档\n\n正文', createdAt: null },
    });
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.saveDialog.mockResolvedValue('/tmp/saved.md');
  });
  afterEach(() => {
    // 先卸载再清 body：直接清 body 会让残留实例的 Teleport 锚点为 null，后续重渲染抛错
    mountedWrappers.splice(0).forEach((wrapper) => wrapper.unmount());
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('不在当前工作区时弹出「预览 / 另存为 / 取消」而不是直接失败', async () => {
    const wrapper = mountTree();
    await openDocMenu(wrapper);

    // 选择题现在也是「遮罩 + 居中卡片」，不再和底部按钮条视觉重叠
    expect(q('cloud-doc-choice-overlay')).not.toBeNull();
    expect(q('cloud-doc-choice-dialog')).not.toBeNull();
    expect(q('cloud-doc-choice-dialog')?.getAttribute('aria-modal')).toBe('true');
    expect(q('cloud-doc-choice-preview')).not.toBeNull();
    expect(q('cloud-doc-choice-save-as')).not.toBeNull();
    expect(wrapper.find('[data-testid="cloud-browser-notice"]').exists()).toBe(false);
  });

  it('只读预览：遮罩卡片里可见正文且不写盘', async () => {
    const wrapper = mountTree();
    await openDocMenu(wrapper);
    clickEl('cloud-doc-choice-preview');
    await flushPromises();

    // 回归点：预览浮层此前没有定位/遮罩，点完「看起来毫无反应」
    expect(q('cloud-doc-preview-overlay')).not.toBeNull();
    expect(q('cloud-doc-preview-dialog')).not.toBeNull();
    expect(q('cloud-doc-preview-dialog')?.getAttribute('role')).toBe('dialog');
    expect(q('cloud-doc-preview-dialog')?.getAttribute('aria-modal')).toBe('true');
    expect(q('cloud-doc-preview-title')?.textContent).toContain('a.md');
    expect(q('cloud-doc-preview-content')?.textContent).toContain('跨工作区文档');
    // 选择题在预览打开时收起，两层不会叠在一起
    expect(q('cloud-doc-choice-dialog')).toBeNull();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(wrapper.emitted('open-file')).toBeUndefined();
  });

  it('只读预览：Esc 与关闭按钮都能收起，关闭按钮可聚焦', async () => {
    const wrapper = mountTree();
    await openDocMenu(wrapper);
    clickEl('cloud-doc-choice-preview');
    await flushPromises();

    const closeButton = q<HTMLButtonElement>('cloud-doc-preview-close');
    expect(closeButton).not.toBeNull();
    // 打开即聚焦关闭按钮：键盘用户不必先 Tab 找出口
    expect(document.activeElement).toBe(closeButton);

    closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(q('cloud-doc-preview-dialog')).toBeNull();

    // 再次打开后按 Esc 关闭（焦点在树行上时也要能关）
    await openDocMenu(wrapper);
    clickEl('cloud-doc-choice-preview');
    await flushPromises();
    expect(q('cloud-doc-preview-dialog')).not.toBeNull();
    pressEscape();
    await flushPromises();
    expect(q('cloud-doc-preview-dialog')).toBeNull();
  });

  it('非文本类只读预览：给提示而不是空白卡片', async () => {
    // 预览分支按「文件名后缀」判定，换个 .png 节点即可走到 hint 分支
    const png: CloudDocTreeNode = {
      ...FILE,
      key: 'tau/other-ws/a.png',
      name: 'a.png',
      path: 'tau/other-ws/a.png',
      file: FILE.file ? { ...FILE.file, path: 'tau/other-ws/a.png', title: 'a.png' } : null,
    };
    const wrapper = mountTree([{ ...CATEGORY, children: [png] }]);
    await openDocMenu(wrapper);
    clickEl('cloud-doc-choice-preview');
    await flushPromises();

    expect(q('cloud-doc-preview-dialog')).not.toBeNull();
    expect(q('cloud-doc-preview-hint')?.textContent).toContain('暂不支持应用内预览');
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it('另存为：选位置后写盘并自动打开（open-file）', async () => {
    const wrapper = mountTree();
    await openDocMenu(wrapper);
    clickEl('cloud-doc-choice-save-as');
    await flushPromises();

    expect(mocks.saveDialog).toHaveBeenCalled();
    expect(mocks.writeFile).toHaveBeenCalledWith('/tmp/saved.md', expect.stringContaining('跨工作区文档'));
    // 另存为成功后必须交给宿主打开，否则用户只看得到一条 toast
    expect(wrapper.emitted('open-file')?.[0]).toEqual(['/tmp/saved.md']);
    expect(q('cloud-doc-choice-dialog')).toBeNull();
  });

  it('另存为时在系统对话框取消：不写盘、不打开', async () => {
    mocks.saveDialog.mockResolvedValue(null);
    const wrapper = mountTree();
    await openDocMenu(wrapper);
    clickEl('cloud-doc-choice-save-as');
    await flushPromises();

    expect(mocks.saveDialog).toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(wrapper.emitted('open-file')).toBeUndefined();
    expect(q('cloud-doc-choice-dialog')).toBeNull();
    expect(q('cloud-doc-preview-dialog')).toBeNull();
  });

  it('取消：不写盘也不预览', async () => {
    const wrapper = mountTree();
    await openDocMenu(wrapper);
    clickEl('cloud-doc-choice-cancel');
    await flushPromises();

    expect(q('cloud-doc-choice-dialog')).toBeNull();
    expect(q('cloud-doc-preview-dialog')).toBeNull();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(wrapper.emitted('open-file')).toBeUndefined();
  });

  it('选择题按 Esc 关闭：不写盘、不打开', async () => {
    const wrapper = mountTree();
    await openDocMenu(wrapper);
    expect(q('cloud-doc-choice-dialog')).not.toBeNull();

    pressEscape();
    await flushPromises();

    expect(q('cloud-doc-choice-dialog')).toBeNull();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(wrapper.emitted('open-file')).toBeUndefined();
  });

  it('同工作区但本地不存在：仍走原有「写入并打开」流程', async () => {
    mocks.openTarget.mockResolvedValue({
      cloudPath: 'tau/ws/a.md',
      relativePath: 'a.md',
      absolutePath: '/ws/a.md',
      exists: false,
      sameContent: false,
      openable: true,
      action: 'writeThenOpen',
      reasonCode: null,
      reason: null,
    });
    const wrapper = mountTree();
    await openDocMenu(wrapper);

    // writeThenOpen 分支会拉取内容并写盘后打开
    expect(q('cloud-doc-choice-dialog')).toBeNull();
    expect(wrapper.emitted('open-file')).toBeTruthy();
  });

  it('分类创建遇到 IPC 异常时错误显示在卡片里（不再静默）', async () => {
    mocks.categoriesList.mockResolvedValue([{ id: '1001', name: '笔记', parentId: null, children: [] }]);
    mocks.categoryCreate.mockRejectedValue(new Error('IPC 参数类型不匹配'));
    const wrapper = mountTree();

    await wrapper.get('[data-testid="cloud-browser-dir"]').trigger('contextmenu', { clientX: 10, clientY: 10 });
    await flushPromises();
    clickEl('cloud-category-menu-new');
    await flushPromises();

    const input = q<HTMLInputElement>('cloud-category-name-input')!;
    input.value = '2312';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    clickEl('cloud-category-prompt-confirm');
    await flushPromises();

    expect(q('cloud-category-prompt-error')?.textContent).toContain('IPC 参数类型不匹配');
  });
});
