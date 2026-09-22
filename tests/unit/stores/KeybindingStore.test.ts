/**
 * 快捷键覆盖持久化单元测试（v0.4.0）
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSettingsStore } from '@/stores/settings';

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

describe('settings store keybindings', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('stores normalized overrides and persists them', () => {
    const store = useSettingsStore();

    expect(store.setKeybindingOverride('file.save', 'Ctrl + Alt + S')).toBe(true);
    expect(store.keybindingOverrides['file.save']).toBe('ctrl+alt+s');

    const saved = JSON.parse(localStorage.getItem('text-editor-settings') as string) as {
      keybindingOverrides: Record<string, string>;
    };
    expect(saved.keybindingOverrides['file.save']).toBe('ctrl+alt+s');
  });

  it('rejects invalid bindings', () => {
    const store = useSettingsStore();
    expect(store.setKeybindingOverride('file.save', 'ctrl')).toBe(false);
    expect(store.keybindingOverrides['file.save']).toBeUndefined();
  });

  it('supports unbinding and resetting a single command', () => {
    const store = useSettingsStore();
    store.setKeybindingOverride('file.save', 'ctrl+alt+s');
    store.setKeybindingOverride('file.save', '');
    expect(store.keybindingOverrides['file.save']).toBe('');

    store.resetKeybinding('file.save');
    expect('file.save' in store.keybindingOverrides).toBe(false);
  });

  it('resets all overrides', () => {
    const store = useSettingsStore();
    store.setKeybindingOverride('file.save', 'ctrl+alt+s');
    store.setKeybindingOverride('file.new', 'ctrl+alt+n');

    store.resetAllKeybindings();

    expect(store.keybindingOverrides).toEqual({});
  });

  it('drops invalid overrides when loading from storage', () => {
    localStorage.setItem(
      'text-editor-settings',
      JSON.stringify({
        keybindingOverrides: {
          'file.save': 'ctrl+alt+s',
          'file.new': 'nonsense+keys+here',
        },
      }),
    );

    const store = useSettingsStore();
    store.loadFromStorage();

    expect(store.keybindingOverrides).toEqual({ 'file.save': 'ctrl+alt+s' });
  });
});
