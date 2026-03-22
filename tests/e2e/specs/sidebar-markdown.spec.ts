import { expect, test } from '@playwright/test';

test.describe('Sidebar & Markdown Preview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="toolbar"]');
    await page.click('[data-testid="btn-new-file"]');
    await page.waitForSelector('[data-testid="editor-container"]');
  });

  test('E2E-UX-001: 侧栏可折叠与展开', async ({ page }) => {
    await expect(page.locator('[data-testid="btn-toggle-file-tree"]')).toBeVisible();
    await page.click('[data-testid="btn-toggle-file-tree"]');
    await expect(page.locator('[data-testid="sidebar-panel"]')).toBeHidden();

    await expect(page.locator('[data-testid="btn-sidebar-expand"]')).toBeVisible();
    await page.click('[data-testid="btn-sidebar-expand"]');
    await expect(page.locator('[data-testid="sidebar-panel"]')).toBeVisible();
  });

  test('E2E-UX-002: Markdown 模式可切换并显示预览', async ({ page }) => {
    await page.selectOption('[data-testid="language-mode-display"]', 'markdown');
    await expect(page.locator('[data-testid="btn-markdown-preview-mode"]')).toBeVisible();

    const editor = page.locator('[data-testid="editor-container"]');
    await editor.click();
    await page.keyboard.type('# Title');
    await page.waitForTimeout(400);

    await expect(page.locator('[data-testid="markdown-preview-pane"]')).toBeVisible();
    await expect(page.locator('[data-testid="markdown-preview-pane"]')).toContainText('Title');

    await page.click('[data-testid="btn-markdown-preview-mode"]');
    await page.waitForTimeout(200);
    await expect(page.locator('[data-testid="markdown-preview-pane"]')).toBeVisible();

    await page.click('[data-testid="btn-markdown-preview-mode"]');
    await page.waitForTimeout(200);
    await expect(page.locator('[data-testid="markdown-preview-pane"]')).toHaveCount(0);

    await page.click('[data-testid="btn-markdown-preview-mode"]');
    await page.waitForTimeout(200);
    await expect(page.locator('[data-testid="markdown-preview-pane"]')).toBeVisible();
  });
});
