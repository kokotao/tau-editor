import { expect, test } from '../fixtures/app'

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
    await expect(page.locator('[data-testid="tab"]')).toHaveCount(1)
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
    // 适配后为 100%，放大一次应为 120%
    await page.locator('[data-testid="mm-fit"]').click()
    await expect(stats).toContainText('100%')
    await page.locator('[data-testid="mm-zoom-in"]').click()
    await expect(stats).toContainText('120%')

    await page.locator('[data-testid="mm-fit"]').click()
    await expect(page.locator('[data-testid="mindmap-canvas"]')).toBeVisible()
  })

  test('E2E-MM-008: 导出对话框列出格式并展示 PNG 选项', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]')
    await openNewMindmap(page)

    await page.locator('[data-testid="mm-export"]').click()
    const dialog = page.locator('[data-testid="mm-export-dialog"]')
    await expect(dialog).toBeVisible()
    await expect(page.locator('input[name="mm-export-format"]')).toHaveCount(6)

    await page.locator('[data-testid="mm-export-format-png"]').check()
    await expect(page.locator('[data-testid="mm-export-png-options"]')).toBeVisible()
    await expect(page.locator('[data-testid="mm-export-bg-transparent"]')).toBeChecked()

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
    await expect(page.locator('[data-testid="mm-props"]')).toBeVisible()

    await page.locator('[data-testid="mm-props-notes"]').fill('E2E 备注')
    await page.locator('[data-testid="mm-props-apply"]').click()
    await expect(page.locator('[data-testid="mindmap-notice"]')).toContainText('节点属性已更新')
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
})
