import { expect, test } from '@playwright/test';

/**
 * UX-3B / UX-3C 回归（按最新 UI 布局断言）：
 *
 * UX-3C：导图工具组在全局 Toolbar 的**居中 zone**（`.toolbar-zone-center`，容器 testid 仍为
 *        `mindmap-toolbar`，24 个 mm-* 保留）；Tau 原始工具（新建/打开/保存/撤销/重做）
 *        移到最左 `.toolbar-zone-start`；Stage 内部不再渲染工具栏。
 *
 * UX-3B：大纲 / 属性是两列**独立**面板（`mm-right-outline` / `mm-right-properties`），
 *        各自 resizer（`mm-outline-resizer` / `mm-props-resizer`）与显隐开关；
 *        顶部 tab 条与「收起」按钮已删除，因此 `mm-right-tabs` / `mm-right-collapse` /
 *        `mm-right-tab-*` / `mm-right-panel` / `mm-right-resizer` 不应再出现在 DOM 中。
 */

async function openNewMindmap(page: import('@playwright/test').Page) {
  await page.keyboard.press('Control+Shift+P');
  await page.waitForSelector('.palette-search-input');
  await page.fill('.palette-search-input', '思维导图');
  await page.locator('.palette-item').filter({ hasText: '新建思维导图' }).first().click();
  await page.waitForSelector('[data-testid="mindmap-canvas"]');
}

