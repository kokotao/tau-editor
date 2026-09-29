/**
 * @description GitHub 主题市场 catalog 与主题包的拉取、缓存和静态校验服务
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-09-28 22:10
 */

import {
  normalizeHexColor,
  normalizeThemePackageRecord,
  type ThemePackage,
} from '@/utils/themePackage';

export type MarketplacePackageType = 'theme' | 'palette';

export interface ThemeMarketplaceCatalogItem {
  id: string;
  type: MarketplacePackageType;
  name: string;
  version: string;
  author: string;
  license: string;
  file: string;
  preview?: string;
  tags?: string[];
}

export interface ThemeMarketplaceCatalog {
  schemaVersion: 1;
  generatedAt?: string;
  items: ThemeMarketplaceCatalogItem[];
}

export interface ThemeMarketplaceV2Package {
  schemaVersion: 2;
  type: MarketplacePackageType;
  id: string;
  name: string;
  version: string;
  author: string;
  license: string;
  defaultMode?: 'light' | 'dark';
  modes: {
    light?: MarketplaceModePayload;
    dark?: MarketplaceModePayload;
  };
}

export interface MarketplaceModePayload {
  colors: Record<string, string>;
  monaco?: {
    base?: 'vs' | 'vs-dark' | 'hc-black';
    rules?: Array<{ token: string; foreground?: string; fontStyle?: string }>;
    colors?: Record<string, string>;
  };
}

export type ThemeMarketplacePackage = ThemeMarketplaceV2Package | ThemePackage;

export type ThemeMarketplaceErrorCode =
  | 'MARKETPLACE_FETCH_FAILED'
  | 'MARKETPLACE_INVALID_URL'
  | 'MARKETPLACE_INVALID_CATALOG'
  | 'MARKETPLACE_INVALID_PACKAGE'
  | 'MARKETPLACE_CACHE_INVALID';

export interface ThemeMarketplaceError {
  code: ThemeMarketplaceErrorCode;
  message: string;
}

export type ThemeMarketplaceResult<T> =
  | { ok: true; value: T; source: 'network' | 'cache' }
  | { ok: false; error: ThemeMarketplaceError };

export const DEFAULT_THEME_MARKETPLACE_CATALOG_URL =
  'https://raw.githubusercontent.com/kokotao/tau-editor-themes/main/catalog/index.json';
