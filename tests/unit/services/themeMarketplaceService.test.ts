import {
  DEFAULT_THEME_MARKETPLACE_CATALOG_URL,
  ThemeMarketplaceService,
  validateThemeMarketplacePackage,
} from '@/services/themeMarketplaceService';

const themeJson = {
  schemaVersion: 2,
  type: 'theme',
  id: 'ocean-mist',
  name: 'Ocean Mist',
  version: '1.0.0',
  author: 'Tau',
  license: 'MIT',
  modes: {
    light: { colors: { bgApp: '#ffffff', panelBase: '#f6f8ff', textPrimary: '#162033' } },
    dark: { colors: { bgApp: '#101216', panelBase: '#171b24', textPrimary: '#edf1f8' } },
  },
};

describe('themeMarketplaceService', () => {
  it('validates v2 theme and rejects palette background overrides', () => {
    expect(validateThemeMarketplacePackage(themeJson).ok).toBe(true);
    expect(
      validateThemeMarketplacePackage({
        ...themeJson,
        type: 'palette',
        modes: { light: { bgApp: '#fff' } },
      }).ok,
    ).toBe(false);
  });

  it('loads catalog and package from GitHub raw URLs', async () => {
    const responses = new Map([
      [DEFAULT_THEME_MARKETPLACE_CATALOG_URL, JSON.stringify({ schemaVersion: 1, items: [{ id: 'ocean-mist', type: 'theme', name: 'Ocean Mist', version: '1.0.0', author: 'Tau', license: 'MIT', file: 'themes/ocean-mist.json' }] })],
      ['https://raw.githubusercontent.com/kokotao/tau-editor-themes/main/themes/ocean-mist.json', JSON.stringify(themeJson)],
    ]);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const body = responses.get(String(input));
      return new Response(body ?? 'not found', { status: body ? 200 : 404 });
    });
    const service = new ThemeMarketplaceService({ fetchImpl });
    const catalog = await service.fetchCatalog();
    expect(catalog.ok && catalog.value.items).toHaveLength(1);
    if (!catalog.ok) return;
    const pkg = await service.fetchPackage(catalog.value.items[0]);
    expect(pkg.ok && pkg.value.id).toBe('ocean-mist');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('uses a recent cached catalog when network fails', async () => {
    const storage = new Map<string, string>();
    const storageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };
    const catalog = { schemaVersion: 1 as const, items: [] };
    storage.set('tau-editor:theme-marketplace:catalog:v1', JSON.stringify({ catalogUrl: DEFAULT_THEME_MARKETPLACE_CATALOG_URL, fetchedAt: Date.now(), catalog }));
    const service = new ThemeMarketplaceService({ storage: storageLike, fetchImpl: vi.fn(async () => new Response('', { status: 503 })) });
    const result = await service.fetchCatalog();
    expect(result).toMatchObject({ ok: true, source: 'cache', value: catalog });
  });
});
