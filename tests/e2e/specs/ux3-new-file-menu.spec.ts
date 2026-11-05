import { expect, test } from '@playwright/test';
import { mockTauriCloudBackend, seedBrowserWorkspace } from './helpers/ux3-env';

/**
 * UX-3A 回归：新建文件二级菜单（本地 + 云端）与云端导图格式。
 *
 * 说明：
 * - 本地/云端右键菜单是纯前端逻辑，浏览器模式下用最小环境替身（见 helpers/ux3-env.ts）
 *   打开链路，断言对象仍是真实浏览器渲染出的 DOM；
 * - 云端「白名单 + 新建内容」在无 Tauri 后端时无法走真实接口，按任务约定做前端层验证：
 *   在页面里动态 import 前端模块，验证 mm/opml 被白名单接受、且新建内容能被对应适配器解析。
 */

/** 与 services/newFileTypeOptions.ts 的 NEW_FILE_TYPE_OPTIONS 顺序一致。 */
const NEW_FILE_TYPE_IDS = ['markdown', 'taumap', 'freemind', 'opml', 'plaintext', 'json'] as const;

test.describe('UX-3A: 新建文件二级菜单', () => {
  test('E2E-UX3-A1: 本地文件树右键「新建文件」列出 6 种类型，选择 OPML 预填 .opml 文件名', async ({ page }) => {
    await seedBrowserWorkspace(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="toolbar"]');

    // 纯浏览器下树是空的，但空白区域的右键菜单路径可用
    const treeContent = page.locator('.file-tree-content');
    await expect(treeContent).toBeVisible();
    await treeContent.click({ button: 'right', position: { x: 40, y: 40 } });

    const newFileEntry = page.locator('[data-testid="file-tree-new-file"]');
    await expect(newFileEntry).toBeVisible();
    // 子菜单由 hover 展开（点击是切换，会先 hover 再关掉）
    await newFileEntry.hover();

    await expect(page.locator('[data-testid="file-tree-new-file-submenu"]')).toBeVisible();
    for (const typeId of NEW_FILE_TYPE_IDS) {
      await expect(page.locator(`[data-testid="file-tree-new-file-${typeId}"]`)).toBeVisible();
    }

    await page.locator('[data-testid="file-tree-new-file-opml"]').click();

    const dialog = page.locator('[data-testid="name-dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.locator('.name-dialog-title')).toContainText('OPML');
    await expect(page.locator('[data-testid="name-dialog-input"]')).toHaveValue('未命名大纲.opml');

    await page.locator('[data-testid="name-dialog-cancel"]').click();
    await expect(dialog).toBeHidden();
  });

  test('E2E-UX3-A2: 本地新建 FreeMind 类型按类型预填 .mm 文件名', async ({ page }) => {
    await seedBrowserWorkspace(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="toolbar"]');

    const treeContent = page.locator('.file-tree-content');
    await expect(treeContent).toBeVisible();
    await treeContent.click({ button: 'right', position: { x: 40, y: 40 } });

    await page.locator('[data-testid="file-tree-new-file"]').hover();
    await expect(page.locator('[data-testid="file-tree-new-file-submenu"]')).toBeVisible();
    await page.locator('[data-testid="file-tree-new-file-freemind"]').click();

    await expect(page.locator('[data-testid="name-dialog"]')).toBeVisible();
    await expect(page.locator('.name-dialog-title')).toContainText('FreeMind');
    await expect(page.locator('[data-testid="name-dialog-input"]')).toHaveValue('未命名导图.mm');
    await page.locator('[data-testid="name-dialog-cancel"]').click();
  });

  test('E2E-UX3-A5: 本地「自定义格式」先询问扩展名，再按扩展名预填文件名', async ({ page }) => {
    await seedBrowserWorkspace(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="toolbar"]');

    const treeContent = page.locator('.file-tree-content');
    await expect(treeContent).toBeVisible();
    await treeContent.click({ button: 'right', position: { x: 40, y: 40 } });

    await page.locator('[data-testid="file-tree-new-file"]').hover();
    await expect(page.locator('[data-testid="file-tree-new-file-submenu"]')).toBeVisible();

    const customEntry = page.locator('[data-testid="file-tree-new-file-custom"]');
    await expect(customEntry).toBeVisible();
    await customEntry.click();

    // 第一段：询问扩展名（默认 txt）
    const dialog = page.locator('[data-testid="name-dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.locator('.name-dialog-title')).toContainText('扩展名');
    const input = page.locator('[data-testid="name-dialog-input"]');
    await expect(input).toHaveValue('txt');
    await input.fill('doc');
    await page.locator('[data-testid="name-dialog-confirm"]').click();

    // 第二段：按自定义扩展名预填文件名
    await expect(page.locator('.name-dialog-title')).toContainText('自定义格式 .doc');
    await expect(page.locator('[data-testid="name-dialog-input"]')).toHaveValue('未命名.doc');
    await page.locator('[data-testid="name-dialog-cancel"]').click();
    await expect(dialog).toBeHidden();
  });

  test('E2E-UX3-A5b: 本地自定义扩展名非法时提示错误且不再弹命名框', async ({ page }) => {
    await seedBrowserWorkspace(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="toolbar"]');

    const treeContent = page.locator('.file-tree-content');
    await expect(treeContent).toBeVisible();
    await treeContent.click({ button: 'right', position: { x: 40, y: 40 } });

    await page.locator('[data-testid="file-tree-new-file"]').hover();
    await expect(page.locator('[data-testid="file-tree-new-file-submenu"]')).toBeVisible();
    await page.locator('[data-testid="file-tree-new-file-custom"]').click();

    const dialog = page.locator('[data-testid="name-dialog"]');
    await expect(dialog).toBeVisible();
    // 'a b' 含空格，normalizeCustomExtension 应拒绝
    await page.locator('[data-testid="name-dialog-input"]').fill('a b');
    await page.locator('[data-testid="name-dialog-confirm"]').click();

    await expect(dialog).toBeHidden();
    await expect(
      page.locator('[data-testid="notification-item"]').filter({ hasText: '文件扩展名' }),
    ).toBeVisible();
  });

  test('E2E-UX3-A3: 云端分类右键类型菜单包含 .mm/.opml，选择 OPML 按类型预填文件名', async ({ page }) => {
    await mockTauriCloudBackend(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="toolbar"]');

    await page.locator('[data-testid="sidebar-tab-cloud"]').click();
    const dirRow = page.locator('[data-testid="cloud-browser-dir"]').first();
    await expect(dirRow).toBeVisible();
    await expect(page.locator('[data-testid="cloud-browser-file"]').first()).toBeVisible();

    await dirRow.click({ button: 'right' });
    const newFileEntry = page.locator('[data-testid="cloud-category-menu-new-file"]');
    await expect(newFileEntry).toBeVisible();
    await newFileEntry.hover();

    await expect(page.locator('[data-testid="cloud-new-file-type-menu"]')).toBeVisible();
    // 云端菜单只列白名单内类型，.mm（freemind）与 .opml 必须在场
    await expect(page.locator('[data-testid="cloud-new-file-type-freemind"]')).toBeVisible();
    await expect(page.locator('[data-testid="cloud-new-file-type-opml"]')).toBeVisible();
    await expect(page.locator('[data-testid="cloud-new-file-type-taumap"]')).toBeVisible();

    await page.locator('[data-testid="cloud-new-file-type-opml"]').click();

    const prompt = page.locator('[data-testid="cloud-category-prompt"]');
    await expect(prompt).toBeVisible();
    await expect(page.locator('[data-testid="cloud-category-name-input"]')).toHaveValue('未命名大纲.opml');
    await expect(page.locator('[data-testid="cloud-new-file-type-hint"]')).toContainText('.opml');

    await page.locator('[data-testid="cloud-category-prompt-cancel"]').click();
    await expect(prompt).toBeHidden();
  });

  test('E2E-UX3-A6: 云端「自定义格式」输入扩展名后透传给新建服务（白名单内 .ts）', async ({ page }) => {
    await mockTauriCloudBackend(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="toolbar"]');

    await page.locator('[data-testid="sidebar-tab-cloud"]').click();
    const dirRow = page.locator('[data-testid="cloud-browser-dir"]').first();
    await expect(dirRow).toBeVisible();
    await dirRow.click({ button: 'right' });

    const newFileEntry = page.locator('[data-testid="cloud-category-menu-new-file"]');
    await expect(newFileEntry).toBeVisible();
    await newFileEntry.hover();
    await expect(page.locator('[data-testid="cloud-new-file-type-menu"]')).toBeVisible();

    const customEntry = page.locator('[data-testid="cloud-new-file-type-custom"]');
    await expect(customEntry).toBeVisible();
    await customEntry.click();

    const prompt = page.locator('[data-testid="cloud-category-prompt"]');
    await expect(prompt).toBeVisible();
    // 自定义格式多出扩展名输入框，默认 txt，提示文案随输入实时变化
    await expect(page.locator('[data-testid="cloud-new-file-custom-field"]')).toBeVisible();
    const extensionInput = page.locator('[data-testid="cloud-new-file-custom-extension"]');
    await expect(extensionInput).toHaveValue('txt');
    await expect(page.locator('[data-testid="cloud-new-file-type-hint"]')).toContainText('.txt');

    await extensionInput.fill('ts');
    await expect(page.locator('[data-testid="cloud-new-file-type-hint"]')).toContainText('.ts');
    // 文件名只填主干，扩展名由自定义分支补齐（createCloudDocFile 归一化 + 白名单校验）
    await page.locator('[data-testid="cloud-category-name-input"]').fill('未命名');
    await page.locator('[data-testid="cloud-category-prompt-confirm"]').click();

    await expect(prompt).toBeHidden();

    // 断言透传到云端保存命令的载荷：路径/标题已按自定义扩展名补齐，内容是该扩展名的空种子
    const payload = (await page.evaluate(() => {
      const invocations = (window as unknown as {
        __E2E_TAURI_INVOCATIONS__?: Array<{ command: string; args: { payload?: Record<string, unknown> } }>;
      }).__E2E_TAURI_INVOCATIONS__ ?? [];
      const saves = invocations.filter((item) => item.command === 'cloud_docs_save');
      const last = saves[saves.length - 1];
      return last?.args.payload ?? null;
    })) as { path?: string; title?: string; content?: string } | null;

    expect(payload).not.toBeNull();
    expect(String(payload!.path)).toContain('未命名.ts');
    expect(payload!.title).toBe('未命名.ts');
    expect(payload!.content).toBe('');
  });

  test('E2E-UX3-A4: 前端层验证：云端白名单含 mm/opml，新建内容可被对应适配器解析出根节点', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="toolbar"]');

    const result = (await page.evaluate(async () => {
      const policy = await import('/src/services/cloudUploadPolicy.ts');
      const create = await import('/src/services/cloudDocCreateService.ts');
      const freemind = await import('/src/services/mindmap/adapters/freemindAdapter.ts');
      const opml = await import('/src/services/mindmap/adapters/opmlAdapter.ts');

      const mmContent = create.initialCloudDocContent('e2e-cloud.mm');
      const opmlContent = create.initialCloudDocContent('e2e-cloud.opml');

      const mmRoot = freemind.parseFreemindOutline(mmContent);
      const opmlRoots = opml.parseOpmlOutline(opmlContent);

      return {
        extensions: policy.TEXT_DOC_EXTENSIONS as string[],
        mmAllowed: policy.isTextDocPath('tau/e2e/demo.mm'),
        opmlAllowed: policy.isTextDocPath('tau/e2e/demo.opml'),
        mmRejected: policy.isTextDocPath('tau/e2e/demo.exe'),
        mmContentHead: mmContent.slice(0, 40),
        mmHasMapTag: mmContent.includes('<map'),
        opmlHasOpmlTag: opmlContent.includes('<opml'),
        mmRootText: mmRoot ? mmRoot.text : null,
        opmlRootTexts: opmlRoots.map((node) => node.text),
      };
    })) as {
      extensions: string[];
      mmAllowed: boolean;
      opmlAllowed: boolean;
      mmRejected: boolean;
      mmContentHead: string;
      mmHasMapTag: boolean;
      opmlHasOpmlTag: boolean;
      mmRootText: string | null;
      opmlRootTexts: string[];
    };

    expect(result.extensions).toContain('mm');
    expect(result.extensions).toContain('opml');
    expect(result.mmAllowed).toBe(true);
    expect(result.opmlAllowed).toBe(true);
    expect(result.mmRejected).toBe(false);

    // 新建 .mm/.opml 的初始内容是合法导图/大纲（能被既有适配器解析出根节点）
    expect(result.mmHasMapTag).toBe(true);
    expect(result.mmRootText).toBe('e2e-cloud');
    expect(result.opmlHasOpmlTag).toBe(true);
    expect(result.opmlRootTexts.length).toBeGreaterThan(0);
    expect(result.opmlRootTexts[0]).toBe('e2e-cloud');
  });
});
