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

  it('returns validated original source text for a catalog item', async () => {
    const raw = JSON.stringify(themeJson, null, 2);
    const item = {
      id: 'ocean-mist',
      type: 'theme' as const,
      name: 'Ocean Mist',
      version: '1.0.0',
      author: 'Tau',
      license: 'MIT',
      file: 'themes/ocean-mist.json',
    };
    const fetchImpl = vi.fn(async () => new Response(raw, { status: 200 }));
    const service = new ThemeMarketplaceService({ fetchImpl });

    const result = await service.fetchPackageSource(item);

    expect(result).toEqual({ ok: true, value: raw, source: 'network' });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      'https://raw.githubusercontent.com/kokotao/tau-editor-themes/main/themes/ocean-mist.json',
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      headers: { Accept: 'application/json' },
      redirect: 'error',
    });
  });

  it('rejects source text when package JSON is invalid or id does not match', async () => {
    const item = {
      id: 'ocean-mist',
      type: 'theme' as const,
      name: 'Ocean Mist',
      version: '1.0.0',
      author: 'Tau',
      license: 'MIT',
      file: 'themes/ocean-mist.json',
    };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ...themeJson, id: 'other-theme' }), { status: 200 }));
    const service = new ThemeMarketplaceService({ fetchImpl });

    const result = await service.fetchPackageSource(item);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('MARKETPLACE_INVALID_PACKAGE');
  });

  it('enforces the 256 KB source limit before validating JSON', async () => {
    const item = {
      id: 'ocean-mist',
      type: 'theme' as const,
      name: 'Ocean Mist',
      version: '1.0.0',
      author: 'Tau',
      license: 'MIT',
      file: 'themes/ocean-mist.json',
    };
    const oversized = `${JSON.stringify(themeJson)}${' '.repeat(256 * 1024)}`;
    const service = new ThemeMarketplaceService({ fetchImpl: vi.fn(async () => new Response(oversized, { status: 200 })) });

    const result = await service.fetchPackageSource(item);

    expect(result).toMatchObject({ ok: false, error: { code: 'MARKETPLACE_INVALID_PACKAGE' } });
  });
});
