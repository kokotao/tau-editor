/**
 * @description 会员金标组件测试：免费隐藏、付费档位、紧凑模式和可访问文案。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-11-06 15:00
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MembershipBadge from '@/components/ui/MembershipBadge.vue';

describe('MembershipBadge 会员金标', () => {
  it.each([null, undefined, '', 'FREE', 'BASIC', 'unknown'])(
    'tier=%s 时不渲染',
    (tier) => {
      const wrapper = mount(MembershipBadge, {
        props: { tier: tier as string | null | undefined },
      });
      expect(wrapper.find('[data-testid="membership-badge"]').exists()).toBe(false);
    },
  );

  it('Plus 会员只显示具体档位，并带可访问金标文案', () => {
    const wrapper = mount(MembershipBadge, {
      props: { tier: 'plus' },
    });
    const badge = wrapper.get('[data-testid="membership-badge"]');

    expect(badge.classes()).toContain('membership-badge--plus');
    expect(badge.attributes('data-tier')).toBe('PLUS');
    expect(badge.attributes('aria-label')).toBe('Plus 会员');
    expect(badge.attributes('title')).toBe('Plus 会员');
    expect(badge.text()).toContain('PLUS');
    expect(badge.text()).not.toContain('VIP');
    expect(badge.get('.membership-badge__cube svg').attributes('viewBox')).toBe('0 0 128 128');
    expect(badge.find('.membership-badge__cube svg path[stroke]').exists()).toBe(false);
    const faces = badge.findAll('.membership-badge__cube svg path').slice(0, 3);
    expect(faces.every((face) => face.attributes('fill')?.startsWith('url(#membership-gold-'))).toBe(true);
  });

  it('Pro 会员使用独立档位样式与文案', () => {
    const wrapper = mount(MembershipBadge, {
      props: { tier: 'PRO', testId: 'pro-badge' },
    });
    const badge = wrapper.get('[data-testid="pro-badge"]');

    expect(badge.classes()).toContain('membership-badge--pro');
    expect(badge.attributes('data-tier')).toBe('PRO');
    expect(badge.attributes('aria-label')).toBe('Pro 会员');
    expect(badge.text()).toContain('PRO');
  });

  it('紧凑模式仍显示具体 Plus/Pro 等级，适合标题栏和窄侧栏', () => {
    const wrapper = mount(MembershipBadge, {
      props: { tier: 'PLUS', compact: true },
    });
    const badge = wrapper.get('[data-testid="membership-badge"]');

    expect(badge.classes()).toContain('membership-badge--compact');
    expect(badge.text()).toContain('PLUS');
    expect(badge.text()).not.toContain('VIP');
    expect(badge.attributes('aria-label')).toBe('Plus 会员');
  });

  it('显示订阅到期日，并写入可访问文案', () => {
    const wrapper = mount(MembershipBadge, {
      props: { tier: 'PRO', expiresAt: '2027-03-18T00:00:00+08:00' },
    });
    const badge = wrapper.get('[data-testid="membership-badge"]');

    expect(badge.text()).toContain('PRO');
    expect(badge.text()).toContain('2027/03/18');
    expect(badge.attributes('aria-label')).toBe('Pro 会员，到期 2027/03/18');
  });
});
