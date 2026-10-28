/**
 * Scroll-spy helpers shared by the document outline (ContextRail) and the
 * Markdown preview. They stay pure — no Vue, no DOM — so the active-line
 * mapping can be unit tested without mounting a component.
 *
 * @author Albert_Luo
 * @date 2026-10-28
 */

export interface OutlineLineItem {
  line: number;
}

export interface PreviewHeadingAnchor {
  /** 1-based source line of the rendered heading (`data-source-line`). */
  line: number;
  /** Heading offset relative to the preview scroll container (px). */
  top: number;
}

interface IndexedLine {
  line: number;
  index: number;
}

const toFiniteNumber = (value: number): number => (Number.isFinite(value) ? value : 0);

/**
 * 按 line 升序稳定排序，保留原始下标，便于回填到未经排序的调用方数组。
 */
const sortByLine = (items: readonly OutlineLineItem[]): IndexedLine[] =>
  items
    .map((item, index) => ({ line: toFiniteNumber(item.line), index }))
    .sort((left, right) => (left.line - right.line) || (left.index - right.index));

/**
 * @description 取「最后一个 line <= activeLine」的大纲项下标，用于列表高亮。
 * 全部项都大于 activeLine（含 activeLine 小于首项）时返回行号最小项的下标，
 * 空数组返回 -1。乱序输入会先按 line 升序稳定排序再取，返回的下标仍指向原数组。
 * @author Albert_Luo
 * @date 2026-10-28
 */
export function pickActiveOutlineIndex(items: readonly OutlineLineItem[], activeLine: number): number {
  if (items.length === 0) {
    return -1;
  }

  const sorted = sortByLine(items);
  const smallest = sorted[0];
  if (!smallest) {
    return -1;
  }
  const target = Number.isFinite(activeLine) ? activeLine : Number.NEGATIVE_INFINITY;
  let activeIndex = -1;
  for (const entry of sorted) {
    if (entry.line > target) {
      break;
    }
    activeIndex = entry.index;
  }

  return activeIndex === -1 ? smallest.index : activeIndex;
}

/**
 * @description 预览滚动时取当前标题行：返回「top - offsetPx <= scrollTop」的最后一个标题的
 * 源码行；没有匹配项时回落为第一个标题的行，空数组返回 0。
 * @author Albert_Luo
 * @date 2026-10-28
 */
export function pickActiveSourceLine(
  headings: readonly PreviewHeadingAnchor[],
  scrollTop: number,
  offsetPx = 0,
): number {
  if (headings.length === 0) {
    return 0;
  }

  const sorted = headings
    .map((heading, index) => ({
      line: toFiniteNumber(heading.line),
      top: toFiniteNumber(heading.top),
      index,
    }))
    .sort((left, right) => (left.top - right.top) || (left.index - right.index));

  const scroll = toFiniteNumber(scrollTop);
  const offset = toFiniteNumber(offsetPx);
  const first = sorted[0];
  if (!first) {
    return 0;
  }
  let activeLine = first.line;
  for (const entry of sorted) {
    if (entry.top - offset > scroll) {
      break;
    }
    activeLine = entry.line;
  }

  return activeLine;
}
