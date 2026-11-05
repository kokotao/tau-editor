import { expect, type Page } from '@playwright/test'

/**
 * StatusBarSelect 已把原生 <select> 重构为「trigger 按钮 + 菜单按钮」：
 * - 触发器：`button[data-testid="<testId>"][aria-haspopup="listbox"]`
 * - 菜单：`[data-testid="<testId>-menu"]`（v-if 渲染，Teleport 到 body）
 * - 选项：`button[data-testid="<testId>-option-<value>"]`
 *
 * 因此 `selectOption()` 不再可用，必须点击触发器展开菜单后再点击选项。
 * 这里统一封装并校验：菜单确实展开、选项确实渲染、选择后菜单关闭且值已生效。
 */
export async function selectStatusBarOption(page: Page, testId: string, value: string) {
  const trigger = page.locator(`[data-testid="${testId}"]`)
  const menu = page.locator(`[data-testid="${testId}-menu"]`)
  const option = page.locator(`[data-testid="${testId}-option-${value}"]`)

  await expect(trigger).toBeVisible()

  // 已展开时（例如上一次点击残留）先收起，避免“再点一下反而关掉”的竞态。
  if ((await trigger.getAttribute('aria-expanded')) === 'true') {
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  }

  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(menu).toBeVisible()
  await expect(option).toBeVisible()

  await option.click()

  await expect(menu).toBeHidden()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  // 断言切换真的生效（trigger 上的 data-value 绑定当前选中值）
  await expect(trigger).toHaveAttribute('data-value', value)
}

/** 主题切换（vs / vs-dark / hc-black） */
export async function selectTheme(page: Page, value: 'vs' | 'vs-dark' | 'hc-black') {
  await selectStatusBarOption(page, 'theme-select', value)
}

/** 语言模式切换（plaintext / markdown / ...） */
export async function selectLanguageMode(page: Page, value: string) {
  await selectStatusBarOption(page, 'language-mode-display', value)
}
