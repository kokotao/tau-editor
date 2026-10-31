/**
 * 官网 v0.6.31 素材生成脚本（独立运行，不依赖 ffmpeg）
 *
 * 生成：
 *  - website/public/assets/mindmap-workspace.png  思维导图工作台（画布 + 右侧双栏 + 工具栏居中）
 *  - website/public/assets/mindmap-new-file-menu.png 右键「新建文件」二级类型菜单
 *  - website/public/assets/mindmap-tour.gif      思维导图动图（新建子主题 → 布局切换 → 双栏开合）
 *
 * 用法：
 *   node scripts/capture-website-assets-0.6.31.mjs [baseURL]
 *   默认 baseURL = http://localhost:5173（先 cd frontend && pnpm dev）
 *
 * 依赖：本机 node + @playwright/test + python3 + PIL（gif 合成用）
 */
import { chromium } from '@playwright/test';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseURL = process.argv[2] ?? process.env.BASE_URL ?? 'http://localhost:5173';
const outDir = path.join(root, 'website/public/assets');
const framesDir = path.join(root, '.tmp-website-frames');

const FRAME_INTERVAL_MS = 350;
const GIF_FPS = 8;

async function seedPage(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('text-editor-last-opened-at-v1', String(Date.now()));
      localStorage.setItem('text-editor-first-install-guide-v1', '1');
      localStorage.setItem('text-editor-guide-last-shown-at-v1', String(Date.now()));
    } catch { /* ignore */ }
  });
}

async function openNewMindmap(page) {
  await page.keyboard.press('Control+Shift+P');
  await page.waitForSelector('.palette-search-input', { timeout: 15000 });
  await page.fill('.palette-search-input', '思维导图');
  await page.locator('.palette-item').filter({ hasText: '新建思维导图' }).first().click();
  await page.waitForSelector('[data-testid="mindmap-canvas"]', { timeout: 15000 });
}

async function focusStage(page) {
  await page.locator('[data-testid="mindmap-stage"]').focus();
}

async function captureMindmapWorkspace(page) {
  // 新建导图 → 加几个主题 → 展开属性列 → 让画面饱满
  await openNewMindmap(page);
  await focusStage(page);

  // 中心主题改名
  const rootNode = page.locator('.mm-node').first();
  await rootNode.dblclick();
  const editor = page.locator('.mm-inline-editor input, .mm-inline-editor textarea, [class*="rename"] input');
  if (await editor.count()) {
    await editor.first().fill('2026 产品路线图');
    await editor.first().press('Enter');
  }
  await page.waitForTimeout(400);

  // 通过全局工具栏加子主题（展示工具栏可用）
  await focusStage(page);
  await page.keyboard.press('Tab');
  await focusStage(page);
  await page.keyboard.type('季度 OKR');
  await page.keyboard.press('Enter');
  await focusStage(page);
  await page.keyboard.type('产品设计');
  await page.keyboard.press('Tab');
  await page.keyboard.type('设计方案');
  await page.keyboard.press('Enter');
  await page.keyboard.type('用户访谈');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 打开属性面板（右侧第二列）
  const propsToggle = page.locator('[data-testid="mm-properties-toggle"]');
  if (await propsToggle.count()) {
    await propsToggle.first().click();
    await page.waitForTimeout(500);
  }

  // 选中一个节点让属性面板有内容
  await page.locator('.mm-node').nth(1).click();
  await page.waitForTimeout(600);

  // 清理：收起命令面板残留、确认无弹层
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  await page.screenshot({ path: path.join(outDir, 'mindmap-workspace.png') });
  console.log('[capture] mindmap-workspace.png saved');
}

