import { defineStore } from 'pinia';

export interface Shortcut {
  id: string;
  key: string;
  modifiers?: string[];  // 'ctrl', 'shift', 'alt', 'meta'
  handler: () => void;
  description?: string;
  preventDefault?: boolean;
}

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
      if (this.registeredKeys.has('global')) return;
      
      window.addEventListener('keydown', this.handleKeyDown);
      this.registeredKeys.add('global');
    },

    // 移除全局键盘事件处理器
    removeGlobalHandler() {
      window.removeEventListener('keydown', this.handleKeyDown);
      this.registeredKeys.delete('global');
    },

    // 处理键盘事件
    handleKeyDown(event: KeyboardEvent) {
      // 检查是否在输入框中
      const target = event.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || 
                      target.tagName === 'TEXTAREA' || 
                      (target as any).isContentEditable;

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
          // 在输入框中时，只触发非修饰键快捷键
          if (isInput && mods.length === 0) {
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
