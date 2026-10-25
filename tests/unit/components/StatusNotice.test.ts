/**
 * @description 统一状态提示组件：分级着色、失败加粗、可展开原因。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 19:45
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import StatusNotice from '@/components/ui/StatusNotice.vue';

describe('StatusNotice 状态提示', () => {
  it('成功：绿色 tone + 加粗，role=status', () => {
    const wrapper = mount(StatusNotice, {
      props: { tone: 'success', text: '已同步到云端（v3）', testId: 'demo' },
    });

    const root = wrapper.get('[data-testid="demo"]');
    expect(root.classes()).toContain('status-notice--success');
    expect(root.classes()).toContain('status-notice--strong');
    expect(root.attributes('data-tone')).toBe('success');
    expect(root.attributes('role')).toBe('status');
    expect(wrapper.get('.status-notice__text').text()).toContain('已同步到云端');
  });

  it('失败：红色 tone + 加粗 + role=alert（更醒目）', () => {
    const wrapper = mount(StatusNotice, {
      props: { tone: 'error', text: '1 张图片失败', testId: 'demo-error' },
    });

    const root = wrapper.get('[data-testid="demo-error"]');
    expect(root.classes()).toContain('status-notice--error');
    expect(root.classes()).toContain('status-notice--strong');
    expect(root.attributes('role')).toBe('alert');
  });

  it('警告与中性信息不高亮加粗', () => {
    const warning = mount(StatusNotice, { props: { tone: 'warning', text: '图片不会同步' } });
    expect(warning.classes()).toContain('status-notice--warning');
    expect(warning.classes()).not.toContain('status-notice--strong');

    const info = mount(StatusNotice, { props: { tone: 'info', text: '队列为空' } });
    expect(info.classes()).toContain('status-notice--info');
    expect(info.classes()).not.toContain('status-notice--strong');
  });

  it('可展开失败原因', async () => {
    const wrapper = mount(StatusNotice, {
      props: {
        tone: 'error',
        text: '2 张图片失败',
        details: ['images/a.png: 超过 20 MB', 'images/b.png: 不是图片'],
        collapsible: true,
        testId: 'demo-details',
      },
    });

    expect(wrapper.find('[data-testid="demo-details-details"]').exists()).toBe(false);
    await wrapper.get('[data-testid="demo-details-toggle"]').trigger('click');

    const details = wrapper.get('[data-testid="demo-details-details"]');
    expect(details.findAll('li')).toHaveLength(2);
    expect(details.text()).toContain('超过 20 MB');
  });

  it('无文案时不渲染', () => {
    const wrapper = mount(StatusNotice, { props: { tone: 'info', text: '' } });
    expect(wrapper.find('.status-notice').exists()).toBe(false);
  });
});
