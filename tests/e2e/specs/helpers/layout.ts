import { type Locator } from '@playwright/test'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

const sameBox = (a: Box, b: Box) =>
  Math.abs(a.x - b.x) < 0.5 &&
  Math.abs(a.y - b.y) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 &&
  Math.abs(a.height - b.height) < 0.5

/**
 * 等待元素几何稳定：连续两次采样一致才返回。
 *
 * 分栏/预览切换带有 0.32s 的 flex-basis / transform 过渡（见 App.vue 的 .markdown-stage），
 * 过渡期间 boundingBox() 返回的是中间态，用它算出的期望坐标会和真实点击落点错位。
 */
export async function waitForStableBox(locator: Locator, timeout = 5000, interval = 50): Promise<Box | null> {
  const deadline = Date.now() + timeout
  let previous = await locator.boundingBox()

  while (Date.now() < deadline) {
    await locator.page().waitForTimeout(interval)
    const current = await locator.boundingBox()
    if (previous && current && sameBox(previous, current)) {
      return current
    }
    previous = current
  }

  return previous
}
