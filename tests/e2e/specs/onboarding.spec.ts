import { expect, test } from '../fixtures/app';

test('首次安装或升级后打开操作说明和示例思维导图', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('text-editor-onboarding-version-v1');
    localStorage.setItem('text-editor-last-opened-at-v1', String(Date.now()));
  });
  await page.goto('/');

  const tabTitles = page.locator('[data-testid="tab-title"]');
  await expect(tabTitles.filter({ hasText: '操作说明.md' })).toHaveCount(1);
  await expect(tabTitles.filter({ hasText: '示例思维导图.taumap' })).toHaveCount(1);
  const guideTab = page.locator('[data-testid="tab"]').filter({ hasText: '操作说明.md' });
  const mindMapTab = page.locator('[data-testid="tab"]').filter({ hasText: '示例思维导图.taumap' });
  await expect(guideTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-testid="mindmap-stage"]')).toHaveCount(0);

  await mindMapTab.click();
  await expect(page.locator('[data-testid="mindmap-stage"]')).toBeVisible();
  await expect(page.locator('.mm-sheet-tab')).toHaveCount(4);
  await expect(page.locator('.mm-sheet-tab').filter({ hasText: '应用功能地图' })).toBeVisible();
  await expect(page.locator('[data-testid="mm-canvas-style-panel"]')).toHaveCount(0);
  await page.locator('[data-testid="tab"]').filter({ hasText: '操作说明.md' }).click();
  await expect(page.locator('[data-testid="markdown-preview"]')).toContainText('示例思维导图');
});
