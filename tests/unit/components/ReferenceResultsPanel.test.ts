import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ReferenceResultsPanel from '@/components/editor/ReferenceResultsPanel.vue';

const groups = [
  {
    path: 'src/main.ts',
    items: [
      { id: 'main-1', uri: 'file:///workspace/src/main.ts', path: 'src/main.ts', line: 4, column: 3, preview: 'useThing();' },
      { id: 'main-2', uri: 'file:///workspace/src/main.ts', path: 'src/main.ts', line: 9, column: 5, preview: 'return useThing();' },
    ],
  },
  {
    path: 'src/other.ts',
    items: [
      { id: 'other-1', uri: 'file:///workspace/src/other.ts', path: 'src/other.ts', line: 2, column: 1, preview: 'import { useThing } from ./main;' },
    ],
  },
];

describe('ReferenceResultsPanel', () => {
  it('renders grouped references and emits navigation for a result', async () => {
    const wrapper = mount(ReferenceResultsPanel, { props: { locale: 'zh-CN', groups } });

    expect(wrapper.get('[data-testid="reference-results-panel"]').text()).toContain('引用');
    expect(wrapper.findAll('.reference-results-group')).toHaveLength(2);
    expect(wrapper.findAll('.reference-result-item')).toHaveLength(3);

    await wrapper.get('[data-testid="reference-result-main-2"]').trigger('click');
    expect(wrapper.emitted('navigate')?.[0]?.[0]).toEqual(groups[0].items[1]);
  });

  it('renders empty state when there are no references', () => {
    const wrapper = mount(ReferenceResultsPanel, { props: { locale: 'en-US', groups: [] } });

    expect(wrapper.get('[data-testid="reference-results-empty"]').text()).toContain('No references found');
  });

  it('emits cancel while loading and close on demand', async () => {
    const wrapper = mount(ReferenceResultsPanel, { props: { locale: 'en-US', loading: true } });

    await wrapper.get('[data-testid="reference-results-cancel"]').trigger('click');
    await wrapper.get('[data-testid="reference-results-close"]').trigger('click');

    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.find('[data-testid="reference-results-empty"]').exists()).toBe(false);
  });
});
