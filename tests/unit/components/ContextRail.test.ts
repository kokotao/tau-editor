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

  it('offers explicit actions when the active file has an external change conflict', async () => {
    const wrapper = mount(ContextRail, {
      props: { externalConflictFileName: 'notes.md' },
    });

    expect(wrapper.get('[data-testid="context-external-conflict"]').text()).toContain('notes.md');
    await wrapper.get('[data-testid="context-conflict-reload"]').trigger('click');
    await wrapper.get('[data-testid="context-conflict-keep"]').trigger('click');

    expect(wrapper.emitted('reload-external')).toHaveLength(1);
    expect(wrapper.emitted('keep-external')).toHaveLength(1);
  });

  it('offers HTML export in Markdown context', async () => {
    const wrapper = mount(ContextRail, { props: { language: 'markdown' } });

    await wrapper.get('[data-testid="context-action-export-html"]').trigger('click');
    expect(wrapper.emitted('export-html')).toHaveLength(1);
  });

  it('renders workspace tasks with count and emits refresh and navigation events', async () => {
    const wrapper = mount(ContextRail, {
      props: {
        language: 'markdown',
        locale: 'zh-CN',
        workspaceTasks: [
          { id: 'README.md:3', relativePath: 'README.md', line: 3, label: 'Ship v0.3.3', completed: false },
        ],
        workspaceTaskTotal: 1,
      },
    });

    expect(wrapper.get('[data-testid="context-workspace-task-count"]').text()).toBe('1');
    expect(wrapper.get('[data-testid="context-workspace-task-README.md:3"]').text()).toContain('Ship v0.3.3');

    await wrapper.get('[data-testid="context-refresh-tasks"]').trigger('click');
    await wrapper.get('[data-testid="context-workspace-task-README.md:3"]').trigger('click');

    expect(wrapper.emitted('refresh-tasks')).toHaveLength(1);
    expect(wrapper.emitted('navigate-file')).toEqual([['README.md', 3]]);
  });

  it('surfaces workspace task loading, empty and truncation states', async () => {
    const wrapper = mount(ContextRail, {
      props: { language: 'markdown', workspaceTasksLoading: true },
    });

    expect(wrapper.text()).toContain('Scanning workspace tasks');

    await wrapper.setProps({ workspaceTasksLoading: false });
    expect(wrapper.get('[data-testid="context-workspace-tasks-empty"]')).toBeTruthy();

    await wrapper.setProps({ workspaceTasksTruncated: true });
    expect(wrapper.text()).toContain('showing the first 500');
  });

  it('renders link status badges for workspace-checked links', () => {
    const wrapper = mount(ContextRail, {
      props: {
        language: 'markdown',
        links: [{ id: 'link-8-1', label: 'Guide', target: 'docs/guide.md', external: false, line: 8 }],
        linkStatuses: { 'docs/guide.md': { target: 'docs/guide.md', status: 'missing' } },
      },
    });

    const badge = wrapper.get('.context-link-state');
    expect(badge.text()).toBe('missing');
    expect(badge.classes()).toContain('context-link-state--missing');
  });

  it('offers image insertion for Markdown documents only', async () => {
    const markdownRail = mount(ContextRail, { props: { language: 'markdown' } });
    await markdownRail.get('[data-testid="context-action-insert-image"]').trigger('click');
    expect(markdownRail.emitted('insert-image')).toHaveLength(1);

    const plainRail = mount(ContextRail, { props: { language: 'plaintext' } });
    expect(plainRail.find('[data-testid="context-action-insert-image"]').exists()).toBe(false);
  });
});
