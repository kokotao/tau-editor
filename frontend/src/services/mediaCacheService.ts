export const MEDIA_CACHE_NAME = 'tau-media-v1';
export const MEDIA_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CACHED_AT_HEADER = 'x-tau-cached-at';

type MediaCache = Cache;

export interface MediaCacheStats {
  count: number;
  bytes: number;
}

export interface MediaCacheDependencies {
  openCache?: () => Promise<MediaCache>;
  cacheStorage?: CacheStorage;
  fetch?: typeof fetch;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectUrls?: () => void;
  now?: number;
}

export interface MediaCacheMaintenanceDependencies extends MediaCacheDependencies {
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
  tidy?: () => Promise<number>;
}

let objectUrls = new Map<string, string>();
let pendingLoads = new Map<string, Promise<string>>();
let cacheGeneration = 0;

const defaultOpenCache = async (): Promise<MediaCache> => caches.open(MEDIA_CACHE_NAME);
const openCache = (deps: MediaCacheDependencies = {}) =>
  (deps.openCache ?? defaultOpenCache)();

export function isWebpTranscodeCandidate(source: string): boolean {
  try {
    const url = new URL(source);
    return /^https?:$/.test(url.protocol) && /\.(?:png|jpe?g)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

async function toWebp(blob: Blob): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function') return null;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(bitmap.width, bitmap.height)
      : Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    const result = 'convertToBlob' in canvas
      ? await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 })
      : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
    return result?.type === 'image/webp' && result.size < blob.size ? result : null;
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

function getObjectUrl(key: string, blob: Blob, deps: MediaCacheDependencies): string {
  const existing = objectUrls.get(key);
  if (existing) return existing;
  const create = deps.createObjectURL ?? URL.createObjectURL.bind(URL);
  const url = create(blob);
  objectUrls.set(key, url);
  return url;
}

export function releaseMediaObjectUrl(source: string): void {
  const url = objectUrls.get(source);
  if (!url) return;
  URL.revokeObjectURL(url);
  objectUrls.delete(source);
}

/** Loads a remote image into the offline cache and returns a displayable object URL. */
export async function resolveMediaSource(
  source: string,
  options: { transcodeWebp?: boolean } = {},
  deps: MediaCacheDependencies = {},
): Promise<string> {
  if (!/^https?:\/\//i.test(source) || typeof (deps.fetch ?? globalThis.fetch) !== 'function') return source;
  const existing = objectUrls.get(source);
  if (existing) return existing;
  const pending = pendingLoads.get(source);
  if (pending) return pending;
  const generation = cacheGeneration;

  const task = (async () => {
    try {
      const cache = await openCache(deps);
      const cached = await cache.match(source);
      if (cached) return getObjectUrl(source, await cached.blob(), deps);

      const response = await (deps.fetch ?? globalThis.fetch)(source, { mode: 'cors' });
      if (!response.ok) return source;
      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
      if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(contentType)) return source;
      const original = await response.blob();
      const canTranscode = options.transcodeWebp !== false && isWebpTranscodeCandidate(source)
        && contentType !== 'image/gif' && contentType !== 'image/webp';
      const converted = canTranscode ? await toWebp(original) : null;
      const stored = converted ?? original;
      const headers = new Headers(response.headers);
      headers.set('content-type', stored.type || contentType);
      headers.set(CACHED_AT_HEADER, String(deps.now ?? Date.now()));
      if (generation === cacheGeneration) {
        await cache.put(source, new Response(stored, { status: 200, headers }));
      }
      return getObjectUrl(source, stored, deps);
    } catch {
      return source;
    }
  })();
  pendingLoads.set(source, task);
  try {
    return await task;
  } finally {
    pendingLoads.delete(source);
  }
}

export async function getMediaCacheStats(deps: MediaCacheDependencies = {}): Promise<MediaCacheStats> {
  if (!deps.openCache && typeof caches === 'undefined') return { count: 0, bytes: 0 };
  try {
    const cache = await openCache(deps);
    const keys = await cache.keys();
    const sizes = await Promise.all(keys.map(async (request) => {
      const response = await cache.match(request);
      return response ? (await response.clone().arrayBuffer()).byteLength : 0;
    }));
    return { count: sizes.length, bytes: sizes.reduce((sum, size) => sum + size, 0) };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

export async function tidyMediaCache(deps: MediaCacheDependencies = {}): Promise<number> {
  if (!deps.openCache && typeof caches === 'undefined') return 0;
  if (!deps.openCache && !(await caches.keys()).includes(MEDIA_CACHE_NAME)) return 0;
  const cache = await openCache(deps);
  const now = deps.now ?? Date.now();
  let removed = 0;
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    const cachedAt = Number(response?.headers.get(CACHED_AT_HEADER));
    if (!Number.isFinite(cachedAt) || now - cachedAt > MEDIA_CACHE_MAX_AGE_MS) {
      if (await cache.delete(request)) removed += 1;
      const url = objectUrls.get(request.url);
      if (url) URL.revokeObjectURL(url);
      objectUrls.delete(request.url);
    }
  }
  return removed;
}

export async function clearMediaCache(deps: MediaCacheDependencies = {}): Promise<number> {
  cacheGeneration += 1;
  const storage = deps.cacheStorage ?? (typeof caches === 'undefined' ? undefined : caches);
  if (!storage) return 0;
  const bucketNames = await storage.keys();
  const exists = bucketNames.includes(MEDIA_CACHE_NAME);
  if (!exists) return 0;
  let count = 0;
  try {
    const cache = await openCache(deps);
    count = (await cache.keys()).length;
  } catch {
    return 0;
  }
  return await storage.delete(MEDIA_CACHE_NAME) ? count : 0;
}

/** Starts daily expired-entry cleanup and returns a function that stops the timer. */
export function startMediaCacheMaintenance(
  deps: MediaCacheMaintenanceDependencies = {},
  intervalMs = 24 * 60 * 60 * 1000,
): () => void {
  if (!deps.cacheStorage && typeof caches === 'undefined') return () => undefined;
  const start = deps.setInterval ?? globalThis.setInterval;
  const stop = deps.clearInterval ?? globalThis.clearInterval;
  void (deps.tidy ?? (() => tidyMediaCache(deps)))().catch(() => undefined);
  const timer = start(() => {
    void (deps.tidy ?? (() => tidyMediaCache(deps)))().catch(() => undefined);
  }, intervalMs);
  return () => stop(timer);
}
