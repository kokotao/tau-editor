/**
 * @description 云端文档树交互：右键菜单项与禁用条件、拖拽移动分类（含未分类/失败回滚）、
 * 新建子分类/重命名/删除调用与刷新、历史版本入口。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 20:10
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  isTauri: { value: true },
  moveDocCategory: vi.fn(),
  categoryCreate: vi.fn(),
  categoryUpdate: vi.fn(),
  categoryDelete: vi.fn(),
  categoriesList: vi.fn(),
  deleteCloudDoc: vi.fn(),
  listVersions: vi.fn(),
  restoreVersion: vi.fn(),
  openTarget: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauriApp: () => mocks.isTauri.value,
    cloudCommands: {
      ...actual.cloudCommands,
      moveDocCategory: mocks.moveDocCategory,
      categoryCreate: mocks.categoryCreate,
      categoryUpdate: mocks.categoryUpdate,
      categoryDelete: mocks.categoryDelete,
      categoriesList: mocks.categoriesList,
      openTarget: mocks.openTarget,
    },
  };
});

vi.mock('@/services/cloudDocService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudDocService')>();
  return {
    ...actual,
    deleteCloudDoc: mocks.deleteCloudDoc,
    listCloudDocVersions: mocks.listVersions,
    restoreCloudDocVersion: mocks.restoreVersion,
  };
});

import CloudDocTree from '@/components/editor/CloudDocTree.vue';
import type { CloudDocTreeNode } from '@/services/cloudBrowserService';
import { useWorkspaceStore } from '@/stores/workspace';

function fileNode(name: string, fileId: number): CloudDocTreeNode {
  return {
    key: `tau/ws/${name}`,
    name,
    path: `tau/ws/${name}`,
    kind: 'file',
    children: [],
    file: {
      fileId,
      path: `tau/ws/${name}`,
      title: name,
      contentHash: 'sha256:x',
      size: 1024,
      version: 2,
      category: '笔记',
      categoryId: 1001,
      tags: null,
      visibility: 'PRIVATE',
      publishedArticleId: null,
      updatedAt: '2026-10-25T09:00:00Z',
    },
  };
}

function categoryNode(id: string, name: string, children: CloudDocTreeNode[] = []): CloudDocTreeNode {
  return { key: `cat:${id}`, name, path: `cat:${id}`, kind: 'dir', children, file: null };
}

const FILE = fileNode('a.md', 42);
const CATEGORY = categoryNode('1001', '笔记', [FILE]);
const UNCATEGORIZED: CloudDocTreeNode = {
  key: 'group:uncategorized',
  name: '未分类',
  path: 'group:uncategorized',
  kind: 'dir',
  children: [fileNode('b.md', 55)],
  file: null,
};

/** 三级分类树（用于验证「最多三级」） */
const DEEP_CATEGORY = categoryNode('1', '一级', [
  categoryNode('2', '二级', [categoryNode('3', '三级')]),
]);

function mountTree(nodes: CloudDocTreeNode[]) {
  return mount(CloudDocTree, { props: { nodes } });
}

async function openMenu(wrapper: ReturnType<typeof mountTree>, testId: string) {
  const rows = wrapper.findAll(`[data-testid="${testId}"]`);
  await rows[0]!.trigger('contextmenu', { clientX: 20, clientY: 20 });
  await flushPromises();
}

