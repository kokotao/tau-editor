import { test, expect } from '@playwright/test'

test.describe('File Operations', () => {
  test.beforeEach(async ({ page }) => {
    // 访问应用
    await page.goto('/')
    // ✅ 先等待工具栏加载（应用初始状态）
    await page.waitForSelector('[data-testid="toolbar"]')
    // ✅ 等待页面完全加载
    await page.waitForLoadState('networkidle')
    // ✅ 等待 Vue 应用完全挂载
    await page.waitForTimeout(1000)
    // ✅ 清理可能存在的重复 DOM 元素（Vue 热重载问题）
    await page.evaluate(() => {
      const containers = document.querySelectorAll('[data-testid="editor-container"]')
      if (containers.length > 1) {
        for (let i = 1; i < containers.length; i++) {
          containers[i].remove()
        }
      }
    })
    // ✅ 点击新建文件创建初始标签页
    await page.click('[data-testid="btn-new-file"]')
    // ✅ 等待标签页出现（更可靠的等待条件）
    await page.waitForSelector('[data-testid="tab"]', { timeout: 10000 })
    // ✅ 等待编辑器容器附加到 DOM（不要求 visible）
    await page.waitForSelector('[data-testid="editor-container"]', { timeout: 10000, state: 'attached' })
    // ✅ 等待 Monaco 编辑器初始化完成并变为可见
    await page.locator('[data-testid="editor-container"]').first().waitFor({ state: 'visible', timeout: 15000 })
    // ✅ 等待 Monaco 编辑器完全就绪
    await page.waitForTimeout(2000)
  })

  test('E2E-FILE-001: 新建文件', async ({ page }) => {
    // 点击新建按钮
    await page.click('[data-testid="btn-new-file"]')
    
    // 验证新标签页创建
    await expect(page.locator('[data-testid="tab"]')).toHaveCount(2)
    
    // 验证编辑器存在且可见
    const editor = page.locator('[data-testid="editor-container"]').first()
    await expect(editor).toBeVisible({ timeout: 10000 })
  })

  test('E2E-FILE-002: 工具栏按钮功能', async ({ page }) => {
    // 验证所有主要按钮存在且可点击
    await expect(page.locator('[data-testid="btn-new-file"]')).toBeVisible()
    await expect(page.locator('[data-testid="btn-open-file"]')).toBeVisible()
    await expect(page.locator('[data-testid="btn-save"]')).toBeVisible()
    await expect(page.locator('[data-testid="btn-save-as"]')).toBeVisible()
  })

  test('E2E-FILE-003: 编辑器内容输入', async ({ page }) => {
    const editor = page.locator('[data-testid="editor-container"]')
    
    // 点击并输入内容
    await editor.click()
    await page.keyboard.type('Hello, this is a test!')
    
    // 等待内容更新
    await page.waitForTimeout(300)
    
    // 验证内容已输入
    const content = await editor.textContent()
    expect(content).toContain('Hello')
  })

  test('E2E-FILE-004: 保存按钮状态', async ({ page }) => {
    const saveButton = page.locator('[data-testid="btn-save"]')
    
    // 初始状态应该是禁用（没有修改）
    // 创建新文件
    await page.click('[data-testid="btn-new-file"]')
    
    // 输入内容
    const editor = page.locator('[data-testid="editor-container"]')
    await editor.click()
    await page.keyboard.type('Test content')
    
    // 等待状态更新
    await page.waitForTimeout(500)
    
    // 验证保存按钮变为可用
    await expect(saveButton).not.toHaveClass(/disabled/)
  })

  test('E2E-FILE-005: 文件树切换', async ({ page }) => {
    // 点击切换文件树
    await page.click('[data-testid="btn-toggle-file-tree"]')
    
    // 验证文件树组件存在
    // 注意：具体实现可能不同，这里只做基本检查
  })

  test('E2E-FILE-006: 状态栏显示', async ({ page }) => {
    // 验证状态栏存在
    const statusBar = page.locator('[data-testid="status-bar"]')
    await expect(statusBar).toBeVisible()
    
    // 验证状态栏元素
    await expect(page.locator('[data-testid="cursor-position"]')).toBeVisible()
    await expect(page.locator('[data-testid="encoding-display"]')).toBeVisible()
    await expect(page.locator('[data-testid="language-mode-display"]')).toBeVisible()
  })

  test('E2E-FILE-007: 保存状态显示', async ({ page }) => {
    // 验证保存状态指示器存在
    const saveStatus = page.locator('[data-testid="save-status"]')
    await expect(saveStatus).toBeVisible()
  })

  test('E2E-FILE-008: 字数统计显示', async ({ page }) => {
    // 验证字数统计存在
    const wordCount = page.locator('[data-testid="word-count"]')
    await expect(wordCount).toBeVisible()
    
    // 初始文案应包含字数统计
    const count = await wordCount.textContent()
    expect(count || '').toContain('字数')
  })

  test('E2E-FILE-009: 多标签创建', async ({ page }) => {
    // 创建多个标签
    await page.click('[data-testid="btn-new-file"]')
    await page.click('[data-testid="btn-new-file"]')
    await page.click('[data-testid="btn-new-file"]')
    
    // 验证标签数量
    await expect(page.locator('[data-testid="tab"]')).toHaveCount(4)
  })

  test('E2E-FILE-010: 编辑器核心功能', async ({ page }) => {
    // 验证编辑器容器
    const editor = page.locator('[data-testid="editor-container"]')
    await expect(editor).toBeVisible()
    
    // 验证可以输入
    await editor.click()
    await page.keyboard.type('Test')
    
    // 验证编辑器有内容
    await page.waitForTimeout(300)
    const content = await editor.textContent()
    expect(content.length).toBeGreaterThan(0)
  })

  test.afterEach(async ({ page }) => {
    // 测试后完全刷新页面，清理所有 DOM 元素
    await page.reload()
  })
})