async function captureNewFileMenu(page) {
  // 复用 E2E helpers 的伪装：伪造工作区上下文让 FileTree 渲染（纯浏览器无 Tauri 文件系统）
  await page.evaluate(() => {
    try {
      localStorage.setItem(
        'text-editor-workspace',
        JSON.stringify({
          mode: 'workspace',
          currentWorkspacePath: 'C:\\e2e-workspace',
          currentWorkspaceName: 'e2e-workspace',
          workspaceOrigin: 'user',
          recentProjects: [],
          recentFiles: [],
        }),
      );
    } catch { /* ignore */ }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="toolbar"]', { timeout: 30000 });
  await page.waitForTimeout(800);

  // 打开左侧文件树（如果没渲染出来）
  const sidebar = page.locator('[data-testid="sidebar-panel-workspace"]');
  if (!(await sidebar.isVisible().catch(() => false))) {
    const expand = page.locator('[data-testid="btn-sidebar-expand"]');
    if (await expand.count()) await expand.first().click();
    await page.waitForTimeout(500);
  }

  const box = await sidebar.boundingBox();
  if (!box) throw new Error('sidebar-panel-workspace has no box');
  // 文件树右键：header 下方第一个可命中区域（调试确认 y≈90 能打开菜单）
  await page.mouse.click(box.x + Math.min(100, box.width / 2), box.y + 90, { button: 'right' });
  await page.waitForTimeout(700);

  const newFileItem = page.locator('[data-testid="file-tree-new-file"]');
  console.log('[capture] new-file menu count:', await newFileItem.count());
  if (await newFileItem.count()) {
    // hover 触发 mouseenter 展开二级类型菜单
    await newFileItem.first().hover();
    await page.waitForTimeout(900);
  }

  // 二级类型菜单是否展开
  const submenuCount = await page.locator('[data-testid="file-tree-new-file-submenu"]').count();
  console.log('[capture] submenu count:', submenuCount);

  await page.screenshot({ path: path.join(outDir, 'mindmap-new-file-menu.png') });
  console.log('[capture] mindmap-new-file-menu.png saved');
}

async function captureMindmapTour(page) {
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  await openNewMindmap(page);
  await focusStage(page);

  const frames = [];
  const shot = async (name) => {
    await page.screenshot({ path: path.join(framesDir, `${String(frames.length).padStart(3, '0')}-${name}.png`) });
    frames.push(name);
  };

  // 阶段 1：中心主题
  await page.waitForTimeout(500);
  await shot('base');

  // 阶段 2：加子主题
  await focusStage(page);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  await page.keyboard.type('产品规划');
  await page.waitForTimeout(400);
  await shot('child-add');

  // 阶段 3：再多加两个分支
  await page.keyboard.press('Enter');
  await page.keyboard.type('技术架构');
  await page.keyboard.press('Enter');
  await page.keyboard.type('运营增长');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await shot('branches');

  // 阶段 4：切换组织结构布局（org）——组织图从上到下，更明显
  const layoutOrg = page.locator('[data-testid="mm-layout-org"]');
  if (await layoutOrg.count()) {
    await layoutOrg.first().click();
    await page.waitForTimeout(900);
    await shot('layout-org');
  }

  // 阶段 5：切换树形（tree）
  const layoutTree = page.locator('[data-testid="mm-layout-tree"]');
  if (await layoutTree.count()) {
    await layoutTree.first().click();
    await page.waitForTimeout(900);
    await shot('layout-tree');
  }

  // 阶段 6：打开属性面板（双栏）
  const propsToggle = page.locator('[data-testid="mm-properties-toggle"]');
  if (await propsToggle.count()) {
    await propsToggle.first().click();
    await page.waitForTimeout(700);
    await page.locator('.mm-node').nth(1).click();
    await page.waitForTimeout(700);
    await shot('properties-open');
  }

  // 阶段 7：收起属性 → 收起大纲
  if (await propsToggle.count()) {
    await propsToggle.first().click();
    await page.waitForTimeout(500);
  }
  const outlineToggle = page.locator('[data-testid="mm-toggle-outline"]');
  if (await outlineToggle.count()) {
    await outlineToggle.first().click();
    await page.waitForTimeout(500);
    await shot('panels-collapsed');
  }

  // 阶段 8：恢复大纲（画布回到完整）
  if (await outlineToggle.count()) {
    await outlineToggle.first().click();
    await page.waitForTimeout(600);
    await shot('panels-restored');
  }

  // 合成 GIF
  const script = `
import sys
from PIL import Image
paths = sys.argv[1:]
frames = []
TARGET = (1280, 800)
for p in paths:
    im = Image.open(p).convert('RGB')
    im.thumbnail(TARGET, Image.LANCZOS)
    frames.append(im)
frames[0].save(r'${outDir.replace(/\\/g, '\\\\\\\\')}\\mindmap-tour.gif', save_all=True, append_images=frames[1:], duration=${1000 / GIF_FPS}, loop=0, optimize=True)
print('gif frames:', len(frames))
`;
  const scriptPath = path.join(framesDir, 'make-gif.py');
  await writeFile(scriptPath, script, 'utf8');
  const pngs = frames.map((name, i) => path.join(framesDir, `${String(i).padStart(3, '0')}-${name}.png`));
  const result = execFileSync('python', [scriptPath, ...pngs], { encoding: 'utf8' });
  console.log('[capture] gif result:', result.trim());
  await rm(framesDir, { recursive: true, force: true });
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      locale: 'zh-CN',
    });
    const page = await context.newPage();
    await seedPage(page);
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="toolbar"]', { timeout: 30000 });
    await page.waitForTimeout(800);

    await captureMindmapWorkspace(page);
    await captureNewFileMenu(page);
    await captureMindmapTour(page);

    await context.close();
  } finally {
    await browser.close();
  }
  console.log('[capture] done');
}

main().catch((error) => {
  console.error('[capture] 失败：', error);
  process.exitCode = 1;
});