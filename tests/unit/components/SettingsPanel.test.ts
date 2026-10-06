import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
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

vi.mock('@/lib/tauri', () => ({
  settingsCommands: {
    getAutoSaveInterval: vi.fn().mockResolvedValue(30),
    setAutoSaveEnabled: vi.fn().mockResolvedValue(undefined),
    setAutoSaveInterval: vi.fn().mockResolvedValue(undefined),
    getAppVersionInfo: vi.fn().mockResolvedValue({
      version: '0.2.0',
      os: 'linux',
      arch: 'x86_64',
      buildTarget: 'x86_64-linux',
      homepageUrl: 'https://github.com/kokotao/tau-editor',
    }),
    checkGithubUpdate: vi.fn().mockResolvedValue({
      currentVersion: '0.2.0',
      latestVersion: '0.2.0',
      hasUpdate: false,
      releaseName: 'v0.2.0',
      releaseNotes: '',
      releaseUrl: 'https://github.com/kokotao/tau-editor/releases/tag/v0.2.0',
      publishedAt: null,
      selectedAsset: null,
      device: { os: 'linux', arch: 'x86_64' },
      repositoryUrl: 'https://github.com/kokotao/tau-editor',
    }),
    downloadAndInstallUpdate: vi.fn().mockResolvedValue({
      downloadedPath: '/tmp/installer',
      launched: true,
      message: 'ok',
    }),
  },
  appCommands: {
    openProjectHomepage: vi.fn().mockResolvedValue(undefined),
    openExternalLink: vi.fn().mockResolvedValue(undefined),
  },
  TauriError: class TauriError extends Error {
    static fromError(error: unknown) {
      return error instanceof Error ? error : new TauriError(String(error));
    }
  },
}));

vi.mock('@/services/markdownRenderService', () => ({
  renderMarkdown: vi.fn(() => '<h1>新版本</h1><ul><li>支持 Markdown 更新说明</li></ul>'),
}));

import SettingsPanel from '@/components/editor/SettingsPanel.vue';
import { settingsCommands } from '@/lib/tauri';
import { useSettingsStore } from '@/stores/settings';

