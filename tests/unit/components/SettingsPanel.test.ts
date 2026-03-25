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

import SettingsPanel from '@/components/editor/SettingsPanel.vue';
import { useSettingsStore } from '@/stores/settings';

describe('SettingsPanel', () => {
  let pinia: ReturnType<typeof createPinia>;
  let settingsStore: ReturnType<typeof useSettingsStore>;

  const mountPanel = (
    props: Partial<{
      mode: 'workspace' | 'drawer';
      activeCategory: 'general' | 'editor' | 'updates' | 'about';
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

  it('关闭按钮应触发 close 事件', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    await wrapper.find('[data-testid="settings-close-btn"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('drawer 高频项应能更新主题与自动保存', async () => {
    const wrapper = mountPanel({ mode: 'drawer' });
    await flushPromises();

    await wrapper.findAll('.theme-btn')[0]?.trigger('click');
    expect(settingsStore.theme).toBe('light');

    const themeSkinSelect = wrapper.find('[data-testid="drawer-select-theme-skin"]');
    expect(themeSkinSelect.exists()).toBe(true);

    const autoSaveToggle = wrapper.find('[data-testid="drawer-toggle-auto-save"]');
    await autoSaveToggle.setValue(false);
    await flushPromises();
    expect(settingsStore.autoSaveEnabled).toBe(false);
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
});
