import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MEDIA_CACHE_MAX_AGE_MS,
  MEDIA_CACHE_NAME,
  clearMediaCache,
  getMediaCacheStats,
  isWebpTranscodeCandidate,
  releaseMediaObjectUrl,
  resolveMediaSource,
  startMediaCacheMaintenance,
  tidyMediaCache,
} from '@/services/mediaCacheService';

function makeCache(entries: Array<[string, Response]> = []) {
  const values = new Map(entries);
  return {
    values,
    keys: async () => [...values.keys()].map((url) => new Request(url)),
    match: async (request: Request) => values.get(request.url),
    put: async (request: Request, response: Response) => { values.set(request.url, response); },
    delete: async (request: Request) => values.delete(request.url),
  };
}

describe('mediaCacheService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('only transcodes PNG and JPEG source URLs', () => {
    expect(isWebpTranscodeCandidate('https://cdn.example/a.png')).toBe(true);
    expect(isWebpTranscodeCandidate('https://cdn.example/a.JPEG?size=2')).toBe(true);
    expect(isWebpTranscodeCandidate('https://cdn.example/a.gif')).toBe(false);
    expect(isWebpTranscodeCandidate('https://cdn.example/a.webp')).toBe(false);
    expect(isWebpTranscodeCandidate('https://cdn.example/a.svg')).toBe(false);
  });

  it('reports entry count and byte size from the media cache', async () => {
    const cache = makeCache([
      ['https://cdn.example/a.png', new Response(new Uint8Array(5))],
      ['https://cdn.example/b.jpg', new Response(new Uint8Array(7))],
    ]);
    const stats = await getMediaCacheStats({ openCache: async () => cache as never });
    expect(stats).toEqual({ count: 2, bytes: 12 });
  });

  it('clears only the Tau media cache bucket', async () => {
    const cache = makeCache([['https://cdn.example/a.png', new Response('image')]]);
    const deleteBucket = vi.fn(async () => true);
    const revokeObjectUrls = vi.fn();
    const removed = await clearMediaCache({
      cacheStorage: { keys: async () => [MEDIA_CACHE_NAME, 'unrelated-cache'], delete: deleteBucket } as never,
      openCache: async () => cache as never,
      revokeObjectUrls,
    });
    expect(removed).toBe(1);
    expect(revokeObjectUrls).not.toHaveBeenCalled();
    expect(deleteBucket).toHaveBeenCalledTimes(1);
    expect(deleteBucket).toHaveBeenCalledWith(MEDIA_CACHE_NAME);
  });

  it('returns zero without a media cache bucket', async () => {
    const deleteBucket = vi.fn(async () => true);
    const removed = await clearMediaCache({
      cacheStorage: { keys: async () => ['unrelated-cache'], delete: deleteBucket } as never,
      openCache: async () => makeCache() as never,
    });
    expect(removed).toBe(0);
    expect(deleteBucket).not.toHaveBeenCalled();
  });

  it('returns the original URL when remote loading fails', async () => {
    const source = 'https://cdn.example/missing.png';
    const result = await resolveMediaSource(source, {}, {
      openCache: async () => makeCache() as never,
      fetch: vi.fn().mockRejectedValue(new Error('offline')) as typeof fetch,
    });
    expect(result).toBe(source);
  });

  it('releases an individual cached object URL by source URL', async () => {
    const source = 'https://cdn.example/a.gif';
    const objectUrl = 'blob:media-cache-test';
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const result = await resolveMediaSource(source, {}, {
      openCache: async () => makeCache() as never,
      fetch: vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), {
        headers: { 'content-type': 'image/gif' },
      })) as typeof fetch,
      createObjectURL: () => objectUrl,
    });
    expect(result).toBe(objectUrl);
    releaseMediaObjectUrl(source);
    expect(revoke).toHaveBeenCalledWith(objectUrl);
    revoke.mockRestore();
  });

  it('does not write a pending image into the cache after cache clearing', async () => {
    const source = 'https://cdn.example/pending.gif';
    const cache = makeCache();
    const put = vi.spyOn(cache, 'put');
    let finishFetch!: (response: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => { finishFetch = resolve; });
    const load = resolveMediaSource(source, {}, {
      openCache: async () => cache as never,
      fetch: vi.fn(() => pendingResponse) as typeof fetch,
      createObjectURL: () => 'blob:pending-media',
    });
    await Promise.resolve();
    await Promise.resolve();

    await clearMediaCache({
      cacheStorage: { keys: async () => [MEDIA_CACHE_NAME], delete: async () => true } as never,
      openCache: async () => cache as never,
    });
    finishFetch(new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/gif' } }));

    expect(await load).toBe('blob:pending-media');
    expect(put).not.toHaveBeenCalled();
  });

  it('keeps currently displayed object URLs alive when clearing persistent media', async () => {
    const source = 'https://cdn.example/displayed.gif';
    const objectUrl = 'blob:displayed-media';
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    await resolveMediaSource(source, {}, {
      openCache: async () => makeCache() as never,
      fetch: vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), {
        headers: { 'content-type': 'image/gif' },
      })) as typeof fetch,
      createObjectURL: () => objectUrl,
    });
    await clearMediaCache({
      cacheStorage: { keys: async () => [MEDIA_CACHE_NAME], delete: async () => true } as never,
      openCache: async () => makeCache() as never,
    });
    expect(revoke).not.toHaveBeenCalledWith(objectUrl);
    releaseMediaObjectUrl(source);
    expect(revoke).toHaveBeenCalledWith(objectUrl);
    revoke.mockRestore();
  });

  it('starts daily cleanup and returns a timer disposer', async () => {
    let callback: (() => void) | undefined;
    const tidy = vi.fn(async () => 0);
    const clearTimer = vi.fn();
    const stop = startMediaCacheMaintenance({
      cacheStorage: { keys: async () => [] } as never,
      setInterval: ((fn: () => void, delay: number) => {
        expect(delay).toBe(24 * 60 * 60 * 1000);
        callback = fn;
        return 17 as never;
      }) as never,
      clearInterval: clearTimer as never,
      tidy,
    });
    expect(tidy).toHaveBeenCalledOnce();
    callback?.();
    await Promise.resolve();
    expect(tidy).toHaveBeenCalledTimes(2);
    stop();
    expect(clearTimer).toHaveBeenCalledWith(17);
  });

  it('removes expired entries and preserves fresh entries', async () => {
    const now = Date.now();
    const old = new Response('old', { headers: { 'x-tau-cached-at': String(now - MEDIA_CACHE_MAX_AGE_MS - 1) } });
    const fresh = new Response('fresh', { headers: { 'x-tau-cached-at': String(now) } });
    const cache = makeCache([
      ['https://cdn.example/old.png', old],
      ['https://cdn.example/fresh.png', fresh],
    ]);
    const removed = await tidyMediaCache({ openCache: async () => cache as never, now });
    expect(removed).toBe(1);
    expect(cache.values.has('https://cdn.example/old.png')).toBe(false);
    expect(cache.values.has('https://cdn.example/fresh.png')).toBe(true);
  });
});
