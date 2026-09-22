/**
 * ExternalChangeDialog 单元测试
 * 覆盖可见性、冲突信息展示与三个处理动作的事件派发
 */

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ExternalChangeDialog from '@/components/editor/ExternalChangeDialog.vue';
import type { FileConflictRecord } from '@/stores/fileConflicts';

const conflict: FileConflictRecord = {
  path: '/ws/notes.md',
  kind: 'modified',
  detectedAt: 1_700_000_000_000,
  diskModifiedMs: 1_700_000_100_000,
  diskSize: 512,
  baselineModifiedMs: 1_700_000_000_000,
};

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(ExternalChangeDialog, {
    props: { visible: true, conflict, ...props },
    global: { stubs: { teleport: true } },
  });
}

describe('ExternalChangeDialog', () => {
  it('visible 为 false 或没有冲突时不渲染', () => {
    expect(mountDialog({ visible: false }).find('[data-testid="external-change-dialog"]').exists()).toBe(false);
    expect(mountDialog({ conflict: null }).find('[data-testid="external-change-dialog"]').exists()).toBe(false);
  });

  it('展示文件名、变更类型与磁盘时间', () => {
    const wrapper = mountDialog({ fileName: 'notes.md', locale: 'zh-CN' });

    expect(wrapper.get('[data-testid="external-change-dialog"]').attributes('aria-label')).toBe(
      '文件已在外部修改',
    );
    expect(wrapper.text()).toContain('notes.md');
    expect(wrapper.get('[data-testid="external-change-kind"]').text()).toBe('修改');
    expect(wrapper.get('[data-testid="external-change-disk"]').text()).not.toBe('—');
  });

  it('缺少文件名时回退到冲突路径且时间显示占位符', () => {
    const wrapper = mountDialog({
      conflict: { ...conflict, diskModifiedMs: null },
      locale: 'en-US',
    });

    expect(wrapper.text()).toContain('/ws/notes.md');
    expect(wrapper.get('[data-testid="external-change-disk"]').text()).toBe('—');
    expect(wrapper.get('[data-testid="external-change-kind"]').text()).toBe('Modified');
  });

  it('点击三个动作分别派发 reload / keep / saveAs', async () => {
    const wrapper = mountDialog();

    await wrapper.get('[data-testid="external-change-reload"]').trigger('click');
    await wrapper.get('[data-testid="external-change-keep"]').trigger('click');
    await wrapper.get('[data-testid="external-change-save-as"]').trigger('click');

    expect(wrapper.emitted('reload')).toHaveLength(1);
    expect(wrapper.emitted('keep')).toHaveLength(1);
    expect(wrapper.emitted('saveAs')).toHaveLength(1);
  });

  it('busy 时禁用动作按钮且仍然可以关闭', async () => {
    const wrapper = mountDialog({ busy: true });

    expect(wrapper.get('[data-testid="external-change-reload"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-testid="external-change-save-as"]').attributes('disabled')).toBeDefined();

    await wrapper.get('[data-testid="external-change-close"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
