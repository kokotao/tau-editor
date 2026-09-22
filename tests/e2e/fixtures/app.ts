import { expect, test as base } from '@playwright/test';

/**
 * 统一 E2E 初始状态：
 * - 关闭首次安装引导标签，保证标签数量、活动标签可预期；
 * - 清理上次会话与恢复草稿，避免同一浏览器上下文内串扰。
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('text-editor-last-opened-at-v1', String(Date.now()));
        localStorage.setItem('text-editor-first-install-guide-v1', '1');
        localStorage.removeItem('text-editor-recovery-v2');
        localStorage.removeItem('text-editor-session-v1');
      } catch {
        // 非 http(s) 文档（如 about:blank）没有 localStorage，忽略即可。
      }
    });

    await use(page);
  },
});

export { expect };
