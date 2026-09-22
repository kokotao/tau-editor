import { describe, expect, it, vi } from 'vitest';
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

  it('关闭前钩子会等待异步保存完成', async () => {
    const service = createWindowService(
      { confirmBeforeClose: false } as never,
      { hasDirtyTabs: false } as never,
    ) as any;

    let resolveSave: (() => void) | null = null;
    const pendingSave = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const handler = vi.fn(() => pendingSave);
    service.onBeforeClose(handler);

    let flushed = false;
    const flushing = service.flushBeforeClose().then(() => {
      flushed = true;
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(flushed).toBe(false);

    resolveSave?.();
    await flushing;
    expect(flushed).toBe(true);
  });

  it('关闭前钩子失败时不会阻断关闭流程', async () => {
    const service = createWindowService(
      { confirmBeforeClose: false } as never,
      { hasDirtyTabs: false } as never,
    ) as any;
    service.onBeforeClose(() => {
      throw new Error('save failed');
    });

    await expect(service.flushBeforeClose()).resolves.toBeUndefined();
  });

  it('未注册关闭前钩子时直接返回', async () => {
    const service = createWindowService(
      { confirmBeforeClose: false } as never,
      { hasDirtyTabs: false } as never,
    ) as any;

    await expect(service.flushBeforeClose()).resolves.toBeUndefined();
  });
});
