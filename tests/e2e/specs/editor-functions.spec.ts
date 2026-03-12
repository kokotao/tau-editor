import { test, expect } from '@playwright/test'

test.describe('Editor Functions', () => {
  test.beforeEach(async ({ page }) => {
    // 访问应用
    await page.goto('/')
    // ✅ 先等待工具栏加载（应用初始状态）
    await page.waitForSelector('[data-testid="toolbar"]')
    // ✅ 点击新建文件创建初始标签页
    await page.click('[data-testid="btn-new-file"]')
    // ✅ 现在等待编辑器容器（此时 activeTab 已存在）
    await page.waitForSelector('[data-testid="editor-container"]', {
      timeout: 15000
    })
  })

  test('E2E-EDIT-001: 编辑器加载', async ({ page }) => {
    // 验证编辑器容器存在
    const editor = page.locator('[data-testid="editor-container"]')
    await expect(editor).toBeVisible()
  })

  test('E2E-EDIT-002: 光标位置显示', async ({ page }) => {
    // 验证光标位置显示存在
    const cursorPosition = page.locator('[data-testid="cursor-position"]')
    await expect(cursorPosition).toBeVisible()
    
    // 验证格式正确
    const text = await cursorPosition.textContent()
    expect(text).toMatch(/行 \d+, 列 \d+/)
  })

  test('E2E-EDIT-003: 撤销/重做', async ({ page }) => {
    const editor = page.locator('[data-testid="editor-container"]')
    
    // 输入内容
    await editor.click()
    await page.keyboard.type('Test content')
    
    // 执行撤销 (Ctrl+Z)
    await page.keyboard.press('Control+Z')
    
    // 等待撤销完成
    await page.waitForTimeout(300)
    
    // 验证内容被撤销
    const content = await editor.textContent()
    expect(content.length).toBeLessThan('Test content'.length)
  })

  test('E2E-EDIT-004: 语言模式显示', async ({ page }) => {
    // 验证语言模式显示存在
    const languageDisplay = page.locator('[data-testid="language-mode-display"]')
    await expect(languageDisplay).toBeVisible()
  })

  test('E2E-EDIT-005: 主题切换', async ({ page }) => {
    // 验证主题选择器存在
    const themeSelect = page.locator('[data-testid="theme-select"]')
    await expect(themeSelect).toBeVisible()
    
    // 验证可以选择不同主题
    await themeSelect.selectOption('vs')
    await page.waitForTimeout(500)
    
    await themeSelect.selectOption('vs-dark')
    await page.waitForTimeout(500)
  })

  test('E2E-EDIT-006: 字数统计', async ({ page }) => {
    // 验证字数统计显示存在
    const wordCount = page.locator('[data-testid="word-count"]')
    await expect(wordCount).toBeVisible()
    
    // 初始应为 0
    const initialCount = await wordCount.textContent()
    expect(initialCount).toBe('0')
    
    // 输入内容
    const editor = page.locator('[data-testid="editor-container"]')
    await editor.click()
    await page.keyboard.type('Hello World')
    
    // 等待更新
    await page.waitForTimeout(500)
    
    // 验证字数更新
    const count = await wordCount.textContent()
    expect(parseInt(count || '0')).toBeGreaterThan(0)
  })

  test('E2E-EDIT-007: 行号显示', async ({ page }) => {
    // 输入多行内容
    const editor = page.locator('[data-testid="editor-container"]')
    await editor.click()
    await page.keyboard.type('Line 1\nLine 2\nLine 3')
    
    // 验证行计数更新
    const lineCount = page.locator('[data-testid="line-count"]')
    await expect(lineCount).toBeVisible()
  })

  test('E2E-EDIT-008: 工具栏按钮存在', async ({ page }) => {
    // 验证所有主要工具栏按钮存在
    await expect(page.locator('[data-testid="btn-new-file"]')).toBeVisible()
    await expect(page.locator('[data-testid="btn-open-file"]')).toBeVisible()
    await expect(page.locator('[data-testid="btn-save"]')).toBeVisible()
    await expect(page.locator('[data-testid="btn-undo"]')).toBeVisible()
    await expect(page.locator('[data-testid="btn-redo"]')).toBeVisible()
    await expect(page.locator('[data-testid="btn-settings"]')).toBeVisible()
  })

  test('E2E-EDIT-009: 状态栏显示', async ({ page }) => {
    // 验证状态栏存在
    const statusBar = page.locator('[data-testid="status-bar"]')
    await expect(statusBar).toBeVisible()
    
    // 验证状态栏元素
    await expect(page.locator('[data-testid="cursor-position"]')).toBeVisible()
    await expect(page.locator('[data-testid="encoding-display"]')).toBeVisible()
  })

  test('E2E-EDIT-010: 编辑器输入', async ({ page }) => {
    const editor = page.locator('[data-testid="editor-container"]')
    
    // 点击编辑器并输入
    await editor.click()
    await page.keyboard.type('Test input')
    
    // 验证输入成功
    await page.waitForTimeout(300)
    const content = await editor.textContent()
    expect(content).toContain('Test')
  })

  test.afterEach(async ({ page }) => {
    // 测试后完全刷新页面，清理所有 DOM 元素
    await page.reload()
  })
})
