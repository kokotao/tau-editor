import { defineStore } from 'pinia';

export interface Shortcut {
  id: string;
  key: string;
  modifiers?: string[];  // 'ctrl', 'shift', 'alt', 'meta'
  handler: () => void;
  description?: string;
  preventDefault?: boolean;
}

type KeyboardStoreLike = {
  handleKeyDown: (event: KeyboardEvent) => void;
};

let activeKeyboardStore: KeyboardStoreLike | null = null;
let globalHandlerRegistered = false;

const dispatchGlobalKeydown = (event: KeyboardEvent) => {
  activeKeyboardStore?.handleKeyDown(event);
};

export const useKeyboardStore = defineStore('keyboard', {
  state: () => ({
    shortcuts: [] as Shortcut[],
    registeredKeys: new Set<string>(),
  }),

  actions: {
    // 注册快捷键
    register(shortcut: Shortcut) {
      const keyId = this.getShortcutId(shortcut);
      
      // 检查是否已存在
      const existingIndex = this.shortcuts.findIndex(s => this.getShortcutId(s) === keyId);
      if (existingIndex !== -1) {
        // 更新现有快捷键
        this.shortcuts[existingIndex] = shortcut;
      } else {
        // 添加新快捷键
        this.shortcuts.push(shortcut);
      }
      
      this.setupGlobalHandler();
    },

    // 注销快捷键
    unregister(id: string) {
      const index = this.shortcuts.findIndex(s => s.id === id);
      if (index !== -1) {
        this.shortcuts.splice(index, 1);
      }
    },

    // 注销所有快捷键
    clear() {
      this.shortcuts = [];
    },

    // 生成快捷键 ID
    getShortcutId(shortcut: Shortcut): string {
      const mods = shortcut.modifiers?.sort().join('+') || '';
      return `${mods}${mods && shortcut.key ? '+' : ''}${shortcut.key}`.toLowerCase();
    },

    // 设置全局键盘事件处理器
    setupGlobalHandler() {
      // Pinia store 在测试或 HMR 场景下可能重建，重建后需要将监听器切换到新实例
      if (globalHandlerRegistered && activeKeyboardStore && activeKeyboardStore !== this) {
        window.removeEventListener('keydown', dispatchGlobalKeydown);
        globalHandlerRegistered = false;
      }

      activeKeyboardStore = this;
      if (!globalHandlerRegistered) {
        window.addEventListener('keydown', dispatchGlobalKeydown);
        globalHandlerRegistered = true;
      }
      this.registeredKeys.add('global');
    },

    // 移除全局键盘事件处理器
    removeGlobalHandler() {
      if (globalHandlerRegistered) {
        window.removeEventListener('keydown', dispatchGlobalKeydown);
        globalHandlerRegistered = false;
      }
      if (activeKeyboardStore === this) {
        activeKeyboardStore = null;
      }
      this.registeredKeys.clear();
    },

    // 处理键盘事件
    handleKeyDown(event: KeyboardEvent) {
      // jsdom 中 window.dispatchEvent 时 event.target 可能不是聚焦元素，兜底 activeElement
      const targetCandidate = event.target as HTMLElement | null;
      const activeElement = (document.activeElement as HTMLElement | null) ?? null;
      const target = targetCandidate instanceof HTMLElement ? targetCandidate : activeElement;
      const isInput = !!target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );

      for (const shortcut of this.shortcuts) {
        // 检查修饰键
        const mods = shortcut.modifiers || [];
        const hasCtrl = mods.includes('ctrl') || mods.includes('meta');
        const hasShift = mods.includes('shift');
        const hasAlt = mods.includes('alt');

        const matchCtrl = hasCtrl ? (event.ctrlKey || event.metaKey) : !(event.ctrlKey || event.metaKey);
        const matchShift = hasShift ? event.shiftKey : !event.shiftKey;
        const matchAlt = hasAlt ? event.altKey : !event.altKey;

        // 检查按键
        const matchKey = shortcut.key.toLowerCase() === event.key.toLowerCase();

        if (matchCtrl && matchShift && matchAlt && matchKey) {
          // 在输入框中时，仅跳过可打印字符的裸键快捷键（保留 F1/Escape 等功能键）
          const isPrintableShortcut = shortcut.key.length === 1;
          if (isInput && mods.length === 0 && isPrintableShortcut) {
            continue;
          }
          
          if (shortcut.preventDefault !== false) {
            event.preventDefault();
          }
          shortcut.handler();
          return;
        }
      }
    },

    // 获取所有已注册的快捷键（用于显示帮助）
    getShortcuts(): Shortcut[] {
      return this.shortcuts;
    },
  },
});
