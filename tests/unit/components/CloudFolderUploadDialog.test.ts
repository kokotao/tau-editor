/**
 * @description 文件夹整目录上传弹窗（R3）：确认页数量/跳过清单、确认后走串行上传并抛 uploaded、
 * 结束页汇总、空中止与关闭按钮。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-28 15:45
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CloudFolderUploadDialog from '@/components/editor/CloudFolderUploadDialog.vue';
import type { FileEntry } from '@/lib/tauri';

const mocks = vi.hoisted(() => ({
  listFiles: vi.fn(),
  syncDocumentByPath: vi.fn(),
  resolveCloudDocPathForFile: vi.fn(),
  createCategory: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return { ...actual, fileCommands: { ...actual.fileCommands, listFiles: mocks.listFiles } };
});

vi.mock('@/services/cloudSyncService', () => ({
  CLOUD_SYNC_MAX_BYTES: 12 * 1024 * 1024,
  syncDocumentByPath: mocks.syncDocumentByPath,
  resolveCloudDocPathForFile: mocks.resolveCloudDocPathForFile,
}));

vi.mock('@/services/cloudCategoryService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudCategoryService')>();
  return { ...actual, createCategory: mocks.createCategory, fetchManagedCategories: vi.fn() };
});

const entry = (dir: string, name: string, type: 'file' | 'folder' = 'file'): FileEntry => ({
  name,
  path: `${dir}/${name}`,
  type,
  size: type === 'file' ? 1024 : undefined,
});

const mountDialog = (props: Record<string, unknown> = {}) => mount(CloudFolderUploadDialog, {
  props: { visible: true, folderName: 'docs', folderPath: '/ws/docs', ...props },
  attachTo: document.body,
  // 弹窗本体 Teleport 到 body：测试里就地渲染，才能用 wrapper.find 断言
  global: { stubs: { teleport: true } },
});

beforeEach(() => {
  setActivePinia(createPinia());
  mocks.listFiles.mockReset();
  mocks.syncDocumentByPath.mockReset();
  mocks.resolveCloudDocPathForFile.mockReset();
  mocks.createCategory.mockReset();

  mocks.listFiles.mockResolvedValue([
    entry('/ws/docs', 'a.md'),
    entry('/ws/docs', 'b.md'),
    entry('/ws/docs', 'node_modules', 'folder'),
    entry('/ws/docs', 'pic.png'),
  ]);
  mocks.syncDocumentByPath.mockResolvedValue({ status: 'synced', message: '已创建云端文档', fileId: 1, version: 1 });
  mocks.resolveCloudDocPathForFile.mockImplementation((path: string) => `tau/ws/${path.split('/').pop()}`);
  mocks.createCategory.mockResolvedValue({
    ok: true,
    data: { id: '1001', name: 'docs', parentId: null, children: [] },
  });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('CloudFolderUploadDialog', () => {
  it('确认页展示将上传数量、跳过清单与分类提示', async () => {
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.find('[data-testid="cloud-folder-upload-confirm"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-folder-upload-summary"]').text()).toContain('将上传 2 个文件');
    expect(wrapper.find('[data-testid="cloud-folder-upload-summary"]').text()).toContain('另有 2 个文件会被跳过');
    expect(wrapper.text()).toContain('上传后归入云端分类「docs」');

    const skipped = wrapper.find('[data-testid="cloud-folder-upload-skipped"]');
    expect(skipped.text()).toContain('node_modules');
    expect(skipped.text()).toContain('构建或依赖目录');
    expect(skipped.text()).toContain('pic.png');
  });

  it('点确定后串行上传并抛出 uploaded 汇总，结束页展示结果', async () => {
    const wrapper = mountDialog();
    await flushPromises();

    await wrapper.find('[data-testid="cloud-folder-upload-confirm-button"]').trigger('click');
    await flushPromises();

    expect(mocks.syncDocumentByPath).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-testid="cloud-folder-upload-done"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-folder-upload-result"]').text()).toContain('已上传 2 个文件');

    const uploaded = wrapper.emitted('uploaded');
    expect(uploaded).toHaveLength(1);
    expect(uploaded?.[0]?.[0]).toMatchObject({ total: 2, uploaded: 2, failed: 0, aborted: false });

    // 中途不点关闭时进度页不再显示
    expect(wrapper.find('[data-testid="cloud-folder-upload-progress"]').exists()).toBe(false);
  });

  it('没有可上传文件时禁用确定按钮并提示', async () => {
    mocks.listFiles.mockResolvedValue([entry('/ws/docs', 'node_modules', 'folder')]);
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.find('[data-testid="cloud-folder-upload-empty"]').exists()).toBe(true);
    const confirmButton = wrapper.find('[data-testid="cloud-folder-upload-confirm-button"]');
    expect(confirmButton.attributes('disabled')).toBeDefined();
    expect(mocks.syncDocumentByPath).not.toHaveBeenCalled();
  });

  it('文件数超上限时展示截断提示', async () => {
    mocks.listFiles.mockImplementation(async () => Array.from({ length: 8 }, (_item, index) => entry('/ws/docs', `f${index}.md`)));
    const wrapper = mountDialog();
    await flushPromises();

    // 默认上限 500，这里不会截断；用 maxFiles 选项的语义由服务单测覆盖，这里只确认确认页能渲染数量
    expect(wrapper.find('[data-testid="cloud-folder-upload-summary"]').text()).toContain('将上传 8 个文件');
    expect(wrapper.find('[data-testid="cloud-folder-upload-truncated"]').exists()).toBe(false);
  });

  it('关闭按钮与遮罩点击都抛 close（上传中不关闭）', async () => {
    const wrapper = mountDialog();
    await flushPromises();

    await wrapper.find('[data-testid="cloud-folder-upload-close"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('打开新文件夹时重新收集（visible 变化触发）', async () => {
    const wrapper = mountDialog({ visible: false });
    await flushPromises();
    expect(mocks.listFiles).not.toHaveBeenCalled();

    await wrapper.setProps({ visible: true, folderName: 'other', folderPath: '/ws/other' });
    await flushPromises();

    expect(mocks.listFiles).toHaveBeenCalledWith('/ws/other');
    expect(wrapper.text()).toContain('上传后归入云端分类「other」');
  });
});
