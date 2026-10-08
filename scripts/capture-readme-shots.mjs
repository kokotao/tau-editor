/**
 * README 截图 / GIF 素材生成脚本
 *
 * 用 Playwright 驱动前端 Web 版本，在隔离的 localStorage 下生成干净、可复现的界面截图，
 * 不会影响本机已安装桌面版的设置。
 *
 * 用法：
 *   node scripts/capture-readme-shots.mjs [baseURL]
 *   默认 baseURL = http://localhost:5173（需先执行 cd frontend && pnpm dev）
 *
 * 产物：
 *   docs/assets/screenshots/editor.png           编辑器主界面
 *   docs/assets/screenshots/markdown-preview.png Markdown 分栏预览
 *   docs/assets/screenshots/command-palette.png  命令面板
 *   docs/assets/screenshots/settings.png         设置面板（快捷键 / 扩展点）
 *   .tmp-readme-video/*.webm                     录屏原始文件（用于转 GIF）
 */
import { chromium } from '@playwright/test';
import { mkdir, rm, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseURL = process.argv[2] ?? process.env.BASE_URL ?? 'http://localhost:5173';
const shotsDir = path.join(root, 'docs/assets/screenshots');
const videoDir = path.join(root, '.tmp-readme-video');

const HERO_CODE = `import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { ThemePackage } from '@/utils/themePackage';

/**
 * 编辑器会话：标签、主题包与快捷键覆盖
 */
export const useEditorSession = defineStore('editor-session', () => {
  const tabs = ref<EditorTab[]>([]);
  const activeTabId = ref<string | null>(null);

  const activeTab = computed(
    () => tabs.value.find((tab) => tab.id === activeTabId.value) ?? null,
  );

  function openFile(filePath: string, content: string) {
    const language = detectLanguage(filePath);
    tabs.value.push(createTab({ filePath, content, language }));
    activeTabId.value = tabs.value.at(-1)!.id;
  }

  return { tabs, activeTabId, activeTab, openFile };
});
`;

const MARKDOWN_DOC = `# Tau Editor v0.6.11

跨平台文本编辑器，支持主题包、快捷键自定义与 Monaco Diff 对比。

## 本次更新

- 编辑器路径面包屑与工作区导航
- Markdown 分栏预览主题同步
- 状态栏语言模式键盘导航
- macOS 标题栏更新与快捷入口

| 能力 | 状态 |
| --- | --- |
| 路径面包屑 | 已完成 |
| Markdown 预览主题 | 已同步 |
| 状态栏可访问性 | 已支持 |

> 提示：按 F1 打开命令面板。

- [x] 入口 chunk 1115 KB 降至 313 KB
- [ ] Intel Mac 构建支持
`;

const SETTINGS_SEED = {
  theme: 'dark',
  themeSkin: 'deep-ocean',
  monacoTheme: 'vs-dark',
  customThemeColors: {},
  uiLanguage: 'zh-CN',
  restoreLastSession: false,
  autoSaveEnabled: false,
  markdownPreviewEnabled: true,
  markdownPreviewMode: 'edit',
  showHiddenFiles: false,
  keybindingOverrides: {},
};

async function seedStorage(context, seed) {
  await context.addInitScript((payload) => {
    localStorage.setItem('text-editor-settings', JSON.stringify(payload));
    // 跳过首次安装指南：指南只在「最近打开时间」缺失或超过 14 天时弹出
    localStorage.setItem('text-editor-first-install-guide-v1', '1');
    localStorage.setItem('text-editor-last-opened-at-v1', String(Date.now()));
    localStorage.setItem('text-editor-guide-last-shown-at-v1', String(Date.now()));
  }, seed);
}

async function waitForEditor(page) {
  await page.waitForSelector('[data-testid="toolbar"]', { timeout: 30000 });
  await page.waitForTimeout(600);
}

/** 让焦点离开 Monaco，再按 F1 / Ctrl+Shift+P 打开命令面板。 */
const PASTE_KEY = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';

/**
 * 用剪贴板粘贴代替逐字输入：
 * Monaco 会对 insertText/type 触发括号自动补全，导致代码出现多余闭合符。
 */
async function pasteIntoEditor(page, text) {
  await page.evaluate(async (value) => {
    await navigator.clipboard.writeText(value);
  }, text);
  await page.keyboard.press(PASTE_KEY);
  await page.waitForTimeout(250);
}

/** 双击标签重命名，让截图里的文件名更贴近真实场景。 */
async function renameActiveTab(page, name) {
  await page.locator('[data-testid="tab"].active').first().dblclick();
  const input = page.locator('.tab-rename-input');
  await input.waitFor({ state: 'visible' });
  await input.fill(name);
  await input.press('Enter');
  await page.waitForTimeout(250);
}

async function selectStatusOption(page, testId, value) {
  const trigger = page.locator(`[data-testid="${testId}"]`);
  await trigger.click();
  await page.locator(`[data-testid="${testId}-option-${value}"]`).click();
  await page.waitForTimeout(150);
}

async function openCommandPalette(page) {
  for (const keys of ['F1', 'Control+Shift+P']) {
    await page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        active.blur();
      }
    });
    await page.keyboard.press(keys);
    try {
      await page.waitForSelector('.command-palette', { timeout: 4000 });
      return;
    } catch {
      // 换下一个快捷键重试
    }
  }
  throw new Error('命令面板未能打开');
}

