import { test, expect } from '@playwright/test'

test.describe('Auto Save', () => {
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

  test('E2E-AS-001: 保存状态指示器', async ({ page }) => {
    // 验证保存状态指示器存在
    const saveStatus = page.locator('[data-testid="save-status"]')
    await expect(saveStatus).toBeVisible()
  })

  test('E2E-AS-002: 新建文件状态', async ({ page }) => {
    // 创建新文件
    await page.click('[data-testid="btn-new-file"]')
    
    // 验证初始状态
    const saveStatus = page.locator('[data-testid="save-status"]')
    await expect(saveStatus).toBeVisible()
  })

  test('E2E-AS-003: 修改后状态变化', async ({ page }) => {
    // 创建新文件
    await page.click('[data-testid="btn-new-file"]')
    
    // 输入内容
    const editor = page.locator('[data-testid="editor-container"]')
    await editor.click()
    await page.keyboard.type('Test content')
    
    // 等待状态更新
    await page.waitForTimeout(500)
    
    // 验证脏状态指示器
    const dirtyIndicator = page.locator('[data-testid="dirty-indicator"]')
    await expect(dirtyIndicator).toBeVisible()
  })

  test('E2E-AS-004: 自动保存设置', async ({ page }) => {
    // 点击设置按钮
    await page.click('[data-testid="btn-settings"]')
    
    // 验证设置功能可用（简单检查）
    await expect(page.locator('[data-testid="btn-settings"]')).toBeVisible()
  })

  test('E2E-AS-005: 保存按钮状态', async ({ page }) => {
    // 验证保存按钮存在
    const saveButton = page.locator('[data-testid="btn-save"]')
    await expect(saveButton).toBeVisible()
    
    // 创建新文件并输入内容
    await page.click('[data-testid="btn-new-file"]')
    const editor = page.locator('[data-testid="editor-container"]')
    await editor.click()
    await page.keyboard.type('Test')
    
    // 等待状态更新
    await page.waitForTimeout(500)
    
    // 验证保存按钮变为可用
    await expect(saveButton).not.toHaveClass(/disabled/)
  })

  test('E2E-AS-006: 状态栏自动保存指示', async ({ page }) => {
    // 验证自动保存标签存在
    const autoSaveLabel = page.locator('[data-testid="auto-save-label"]')
    await expect(autoSaveLabel).toBeVisible()
  })

  test.afterEach(async ({ page }) => {
    // 测试后完全刷新页面，清理所有 DOM 元素
    await page.reload()
  })
})
