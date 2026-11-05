/**
 * @description 状态栏下拉：门户渲染到 body、靠近底部向上展开、关闭时不留残留节点、限高滚动。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 16:20
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import StatusBarSelect from '@/components/editor/StatusBarSelect.vue';

const OPTIONS = [
  { value: 'plaintext', label: '纯文本' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'json', label: 'JSON' },
];

let current: ReturnType<typeof mountSelect> | null = null;

function mountSelect() {
  current = mount(StatusBarSelect, {
    props: {
      title: '语言模式',
      value: 'plaintext',
      options: OPTIONS,
      testId: 'language-mode-display',
    },
  });
  return current;
}

/** 固定触发器的视口坐标，模拟状态栏贴着窗口底部/顶部两种情况。 */
function stubTriggerRect(wrapper: ReturnType<typeof mountSelect>, top: number, bottom: number) {
  const trigger = wrapper.get('[data-testid="language-mode-display"]').element as HTMLElement;
  trigger.getBoundingClientRect = () => ({
    top,
    bottom,
    left: 100,
    right: 200,
    width: 100,
    height: bottom - top,
    x: 100,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;
}

const menuInBody = () => document.body.querySelector('[data-testid="language-mode-display-menu"]');

describe('StatusBarSelect 下拉浮层', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  });

  afterEach(() => {
    current?.unmount();
    current = null;
    vi.restoreAllMocks();
  });

  it('未展开时列表节点根本不存在（不会在窗口底部残留白条）', async () => {
    const wrapper = mountSelect();
    await flushPromises();

    expect(menuInBody()).toBeNull();
    expect(wrapper.find('[data-testid="language-mode-display-menu"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="language-mode-display"]').attributes('aria-expanded')).toBe('false');
  });

  it('展开后渲染到 body 门户里（脱离状态栏层叠上下文）', async () => {
    const wrapper = mountSelect();
    stubTriggerRect(wrapper, 700, 720);

    await wrapper.get('[data-testid="language-mode-display"]').trigger('click');
    await flushPromises();

    const menu = menuInBody();
    expect(menu).not.toBeNull();
    // 渲染进 body，而不是组件内部的 wrapper 子树
    expect(wrapper.element.contains(menu)).toBe(false);
    expect(wrapper.findAll('[role="option"]')).toHaveLength(0);
    expect(document.body.querySelectorAll('[role="option"]')).toHaveLength(OPTIONS.length);
  });

  it('靠近窗口底部时向上翻转，并被限制在视口内', async () => {
    const wrapper = mountSelect();
    stubTriggerRect(wrapper, 700, 720);

    await wrapper.get('[data-testid="language-mode-display"]').trigger('click');
    await flushPromises();

    const menu = menuInBody() as HTMLElement;
    expect(menu.dataset.placement).toBe('top');
    const top = Number.parseFloat(menu.style.top);
    expect(top).toBeLessThan(700);
    expect(top).toBeGreaterThanOrEqual(12);
    // 限高：给出行内 max-height，超出滚动
    expect(Number.parseFloat(menu.style.maxHeight)).toBeGreaterThan(0);
    expect(Number.parseFloat(menu.style.maxHeight)).toBeLessThanOrEqual(360);
  });

  it('靠近窗口顶部时向下展开', async () => {
    const wrapper = mountSelect();
    stubTriggerRect(wrapper, 120, 140);

    await wrapper.get('[data-testid="language-mode-display"]').trigger('click');
    await flushPromises();

    const menu = menuInBody() as HTMLElement;
    expect(menu.dataset.placement).toBe('bottom');
    expect(Number.parseFloat(menu.style.top)).toBeGreaterThan(140);
  });

  it('选择选项后 emits change 且列表节点移除', async () => {
    const wrapper = mountSelect();
    stubTriggerRect(wrapper, 700, 720);
    await wrapper.get('[data-testid="language-mode-display"]').trigger('click');
    await flushPromises();

    const option = document.body.querySelector<HTMLElement>('[data-testid="language-mode-display-option-javascript"]');
    expect(option).not.toBeNull();
    option!.click();
    await flushPromises();

    expect(wrapper.emitted('change')?.[0]).toEqual(['javascript']);
    expect(menuInBody()).toBeNull();
  });

  it('点菜单外部关闭，点菜单内部不关闭', async () => {
    const wrapper = mountSelect();
    stubTriggerRect(wrapper, 700, 720);
    await wrapper.get('[data-testid="language-mode-display"]').trigger('click');
    await flushPromises();

    const menu = menuInBody() as HTMLElement;
    menu.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushPromises();
    expect(menuInBody()).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushPromises();
    expect(menuInBody()).toBeNull();
  });
});
