import { expect, test } from '@playwright/test';
import { selectLanguageMode } from './helpers/status-bar-select';
import { waitForStableBox } from './helpers/layout';
import { mockTauriDesktopRuntime } from './helpers/ux3-env';

test.describe('Sidebar & Markdown Preview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="toolbar"]');
    await page.click('[data-testid="btn-new-file"]');
    await page.waitForSelector('[data-testid="editor-container"]');
  });

  test('E2E-UX-001: 侧栏可折叠与展开', async ({ page }) => {
    // UX-3：Toolbar 上的 btn-toggle-file-tree 已删除（桌面端等价入口是标题栏
    // btn-titlebar-toggle-explorer，网页模式走左下角的收起/展开按钮），
    // 这里用网页模式可见的等价按钮验证同一行为。
    const sidebar = page.locator('[data-testid="sidebar-panel"]');
    await expect(sidebar).toBeVisible();

    await page.click('[data-testid="btn-sidebar-collapse"]');
    await expect(sidebar).toBeHidden();

    await expect(page.locator('[data-testid="btn-sidebar-expand"]')).toBeVisible();
    await page.click('[data-testid="btn-sidebar-expand"]');
    await expect(sidebar).toBeVisible();
  });

  test('E2E-UX-002: Markdown 模式可切换并显示预览', async ({ page }) => {
    await selectLanguageMode(page, 'markdown');
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
    await selectLanguageMode(page, 'markdown');

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
    await selectLanguageMode(page, 'markdown');

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
    await selectLanguageMode(page, 'markdown');

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

    // 分栏切换带有 0.32s 过渡动画：等几何稳定再取坐标，
    // 否则期望值来自动画中间态，而 Playwright 实际点击的是稳定后的位置。
    const previewBox = await waitForStableBox(preview);
    expect(previewBox).not.toBeNull();

    const clickPosition = { x: 180, y: 160 };
    await preview.click({ button: 'right', position: clickPosition });

    const menu = page.locator('[data-testid="markdown-preview-context-menu"]');
    await expect(menu).toBeVisible();

    const menuBox = await waitForStableBox(menu);
    expect(menuBox).not.toBeNull();

    // 菜单以 fixed 定位在点击点；当菜单尺寸超出视口时应用会向内收束（MENU_MARGIN = 8px），
    // 因此期望坐标 = 点击点按视口边界收敛后的位置。
    const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    const MENU_MARGIN = 8;
    const clamp = (value: number, size: number, viewportSize: number) =>
      Math.max(MENU_MARGIN, Math.min(value, Math.max(MENU_MARGIN, viewportSize - size - MENU_MARGIN)));
    const expectedX = clamp(previewBox!.x + clickPosition.x, menuBox!.width, viewport.width);
    const expectedY = clamp(previewBox!.y + clickPosition.y, menuBox!.height, viewport.height);

    expect(Math.abs(menuBox!.x - expectedX)).toBeLessThanOrEqual(1);
    expect(Math.abs(menuBox!.y - expectedY)).toBeLessThanOrEqual(1);
  });
});

/**
 * 桌面标题栏入口（Tauri-only UI）。
 *
 * 纯 Chromium 下 `hasDesktopWindowTitlebar = isTauriApp()` 为 false，标题栏不渲染；
 * 这里桩掉最小 Tauri 运行时，验证 Toolbar 精简后侧栏开关的桌面端等价入口确实可用。
 */
test.describe('Desktop titlebar entries', () => {
  test('E2E-UX-001b: 标题栏「收起/展开侧栏」按钮可折叠与展开侧栏', async ({ page }) => {
    await mockTauriDesktopRuntime(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="toolbar"]');

    const titlebarToggle = page.locator('[data-testid="btn-titlebar-toggle-explorer"]');
    const sidebar = page.locator('[data-testid="sidebar-panel"]');
    await expect(titlebarToggle).toBeVisible();
    await expect(titlebarToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(sidebar).toBeVisible();

    await titlebarToggle.click();
    await expect(sidebar).toBeHidden();
    await expect(titlebarToggle).toHaveAttribute('aria-pressed', 'false');

    await titlebarToggle.click();
    await expect(sidebar).toBeVisible();
    await expect(titlebarToggle).toHaveAttribute('aria-pressed', 'true');
  });
});
