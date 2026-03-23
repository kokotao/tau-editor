/**
 * KeyboardStore 单元测试
 * 测试快捷键注册、注销、触发等功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useKeyboardStore, type Shortcut } from '@/stores/keyboard';

describe('KeyboardStore', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    // 清理全局事件监听器
    vi.clearAllMocks();
  });

  describe('快捷键注册', () => {
    it('应注册单个快捷键', () => {
      const keyboard = useKeyboardStore();
      const handler = vi.fn();
      
      keyboard.register({
        id: 'save',
        key: 's',
        modifiers: ['ctrl'],
        handler,
        description: '保存文件',
      });

      expect(keyboard.shortcuts).toHaveLength(1);
      expect(keyboard.shortcuts[0].id).toBe('save');
      expect(keyboard.shortcuts[0].key).toBe('s');
      expect(keyboard.shortcuts[0].modifiers).toEqual(['ctrl']);
    });

    it('应生成正确的快捷键 ID', () => {
      const keyboard = useKeyboardStore();
      
      keyboard.register({
        id: 'test1',
        key: 's',
        modifiers: ['ctrl', 'shift'],
        handler: vi.fn(),
      });

      // ID 应该由 modifiers + key 组成
      expect(keyboard.getShortcutId({ key: 's', modifiers: ['ctrl', 'shift'] }))
        .toBe('ctrl+shift+s');
    });

    it('应更新已存在的快捷键', () => {
      const keyboard = useKeyboardStore();
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      keyboard.register({
        id: 'save',
        key: 's',
        modifiers: ['ctrl'],
        handler: handler1,
      });

      expect(keyboard.shortcuts).toHaveLength(1);

      // 注册相同快捷键应该更新
      keyboard.register({
        id: 'save',
        key: 's',
        modifiers: ['ctrl'],
        handler: handler2,
      });

      expect(keyboard.shortcuts).toHaveLength(1);
      expect(keyboard.shortcuts[0].handler).toBe(handler2);
    });

    it('应支持无修饰键的快捷键', () => {
      const keyboard = useKeyboardStore();
      const handler = vi.fn();
      
      keyboard.register({
        id: 'escape',
        key: 'Escape',
        handler,
      });

      expect(keyboard.shortcuts).toHaveLength(1);
      expect(keyboard.shortcuts[0].modifiers).toBeUndefined();
    });
  });

  describe('快捷键注销', () => {
    it('应注销指定 ID 的快捷键', () => {
      const keyboard = useKeyboardStore();
      
      keyboard.register({
        id: 'save',
        key: 's',
        modifiers: ['ctrl'],
        handler: vi.fn(),
      });

      keyboard.register({
        id: 'open',
        key: 'o',
        modifiers: ['ctrl'],
        handler: vi.fn(),
      });

      expect(keyboard.shortcuts).toHaveLength(2);

      keyboard.unregister('save');

      expect(keyboard.shortcuts).toHaveLength(1);
      expect(keyboard.shortcuts[0].id).toBe('open');
    });

    it('注销不存在的快捷键应无副作用', () => {
      const keyboard = useKeyboardStore();
      
      keyboard.register({
        id: 'save',
        key: 's',
        modifiers: ['ctrl'],
        handler: vi.fn(),
      });

      keyboard.unregister('nonexistent');

      expect(keyboard.shortcuts).toHaveLength(1);
    });

    it('应清除所有快捷键', () => {
      const keyboard = useKeyboardStore();
      
      keyboard.register({ id: 'save', key: 's', modifiers: ['ctrl'], handler: vi.fn() });
      keyboard.register({ id: 'open', key: 'o', modifiers: ['ctrl'], handler: vi.fn() });
      keyboard.register({ id: 'close', key: 'w', modifiers: ['ctrl'], handler: vi.fn() });

      expect(keyboard.shortcuts).toHaveLength(3);

      keyboard.clear();

      expect(keyboard.shortcuts).toHaveLength(0);
    });
  });

  describe('快捷键触发', () => {
    it('应触发匹配的快捷键', () => {
      const keyboard = useKeyboardStore();
      const handler = vi.fn();
      
      keyboard.register({
        id: 'save',
        key: 's',
        modifiers: ['ctrl'],
        handler,
      });

      // 模拟 Ctrl+S
      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
      });
      event.preventDefault = vi.fn();
      
      window.dispatchEvent(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('应支持多修饰键', () => {
      const keyboard = useKeyboardStore();
      const handler = vi.fn();
      
      keyboard.register({
        id: 'duplicate',
        key: 'd',
        modifiers: ['ctrl', 'shift'],
        handler,
      });

      // 模拟 Ctrl+Shift+D
      const event = new KeyboardEvent('keydown', {
        key: 'd',
        ctrlKey: true,
        shiftKey: true,
      });
      event.preventDefault = vi.fn();
      
      window.dispatchEvent(event);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('应支持 Ctrl 和 Meta 键互换', () => {
      const keyboard = useKeyboardStore();
      const handler = vi.fn();
      
      keyboard.register({
        id: 'save',
        key: 's',
        modifiers: ['ctrl'],
        handler,
      });

      // 模拟 Cmd+S (Mac)
      const event = new KeyboardEvent('keydown', {
        key: 's',
        metaKey: true,
      });
      event.preventDefault = vi.fn();
      
      window.dispatchEvent(event);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('不应触发不匹配的快捷键', () => {
      const keyboard = useKeyboardStore();
      const handler = vi.fn();
      
      keyboard.register({
        id: 'save',
        key: 's',
        modifiers: ['ctrl'],
        handler,
      });

      // 模拟 Ctrl+O (不匹配)
      const event = new KeyboardEvent('keydown', {
        key: 'o',
        ctrlKey: true,
      });
      
      window.dispatchEvent(event);

      expect(handler).not.toHaveBeenCalled();
    });

    it('在输入框中应跳过非修饰键快捷键', () => {
      const keyboard = useKeyboardStore();
      const handler = vi.fn();
      
      keyboard.register({
        id: 'space',
        key: ' ',
        handler,
      });

      // 创建输入框
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent('keydown', {
        key: ' ',
      });
      
      window.dispatchEvent(event);

      expect(handler).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });

    it('在输入框中应允许功能键快捷键', () => {
      const keyboard = useKeyboardStore();
      const handler = vi.fn();

      keyboard.register({
        id: 'command-palette-f1',
        key: 'F1',
        handler,
      });

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent('keydown', {
        key: 'F1',
      });

      window.dispatchEvent(event);

      expect(handler).toHaveBeenCalledTimes(1);

      document.body.removeChild(input);
    });

    it('应支持 preventDefault 配置', () => {
      const keyboard = useKeyboardStore();
      
      keyboard.register({
        id: 'save',
        key: 's',
        modifiers: ['ctrl'],
        handler: vi.fn(),
        preventDefault: false,
      });

      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
      });
      event.preventDefault = vi.fn();
      
      window.dispatchEvent(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('获取快捷键列表', () => {
    it('应返回所有已注册的快捷键', () => {
      const keyboard = useKeyboardStore();
      
      keyboard.register({
        id: 'save',
        key: 's',
        modifiers: ['ctrl'],
        handler: vi.fn(),
        description: '保存',
      });

      keyboard.register({
        id: 'open',
        key: 'o',
        modifiers: ['ctrl'],
        handler: vi.fn(),
        description: '打开',
      });

      const shortcuts = keyboard.getShortcuts();

      expect(shortcuts).toHaveLength(2);
      expect(shortcuts.map(s => s.id)).toEqual(['save', 'open']);
    });
  });

  describe('全局事件监听器管理', () => {
    it('应只注册一次全局监听器', () => {
      const keyboard = useKeyboardStore();
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      
      keyboard.register({
        id: 'save1',
        key: 's',
        modifiers: ['ctrl'],
        handler: vi.fn(),
      });

      keyboard.register({
        id: 'save2',
        key: 's',
        modifiers: ['ctrl', 'shift'],
        handler: vi.fn(),
      });

      // 应该只调用一次 addEventListener
      expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
      expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

      addEventListenerSpy.mockRestore();
    });
  });
});
