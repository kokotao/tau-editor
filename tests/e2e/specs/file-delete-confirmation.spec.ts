import { expect, test } from '@playwright/test';

const workspacePath = 'C:\\e2e-delete-workspace';
const filePath = `${workspacePath}\\delete-me.md`;

const deleteCallCount = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const calls = (window as unknown as {
      __E2E_TAURI_INVOCATIONS__: Array<{ command: string; args: unknown }>;
    }).__E2E_TAURI_INVOCATIONS__ ?? [];
    return calls.filter(({ command }) => command === 'delete_file').length;
  });

const fileLocator = (page: import('@playwright/test').Page) =>
  page.locator('.file-tree-item').filter({ hasText: 'delete-me.md' });

async function openDeleteConfirmation(page: import('@playwright/test').Page) {
  const file = fileLocator(page);
  await expect(file).toBeVisible();
  await file.click({ button: 'right' });
  await page.locator('.context-menu-item.danger').click();
  await expect(page.locator('[data-testid="file-delete-dialog"]')).toBeVisible();
  return file;
}

test.describe('文件删除确认', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((rootPath) => {
      try {
        localStorage.setItem('text-editor-workspace', JSON.stringify({
          mode: 'workspace',
          currentWorkspacePath: rootPath,
          currentWorkspaceName: 'e2e-delete-workspace',
          workspaceOrigin: 'user',
          recentProjects: [],
          recentFiles: [],
        }));
        localStorage.setItem('text-editor-recovery-v2', JSON.stringify({
          version: 2,
          session: {
            version: 2,
            savedAt: Date.now(),
            workspacePath: rootPath,
            activeTabPath: null,
            openTabs: [],
            layout: {
              mode: 'workspace',
              workspaceName: 'e2e-delete-workspace',
              activeTabId: null,
            },
            recentWorkspaces: [rootPath],
            tabs: [],
          },
          drafts: [],
        }));
      } catch {
        // 非 http(s) 文档没有 localStorage，忽略。
      }

      const files = [{ name: 'delete-me.md', path: `${rootPath}\\delete-me.md`, type: 'file', size: 12 }];
      const invocations: Array<{ command: string; args: unknown }> = [];
      (window as unknown as { __E2E_TAURI_INVOCATIONS__: typeof invocations }).__E2E_TAURI_INVOCATIONS__ = invocations;

      let callbackId = 0;
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
        invoke: async (command: string, args: { path?: string } = {}) => {
          invocations.push({ command, args });
          if (command === 'list_files') return files;
          if (command === 'delete_file') {
            const index = files.findIndex((file) => file.path === args.path);
            if (index >= 0) files.splice(index, 1);
          }
          return null;
        },
        transformCallback: (callback: unknown) => {
          callbackId += 1;
          (window as unknown as Record<string, unknown>)[`_${callbackId}`] = callback;
          return callbackId;
        },
        unregisterCallback: () => {},
        convertFileSrc: (value: string) => value,
        metadata: {
          currentWindow: { label: 'main' },
          currentWebview: { windowLabel: 'main', label: 'main' },
        },
      };
    }, workspacePath);

    await page.goto('/');
    await page.waitForSelector('[data-testid="toolbar"]');
    await expect(fileLocator(page)).toBeVisible();
  });

  test('确认弹窗打开但未确认时文件仍存在且没有调用删除接口', async ({ page }) => {
    const file = await openDeleteConfirmation(page);

    await expect(file).toBeVisible();
    expect(await deleteCallCount(page)).toBe(0);
  });

  test('取消、Escape 和点击遮罩都不会删除文件', async ({ page }) => {
    const file = await openDeleteConfirmation(page);
    await page.locator('[data-testid="file-delete-cancel"]').click();
    await expect(page.locator('[data-testid="file-delete-dialog"]')).toBeHidden();
    await expect(file).toBeVisible();
    expect(await deleteCallCount(page)).toBe(0);

    await file.click({ button: 'right' });
    await page.locator('.context-menu-item.danger').click();
    await page.locator('[data-testid="file-delete-dialog"]').press('Escape');
    await expect(page.locator('[data-testid="file-delete-dialog"]')).toBeHidden();
    await expect(file).toBeVisible();
    expect(await deleteCallCount(page)).toBe(0);

    await file.click({ button: 'right' });
    await page.locator('.context-menu-item.danger').click();
    await page.locator('[data-testid="file-delete-backdrop"]').click({ position: { x: 8, y: 8 } });
    await expect(page.locator('[data-testid="file-delete-dialog"]')).toBeHidden();
    await expect(file).toBeVisible();
    expect(await deleteCallCount(page)).toBe(0);
  });

  test('只有明确点击删除确认后才调用删除接口', async ({ page }) => {
    await openDeleteConfirmation(page);
    await page.locator('[data-testid="file-delete-confirm"]').click();

    await expect(page.locator('[data-testid="file-delete-dialog"]')).toBeHidden();
    await expect(fileLocator(page)).toBeHidden();
    expect(await deleteCallCount(page)).toBe(1);
    expect(await page.evaluate(() => {
      const calls = (window as unknown as {
        __E2E_TAURI_INVOCATIONS__: Array<{ command: string; args: { path?: string } }>;
      }).__E2E_TAURI_INVOCATIONS__;
      return calls.find(({ command }) => command === 'delete_file')?.args.path;
    })).toBe(filePath);
  });
});