test.describe('UX-3: 导图工具栏外移与右侧双列面板', () => {
  test('E2E-UX3-C1: 导图工具组位于全局 Toolbar 居中 zone，Tau 原始工具在最左 zone，且按钮能驱动画布', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="toolbar"]');
    await openNewMindmap(page);

    // 导图工具组在全局 Toolbar 的居中 zone
    const toolbar = page.locator('[data-testid="toolbar"]');
    await expect(toolbar.locator('.toolbar-zone-center').locator('[data-testid="mindmap-toolbar"]')).toHaveCount(1);
    await expect(toolbar.locator('[data-testid="mindmap-toolbar"]')).toBeVisible();
    await expect(toolbar.locator('.toolbar-zone-start').locator('[data-testid="mindmap-toolbar"]')).toHaveCount(0);
    await expect(toolbar.locator('.toolbar-zone-end').locator('[data-testid="mindmap-toolbar"]')).toHaveCount(0);

    // Tau 原始工具已移到最左 zone（新建/打开/保存/撤销/重做），center 内不再有这些按钮
    for (const testId of ['btn-new-file', 'btn-open-file', 'btn-open-folder', 'btn-save', 'btn-save-as', 'btn-undo', 'btn-redo']) {
      await expect(toolbar.locator('.toolbar-zone-start').locator(`[data-testid="${testId}"]`)).toBeVisible();
      await expect(toolbar.locator('.toolbar-zone-center').locator(`[data-testid="${testId}"]`)).toHaveCount(0);
    }

    // Stage 内部不再有导图工具栏（旧位置应为空）
    await expect(page.locator('[data-testid="mindmap-stage"] [data-testid="mindmap-toolbar"]')).toHaveCount(0);

    // 代表性按钮都在居中 zone 内
    for (const testId of [
      'mm-add-child',
      'mm-add-sibling',
      'mm-undo',
      'mm-fit',
      'mm-zoom-in',
      'mm-layout-mindmap',
      'mm-theme-select',
      'mm-import',
      'mm-export',
      'mm-print',
      'mm-toggle-outline',
      'mm-properties-toggle',
    ]) {
      await expect(toolbar.locator('.toolbar-zone-center').locator(`[data-testid="${testId}"]`)).toBeVisible();
    }

    // 真实行为：通过全局工具栏新增子主题 / 撤销，画布节点数随之变化
    const nodes = page.locator('[data-testid="mindmap-canvas"] .mm-node');
    await expect(nodes).toHaveCount(1);
    await toolbar.locator('[data-testid="mm-add-child"]').click();
    await expect(nodes).toHaveCount(2);
    await toolbar.locator('[data-testid="mm-undo"]').click();
    await expect(nodes).toHaveCount(1);
  });

  test('E2E-UX3-C2: 非导图标签不渲染导图工具组，Tau 原始工具在最左 zone', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="toolbar"]');
    await page.click('[data-testid="btn-new-file"]');
    await page.waitForSelector('[data-testid="editor-container"]');

    const toolbar = page.locator('[data-testid="toolbar"]');
    await expect(toolbar.locator('[data-testid="mindmap-toolbar"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="mm-add-child"]')).toHaveCount(0);
    await expect(toolbar.locator('.toolbar-zone-start').locator('[data-testid="btn-new-file"]')).toBeVisible();
  });

  test('E2E-UX3-B1: 大纲列与属性列独立开合（默认大纲开、属性关），顶部 tab 条已移除', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="toolbar"]');
    await openNewMindmap(page);

    const toolbar = page.locator('[data-testid="toolbar"]');
    const outlineColumn = page.locator('[data-testid="mm-right-outline"]');
    const propertiesColumn = page.locator('[data-testid="mm-right-properties"]');
    const outlineToggle = toolbar.locator('[data-testid="mm-toggle-outline"]');
    const propertiesToggle = toolbar.locator('[data-testid="mm-properties-toggle"]');

    // 默认：大纲列展开、属性列收起
    await expect(outlineColumn).toBeVisible();
    await expect(outlineToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(propertiesColumn).toHaveCount(0);
    await expect(propertiesToggle).toHaveAttribute('aria-pressed', 'false');

    // 打开属性列 → 两列并存（各自独立，不是 tab 互斥）
    await propertiesToggle.click();
    await expect(propertiesColumn).toBeVisible();
    await expect(page.locator('[data-testid="mm-props"]')).toBeVisible();
    await expect(outlineColumn).toBeVisible();

    // 收起大纲列 → 属性列不受影响
    await outlineToggle.click();
    await expect(outlineColumn).toHaveCount(0);
    await expect(outlineToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(propertiesColumn).toBeVisible();

    // 重新展开大纲列 → 两列再次并存
    await outlineToggle.click();
    await expect(outlineColumn).toBeVisible();
    await expect(page.locator('[data-testid="mindmap-outline"]')).toBeVisible();

    // 收起属性列 → 大纲列仍在
    await propertiesToggle.click();
    await expect(propertiesColumn).toHaveCount(0);
    await expect(outlineColumn).toBeVisible();

    // 返工要求：顶部 tab 条 / 收起按钮 / 旧单列容器 testid 均已删除
    for (const removedTestId of [
      'mm-right-panel',
      'mm-right-tabs',
      'mm-right-collapse',
      'mm-right-tab-outline',
      'mm-right-tab-properties',
      'mm-right-resizer',
    ]) {
      await expect(page.locator(`[data-testid="${removedTestId}"]`)).toHaveCount(0);
    }
  });

  test('E2E-UX3-B2: Ctrl+Alt+O / Ctrl+Alt+P 独立开关两列', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="toolbar"]');
    await openNewMindmap(page);

    const outlineColumn = page.locator('[data-testid="mm-right-outline"]');
    const propertiesColumn = page.locator('[data-testid="mm-right-properties"]');

    await expect(outlineColumn).toBeVisible();
    await expect(propertiesColumn).toHaveCount(0);

    await page.locator('[data-testid="mindmap-stage"]').focus();

    // Ctrl+Alt+P 打开属性列，大纲列保持
    await page.keyboard.press('Control+Alt+P');
    await expect(propertiesColumn).toBeVisible();
    await expect(outlineColumn).toBeVisible();

    // Ctrl+Alt+O 收起大纲列，属性列保持
    await page.keyboard.press('Control+Alt+O');
    await expect(outlineColumn).toHaveCount(0);
    await expect(propertiesColumn).toBeVisible();

    // 再按一次 Ctrl+Alt+O 重新展开大纲列
    await page.keyboard.press('Control+Alt+O');
    await expect(outlineColumn).toBeVisible();
  });

  test('E2E-UX3-B3: 两列各自 resizer 独立调宽', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="toolbar"]');
    await openNewMindmap(page);

    const toolbar = page.locator('[data-testid="toolbar"]');
    const outlineColumn = page.locator('[data-testid="mm-right-outline"]');
    const propertiesColumn = page.locator('[data-testid="mm-right-properties"]');

    await toolbar.locator('[data-testid="mm-properties-toggle"]').click();
    await expect(propertiesColumn).toBeVisible();

    const outlineBefore = await outlineColumn.boundingBox();
    const propertiesBefore = await propertiesColumn.boundingBox();
    expect(outlineBefore).toBeTruthy();
    expect(propertiesBefore).toBeTruthy();

    // 拖大纲列 resizer 向左 60px → 大纲列变宽，属性列宽度不受影响
    const outlineResizer = page.locator('[data-testid="mm-outline-resizer"]');
    const outlineHandle = await outlineResizer.boundingBox();
    expect(outlineHandle).toBeTruthy();
    await page.mouse.move(outlineHandle!.x + outlineHandle!.width / 2, outlineHandle!.y + outlineHandle!.height / 2);
    await page.mouse.down();
    await page.mouse.move(outlineHandle!.x - 60, outlineHandle!.y + outlineHandle!.height / 2, { steps: 6 });
    await page.mouse.up();

    await expect
      .poll(async () => (await outlineColumn.boundingBox())?.width ?? 0)
      .toBeGreaterThan(outlineBefore!.width + 30);
    expect(Math.abs((await propertiesColumn.boundingBox())!.width - propertiesBefore!.width)).toBeLessThanOrEqual(2);

    // 拖属性列 resizer 向左 40px → 属性列变宽，大纲列宽度不受影响
    const propertiesResizer = page.locator('[data-testid="mm-props-resizer"]');
    const propertiesHandle = await propertiesResizer.boundingBox();
    expect(propertiesHandle).toBeTruthy();
    const outlineBeforeSecond = await outlineColumn.boundingBox();
    await page.mouse.move(
      propertiesHandle!.x + propertiesHandle!.width / 2,
      propertiesHandle!.y + propertiesHandle!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(propertiesHandle!.x - 40, propertiesHandle!.y + propertiesHandle!.height / 2, { steps: 6 });
    await page.mouse.up();

    await expect
      .poll(async () => (await propertiesColumn.boundingBox())?.width ?? 0)
      .toBeGreaterThan(propertiesBefore!.width + 20);
    expect(Math.abs((await outlineColumn.boundingBox())!.width - outlineBeforeSecond!.width)).toBeLessThanOrEqual(2);
  });
});