describe('CloudDocTree 右键菜单', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useWorkspaceStore().currentWorkspacePath = '/ws';
    useWorkspaceStore().currentWorkspaceName = 'ws';
    mocks.categoriesList.mockResolvedValue([]);
    mocks.listVersions.mockResolvedValue({ ok: true, data: [] });
    mocks.moveDocCategory.mockResolvedValue(undefined);
    mocks.categoryCreate.mockResolvedValue({ id: '9', name: '新分类', parentId: null, children: [] });
    mocks.categoryUpdate.mockResolvedValue({ id: '1001', name: '改名', parentId: null, children: [] });
    mocks.categoryDelete.mockResolvedValue(undefined);
    mocks.deleteCloudDoc.mockResolvedValue({ ok: true, data: undefined });
  });
  afterEach(() => vi.clearAllMocks());

  it('文档右键出现 打开/同步/分享/属性/历史/移动/删除', async () => {
    const wrapper = mountTree([CATEGORY]);
    await openMenu(wrapper, 'cloud-browser-file');

    for (const id of [
      'cloud-doc-menu-open',
      'cloud-doc-menu-sync',
      'cloud-doc-menu-share',
      'cloud-doc-menu-properties',
      'cloud-doc-menu-history',
      'cloud-doc-menu-move',
      'cloud-doc-menu-delete',
    ]) {
      expect(wrapper.find(`[data-testid="${id}"]`).exists()).toBe(true);
    }
  });

  it('分类右键出现 新建子分类/重命名/删除，聚合分组不可删除', async () => {
    const wrapper = mountTree([CATEGORY, UNCATEGORIZED]);
    await openMenu(wrapper, 'cloud-browser-dir');

    expect(wrapper.find('[data-testid="cloud-category-menu-new"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-category-menu-rename"]').exists()).toBe(true);
    const deleteBtn = wrapper.get('[data-testid="cloud-category-menu-delete"]');
    expect((deleteBtn.element as HTMLButtonElement).disabled).toBe(false);
  });

  it('三级分类下新建子分类被禁用并提示', async () => {
    // 分类树深度来自管理接口，三级节点 id=3 必须能查到 depth=3
    mocks.categoriesList.mockResolvedValue([
      {
        id: '1',
        name: '一级',
        parentId: null,
        children: [
          { id: '2', name: '二级', parentId: '1', children: [{ id: '3', name: '三级', parentId: '2', children: [] }] },
        ],
      },
    ]);
    const wrapper = mountTree([DEEP_CATEGORY]);
    const rows = wrapper.findAll('[data-testid="cloud-browser-dir"]');
    // 第三级是最后一个（展开后顺序为 一级/二级/三级）
    await rows[rows.length - 1]!.trigger('contextmenu', { clientX: 10, clientY: 10 });
    await flushPromises();

    const newBtn = wrapper.get('[data-testid="cloud-category-menu-new"]');
    expect((newBtn.element as HTMLButtonElement).disabled).toBe(true);
    expect(newBtn.attributes('title')).toContain('三级');
  });

  it('历史版本入口打开弹窗并请求版本列表', async () => {
    const wrapper = mountTree([CATEGORY]);
    await openMenu(wrapper, 'cloud-browser-file');

    await wrapper.get('[data-testid="cloud-doc-menu-history"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="version-history-dialog"]').exists()).toBe(true);
    expect(mocks.listVersions).toHaveBeenCalledWith(42);
  });
});

describe('CloudDocTree 拖拽移动分类', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useWorkspaceStore().currentWorkspacePath = '/ws';
    useWorkspaceStore().currentWorkspaceName = 'ws';
    mocks.categoriesList.mockResolvedValue([]);
    mocks.moveDocCategory.mockResolvedValue(undefined);
  });
  afterEach(() => vi.clearAllMocks());

  const dataTransfer = () => ({ setData: vi.fn(), effectAllowed: '', dropEffect: '' });

  it('拖到分类节点触发移动并高亮目标', async () => {
    const wrapper = mountTree([CATEGORY]);
    const file = wrapper.get('[data-testid="cloud-browser-file"]');
    const dir = wrapper.get('[data-testid="cloud-browser-dir"]');

    await file.trigger('dragstart', { dataTransfer: dataTransfer() });
    await dir.trigger('dragover', { dataTransfer: dataTransfer() });
    expect(dir.classes()).toContain('is-drop-target');

    await dir.trigger('drop', { dataTransfer: dataTransfer() });
    await flushPromises();

    expect(mocks.moveDocCategory).toHaveBeenCalledWith(42, 1001);
    expect(wrapper.get('[data-testid="cloud-browser-notice"]').text()).toContain('已移动分类');
    expect(wrapper.emitted('changed')).toHaveLength(1);
  });

  it('拖到「未分类」清空分类（categoryId=null）', async () => {
    const wrapper = mountTree([CATEGORY, UNCATEGORIZED]);
    const file = wrapper.get('[data-testid="cloud-browser-file"]');
    const dirs = wrapper.findAll('[data-testid="cloud-browser-dir"]');
    const uncategorizedRow = dirs[dirs.length - 1]!;

    await file.trigger('dragstart', { dataTransfer: dataTransfer() });
    await uncategorizedRow.trigger('drop', { dataTransfer: dataTransfer() });
    await flushPromises();

    expect(mocks.moveDocCategory).toHaveBeenCalledWith(42, null);
  });

  it('移动失败展示后端原因且不发 changed（回滚保持原状）', async () => {
    mocks.moveDocCategory.mockRejectedValue(
      Object.assign(new Error('没有权限移动该文档'), { code: 'FORBIDDEN' }),
    );
    const wrapper = mountTree([CATEGORY]);
    const file = wrapper.get('[data-testid="cloud-browser-file"]');
    const dir = wrapper.get('[data-testid="cloud-browser-dir"]');

    await file.trigger('dragstart', { dataTransfer: dataTransfer() });
    await dir.trigger('drop', { dataTransfer: dataTransfer() });
    await flushPromises();

    expect(wrapper.get('[data-testid="cloud-browser-notice"]').text()).toContain('没有权限移动该文档');
    expect(wrapper.emitted('changed')).toBeUndefined();
  });
});

