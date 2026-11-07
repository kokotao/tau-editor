import { expect, test } from '../fixtures/app'
import { waitForStableBox } from './helpers/layout'

/**
 * 思维导图 E2E（阶段 0–3 关键路径，浏览器模式）
 *
 * 覆盖：新建导图、画布渲染、键盘新增/撤销、改名、画布↔大纲同步、
 * 删除子树确认、折叠、缩放/适配、导出对话框、200 节点恢复与适配。
 *
 * 说明：导入/导出落盘依赖 Tauri 对话框，浏览器模式只验证 UI 打开与参数结构。
 */

async function openNewMindmap(page: import('@playwright/test').Page) {
  await page.keyboard.press('Control+Shift+P')
  await page.waitForSelector('.palette-search-input')
  await page.fill('.palette-search-input', '思维导图')
  await page.locator('.palette-item').filter({ hasText: '新建思维导图' }).first().click()
  await page.waitForSelector('[data-testid="mindmap-canvas"]')
}

async function focusStage(page: import('@playwright/test').Page) {
  await page.locator('[data-testid="mindmap-stage"]').focus()
}

function buildAcceptanceDocument() {
  const topics: Record<string, unknown> = {
    root: { id: 'root', parentId: null, childIds: [] as string[], text: '中心主题' },
  }
  const rootChildIds: string[] = []
  let created = 0
  const branches = 19
  for (let b = 0; b < branches; b += 1) {
    const branchId = `b${b}`
    const leaves = 9 + (b < 9 ? 1 : 0)
    const leafIds: string[] = []
    topics[branchId] = { id: branchId, parentId: 'root', childIds: leafIds, text: `分支 ${b + 1}` }
    for (let l = 0; l < leaves; l += 1) {
      const leafId = `${branchId}_l${l}`
      topics[leafId] = { id: leafId, parentId: branchId, childIds: [], text: `主题 ${b}/${l}` }
      leafIds.push(leafId)
      created += 1
    }
    rootChildIds.push(branchId)
    created += 1
  }
  ;(topics.root as { childIds: string[] }).childIds = rootChildIds
  void created
  return {
    format: 'tau-mindmap',
    schemaVersion: 1,
    id: 'doc_e2e_200',
    title: '200 节点验收导图',
    rootTopicId: 'root',
    layoutMode: 'mindmap',
    themeId: 'default',
    saveMode: 'native',
    topics,
  }
}

