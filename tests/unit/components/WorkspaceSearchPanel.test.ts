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
});