export const THEME_MARKETPLACE_CACHE_KEY = 'tau-editor:theme-marketplace:catalog:v1';
export const THEME_MARKETPLACE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CATALOG_BYTES = 512 * 1024;
const MAX_PACKAGE_BYTES = 256 * 1024;
const HEX_COLOR_KEY_PATTERN = /^[a-zA-Z0-9._-]+$/;
const MONACO_COLOR_KEY_PATTERN = /^[a-zA-Z0-9.[\]#_-]+$/;
const PACKAGE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

interface CachedCatalog {
  catalogUrl: string;
  fetchedAt: number;
  catalog: ThemeMarketplaceCatalog;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface FetchLike {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

function getFetch(fetchImpl?: FetchLike): FetchLike {
  const resolved = fetchImpl ?? globalThis.fetch;
  if (!resolved) {
    throw new Error('当前运行环境不支持 fetch');
  }
  return resolved.bind(globalThis);
}

function getStorage(storage?: StorageLike): StorageLike | undefined {
  return storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
}

function assertRemoteUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MarketplaceServiceException('MARKETPLACE_INVALID_URL', '主题市场地址不是合法 URL');
  }

  if (url.protocol !== 'https:' || url.hostname !== 'raw.githubusercontent.com') {
    throw new MarketplaceServiceException(
      'MARKETPLACE_INVALID_URL',
      '主题市场只允许使用 HTTPS GitHub raw 地址',
    );
  }

  return url;
}

class MarketplaceServiceException extends Error {
  constructor(
    readonly code: ThemeMarketplaceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MarketplaceServiceException';
  }
}

function errorResult<T>(error: unknown, fallbackCode: ThemeMarketplaceErrorCode): ThemeMarketplaceResult<T> {
  if (error instanceof MarketplaceServiceException) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }
  return {
    ok: false,
    error: {
      code: fallbackCode,
      message: error instanceof Error ? error.message : '主题市场请求失败',
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function normalizeCatalog(raw: unknown): ThemeMarketplaceCatalog {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.items)) {
    throw new MarketplaceServiceException('MARKETPLACE_INVALID_CATALOG', 'catalog 必须是 schemaVersion 1 的对象');
  }

  const items = raw.items.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new MarketplaceServiceException('MARKETPLACE_INVALID_CATALOG', `catalog.items[${index}] 不是对象`);
    }

    const type = entry.type === 'theme' || entry.type === 'palette' ? entry.type : null;
    if (
      !type ||
      !validText(entry.id, 64) ||
      !PACKAGE_ID_PATTERN.test(entry.id) ||
      !validText(entry.name, 128) ||
      !validText(entry.version, 32) ||
      !validText(entry.author, 128) ||
      !validText(entry.license, 64) ||
      !validText(entry.file, 256) ||
      entry.file.startsWith('http:') ||
      entry.file.startsWith('javascript:')
    ) {
      throw new MarketplaceServiceException('MARKETPLACE_INVALID_CATALOG', `catalog.items[${index}] 字段不合法`);
    }

    const tags = Array.isArray(entry.tags)
      ? entry.tags.filter((tag): tag is string => typeof tag === 'string' && tag.length <= 32).slice(0, 20)
      : undefined;
    return {
      id: entry.id,
      type,
      name: entry.name,
      version: entry.version,
      author: entry.author,
      license: entry.license,
      file: entry.file,
      preview: typeof entry.preview === 'string' ? entry.preview : undefined,
      tags,
    } satisfies ThemeMarketplaceCatalogItem;
  });

  return {
    schemaVersion: 1,
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : undefined,
    items,
  };
}

function validateModePayload(value: unknown, type: MarketplacePackageType, mode: string): MarketplaceModePayload {
  if (!isRecord(value)) {
    throw new MarketplaceServiceException('MARKETPLACE_INVALID_PACKAGE', `${type}.${mode} 缺少 colors`);
  }

  // palette v2 keeps its compact shape as modes.light/dark color keys;
  // complete themes use { colors, monaco } to leave room for Monaco settings.
  const sourceColors = type === 'palette' && !('colors' in value) ? value : value.colors;
  if (!isRecord(sourceColors)) {
    throw new MarketplaceServiceException('MARKETPLACE_INVALID_PACKAGE', `${type}.${mode} 缺少 colors`);
  }

  const colors: Record<string, string> = {};
  for (const [key, color] of Object.entries(sourceColors)) {
    if (!HEX_COLOR_KEY_PATTERN.test(key) || key.length > 64 || !normalizeHexColor(color)) {
      throw new MarketplaceServiceException('MARKETPLACE_INVALID_PACKAGE', `${type}.${mode}.colors 存在非法颜色`);
    }
    if (type === 'palette' && (key === 'bgApp' || key === 'panelBase')) {
      throw new MarketplaceServiceException('MARKETPLACE_INVALID_PACKAGE', '配色包不能覆盖应用背景或面板背景');
    }
    colors[key] = normalizeHexColor(color) as string;
  }

  if (Object.keys(colors).length > 32) {
    throw new MarketplaceServiceException('MARKETPLACE_INVALID_PACKAGE', '主题颜色数量超过上限');
  }

  return { colors };
}

