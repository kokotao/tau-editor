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

  it('选择已有分类后 payload 带 category 与数字 categoryId', async () => {
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
        categoryId: 2002,
        overwrite: false,
      }),
    );
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

  it('同步成功：关闭弹窗并弹居中标示 toast', async () => {
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
    const toast = useCenterToastStore();
    expect(toast.visible).toBe(true);
    expect(toast.message).toContain('v7');
  });
});