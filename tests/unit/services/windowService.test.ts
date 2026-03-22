import { describe, expect, it } from 'vitest';
import { createWindowService } from '@/services/windowService';

describe('windowService', () => {
  it('forceClosing 为 true 时应跳过关闭拦截', () => {
    const settingsStore = {
      confirmBeforeClose: true,
    } as const;
    const tabsStore = {
      hasDirtyTabs: true,
    } as const;

    const service = createWindowService(settingsStore as never, tabsStore as never) as any;

    expect(service.shouldBlockClose()).toBe(true);
    service.forceClosing = true;
    expect(service.shouldBlockClose()).toBe(false);
  });

  it('confirmBeforeClose 关闭时不应阻止关闭', () => {
    const settingsStore = {
      confirmBeforeClose: false,
    } as const;
    const tabsStore = {
      hasDirtyTabs: true,
    } as const;

    const service = createWindowService(settingsStore as never, tabsStore as never) as any;
    expect(service.shouldBlockClose()).toBe(false);
  });
});