async function captureScreenshots(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await seedStorage(context, SETTINGS_SEED);
  const page = await context.newPage();

  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await waitForEditor(page);

  // 1. 编辑器主界面
  await page.click('[data-testid="btn-new-file"]');
  await page.waitForSelector('[data-testid="editor-container"] .monaco-editor');
  await page.locator('[data-testid="editor-container"]').click();
  // insertText 不会触发 Monaco 括号自动补全，避免出现多余闭合符
  await pasteIntoEditor(page, HERO_CODE);
  await renameActiveTab(page, 'editor-session.ts');
  // 切到 TypeScript 语言模式，展示语法高亮
  await selectStatusOption(page, 'language-mode-display', 'typescript');
  // 收起侧栏与上下文栏，让首屏展示完整编辑器区域
  await page.click('[data-testid="btn-toggle-file-tree"]');
  await page.click('[data-testid="btn-toggle-context-rail"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shotsDir, 'editor.png') });

  // 2. 命令面板
  await openCommandPalette(page);
  await page.waitForSelector('.command-palette');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shotsDir, 'command-palette.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 3. 设置面板：快捷键 + 扩展点
  await page.click('[data-testid="btn-settings"]');
  await page.waitForSelector('[data-testid="settings-page"] .settings-workspace');
  await page.click('[data-testid="settings-nav-editor"]');
  await page.locator('[data-testid="keybinding-settings"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shotsDir, 'settings.png') });
  await page.click('[data-testid="btn-settings"]');
  await page.waitForTimeout(300);

  // 4. Markdown 分栏预览
  await page.click('[data-testid="btn-new-file"]');
  await page.locator('[data-testid="editor-container"]').click();
  await pasteIntoEditor(page, MARKDOWN_DOC);
  await renameActiveTab(page, 'release-notes.md');
  // 展开上下文栏，展示文档大纲 / 任务 / 链接
  await page.click('[data-testid="btn-toggle-context-rail"]');
  await selectStatusOption(page, 'language-mode-display', 'markdown');
  await page.click('[data-testid="btn-markdown-preview-mode"]');
  await page.waitForSelector('[data-testid="markdown-preview"]');
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(shotsDir, 'markdown-preview.png') });

  await context.close();
}

async function captureTour(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    permissions: ['clipboard-read', 'clipboard-write'],
    recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
  });
  await seedStorage(context, SETTINGS_SEED);
  const page = await context.newPage();

  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await waitForEditor(page);

  await page.click('[data-testid="btn-new-file"]');
  await page.waitForSelector('[data-testid="editor-container"] .monaco-editor');
  await page.locator('[data-testid="editor-container"]').click();
  await pasteIntoEditor(
    page,
    [
      'export function useThemePackage(raw: string) {',
      '  const result = parseThemePackage(raw);',
      '  if (!result.ok) return null;',
      '',
      '  return applyTheme(result.theme);',
      '}',
    ].join('\n'),
  );
  await page.waitForTimeout(500);

  await openCommandPalette(page);
  await page.keyboard.type('主题', { delay: 90 });
  await page.waitForTimeout(1200);

  // 关闭命令面板，进入设置切换主题，展示主题联动
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.click('[data-testid="btn-settings"]');
  await page.waitForSelector('[data-testid="settings-page"] .settings-workspace');
  await page.locator('[data-testid="settings-page"] [data-testid="theme-swatch-light-deep-ocean"]').waitFor({ state: 'visible' });
  await page.locator('[data-testid="settings-page"] [data-testid="theme-swatch-light-deep-ocean"]').click();
  await page.waitForTimeout(1100);
  await page.locator('[data-testid="settings-page"] [data-testid="theme-swatch-dark-deep-ocean"]').click();
  await page.waitForTimeout(1200);

  await context.close();
  const video = page.video();
  if (!video) {
    return;
  }
  const recorded = await video.path();
  await copyFile(recorded, path.join(videoDir, 'tour.webm'));
}

async function main() {
  await mkdir(shotsDir, { recursive: true });
  await rm(videoDir, { recursive: true, force: true });
  await mkdir(videoDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    console.log(`[capture] baseURL = ${baseURL}`);
    await captureScreenshots(browser);
    console.log(`[capture] 截图已写入 ${path.relative(root, shotsDir)}`);
    await captureTour(browser);
    console.log(`[capture] 录屏已写入 ${path.relative(root, videoDir)}/tour.webm`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('[capture] 失败：', error);
  process.exitCode = 1;
});
