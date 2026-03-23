import type { UiLanguage } from '@/i18n/ui';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export type MonacoThemeId = 'vs' | 'vs-dark' | 'hc-black';
export type ThemeSkinId = 'deep-ocean';

export interface MonacoThemeOption {
  value: MonacoThemeId;
  label: string;
  recommended: boolean;
}

export interface ThemeResolution {
  skin: ThemeSkinId;
  resolvedTheme: ResolvedTheme;
  previewTheme: ResolvedTheme;
  recommendedMonacoTheme: MonacoThemeId;
  activeMonacoTheme: MonacoThemeId;
  monacoThemeOptions: MonacoThemeOption[];
}

const MONACO_THEME_LABELS: Record<UiLanguage, Record<MonacoThemeId, string>> = {
  'zh-CN': {
    vs: '明亮',
    'vs-dark': '暗夜',
    'hc-black': '高对比',
  },
  'en-US': {
    vs: 'Light',
    'vs-dark': 'Dark',
    'hc-black': 'High Contrast',
  },
};

export function resolveThemeState(input: {
  theme: ThemeMode;
  monacoTheme: MonacoThemeId;
  prefersDark: boolean;
  uiLanguage?: UiLanguage;
}): ThemeResolution {
  const resolvedTheme: ResolvedTheme =
    input.theme === 'system'
      ? (input.prefersDark ? 'dark' : 'light')
      : input.theme;

  const recommendedMonacoTheme: MonacoThemeId =
    resolvedTheme === 'light' ? 'vs' : 'vs-dark';

  const uiLanguage: UiLanguage = input.uiLanguage ?? 'zh-CN';

  const monacoThemeOptions = (['vs', 'vs-dark', 'hc-black'] as const).map((value) => ({
    value,
    label: MONACO_THEME_LABELS[uiLanguage][value],
    recommended: value === recommendedMonacoTheme,
  }));

  return {
    skin: 'deep-ocean',
    resolvedTheme,
    previewTheme: resolvedTheme,
    recommendedMonacoTheme,
    activeMonacoTheme: input.monacoTheme,
    monacoThemeOptions,
  };
}
