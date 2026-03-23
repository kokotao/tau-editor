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

    await page.click('[data-testid="btn-markdown-preview-mode"]');
    await page.waitForTimeout(200);

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

  test('E2E-UX-003: 预览区右键链接菜单可用', async ({ page }) => {
    await page.selectOption('[data-testid="language-mode-display"]', 'markdown');

    const editor = page.locator('[data-testid="editor-container"]');
    await editor.click();
    await page.keyboard.type('[OpenAI](https://example.com)');

    await page.click('[data-testid="btn-markdown-preview-mode"]');
    await page.waitForTimeout(200);

    const previewPane = page.locator('[data-testid="markdown-preview-pane"]');
    const link = previewPane.locator('a', { hasText: 'OpenAI' });
    await expect(link).toBeVisible();

    await link.click({ button: 'right' });

    const menu = page.locator('[data-testid="markdown-preview-context-menu"]');
    await expect(menu).toBeVisible();
    await expect(page.locator('[data-testid="preview-menu-copy-link"]')).toBeVisible();

    const refreshItem = page.locator('[data-testid="preview-menu-refresh-preview"]');
    await expect(refreshItem).toBeVisible();
    await refreshItem.click();

    await expect(menu).toBeHidden();
    await expect(previewPane).toBeVisible();
    await expect(link).toBeVisible();
  });

  test('E2E-UX-004: 设置页直接展示作者信息与捐赠区', async ({ page }) => {
    await page.click('[data-testid="btn-settings"]');
    await expect(page.locator('[data-testid="settings-drawer"]')).toBeVisible();

    const settingsDrawer = page.locator('[data-testid="settings-drawer"]');
    const authorSection = settingsDrawer.locator('[data-testid="settings-author-section"]');
    await expect(authorSection).toBeVisible();
    await expect(authorSection).toContainText('albert_luo');
    await expect(authorSection.locator('a[href="https://github.com/kokotao/tau-editor"]')).toBeVisible();
    await expect(authorSection.locator('img[alt="微信捐赠"]')).toBeVisible();
    await expect(authorSection.locator('img[alt="支付宝捐赠"]')).toBeVisible();
  });

  test('E2E-UX-005: 左下角仅保留侧栏收起/展开按钮', async ({ page }) => {
    await expect(page.locator('[data-testid="left-bottom-controls"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-sidebar-collapse"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-author-entry"]')).toHaveCount(0);
  });
});
