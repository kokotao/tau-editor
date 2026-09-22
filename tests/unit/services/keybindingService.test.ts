/**
 * keybindingService 单元测试
 *
 * 覆盖 v0.4.0 快捷键归一化、录制解析、冲突检测与展示格式化。
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEYBINDINGS,
  findConflictsForKey,
  findKeybindingConflicts,
  formatKeybinding,
  keybindingFromEvent,
  keybindingSignature,
  keybindingToShortcut,
  normalizeKeybinding,
  normalizeKeybindingOverrides,
  resolveKeybinding,
  resolveKeybindings,
} from '@/services/keybindingService';

describe('keybindingService', () => {
  it('normalizes modifier order and key casing', () => {
    expect(normalizeKeybinding('Ctrl + Shift + P')).toBe('ctrl+shift+p');
    expect(normalizeKeybinding('SHIFT+CTRL+F')).toBe('ctrl+shift+f');
    expect(normalizeKeybinding('cmd+k')).toBe('meta+k');
    expect(normalizeKeybinding('alt+ctrl+shift+meta+x')).toBe('ctrl+alt+shift+meta+x');
    expect(normalizeKeybinding('Ctrl+Space')).toBe('ctrl+space');
  });

  it('rejects invalid or modifier-only bindings', () => {
    expect(normalizeKeybinding('')).toBeNull();
    expect(normalizeKeybinding('ctrl')).toBeNull();
    expect(normalizeKeybinding('ctrl+shift')).toBeNull();
    expect(normalizeKeybinding('ctrl+a+b')).toBeNull();
    expect(normalizeKeybinding(42 as unknown as string)).toBeNull();
  });

  it('parses keyboard events and ignores pure modifiers', () => {
    expect(
      keybindingFromEvent({ key: 'p', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true }),
    ).toBe('ctrl+shift+p');

    expect(
      keybindingFromEvent({ key: 'k', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }),
    ).toBe('meta+k');

    expect(
      keybindingFromEvent({ key: 'Control', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }),
    ).toBeNull();
  });

  it('treats ctrl and meta as the same signature for conflict detection', () => {
    expect(keybindingSignature('ctrl+shift+p')).toBe('ctrl+shift+p');
    expect(keybindingSignature('meta+shift+p')).toBe('ctrl+shift+p');
    expect(keybindingSignature('shift+ctrl+p')).toBe('ctrl+shift+p');
  });

  it('resolves overrides, unbound entries and custom flags', () => {
    const overrides = {
      'file.save': 'ctrl+alt+s',
      'file.new': '',
    };
    const resolved = resolveKeybindings(DEFAULT_KEYBINDINGS, overrides);
    const save = resolved.find((item) => item.commandId === 'file.save');
    const newFile = resolved.find((item) => item.commandId === 'file.new');

    expect(save?.keys).toBe('ctrl+alt+s');
    expect(save?.isCustom).toBe(true);
    expect(newFile?.isUnbound).toBe(true);
    expect(newFile?.keys).toBe('');

    const single = resolveKeybinding(DEFAULT_KEYBINDINGS, overrides, 'file.save');
    expect(single?.keys).toBe('ctrl+alt+s');
  });

  it('detects conflicts including overrides that collide with defaults', () => {
    const conflicts = findKeybindingConflicts(DEFAULT_KEYBINDINGS, { 'file.save': 'ctrl+o' });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.commandIds.sort()).toEqual(['file.open', 'file.save']);

    expect(findConflictsForKey(DEFAULT_KEYBINDINGS, {}, 'file.save', 'meta+o')).toEqual(['file.open']);
    expect(findConflictsForKey(DEFAULT_KEYBINDINGS, {}, 'file.save', 'ctrl+alt+y')).toEqual([]);
  });

  it('reports no conflicts for the default binding set', () => {
    expect(findKeybindingConflicts(DEFAULT_KEYBINDINGS)).toEqual([]);
  });

  it('formats bindings for display', () => {
    expect(formatKeybinding('ctrl+shift+p')).toBe('Ctrl+Shift+P');
    expect(formatKeybinding('meta+k', 'MacIntel')).toBe('Cmd+K');
    expect(formatKeybinding('')).toBe('');
  });

  it('converts bindings into keyboard store shortcuts', () => {
    expect(keybindingToShortcut('ctrl+shift+p')).toEqual({ key: 'p', modifiers: ['ctrl', 'shift'] });
    expect(keybindingToShortcut('f1')).toEqual({ key: 'f1', modifiers: [] });
    expect(keybindingToShortcut('ctrl')).toBeNull();
  });

  it('normalizes persisted override maps and drops invalid entries', () => {
    expect(
      normalizeKeybindingOverrides({
        'file.save': 'Ctrl + Alt + S',
        'file.new': '',
        'file.open': 'not a binding',
        invalid: 42,
      }),
    ).toEqual({
      'file.save': 'ctrl+alt+s',
      'file.new': '',
    });
    expect(normalizeKeybindingOverrides(null)).toEqual({});
    expect(normalizeKeybindingOverrides([])).toEqual({});
  });
});
