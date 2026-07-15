/**
 * 编辑器宿主已迁移至 Vue；此套件覆盖其标签栏边界，避免保留已删除的 React Editor 依赖。
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import EditorTabs from '@/components/editor/EditorTabs.vue';
import type { Tab } from '@/stores/tabs';

const tabs: Tab[] = [
  {
    id: 'readme',
    filePath: '/workspace/README.md',
    fileName: 'README.md',
    language: 'markdown',
    isDirty: false,
    isUntitled: false,
    isLoadingContent: false,
  },
];

describe('Editor host boundary', () => {
  it('renders the active document tab', () => {
    const wrapper = mount(EditorTabs, { props: { tabs, activeTabId: 'readme' } });

    expect(wrapper.get('[data-testid="tab-title"]').text()).toBe('README.md');
    expect(wrapper.get('[data-testid="tab"]').classes()).toContain('active');
  });

  it('delegates a tab selection to its owner', async () => {
    const wrapper = mount(EditorTabs, { props: { tabs, activeTabId: null } });

    await wrapper.get('[data-testid="tab"]').trigger('click');

    expect(wrapper.emitted('tab-click')).toEqual([['readme']]);
  });
});
