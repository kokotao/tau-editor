import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

const fetchCatalogMock = vi.fn();

vi.mock('@/services/themeMarketplaceService', async () => {
  const actual = await vi.importActual<typeof import('@/services/themeMarketplaceService')>('@/services/themeMarketplaceService');
  return {
    ...actual,
    ThemeMarketplaceService: class {
      fetchCatalog = fetchCatalogMock;
      fetchPackage = vi.fn();
    },
  };
});

import ThemeMarketplacePanel from '@/components/editor/ThemeMarketplacePanel.vue';

describe('ThemeMarketplacePanel', () => {
  it('为每个主题渲染具体的编辑器样式预览', async () => {
    fetchCatalogMock.mockResolvedValueOnce({
      ok: true,
      source: 'network',
      value: {
        schemaVersion: 1,
        items: [
          {
            id: 'ocean-mist',
            type: 'theme',
            name: 'Ocean Mist',
            version: '1.0.0',
            author: 'Tau',
            license: 'MIT',
            file: 'themes/ocean-mist.json',
            tags: ['blue', 'dark'],
          },
          {
            id: 'rose-quartz',
            type: 'theme',
            name: 'Rose Quartz',
            version: '1.0.0',
            author: 'Tau',
            license: 'MIT',
            file: 'themes/rose-quartz.json',
            preview: 'previews/rose-quartz.png',
            tags: ['rose', 'pink'],
          },
        ],
      },
    });

    const wrapper = mount(ThemeMarketplacePanel, {
      props: {
        autoLoad: false,
        catalogUrl: 'https://raw.githubusercontent.com/kokotao/tau-editor-themes/main/catalog/index.json',
      },
    });

    await (wrapper.vm as unknown as { loadCatalog: () => Promise<void> }).loadCatalog();
    await flushPromises();

    const previews = wrapper.findAll('[data-testid="theme-marketplace-preview"]');
    expect(previews).toHaveLength(2);
    expect(previews[0]?.find('.theme-preview-fallback').exists()).toBe(true);
    expect(previews[0]?.find('.theme-preview-titlebar').exists()).toBe(true);
    expect(previews[0]?.find('.theme-preview-tabs').exists()).toBe(true);
    expect(previews[0]?.find('.theme-preview-breadcrumbs').exists()).toBe(true);
    expect(previews[0]?.find('.theme-preview-breadcrumbs').text()).toContain('workspace.md');
    expect(previews[0]?.attributes('style')).toContain('--preview-accent');
    expect(previews[1]?.find('img').attributes('src')).toBe(
      'https://raw.githubusercontent.com/kokotao/tau-editor-themes/main/previews/rose-quartz.png',
    );
  });

  it('远程预览图加载失败时回退到具体编辑器样式', async () => {
    fetchCatalogMock.mockResolvedValueOnce({
      ok: true,
      source: 'network',
      value: {
        schemaVersion: 1,
        items: [{
          id: 'paper-light',
          type: 'palette',
          name: 'Paper Light',
          version: '1.0.0',
          author: 'Tau',
          license: 'MIT',
          file: 'palettes/paper-light.json',
          preview: 'previews/paper-light.png',
          tags: ['paper', 'light'],
        }],
      },
    });

    const wrapper = mount(ThemeMarketplacePanel, { props: { autoLoad: false } });
    await (wrapper.vm as unknown as { loadCatalog: () => Promise<void> }).loadCatalog();
    await flushPromises();

    const preview = wrapper.find('[data-testid="theme-marketplace-preview"]');
    await preview.find('img').trigger('error');
    await flushPromises();

    expect(preview.find('img').exists()).toBe(false);
    expect(preview.find('.theme-preview-fallback').exists()).toBe(true);
    expect(preview.text()).toContain('Paper Light');
  });

  it('点击主题卡片源码箭头时发出 view-source 事件而不是打开仓库', async () => {
    fetchCatalogMock.mockResolvedValueOnce({
      ok: true,
      source: 'network',
      value: {
        schemaVersion: 1,
        items: [{
          id: 'desert-sunset',
          type: 'theme',
          name: 'Desert Sunset',
          version: '1.0.0',
          author: 'Tau',
          license: 'MIT',
          file: 'themes/desert-sunset.json',
        }],
      },
    });

    const wrapper = mount(ThemeMarketplacePanel, { props: { autoLoad: false } });
    await (wrapper.vm as unknown as { loadCatalog: () => Promise<void> }).loadCatalog();
    await flushPromises();

    await wrapper.find('.theme-marketplace-icon-button').trigger('click');

    expect(wrapper.emitted('view-source')).toEqual([[{
      item: expect.objectContaining({ id: 'desert-sunset', name: 'Desert Sunset' }),
    }]]);
  });
});
