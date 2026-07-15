/**
 * LoadingSpinner 当前公共契约测试。
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue';

describe('LoadingSpinner', () => {
  it('renders the default medium spinner', () => {
    const wrapper = mount(LoadingSpinner);

    expect(wrapper.get('[data-testid="loading-spinner"]').classes()).toContain('loading-spinner-medium');
    expect(wrapper.find('.spinner').exists()).toBe(true);
  });

  it.each(['small', 'medium', 'large'] as const)('renders the %s size variant', (size) => {
    const wrapper = mount(LoadingSpinner, { props: { size } });

    expect(wrapper.classes()).toContain(`loading-spinner-${size}`);
  });

  it('does not render text when text is omitted', () => {
    const wrapper = mount(LoadingSpinner);

    expect(wrapper.find('.spinner-text').exists()).toBe(false);
  });

  it('renders loading text when provided', () => {
    const wrapper = mount(LoadingSpinner, { props: { text: '正在加载文件…' } });

    expect(wrapper.get('.spinner-text').text()).toBe('正在加载文件…');
  });

  it('keeps multiline text intact', () => {
    const wrapper = mount(LoadingSpinner, { props: { text: '正在处理\n请稍候' } });

    expect(wrapper.get('.spinner-text').text()).toContain('请稍候');
  });
});
