/**
 * EditorTabs 的受控组件契约测试：标签状态由宿主传入，所有操作经事件回传。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import EditorTabs from '@/components/editor/EditorTabs.vue';
import type { Tab } from '@/stores/tabs';

const makeTab = (id: string, overrides: Partial<Tab> = {}): Tab => ({
  id,
  filePath: `/workspace/${id}.txt`,
  fileName: `${id}.txt`,
  language: 'plaintext',
  isDirty: false,
  isUntitled: false,
  content: '',
  createdAt: 1,
  ...overrides,
});

const tabs = () => [makeTab('first'), makeTab('second'), makeTab('third')];

describe('EditorTabs.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders the supplied tabs and active state', () => {
    const wrapper = mount(EditorTabs, { props: { tabs: tabs(), activeTabId: 'second' } });

    expect(wrapper.findAll('[data-testid="tab"]')).toHaveLength(3);
    expect(wrapper.findAll('[data-testid="tab"]')[1].classes()).toContain('active');
    expect(wrapper.findAll('[data-testid="tab-title"]')[1].text()).toBe('second.txt');
  });

  it('renders dirty, untitled, and loading metadata from tab props', () => {
    const wrapper = mount(EditorTabs, {
      props: {
        tabs: [makeTab('draft', { isDirty: true, isUntitled: true, isLoadingContent: true, largeFileLoadProgress: 42 })],
        activeTabId: 'draft',
      },
    });

    expect(wrapper.get('[data-testid="tab"]').classes()).toContain('dirty');
    expect(wrapper.find('.tab-icon svg').exists()).toBe(true);
    expect(wrapper.get('.tab-loading-pill').text()).toContain('42');
  });

  it('emits tab-click without mutating controlled props', async () => {
    const wrapper = mount(EditorTabs, { props: { tabs: tabs(), activeTabId: 'first' } });

    await wrapper.findAll('[data-testid="tab"]')[1].trigger('click');

    expect(wrapper.emitted('tab-click')).toEqual([['second']]);
    expect(wrapper.findAll('[data-testid="tab"]')[0].classes()).toContain('active');
  });

  it('emits tab-close and stops the tab click propagation', async () => {
    const wrapper = mount(EditorTabs, { props: { tabs: tabs(), activeTabId: 'second' } });

    await wrapper.findAll('[data-testid="btn-close-tab"]')[1].trigger('click');

    expect(wrapper.emitted('tab-close')).toEqual([['second']]);
    expect(wrapper.emitted('tab-click')).toBeUndefined();
  });

  it('opens a context menu for the targeted tab', async () => {
    const wrapper = mount(EditorTabs, { props: { tabs: tabs(), activeTabId: 'first' } });

    await wrapper.findAll('[data-testid="tab"]')[1].trigger('contextmenu', { clientX: 100, clientY: 120 });

    expect(wrapper.get('.context-menu').attributes('style')).toContain('top: 8px');
    expect(wrapper.get('.context-menu').attributes('style')).toContain('left: 8px');
  });

  it('emits close-others for the context-menu target', async () => {
    const wrapper = mount(EditorTabs, { props: { tabs: tabs(), activeTabId: 'first' } });

    await wrapper.findAll('[data-testid="tab"]')[1].trigger('contextmenu');
    await wrapper.get('[data-testid="menu-close-others"]').trigger('click');

    expect(wrapper.emitted('tab-close-others')).toEqual([['second']]);
  });

  it('emits close-all from the context menu', async () => {
    const wrapper = mount(EditorTabs, { props: { tabs: tabs(), activeTabId: 'first' } });

    await wrapper.get('[data-testid="tab"]').trigger('contextmenu');
    await wrapper.get('[data-testid="menu-close-all"]').trigger('click');

    expect(wrapper.emitted('tab-close-all')).toEqual([[]]);
  });

  it('emits a rename after editing a tab title', async () => {
    const wrapper = mount(EditorTabs, { props: { tabs: tabs(), activeTabId: 'first' } });

    await wrapper.get('[data-testid="tab"]').trigger('dblclick');
    const input = wrapper.get('.tab-rename-input');
    await input.setValue('renamed.txt');
    await input.trigger('keydown.enter');

    expect(wrapper.emitted('rename-tab')).toEqual([['first', 'renamed.txt']]);
  });

  it('emits the reordered id sequence after a drag and drop', async () => {
    const wrapper = mount(EditorTabs, { props: { tabs: tabs(), activeTabId: 'first' } });
    const dataTransfer = new DataTransfer();
    const tabNodes = wrapper.findAll('[data-testid="tab"]');

    await tabNodes[0].trigger('dragstart', { dataTransfer });
    await tabNodes[2].trigger('drop', { dataTransfer });

    expect(wrapper.emitted('tabs-reorder')).toEqual([[['second', 'third', 'first']]]);
  });

  it('loading 状态提供取消按钮并回传 tabId', async () => {
    const wrapper = mount(EditorTabs, {
      props: {
        tabs: [
          makeTab('large', {
            isLargeFile: true,
            isLoadingContent: true,
            largeFileLoadState: 'loading',
            largeFileLoadProgress: 30,
          }),
        ],
        activeTabId: 'large',
      },
    });

    expect(wrapper.find('[data-testid="btn-retry-large-file-load"]').exists()).toBe(false);
    await wrapper.get('[data-testid="btn-cancel-large-file-load"]').trigger('click');

    expect(wrapper.emitted('cancel-large-file-load')).toEqual([['large']]);
    expect(wrapper.emitted('tab-click')).toBeUndefined();
  });

  it('failed 与 cancelled 状态展示重试按钮', async () => {
    const wrapper = mount(EditorTabs, {
      props: {
        tabs: [
          makeTab('broken', {
            isLargeFile: true,
            isLoadingContent: true,
            largeFileLoadState: 'failed',
          }),
          makeTab('stopped', {
            isLargeFile: true,
            isLoadingContent: true,
            largeFileLoadState: 'cancelled',
          }),
        ],
        activeTabId: 'broken',
      },
    });

    const pills = wrapper.findAll('.tab-loading-pill');
    expect(pills[0].text()).toContain('加载失败');
    expect(pills[1].text()).toContain('已取消加载');
    expect(wrapper.findAll('[data-testid="btn-cancel-large-file-load"]')).toHaveLength(0);

    await wrapper.findAll('[data-testid="btn-retry-large-file-load"]')[1].trigger('click');
    expect(wrapper.emitted('retry-large-file-load')).toEqual([['stopped']]);
  });

  it('closes the context menu when the document receives a click', async () => {
    const wrapper = mount(EditorTabs, { props: { tabs: tabs(), activeTabId: 'first' }, attachTo: document.body });

    await wrapper.get('[data-testid="tab"]').trigger('contextmenu');
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.context-menu').exists()).toBe(false);
    wrapper.unmount();
  });
});