describe('SettingsPanel', () => {
  let pinia: ReturnType<typeof createPinia>;
  let settingsStore: ReturnType<typeof useSettingsStore>;

  const mountPanel = (
    props: Partial<{
      mode: 'workspace' | 'drawer';
      activeCategory: 'general' | 'themes' | 'editor' | 'updates' | 'about';
    }> = {},
  ) => mount(SettingsPanel, {
    props,
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
    settingsStore.$reset();
    await flushPromises();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('workspace 模式默认渲染导航与通用分类', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.find('[data-testid="settings-workspace"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-nav-general"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-nav-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-general-section"]').exists()).toBe(true);
  });

  it('通用设置可调整界面字体家族与大小', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    const fontFamilySelect = wrapper.findComponent('[data-testid="select-ui-font-family"]');
    expect(fontFamilySelect.exists()).toBe(true);
    fontFamilySelect.vm.$emit('update:value', "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif");
    await flushPromises();

    await wrapper.find('[data-testid="increase-ui-font-btn"]').trigger('click');
    await flushPromises();

    expect(settingsStore.uiFontFamily).toBe("system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif");
    expect(settingsStore.uiFontSize).toBe(12);
    expect(document.documentElement.style.getPropertyValue('--font-size-ui-base')).toBe('12px');
  });

  it('点击导航可切换到更新分类', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    await wrapper.find('[data-testid="settings-nav-updates"]').trigger('click');
    await flushPromises();

    const emitted = wrapper.emitted('update:activeCategory');
    expect(emitted?.[0]).toEqual(['updates']);

    await wrapper.setProps({ activeCategory: 'updates' });
    await flushPromises();
    expect(wrapper.find('[data-testid="settings-update-section"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-general-section"]').exists()).toBe(false);
  });

  it('更新说明按 Markdown 渲染而不是显示原始标记', async () => {
    vi.mocked(settingsCommands.checkGithubUpdate).mockResolvedValueOnce({
      currentVersion: '0.2.0',
      latestVersion: '0.3.0',
      hasUpdate: true,
      releaseName: 'v0.3.0',
      releaseNotes: '# 新版本\n\n- 支持 Markdown 更新说明',
      releaseUrl: 'https://github.com/kokotao/tau-editor/releases/tag/v0.3.0',
      publishedAt: null,
      selectedAsset: null,
      device: { os: 'linux', arch: 'x86_64' },
      repositoryUrl: 'https://github.com/kokotao/tau-editor',
    });

    const wrapper = mountPanel({ activeCategory: 'updates' });
    await flushPromises();

    const notes = wrapper.find('[data-testid="settings-release-notes"]');
    expect(notes.exists()).toBe(true);
    expect(notes.find('h1').text()).toBe('新版本');
    expect(notes.find('li').text()).toBe('支持 Markdown 更新说明');
    expect(notes.text()).not.toContain('# 新版本');
  });

  it('主题市场作为独立栏目展示，并提供圆角与界面颜色配置', async () => {
    const wrapper = mountPanel({ activeCategory: 'themes' });
    await flushPromises();

    expect(wrapper.find('[data-testid="settings-nav-themes"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-themes-section"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="theme-ui-settings"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="corner-radius-slider"]').exists()).toBe(true);

    await wrapper.find('[data-testid="corner-radius-preset-round"]').trigger('click');
    expect(settingsStore.cornerRadius).toBe(12);
  });

  it('drawer 模式仅展示快速设置与完整设置入口', async () => {
    const wrapper = mountPanel({ mode: 'drawer' });
    await flushPromises();

    expect(wrapper.find('[data-testid="settings-quick-drawer"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-nav"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-update-section"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-author-section"]').exists()).toBe(false);
  });

  it('drawer 的进入完整设置按钮应触发 open-workspace 事件', async () => {
    const wrapper = mountPanel({ mode: 'drawer' });
    await flushPromises();

    await wrapper.find('[data-testid="open-full-settings-btn"]').trigger('click');
    expect(wrapper.emitted('open-workspace')).toHaveLength(1);
  });

  it('drawer 快速设置可调整界面字体', async () => {
    const wrapper = mountPanel({ mode: 'drawer' });
    await flushPromises();

    expect(wrapper.find('[data-testid="drawer-select-ui-font-family"]').exists()).toBe(true);
    await wrapper.find('[data-testid="drawer-decrease-ui-font-btn"]').trigger('click');
    await flushPromises();

    expect(settingsStore.uiFontSize).toBe(10);
  });

  it('关闭按钮应触发 close 事件', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    await wrapper.find('[data-testid="settings-close-btn"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('drawer 高频项应能更新主题风格与自动保存', async () => {
    const wrapper = mountPanel({ mode: 'drawer' });
    await flushPromises();

    const themeSkinSelect = wrapper.findComponent('[data-testid="drawer-select-theme-skin"]');
    expect(themeSkinSelect.exists()).toBe(true);
    themeSkinSelect.vm.$emit('update:value', 'forest-moss');
    await flushPromises();
    expect(settingsStore.themeSkin).toBe('forest-moss');

    const autoSaveToggle = wrapper.find('[data-testid="drawer-toggle-auto-save"]');
    await autoSaveToggle.setValue(false);
    await flushPromises();
    expect(settingsStore.autoSaveEnabled).toBe(false);
  });

  it('通用设置展示当前模式色块，并移除背景自定义字段', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.find('[data-testid="theme-swatch-grid"]').exists()).toBe(true);
    expect(wrapper.findAll('.theme-swatch')).toHaveLength(10);
    expect(wrapper.find('[data-testid="custom-color-bgApp"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="custom-color-panelBase"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="custom-color-textPrimary"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="theme-json-examples"]').exists()).toBe(true);
  });

  it('点击主题色块应同时切换明暗模式与主题风格', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    const forestSwatch = wrapper.find('[data-testid="theme-swatch-dark-forest-moss"]');
    expect(forestSwatch.exists()).toBe(true);
    await forestSwatch.trigger('click');
    await flushPromises();
    expect(settingsStore.theme).toBe('dark');
    expect(settingsStore.themeSkin).toBe('forest-moss');
  });

  it('about 分类应展示作者信息', async () => {
    const wrapper = mountPanel({ activeCategory: 'about' });
    await flushPromises();

    expect(wrapper.find('[data-testid="settings-author-section"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('albert_luo');
    expect(wrapper.text()).toContain('https://github.com/kokotao/tau-editor');
  });

  it('editor 分类应支持配置标签上限与内存上限', async () => {
    const wrapper = mountPanel({ activeCategory: 'editor' });
    await flushPromises();

    const maxOpenTabsSelect = wrapper.find('[data-testid="select-max-open-tabs"]');
    const memoryLimitSelect = wrapper.find('[data-testid="select-memory-limit"]');
    expect(maxOpenTabsSelect.exists()).toBe(true);
    expect(memoryLimitSelect.exists()).toBe(true);
    expect(settingsStore.maxOpenTabs).toBe(30);
    expect(settingsStore.memoryLimitMB).toBe(256);
  });

  it('editor 分类应展示 Markdown 预览主题选择器并默认选中文档站清朗', async () => {
    const wrapper = mountPanel({ activeCategory: 'editor' });
    await flushPromises();

    const markdownPreviewThemeSelect = wrapper.find('[data-testid="select-markdown-preview-theme"]');
    expect(markdownPreviewThemeSelect.exists()).toBe(true);
    expect(settingsStore.markdownPreviewTheme).toBe('docs-clean');
    expect(wrapper.text()).toContain('Markdown 预览主题');
    expect(wrapper.text()).toContain('文档站清朗');
  });

  it('切换 Markdown 预览主题选择器后应更新 store', async () => {
    const wrapper = mountPanel({ activeCategory: 'editor' });
    await flushPromises();

    const markdownPreviewThemeSelect = wrapper.findComponent('[data-testid="select-markdown-preview-theme"]');
    markdownPreviewThemeSelect.vm.$emit('update:value', 'graphite-night');
    await flushPromises();

    expect(settingsStore.markdownPreviewTheme).toBe('graphite-night');
  });
});
