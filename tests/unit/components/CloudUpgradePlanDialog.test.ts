/**
 * @description 云存储扩容方案面板：档位/签到规则渲染、真实用量换算、关闭与「联系管理员」emit。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-27 15:30
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CloudUpgradePlanDialog from '@/components/editor/CloudUpgradePlanDialog.vue';

const q = (id: string) => document.body.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(CloudUpgradePlanDialog, {
    props: { visible: true, usedBytes: 1024 * 1024, quotaBytes: 8 * 1024 * 1024 * 1024, ...props },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('CloudUpgradePlanDialog', () => {
  it('渲染真实用量（1 MB / 8 GB）与剩余容量', () => {
    mountDialog();
    const usage = q('cloud-upgrade-usage-value')?.textContent ?? '';
    expect(usage).toContain('1.00 MB');
    expect(usage).toContain('8.00 GB');

    const dialogText = q('cloud-upgrade-dialog')?.textContent ?? '';
    expect(dialogText).toContain('剩余');
    // 8 GB - 1 MB 仍是 8.00 GB（保留两位），这里断言的是"剩余行存在且数值合理"
    const note = document.body.querySelector('.cloud-upgrade__usage-note')?.textContent ?? '';
    expect(note).toContain('剩余');
    expect(note).toContain('GB');
  });

  it('渲染三个档位（团队版本期不做）与永久扩容包', () => {
    mountDialog();
    for (const id of ['free', 'plus', 'pro']) {
      expect(q(`cloud-upgrade-tier-${id}`)).not.toBeNull();
    }
    expect(q('cloud-upgrade-tier-team')).toBeNull();

    const tiers = q('cloud-upgrade-tiers')?.textContent ?? '';
    expect(tiers).toContain('免费版');
    expect(tiers).toContain('1 GB');
    expect(tiers).toContain('10 GB');
    expect(tiers).toContain('50 GB');
    expect(tiers).toContain('¥18 / 月');
    expect(q('cloud-upgrade-pack')?.textContent).toContain('+10 GB');
  });

  it('签到规则体现随机增量 + 滑动窗口 + 累计封顶 10 GB', () => {
    mountDialog();
    const rewards = q('cloud-upgrade-rewards')?.textContent ?? '';
    expect(rewards).toContain('随机');
    expect(rewards).toContain('滑动窗口');
    expect(rewards).toContain('10 GB');
    expect(rewards).toContain('连续签到');
  });

  it('关闭与联系管理员各自 emit', async () => {
    const wrapper = mountDialog();
    q('cloud-upgrade-close')!.click();
    q('cloud-upgrade-contact')!.click();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.emitted('contact')).toHaveLength(1);
  });

  it('配额为 0 时用量百分比不出现 NaN', () => {
    mountDialog({ usedBytes: 0, quotaBytes: 0 });
    const bar = document.body.querySelector('.cd-progress__bar') as HTMLElement | null;
    expect(bar?.style.width).toBe('0%');
  });

  it('visible=false 时不渲染', () => {
    mountDialog({ visible: false });
    expect(q('cloud-upgrade-dialog')).toBeNull();
  });
});
