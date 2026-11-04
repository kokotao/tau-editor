import { describe, expect, it } from 'vitest';
import { getMindmapLineOffsets, segmentMindmapTextLine } from '@/services/mindmap/mindmapTextStyleService';

describe('mindmapTextStyleService', () => {
  it('splits a line into formatted and plain runs using Unicode code-point offsets', () => {
    expect(segmentMindmapTextLine('A😀字B', 0, [
      { start: 1, end: 3, color: '#123456', background: '#fff000' },
    ])).toEqual([
      { text: 'A', color: undefined, background: undefined },
      { text: '😀字', color: '#123456', background: '#fff000' },
      { text: 'B', color: undefined, background: undefined },
    ]);
  });

  it('finds wrapped line offsets in source text', () => {
    expect(getMindmapLineOffsets('first line\nsecond line', ['first', 'line', 'second', 'line']))
      .toEqual([0, 6, 11, 18]);
  });
});
