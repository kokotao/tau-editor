/**
 * @description 右键「同步至云端」弹窗：分类选择/新建（互斥）、payload、已同步提示、冲突覆盖、分类加载失败降级。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 16:40
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  fetchCategories: vi.fn(),
  syncByPath: vi.fn(),
  ensureCategoryPath: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return { ...actual, isTauriApp: () => true };
});

vi.mock('@/services/cloudBlogService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudBlogService')>();
  return { ...actual, fetchCloudCategories: mocks.fetchCategories };
});

vi.mock('@/services/cloudSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudSyncService')>();
  return { ...actual, syncDocumentByPath: mocks.syncByPath };
});

vi.mock('@/services/cloudCategoryPathService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudCategoryPathService')>();
  return { ...actual, ensureCategoryPath: mocks.ensureCategoryPath };
});

import CloudDocSyncDialog from '@/components/editor/CloudDocSyncDialog.vue';
import { useCloudSyncStore } from '@/stores/cloudSync';
import { useWorkspaceStore } from '@/stores/workspace';
import { useCenterToastStore } from '@/stores/centerToast';

const CATEGORY_TREE = [
  {
    id: '1001',
    name: '笔记',
    parentId: null,
    children: [{ id: '2002', name: '子分类', parentId: '1001', children: [] }],
  },
  { id: '1003', name: '随笔', parentId: null, children: [] },
  // 真实雪花 id：> 2^53，经 Number() 会被截断
  { id: '2114279859393396737', name: '雪花分类', parentId: null, children: [] },
];

const mountDialog = () =>
  mount(CloudDocSyncDialog, {
    props: { visible: true, filePath: '/ws/notes/a.md', fileName: 'a.md' },
  });

const settle = async () => {
  await flushPromises();
  await flushPromises();
};

describe('CloudDocSyncDialog 右键同步', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.fetchCategories.mockResolvedValue({ ok: true, data: CATEGORY_TREE });
    mocks.syncByPath.mockResolvedValue({ status: 'synced', fileId: 42, version: 3 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('选择已有分类后 payload 带 category 与字符串 categoryId', async () => {
    const wrapper = mountDialog();
    await settle();
    await wrapper.get('[data-testid="cloud-sync-dialog-category-trigger"]').trigger('click');
    await settle();

    await wrapper.get('[data-testid="cloud-sync-dialog-category-2002"]').trigger('click');
    await wrapper.get('[data-testid="cloud-sync-dialog-confirm"]').trigger('click');
    await settle();

    expect(mocks.syncByPath).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/ws/notes/a.md',
        category: '子分类',
        categoryId: '2002',
        overwrite: false,
      }),
    );
  });

  it('雪花分类 id 按字符串原样下发（不能被 Number 截断）', async () => {
    const snowflake = '2114279859393396737';
    const wrapper = mountDialog();
    await settle();
    await wrapper.get('[data-testid="cloud-sync-dialog-category-trigger"]').trigger('click');
    await settle();

    await wrapper.get(`[data-testid="cloud-sync-dialog-category-${snowflake}"]`).trigger('click');
    await wrapper.get('[data-testid="cloud-sync-dialog-confirm"]').trigger('click');
    await settle();

    const payload = mocks.syncByPath.mock.calls[0]?.[0] as { categoryId?: unknown };
    expect(payload.categoryId).toBe(snowflake);
    // 明确挡住精度回归：Number(雪花 id) ≠ 原值
    expect(payload.categoryId).not.toBe(Number(snowflake));
  });

  it('新建分类与选择互斥：填名称后忽略已选分类', async () => {
    const wrapper = mountDialog();
    await settle();
    await wrapper.get('[data-testid="cloud-sync-dialog-category-trigger"]').trigger('click');
    await settle();

    await wrapper.get('[data-testid="cloud-sync-dialog-category-1001"]').trigger('click');
    await wrapper.get('[data-testid="cloud-sync-dialog-new-category"]').setValue('我的新分类');
    await wrapper.get('[data-testid="cloud-sync-dialog-confirm"]').trigger('click');
    await settle();

    expect(mocks.syncByPath).toHaveBeenCalledWith(
      expect.objectContaining({ category: '我的新分类', categoryId: null }),
    );
  });

  it('不选分类时按不分类上传', async () => {
    const wrapper = mountDialog();
    await settle();
    await wrapper.get('[data-testid="cloud-sync-dialog-category-trigger"]').trigger('click');
    await settle();

    await wrapper.get('[data-testid="cloud-sync-dialog-confirm"]').trigger('click');
    await settle();

    expect(mocks.syncByPath).toHaveBeenCalledWith(
      expect.objectContaining({ category: null, categoryId: null }),
    );
  });

  it('已是同步状态时提示且不重复上传', async () => {
    mocks.syncByPath.mockResolvedValue({ status: 'skipped', message: '已是同步状态（内容与云端一致），无需重复上传' });
    const wrapper = mountDialog();
    await settle();
    await wrapper.get('[data-testid="cloud-sync-dialog-category-trigger"]').trigger('click');
    await settle();

    await wrapper.get('[data-testid="cloud-sync-dialog-confirm"]').trigger('click');
    await settle();

    expect(wrapper.get('[data-testid="cloud-sync-dialog-notice"]').text()).toContain('已是同步状态');
    expect(wrapper.emitted('synced')).toBeUndefined();
  });

  it('冲突时先确认覆盖，确认后 overwrite=true 再同步并 emit synced', async () => {
    mocks.syncByPath
      .mockResolvedValueOnce({ status: 'conflict', message: '云端已有该文档且内容不同' })
      .mockResolvedValueOnce({ status: 'synced', fileId: 42, version: 4 });
    const wrapper = mountDialog();
    await settle();
    await wrapper.get('[data-testid="cloud-sync-dialog-category-trigger"]').trigger('click');
    await settle();

    await wrapper.get('[data-testid="cloud-sync-dialog-confirm"]').trigger('click');
    await settle();
    expect(wrapper.find('[data-testid="cloud-sync-dialog-conflict"]').exists()).toBe(true);

    await wrapper.get('[data-testid="cloud-sync-dialog-overwrite"]').trigger('click');
    await settle();

    expect(mocks.syncByPath).toHaveBeenLastCalledWith(
      expect.objectContaining({ overwrite: true }),
    );
    expect(wrapper.emitted('synced')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('图片部分失败：失败行红色加粗单独成行，成功行分开显示', async () => {
    mocks.syncByPath.mockResolvedValue({
      status: 'synced',
      fileId: 42,
      version: 3,
      message: '已更新云端文档',
      assets: {
        total: 2,
        eligible: 2,
        uploaded: 1,
        unchanged: 0,
        failed: 1,
        skipped: 0,
        failures: [{ relPath: 'images/b.png', reason: '超过 20 MB' }],
      },
    });
    const wrapper = mountDialog();
    await settle();
    await wrapper.get('[data-testid="cloud-sync-dialog-category-trigger"]').trigger('click');
    await settle();

    await wrapper.get('[data-testid="cloud-sync-dialog-confirm"]').trigger('click');
    await settle();

    const failedLine = wrapper.get('[data-testid="cloud-sync-dialog-assets-failed"]');
    expect(failedLine.classes()).toContain('status-notice--error');
    expect(failedLine.classes()).toContain('status-notice--strong');
    expect(failedLine.attributes('role')).toBe('alert');
    expect(failedLine.text()).toContain('1 张图片失败');

    const summary = wrapper.get('[data-testid="cloud-sync-dialog-assets-summary"]');
    expect(summary.classes()).toContain('status-notice--success');
    expect(summary.text()).toContain('已上传 1');

    // 失败原因可展开
    await wrapper.get('[data-testid="cloud-sync-dialog-assets-failed-toggle"]').trigger('click');
    expect(wrapper.get('[data-testid="cloud-sync-dialog-assets-failed-details"]').text()).toContain('超过 20 MB');
  });

  it('分类加载失败时仍可手动输入新分类并同步', async () => {
    mocks.fetchCategories.mockResolvedValue({ ok: false, kind: 'network', message: '连不上服务器' });
    const wrapper = mountDialog();
    await settle();
    await wrapper.get('[data-testid="cloud-sync-dialog-category-trigger"]').trigger('click');
    await settle();

    expect(wrapper.find('[data-testid="cloud-sync-dialog-categories-error"]').exists()).toBe(true);
    await wrapper.get('[data-testid="cloud-sync-dialog-new-category"]').setValue('手写分类');
    await wrapper.get('[data-testid="cloud-sync-dialog-confirm"]').trigger('click');
    await settle();

    expect(mocks.syncByPath).toHaveBeenCalledWith(
      expect.objectContaining({ category: '手写分类', categoryId: null }),
    );
  });

  it('同步失败时展示错误并保持弹窗', async () => {
    mocks.syncByPath.mockResolvedValue({ status: 'failed', message: '云端空间不足' });
    const wrapper = mountDialog();
    await settle();
    await wrapper.get('[data-testid="cloud-sync-dialog-category-trigger"]').trigger('click');
    await settle();

    await wrapper.get('[data-testid="cloud-sync-dialog-confirm"]').trigger('click');
    await settle();

    expect(wrapper.get('[data-testid="cloud-sync-dialog-error"]').text()).toContain('云端空间不足');
    expect(wrapper.emitted('synced')).toBeUndefined();
  });
});

describe('CloudDocSyncDialog 分类下拉与成功提示（0.6.23）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.fetchCategories.mockResolvedValue({ ok: true, data: CATEGORY_TREE });
    mocks.syncByPath.mockResolvedValue({ status: 'synced', fileId: 42, version: 3 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('打开时按云端记录回显已同步的分类', async () => {
    useWorkspaceStore().currentWorkspacePath = '/ws';
    useWorkspaceStore().currentWorkspaceName = 'ws';
    useCloudSyncStore().docMap['tau/ws/notes/a.md'] = {
      fileId: 42,
      version: 3,
      contentHash: 'sha256:x',
      updatedAt: null,
      category: '笔记',
      categoryId: 1001,
    } as never;

    const wrapper = mountDialog({ filePath: '/ws/notes/a.md' });
    await settle();

    expect(wrapper.get('[data-testid="cloud-sync-dialog-category-trigger"]').text()).toContain('笔记');
  });

  it('分类下拉默认收起，点击展开并可用搜索过滤，选中后收起', async () => {
    const wrapper = mountDialog();
    await settle();

    expect(wrapper.find('[data-testid="cloud-sync-dialog-category-panel"]').exists()).toBe(false);
    await wrapper.get('[data-testid="cloud-sync-dialog-category-trigger"]').trigger('click');
    await settle();
    expect(wrapper.find('[data-testid="cloud-sync-dialog-category-panel"]').exists()).toBe(true);

    await wrapper.get('[data-testid="cloud-sync-dialog-category-search"]').setValue('笔记');
    await settle();
    expect(wrapper.find('[data-testid="cloud-sync-dialog-category-1001"]').exists()).toBe(true);

    await wrapper.get('[data-testid="cloud-sync-dialog-category-1001"]').trigger('click');
    await settle();
    expect(wrapper.find('[data-testid="cloud-sync-dialog-category-panel"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="cloud-sync-dialog-category-trigger"]').text()).toContain('笔记');
  });

  it('展开分类后点面板外空白处收起，点面板内部不收', async () => {
    const wrapper = mountDialog();
    await settle();
    await wrapper.get('[data-testid="cloud-sync-dialog-category-trigger"]').trigger('click');
    await settle();
    expect(wrapper.find('[data-testid="cloud-sync-dialog-category-panel"]').exists()).toBe(true);

    // 面板内部点击（搜索框）不收起
    wrapper.get('[data-testid="cloud-sync-dialog-category-search"]').element.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true }),
    );
    await settle();
    expect(wrapper.find('[data-testid="cloud-sync-dialog-category-panel"]').exists()).toBe(true);

    // 面板外（document 上）mousedown → 收起分类面板（弹窗本身不关闭）
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await settle();
    expect(wrapper.find('[data-testid="cloud-sync-dialog-category-panel"]').exists()).toBe(false);
    expect(wrapper.emitted('close')).toBeUndefined();
  });

  it('同步成功：只关闭弹窗并上抛 synced（toast 由 App 统一弹，避免重复）', async () => {
    mocks.syncByPath.mockResolvedValue({
      status: 'synced',
      fileId: 42,
      version: 7,
      message: '已更新云端文档',
    });
    const wrapper = mountDialog();
    await settle();
    await wrapper.get('[data-testid="cloud-sync-dialog-category-trigger"]').trigger('click');
    await settle();

    await wrapper.get('[data-testid="cloud-sync-dialog-confirm"]').trigger('click');
    await settle();

    expect(wrapper.emitted('close')).toBeTruthy();
    expect(wrapper.emitted('synced')).toBeTruthy();
    // 弹窗内不再自己弹 toast：否则 App 会再弹一次（重复）
    expect(useCenterToastStore().visible).toBe(false);
  });
});

describe('CloudDocSyncDialog 云端身份（临时区落位文档的分类回显与更新）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.fetchCategories.mockResolvedValue({ ok: true, data: CATEGORY_TREE });
    mocks.syncByPath.mockResolvedValue({ status: 'synced', fileId: 42, version: 4 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('按云端记录字段回显分类（临时区路径推导不出云端 path 也要能回显）', async () => {
    const wrapper = mount(CloudDocSyncDialog, {
      props: {
        visible: true,
        // 临时区路径：任何「当前工作区」推导都得不到 tau/分享/…
        filePath: 'C:/Users/x/AppData/Local/Temp/tau-scratch/分享/notes/a.md',
        fileName: 'a.md',
        cloudFileId: 42,
        cloudPath: 'tau/分享/notes/a.md',
        category: '子分类',
        categoryId: '2002',
      },
    });
    await settle();

    const trigger = wrapper.get('[data-testid="cloud-sync-dialog-category-trigger"]');
    expect(trigger.text()).toContain('子分类');
  });

  it('确认同步时把 fileId 与 cloudPath 一并下发（走更新而不是新建）', async () => {
    const wrapper = mount(CloudDocSyncDialog, {
      props: {
        visible: true,
        filePath: 'C:/Users/x/AppData/Local/Temp/tau-scratch/分享/notes/a.md',
        fileName: 'a.md',
        cloudFileId: 42,
        cloudPath: 'tau/分享/notes/a.md',
        categoryId: '1001',
      },
    });
    await settle();
    await wrapper.get('[data-testid="cloud-sync-dialog-confirm"]').trigger('click');
    await settle();

    expect(mocks.syncByPath).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 42,
        cloudPath: 'tau/分享/notes/a.md',
        categoryId: '1001',
      }),
    );
  });

  it('没有云端记录字段时按 docMap 的 fileId 兜底回显分类', async () => {
    const cloudSyncStore = useCloudSyncStore();
    cloudSyncStore.docMap['tau/分享/notes/a.md'] = {
      fileId: 42,
      version: 3,
      contentHash: 'sha256:x',
      updatedAt: null,
      category: '随笔',
      categoryId: '1003',
    };
    const wrapper = mount(CloudDocSyncDialog, {
      props: {
        visible: true,
        filePath: 'C:/Users/x/AppData/Local/Temp/tau-scratch/分享/notes/a.md',
        fileName: 'a.md',
        cloudFileId: 42,
      },
    });
    await settle();

    expect(wrapper.get('[data-testid="cloud-sync-dialog-category-trigger"]').text()).toContain('随笔');
  });
});

describe('CloudDocSyncDialog 新分类多级路径（0.6.26）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.fetchCategories.mockResolvedValue({ ok: true, data: CATEGORY_TREE });
    mocks.syncByPath.mockResolvedValue({ status: 'synced', fileId: 42, version: 3 });
    mocks.ensureCategoryPath.mockResolvedValue({
      ok: true,
      data: { id: 'leaf-id', name: 'Java', created: ['后端', 'Java'], reused: false, chain: ['b-id', 'leaf-id'] },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('新分类输入「后端/Java」：先确保分类路径，再用末级分类同步', async () => {
    const wrapper = mountDialog();
    await settle();

    await wrapper.get('[data-testid="cloud-sync-dialog-new-category"]').setValue('后端/Java');
    await wrapper.get('[data-testid="cloud-sync-dialog-confirm"]').trigger('click');
    await settle();

    expect(mocks.ensureCategoryPath).toHaveBeenCalledWith({ path: '后端/Java' });
    const payload = mocks.syncByPath.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ category: 'Java', categoryId: 'leaf-id' });
  });

  it('多级分类创建失败时不发起同步，并展示可读错误', async () => {
    mocks.ensureCategoryPath.mockResolvedValue({ ok: false, kind: 'unknown', message: '分类最多 3 级，当前输入为 4 级，请精简后再试' });

    const wrapper = mountDialog();
    await settle();
    await wrapper.get('[data-testid="cloud-sync-dialog-new-category"]').setValue('A/B/C/D');
    await wrapper.get('[data-testid="cloud-sync-dialog-confirm"]').trigger('click');
    await settle();

    expect(mocks.syncByPath).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="cloud-sync-dialog-error"]').text()).toContain('最多 3 级');
  });
});
