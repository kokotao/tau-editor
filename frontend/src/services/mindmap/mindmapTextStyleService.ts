import type { MindMapTextStyleRange } from '@/types/mindmap';

export interface MindmapStyledTextSegment {
  text: string;
  color?: string;
  background?: string;
}

/** Split one text line into renderable runs using global code-point offsets. */
export function segmentMindmapTextLine(
  line: string,
  lineStart: number,
  ranges: MindMapTextStyleRange[] = [],
): MindmapStyledTextSegment[] {
  const chars = Array.from(line);
  const segments: MindmapStyledTextSegment[] = [];
  let start = 0;
  while (start < chars.length) {
    const offset = lineStart + start;
    const range = ranges.find((item) => item.start <= offset && offset < item.end);
    const style = { color: range?.color, background: range?.background };
    let end = start + 1;
    while (end < chars.length) {
      const nextOffset = lineStart + end;
      const next = ranges.find((item) => item.start <= nextOffset && nextOffset < item.end);
      if (next?.color !== style.color || next?.background !== style.background) break;
      end += 1;
    }
    segments.push({ text: chars.slice(start, end).join(''), ...style });
    start = end;
  }
  return segments;
}

/** Locate wrapped lines in source text to retain source-relative offsets. */
export function getMindmapLineOffsets(text: string, lines: string[]): number[] {
  const chars = Array.from(text);
  let cursor = 0;
  return lines.map((line) => {
    const lineChars = Array.from(line);
    let found = -1;
    for (let i = cursor; i <= chars.length - lineChars.length; i += 1) {
      if (lineChars.every((char, index) => chars[i + index] === char)) {
        found = i;
        break;
      }
    }
    if (found < 0) return cursor;
    cursor = found + lineChars.length;
    return found;
  });
}
