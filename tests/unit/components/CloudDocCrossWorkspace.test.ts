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

function mountTree() {
  return mount(CloudDocTree, { props: { nodes: [CATEGORY] } });
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
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('不在当前工作区时弹出「预览 / 另存为 / 取消」而不是直接失败', async () => {
    const wrapper = mountTree();
    await openDocMenu(wrapper);

    expect(q('cloud-doc-choice-dialog')).not.toBeNull();
    expect(q('cloud-doc-choice-preview')).not.toBeNull();
    expect(q('cloud-doc-choice-save-as')).not.toBeNull();
    expect(wrapper.find('[data-testid="cloud-browser-notice"]').exists()).toBe(false);
  });

  it('只读预览：展示内容且不写盘', async () => {
    const wrapper = mountTree();
    await openDocMenu(wrapper);
    clickEl('cloud-doc-choice-preview');
    await flushPromises();

    expect(q('cloud-doc-preview-dialog')).not.toBeNull();
    expect(q('cloud-doc-preview-content')?.textContent).toContain('跨工作区文档');
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it('另存为：选位置后写盘成功', async () => {
    const wrapper = mountTree();
    await openDocMenu(wrapper);
    clickEl('cloud-doc-choice-save-as');
    await flushPromises();

    expect(mocks.saveDialog).toHaveBeenCalled();
    expect(mocks.writeFile).toHaveBeenCalledWith('/tmp/saved.md', expect.stringContaining('跨工作区文档'));
  });

  it('取消：不写盘也不预览', async () => {
    const wrapper = mountTree();
    await openDocMenu(wrapper);
    clickEl('cloud-doc-choice-cancel');
    await flushPromises();

    expect(q('cloud-doc-choice-dialog')).toBeNull();
    expect(q('cloud-doc-preview-dialog')).toBeNull();
    expect(mocks.writeFile).not.toHaveBeenCalled();
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
