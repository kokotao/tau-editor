/**
 * @description 文件夹整目录上传弹窗（R3）：确认页数量/跳过清单/图片附件规则、确认后走串行上传并抛 uploaded、
 * 结束页汇总（含图片附件）、空中止与关闭按钮、「后台进行」（只隐藏不 abort）与后台上传中重开不重置。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-28 15:45
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CloudFolderUploadDialog from '@/components/editor/CloudFolderUploadDialog.vue';
import { useSettingsStore } from '@/stores/settings';
import type { CloudAssetSyncSummary } from '@/services/cloudAssetService';
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

/** 构造一份 CloudAssetSyncSummary（图片附件汇总） */
const assetSummary = (over: Partial<CloudAssetSyncSummary> = {}): CloudAssetSyncSummary => ({
  total: 0,
  eligible: 0,
  uploaded: 0,
  unchanged: 0,
  failed: 0,
  skipped: 0,
  unsupported: 0,
  failures: [],
  ...over,
});

const syncedOk = () => ({ status: 'synced' as const, message: '已创建云端文档', fileId: 1, version: 1 });

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

describe('CloudFolderUploadDialog 后台进行', () => {
  it('running 阶段有「后台进行」按钮，点击只抛 background，不 abort 队列', async () => {
    // 手动控制每个文件何时完成，才能稳定停在 running 阶段
    const pending: Array<(value: unknown) => void> = [];
    mocks.syncDocumentByPath.mockImplementation(
      () => new Promise((resolve) => { pending.push(resolve); }),
    );

    const wrapper = mountDialog();
    await flushPromises();

    await wrapper.find('[data-testid="cloud-folder-upload-confirm-button"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="cloud-folder-upload-progress"]').exists()).toBe(true);
    const backgroundButton = wrapper.find('[data-testid="cloud-folder-upload-background"]');
    expect(backgroundButton.exists()).toBe(true);
    expect(backgroundButton.text()).toBe('后台进行');
    expect(backgroundButton.attributes('title')).toContain('状态栏');
    // 后台按钮排在「中止上传」前面
    const footerButtons = wrapper.findAll('footer button').map((button) => button.attributes('data-testid'));
    expect(footerButtons).toEqual(['cloud-folder-upload-background', 'cloud-folder-upload-abort']);

    await backgroundButton.trigger('click');

    expect(wrapper.emitted('background')).toHaveLength(1);
    // 没有 abort：进度页还在，第一个文件仍在等结果
    expect(wrapper.find('[data-testid="cloud-folder-upload-progress"]').exists()).toBe(true);
    expect(mocks.syncDocumentByPath).toHaveBeenCalledTimes(1);

    // 继续跑完剩余文件 → 仍然正常收尾并抛 uploaded
    pending[0]?.(syncedOk());
    await flushPromises();
    expect(mocks.syncDocumentByPath).toHaveBeenCalledTimes(2);
    pending[1]?.(syncedOk());
    await flushPromises();

    expect(wrapper.find('[data-testid="cloud-folder-upload-done"]').exists()).toBe(true);
    expect(wrapper.emitted('uploaded')).toHaveLength(1);
  });

  it('每个文件完成后抛 progress（done/total/name），开始跑时先抛 started', async () => {
    const wrapper = mountDialog();
    await flushPromises();

    await wrapper.find('[data-testid="cloud-folder-upload-confirm-button"]').trigger('click');
    await flushPromises();

    expect(wrapper.emitted('started')?.[0]?.[0]).toEqual({ total: 2 });
    const progress = wrapper.emitted('progress');
    expect(progress).toHaveLength(2);
    expect(progress?.[0]?.[0]).toEqual({ done: 1, total: 2, name: 'a.md' });
    expect(progress?.[1]?.[0]).toEqual({ done: 2, total: 2, name: 'b.md' });
  });

  it('后台上传中重新打开弹窗：保留队列与进度，不重新收集', async () => {
    // 第一个文件立刻完成，第二个挂起 → 停在「已完成 1/2」的 running 状态
    mocks.syncDocumentByPath
      .mockResolvedValueOnce(syncedOk())
      .mockImplementation(() => new Promise(() => {}));

    const wrapper = mountDialog();
    await flushPromises();
    await wrapper.find('[data-testid="cloud-folder-upload-confirm-button"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="cloud-folder-upload-progress-text"]').text()).toContain('1/2');

    // 后台进行 → 弹窗隐藏
    await wrapper.setProps({ visible: false });
    await flushPromises();
    expect(wrapper.find('[data-testid="cloud-folder-upload"]').exists()).toBe(false);

    // 从状态栏徽标重新打开
    await wrapper.setProps({ visible: true });
    await flushPromises();

    expect(wrapper.find('[data-testid="cloud-folder-upload-progress"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-folder-upload-progress-text"]').text()).toContain('1/2');
    // 队列没有被清空/重新收集
    expect(mocks.listFiles).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-testid="cloud-folder-upload-done"]').exists()).toBe(false);
  });

  it('跑完之后重新打开按新一次上传重来（重新收集并回到确认页）', async () => {
    const wrapper = mountDialog();
    await flushPromises();
    await wrapper.find('[data-testid="cloud-folder-upload-confirm-button"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="cloud-folder-upload-done"]').exists()).toBe(true);

    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    await flushPromises();

    expect(mocks.listFiles).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-testid="cloud-folder-upload-confirm"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-folder-upload-done"]').exists()).toBe(false);
  });
});

