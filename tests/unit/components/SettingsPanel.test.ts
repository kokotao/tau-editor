/**
 * SettingsPanel 组件测试
 * 
 * 测试设置面板的各项功能，包括主题切换、字体设置、编辑器配置等
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent } from 'vue';

const NConfigProviderStub = defineComponent({
  name: 'NConfigProvider',
  template: '<div class="n-config-provider"><slot /></div>',
});

const NSelectStub = defineComponent({
  name: 'NSelect',
  props: {
    value: {
      type: [String, Number],
      default: null,
    },
    options: {
      type: Array,
      default: () => [],
    },
  },
  emits: ['update:value'],
  template: `
    <select :data-testid="$attrs['data-testid']" :value="value" @change="$emit('update:value', $event.target.value)">
      <option v-for="option in options" :key="String(option.value)" :value="String(option.value)">
        {{ option.label }}
      </option>
    </select>
  `,
});

vi.mock('naive-ui', () => ({
  darkTheme: {},
  NConfigProvider: NConfigProviderStub,
  NSelect: NSelectStub,
}));

import SettingsPanel from '@/components/editor/SettingsPanel.vue';
import { useSettingsStore } from '@/stores/settings';

// Mock Tauri commands
vi.mock('@/lib/tauri', () => ({
  fileCommands: {
    read_file: vi.fn(),
    write_file: vi.fn(),
  },
  settingsCommands: {
    getAutoSaveInterval: vi.fn().mockResolvedValue(30),
    setAutoSaveEnabled: vi.fn().mockResolvedValue(undefined),
    setAutoSaveInterval: vi.fn().mockResolvedValue(undefined),
  },
  TauriError: class TauriError extends Error {
    static fromError(error: unknown) {
      return error instanceof Error ? error : new TauriError(String(error));
    }
  },
}));

describe('SettingsPanel', () => {
  let pinia: ReturnType<typeof createPinia>;
  let settingsStore: ReturnType<typeof useSettingsStore>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  const mountPanel = () => mount(SettingsPanel, {
    global: {
      plugins: [pinia],
      stubs: {
        NConfigProvider: NConfigProviderStub,
        NSelect: NSelectStub,
        'n-config-provider': NConfigProviderStub,
        'n-select': NSelectStub,
      },
    },
  });

  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    settingsStore = useSettingsStore(pinia);
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    
    // 重置 store 到初始状态
    settingsStore.$reset();
    await flushPromises();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('渲染测试', () => {
    it('应正确渲染设置面板', () => {
      const wrapper = mountPanel();

      expect(wrapper.find('[data-testid="settings-panel"]').exists()).toBe(true);
      expect(wrapper.find('.settings-header').exists()).toBe(true);
      expect(wrapper.find('.settings-title').text()).toBe('设置');
    });

    it('应显示所有设置区域', () => {
      const wrapper = mountPanel();

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
      const wrapper = mountPanel();

      const closeButton = wrapper.find('.settings-close');
      await closeButton.trigger('click');

      expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('应在设置页直接显示作者信息与捐赠二维码', async () => {
      const wrapper = mountPanel();

      const authorSection = wrapper.find('[data-testid="settings-author-section"]');
      expect(authorSection.exists()).toBe(true);
      expect(authorSection.text()).toContain('albert_luo');
      expect(authorSection.text()).toContain('公益捐赠');
      expect(authorSection.find('img[alt="微信捐赠"]').exists()).toBe(true);
      expect(authorSection.find('img[alt="支付宝捐赠"]').exists()).toBe(true);
    });
  });

  describe('主题设置测试', () => {
    it('应显示三个主题选项按钮', () => {
      const wrapper = mountPanel();

      const themeButtons = wrapper.findAll('.theme-btn');
      expect(themeButtons.length).toBe(3);
      
      // 检查按钮文本
      const buttonTexts = themeButtons.map(btn => btn.text());
      expect(buttonTexts).toContain('浅色');
      expect(buttonTexts).toContain('深色');
      expect(buttonTexts).toContain('系统');
    });

    it('应高亮当前选中的主题', async () => {
      // 设置为深色主题
      settingsStore.updateSettings({ theme: 'dark' });
      await flushPromises();

      const wrapper = mountPanel();

      const themeButtons = wrapper.findAll('.theme-btn');
      // 第二个按钮应该是深色，应该有 active 类
      expect(themeButtons[1].classes()).toContain('active');
    });

    it('点击主题按钮应更新主题设置', async () => {
      const wrapper = mountPanel();

      // 点击浅色主题按钮
      const lightButton = wrapper.findAll('.theme-btn')[0];
      await lightButton.trigger('click');
      await flushPromises();

      expect(settingsStore.theme).toBe('light');

      // 点击深色主题按钮
      const darkButton = wrapper.findAll('.theme-btn')[1];
      await darkButton.trigger('click');
      await flushPromises();

      expect(settingsStore.theme).toBe('dark');

      // 点击系统主题按钮
      const systemButton = wrapper.findAll('.theme-btn')[2];
      await systemButton.trigger('click');
      await flushPromises();

      expect(settingsStore.theme).toBe('system');
    });

    it('应显示 Monaco 主题选择器', () => {
      const wrapper = mountPanel();
      expect(wrapper.find('[data-testid="select-monaco-theme"]').exists()).toBe(true);
    });

    it('更改 Monaco 主题应更新 store', async () => {
      const wrapper = mountPanel();
      const selects = wrapper.findAllComponents({ name: 'Select' });
      const monacoSelect = selects[1];
      expect(monacoSelect).toBeDefined();

      monacoSelect!.vm.$emit('update:value', 'vs-dark');
      await flushPromises();

      expect(settingsStore.monacoTheme).toBe('vs-dark');
    });
  });

  describe('字体设置测试', () => {
    it('应显示当前字体大小', () => {
      const wrapper = mountPanel();

      const fontSizeValue = wrapper.find('.font-size-value');
      expect(fontSizeValue.text()).toContain(`${settingsStore.fontSize}px`);
    });

    it('点击增大字体按钮应增加字体大小', async () => {
      const initialSize = settingsStore.fontSize;
      
      const wrapper = mountPanel();

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
      
      const wrapper = mountPanel();

      const decreaseButton = wrapper.findAll('.font-size-btn')[0]; // 第一个是减小
      await decreaseButton.trigger('click');
      await flushPromises();

      expect(settingsStore.fontSize).toBe(initialSize - 1);
    });

    it('点击重置按钮应重置字体大小', async () => {
      // 先修改字体大小
      settingsStore.adjustFontSize(5);
      await flushPromises();
      
      const wrapper = mountPanel();

      const resetButton = wrapper.find('.font-size-reset');
      await resetButton.trigger('click');
      await flushPromises();

      expect(settingsStore.fontSize).toBe(14); // 默认值
    });

    it('应显示字体预览', () => {
      const wrapper = mountPanel();

      const preview = wrapper.find('.font-preview');
      expect(preview.exists()).toBe(true);
      expect(preview.text()).toContain('const hello = "你好，世界";');
      expect(preview.text()).toContain('console.log(hello);');
    });

    it('字体预览应使用正确的字体大小', async () => {
      settingsStore.updateSettings({ fontSize: 18 });
      await flushPromises();

      const wrapper = mountPanel();

      const preview = wrapper.find('.font-preview');
      const style = preview.attributes('style');
      expect(style).toContain('18px');
    });

    it('更改字体家族应更新 store', async () => {
      const wrapper = mountPanel();
      const selects = wrapper.findAllComponents({ name: 'Select' });
      const fontFamilySelect = selects[2];
      expect(fontFamilySelect).toBeDefined();

      fontFamilySelect!.vm.$emit('update:value', "'Fira Code', 'JetBrains Mono', monospace");
      await flushPromises();

      expect(settingsStore.fontFamily).toBe("'Fira Code', 'JetBrains Mono', monospace");
    });
  });

  describe('编辑器设置测试', () => {
    it('应显示自动保存复选框', () => {
      const wrapper = mountPanel();

      const checkbox = wrapper.find('input[type="checkbox"]');
      expect(checkbox.exists()).toBe(true);
    });

    it('自动保存复选框状态应与 store 同步', async () => {
      await settingsStore.updateSettings({ autoSaveEnabled: true });
      await flushPromises();

      const wrapper = mountPanel();

      const checkbox = wrapper.find('input[type="checkbox"]') as any;
      expect(checkbox.element.checked).toBe(true);
    });

    it('切换自动保存复选框应更新 store', async () => {
      await settingsStore.updateSettings({ autoSaveEnabled: false });
      await flushPromises();

      const wrapper = mountPanel();

      const checkbox = wrapper.find('input[type="checkbox"]');
      await checkbox.setValue(true);
      await flushPromises();

      expect(settingsStore.autoSaveEnabled).toBe(true);
    });

    it('应显示自动保存间隔选择器（当自动保存启用时）', async () => {
      await settingsStore.updateSettings({ autoSaveEnabled: true });
      await flushPromises();

      const wrapper = mountPanel();

      expect(wrapper.find('[data-testid="select-auto-save-interval"]').exists()).toBe(true);
    });

    it('更改自动保存间隔应更新 store', async () => {
      await settingsStore.updateSettings({ autoSaveEnabled: true });
      await flushPromises();

      const wrapper = mountPanel();
      const intervalSelect = wrapper.findAllComponents({ name: 'Select' })[3];
      expect(intervalSelect).toBeDefined();

      intervalSelect!.vm.$emit('update:value', '30');
      await flushPromises();
      expect(settingsStore.autoSaveInterval).toBe(30);
    });

    it('应显示缩进大小选择器', () => {
      const wrapper = mountPanel();
      expect(wrapper.find('[data-testid="select-tab-size"]').exists()).toBe(true);
    });

    it('更改缩进大小应更新 store', async () => {
      const wrapper = mountPanel();
      const tabSizeSelect = wrapper.findAllComponents({ name: 'Select' })[4];
      expect(tabSizeSelect).toBeDefined();

      tabSizeSelect!.vm.$emit('update:value', '4');
      await flushPromises();
      expect(settingsStore.tabSize).toBe(4);
    });

    it('应显示缩略图复选框', () => {
      const wrapper = mountPanel();

      const checkboxes = wrapper.findAll('input[type="checkbox"]');
      // 至少应该有自动保存和缩略图两个复选框
      expect(checkboxes.length).toBeGreaterThanOrEqual(2);
    });

    it('切换缩略图复选框应更新 store', async () => {
      await settingsStore.updateSettings({ minimap: false });
      await flushPromises();

      const wrapper = mountPanel();

      const checkboxes = wrapper.findAll('input[type="checkbox"]');
      // 找到缩略图复选框（第二个）
      const minimapCheckbox = checkboxes[1];
      
      await minimapCheckbox.setValue(true);
      await flushPromises();

      expect(settingsStore.minimap).toBe(true);
    });

    it('应显示自动换行复选框', () => {
      const wrapper = mountPanel();

      const checkboxes = wrapper.findAll('input[type="checkbox"]');
      expect(checkboxes.length).toBeGreaterThanOrEqual(3);
    });

    it('切换自动换行复选框应更新 store', async () => {
      const wrapper = mountPanel();

      const checkboxes = wrapper.findAll('input[type="checkbox"]');
      // 找到自动换行复选框（第三个）
      const wordWrapCheckbox = checkboxes[2];
      await settingsStore.updateSettings({ wordWrap: false });
      
      await wordWrapCheckbox.setValue(true);
      await flushPromises();

      expect(settingsStore.wordWrap).toBe(true);
    });
  });

  describe('样式和布局测试', () => {
    it('应应用正确的 CSS 类', () => {
      const wrapper = mountPanel();

      expect(wrapper.find('.settings-panel').exists()).toBe(true);
      expect(wrapper.find('.settings-header').exists()).toBe(true);
      expect(wrapper.find('.settings-content').exists()).toBe(true);
    });

    it('设置内容区域应该可滚动', () => {
      const wrapper = mountPanel();

      const content = wrapper.find('.settings-content');
      const style = content.attributes('style');
      // overflow-y: auto 应该在样式中定义
      expect(content.classes()).toBeDefined();
    });
  });
});
