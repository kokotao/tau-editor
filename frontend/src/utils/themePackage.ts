/**
 * 主题包模型与校验
 *
 * 主题包是可导入/导出的 JSON 结构，同时驱动 Web UI 的 CSS 变量与 Monaco 编辑器配色。
 * 这里只做纯函数处理，不依赖 Pinia，便于单测与 Provider 复用。
 */

export const THEME_COLOR_KEYS = [
  'bgApp',
  'panelBase',
  'textPrimary',
  'textSecondary',
  'accentBrand',
  'accentBrandStrong',
  'stateSuccess',
  'stateDanger',
] as const;

export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];
export type ThemeColors = Partial<Record<ThemeColorKey, string>>;
export type ThemeMode = 'light' | 'dark';
export type MonacoBaseTheme = 'vs' | 'vs-dark' | 'hc-black';

export interface MonacoThemeRule {
  token: string;
  foreground?: string;
  fontStyle?: string;
}

export interface ThemePackageMonacoTheme {
  base: MonacoBaseTheme;
  rules: MonacoThemeRule[];
  colors: Record<string, string>;
}

export interface ThemePackage {
  id: string;
  name: string;
  version: string;
  mode: ThemeMode;
  colors: ThemeColors;
  monaco: ThemePackageMonacoTheme;
}

export type ThemePackageErrorCode =
  | 'THEME_PARSE_FAILED'
  | 'THEME_INVALID'
  | 'THEME_TOO_LARGE';

export interface ThemePackageError {
  code: ThemePackageErrorCode;
  message: string;
}

export type ThemePackageParseResult =
  | { ok: true; theme: ThemePackage }
  | { ok: false; error: ThemePackageError };

/** 主题包 JSON 体积上限，避免把巨大的文件读进设置存储。 */
export const THEME_PACKAGE_MAX_BYTES = 256 * 1024;

/** 用户导入的主题包在设置里统一加前缀，避免与内置皮肤 id 冲突。 */
export const USER_THEME_ID_PREFIX = 'user:';

/** 主题包必须提供的颜色，缺失时整包不可用。 */
export const REQUIRED_THEME_COLOR_KEYS: ThemeColorKey[] = ['bgApp', 'textPrimary'];

const MAX_THEME_ID_LENGTH = 64;
const MAX_THEME_NAME_LENGTH = 64;
const MAX_THEME_VERSION_LENGTH = 32;
const MAX_MONACO_RULES = 256;
const MAX_MONACO_COLORS = 256;

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const HEX_COLOR_WITH_ALPHA_PATTERN = /^#[0-9a-fA-F]{8}$/;
const THEME_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MONACO_COLOR_KEY_PATTERN = /^[a-zA-Z0-9.[\]#_-]+$/;
const FONT_STYLE_TOKENS = new Set(['', 'italic', 'bold', 'underline', 'strikethrough']);

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  return null;
}

function normalizeAlphaHexColor(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (HEX_COLOR_WITH_ALPHA_PATTERN.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return normalizeHexColor(trimmed);
}

export function normalizeThemeColors(value: unknown): ThemeColors {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const source = value as Record<string, unknown>;
  const colors: ThemeColors = {};
  THEME_COLOR_KEYS.forEach((key) => {
    const normalized = normalizeHexColor(source[key]);
    if (normalized) {
      colors[key] = normalized;
    }
  });

  return colors;
}

export function missingRequiredThemeColors(colors: ThemeColors): ThemeColorKey[] {
  return REQUIRED_THEME_COLOR_KEYS.filter((key) => !colors[key]);
}

export function normalizeThemePackageId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > MAX_THEME_ID_LENGTH || !THEME_ID_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function normalizeThemeName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_THEME_NAME_LENGTH) {
    return null;
  }

  return trimmed;
}

function normalizeThemeVersion(value: unknown): string {
  if (typeof value !== 'string') {
    return '1.0.0';
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_THEME_VERSION_LENGTH) {
    return '1.0.0';
  }

  return trimmed;
}

function normalizeThemeMode(value: unknown): ThemeMode {
  return value === 'light' ? 'light' : 'dark';
}

function normalizeMonacoBase(value: unknown): MonacoBaseTheme {
  if (value === 'vs' || value === 'vs-dark' || value === 'hc-black') {
    return value;
  }

  return 'vs-dark';
}

function normalizeFontStyle(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const tokens = value
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token && FONT_STYLE_TOKENS.has(token));

  return Array.from(new Set(tokens)).join(' ');
}

function normalizeMonacoRules(value: unknown): MonacoThemeRule[] {
/**
 * Monaco 主题规则的 foreground 使用不带 # 的 rrggbb。
 * 导出后再导入时两种写法都要能识别，否则 round-trip 会丢失颜色。
 */
function normalizeMonacoRuleForeground(value: unknown): string | null {
  const normalized = normalizeHexColor(value);
  if (normalized) {
    return normalized.replace('#', '');
  }

  if (typeof value === 'string' && /^[0-9a-fA-F]{6}$/.test(value.trim())) {
    return value.trim().toLowerCase();
  }

  return null;
}

  if (!Array.isArray(value)) {
    return [];
  }

  const rules: MonacoThemeRule[] = [];
  value.slice(0, MAX_MONACO_RULES).forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const record = entry as Record<string, unknown>;
    const token = typeof record.token === 'string' ? record.token.trim() : '';
    if (!token || token.length > 64) {
      return;
    }

    const rule: MonacoThemeRule = { token };
    const foreground = normalizeMonacoRuleForeground(record.foreground);
    if (foreground) {
      rule.foreground = foreground;
    }
    const fontStyle = normalizeFontStyle(record.fontStyle);
    if (fontStyle) {
      rule.fontStyle = fontStyle;
    }
    rules.push(rule);
  });

  return rules;
}