describe('CloudDocTree 分类管理', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useWorkspaceStore().currentWorkspacePath = '/ws';
    useWorkspaceStore().currentWorkspaceName = 'ws';
    mocks.categoriesList.mockResolvedValue([
      { id: '1001', name: '笔记', parentId: null, children: [] },
    ]);
    mocks.categoryCreate.mockResolvedValue({ id: '9', name: '新分类', parentId: '1001', children: [] });
    mocks.categoryUpdate.mockResolvedValue({ id: '1001', name: '改名', parentId: null, children: [] });
    mocks.categoryDelete.mockResolvedValue(undefined);
  });
  afterEach(() => vi.clearAllMocks());

  it('新建子分类：填写名称后调用 create 并刷新（emit changed）', async () => {
    const wrapper = mountTree([CATEGORY]);
    await openMenu(wrapper, 'cloud-browser-dir');
    await wrapper.get('[data-testid="cloud-category-menu-new"]').trigger('click');
    await flushPromises();

    await wrapper.get('[data-testid="cloud-category-name-input"]').setValue('新分类');
    await wrapper.get('[data-testid="cloud-category-prompt-confirm"]').trigger('click');
    await flushPromises();

    expect(mocks.categoryCreate).toHaveBeenCalledWith('新分类', '1001');
    expect(wrapper.emitted('changed')).toHaveLength(1);
  });

  it('重命名走 PUT（改名分类调用 update）', async () => {
    const wrapper = mountTree([CATEGORY]);
    await openMenu(wrapper, 'cloud-browser-dir');
    await wrapper.get('[data-testid="cloud-category-menu-rename"]').trigger('click');
    await flushPromises();

    await wrapper.get('[data-testid="cloud-category-name-input"]').setValue('改名');
    await wrapper.get('[data-testid="cloud-category-prompt-confirm"]').trigger('click');
    await flushPromises();

    expect(mocks.categoryUpdate).toHaveBeenCalledWith('1001', '改名');
    expect(mocks.categoryCreate).not.toHaveBeenCalled();
  });

  it('删除分类：二次确认后调用 delete 并刷新', async () => {
    const wrapper = mountTree([CATEGORY]);
    await openMenu(wrapper, 'cloud-browser-dir');
    await wrapper.get('[data-testid="cloud-category-menu-delete"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="cloud-category-delete-confirm"]').exists()).toBe(true);
    await wrapper.get('[data-testid="cloud-category-delete-confirm-btn"]').trigger('click');
    await flushPromises();

    expect(mocks.categoryDelete).toHaveBeenCalledWith('1001');
    expect(wrapper.emitted('changed')).toHaveLength(1);
  });

  it('删除被拒（409 有文档引用）时原样展示原因，不发 changed', async () => {
    mocks.categoryDelete.mockRejectedValue(
      Object.assign(new Error('该分类下还有 3 篇文档，无法删除'), { code: 'CONFLICT' }),
    );
    const wrapper = mountTree([CATEGORY]);
    await openMenu(wrapper, 'cloud-browser-dir');
    await wrapper.get('[data-testid="cloud-category-menu-delete"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="cloud-category-delete-confirm-btn"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="cloud-browser-notice"]').text()).toContain('还有 3 篇文档');
    expect(wrapper.emitted('changed')).toBeUndefined();
  });
});
