import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import ProblemsPanel from '@/components/editor/ProblemsPanel.vue';
import { useDiagnosticsStore } from '@/stores/diagnostics';

describe('ProblemsPanel', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  it('renders diagnostics, filters them and emits navigation', async () => {
    const store = useDiagnosticsStore();
    store.setDiagnostics('file:///workspace/src/main.ts', [
      { message: 'Type error', severity: 1, startLineNumber: 4, startColumn: 3, source: 'ts' },
      { message: 'Warning', severity: 2, startLineNumber: 8, startColumn: 1 },
    ]);
    const wrapper = mount(ProblemsPanel, { props: { locale: 'zh-CN' }, global: { plugins: [pinia] } });

    expect(wrapper.get('[data-testid="problems-panel"]').text()).toContain('问题');
    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(2);
    await wrapper.get('[data-testid="problems-filter-error"]').trigger('click');
    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(1);
    await wrapper.find('[role="listitem"]').trigger('click');
    expect(wrapper.emitted('navigate')).toHaveLength(1);
    await wrapper.get('[data-testid="problems-clear"]').trigger('click');
    expect(store.count).toBe(0);
  });
});