test.describe('Mindmap E2E', () => {
  test('E2E-MM-001: 新建思维导图后渲染画布与大纲', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)

    await expect(page.locator('[data-testid="mindmap-canvas"]')).toBeVisible()
    await expect(page.locator('[data-testid="mindmap-outline"]')).toBeVisible()
    await expect(page.locator('.mm-node')).toHaveCount(1)
    await expect(page.locator('.mindmap-row')).toHaveCount(1)
    const canvasBox = await page.locator('[data-testid="mindmap-canvas"]').boundingBox()
    const rootBox = await page.locator('.mm-node.is-root').boundingBox()
    expect(canvasBox).toBeTruthy()
    expect(rootBox).toBeTruthy()
    expect(rootBox!.x).toBeGreaterThanOrEqual(canvasBox!.x)
    expect(rootBox!.y).toBeGreaterThanOrEqual(canvasBox!.y)
    expect(rootBox!.x + rootBox!.width).toBeLessThanOrEqual(canvasBox!.x + canvasBox!.width)
    expect(rootBox!.y + rootBox!.height).toBeLessThanOrEqual(canvasBox!.y + canvasBox!.height)
    // 单导图标签时编辑器标签栏收起，给画布让出空间。
    await expect(page.locator('[data-testid="editor-tabs"]')).toHaveCount(0)
  })

  test('E2E-MM-002: 键盘 Tab 新增子主题、Ctrl+Z 撤销', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)
    await focusStage(page)

    await page.keyboard.press('Tab')
    await expect(page.locator('.mm-node')).toHaveCount(2)

    await page.keyboard.press('Tab')
    await expect(page.locator('.mm-node')).toHaveCount(3)

    await page.keyboard.press('Control+z')
    await expect(page.locator('.mm-node')).toHaveCount(2)

    await page.keyboard.press('Control+Shift+z')
    await expect(page.locator('.mm-node')).toHaveCount(3)
  })

  test('E2E-MM-003: F2 改名同步到画布与大纲', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)
    await focusStage(page)

    await page.keyboard.press('F2')
    const editor = page.locator('[data-testid="mm-inline-editor"]')
    await expect(editor).toBeVisible()
    await editor.fill('中心新名字')
    await editor.press('Enter')

    await expect(page.locator('.mm-node.is-root')).toContainText('中心新名字')
    await expect(page.locator('.mindmap-row').first()).toContainText('中心新名字')
  })

  test('E2E-MM-004: 画布点击与大纲选中双向同步', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)
    await focusStage(page)

    await page.keyboard.press('Tab')
    await expect(page.locator('.mm-node')).toHaveCount(2)
    // 新增节点后先适配内容，确保目标节点在可视区内（真实用户同样会这样做）
    await page.locator('[data-testid="mm-fit"]').click()

    // 画布选中第二个节点（子主题），大纲对应行高亮
    const target = page.locator('.mm-node').nth(1)
    const topicId = await target.getAttribute('data-node-id')
    await target.click()
    await expect(page.locator('.mm-node.is-selected')).toHaveAttribute('data-node-id', topicId!)
    await expect(page.locator('.mindmap-row.is-selected')).toHaveAttribute('data-topic-id', topicId!)

    // 大纲点击回选中心主题
    const rootRow = page.locator('.mindmap-row').first()
    const rootId = await rootRow.getAttribute('data-topic-id')
    await rootRow.click()
    await expect(page.locator('.mm-node.is-selected')).toHaveAttribute('data-node-id', rootId!)
  })

  test('E2E-MM-CLICK-PAN: 鼠标点击节点并拖拽空白区域均可操作', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)

    const toolbar = page.locator('[data-testid="mindmap-toolbar"]')
    await toolbar.locator('[data-testid="mm-add-child"]').click()
    await expect(page.locator('.mm-node')).toHaveCount(2)
    await page.locator('[data-testid="mm-fit"]').click()

    const child = page.locator('.mm-node:not(.is-root)').first()
    const childId = await child.getAttribute('data-node-id')
    await child.click()
    await expect(page.locator('.mm-node.is-selected')).toHaveAttribute('data-node-id', childId!)

    const canvas = page.locator('[data-testid="mindmap-canvas"]')
    const canvasBox = await canvas.boundingBox()
    expect(canvasBox).toBeTruthy()
    // The left floating sidebar handle overlaps the canvas edge; start far
    // enough inside the canvas to guarantee the pointerdown reaches the SVG.
    const start = { x: canvasBox!.x + 80, y: canvasBox!.y + canvasBox!.height / 2 }
    const viewportGroup = canvas.locator('svg > g').first()
    const before = await viewportGroup.getAttribute('transform')

    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 70, start.y + 45, { steps: 6 })
    await page.mouse.up()

    await expect.poll(() => viewportGroup.getAttribute('transform')).not.toBe(before)
    expect(pageErrors).toEqual([])
  })

  test('E2E-MM-005: 删除含子树的节点先确认再执行', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)
    await focusStage(page)

    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(page.locator('.mm-node')).toHaveCount(3)
    await page.locator('[data-testid="mm-fit"]').click()

    // 选中中间节点（有 1 个子节点）
    await page.locator('.mm-node').nth(1).click()
    await page.keyboard.press('Delete')
    await expect(page.locator('[data-testid="mindmap-confirm"]')).toBeVisible()

    await page.locator('[data-testid="mm-confirm-ok"]').click()
    await expect(page.locator('.mm-node')).toHaveCount(1)
  })

  test('E2E-MM-006: 折叠与展开子分支', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)
    await focusStage(page)

    await page.keyboard.press('Tab')
    await expect(page.locator('.mm-node')).toHaveCount(2)

    await page.locator('.mm-node.is-root .mm-toggle').click()
    await expect(page.locator('.mm-node')).toHaveCount(1)

    await page.locator('.mm-node.is-root .mm-toggle').click()
    await expect(page.locator('.mm-node')).toHaveCount(2)
  })

  test('E2E-MM-007: 缩放与适配内容改变视口比例', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)

    const stats = page.locator('.mm-stats')
    // 小图适配有 115% 上限，避免把后续新增节点推到当前视口外。
    await page.locator('[data-testid="mm-fit"]').click()
    await expect(stats).toContainText('115%')
    await page.locator('[data-testid="mm-zoom-in"]').click()
    await expect(stats).toContainText('138%')

    await page.locator('[data-testid="mm-fit"]').click()
    await expect(page.locator('[data-testid="mindmap-canvas"]')).toBeVisible()
  })

  test('E2E-MM-008: 导出对话框列出全部格式并锁定付费视觉导出', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)

    await page.locator('[data-testid="mm-export"]').click()
    const dialog = page.locator('[data-testid="mm-export-dialog"]')
    await expect(dialog).toBeVisible()
    await expect(page.locator('input[name="mm-export-format"]')).toHaveCount(8)
    await expect(page.locator('[data-testid="mm-export-format-png"]')).toBeDisabled()
    await expect(page.locator('[data-testid="mm-export-format-pdf"]')).toBeEnabled()
    await page.locator('[data-testid="mm-export-format-png"]').locator('..').click({ force: true })
    await expect(page.locator('[data-testid="mindmap-membership-prompt"]')).toContainText('PNG 导出')
    await page.locator('[data-testid="mindmap-membership-cancel"]').click()

    await page.locator('[data-testid="mm-export-cancel"]').click()
    await expect(dialog).toBeHidden()
  })

  test('E2E-MM-009: 200 节点导图恢复、渲染与适配', async ({ page }) => {
    const document = buildAcceptanceDocument()
    const nodeCount = Object.keys(document.topics).length
    expect(nodeCount).toBe(200)

    await page.addInitScript((content) => {
      try {
        localStorage.removeItem('text-editor-recovery-drafts-v1')
        localStorage.removeItem('text-editor-session-v1')
        localStorage.setItem('text-editor-recovery-v2', JSON.stringify({
          version: 2,
          session: null,
          drafts: [{
            version: 2,
            id: 'tab-e2e-200',
            path: null,
            baseFingerprint: { mtimeMs: null, size: null },
            content,
            updatedAt: Date.now(),
            cursor: null,
            scrollTop: null,
            tab: {
              id: 'tab-e2e-200',
              filePath: null,
              fileName: 'acceptance-200.taumap',
              language: 'json',
              documentKind: 'mindmap',
              isUntitled: true,
              createdAt: Date.now(),
            },
          }],
        }))
      } catch {
        // 非 http(s) 文档没有 localStorage，忽略
      }
    }, JSON.stringify(document))

    page.on('dialog', (dialog) => { void dialog.accept() })
    await page.goto('/')
    await page.waitForSelector('[data-testid="mindmap-canvas"]', { timeout: 20000 })

    await expect(page.locator('.mm-node')).toHaveCount(200)
    await expect(page.locator('.mindmap-row')).toHaveCount(200)

    // 适配内容后可交互，且统计显示 200 个可见节点
    await page.locator('[data-testid="mm-fit"]').click()
    await expect(page.locator('.mm-stats')).toContainText('200')
  })

  test('E2E-MM-010: 切换组织图布局后连线变为竖直方向', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)
    await focusStage(page)

    await page.keyboard.press('Tab')
    await expect(page.locator('.mm-node')).toHaveCount(2)
    await expect(page.locator('.mm-edge[data-orientation="horizontal"]')).toHaveCount(1)

    await page.locator('[data-testid="mm-layout-org"]').click()
    await expect(page.locator('[data-testid="mm-layout-org"]')).toHaveClass(/is-active/)
    await expect(page.locator('.mm-edge[data-orientation="vertical"]')).toHaveCount(1)

    await page.locator('[data-testid="mm-layout-mindmap"]').click()
    await expect(page.locator('.mm-edge[data-orientation="horizontal"]')).toHaveCount(1)
  })

  test('E2E-MM-011: 属性面板编辑备注并提示已更新', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)
    await focusStage(page)

    await expect(page.locator('[data-testid="mm-props"]')).toBeHidden()
    await page.locator('[data-testid="mm-properties-toggle"]').click()
    await page.locator('[data-testid="mm-detail-tab-properties"]').click()
    await expect(page.locator('[data-testid="mm-props"]')).toBeVisible()

    await page.locator('[data-testid="mm-props-notes"]').fill('E2E 备注')
    await page.locator('[data-testid="mm-props-apply"]').click()
    // UX-3B 返工后属性面板独占右侧属性列，成功提示渲染在该列内
    await expect(
      page.locator('[data-testid="mm-right-properties"] [data-testid="mm-right-notice"]'),
    ).toContainText('节点属性已更新')
  })

  test('E2E-MM-012: 大纲搜索过滤到命中与祖先', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)
    await focusStage(page)

    await page.keyboard.press('Tab')
    await expect(page.locator('.mindmap-row')).toHaveCount(2)

    await page.locator('[data-testid="mm-outline-search"]').fill('新主题')
    await expect(page.locator('.mindmap-row')).toHaveCount(2)
    await expect(page.locator('.mindmap-row.is-match')).toHaveCount(1)

    await page.locator('[data-testid="mm-outline-search"]').fill('不存在的节点')
    await expect(page.locator('.mindmap-row')).toHaveCount(0)

    await page.locator('[data-testid="mm-outline-search"]').fill('')
    await expect(page.locator('.mindmap-row')).toHaveCount(2)
  })

  test('E2E-MM-013: 切换主题后画布应用主题标识', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)

    const canvas = page.locator('[data-testid="mindmap-canvas"]')
    await page.locator('[data-testid="mm-theme-select"]').selectOption('ocean')
    await expect(canvas).toHaveAttribute('data-theme-id', 'ocean')

    await page.locator('[data-testid="mm-theme-select"]').selectOption('default')
    await expect(canvas).toHaveAttribute('data-theme-id', 'default')
  })

  test('E2E-MM-014: 属性面板添加标记后画布出现徽章', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)
    await focusStage(page)

    await page.locator('[data-testid="mm-properties-toggle"]').click()
    await expect(page.locator('[data-testid="mm-props"]')).toBeVisible()
    await page.locator('[data-testid="mm-props-marker-star"]').click()

    await expect(page.locator('.mm-marker')).toHaveCount(1)
    // 标记按钮进入激活态（面板受控反映文档）
    await expect(page.locator('[data-testid="mm-props-marker-star"]')).toHaveAttribute('aria-pressed', 'true')
  })

  test('E2E-MM-015: 属性面板添加独立关系线后画布渲染', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)
    await focusStage(page)

    // 先建一个子节点作为关系目标，并选中中心主题
    await page.keyboard.press('Tab')
    await expect(page.locator('.mm-node')).toHaveCount(2)
    await page.locator('.mm-node.is-root').click()
    await page.locator('[data-testid="mm-properties-toggle"]').click()
    await page.locator('[data-testid="mm-detail-tab-properties"]').click()

    await page.locator('[data-testid="mm-props-relation-target"]').selectOption({ index: 1 })
    await page.locator('[data-testid="mm-props-relation-add"]').click()

    await expect(page.locator('[data-testid="mm-relation"]')).toHaveCount(1)
  })

  test('E2E-MM-016: 多工作表新增与切换', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)
    await focusStage(page)

    await page.keyboard.press('Tab')
    await expect(page.locator('.mm-node')).toHaveCount(2)

    // Web 构建无法注入 Tauri 会员态；先锁住免费用户的付费门槛。
    await page.locator('[data-testid="mm-sheet-add"]').click()
    await expect(page.locator('[data-testid="mindmap-membership-prompt"]')).toBeVisible()
    await expect(page.locator('[data-testid="mindmap-membership-prompt"]')).toContainText('多工作表')
    await page.locator('[data-testid="mindmap-membership-cancel"]').click()
    await expect(page.locator('[data-testid="mm-sheet-tab-0"]')).toBeVisible()
  })

  test('E2E-MM-017: 打印入口存在', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)
    await expect(page.locator('[data-testid="mm-print"]')).toBeVisible()
  })

  test('E2E-MM-018: 空白处拖动可平移画布', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)
    await focusStage(page)

    const root = page.locator('.mm-node.is-root')
    const before = await root.boundingBox()
    expect(before).toBeTruthy()

    const canvas = page.locator('[data-testid="mindmap-canvas"]')
    const box = await canvas.boundingBox()
    expect(box).toBeTruthy()
    // HUD 固定在右下角：从画布内左上空白区拖动，避免点击统计文字。
    const startX = box!.x + 120
    const startY = box!.y + 120

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 120, startY - 80, { steps: 8 })
    await page.mouse.up()

    const after = await root.boundingBox()
    expect(after).toBeTruthy()
    expect(Math.abs((after!.x - before!.x) - 120)).toBeLessThan(30)
    expect(Math.abs((after!.y - before!.y) + 80)).toBeLessThan(30)
  })

  test('E2E-MM-019: 节点右键菜单可新增子主题', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)

    await page.locator('.mm-node.is-root').click({ button: 'right' })
    const menu = page.locator('[data-testid="mm-context-menu"]')
    await expect(menu).toBeVisible()
    await expect(page.locator('[data-testid="mm-context-item-add-child"]')).toBeVisible()

    await page.locator('[data-testid="mm-context-item-add-child"]').click()
    await expect(page.locator('.mm-node')).toHaveCount(2)
    await expect(menu).toBeHidden()
  })

  test('E2E-MM-020: 工具栏按钮文字与背景有足够对比度', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)

    const contrast = await page.evaluate(() => {
      const button = document.querySelector('[data-testid="mm-add-child"]') as HTMLElement | null;
      if (!button) return null;
      const style = getComputedStyle(button);
      const parse = (value: string): number[] => {
        const match = value.match(/rgba?\(([^)]+)\)/);
        if (!match) return [0, 0, 0];
        return match[1].split(',').slice(0, 3).map((part) => Number(part.trim()));
      };
      const fg = parse(style.color);
      const bg = parse(style.backgroundColor);
      return {
        fg,
        bg,
        distance: Math.abs(fg[0] - bg[0]) + Math.abs(fg[1] - bg[1]) + Math.abs(fg[2] - bg[2]),
      };
    });

    expect(contrast).toBeTruthy()
    // 文字与按钮背景不能是同一颜色（修复前暗色主题下白底浅字 distance≈0）
    expect(contrast!.distance).toBeGreaterThan(80)
  })

  test('E2E-MM-021: 大纲面板可拖拽调宽', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)

    const outline = page.locator('[data-testid="mindmap-outline"]')
    // 右侧面板出现/布局变化带过渡动画：等几何稳定再取坐标，否则拖拽会落在动画中间态之外
    const before = await waitForStableBox(outline)
    expect(before).toBeTruthy()

    // UX-3B 返工：大纲/属性为两列独立面板，大纲列的 resizer 仍叫 mm-outline-resizer
    const resizer = page.locator('[data-testid="mm-outline-resizer"]')
    const rbox = await waitForStableBox(resizer)
    expect(rbox).toBeTruthy()

    await page.mouse.move(rbox!.x + rbox!.width / 2, rbox!.y + rbox!.height / 2)
    await page.mouse.down()
    await page.mouse.move(rbox!.x - 80, rbox!.y + rbox!.height / 2, { steps: 6 })
    await page.mouse.up()

    await expect
      .poll(async () => (await outline.boundingBox())?.width ?? 0)
      .toBeGreaterThan(before!.width + 30)
  })

  test('E2E-MM-022: 选中文本显示格式工具栏与 Tau 右键菜单', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)
    await focusStage(page)
    await page.keyboard.press('F2')
    const editor = page.locator('[data-testid="mm-inline-editor"]')
    await expect(editor).toBeVisible()
    await editor.fill('选中测试文本')
    await editor.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(0, 5))
    await editor.dispatchEvent('select')
    await expect(page.getByRole('toolbar', { name: '文字颜色与高亮' })).toBeVisible()
    await editor.click({ button: 'right' })
    await expect(page.getByRole('menu', { name: '文本编辑菜单' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /剪切/ })).toBeVisible()
    await page.getByRole('menuitem', { name: /复制/ }).click()
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('选中测试文')
    await editor.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(0, 5))
    await editor.dispatchEvent('select')
    await editor.click({ button: 'right' })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu', { name: '文本编辑菜单' })).toBeHidden()
  })

  test('E2E-MM-023: 样式面板吸顶并固定标题与标签', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)
    await page.locator('[data-testid="toolbar"]').getByTitle('切换画布样式').click()
    const panel = page.locator('[data-testid="mm-canvas-style-panel"]')
    await expect(panel).toBeVisible()
    const layout = await panel.evaluate((element) => {
      const panelRect = element.getBoundingClientRect()
      const header = element.querySelector('.mm-style-sticky-header')!.getBoundingClientRect()
      return { panelTop: panelRect.top, headerTop: header.top, position: getComputedStyle(element).position }
    })
    // 样式已嵌入固定右侧列，外壳把外层改为 relative；标题本身仍需 sticky。
    expect(layout.position).toBe('relative')
    expect(await panel.locator('.mm-style-sticky-header').evaluate((element) => getComputedStyle(element).position)).toBe('sticky')
    expect(Math.abs(layout.panelTop - layout.headerTop)).toBeLessThanOrEqual(1)
  })
})
