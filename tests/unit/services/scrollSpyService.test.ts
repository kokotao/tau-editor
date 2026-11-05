import { describe, expect, it } from 'vitest';
import { pickActiveOutlineIndex, pickActiveSourceLine } from '@/services/scrollSpyService';

describe('scrollSpyService/pickActiveOutlineIndex', () => {
  it('空大纲返回 -1', () => {
    expect(pickActiveOutlineIndex([], 42)).toBe(-1);
    expect(pickActiveOutlineIndex([], 0)).toBe(-1);
  });

  it('activeLine 落在两项之间时取前一项', () => {
    const items = [{ line: 1 }, { line: 10 }, { line: 20 }];
    expect(pickActiveOutlineIndex(items, 15)).toBe(1);
  });

  it('activeLine 恰好等于某项行号时命中该项', () => {
    const items = [{ line: 1 }, { line: 10 }, { line: 20 }];
    expect(pickActiveOutlineIndex(items, 10)).toBe(1);
    expect(pickActiveOutlineIndex(items, 1)).toBe(0);
    expect(pickActiveOutlineIndex(items, 20)).toBe(2);
  });

  it('activeLine 小于首项时退回首项', () => {
    const items = [{ line: 5 }, { line: 12 }];
    expect(pickActiveOutlineIndex(items, 1)).toBe(0);
    expect(pickActiveOutlineIndex(items, 0)).toBe(0);
    expect(pickActiveOutlineIndex(items, -8)).toBe(0);
  });

  it('activeLine 超过末项时取末项', () => {
    const items = [{ line: 5 }, { line: 12 }];
    expect(pickActiveOutlineIndex(items, 999)).toBe(1);
  });

  it('乱序输入先按行号升序稳定排序，返回的下标仍指向原数组', () => {
    const items = [{ line: 20 }, { line: 1 }, { line: 10 }];
    expect(pickActiveOutlineIndex(items, 12)).toBe(2);
    expect(pickActiveOutlineIndex(items, 20)).toBe(0);
    // 全部大于时返回行号最小项在原数组中的下标（不是 0）。
    expect(pickActiveOutlineIndex(items, 0)).toBe(1);
  });

  it('行号相同的乱序项保持原有相对顺序（稳定排序）', () => {
    const items = [{ line: 7, id: 'a' }, { line: 3, id: 'b' }, { line: 7, id: 'c' }];
    expect(pickActiveOutlineIndex(items, 7)).toBe(2);
  });

  it('非有限 activeLine 视为未知位置，退回首项', () => {
    expect(pickActiveOutlineIndex([{ line: 4 }, { line: 9 }], Number.NaN)).toBe(0);
  });
});

describe('scrollSpyService/pickActiveSourceLine', () => {
  it('空标题列表返回 0', () => {
    expect(pickActiveSourceLine([], 0, 0)).toBe(0);
    expect(pickActiveSourceLine([], 800, 24)).toBe(0);
  });

  it('滚动到标题之间时取上方最近的标题行', () => {
    const headings = [
      { line: 1, top: 0 },
      { line: 20, top: 400 },
      { line: 40, top: 900 },
    ];
    expect(pickActiveSourceLine(headings, 600, 0)).toBe(20);
  });

  it('正好等于标题位置时命中该标题', () => {
    const headings = [
      { line: 1, top: 0 },
      { line: 20, top: 400 },
    ];
    expect(pickActiveSourceLine(headings, 400, 0)).toBe(20);
  });

  it('offset 把「即将到达」的标题也算作当前标题', () => {
    const headings = [
      { line: 1, top: 0 },
      { line: 20, top: 400 },
    ];
    // 未加 offset 时仍在上一节；加上 24px 吸顶偏移后已经进入下一节。
    expect(pickActiveSourceLine(headings, 380, 0)).toBe(1);
    expect(pickActiveSourceLine(headings, 380, 24)).toBe(20);
  });

  it('滚动位置在第一项之前时回落为第一个标题行', () => {
    const headings = [
      { line: 12, top: 120 },
      { line: 30, top: 700 },
    ];
    expect(pickActiveSourceLine(headings, 0, 0)).toBe(12);
    expect(pickActiveSourceLine(headings, 0, 24)).toBe(12);
  });

  it('乱序锚点先按 top 升序稳定排序再取', () => {
    const headings = [
      { line: 40, top: 900 },
      { line: 1, top: 0 },
      { line: 20, top: 400 },
    ];
    expect(pickActiveSourceLine(headings, 950, 0)).toBe(40);
    expect(pickActiveSourceLine(headings, 10, 0)).toBe(1);
    expect(pickActiveSourceLine(headings, 500, 0)).toBe(20);
    // 全部在可视位置之下时回落为 top 最小的标题。
    expect(pickActiveSourceLine(headings, -1, 0)).toBe(1);
  });

  it('nullish 滚动值与 offset 视为 0，不产生 NaN', () => {
    const headings = [
      { line: 3, top: 0 },
      { line: 9, top: 240 },
    ];
    expect(pickActiveSourceLine(headings, Number.NaN, Number.NaN)).toBe(3);
  });
});