function normalizeV2Package(raw: unknown): ThemeMarketplaceV2Package {
  if (!isRecord(raw) || raw.schemaVersion !== 2 || (raw.type !== 'theme' && raw.type !== 'palette')) {
    throw new MarketplaceServiceException('MARKETPLACE_INVALID_PACKAGE', '主题包必须是 schemaVersion 2 的 theme 或 palette');
  }
  if (!validText(raw.id, 64) || !PACKAGE_ID_PATTERN.test(raw.id) || !validText(raw.name, 128)) {
    throw new MarketplaceServiceException('MARKETPLACE_INVALID_PACKAGE', '主题包 id 或 name 不合法');
  }
  if (!validText(raw.version, 32) || !validText(raw.author, 128) || !validText(raw.license, 64)) {
    throw new MarketplaceServiceException('MARKETPLACE_INVALID_PACKAGE', '主题包元数据不完整');
  }
  if (!isRecord(raw.modes) || (!raw.modes.light && !raw.modes.dark)) {
    throw new MarketplaceServiceException('MARKETPLACE_INVALID_PACKAGE', '主题包至少需要一个明暗模式');
  }

  const modes: ThemeMarketplaceV2Package['modes'] = {};
  for (const mode of ['light', 'dark'] as const) {
    if (raw.modes[mode]) {
      modes[mode] = validateModePayload(raw.modes[mode], raw.type, mode);
    }
  }
  return {
    schemaVersion: 2,
    type: raw.type,
    id: raw.id,
    name: raw.name,
    version: raw.version,
    author: raw.author,
    license: raw.license,
    defaultMode: raw.defaultMode === 'dark' ? 'dark' : 'light',
    modes,
  };
}

export function validateThemeMarketplacePackage(raw: unknown): ThemeMarketplaceResult<ThemeMarketplacePackage> {
  try {
    if (isRecord(raw) && raw.schemaVersion === 2) {
      return { ok: true, value: normalizeV2Package(raw), source: 'network' };
    }
    const legacy = normalizeThemePackageRecord(raw);
    if (!legacy.ok) {
      throw new MarketplaceServiceException('MARKETPLACE_INVALID_PACKAGE', legacy.error.message);
    }
    return { ok: true, value: legacy.theme, source: 'network' };
  } catch (error) {
    return errorResult(error, 'MARKETPLACE_INVALID_PACKAGE');
  }
}

export class ThemeMarketplaceService {
  constructor(
    private readonly options: {
      fetchImpl?: FetchLike;
      storage?: StorageLike;
      cacheTtlMs?: number;
    } = {},
  ) {}

