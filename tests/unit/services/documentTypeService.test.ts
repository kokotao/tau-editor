import { describe, expect, it } from 'vitest';
import {
  getKnownMindMapExtensions,
  isAmbiguousMapPath,
  isMindMapPath,
  isOpmlPath,
  isTaumapPath,
} from '@/services/documentTypeService';

describe('documentTypeService', () => {
  it('isTaumapPath 识别 .taumap', () => {
    expect(isTaumapPath('/data/a.taumap')).toBe(true);
    expect(isTaumapPath('a.TAUMAP')).toBe(true);
    expect(isTaumapPath('a.txt')).toBe(false);
    expect(isTaumapPath(null)).toBe(false);
  });

  it('isMindMapPath 识别已知地图扩展名', () => {
    expect(isMindMapPath('a.taumap')).toBe(true);
    expect(isMindMapPath('a.xmind')).toBe(true);
    expect(isMindMapPath('a.mm')).toBe(true);
    expect(isMindMapPath('a.mmap')).toBe(true);
    expect(isMindMapPath('a.opml')).toBe(true);
  });

  it('isMindMapPath 不含歧义 .map（避免静默识别）', () => {
    expect(isMindMapPath('a.map')).toBe(false);
    expect(isAmbiguousMapPath('a.map')).toBe(true);
    expect(isAmbiguousMapPath('a.taumap')).toBe(false);
  });

  it('isOpmlPath 识别 .opml', () => {
    expect(isOpmlPath('feed.opml')).toBe(true);
    expect(isOpmlPath('feed.xml')).toBe(false);
  });

  it('getKnownMindMapExtensions 不含 .map', () => {
    const extensions = getKnownMindMapExtensions();
    expect(extensions).not.toContain('map');
    expect(extensions).toContain('taumap');
  });
});