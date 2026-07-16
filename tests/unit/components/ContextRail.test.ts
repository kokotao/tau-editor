import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ContextRail from '@/components/editor/ContextRail.vue';

describe('ContextRail', () => {
  it('renders the markdown outline and emits its source line when selected', async () => {
    const wrapper = mount(ContextRail, {
      props: {
        language: 'markdown',
        outline: [
          { id: 'heading-overview-1', label: 'Overview', kind: 'heading', level: 1, line: 1 },
          { id: 'heading-details-5', label: 'Details', kind: 'heading', level: 2, line: 5 },
        ],
      },
    });

    expect(wrapper.get('[data-testid="context-rail-title"]').text()).toBe('Document outline');
    expect(wrapper.get('[data-testid="context-outline-item-heading-overview-1"]').text()).toContain('Overview');

    await wrapper.get('[data-testid="context-outline-item-heading-details-5"]').trigger('click');

    expect(wrapper.emitted('navigate')).toEqual([[5]]);
  });

  it('renders localized empty-state copy and emits quick actions', async () => {
    const wrapper = mount(ContextRail, {
      props: {
        locale: 'zh-CN',
        outline: [],
      },
    });

    expect(wrapper.get('[data-testid="context-rail-title"]').text()).toBe('文档大纲');
    expect(wrapper.get('[data-testid="context-rail-empty"]').text()).toContain('没有可导航');

    await wrapper.get('[data-testid="context-action-find"]').trigger('click');
    await wrapper.get('[data-testid="context-action-go-to-line"]').trigger('click');
    await wrapper.get('[data-testid="context-rail-collapse"]').trigger('click');

    expect(wrapper.emitted('find')).toHaveLength(1);
    expect(wrapper.emitted('go-to-line')).toHaveLength(1);
    expect(wrapper.emitted('toggle-collapse')).toHaveLength(1);
  });

  it('renders Markdown tasks and links as contextual navigation targets', async () => {
    const wrapper = mount(ContextRail, {
      props: {
        language: 'markdown',
        tasks: [{ id: 'task-1', label: 'Ship release', completed: false, line: 7 }],
        links: [{ id: 'link-8-1', label: 'Guide', target: 'docs/guide.md', external: false, line: 8 }],
      },
    });

    expect(wrapper.get('[data-testid="context-task-task-1"]').text()).toContain('Ship release');
    expect(wrapper.get('[data-testid="context-link-link-8-1"]').text()).toContain('Guide');

    await wrapper.get('[data-testid="context-task-task-1"]').trigger('click');
    await wrapper.get('[data-testid="context-link-link-8-1"]').trigger('click');

    expect(wrapper.emitted('navigate')).toEqual([[7], [8]]);
  });

  it('renders workspace Git changes in the contextual rail', () => {
    const wrapper = mount(ContextRail, {
      props: {
        gitBranch: 'main',
        gitEntries: [{ path: 'src/App.vue', indexStatus: 'M', worktreeStatus: ' ' }],
      },
    });

    expect(wrapper.get('[data-testid="context-git-branch"]').text()).toContain('main');
    expect(wrapper.get('[data-testid="context-git-entry-src-App.vue"]').text()).toContain('src/App.vue');
  });
});
