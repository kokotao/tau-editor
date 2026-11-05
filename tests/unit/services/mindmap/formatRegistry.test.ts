import { describe, expect, it } from 'vitest';
import {
  MINDMAP_FORMAT_REGISTRY,
  getMindMapFormatEntry,
  listMindMapFormatIds,
  listMindMapFormatsByReadLevel,
} from '@/services/mindmap/formatRegistry';

describe('MINDMAP_FORMAT_REGISTRY', () => {
  it('注册了原生 taumap 且为 lossless', () => {
    const entry = getMindMapFormatEntry('taumap');
    expect(entry).toBeDefined();
    expect(entry?.isNative).toBe(true);
    expect(entry?.capabilities.read).toBe('lossless');
    expect(entry?.capabilities.write).toBe('lossless');
    expect(entry?.capabilities.reversibleFields).toContain('topics');
  });

  it('不把歧义 .map 注册成单一格式', () => {
    const entries = MINDMAP_FORMAT_REGISTRY.filter((entry) => entry.extensions.includes('map'));
    expect(entries).toHaveLength(0);
  });

  it('条目 id 唯一', () => {
    const ids = MINDMAP_FORMAT_REGISTRY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('listMindMapFormatsByReadLevel 返回 >= 指定能力', () => {
    const lossless = listMindMapFormatsByReadLevel('lossless');
    expect(lossless.map((e) => e.id)).toContain('taumap');

    const compatible = listMindMapFormatsByReadLevel('compatible');
    expect(compatible.map((e) => e.id)).toEqual(
      expect.arrayContaining(['taumap', 'xmind', 'freemind', 'markdown', 'opml']),
    );
  });

  it('listMindMapFormatIds 返回全部注册 id', () => {
    const ids = listMindMapFormatIds();
    expect(ids).toContain('taumap');
    expect(ids).toContain('xmind');
    expect(ids).toContain('freemind');
  });
});