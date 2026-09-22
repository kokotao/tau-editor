import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ReplacePreviewDialog from '@/components/editor/ReplacePreviewDialog.vue';
import type { WorkspaceReplacePreviewResponse } from '@/lib/tauri';

const preview: WorkspaceReplacePreviewResponse = {
  previewId: 'preview-1',
  totalMatches: 2,
  scannedFiles: 1,
  truncated: false,
  files: [
    {
      relativePath: 'notes.md',
      revision: '1:20',
      truncated: false,
      matches: [
        {
          matchId: 'notes.md#0',
          line: 1,
          column: 1,
          length: 7,
          before: 'release v0.2.6',
          after: 'RELEASE v0.2.6',
        },
        {
          matchId: 'notes.md#1',
          line: 2,
          column: 1,
          length: 7,
          before: 'release v0.2.6',
          after: 'RELEASE v0.2.6',
        },
      ],
    },
  ],
};

describe('ReplacePreviewDialog', () => {
  it('默认全选命中，并可只提交选中的命中项', async () => {
    const wrapper = mount(ReplacePreviewDialog, {
      props: { visible: true, preview },
      global: { stubs: { teleport: true } },
    });

    expect(wrapper.text()).toContain('2 项命中 / 已选 2 项');

    await wrapper.get('[data-testid="replace-preview-match-0-1"] input').setValue(false);
    expect(wrapper.text()).toContain('2 项命中 / 已选 1 项');

    await wrapper.get('[data-testid="replace-preview-apply"]').trigger('click');

    expect(wrapper.emitted('apply')).toEqual([[['notes.md#0']]]);
  });

  it('按文件全选与全不选切换选中状态', async () => {
    const wrapper = mount(ReplacePreviewDialog, {
      props: { visible: true, preview },
      global: { stubs: { teleport: true } },
    });

    await wrapper.get('[data-testid="replace-preview-file-0"]').setValue(false);
    expect(wrapper.text()).toContain('已选 0 项');

    await wrapper.get('[data-testid="replace-preview-toggle-all"]').trigger('click');
    expect(wrapper.text()).toContain('已选 2 项');
  });

  it('展示逐项结果并允许撤销，替换为空时不启用执行', async () => {
    const wrapper = mount(ReplacePreviewDialog, {
      props: {
        visible: true,
        preview,
        results: [
          { relativePath: 'notes.md', status: 'applied', appliedMatchIds: ['notes.md#0'], undoable: true },
          { relativePath: 'other.md', status: 'conflict', appliedMatchIds: [], undoable: false, message: '文件在预览后被修改' },
        ],
        undoId: 'undo-1',
      },
      global: { stubs: { teleport: true } },
    });

    expect(wrapper.get('[data-testid="replace-preview-result-0"]').text()).toContain('已替换');
    expect(wrapper.get('[data-testid="replace-preview-result-1"]').text()).toContain('已被外部修改');

    await wrapper.get('[data-testid="replace-preview-undo"]').trigger('click');
    expect(wrapper.emitted('undo')).toHaveLength(1);

    await wrapper.get('[data-testid="replace-preview-toggle-all"]').trigger('click');
    expect(wrapper.get('[data-testid="replace-preview-apply"]').attributes('disabled')).toBeDefined();
  });
});
