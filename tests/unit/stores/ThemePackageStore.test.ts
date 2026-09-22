/**
 * 主题包设置单元测试
 *
 * 覆盖 v0.4.0 主题包导入、激活、删除、导出与持久化归一化。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSettingsStore } from '@/stores/settings';
import { USER_THEME_ID_PREFIX } from '@/utils/themePackage';

vi.mock('@/lib/tauri', () => ({
  settingsCommands: {
    setAutoSaveInterval: vi.fn(),
    getAutoSaveInterval: vi.fn(),
  },
  TauriError: class TauriError extends Error {
    constructor(message: string, public command: string) {
      super(message);
      this.name = 'TauriError';
    }

    static fromError(error: unknown, command: string): TauriError {
      const message = error instanceof Error ? error.message : String(error);
      return new TauriError(message, command);
    }
  },
}));

const localStorageState = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => localStorageState.get(key) ?? null,
  setItem: (key: string, value: string) => {
    localStorageState.set(key, String(value));
  },
  removeItem: (key: string) => {
    localStorageState.delete(key);
  },
  clear: () => {
    localStorageState.clear();
  },
});

const themeJson = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: 'midnight-ink',
    name: 'Midnight Ink',
    version: '1.0.0',
    mode: 'dark',
    colors: {
      bgApp: '#0b1020',
      textPrimary: '#f8fafc',
      accentBrand: '#38bdf8',
    },
    monaco: {
      base: 'vs-dark',
      rules: [{ token: 'comment', foreground: '#64748b' }],
      colors: { 'editor.background': '#0b1020' },
    },
    ...overrides,
  });

describe('settings store theme packages', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('imports a theme package with the user prefix and activates it', () => {
    const store = useSettingsStore();

    const result = store.importThemePackage(themeJson());

    expect(result.success).toBe(true);
    expect(store.themePackages).toHaveLength(1);
    expect(store.themePackages[0]?.id).toBe(`${USER_THEME_ID_PREFIX}midnight-ink`);
    expect(store.activeThemePackageId).toBe(`${USER_THEME_ID_PREFIX}midnight-ink`);
    expect(store.activeMonacoThemeId).toBe('tau-user-midnight-ink');
    expect(store.activeMonacoThemeDefinition?.base).toBe('vs-dark');
    expect(store.theme).toBe('dark');
  });

  it('keeps the current theme when import fails', () => {
    const store = useSettingsStore();
    store.importThemePackage(themeJson());

    const failed = store.importThemePackage('{ not json');
    expect(failed.success).toBe(false);
    expect(failed.error?.code).toBe('THEME_PARSE_FAILED');
    expect(store.activeThemePackageId).toBe(`${USER_THEME_ID_PREFIX}midnight-ink`);
  });

  it('replaces a previously imported package with the same id', () => {
    const store = useSettingsStore();
    store.importThemePackage(themeJson());
    store.importThemePackage(themeJson({ name: 'Midnight Ink v2' }));

    expect(store.themePackages).toHaveLength(1);
    expect(store.themePackages[0]?.name).toBe('Midnight Ink v2');
  });

  it('can import without activating', () => {
    const store = useSettingsStore();
    const result = store.importThemePackage(themeJson(), { activate: false });

    expect(result.success).toBe(true);
    expect(store.activeThemePackageId).toBeNull();
  });

  it('exports a round-trippable payload for the active package', () => {
    const store = useSettingsStore();
    store.importThemePackage(themeJson());

    const payload = store.exportThemePackage();
    expect(payload).toBeTruthy();

    const reparsed = store.importThemePackage(payload as string);
    expect(reparsed.success).toBe(true);
    expect(reparsed.theme?.id).toBe(`${USER_THEME_ID_PREFIX}midnight-ink`);
  });

  it('exports a synthesized package when only a built-in skin is active', () => {
    const store = useSettingsStore();
    const payload = store.exportThemePackage();
    expect(payload).toBeTruthy();
    const parsed = JSON.parse(payload as string) as {
      id: string;
      colors: Record<string, string>;
    };
    expect(parsed.id).toContain('skin-');
    expect(parsed.colors.bgApp).toBeTruthy();
    expect(parsed.colors.textPrimary).toBeTruthy();
  });

  it('removes the active package and falls back to the built-in theme', () => {
    const store = useSettingsStore();
    store.importThemePackage(themeJson());
    const packageId = store.themePackages[0]?.id as string;

    expect(store.removeThemePackage(packageId)).toBe(true);
    expect(store.themePackages).toHaveLength(0);
    expect(store.activeThemePackageId).toBeNull();
    expect(store.activeMonacoThemeId).toBe(store.monacoTheme);
  });

  it('restores imported packages after resetting settings', async () => {
    const store = useSettingsStore();
    store.importThemePackage(themeJson());
    const packageId = store.themePackages[0]?.id;

    await store.resetToDefaults();

    expect(store.themePackages.map((theme) => theme.id)).toEqual([packageId]);
    expect(store.activeThemePackageId).toBeNull();
  });
});
