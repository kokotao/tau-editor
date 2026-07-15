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
    const editorStage = page.locator('.editor-stage');
    const previewPane = page.locator('[data-testid="markdown-preview-pane"]');
    await editor.click();
    await page.keyboard.type('# Title');
    await expect(editorStage).toHaveClass(/markdown-mode-edit/);

    await page.click('[data-testid="btn-markdown-preview-mode"]');
    await expect(editorStage).toHaveClass(/markdown-mode-split/);

    await expect(previewPane).toBeVisible();
    await expect(previewPane).toContainText('Title');

    await page.click('[data-testid="btn-markdown-preview-mode"]');
    await expect(editorStage).toHaveClass(/markdown-mode-preview/);
    await expect(previewPane).toBeVisible();

    await page.click('[data-testid="btn-markdown-preview-mode"]');
    await expect(editorStage).toHaveClass(/markdown-mode-edit/);

    await page.click('[data-testid="btn-markdown-preview-mode"]');
    await expect(editorStage).toHaveClass(/markdown-mode-split/);
    await expect(previewPane).toBeVisible();
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

  test('E2E-UX-004: 设置工作区可展示作者信息与捐赠区', async ({ page }) => {
    await page.click('[data-testid="btn-settings"]');
    await expect(page.locator('[data-testid="settings-page"]')).toBeVisible();
    await page.click('[data-testid="settings-nav-about"]');

    const settingsPage = page.locator('[data-testid="settings-page"]');
    const authorSection = settingsPage.locator('[data-testid="settings-author-section"]');
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

  test('E2E-UX-006: Markdown 预览主题支持设置面板与右键菜单双入口切换', async ({ page }) => {
    await page.selectOption('[data-testid="language-mode-display"]', 'markdown');

    const editor = page.locator('[data-testid="editor-container"]');
    const previewPane = page.locator('[data-testid="markdown-preview-pane"]');
    const preview = previewPane.locator('[data-testid="markdown-preview"]');
    await editor.click();
    await page.keyboard.type('# Theme Demo');

    await page.click('[data-testid="btn-markdown-preview-mode"]');
    await expect(page.locator('.editor-stage')).toHaveClass(/markdown-mode-split/);
    await expect(preview).toBeVisible();

    await page.click('[data-testid="btn-settings"]');
    await expect(page.locator('[data-testid="settings-page"]')).toBeVisible();
    await page.click('[data-testid="settings-nav-editor"]');
    await page.click('[data-testid="select-markdown-preview-theme"]');
    await page.locator('.n-base-select-menu').getByText('夜读石墨').click();
    await page.click('[data-testid="settings-close-btn"]');

    await expect(preview).toHaveClass(/markdown-preview--graphite-night/);

    await preview.click({ button: 'right', position: { x: 120, y: 120 } });
    await expect(page.locator('[data-testid="markdown-preview-context-menu"]')).toBeVisible();
    await expect(page.locator('[data-testid="preview-menu-theme-graphite-night"]')).toBeDisabled();

    await page.click('[data-testid="preview-menu-theme-paper-soft"]');
    await expect(preview).toHaveClass(/markdown-preview--paper-soft/);
  });

  test('E2E-UX-007: Markdown 预览右键菜单应贴近触发位置', async ({ page }) => {
    await page.selectOption('[data-testid="language-mode-display"]', 'markdown');

    const editor = page.locator('[data-testid="editor-container"]');
    const previewPane = page.locator('[data-testid="markdown-preview-pane"]');
    const preview = previewPane.locator('[data-testid="markdown-preview"]');
    await editor.click();
    await page.keyboard.type('# Context Menu Position');

    await page.click('[data-testid="btn-markdown-preview-mode"]');
    await expect(page.locator('.editor-stage')).toHaveClass(/markdown-mode-split/);
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('Context Menu Position');
    await expect
      .poll(async () => (await preview.boundingBox())?.width ?? 0)
      .toBeGreaterThan(320);

    const previewBox = await preview.boundingBox();
    expect(previewBox).not.toBeNull();

    const clickPosition = { x: 180, y: 160 };
    await preview.click({ button: 'right', position: clickPosition });

    const menu = page.locator('[data-testid="markdown-preview-context-menu"]');
    await expect(menu).toBeVisible();

    const menuBox = await menu.boundingBox();
    expect(menuBox).not.toBeNull();

    const expectedX = previewBox!.x + clickPosition.x;
    const expectedY = previewBox!.y + clickPosition.y;

    expect(Math.abs(menuBox!.x - expectedX)).toBeLessThanOrEqual(20);
    expect(Math.abs(menuBox!.y - expectedY)).toBeLessThanOrEqual(20);
  });
});
