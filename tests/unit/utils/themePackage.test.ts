/**
 * themePackage 工具单元测试
 *
 * 覆盖 v0.4.0 主题包解析、归一化、序列化与 Monaco 主题 id 解析。
 */

import { describe, expect, it } from 'vitest';
import {
  createThemePackageFromColors,
  missingRequiredThemeColors,
  normalizeHexColor,
  normalizeThemeColors,
  normalizeThemePackageId,
  normalizeThemePackageRecord,
  parseThemePackage,
  resolveMonacoThemeId,
  serializeThemePackage,
  THEME_PACKAGE_MAX_BYTES,
  type ThemePackage,
} from '@/utils/themePackage';

const validThemeJson = JSON.stringify({
  id: 'midnight-ink',
  name: 'Midnight Ink',
  version: '1.2.0',
  mode: 'dark',
  colors: {
    bgApp: '#0B1020',
    textPrimary: '#F8FAFC',
    accentBrand: '#38bdf8',
    ignoredColor: '#ffffff',
    textSecondary: 'not-a-color',
  },
  monaco: {
    base: 'vs-dark',
    rules: [
      { token: 'comment', foreground: '#64748B', fontStyle: 'Italic' },
      { token: '', foreground: 'zzz' },
    ],
    colors: {
      'editor.background': '#0B1020',
      'bad key!': '#ffffff',
      'editorCursor.foreground': '#38BDF8FF',
    },
  },
});

describe('themePackage', () => {
  it('normalizes hex colors to lowercase six-digit form', () => {
    expect(normalizeHexColor('#ABC')).toBe('#aabbcc');
    expect(normalizeHexColor(' #A1B2C3 ')).toBe('#a1b2c3');
    expect(normalizeHexColor('#12345')).toBeNull();
    expect(normalizeHexColor(42)).toBeNull();
  });

  it('normalizes a theme package record and drops invalid entries', () => {
    const result = parseThemePackage(validThemeJson);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.theme.id).toBe('midnight-ink');
    expect(result.theme.name).toBe('Midnight Ink');
    expect(result.theme.version).toBe('1.2.0');
    expect(result.theme.mode).toBe('dark');
    expect(result.theme.colors.bgApp).toBe('#0b1020');
    expect(result.theme.colors.accentBrand).toBe('#38bdf8');
    expect(result.theme.colors.textSecondary).toBeUndefined();
    expect(result.theme.monaco.rules).toEqual([
      { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
    ]);
    expect(result.theme.monaco.colors['editor.background']).toBe('#0b1020');
    expect(result.theme.monaco.colors['editorCursor.foreground']).toBe('#38bdf8ff');
    expect(result.theme.monaco.colors['bad key!']).toBeUndefined();
  });

  it('rejects invalid JSON, invalid shapes and missing required colors', () => {
    expect(parseThemePackage('{oops').ok).toBe(false);
    expect(parseThemePackage('[]').ok).toBe(false);
    expect(parseThemePackage(JSON.stringify({ id: 'x', name: 'x' })).ok).toBe(false);

    const missingColors = parseThemePackage(
      JSON.stringify({ id: 'plain', name: 'Plain', colors: { bgApp: '#000000' } }),
    );
    expect(missingColors.ok).toBe(false);
    if (!missingColors.ok) {
      expect(missingColors.error.code).toBe('THEME_INVALID');
      expect(missingColors.error.message).toContain('textPrimary');
    }
  });

  it('rejects themes larger than the size limit', () => {
    const oversized = `{"id":"big","name":"big","colors":{"bgApp":"#000000","textPrimary":"#ffffff"},"pad":"${'x'.repeat(
      THEME_PACKAGE_MAX_BYTES,
    )}"}`;
    const result = parseThemePackage(oversized);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('THEME_TOO_LARGE');
    }
  });

  it('round-trips a serialized theme package', () => {
    const parsed = parseThemePackage(validThemeJson);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const serialized = serializeThemePackage(parsed.theme);
    const reparsed = parseThemePackage(serialized);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) {
      return;
    }
    expect(reparsed.theme).toEqual(parsed.theme);
  });

  it('resolves monaco theme ids and validates ids', () => {
    const theme: ThemePackage = {
      id: 'user:midnight-ink',
      name: 'Midnight',
      version: '1.0.0',
      mode: 'dark',
      colors: { bgApp: '#000000', textPrimary: '#ffffff' },
      monaco: { base: 'vs-dark', rules: [], colors: {} },
    };
    expect(resolveMonacoThemeId(theme)).toBe('tau-user-midnight-ink');
    expect(normalizeThemePackageId('  Mixed-Case  ')).toBe('mixed-case');
    expect(normalizeThemePackageId('-bad')).toBeNull();
    expect(normalizeThemePackageId('')).toBeNull();
  });

  it('reports missing required colors and synthesizes exportable themes', () => {
    expect(missingRequiredThemeColors({ bgApp: '#000000' })).toEqual(['textPrimary']);
    expect(normalizeThemeColors({ bgApp: '#fff' })).toEqual({ bgApp: '#ffffff' });

    const synthesized = createThemePackageFromColors({
      id: 'skin-deep-ocean',
      name: 'Deep Ocean palette',
      mode: 'dark',
      colors: { bgApp: '#0b1020', textPrimary: '#f8fafc' },
      base: 'vs-dark',
    });
    expect(synthesized.ok).toBe(true);
    if (synthesized.ok) {
      expect(synthesized.theme.id).toBe('skin-deep-ocean');
      expect(synthesized.theme.monaco.base).toBe('vs-dark');
    }
  });

  it('normalizes unknown records without throwing', () => {
    expect(normalizeThemePackageRecord(null).ok).toBe(false);
    expect(normalizeThemePackageRecord({ id: 'ok', name: 'Ok', colors: { bgApp: '#000', textPrimary: '#fff' } }).ok).toBe(true);
  });
});
