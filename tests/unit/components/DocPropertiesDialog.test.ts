/**
 * @description 文档属性弹窗：默认 PRIVATE、只在有改动时提交、分享状态展示。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 19:55
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  getDoc: vi.fn(),
  saveDoc: vi.fn(),
  fetchCategories: vi.fn(),
  shareStatus: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return { ...actual, isTauriApp: () => true };
});

vi.mock('@/services/cloudDocService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudDocService')>();
  return { ...actual, getCloudDoc: mocks.getDoc, saveCloudDoc: mocks.saveDoc };
});

vi.mock('@/services/cloudCategoryService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudCategoryService')>();
  return { ...actual, fetchManagedCategories: mocks.fetchCategories };
});

vi.mock('@/services/cloudShareService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudShareService')>();
  return { ...actual, getShareStatus: mocks.shareStatus };
});

import DocPropertiesDialog from '@/components/editor/DocPropertiesDialog.vue';

const DOC = {
  fileId: 42,
  path: 'tau/ws/notes/a.md',
  title: 'a.md',
  contentHash: 'sha256:x',
  size: 2048,
  version: 5,
  category: '笔记',
  categoryId: 1001,
  tags: '旧标签',
  visibility: 'PRIVATE',
  publishedArticleId: null,
  updatedAt: '2026-10-25T09:00:00Z',
};

describe('DocPropertiesDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.getDoc.mockResolvedValue({ ok: true, data: { ...DOC, content: 'x', createdAt: '2026-10-20T09:00:00Z' } });
    mocks.saveDoc.mockResolvedValue({
      ok: true,
      data: { fileId: 42, version: 6, contentHash: 'sha256:y', size: 2048, updatedAt: null },
    });
    mocks.fetchCategories.mockResolvedValue({
      ok: true,
      data: [{ id: '1001', name: '笔记', parentId: null, children: [{ id: '2002', name: '子分类', parentId: '1001', children: [] }] }],
    });
    mocks.shareStatus.mockResolvedValue({ ok: true, data: { shared: false } });
  });
  afterEach(() => vi.clearAllMocks());

  it('展示元信息与分类/标签/可见性，默认可见性私有', async () => {
    const wrapper = mount(DocPropertiesDialog, { global: { stubs: { teleport: true } }, props: { visible: true, doc: DOC } });
    await flushPromises();

    expect(wrapper.get('[data-testid="doc-properties-name"]').text()).toBe('a.md');
    expect(wrapper.get('[data-testid="doc-properties-path"]').text()).toBe('tau/ws/notes/a.md');
    expect(wrapper.get('[data-testid="doc-properties-version"]').text()).toBe('v5');
    expect((wrapper.get('[data-testid="doc-properties-visibility"]').element as HTMLSelectElement).value).toBe('PRIVATE');
    expect((wrapper.get('[data-testid="doc-properties-tags"]').element as HTMLInputElement).value).toBe('旧标签');
  });

  it('没有改动时不提交，只提示', async () => {
    const wrapper = mount(DocPropertiesDialog, { global: { stubs: { teleport: true } }, props: { visible: true, doc: DOC } });
    await flushPromises();

    await wrapper.get('[data-testid="doc-properties-save"]').trigger('click');
    await flushPromises();

    expect(mocks.saveDoc).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="doc-properties-notice"]').text()).toContain('没有改动');
  });

  it('改了可见性才提交，且只带改动字段', async () => {
    const wrapper = mount(DocPropertiesDialog, { global: { stubs: { teleport: true } }, props: { visible: true, doc: DOC } });
    await flushPromises();

    await wrapper.get('[data-testid="doc-properties-visibility"]').setValue('PUBLIC');
    await wrapper.get('[data-testid="doc-properties-save"]').trigger('click');
    await flushPromises();

    expect(mocks.saveDoc).toHaveBeenCalledTimes(1);
    const payload = mocks.saveDoc.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      path: 'tau/ws/notes/a.md',
      baseVersion: 5,
      visibility: 'PUBLIC',
    });
    expect(payload).not.toHaveProperty('tags');
    expect(wrapper.emitted('saved')).toHaveLength(1);
  });

  it('已分享时显示分享状态与链接', async () => {
    mocks.shareStatus.mockResolvedValue({
      ok: true,
      data: { shared: true, shareUrl: 'https://note.lizipro.cn/s/tok123456789012' },
    });
    const wrapper = mount(DocPropertiesDialog, { global: { stubs: { teleport: true } }, props: { visible: true, doc: DOC } });
    await flushPromises();

    const shared = wrapper.get('[data-testid="doc-properties-shared"]');
    expect(shared.text()).toContain('已分享');
    expect(shared.text()).toContain('https://note.lizipro.cn/s/');
  });
});


describe('DocPropertiesDialog 渲染位置与宽度（0.6.24）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.getDoc.mockResolvedValue({ ok: true, data: { ...DOC, content: 'x', createdAt: null } });
    mocks.fetchCategories.mockResolvedValue({ ok: true, data: [] });
    mocks.shareStatus.mockResolvedValue({ ok: true, data: { shared: false } });
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('弹窗 Teleport 到 body，宽度有下限且标题不逐字换行', async () => {
    const wrapper = mount(DocPropertiesDialog, { props: { visible: true, doc: DOC } });
    await flushPromises();

    expect(wrapper.find('[data-testid="doc-properties-dialog"]').exists()).toBe(false);
    const inBody = document.body.querySelector('[data-testid="doc-properties-dialog"]') as HTMLElement;
    expect(inBody).not.toBeNull();

    const panel = inBody.querySelector('.cloud-props') as HTMLElement;
    expect(panel.style.minWidth).toBe('320px');

    const title = inBody.querySelector('[data-testid="doc-properties-title"]') as HTMLElement;
    expect(title.style.whiteSpace).toBe('nowrap');
    wrapper.unmount();
  });
});
