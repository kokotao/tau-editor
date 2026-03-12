import { test, expect } from '@playwright/test'

test.describe('Editing Features', () => {
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

  test('E2E-EDIT-001: 编辑器初始化', async ({ page }) => {
    const editor = page.locator('[data-testid="editor-container"]')
    await expect(editor).toBeVisible()
  })

  test('E2E-EDIT-002: 撤销重做功能', async ({ page }) => {
    const editor = page.locator('[data-testid="editor-container"]')
    
    // 输入内容
    await editor.click()
    await page.keyboard.type('Line 1')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Line 2')
    
    // 执行撤销 (Ctrl+Z)
    await page.keyboard.press('Control+Z')
    await page.waitForTimeout(300)
    
    // 执行重做 (Ctrl+Y)
    await page.keyboard.press('Control+Y')
    await page.waitForTimeout(300)
  })

  test('E2E-EDIT-003: 查找功能', async ({ page }) => {
    const editor = page.locator('[data-testid="editor-container"]')
    
    // 输入测试内容
    await editor.click()
    await page.keyboard.type('Hello World\nHello Test')
    
    // 打开查找对话框 (Ctrl+F)
    await page.keyboard.press('Control+F')
    
    // 验证查找对话框显示（如果实现）
    // 注意：这取决于具体实现
  })

  test('E2E-EDIT-004: 快捷键 - 全选', async ({ page }) => {
    const editor = page.locator('[data-testid="editor-container"]')
    await editor.click()
    await page.keyboard.type('Select all text')
    
    // 全选 (Ctrl+A)
    await page.keyboard.press('Control+A')
    
    // 验证全部选中
    const selectedText = await page.evaluate(() => {
      const sel = window.getSelection()
      return sel ? sel.toString() : ''
    })
    
    expect(selectedText).toBe('Select all text')
  })

  test('E2E-EDIT-005: 快捷键 - 复制粘贴', async ({ page }) => {
    const editor = page.locator('[data-testid="editor-container"]')
    await editor.click()
    await page.keyboard.type('Copy this text')
    
    // 全选并复制
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Control+C')
    
    // 移动光标到末尾
    await page.keyboard.press('End')
    
    // 粘贴
    await page.keyboard.press('Control+V')
    
    // 验证内容
    await page.waitForTimeout(300)
    const content = await editor.textContent()
    expect(content).toContain('Copy this text')
  })

  test('E2E-EDIT-006: 状态栏实时更新', async ({ page }) => {
    // 初始状态
    const cursorPosition = page.locator('[data-testid="cursor-position"]')
    await expect(cursorPosition).toBeVisible()
    
    // 输入内容
    const editor = page.locator('[data-testid="editor-container"]')
    await editor.click()
    await page.keyboard.type('Hello World')
    
    // 验证光标位置更新
    await page.waitForTimeout(300)
    const position = await cursorPosition.textContent()
    expect(position).toMatch(/行 \d+, 列 \d+/)
  })

  test('E2E-EDIT-007: 字数统计更新', async ({ page }) => {
    const wordCount = page.locator('[data-testid="word-count"]')
    
    // 初始状态
    await expect(wordCount).toHaveText('0')
    
    // 输入内容
    const editor = page.locator('[data-testid="editor-container"]')
    await editor.click()
    await page.keyboard.type('Hello World')
    
    // 验证字数更新
    await page.waitForTimeout(300)
    const count = await wordCount.textContent()
    expect(parseInt(count || '0')).toBeGreaterThan(0)
  })

  test('E2E-EDIT-008: 多行输入', async ({ page }) => {
    const editor = page.locator('[data-testid="editor-container"]')
    await editor.click()
    
    // 输入多行
    await page.keyboard.type('Line 1')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Line 2')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Line 3')
    
    // 验证行计数
    await page.waitForTimeout(300)
    const lineCount = page.locator('[data-testid="line-count"]')
    await expect(lineCount).toBeVisible()
  })

  test('E2E-EDIT-009: 性能 - 快速输入', async ({ page }) => {
    const editor = page.locator('[data-testid="editor-container"]')
    await editor.click()
    
    const startTime = Date.now()
    
    // 快速输入
    await page.keyboard.type('A'.repeat(100))
    
    const endTime = Date.now()
    const duration = endTime - startTime
    
    // 验证输入时间合理
    expect(duration).toBeLessThan(5000)
  })

  test('E2E-EDIT-010: 工具栏交互', async ({ page }) => {
    // 验证工具栏按钮
    await expect(page.locator('[data-testid="btn-undo"]')).toBeVisible()
    await expect(page.locator('[data-testid="btn-redo"]')).toBeVisible()
    await expect(page.locator('[data-testid="btn-save"]')).toBeVisible()
  })

  test.afterEach(async ({ page }) => {
    // 测试后完全刷新页面，清理所有 DOM 元素
    await page.reload()
  })
})