function normalizeMonacoColors(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const colors: Record<string, string> = {};
  Object.entries(value as Record<string, unknown>)
    .slice(0, MAX_MONACO_COLORS)
    .forEach(([key, raw]) => {
      if (!MONACO_COLOR_KEY_PATTERN.test(key) || key.length > 64) {
        return;
      }

      const normalized = normalizeAlphaHexColor(raw);
      if (normalized) {
        colors[key] = normalized;
      }
    });

  return colors;
}

/**
 * 解析主题包 JSON。任何一步失败都返回结构化错误，调用方负责保持当前主题不变。
 */
export function parseThemePackage(raw: string): ThemePackageParseResult {
  if (typeof raw !== 'string') {
    return { ok: false, error: { code: 'THEME_PARSE_FAILED', message: '主题内容必须是文本' } };
  }

  const bytes = new TextEncoder().encode(raw).length;
  if (bytes > THEME_PACKAGE_MAX_BYTES) {
    return {
      ok: false,
      error: {
        code: 'THEME_TOO_LARGE',
        message: `主题包超过 ${Math.round(THEME_PACKAGE_MAX_BYTES / 1024)} KB 上限`,
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'THEME_PARSE_FAILED',
        message: error instanceof Error ? error.message : '主题文件不是合法 JSON',
      },
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: { code: 'THEME_INVALID', message: '主题包必须是 JSON 对象' } };
  }

  return normalizeThemePackageRecord(parsed);
}

/**
 * 校验并归一化任意未知结构为完整主题包，用于导入文件与读取本地存储两条路径。
 */
export function normalizeThemePackageRecord(parsed: unknown): ThemePackageParseResult {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: { code: 'THEME_INVALID', message: '主题包必须是 JSON 对象' } };
  }

  const record = parsed as Record<string, unknown>;
  const id = normalizeThemePackageId(record.id);
  const name = normalizeThemeName(record.name);
  if (!id || !name) {
    return {
      ok: false,
      error: { code: 'THEME_INVALID', message: '主题包缺少合法的 id 或 name' },
    };
  }

  const colors = normalizeThemeColors(record.colors);
  const missing = missingRequiredThemeColors(colors);
  if (missing.length > 0) {
    return {
      ok: false,
      error: {
        code: 'THEME_INVALID',
        message: `主题包缺少必需颜色：${missing.join('、')}`,
      },
    };
  }

  const monacoRecord =
    record.monaco && typeof record.monaco === 'object' && !Array.isArray(record.monaco)
      ? (record.monaco as Record<string, unknown>)
      : {};

  return {
    ok: true,
    theme: {
      id,
      name,
      version: normalizeThemeVersion(record.version),
      mode: normalizeThemeMode(record.mode),
      colors,
      monaco: {
        base: normalizeMonacoBase(monacoRecord.base),
        rules: normalizeMonacoRules(monacoRecord.rules),
        colors: normalizeMonacoColors(monacoRecord.colors),
      },
    },
  };
}

export function serializeThemePackage(theme: ThemePackage): string {
  const payload: ThemePackage = {
    id: theme.id,
    name: theme.name,
    version: theme.version,
    mode: theme.mode,
    colors: { ...theme.colors },
    monaco: {
      base: theme.monaco.base,
      rules: theme.monaco.rules.map((rule) => ({ ...rule })),
      colors: { ...theme.monaco.colors },
    },
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}

/**
 * 把主题包颜色映射为 CSS 变量色值，缺省键返回 undefined 由调用方回退到皮肤默认色。
 */
export function themePackageToCssColors(theme: ThemePackage): ThemeColors {
  return normalizeThemeColors(theme.colors);
}

/**
 * 生成 Monaco 自定义主题 id；同一主题包始终映射到同一 id，便于热切换。
 */
export function resolveMonacoThemeId(theme: ThemePackage): string {
  return `tau-${theme.id.replace(/[^a-z0-9-]/g, '-')}`;
}

/**
 * 从当前生效配色生成可导出的主题包，用于「导出当前主题」。
 */
export function createThemePackageFromColors(input: {
  id: string;
  name: string;
  mode: ThemeMode;
  colors: ThemeColors;
  base: MonacoBaseTheme;
  version?: string;
}): ThemePackageParseResult {
  return parseThemePackage(
    JSON.stringify({
      id: input.id,
      name: input.name,
      version: input.version ?? '1.0.0',
      mode: input.mode,
      colors: input.colors,
      monaco: { base: input.base, rules: [], colors: {} },
    }),
  );
}
