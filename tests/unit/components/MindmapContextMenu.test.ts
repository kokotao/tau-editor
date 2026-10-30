/**
 * UX-1：MindmapContextMenu（受控右键菜单）契约测试
 *
 * 覆盖：渲染菜单项 / 分隔线 / 快捷键 / 危险态、点击派发 select、禁用项不派发、
 * Esc 关闭、↑↓ + Enter 键盘导航、点击菜单外部关闭、visible=false 不渲染、
 * 定位写入 left/top 固定坐标。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import MindmapContextMenu from '@/components/editor/mindmap/MindmapContextMenu.vue';

const items = [
  { id: 'add-child', label: '新增子主题', shortcut: 'Tab' },
  { id: 'rename', label: '重命名', shortcut: 'F2' },
  { id: 'group-1', label: '', separator: true },
  { id: 'disabled-item', label: '不可用项', disabled: true },
  { id: 'delete', label: '删除主题', danger: true },
];

/** 所有已挂载实例：测试结束后统一卸载，避免 teleport 菜单与全局监听泄漏到后续用例。 */
const mountedWrappers: VueWrapper[] = [];

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) {
    wrapper.unmount();
  }
});

function mountMenu(overrides: Record<string, unknown> = {}): VueWrapper {
  const wrapper = mount(MindmapContextMenu, {
    props: { visible: true, x: 120, y: 80, items, ...overrides },
    attachTo: document.body,
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

function query(testid: string): HTMLElement | null {
  return document.querySelector(`[data-testid="${testid}"]`);
}

function pressKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('MindmapContextMenu', () => {
  it('渲染菜单项、分隔线、快捷键与危险态', () => {
    const wrapper = mountMenu();
    const menu = query('mm-context-menu');
    expect(menu).toBeTruthy();
    // 4 个可点击项 + 1 条分隔线
    expect(menu!.querySelectorAll('.mm-context-menu-item')).toHaveLength(4);
    expect(menu!.querySelectorAll('.mm-context-menu-separator')).toHaveLength(1);

    const addChild = query('mm-context-item-add-child')!;
    expect(addChild.textContent).toContain('新增子主题');
    expect(addChild.textContent).toContain('Tab');
    expect(query('mm-context-item-delete')!.classList.contains('is-danger')).toBe(true);
    expect(query('mm-context-item-disabled-item')!.hasAttribute('disabled')).toBe(true);

    // 固定定位到传入坐标（happy-dom 无布局，不做翻转）
    const style = menu!.getAttribute('style') ?? '';
    expect(style).toContain('left: 120px');
    expect(style).toContain('top: 80px');
  });

  it('点击菜单项派发 select(id)', () => {
    const wrapper = mountMenu();
    query('mm-context-item-rename')!.click();
    expect(wrapper.emitted('select')?.[0]).toEqual(['rename']);
    expect(wrapper.emitted('select')).toHaveLength(1);
  });

  it('禁用项点击不派发 select', () => {
    const wrapper = mountMenu();
    query('mm-context-item-disabled-item')!.click();
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('Esc 关闭菜单', () => {
    const wrapper = mountMenu();
    pressKey('Escape');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('↑ / ↓ 在可用项之间循环，Enter 触发当前项', async () => {
    const wrapper = mountMenu();
    // 首次 ↓ 落到第一个可用项，再 ↓ 落到第二个
    pressKey('ArrowDown');
    await nextTick();
    pressKey('ArrowDown');
    await nextTick();
    expect(query('mm-context-item-rename')!.classList.contains('is-active')).toBe(true);

    // ↑ 回到第一个可用项
    pressKey('ArrowUp');
    await nextTick();
    expect(query('mm-context-item-add-child')!.classList.contains('is-active')).toBe(true);

    pressKey('Enter');
    expect(wrapper.emitted('select')?.[0]).toEqual(['add-child']);

    // 从第一项继续 ↑ 应循环到最后一个可用项（跳过禁用项）
    pressKey('ArrowUp');
    await nextTick();
    expect(query('mm-context-item-delete')!.classList.contains('is-active')).toBe(true);
  });

  it('点击菜单外部关闭；点击菜单内部不关闭', () => {
    const wrapper = mountMenu();
    query('mm-context-item-add-child')!.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );
    expect(wrapper.emitted('close')).toBeUndefined();

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('visible=false 时不渲染、不响应键盘', () => {
    const wrapper = mountMenu({ visible: false });
    expect(query('mm-context-menu')).toBeNull();
    pressKey('Escape');
    expect(wrapper.emitted('close')).toBeUndefined();
  });

  it('坐标变化时重新定位', async () => {
    const wrapper = mountMenu();
    await wrapper.setProps({ x: 260, y: 340 });
    const style = query('mm-context-menu')!.getAttribute('style') ?? '';
    expect(style).toContain('left: 260px');
    expect(style).toContain('top: 340px');
  });
});