  async fetchCatalog(catalogUrl = DEFAULT_THEME_MARKETPLACE_CATALOG_URL): Promise<ThemeMarketplaceResult<ThemeMarketplaceCatalog>> {
    try {
      const url = assertRemoteUrl(catalogUrl);
      const fetcher = getFetch(this.options.fetchImpl);
      const response = await fetcher(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const raw = await response.text();
      if (new TextEncoder().encode(raw).length > MAX_CATALOG_BYTES) {
        throw new MarketplaceServiceException('MARKETPLACE_INVALID_CATALOG', 'catalog 超过 512 KB 上限');
      }
      const catalog = normalizeCatalog(JSON.parse(raw));
      this.writeCache(catalogUrl, catalog);
      return { ok: true, value: catalog, source: 'network' };
    } catch (error) {
      const cached = this.readCache(catalogUrl);
      if (cached) return { ok: true, value: cached, source: 'cache' };
      return errorResult(error, 'MARKETPLACE_FETCH_FAILED');
    }
  }

  async fetchPackage(item: ThemeMarketplaceCatalogItem, catalogUrl = DEFAULT_THEME_MARKETPLACE_CATALOG_URL): Promise<ThemeMarketplaceResult<ThemeMarketplacePackage>> {
    try {
      assertRemoteUrl(catalogUrl);
      const catalog = new URL(catalogUrl);
      const packagePath = item.file.replace(/^\/+/, '');
      const packageUrl = new URL(`../${packagePath}`, catalog);
      if (packageUrl.protocol !== 'https:' || packageUrl.hostname !== 'raw.githubusercontent.com') {
        throw new MarketplaceServiceException('MARKETPLACE_INVALID_URL', '主题包地址不是受信任的 GitHub raw 地址');
      }
      const response = await getFetch(this.options.fetchImpl)(packageUrl, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.text();
      if (new TextEncoder().encode(raw).length > MAX_PACKAGE_BYTES) {
        throw new MarketplaceServiceException('MARKETPLACE_INVALID_PACKAGE', '主题包超过 256 KB 上限');
      }
      const parsed = validateThemeMarketplacePackage(JSON.parse(raw));
      if (!parsed.ok) return parsed;
      if (parsed.value.id !== item.id) {
        throw new MarketplaceServiceException('MARKETPLACE_INVALID_PACKAGE', '主题包 id 与 catalog 不一致');
      }
      return { ...parsed, source: 'network' };
    } catch (error) {
      return errorResult(error, 'MARKETPLACE_FETCH_FAILED');
    }
  }

  async fetchPackageSource(item: ThemeMarketplaceCatalogItem, catalogUrl = DEFAULT_THEME_MARKETPLACE_CATALOG_URL): Promise<ThemeMarketplaceResult<string>> {
    try {
      assertRemoteUrl(catalogUrl);
      const catalog = new URL(catalogUrl);
      const packagePath = item.file.replace(/^\/+/, '');
      const packageUrl = new URL(`../${packagePath}`, catalog);
      if (packageUrl.protocol !== 'https:' || packageUrl.hostname !== 'raw.githubusercontent.com') {
        throw new MarketplaceServiceException('MARKETPLACE_INVALID_URL', '主题包地址不是受信任的 GitHub raw 地址');
      }

      const response = await getFetch(this.options.fetchImpl)(packageUrl, {
        headers: { Accept: 'application/json' },
        redirect: 'error',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.text();
      if (new TextEncoder().encode(raw).length > MAX_PACKAGE_BYTES) {
        throw new MarketplaceServiceException('MARKETPLACE_INVALID_PACKAGE', '主题包超过 256 KB 上限');
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        throw new MarketplaceServiceException('MARKETPLACE_INVALID_PACKAGE', '主题包不是合法 JSON');
      }
      const parsedPackage = validateThemeMarketplacePackage(parsedJson);
      if (!parsedPackage.ok) {
        throw new MarketplaceServiceException(parsedPackage.error.code, parsedPackage.error.message);
      }
      if (parsedPackage.value.id !== item.id) {
        throw new MarketplaceServiceException('MARKETPLACE_INVALID_PACKAGE', '主题包 id 与 catalog 不一致');
      }

      return { ok: true, value: raw, source: 'network' };
    } catch (error) {
      return errorResult(error, 'MARKETPLACE_FETCH_FAILED');
    }
  }

  private writeCache(catalogUrl: string, catalog: ThemeMarketplaceCatalog): void {
    try {
      getStorage(this.options.storage)?.setItem(
        THEME_MARKETPLACE_CACHE_KEY,
        JSON.stringify({ catalogUrl, fetchedAt: Date.now(), catalog } satisfies CachedCatalog),
      );
    } catch {
      // 缓存失败不影响网络获取结果。
    }
  }

  private readCache(catalogUrl: string): ThemeMarketplaceCatalog | undefined {
    try {
      const raw = getStorage(this.options.storage)?.getItem(THEME_MARKETPLACE_CACHE_KEY);
      if (!raw) return undefined;
      const cached = JSON.parse(raw) as CachedCatalog;
      if (cached.catalogUrl !== catalogUrl || Date.now() - cached.fetchedAt > (this.options.cacheTtlMs ?? THEME_MARKETPLACE_CACHE_TTL_MS)) {
        return undefined;
      }
      return normalizeCatalog(cached.catalog).items ? cached.catalog : undefined;
    } catch {
      return undefined;
    }
  }
}

export const themeMarketplaceService = new ThemeMarketplaceService();
