/**
 * @description 版本历史弹窗：标题带文件名、当前版本高亮、恢复调用接口。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 19:50
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  listVersions: vi.fn(),
  previewVersion: vi.fn(),
  restoreVersion: vi.fn(),
  openExternalLink: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauriApp: () => true,
    appCommands: {
      ...actual.appCommands,
      openExternalLink: mocks.openExternalLink,
    },
  };
});

vi.mock('@/services/cloudDocService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudDocService')>();
  return {
    ...actual,
    listCloudDocVersions: mocks.listVersions,
    previewCloudDocVersion: mocks.previewVersion,
    restoreCloudDocVersion: mocks.restoreVersion,
  };
});

import VersionHistoryDialog from '@/components/editor/VersionHistoryDialog.vue';
import { serializeMindMapDocument, createEmptyMindMapDocument } from '@/services/mindmapService';

async function waitForPreview(wrapper: ReturnType<typeof mount>) {
  for (let index = 0; index < 20; index += 1) {
    await flushPromises();
    if (wrapper.find('[data-testid="version-history-preview-content"]').exists()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const VERSIONS = [
  { versionId: 102, version: 3, contentHash: 'sha256:3', size: 2048, remark: '修了个错字', createdAt: '2026-10-24T10:00:00Z' },
  { versionId: 101, version: 2, contentHash: 'sha256:2', size: 1024, remark: null, createdAt: '2026-10-23T10:00:00Z' },
];

describe('VersionHistoryDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.listVersions.mockResolvedValue({ ok: true, data: VERSIONS });
    mocks.restoreVersion.mockResolvedValue({
      ok: true,
      data: { fileId: 42, version: 4, contentHash: 'sha256:4', size: 2048, updatedAt: null },
    });
  });
  afterEach(() => vi.clearAllMocks());

  it('标题写清文件名，列表展示版本/时间/大小/说明', async () => {
    const wrapper = mount(VersionHistoryDialog, {
      global: { stubs: { teleport: true } },
      props: { visible: true, fileId: 42, fileName: '读书笔记.md', currentVersion: 3 },
    });
    await flushPromises();

    expect(wrapper.get('[data-testid="version-history-title"]').text()).toContain('读书笔记.md');
    const rows = wrapper.findAll('[data-testid^="version-history-row-"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain('版本 v3');
    expect(rows[0]!.text()).toContain('2.0 KB');
    expect(rows[0]!.text()).toContain('修了个错字');
  });

  it('当前版本高亮且不能恢复', async () => {
    const wrapper = mount(VersionHistoryDialog, {
      global: { stubs: { teleport: true } },
      props: { visible: true, fileId: 42, fileName: 'a.md', currentVersion: 3 },
    });
    await flushPromises();

    expect(wrapper.get('[data-testid="version-history-row-3"]').classes()).toContain('is-current');
    const currentBtn = wrapper.get('[data-testid="version-history-restore-3"]');
    expect((currentBtn.element as HTMLButtonElement).disabled).toBe(true);
  });

  it('恢复旧版本调用接口并 emit restored', async () => {
    const wrapper = mount(VersionHistoryDialog, {
      global: { stubs: { teleport: true } },
      props: { visible: true, fileId: 42, fileName: 'a.md', currentVersion: 3 },
    });
    await flushPromises();

    await wrapper.get('[data-testid="version-history-restore-2"]').trigger('click');
    await flushPromises();

    expect(mocks.restoreVersion).toHaveBeenCalledWith(42, 101);
    expect(wrapper.emitted('restored')?.[0]).toEqual([4]);
    expect(wrapper.get('[data-testid="version-history-notice"]').text()).toContain('已恢复到 v4');
  });

  it('接口失败显示可读错误', async () => {
    mocks.listVersions.mockResolvedValue({ ok: false, kind: 'network', message: '连不上服务器' });
    const wrapper = mount(VersionHistoryDialog, {
      global: { stubs: { teleport: true } },
      props: { visible: true, fileId: 42, fileName: 'a.md', currentVersion: 3 },
    });
    await flushPromises();

    expect(wrapper.get('[data-testid="version-history-error"]').text()).toContain('连不上服务器');
  });

  it('预览旧版本时显示只读正文', async () => {
    mocks.previewVersion.mockResolvedValue({
      ok: true,
      data: {
        versionId: 101,
        version: 2,
        contentHash: 'sha256:2',
        size: 1024,
        createdAt: '2026-10-23T10:00:00Z',
        content: '# 历史正文',
      },
    });
    const wrapper = mount(VersionHistoryDialog, {
      global: { stubs: { teleport: true } },
      props: { visible: true, fileId: 42, fileName: 'a.md', currentVersion: 3 },
    });
    await flushPromises();

    await wrapper.get('[data-testid="version-history-preview-2"]').trigger('click');
    await waitForPreview(wrapper);

    expect(mocks.previewVersion).toHaveBeenCalledWith(42, 101);
    const content = wrapper.get('[data-testid="version-history-preview-content"]');
    expect(content.attributes('data-preview-format')).toBe('markdown');
    expect(content.find('h1').text()).toBe('历史正文');
    expect(content.text()).not.toContain('# 历史正文');
  });

  it('非 Markdown 历史版本保持源码文本预览', async () => {
    mocks.previewVersion.mockResolvedValue({
      ok: true,
      data: {
        versionId: 101,
        version: 2,
        contentHash: 'sha256:2',
        size: 1024,
        createdAt: '2026-10-23T10:00:00Z',
        content: 'const answer = 42;',
      },
    });
    const wrapper = mount(VersionHistoryDialog, {
      global: { stubs: { teleport: true } },
      props: { visible: true, fileId: 42, fileName: 'answer.ts', currentVersion: 3 },
    });
    await flushPromises();

    await wrapper.get('[data-testid="version-history-preview-2"]').trigger('click');
    await waitForPreview(wrapper);

    const content = wrapper.get('[data-testid="version-history-preview-content"]');
    expect(content.attributes('data-preview-format')).toBe('text');
    expect(content.element.tagName).toBe('PRE');
    expect(content.text()).toBe('const answer = 42;');
  });

  it('Markdown 外链拦截 WebView 导航并交给系统浏览器', async () => {
    mocks.previewVersion.mockResolvedValue({
      ok: true,
      data: {
        versionId: 101,
        version: 2,
        contentHash: 'sha256:2',
        size: 1024,
        createdAt: '2026-10-23T10:00:00Z',
        content: '[lizi](https://note.lizipro.cn/)',
      },
    });
    const wrapper = mount(VersionHistoryDialog, {
      global: { stubs: { teleport: true } },
      props: { visible: true, fileId: 42, fileName: 'a.md', currentVersion: 3 },
    });
    await flushPromises();

    await wrapper.get('[data-testid="version-history-preview-2"]').trigger('click');
    await waitForPreview(wrapper);
    const link = wrapper.get('[data-testid="version-history-preview-content"] a');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.element.dispatchEvent(event);
    await flushPromises();

    expect(event.defaultPrevented).toBe(true);
    expect(mocks.openExternalLink).toHaveBeenCalledWith('https://note.lizipro.cn/');
  });

  it('思维导图历史版本按导图渲染，并可切换原始尺寸与源码', async () => {
    const mindmap = createEmptyMindMapDocument('历史导图');
    mocks.previewVersion.mockResolvedValue({
      ok: true,
      data: {
        versionId: 101,
        version: 2,
        contentHash: 'sha256:2',
        size: 1024,
        createdAt: '2026-10-23T10:00:00Z',
        content: serializeMindMapDocument(mindmap),
      },
    });
    const wrapper = mount(VersionHistoryDialog, {
      global: { stubs: { teleport: true } },
      props: { visible: true, fileId: 42, fileName: 'history.taumap', currentVersion: 3 },
    });
    await flushPromises();

    await wrapper.get('[data-testid="version-history-preview-2"]').trigger('click');
    for (let index = 0; index < 20; index += 1) {
      await flushPromises();
      if (wrapper.find('[data-testid="version-history-preview-mindmap"]').exists()) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    const preview = wrapper.get('[data-testid="version-history-preview-mindmap"]');
    expect(preview.find('svg').exists()).toBe(true);
    expect(wrapper.find('[data-testid="version-history-preview-content"]').exists()).toBe(false);

    await wrapper.get('[data-testid="version-history-mindmap-fit-toggle"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="version-history-preview-mindmap"]').classes()).toContain('is-actual-size');

    await wrapper.get('[data-testid="version-history-mindmap-source-toggle"]').trigger('click');
    expect(wrapper.get('[data-testid="version-history-preview-content"]').attributes('data-preview-format')).toBe('text');
  });

  it('预览失败时保留版本列表并只显示预览错误', async () => {
    mocks.previewVersion.mockResolvedValue({ ok: false, kind: 'unknown', message: '路径不存在' });
    const wrapper = mount(VersionHistoryDialog, {
      global: { stubs: { teleport: true } },
      props: { visible: true, fileId: 42, fileName: 'a.md', currentVersion: 3 },
    });
    await flushPromises();

    await wrapper.get('[data-testid="version-history-preview-2"]').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('[data-testid^="version-history-row-"]')).toHaveLength(2);
    expect(wrapper.find('[data-testid="version-history-error"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="version-history-preview-error"]').text()).toContain('路径不存在');
  });
});


describe('VersionHistoryDialog 渲染位置与宽度（0.6.24）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.listVersions.mockResolvedValue({ ok: true, data: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('弹窗 Teleport 到 body，宽度有下限且标题不逐字换行', async () => {
    const wrapper = mount(VersionHistoryDialog, {
      props: { visible: true, fileId: 42, fileName: '读书笔记.md', currentVersion: 3 },
    });
    await flushPromises();

    // 不在组件内部渲染（避免被侧栏容器压窄）
    expect(wrapper.find('[data-testid="version-history-dialog"]').exists()).toBe(false);
    const inBody = document.body.querySelector('[data-testid="version-history-dialog"]') as HTMLElement;
    expect(inBody).not.toBeNull();

    const panel = inBody.querySelector('.cloud-hist') as HTMLElement;
    expect(panel.style.minWidth).toBe('320px');

    const title = inBody.querySelector('[data-testid="version-history-title"]') as HTMLElement;
    expect(title.style.whiteSpace).toBe('nowrap');
    expect(title.textContent).not.toContain('\n');
    wrapper.unmount();
  });
});
