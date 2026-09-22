import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import WorkspaceSearchPanel from '@/components/editor/WorkspaceSearchPanel.vue';

describe('WorkspaceSearchPanel', () => {
  it('submits workspace search and navigates a selected result', async () => {
    const wrapper = mount(WorkspaceSearchPanel, {
      props: {
        visible: true,
        query: 'release',
        results: [{ path: 'docs/release.md', line: 4, column: 1, length: 7, preview: 'release v0.3.0' }],
      },
      global: { stubs: { teleport: true } },
    });

    await wrapper.get('[data-testid="workspace-search-submit"]').trigger('click');
    await wrapper.get('[data-testid="workspace-search-result-0"]').trigger('click');

    expect(wrapper.emitted('search')).toEqual([['release']]);
    expect(wrapper.emitted('navigate')).toEqual([['docs/release.md', 4]]);
  });

  it('搜索进行中可取消，并可请求替换预览', async () => {
    const wrapper = mount(WorkspaceSearchPanel, {
      props: {
        visible: true,
        query: 'release',
        replacement: 'RELEASE',
        results: [],
        loading: true,
      },
      global: { stubs: { teleport: true } },
    });

    await wrapper.get('[data-testid="workspace-search-cancel"]').trigger('click');
    await wrapper.get('[data-testid="workspace-replace-preview"]').trigger('click');

    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('previewReplace')).toEqual([['RELEASE']]);
  });

  it('搜索被取消时提示显示部分结果', () => {
    const wrapper = mount(WorkspaceSearchPanel, {
      props: {
        visible: true,
        query: 'release',
        results: [],
        cancelled: true,
      },
      global: { stubs: { teleport: true } },
    });

    expect(wrapper.get('[data-testid="workspace-search-cancelled"]').text()).toContain('部分结果');
  });
});
