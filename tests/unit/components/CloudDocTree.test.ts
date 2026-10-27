/**
 * @description 云端文档树交互（0.6.22 重写）：菜单 Teleport 到 body、跟随坐标并在边界翻转、
 * 点击各项触发对应动作；拖拽移动分类；分类新建/重命名/删除；历史版本入口。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 20:40
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
  getDoc: vi.fn(),
  saveDoc: vi.fn(),
  shareStatus: vi.fn(),
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
    getCloudDoc: mocks.getDoc,
    saveCloudDoc: mocks.saveDoc,
  };
});

vi.mock('@/services/cloudShareService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudShareService')>();
  return { ...actual, getShareStatus: mocks.shareStatus };
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
const DEEP_CATEGORY = categoryNode('1', '一级', [
  categoryNode('2', '二级', [categoryNode('3', '三级')]),
]);

/** 菜单/弹层都 Teleport 到 body，统一从 document.body 查。 */
const q = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.body.querySelector(`[data-testid="${id}"]`) as T | null;

function clickEl(id: string): void {
  q(id)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function fillInput(id: string, value: string): void {
  const input = q<HTMLInputElement>(id);
  if (!input) {
    throw new Error(`input ${id} not found`);
  }
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function openMenu(
  wrapper: ReturnType<typeof mount>,
  testId: string,
  point: { clientX: number; clientY: number } = { clientX: 20, clientY: 20 },
  index = 0,
) {
  const rows = wrapper.findAll(`[data-testid="${testId}"]`);
  await rows[index]!.trigger('contextmenu', point);
  await flushPromises();
}

const mountTree = (nodes: CloudDocTreeNode[]) => mount(CloudDocTree, { props: { nodes } });

beforeEach(() => {
  setActivePinia(createPinia());
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
  useWorkspaceStore().currentWorkspacePath = '/ws';
  useWorkspaceStore().currentWorkspaceName = 'ws';
  mocks.categoriesList.mockResolvedValue([]);
  mocks.listVersions.mockResolvedValue({ ok: true, data: [] });
  mocks.moveDocCategory.mockResolvedValue(undefined);
  mocks.categoryCreate.mockResolvedValue({ id: '9', name: '新分类', parentId: '1001', children: [] });
  mocks.categoryUpdate.mockResolvedValue({ id: '1001', name: '改名', parentId: null, children: [] });
  mocks.categoryDelete.mockResolvedValue(undefined);
  mocks.deleteCloudDoc.mockResolvedValue({ ok: true, data: undefined });
  mocks.openTarget.mockResolvedValue({
    cloudPath: 'tau/ws/a.md',
    relativePath: 'a.md',
    absolutePath: '/ws/a.md',
    exists: true,
    sameContent: true,
    openable: true,
    action: 'openExisting',
    reasonCode: null,
    reason: null,
  });
  mocks.getDoc.mockResolvedValue({
    ok: true,
    data: { ...FILE.file, content: 'x', createdAt: '2026-10-20T09:00:00Z' },
  });
  mocks.shareStatus.mockResolvedValue({ ok: true, data: { shared: false } });
});

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('CloudDocTree 右键菜单', () => {
  it('文档菜单 7 项齐全，并在鼠标坐标处渲染', async () => {
    const wrapper = mountTree([CATEGORY]);
    await openMenu(wrapper, 'cloud-browser-file', { clientX: 120, clientY: 90 });

    for (const id of [
      'cloud-doc-menu-open',
      'cloud-doc-menu-sync',
      'cloud-doc-menu-share',
      'cloud-doc-menu-properties',
      'cloud-doc-menu-history',
      'cloud-doc-menu-move',
      'cloud-doc-menu-delete',
    ]) {
      expect(q(id)).not.toBeNull();
    }

    const menu = q('cloud-doc-tree-menu')!;
    // fixed 定位来自样式类，坐标走内联 style
    expect(menu.classList.contains('cloud-doc-tree__menu')).toBe(true);
    expect(Number.parseFloat(menu.style.left)).toBe(120);
    expect(Number.parseFloat(menu.style.top)).toBe(90);
  });

  it('靠近右侧/底部时翻转，浮层不出视口', async () => {
    const wrapper = mountTree([CATEGORY]);
    await openMenu(wrapper, 'cloud-browser-file', { clientX: 1000, clientY: 750 });

    const menu = q('cloud-doc-tree-menu')!;
    expect(Number.parseFloat(menu.style.left)).toBeLessThan(1000);
    expect(Number.parseFloat(menu.style.top)).toBeLessThan(750);
  });

  it('点击「打开」触发打开流程', async () => {
    const wrapper = mountTree([CATEGORY]);
    await openMenu(wrapper, 'cloud-browser-file');
    clickEl('cloud-doc-menu-open');
    await flushPromises();

    expect(mocks.openTarget).toHaveBeenCalled();
    expect(wrapper.emitted('open-file')?.[0]).toEqual(['/ws/a.md']);
  });

  it('点击「同步至云端」「一键分享」把动作上抛给宿主', async () => {
    const wrapper = mountTree([CATEGORY]);
    await openMenu(wrapper, 'cloud-browser-file');
    clickEl('cloud-doc-menu-sync');
    await flushPromises();
    expect(wrapper.emitted('doc-action')?.[0]?.[0]).toBe('sync');

    await openMenu(wrapper, 'cloud-browser-file');
    clickEl('cloud-doc-menu-share');
    await flushPromises();
    expect(wrapper.emitted('doc-action')?.[1]?.[0]).toBe('share');
  });

  it('点击「属性」打开属性弹窗', async () => {
    const wrapper = mountTree([CATEGORY]);
    await openMenu(wrapper, 'cloud-browser-file');
    clickEl('cloud-doc-menu-properties');
    await flushPromises();

    expect(document.body.querySelector('[data-testid="doc-properties-dialog"]')).not.toBeNull();
    expect(mocks.getDoc).toHaveBeenCalledWith(42);
  });

  it('点击「历史版本」打开版本弹窗并请求列表', async () => {
    const wrapper = mountTree([CATEGORY]);
    await openMenu(wrapper, 'cloud-browser-file');
    clickEl('cloud-doc-menu-history');
    await flushPromises();

    expect(document.body.querySelector('[data-testid="version-history-dialog"]')).not.toBeNull();
    expect(mocks.listVersions).toHaveBeenCalledWith(42);
  });

  it('点击「移动到…」展开分类列表', async () => {
    const wrapper = mountTree([CATEGORY]);
    await openMenu(wrapper, 'cloud-browser-file');
    clickEl('cloud-doc-menu-move');
    await flushPromises();

    expect(wrapper.find('[data-testid="cloud-doc-move-menu"]').exists()).toBe(true);
    expect(mocks.categoriesList).toHaveBeenCalled();
  });

  it('展开「移动到…」时收起右键菜单（同坐标叠层会挡住分类列表）', async () => {
    const wrapper = mountTree([CATEGORY]);
    await openMenu(wrapper, 'cloud-browser-file', { clientX: 120, clientY: 90 });
    expect(q('cloud-doc-tree-menu')).not.toBeNull();

    clickEl('cloud-doc-menu-move');
    await flushPromises();

    expect(q('cloud-doc-tree-menu')).toBeNull();
    const moveMenu = wrapper.get('[data-testid="cloud-doc-move-menu"]');
    // 固定在同一个鼠标坐标，但不能被右键菜单盖住
    expect(Number.parseFloat(moveMenu.element.style.left)).toBe(120);
    expect(Number.parseFloat(moveMenu.element.style.top)).toBe(90);
  });

  it('点击「删除云端文档」二次确认后调用删除', async () => {
    const wrapper = mountTree([CATEGORY]);
    await openMenu(wrapper, 'cloud-browser-file');
    clickEl('cloud-doc-menu-delete');
    await flushPromises();
    expect(q('cloud-doc-delete-confirm')).not.toBeNull();

    clickEl('cloud-doc-delete-confirm-btn');
    await flushPromises();
    expect(mocks.deleteCloudDoc).toHaveBeenCalledWith(42);
    expect(wrapper.emitted('changed')).toHaveLength(1);
  });

  it('分类菜单 3 项；聚合分组不可删除', async () => {
    const wrapper = mountTree([CATEGORY, UNCATEGORIZED]);
    await openMenu(wrapper, 'cloud-browser-dir');

    expect(q('cloud-category-menu-new')).not.toBeNull();
    expect(q('cloud-category-menu-rename')).not.toBeNull();
    expect(q<HTMLButtonElement>('cloud-category-menu-delete')!.disabled).toBe(false);

    const dirs = wrapper.findAll('[data-testid="cloud-browser-dir"]');
    await dirs[dirs.length - 1]!.trigger('contextmenu', { clientX: 10, clientY: 10 });
    await flushPromises();
    expect(q<HTMLButtonElement>('cloud-category-menu-delete')!.disabled).toBe(true);
  });

  it('三级分类下「新建子分类」禁用并提示', async () => {
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
    await rows[rows.length - 1]!.trigger('contextmenu', { clientX: 10, clientY: 10 });
    await flushPromises();

    const newBtn = q<HTMLButtonElement>('cloud-category-menu-new')!;
    expect(newBtn.disabled).toBe(true);
    expect(newBtn.getAttribute('title')).toContain('三级');
  });
});

describe('CloudDocTree 拖拽移动分类', () => {
  const dataTransfer = () => ({ setData: vi.fn(), effectAllowed: '', dropEffect: '' });

  it('拖到分类节点触发移动并高亮目标', async () => {
    const wrapper = mountTree([CATEGORY]);
    await wrapper.get('[data-testid="cloud-browser-file"]').trigger('dragstart', { dataTransfer: dataTransfer() });
    await wrapper.get('[data-testid="cloud-browser-dir"]').trigger('dragover', { dataTransfer: dataTransfer() });
    expect(wrapper.get('[data-testid="cloud-browser-dir"]').classes()).toContain('is-drop-target');

    await wrapper.get('[data-testid="cloud-browser-dir"]').trigger('drop', { dataTransfer: dataTransfer() });
    await flushPromises();

    expect(mocks.moveDocCategory).toHaveBeenCalledWith(42, '1001');
    expect(wrapper.get('[data-testid="cloud-browser-notice"]').text()).toContain('已移动分类');
    expect(wrapper.emitted('changed')).toHaveLength(1);
  });

  it('拖到「未分类」清空分类', async () => {
    const wrapper = mountTree([CATEGORY, UNCATEGORIZED]);
    await wrapper.get('[data-testid="cloud-browser-file"]').trigger('dragstart', { dataTransfer: dataTransfer() });
    const dirs = wrapper.findAll('[data-testid="cloud-browser-dir"]');
    await dirs[dirs.length - 1]!.trigger('drop', { dataTransfer: dataTransfer() });
    await flushPromises();

    expect(mocks.moveDocCategory).toHaveBeenCalledWith(42, null);
  });

  it('移动失败展示后端原因且不发 changed', async () => {
    mocks.moveDocCategory.mockRejectedValue(
      Object.assign(new Error('没有权限移动该文档'), { code: 'FORBIDDEN' }),
    );
    const wrapper = mountTree([CATEGORY]);
    await wrapper.get('[data-testid="cloud-browser-file"]').trigger('dragstart', { dataTransfer: dataTransfer() });
    await wrapper.get('[data-testid="cloud-browser-dir"]').trigger('drop', { dataTransfer: dataTransfer() });
    await flushPromises();

    expect(wrapper.get('[data-testid="cloud-browser-notice"]').text()).toContain('没有权限移动该文档');
    expect(wrapper.emitted('changed')).toBeUndefined();
  });
});

describe('CloudDocTree 分类管理', () => {
  beforeEach(() => {
    mocks.categoriesList.mockResolvedValue([{ id: '1001', name: '笔记', parentId: null, children: [] }]);
  });

  it('新建子分类：卡片显示父分类名，确定调用 create 并刷新', async () => {
    const wrapper = mountTree([CATEGORY]);
    await openMenu(wrapper, 'cloud-browser-dir');
    clickEl('cloud-category-menu-new');
    await flushPromises();

    const prompt = q('cloud-category-prompt')!;
    expect(prompt.textContent).toContain('笔记');

    fillInput('cloud-category-name-input', '新分类');
    clickEl('cloud-category-prompt-confirm');
    await flushPromises();

    expect(mocks.categoryCreate).toHaveBeenCalledWith('新分类', '1001');
    expect(wrapper.emitted('changed')).toHaveLength(1);
  });

  it('重命名走 PUT（update）而不是新建', async () => {
    const wrapper = mountTree([CATEGORY]);
    await openMenu(wrapper, 'cloud-browser-dir');
    clickEl('cloud-category-menu-rename');
    await flushPromises();

    fillInput('cloud-category-name-input', '改名');
    clickEl('cloud-category-prompt-confirm');
    await flushPromises();

    expect(mocks.categoryUpdate).toHaveBeenCalledWith('1001', '改名');
    expect(mocks.categoryCreate).not.toHaveBeenCalled();
  });

  it('删除分类：二次确认后调用 delete 并刷新', async () => {
    const wrapper = mountTree([CATEGORY]);
    await openMenu(wrapper, 'cloud-browser-dir');
    clickEl('cloud-category-menu-delete');
    await flushPromises();
    expect(q('cloud-category-delete-confirm')).not.toBeNull();

    clickEl('cloud-category-delete-confirm-btn');
    await flushPromises();
    expect(mocks.categoryDelete).toHaveBeenCalledWith('1001');
    expect(wrapper.emitted('changed')).toHaveLength(1);
  });

  it('删除被拒（409）展示原因且不刷新', async () => {
    mocks.categoryDelete.mockRejectedValue(
      Object.assign(new Error('该分类下还有 3 篇文档，无法删除'), { code: 'CONFLICT' }),
    );
    const wrapper = mountTree([CATEGORY]);
    await openMenu(wrapper, 'cloud-browser-dir');
    clickEl('cloud-category-menu-delete');
    await flushPromises();
    clickEl('cloud-category-delete-confirm-btn');
    await flushPromises();

    expect(wrapper.get('[data-testid="cloud-browser-notice"]').text()).toContain('还有 3 篇文档');
    expect(wrapper.emitted('changed')).toBeUndefined();
  });
});

describe('CloudDocTree 布局契约（tree / table 双模式）', () => {
  it('table 模式渲染 5 列表头与 .cd-row 行，行内含大小/版本/更新时间', async () => {
    const wrapper = mount(CloudDocTree, { props: { nodes: [CATEGORY], layout: 'table' } });

    const thead = wrapper.get('[data-testid="cloud-browser-thead"]');
    expect(thead.findAll('[role="columnheader"]')).toHaveLength(5);
    for (const label of ['文件名称', '大小', '版本', '云端更新时间', '操作']) {
      expect(thead.text()).toContain(label);
    }

    const row = wrapper.get('[data-testid="cloud-browser-file"]');
    expect(row.classes()).toContain('cd-row');
    expect(row.classes()).toContain('cloud-doc-tree__row');
    expect(row.text()).toContain('a.md');
    expect(row.text()).toContain('1.0 KB');
    expect(row.text()).toContain('v2');
    // 设计稿一：中间数据表只列文件，目录归左侧导航，因此 table 模式不渲染目录行
    expect(wrapper.findAll('[data-testid="cloud-browser-dir"]')).toHaveLength(0);
  });

  it('点行 emit select（key），受控 selectedKey 命中行带选中类', async () => {
    const wrapper = mount(CloudDocTree, { props: { nodes: [CATEGORY], layout: 'table' } });
    await wrapper.get('[data-testid="cloud-browser-file"]').trigger('click');

    expect(wrapper.emitted('select')?.[0]).toEqual(['tau/ws/a.md']);
    expect(wrapper.get('[data-testid="cloud-browser-file"]').classes()).toContain('cd-row--selected');

    // 受控覆盖：宿主改 selectedKey 后选中态随之移动（指向别的 key 时本行取消选中）
    await wrapper.setProps({ selectedKey: 'cat:1001' });
    expect(wrapper.get('[data-testid="cloud-browser-file"]').classes()).not.toContain('cd-row--selected');
    await wrapper.setProps({ selectedKey: 'tau/ws/a.md' });
    expect(wrapper.get('[data-testid="cloud-browser-file"]').classes()).toContain('cd-row--selected');
  });

  it('table 模式点行尾「在编辑器中载入」走同一条打开链路', async () => {
    const wrapper = mount(CloudDocTree, { props: { nodes: [CATEGORY], layout: 'table' } });
    const loadButton = wrapper.get('[data-testid="cloud-browser-open"]');
    expect(loadButton.attributes('title')).toBe('在编辑器中载入');
    await loadButton.trigger('click');
    await flushPromises();

    expect(mocks.openTarget).toHaveBeenCalled();
    expect(wrapper.emitted('open-file')?.[0]).toEqual(['/ws/a.md']);
  });

  it('tree 模式：点目录行切换展开、Enter 打开文件、Esc 收起右键菜单', async () => {
    const wrapper = mountTree([CATEGORY]);
    expect(wrapper.findAll('[data-testid="cloud-browser-file"]')).toHaveLength(1);

    await wrapper.get('[data-testid="cloud-browser-dir"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-testid="cloud-browser-file"]')).toHaveLength(0);
    expect(wrapper.emitted('select')?.[0]).toEqual(['cat:1001']);

    // 展开回来再按 Enter 打开文件
    await wrapper.get('[data-testid="cloud-browser-dir"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="cloud-browser-file"]').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(wrapper.emitted('open-file')?.[0]).toEqual(['/ws/a.md']);

    await openMenu(wrapper, 'cloud-browser-file');
    expect(q('cloud-doc-tree-menu')).not.toBeNull();
    // 打开菜单后焦点在第一项，Esc 从菜单里冒泡上来即收起
    q('cloud-doc-tree-menu')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    expect(q('cloud-doc-tree-menu')).toBeNull();
  });

  it('暴露 openNode：宿主（浏览弹窗检查器）可直接触发打开', async () => {
    const wrapper = mountTree([CATEGORY]);
    const vm = wrapper.vm as unknown as { openNode: (node: CloudDocTreeNode) => Promise<void> };
    await vm.openNode(FILE);
    await flushPromises();

    expect(mocks.openTarget).toHaveBeenCalled();
    expect(wrapper.emitted('open-file')?.[0]).toEqual(['/ws/a.md']);
  });
});

describe('CloudDocTree 跨工作区选择题：在编辑器中打开', () => {
  /** Rust 判定「不属于当前工作区」时的返回值：树据此弹出三选一 */
  const REJECTED = {
    cloudPath: 'tau/ws/a.md',
    relativePath: null,
    absolutePath: null,
    exists: false,
    sameContent: false,
    openable: true,
    action: 'rejected',
    reasonCode: 'CLOUD_PATH_NOT_IN_WORKSPACE',
    reason: '该云文档不属于当前工作区，无法落到本地',
  } as const;

  async function openChoiceDialog(wrapper: ReturnType<typeof mountTree>): Promise<void> {
    mocks.openTarget.mockResolvedValue(REJECTED);
    await openMenu(wrapper, 'cloud-browser-file');
    clickEl('cloud-doc-menu-open');
    await flushPromises();
  }

  it('只有取消/另存为/在编辑器中打开三个动作，主按钮不再走只读预览', async () => {
    const wrapper = mountTree([CATEGORY]);
    await openChoiceDialog(wrapper);

    expect(q('cloud-doc-choice-dialog')).not.toBeNull();
    const actions = q('cloud-doc-choice-dialog')?.querySelectorAll('.cloud-doc-overlay__actions button') ?? [];
    expect(Array.from(actions).map((button) => button.getAttribute('data-testid'))).toEqual([
      'cloud-doc-choice-cancel',
      'cloud-doc-choice-save-as',
      'cloud-doc-choice-edit',
    ]);
    expect(actions[2]?.classList.contains('cloud-doc-tree__button--primary')).toBe(true);
    expect(q('cloud-doc-choice-preview')).toBeNull();
    // 预览浮层与预览分支一起删除：任何时刻都不应再被挂载
    expect(q('cloud-doc-preview-dialog')).toBeNull();
  });

  it('点「在编辑器中打开」把节点交给宿主（落位与云绑定在 App.vue 完成）', async () => {
    const wrapper = mountTree([CATEGORY]);
    await openChoiceDialog(wrapper);

    clickEl('cloud-doc-choice-edit');
    await flushPromises();

    expect(wrapper.emitted('edit-cloud-doc')).toHaveLength(1);
    expect(wrapper.emitted('edit-cloud-doc')?.[0]).toEqual([FILE]);
    expect(q('cloud-doc-choice-dialog')).toBeNull();
    expect(q('cloud-doc-preview-dialog')).toBeNull();
    // 树内不发 IPC：不拉正文、不写盘、不直接打开
    expect(mocks.getDoc).not.toHaveBeenCalled();
    expect(wrapper.emitted('open-file')).toBeUndefined();
  });
});
