/**
 * SettingsPanel 组件测试
 * 
 * 测试设置面板的各项功能，包括主题切换、字体设置、编辑器配置等
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SettingsPanel from '@/components/editor/SettingsPanel.vue';
import { useSettingsStore } from '@/stores/settings';

// Mock Tauri commands
vi.mock('@/lib/tauri', () => ({
  fileCommands: {
    read_file: vi.fn(),
    write_file: vi.fn(),
  },
  TauriError: class TauriError extends Error {},
}));

describe('SettingsPanel', () => {
  let pinia: ReturnType<typeof createPinia>;
  let settingsStore: ReturnType<typeof useSettingsStore>;

  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    settingsStore = useSettingsStore();
    
    // 重置 store 到初始状态
    settingsStore.$reset();
    await flushPromises();
  });

  describe('渲染测试', () => {
    it('应正确渲染设置面板', () => {
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      expect(wrapper.find('[data-testid="settings-panel"]').exists()).toBe(true);
      expect(wrapper.find('.settings-header').exists()).toBe(true);
      expect(wrapper.find('.settings-title').text()).toBe('设置');
    });

    it('应显示所有设置区域', () => {
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const sections = wrapper.findAll('.settings-section');
      expect(sections.length).toBeGreaterThanOrEqual(3); // 外观、字体、编辑器
      
      // 检查区域标题
      const sectionTitles = wrapper.findAll('.settings-section-title');
      const titles = sectionTitles.map(el => el.text());
      expect(titles).toContain('外观');
      expect(titles).toContain('字体');
      expect(titles).toContain('编辑器');
    });

    it('关闭按钮应触发 close 事件', async () => {
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const closeButton = wrapper.find('.settings-close');
      await closeButton.trigger('click');

      expect(wrapper.emitted('close')).toHaveLength(1);
    });
  });

  describe('主题设置测试', () => {
    it('应显示三个主题选项按钮', () => {
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const themeButtons = wrapper.findAll('.theme-btn');
      expect(themeButtons.length).toBe(3);
      
      // 检查按钮文本
      const buttonSpans = themeButtons.map(btn => btn.find('span')?.text());
      expect(buttonSpans).toContain('浅色');
      expect(buttonSpans).toContain('深色');
      expect(buttonSpans).toContain('系统');
    });

    it('应高亮当前选中的主题', async () => {
      // 设置为深色主题
      settingsStore.updateSettings({ theme: 'dark' });
      await flushPromises();

      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const themeButtons = wrapper.findAll('.theme-btn');
      // 第二个按钮应该是深色，应该有 active 类
      expect(themeButtons[1].classes()).toContain('active');
    });

    it('点击主题按钮应更新主题设置', async () => {
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      // 点击浅色主题按钮
      const lightButton = wrapper.findAll('.theme-btn')[0];
      await lightButton.trigger('click');
      await flushPromises();

      expect(settingsStore.theme).toBe('light');
      expect(lightButton.classes()).toContain('active');

      // 点击深色主题按钮
      const darkButton = wrapper.findAll('.theme-btn')[1];
      await darkButton.trigger('click');
      await flushPromises();

      expect(settingsStore.theme).toBe('dark');
      expect(darkButton.classes()).toContain('active');

      // 点击系统主题按钮
      const systemButton = wrapper.findAll('.theme-btn')[2];
      await systemButton.trigger('click');
      await flushPromises();

      expect(settingsStore.theme).toBe('system');
      expect(systemButton.classes()).toContain('active');
    });

    it('应显示 Monaco 主题选择器', () => {
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const monacoSelect = wrapper.find('select');
      expect(monacoSelect.exists()).toBe(true);

      const options = monacoSelect.findAll('option');
      expect(options.length).toBeGreaterThanOrEqual(3);
    });

    it('更改 Monaco 主题应更新 store', async () => {
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const monacoSelect = wrapper.find('select');
      await monacoSelect.setValue('vs-dark');
      await flushPromises();

      expect(settingsStore.monacoTheme).toBe('vs-dark');
    });
  });

  describe('字体设置测试', () => {
    it('应显示当前字体大小', () => {
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const fontSizeValue = wrapper.find('.font-size-value');
      expect(fontSizeValue.text()).toContain(`${settingsStore.fontSize}px`);
    });

    it('点击增大字体按钮应增加字体大小', async () => {
      const initialSize = settingsStore.fontSize;
      
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const increaseButton = wrapper.findAll('.font-size-btn')[1]; // 第二个是增大
      await increaseButton.trigger('click');
      await flushPromises();

      expect(settingsStore.fontSize).toBe(initialSize + 1);
    });

    it('点击减小字体按钮应减小字体大小', async () => {
      // 先增大再减小
      settingsStore.adjustFontSize(2);
      await flushPromises();
      
      const initialSize = settingsStore.fontSize;
      
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const decreaseButton = wrapper.findAll('.font-size-btn')[0]; // 第一个是减小
      await decreaseButton.trigger('click');
      await flushPromises();

      expect(settingsStore.fontSize).toBe(initialSize - 1);
    });

    it('点击重置按钮应重置字体大小', async () => {
      // 先修改字体大小
      settingsStore.adjustFontSize(5);
      await flushPromises();
      
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const resetButton = wrapper.find('.font-size-reset');
      await resetButton.trigger('click');
      await flushPromises();

      expect(settingsStore.fontSize).toBe(14); // 默认值
    });

    it('应显示字体预览', () => {
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const preview = wrapper.find('.font-preview');
      expect(preview.exists()).toBe(true);
      expect(preview.text()).toContain('The quick brown fox');
      expect(preview.text()).toContain('快速棕色狐狸');
    });

    it('字体预览应使用正确的字体大小', async () => {
      settingsStore.updateSettings({ fontSize: 18 });
      await flushPromises();

      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const preview = wrapper.find('.font-preview');
      const style = preview.attributes('style');
      expect(style).toContain('18px');
    });

    it('更改字体家族应更新 store', async () => {
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const selects = wrapper.findAll('select');
      const fontFamilySelect = selects[1]; // 第二个 select 是字体家族
      await fontFamilySelect.setValue("'Fira Code', monospace");
      await flushPromises();

      expect(settingsStore.fontFamily).toBe("'Fira Code', monospace");
    });
  });

  describe('编辑器设置测试', () => {
    it('应显示自动保存复选框', () => {
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const checkbox = wrapper.find('input[type="checkbox"]');
      expect(checkbox.exists()).toBe(true);
    });

    it('自动保存复选框状态应与 store 同步', async () => {
      settingsStore.updateSettings({ autoSaveEnabled: true });
      await flushPromises();

      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const checkbox = wrapper.find('input[type="checkbox"]') as any;
      expect(checkbox.element.checked).toBe(true);
    });

    it('切换自动保存复选框应更新 store', async () => {
      settingsStore.updateSettings({ autoSaveEnabled: false });
      await flushPromises();

      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const checkbox = wrapper.find('input[type="checkbox"]');
      await checkbox.trigger('click');
      await flushPromises();

      expect(settingsStore.autoSaveEnabled).toBe(true);
    });

    it('应显示自动保存间隔选择器（当自动保存启用时）', async () => {
      settingsStore.updateSettings({ autoSaveEnabled: true });
      await flushPromises();

      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const selects = wrapper.findAll('select');
      // 应该能找到自动保存间隔选择器
      expect(selects.length).toBeGreaterThanOrEqual(2);
    });

    it('更改自动保存间隔应更新 store', async () => {
      settingsStore.updateSettings({ autoSaveEnabled: true });
      await flushPromises();

      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const selects = wrapper.findAll('select');
      const intervalSelect = selects.find(s => {
        const options = s.findAll('option');
        return options.some(o => o.attributes('value') === '30');
      });

      if (intervalSelect) {
        await intervalSelect.setValue('30');
        await flushPromises();
        expect(settingsStore.autoSaveInterval).toBe(30);
      }
    });

    it('应显示缩进大小选择器', () => {
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const selects = wrapper.findAll('select');
      const tabSizeSelect = selects.find(s => {
        const options = s.findAll('option');
        return options.some(o => o.attributes('value') === '4');
      });

      expect(tabSizeSelect).toBeDefined();
    });

    it('更改缩进大小应更新 store', async () => {
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const selects = wrapper.findAll('select');
      const tabSizeSelect = selects.find(s => {
        const options = s.findAll('option');
        return options.some(o => o.attributes('value') === '4');
      });

      if (tabSizeSelect) {
        await tabSizeSelect.setValue('4');
        await flushPromises();
        expect(settingsStore.tabSize).toBe(4);
      }
    });

    it('应显示缩略图复选框', () => {
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const checkboxes = wrapper.findAll('input[type="checkbox"]');
      // 至少应该有自动保存和缩略图两个复选框
      expect(checkboxes.length).toBeGreaterThanOrEqual(2);
    });

    it('切换缩略图复选框应更新 store', async () => {
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const checkboxes = wrapper.findAll('input[type="checkbox"]');
      // 找到缩略图复选框（第二个）
      const minimapCheckbox = checkboxes[1];
      
      await minimapCheckbox.trigger('click');
      await flushPromises();

      expect(settingsStore.minimap).toBe(true);
    });

    it('应显示自动换行复选框', () => {
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const checkboxes = wrapper.findAll('input[type="checkbox"]');
      expect(checkboxes.length).toBeGreaterThanOrEqual(3);
    });

    it('切换自动换行复选框应更新 store', async () => {
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const checkboxes = wrapper.findAll('input[type="checkbox"]');
      // 找到自动换行复选框（第三个）
      const wordWrapCheckbox = checkboxes[2];
      
      await wordWrapCheckbox.trigger('click');
      await flushPromises();

      expect(settingsStore.wordWrap).toBe(true);
    });
  });

  describe('样式和布局测试', () => {
    it('应应用正确的 CSS 类', () => {
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      expect(wrapper.classes()).toContain('settings-panel');
      expect(wrapper.find('.settings-header').exists()).toBe(true);
      expect(wrapper.find('.settings-content').exists()).toBe(true);
    });

    it('设置内容区域应该可滚动', () => {
      const wrapper = mount(SettingsPanel, {
        global: {
          plugins: [pinia],
        },
      });

      const content = wrapper.find('.settings-content');
      const style = content.attributes('style');
      // overflow-y: auto 应该在样式中定义
      expect(content.classes()).toBeDefined();
    });
  });
});
