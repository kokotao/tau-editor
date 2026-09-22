/**
 * 快捷键服务（v0.4.0）
 *
 * 职责：
 * 1. 把用户输入的按键组合归一化成 `ctrl+shift+p` 形式；
 * 2. 解析「默认绑定 + 用户覆盖」得到命令的生效绑定；
 * 3. 冲突检测（ctrl / meta 视为同一平台语义修饰键）；
 * 4. 供设置面板、命令面板与 keyboard store 复用的格式化工具。
 *
 * 这里只做纯函数处理，不依赖 Pinia 或 DOM 之外的运行时，便于单测。
 */

export type KeybindingCategory = 'file' | 'view' | 'workspace' | 'search' | 'editor' | 'window';

export interface KeybindingDefinition {
  /** 与 AppCommand.id 保持一致 */
  commandId: string;
  /** 默认绑定，空串表示默认未绑定 */
  defaultKeys: string;
  category: KeybindingCategory;
}

export interface ResolvedKeybinding {
  commandId: string;
  keys: string;
  isCustom: boolean;
  isUnbound: boolean;
}

export interface KeybindingConflict {
  keys: string;
  commandIds: string[];
}

export type KeybindingOverrides = Record<string, string>;

const MODIFIER_ORDER = ['ctrl', 'alt', 'shift', 'meta'] as const;
type Modifier = (typeof MODIFIER_ORDER)[number];

const MODIFIER_ALIASES: Record<string, Modifier> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  cmd: 'meta',
  command: 'meta',
  meta: 'meta',
  super: 'meta',
  win: 'meta',
  windows: 'meta',
  shift: 'shift',
  alt: 'alt',
  option: 'alt',
};

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  spacebar: 'space',
  ' ': 'space',
  plus: '+',
  comma: ',',
  minus: '-',
  equal: '=',
  period: '.',
  slash: '/',
  backslash: '\\',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
};

const MODIFIER_KEY_NAMES = new Set([
  'control',
  'ctrl',
  'shift',
  'alt',
  'meta',
  'cmd',
  'command',
  'super',
  'win',
  'windows',
  'option',
]);

const MAX_KEY_LENGTH = 24;

/**
 * 默认快捷键表。新增命令时在这里登记，设置面板会自动展示。
 */
export const DEFAULT_KEYBINDINGS: KeybindingDefinition[] = [
  { commandId: 'commandPalette.open', defaultKeys: 'ctrl+shift+p', category: 'search' },
  { commandId: 'file.new', defaultKeys: 'ctrl+n', category: 'file' },
  { commandId: 'file.open', defaultKeys: 'ctrl+o', category: 'file' },
  { commandId: 'file.openFolder', defaultKeys: '', category: 'file' },
  { commandId: 'file.save', defaultKeys: 'ctrl+s', category: 'file' },
  { commandId: 'file.saveAs', defaultKeys: 'ctrl+shift+s', category: 'file' },
  { commandId: 'search.findText', defaultKeys: 'ctrl+f', category: 'search' },
  { commandId: 'search.goToLine', defaultKeys: 'ctrl+g', category: 'search' },
  { commandId: 'workspace.search', defaultKeys: 'ctrl+shift+f', category: 'workspace' },
  { commandId: 'workspace.quickOpen', defaultKeys: 'ctrl+p', category: 'workspace' },
  { commandId: 'view.toggleSidebar', defaultKeys: 'ctrl+b', category: 'view' },
  { commandId: 'view.toggleSettings', defaultKeys: 'ctrl+,', category: 'view' },
  { commandId: 'editor.zoomIn', defaultKeys: 'ctrl+=', category: 'editor' },
  { commandId: 'editor.zoomOut', defaultKeys: 'ctrl+-', category: 'editor' },
  { commandId: 'editor.zoomReset', defaultKeys: 'ctrl+0', category: 'editor' },
  { commandId: 'diff.compareWithFile', defaultKeys: 'ctrl+alt+d', category: 'file' },
  { commandId: 'window.openInNewWindow', defaultKeys: 'ctrl+alt+n', category: 'window' },
  { commandId: 'window.moveToNewWindow', defaultKeys: '', category: 'window' },
];

export function normalizeKeyToken(token: string): string | null {
  const trimmed = token.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const alias = KEY_ALIASES[trimmed];
  const key = alias ?? trimmed;
  if (!key || key.length > MAX_KEY_LENGTH) {
    return null;
  }

  return key;
}

/**
 * 把 `Ctrl + Shift + P` 之类的输入归一化成 `ctrl+shift+p`；非法输入返回 null。
 */
export function normalizeKeybinding(input: string): string | null {
  if (typeof input !== 'string') {
    return null;
  }

  const tokens = input
    .split('+')
    .flatMap((chunk) => chunk.split(' '))
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return null;
  }

  const modifiers = new Set<Modifier>();
  let mainKey: string | null = null;

  for (const token of tokens) {
    const lower = token.toLowerCase();
    const modifier = MODIFIER_ALIASES[lower];
    if (modifier) {
      modifiers.add(modifier);
      continue;
    }

    const normalizedKey = normalizeKeyToken(token);
    if (!normalizedKey || MODIFIER_KEY_NAMES.has(normalizedKey)) {
      return null;
    }

    // 主键只能有一个；`ctrl+shift+plus` 这类输入会把 `+` 拆开，需要单独兜底。
    if (mainKey !== null) {
      return null;
    }
    mainKey = normalizedKey;
  }

  if (!mainKey) {
    return null;
  }

  const orderedModifiers = MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier));
  return [...orderedModifiers, mainKey].join('+');
}

/**
 * 解析键盘事件；按下的是纯修饰键时返回 null，便于录制态忽略。
 */
