import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

/**
 * 设计稿二：设置-云同步分区的四种预览态。
 * 预览页（dev/DesignPreview.vue）会给组件传 previewState，此时组件必须完全走本地 mock：
 * 不读 store 的登录态、不发任何云命令、也不依赖 Tauri 运行时。
 */
vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauriApp: () => false,
  };
});

import CloudSyncSettingsSection from '@/components/editor/settings/CloudSyncSettingsSection.vue';

const mountSection = (previewState: 'signed-out' | 'signed-in' | 'syncing' | 'error') =>
  mount(CloudSyncSettingsSection, {
    props: { previewState },
    global: { plugins: [createPinia()] },
  });

describe('CloudSyncSettingsSection 预览态', () => {
  setActivePinia(createPinia());

  it('页头完整，且 Bento 遥测四卡已整块移除', () => {
    const wrapper = mountSection('signed-in');

    expect(wrapper.get('.cd-sync__h1').text()).toBe('云同步服务');
    expect(wrapper.text()).toContain('Lizi Sync Core v3');
    expect(wrapper.text()).toContain('TLS 1.3 · AES-GCM-256');
    expect(wrapper.find('[data-testid="cloud-sync-diagnose-btn"]').exists()).toBe(true);

    // 四卡（当前运行版本 / 云端集群版本 / 本地环境架构 / 集群往返时延）不再渲染
    expect(wrapper.find('.cd-sync__bento').exists()).toBe(false);
    expect(wrapper.find('.cd-sync__tele').exists()).toBe(false);
    expect(wrapper.find('[data-testid^="cloud-sync-telemetry-"]').exists()).toBe(false);
    expect(wrapper.html()).not.toContain('当前运行版本');
    expect(wrapper.html()).not.toContain('云端集群版本');
    expect(wrapper.html()).not.toContain('本地环境架构');
    expect(wrapper.html()).not.toContain('集群往返时延');
  });

  it('诊断节点链路：结果改在按钮文案上短暂显示，随后回到动作名', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountSection('signed-in');
      const btn = wrapper.get('[data-testid="cloud-sync-diagnose-btn"]');

      expect(btn.text()).toContain('诊断节点链路');
      expect(btn.attributes('data-state')).toBe('idle');

      await btn.trigger('click');
      expect(btn.attributes('data-state')).toBe('busy');

      // 预览态诊断固定等待 700ms 再出结果
      await vi.advanceTimersByTimeAsync(800);
      await nextTick();
      expect(btn.text()).toContain('节点延时');
      expect(btn.attributes('data-state')).toBe('result');

      // 结果只停留一小段时间，避免被误读成常驻状态
      await vi.advanceTimersByTimeAsync(4000);
      await nextTick();
      expect(btn.text()).toContain('诊断节点链路');
      expect(btn.attributes('data-state')).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('signed-out 渲染登录卡片，且同步按钮不可用', () => {
    const wrapper = mountSection('signed-out');

    expect(wrapper.find('[data-testid="cloud-sync-login-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-sync-username"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-sync-account"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="cloud-sync-now-btn"]').attributes('disabled')).toBeDefined();
  });

  it('signed-in 渲染账号、配额与自动化策略的既有 testid', () => {
    const wrapper = mountSection('signed-in');

    expect(wrapper.find('[data-testid="cloud-sync-account"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-sync-logout-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-sync-quota"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-sync-quota-label"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-sync-auto-toggle"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-sync-debounce"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-sync-images-toggle"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-sync-browse-btn"]').exists()).toBe(true);
  });

  it('syncing 态：CTA 显示同步中并出现带任务号的反馈条', () => {
    const wrapper = mountSection('syncing');

    expect(wrapper.get('[data-testid="cloud-sync-now-btn"]').text()).toContain('同步中');
    const feedback = wrapper.get('[data-testid="cloud-sync-last-result"]').text();
    expect(feedback).toContain('正在向集群同步当前索引分支');
    expect(feedback).toContain('Task #0942');
    expect(wrapper.text()).toContain('Syncing / 同步中');
  });

  it('error 态：配额显示异常原因、队列阻塞可重试', () => {
    const wrapper = mountSection('error');

    expect(wrapper.find('[data-testid="cloud-sync-quota-label"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="cloud-sync-quota-issue"]').text()).toContain('network');
    expect(wrapper.get('[data-testid="cloud-sync-queue-status"]').text()).toContain('1 项阻塞');
    expect(wrapper.get('[data-testid="cloud-sync-retry-btn"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.text()).toContain('Error / 异常');
  });

  it('预览态下点头像旁的退出登录只切换本地态，不碰真实会话', async () => {
    const wrapper = mountSection('signed-in');

    await wrapper.get('[data-testid="cloud-sync-logout-btn"]').trigger('click');

    expect(wrapper.find('[data-testid="cloud-sync-login-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-sync-account"]').exists()).toBe(false);
  });
});
