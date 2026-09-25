import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseURL = process.env.TAU_EDITOR_BASE_URL ?? 'http://127.0.0.1:5173';
const outputDir = path.resolve('test-results/editor-style-baseline');
const viewports = [
  { name: '1680x1050', width: 1680, height: 1050 },
  { name: '1280x720', width: 1280, height: 720 },
];

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      colorScheme: 'dark',
      deviceScaleFactor: 1,
    });

    await page.addInitScript(() => {
      localStorage.setItem('text-editor-last-opened-at-v1', String(Date.now()));
      localStorage.setItem('text-editor-first-install-guide-v1', '1');
      localStorage.removeItem('text-editor-recovery-v2');
      localStorage.removeItem('text-editor-session-v1');
    });

    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await page.getByTestId('btn-new-file').click();
    await page.getByTestId('editor-container').waitFor({ state: 'visible' });
    await page.getByTestId('editor-container').click({ position: { x: 140, y: 48 } });
    await page.keyboard.type('# Tau Editor\n\n平角布局、清晰字体、标签交互与状态提示视觉基线。\n');
    await page.getByTestId('dirty-indicator').waitFor({ state: 'visible' });
    await page.getByTestId('tab').hover();
    await page.getByTestId('tab-tooltip').waitFor({ state: 'visible' });
    await page.waitForTimeout(150);

    const screenshotPath = path.join(outputDir, `${viewport.name}-editor.png`);
    await page.screenshot({ path: screenshotPath });
    console.log(screenshotPath);

    if (viewport.name === '1680x1050') {
      await page.mouse.move(viewport.width - 80, Math.round(viewport.height / 2));
      await page.getByTestId('system-menu-trigger').click();
      await page.getByTestId('system-menu-item-open-command-palette').click();
      await page.locator('.command-palette').waitFor({ state: 'visible' });
      const palettePath = path.join(outputDir, `${viewport.name}-command-palette.png`);
      await page.screenshot({ path: palettePath });
      console.log(palettePath);

      await page.keyboard.press('Escape');
      await page.getByTestId('btn-settings').click();
      await page.getByTestId('settings-page').waitFor({ state: 'visible' });
      await page.waitForTimeout(500);
      const settingsPath = path.join(outputDir, `${viewport.name}-settings.png`);
      await page.screenshot({ path: settingsPath });
      console.log(settingsPath);
    }

    await page.close();
  }
} finally {
  await browser.close();
}