export function keybindingFromEvent(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): string | null {
  const rawKey = (event.key || '').toLowerCase();
  if (!rawKey || MODIFIER_KEY_NAMES.has(rawKey)) {
    return null;
  }

  const tokens: string[] = [];
  if (event.ctrlKey && !event.metaKey) {
    tokens.push('ctrl');
  }
  if (event.metaKey) {
    tokens.push('meta');
  }
  if (event.altKey) {
    tokens.push('alt');
  }
  if (event.shiftKey) {
    tokens.push('shift');
  }
  tokens.push(rawKey);

  return normalizeKeybinding(tokens.join('+'));
}

/**
 * 语义签名：ctrl 与 meta 视为同一修饰键，用于跨平台冲突判定。
 */
export function keybindingSignature(keys: string): string | null {
  const normalized = normalizeKeybinding(keys);
  if (!normalized) {
    return null;
  }

  const parts = normalized.split('+');
  const mainKey = parts.pop() as string;
  const modifiers = new Set(parts.map((part) => (part === 'meta' ? 'ctrl' : part)));
  const ordered = MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier));
  return [...ordered, mainKey].join('+');
}

export function resolveKeybindings(
  definitions: KeybindingDefinition[],
  overrides: KeybindingOverrides = {},
): ResolvedKeybinding[] {
  return definitions.map((definition) => {
    const override = overrides[definition.commandId];
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, definition.commandId);
    const rawKeys = hasOverride ? override ?? '' : definition.defaultKeys;
    const keys = rawKeys ? (normalizeKeybinding(rawKeys) ?? '') : '';

    return {
      commandId: definition.commandId,
      keys,
      isCustom: hasOverride && keys !== normalizeKeybinding(definition.defaultKeys),
      isUnbound: keys === '',
    };
  });
}

export function resolveKeybinding(
  definitions: KeybindingDefinition[],
  overrides: KeybindingOverrides,
  commandId: string,
): ResolvedKeybinding | null {
  return resolveKeybindings(definitions, overrides).find((item) => item.commandId === commandId) ?? null;
}

/**
 * 找出所有冲突绑定；返回每个冲突签名对应的命令列表。
 */
export function findKeybindingConflicts(
  definitions: KeybindingDefinition[],
  overrides: KeybindingOverrides = {},
): KeybindingConflict[] {
  const groups = new Map<string, { keys: string; commandIds: string[] }>();

  for (const resolved of resolveKeybindings(definitions, overrides)) {
    if (!resolved.keys) {
      continue;
    }
    const signature = keybindingSignature(resolved.keys);
    if (!signature) {
      continue;
    }

    const group = groups.get(signature) ?? { keys: resolved.keys, commandIds: [] };
    group.commandIds.push(resolved.commandId);
    groups.set(signature, group);
  }

  return Array.from(groups.values())
    .filter((group) => group.commandIds.length > 1)
    .map((group) => ({ keys: group.keys, commandIds: group.commandIds }));
}

/**
 * 检查某条命令的目标绑定是否与其他命令冲突。
 */
export function findConflictsForKey(
  definitions: KeybindingDefinition[],
  overrides: KeybindingOverrides,
  commandId: string,
  keys: string,
): string[] {
  const signature = keybindingSignature(keys);
  if (!signature) {
    return [];
  }

  return resolveKeybindings(definitions, overrides)
    .filter((item) => item.commandId !== commandId && item.keys)
    .filter((item) => keybindingSignature(item.keys) === signature)
    .map((item) => item.commandId);
}

const KEY_LABELS: Record<string, string> = {
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  escape: 'Esc',
  enter: 'Enter',
  backspace: 'Backspace',
  delete: 'Delete',
  tab: 'Tab',
  space: 'Space',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
};

/** 把内部表示格式化成展示文本；macOS 上 meta 显示为 Cmd。 */
export function formatKeybinding(keys: string, platform?: string): string {
  const normalized = normalizeKeybinding(keys);
  if (!normalized) {
    return '';
  }

  const isMac = (platform ?? (typeof navigator !== 'undefined' ? navigator.platform : '') ?? '')
    .toLowerCase()
    .includes('mac');

  return normalized
    .split('+')
    .map((token) => {
      switch (token) {
        case 'ctrl':
          return isMac ? 'Ctrl' : 'Ctrl';
        case 'meta':
          return isMac ? 'Cmd' : 'Meta';
        case 'alt':
          return isMac ? 'Option' : 'Alt';
        case 'shift':
          return 'Shift';
        default:
          return KEY_LABELS[token] ?? (token.length === 1 ? token.toUpperCase() : token.charAt(0).toUpperCase() + token.slice(1));
      }
    })
    .join('+');
}

/**
 * 转换为 keyboard store 的注册参数。
 */
export function keybindingToShortcut(keys: string): { key: string; modifiers: string[] } | null {
  const normalized = normalizeKeybinding(keys);
  if (!normalized) {
    return null;
  }

  const parts = normalized.split('+');
  const key = parts.pop() as string;
  return { key, modifiers: parts };
}

/** 归一化持久化的覆盖表：丢弃非法绑定，保留解绑（空串）。 */
export function normalizeKeybindingOverrides(value: unknown): KeybindingOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const overrides: KeybindingOverrides = {};
  Object.entries(value as Record<string, unknown>).forEach(([commandId, rawKeys]) => {
    if (typeof commandId !== 'string' || !commandId) {
      return;
    }
    if (typeof rawKeys !== 'string') {
      return;
    }
    if (rawKeys === '') {
      overrides[commandId] = '';
      return;
    }
    const normalized = normalizeKeybinding(rawKeys);
    if (normalized) {
      overrides[commandId] = normalized;
    }
  });

  return overrides;
}
