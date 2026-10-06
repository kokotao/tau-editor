import { describe, expect, it } from 'vitest'
import { resolveThemeState } from '@/utils/themeResolver'

describe('themeResolver', () => {
  it('legacy system 值不再跟随系统明暗变化', () => {
    expect(
      resolveThemeState({
        theme: 'system',
        monacoTheme: 'vs-dark',
        prefersDark: false,
      }),
    ).toMatchObject({
      resolvedTheme: 'dark',
      previewTheme: 'dark',
      recommendedMonacoTheme: 'vs-dark',
      activeMonacoTheme: 'vs-dark',
      skin: 'deep-ocean',
    })
  })

  it('显式主题仍可决定推荐编辑器主题', () => {
    expect(resolveThemeState({ theme: 'light', monacoTheme: 'vs-dark', prefersDark: true }).resolvedTheme).toBe('light')
  })

  it('dark 主题时应推荐 vs-dark', () => {
    expect(
      resolveThemeState({
        theme: 'dark',
        monacoTheme: 'vs',
        prefersDark: false,
      }).recommendedMonacoTheme,
    ).toBe('vs-dark')
  })

  it('应返回带推荐标记的 Monaco 主题选项', () => {
    const result = resolveThemeState({
      theme: 'light',
      monacoTheme: 'hc-black',
      prefersDark: false,
    })

    expect(result.monacoThemeOptions).toEqual([
      { value: 'vs', label: '明亮', recommended: true },
      { value: 'vs-dark', label: '暗夜', recommended: false },
      { value: 'hc-black', label: '高对比', recommended: false },
    ])
  })
})
