import { type Page } from '@playwright/test';

/**
 * UX-3 回归用的浏览器环境替身。
 *
 * 纯 Chromium（无 Tauri）下，文件树与云端面板都拿不到真实数据，但它们的
 * 右键菜单/类型菜单是纯前端逻辑；这里用两种最小的环境替身把这两条链路打开：
 * 1. `seedBrowserWorkspace`：伪造工作区上下文（localStorage），让 FileTree 渲染；
 * 2. `mockTauriCloudBackend`：桩掉 `window.__TAURI_INTERNALS__.invoke`，
 *    让云端侧栏拿到「分类 + 文档」的最小数据（不依赖真实后端）。
 *
 * 约束：只在用例内使用，不改变应用代码；断言对象仍是真实浏览器里渲染出来的 DOM。
 */

/** stores/workspace.ts 的 STORAGE_KEY。 */
const WORKSPACE_STORAGE_KEY = 'text-editor-workspace';

/** 伪造工作区上下文，使文件树在纯浏览器模式下渲染（树为空，右键菜单可用）。 */
export async function seedBrowserWorkspace(page: Page, workspacePath = 'C:\\e2e-workspace'): Promise<void> {
  await page.addInitScript((path: string) => {
    try {
      localStorage.setItem('text-editor-last-opened-at-v1', String(Date.now()));
      localStorage.setItem('text-editor-first-install-guide-v1', '1');
      localStorage.removeItem('text-editor-recovery-v2');
      localStorage.removeItem('text-editor-session-v1');
      localStorage.setItem(
        'text-editor-workspace',
        JSON.stringify({
          mode: 'workspace',
          currentWorkspacePath: path,
          currentWorkspaceName: 'e2e-workspace',
          workspaceOrigin: 'user',
          recentProjects: [],
          recentFiles: [],
        }),
      );
    } catch {
      // 非 http(s) 文档（如 about:blank）没有 localStorage
    }
  }, workspacePath);
}

export interface CloudBackendMockOptions {
  /** 云端分类名（右键菜单的目录行）。 */
  categoryName?: string;
  /** 云端已有文档路径（用于确认树里有文件行）。 */
  docPath?: string;
}

/**
 * 桩掉 Tauri invoke，让云端文档面板在纯 Chromium 可用。
 *
 * 只需覆盖云端面板真正的网络边界：
 * - `cloud_session`（登录态）→ stores/cloudSync 置 signedIn；
 * - `cloud_categories_list` → 分类树；
 * - `cloud_docs_list` → 文档列表；
 * - `cloud_docs_me` / `cloud_quota_summary` 等 → 侧栏展示用的空壳数据。
 * 其它命令一律返回 null，并记录到 `window.__E2E_TAURI_CALLS__` 便于排查。
 */
export async function mockTauriCloudBackend(page: Page, options: CloudBackendMockOptions = {}): Promise<void> {
  const categoryName = options.categoryName ?? 'E2E 分类';
  const docPath = options.docPath ?? 'tau/e2e/demo.mm';

  await page.addInitScript(
    ({ categoryName: name, docPath: path }: { categoryName: string; docPath: string }) => {
      const categories = [{ id: '1001', name, parentId: null, children: [] }];
      const fileName = path.split('/').pop() ?? path;
      const docs = [
        {
          fileId: 1,
          path,
          title: fileName,
          contentHash: null,
          size: 128,
          version: 1,
          category: name,
          categoryId: '1001',
          tags: null,
          visibility: null,
          publishedArticleId: null,
          updatedAt: '2026-10-30T00:00:00Z',
        },
      ];

      const calls: string[] = [];
      (window as unknown as { __E2E_TAURI_CALLS__: string[] }).__E2E_TAURI_CALLS__ = calls;
      // 记录命令参数，供 E2E 断言「前端透传」内容（如自定义扩展名）
      const invocations: Array<{ command: string; args: unknown }> = [];
      (window as unknown as { __E2E_TAURI_INVOCATIONS__: Array<{ command: string; args: unknown }> })
        .__E2E_TAURI_INVOCATIONS__ = invocations;

      const handlers: Record<string, () => unknown> = {
        cloud_session: () => ({ signedIn: true, userId: '1', username: 'e2e', baseUrl: 'https://e2e.local' }),
        cloud_categories_list: () => categories,
        cloud_docs_list: () => ({ records: docs, total: docs.length, page: 1, size: 100 }),
        cloud_docs_me: () => ({
          userId: '1',
          usedBytes: 128,
          quotaBytes: 1073741824,
          fileCount: 1,
          maxVersionPerFile: 10,
        }),
        cloud_quota_summary: () => ({ plan: 'free', usedBytes: 128, quotaBytes: 1073741824 }),
        cloud_checkin_status: () => ({ checkedIn: false }),
        cloud_points: () => ({ points: 0 }),
        // 新建云端文档（内存落一份，供「自定义格式」提交链路走通并断言透传参数）
        cloud_docs_save: () => ({
          fileId: 2,
          version: 1,
          contentHash: 'e2e-hash',
          size: 0,
          updatedAt: '2026-10-31T00:00:00Z',
        }),
      };

      let callbackId = 0;
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
        invoke: async (command: string, args: unknown) => {
          calls.push(command);
          invocations.push({ command, args });
          const handler = handlers[command];
          return handler ? handler() : null;
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
    },
    { categoryName, docPath },
  );
}

/**
 * 桩掉 Tauri 运行时（最小 `__TAURI_INTERNALS__`），让 Tauri-only 的 UI 在纯 Chromium 里渲染出来，
 * 例如桌面标题栏 `app-native-titlebar`（其中的 `btn-titlebar-toggle-explorer` 是本次 Toolbar 精简后
 * 侧栏开关的桌面端等价入口）。
 *
 * 所有命令一律返回 null；应用会打几条降级 warning，但界面仍可正常渲染（与真实 Tauri 启动路径一致）。
 */
export async function mockTauriDesktopRuntime(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let callbackId = 0;
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke: async () => null,
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
  });
}
