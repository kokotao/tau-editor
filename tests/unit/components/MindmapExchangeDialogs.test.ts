/**
 * 阶段 3 交换 UI 测试：
 * 导入预览对话框、导出格式对话框，以及 MindmapStage 的导入/导出接线。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MindmapImportPreviewDialog from '@/components/editor/mindmap/MindmapImportPreviewDialog.vue';
import MindmapExportDialog from '@/components/editor/mindmap/MindmapExportDialog.vue';
import MindmapStage from '@/components/editor/mindmap/MindmapStage.vue';
import { createEmptyMindMapDocument, serializeMindMapDocument } from '@/services/mindmapService';
import type { MindmapImportPreview } from '@/services/mindmap/importExportService';
import type { MindMapDocument } from '@/types/mindmap';

vi.mock('@/services/mindmapFileIoService', () => ({
  pickMindmapImportFile: vi.fn(),
  readMindmapImportFile: vi.fn(),
  pickMindmapExportPath: vi.fn(),
  writeMindmapExportFile: vi.fn(),
  looksLikeZipBytes: vi.fn(() => false),
  MINDMAP_IMPORT_EXTENSIONS: [],
}));

import * as io from '@/services/mindmapFileIoService';

function treeDoc(): MindMapDocument {
  const doc = createEmptyMindMapDocument('组件测试');
  const root = doc.rootTopicId;
  doc.topics.a = { id: 'a', parentId: root, childIds: [], text: '分支 A' };
  const rootTopic = doc.topics[root];
  if (rootTopic) rootTopic.childIds = ['a'];
  return doc;
}

function importPreview(overrides: Partial<MindmapImportPreview> = {}): MindmapImportPreview {
  return {
    ok: true,
    formatId: 'markdown',
    formatName: 'Markdown 大纲',
    version: '1',
    supportLevel: 'compatible',
    document: treeDoc(),
    lossy: ['行内样式已丢弃'],
    warnings: [],
    detection: {
      status: 'identified',
      formatId: 'markdown',
      candidates: ['markdown'],
      reason: 'test',
    },
    ...overrides,
  };
}

describe('MindmapImportPreviewDialog', () => {
  it('展示格式、版本与有损说明，确认可用', () => {
    const wrapper = mount(MindmapImportPreviewDialog, {
      props: { visible: true, fileName: 'a.md', preview: importPreview() },
    });
    expect(wrapper.find('[data-testid="mm-import-dialog"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mm-import-format"]').text()).toContain('Markdown');
    expect(wrapper.text()).toContain('可编辑（可能有损）');
    expect(wrapper.text()).toContain('行内样式已丢弃');
    expect(
      wrapper.find('[data-testid="mm-import-confirm"]').attributes('disabled'),
    ).toBeUndefined();
  });

  it('失败预览展示错误且确认按钮禁用', () => {
    const preview = importPreview({
      ok: false,
      document: null,
      lossy: [],
      error: { category: 'corrupt-content', message: '文件已损坏' },
    });
    const wrapper = mount(MindmapImportPreviewDialog, {
      props: { visible: true, fileName: 'bad.taumap', preview },
    });
    expect(wrapper.find('[data-testid="mm-import-error"]').text()).toContain('文件已损坏');
    expect(
      wrapper.find('[data-testid="mm-import-confirm"]').attributes('disabled'),
    ).toBeDefined();
  });

  it('确认与取消分别发出事件', async () => {
    const wrapper = mount(MindmapImportPreviewDialog, {
      props: { visible: true, fileName: 'a.md', preview: importPreview() },
    });
    await wrapper.find('[data-testid="mm-import-confirm"]').trigger('click');
    expect(wrapper.emitted('confirm')).toBeTruthy();
    await wrapper.find('[data-testid="mm-import-cancel"]').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('不可见时不渲染', () => {
    const wrapper = mount(MindmapImportPreviewDialog, {
      props: { visible: false, fileName: 'a.md', preview: importPreview() },
    });
    expect(wrapper.find('[data-testid="mm-import-dialog"]').exists()).toBe(false);
  });
});

describe('MindmapExportDialog', () => {
  it('列出 7 种导出格式，默认 taumap', () => {
    const wrapper = mount(MindmapExportDialog, { props: { visible: true } });
    const radios = wrapper.findAll('input[name="mm-export-format"]');
    expect(radios).toHaveLength(7);
    expect(wrapper.find('[data-testid="mm-export-png-options"]').exists()).toBe(false);
  });

  it('选择 PNG 后显示背景与倍率选项，确认携带参数', async () => {
    const wrapper = mount(MindmapExportDialog, { props: { visible: true } });
    await wrapper.find('[data-testid="mm-export-format-png"]').setValue(true);
    await flushPromises();
    expect(wrapper.find('[data-testid="mm-export-png-options"]').exists()).toBe(true);

    await wrapper.find('[data-testid="mm-export-bg-white"]').setValue(true);
    const scale3 = wrapper.findAll('input[name="mm-export-scale"]')[2];
    await scale3!.setValue(true);

    await wrapper.find('[data-testid="mm-export-confirm"]').trigger('click');
    const emitted = wrapper.emitted('confirm')?.[0]?.[0] as {
      formatId: string;
      background: string;
      scale: number;
    };
    expect(emitted.formatId).toBe('png');
    expect(emitted.background).toBe('#ffffff');
    expect(emitted.scale).toBe(3);
  });

  it('默认导出 taumap', async () => {
    const wrapper = mount(MindmapExportDialog, { props: { visible: true } });
    await wrapper.find('[data-testid="mm-export-confirm"]').trigger('click');
    const emitted = wrapper.emitted('confirm')?.[0]?.[0] as { formatId: string };
    expect(emitted.formatId).toBe('taumap');
  });
});

describe('MindmapStage 导入/导出接线', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('导入 Markdown：预览 → 确认 → 替换文档并 emit change', async () => {
    vi.mocked(io.pickMindmapImportFile).mockResolvedValue('/tmp/a.md');
    vi.mocked(io.readMindmapImportFile).mockResolvedValue({
      path: '/tmp/a.md',
      fileName: 'a.md',
      content: '# 导入根\n- 子一\n- 子二',
    });

    const wrapper = mount(MindmapStage, {
      props: {
        tabId: 'tab-mm',
        documentJson: serializeMindMapDocument(treeDoc()),
        fileName: 'test.taumap',
        documentKind: 'mindmap',
      },
    });

    await wrapper.find('[data-testid="mm-import"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="mm-import-dialog"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mm-import-format"]').text()).toContain('Markdown');

    await wrapper.find('[data-testid="mm-import-confirm"]').trigger('click');
    await flushPromises();

    const emitted = wrapper.emitted('change');
    expect(emitted).toBeTruthy();
    const json = emitted![emitted!.length - 1]![0] as string;
    const parsed = JSON.parse(json) as MindMapDocument;
    expect(parsed.title).toBe('导入根');
    expect(Object.keys(parsed.topics)).toHaveLength(3);
    expect(wrapper.find('[data-testid="mm-import-dialog"]').exists()).toBe(false);
  });

  it('导入失败：预览展示错误，文档保持不变且不 emit change', async () => {
    vi.mocked(io.pickMindmapImportFile).mockResolvedValue('/tmp/bad.taumap');
    vi.mocked(io.readMindmapImportFile).mockResolvedValue({
      path: '/tmp/bad.taumap',
      fileName: 'bad.taumap',
      content: '{ broken',
    });

    const wrapper = mount(MindmapStage, {
      props: {
        tabId: 'tab-mm',
        documentJson: serializeMindMapDocument(treeDoc()),
        fileName: 'test.taumap',
        documentKind: 'mindmap',
      },
    });

    await wrapper.find('[data-testid="mm-import"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="mm-import-error"]').exists()).toBe(true);
    await wrapper.find('[data-testid="mm-import-confirm"]').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('change')).toBeFalsy();
    expect(wrapper.findAll('.mm-node')).toHaveLength(2);
  });

  it('导出 Markdown：选择格式 → 写盘调用携带正确内容', async () => {
    vi.mocked(io.pickMindmapExportPath).mockResolvedValue('/tmp/out.md');
    vi.mocked(io.writeMindmapExportFile).mockResolvedValue();

    const wrapper = mount(MindmapStage, {
      props: {
        tabId: 'tab-mm',
        documentJson: serializeMindMapDocument(treeDoc()),
        fileName: 'test.taumap',
        documentKind: 'mindmap',
      },
    });

    await wrapper.find('[data-testid="mm-export"]').trigger('click');
    expect(wrapper.find('[data-testid="mm-export-dialog"]').exists()).toBe(true);

    await wrapper.find('[data-testid="mm-export-format-markdown"]').setValue(true);
    await wrapper.find('[data-testid="mm-export-confirm"]').trigger('click');
    await flushPromises();

    expect(io.pickMindmapExportPath).toHaveBeenCalled();
    expect(io.writeMindmapExportFile).toHaveBeenCalledTimes(1);
    const [path, payload] = vi.mocked(io.writeMindmapExportFile).mock.calls[0]!;
    expect(path).toBe('/tmp/out.md');
    expect(payload.kind).toBe('text');
    expect((payload as { text: string }).text).toContain('- 分支 A');
  });

  it('导出取消（未选保存路径）不写盘', async () => {
    vi.mocked(io.pickMindmapExportPath).mockResolvedValue(null);

    const wrapper = mount(MindmapStage, {
      props: {
        tabId: 'tab-mm',
        documentJson: serializeMindMapDocument(treeDoc()),
        fileName: 'test.taumap',
        documentKind: 'mindmap',
      },
    });

    await wrapper.find('[data-testid="mm-export"]').trigger('click');
    await wrapper.find('[data-testid="mm-export-confirm"]').trigger('click');
    await flushPromises();
    expect(io.writeMindmapExportFile).not.toHaveBeenCalled();
  });
});