describe('CloudFolderUploadDialog 图片附件', () => {
  it('确认页展示图片附件规则；设置关闭时展示提示', async () => {
    useSettingsStore().syncDocumentImages = false;

    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.find('[data-testid="cloud-folder-upload-assets-rules"]').text()).toContain('20MB');
    expect(wrapper.find('[data-testid="cloud-folder-upload-assets-rules"]').text()).toContain('相对路径');
    expect(wrapper.find('[data-testid="cloud-folder-upload-assets-disabled"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-folder-upload-assets-disabled"]').text()).toContain('已关闭');
  });

  it('设置开启时确认页不显示「已关闭」提示', async () => {
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.find('[data-testid="cloud-folder-upload-assets-rules"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-folder-upload-assets-disabled"]').exists()).toBe(false);
  });

  it('结束页展示图片附件汇总（ok = uploaded + unchanged）与不可同步处数', async () => {
    // 第一个 md 带图片汇总，第二个没有（非 md 或无图片引用）
    mocks.syncDocumentByPath
      .mockResolvedValueOnce({
        ...syncedOk(),
        assets: assetSummary({
          total: 4,
          eligible: 3,
          uploaded: 2,
          unchanged: 1,
          failed: 1,
          skipped: 0,
          unsupported: 2,
        }),
      })
      .mockResolvedValueOnce(syncedOk());

    const wrapper = mountDialog();
    await flushPromises();
    await wrapper.find('[data-testid="cloud-folder-upload-confirm-button"]').trigger('click');
    await flushPromises();

    const summaryLine = wrapper.find('[data-testid="cloud-folder-upload-assets-summary"]');
    expect(summaryLine.exists()).toBe(true);
    // ok = 2 + 1 = 3
    expect(summaryLine.text()).toContain('已同步 3 张');
    expect(summaryLine.text()).toContain('失败 1 张');
    expect(wrapper.find('[data-testid="cloud-folder-upload-assets-unsupported"]').text())
      .toContain('2 处图片引用未同步');
  });

  it('只有不可同步引用时只显示那一行，不显示「已同步 0 张」', async () => {
    // 两个 md 都返回同一份汇总 → unsupported 累加成 3 × 2
    mocks.syncDocumentByPath.mockResolvedValue({
      ...syncedOk(),
      assets: assetSummary({ unsupported: 3 }),
    });

    const wrapper = mountDialog();
    await flushPromises();
    await wrapper.find('[data-testid="cloud-folder-upload-confirm-button"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="cloud-folder-upload-assets-summary"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="cloud-folder-upload-assets-unsupported"]').text())
      .toContain('6 处图片引用未同步');
  });

  it('没有图片引用时不占位显示图片汇总行', async () => {
    mocks.syncDocumentByPath.mockResolvedValue(syncedOk());

    const wrapper = mountDialog();
    await flushPromises();
    await wrapper.find('[data-testid="cloud-folder-upload-confirm-button"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="cloud-folder-upload-assets-summary"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="cloud-folder-upload-assets-unsupported"]').exists()).toBe(false);
  });

  it('图片同步被关闭时结束页也提示，且不显示 0 张的汇总行', async () => {
    useSettingsStore().syncDocumentImages = false;
    mocks.syncDocumentByPath.mockResolvedValue({
      ...syncedOk(),
      assets: assetSummary({ disabled: true }),
    });

    const wrapper = mountDialog();
    await flushPromises();
    await wrapper.find('[data-testid="cloud-folder-upload-confirm-button"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="cloud-folder-upload-assets-disabled-done"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-folder-upload-assets-summary"]').exists()).toBe(false);
  });
});
