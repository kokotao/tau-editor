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
});
