import type { UiLanguage } from '@/i18n/ui';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export type MonacoThemeId = 'vs' | 'vs-dark' | 'hc-black';
export const THEME_SKINS = ['deep-ocean', 'forest-moss', 'solar-sand', 'graphite-ink', 'rose-dawn'] as const;
export type ThemeSkinId = (typeof THEME_SKINS)[number];
export const DEFAULT_THEME_SKIN: ThemeSkinId = 'deep-ocean';

export interface MonacoThemeOption {
  value: MonacoThemeId;
  label: string;
  recommended: boolean;
}

export interface ThemeSkinOption {
  value: ThemeSkinId;
  label: string;
}

export interface ThemeResolution {
  skin: ThemeSkinId;
  resolvedTheme: ResolvedTheme;
  previewTheme: ResolvedTheme;
  recommendedMonacoTheme: MonacoThemeId;
  activeMonacoTheme: MonacoThemeId;
  monacoThemeOptions: MonacoThemeOption[];
  skinOptions: ThemeSkinOption[];
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

const THEME_SKIN_LABELS: Record<UiLanguage, Record<ThemeSkinId, string>> = {
  'zh-CN': {
    'deep-ocean': '深海蓝调',
    'forest-moss': '森林苔原',
    'solar-sand': '暖日砂岩',
    'graphite-ink': '石墨墨影',
    'rose-dawn': '玫瑰晨曦',
  },
  'en-US': {
    'deep-ocean': 'Deep Ocean',
    'forest-moss': 'Forest Moss',
    'solar-sand': 'Solar Sand',
    'graphite-ink': 'Graphite Ink',
    'rose-dawn': 'Rose Dawn',
  },
};

function normalizeThemeSkin(themeSkin?: string): ThemeSkinId {
  if (themeSkin && THEME_SKINS.includes(themeSkin as ThemeSkinId)) {
    return themeSkin as ThemeSkinId;
  }

  return DEFAULT_THEME_SKIN;
}

export function resolveThemeState(input: {
  theme: ThemeMode;
  monacoTheme: MonacoThemeId;
  prefersDark: boolean;
  themeSkin?: ThemeSkinId | string;
  uiLanguage?: UiLanguage;
}): ThemeResolution {
  const resolvedTheme: ResolvedTheme =
    input.theme === 'system'
      ? (input.prefersDark ? 'dark' : 'light')
      : input.theme;
  const skin = normalizeThemeSkin(input.themeSkin);

  const recommendedMonacoTheme: MonacoThemeId =
    resolvedTheme === 'light' ? 'vs' : 'vs-dark';

  const uiLanguage: UiLanguage = input.uiLanguage ?? 'zh-CN';

  const monacoThemeOptions = (['vs', 'vs-dark', 'hc-black'] as const).map((value) => ({
    value,
    label: MONACO_THEME_LABELS[uiLanguage][value],
    recommended: value === recommendedMonacoTheme,
  }));
  const skinOptions = THEME_SKINS.map((value) => ({
    value,
    label: THEME_SKIN_LABELS[uiLanguage][value],
  }));

  return {
    skin,
    resolvedTheme,
    previewTheme: resolvedTheme,
    recommendedMonacoTheme,
    activeMonacoTheme: input.monacoTheme,
    monacoThemeOptions,
    skinOptions,
  };
}
