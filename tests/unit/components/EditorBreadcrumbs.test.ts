import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import EditorBreadcrumbs, { type EditorBreadcrumbSegment } from '@/components/editor/EditorBreadcrumbs.vue';

describe('EditorBreadcrumbs', () => {
  const segments: EditorBreadcrumbSegment[] = [
    { label: 'tau-editor', path: '/work/tau-editor', kind: 'workspace', navigable: true },
    { label: 'src', path: '/work/tau-editor/src', kind: 'folder', navigable: true },
    { label: 'App.vue', path: '/work/tau-editor/src/App.vue', kind: 'file', navigable: true },
  ];

  it('renders file path segments in order and emits the selected segment', async () => {
    const wrapper = mount(EditorBreadcrumbs, {
      props: { segments, label: '文件路径' },
    });

    expect(wrapper.get('nav').attributes('aria-label')).toBe('文件路径');
    expect(wrapper.findAll('.breadcrumb-segment').map((button) => button.text())).toEqual([
      'tau-editor',
      'src',
      'App.vue',
    ]);

    await wrapper.get('[data-testid="breadcrumb-1"]').trigger('click');
    expect(wrapper.emitted('navigate')?.[0]).toEqual([segments[1]]);
  });

  it('disables navigation for files without a workspace path', () => {
    const wrapper = mount(EditorBreadcrumbs, {
      props: {
        segments: [{ label: 'Untitled.txt', path: null, kind: 'file', navigable: false }],
        label: '文件路径',
      },
    });

    expect(wrapper.get('.breadcrumb-segment').attributes('disabled')).toBeDefined();
  });
});
