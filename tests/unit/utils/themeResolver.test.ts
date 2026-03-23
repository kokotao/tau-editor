import { describe, expect, it } from 'vitest'
import { resolveThemeState } from '@/utils/themeResolver'

describe('themeResolver', () => {
  it('system + 浅色系统时应返回 light UI 与 light preview', () => {
    expect(
      resolveThemeState({
        theme: 'system',
        monacoTheme: 'vs-dark',
        prefersDark: false,
      }),
    ).toMatchObject({
      resolvedTheme: 'light',
      previewTheme: 'light',
      recommendedMonacoTheme: 'vs',
      activeMonacoTheme: 'vs-dark',
      skin: 'deep-ocean',
    })
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
