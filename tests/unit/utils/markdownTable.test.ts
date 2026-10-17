import { describe, expect, it } from 'vitest';
import {
  findMarkdownTableContext,
  insertMarkdownTableColumn,
  insertMarkdownTableRow,
  updateMarkdownTableAtIndex,
  updateMarkdownTableCellAtIndex,
} from '@/utils/markdownTable';

describe('markdownTable', () => {
  it('支持删除整张表格并清理相邻空行', async () => {
    const { updateMarkdownTableAtIndex } = await import('@/utils/markdownTable');
    const source = '前文\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n后文';
    expect(updateMarkdownTableAtIndex(source, 0, 'table-remove')).toBe('前文\n后文');
  });
  const source = [
    '前置内容',
    '| 姓名 | 年龄 |',
    '| --- | --- |',
    '| 小明 | 18 |',
    '| 小红 | 19 |',
    '后置内容',
  ].join('\n');

  it('应识别光标所在的 Markdown 表格和列', () => {
    expect(findMarkdownTableContext(source, 3, 13)).toMatchObject({
      startLine: 1,
      endLine: 4,
      currentLine: 3,
      columnIndex: 1,
    });
  });

  it('应在当前行下方新增一行', () => {
    const context = findMarkdownTableContext(source, 3, 5);
    expect(context).not.toBeNull();
    expect(insertMarkdownTableRow(source, context!)).toContain('| 小明 | 18 |\n| 内容 | 内容 |\n| 小红 | 19 |');
  });

  it('应在当前列右侧为所有表格行新增一列', () => {
    const context = findMarkdownTableContext(source, 3, 13);
    expect(context).not.toBeNull();
    expect(insertMarkdownTableColumn(source, context!)).toContain(
      '| 姓名 | 年龄 | 内容 |\n| --- | --- | --- |\n| 小明 | 18 | 内容 |',
    );
  });

  it('应按表格序号追加行和编辑单元格', () => {
    const withSecondTable = source + '\n\n| 城市 |\n| --- |\n| 上海 |';
    expect(updateMarkdownTableAtIndex(withSecondTable, 1, 'column-right')).toContain('| 城市 | 内容 |\n| --- | --- |\n| 上海 | 内容 |');
    expect(updateMarkdownTableCellAtIndex(withSecondTable, 1, 2, 0, '杭州')).toContain('| 杭州 |');
  });

  it('删除列时至少保留一列，单列删除不应转为新增列', () => {
    const singleColumn = '| 城市 |\n| --- |\n| 上海 |';
    expect(updateMarkdownTableAtIndex(singleColumn, 0, 'column-left-remove')).toBe(singleColumn);
    expect(updateMarkdownTableAtIndex(singleColumn, 0, 'column-right-remove')).toBe(singleColumn);
  });

  it('删除列应按方向移除最左或最右列', () => {
    expect(updateMarkdownTableAtIndex(source, 0, 'column-left-remove')).toContain('| 年龄 |\n| --- |\n| 18 |');
    expect(updateMarkdownTableAtIndex(source, 0, 'column-right-remove')).toContain('| 姓名 |\n| --- |\n| 小明 |');
  });

  it('删除行时至少保留一行数据', () => {
    const singleRow = '| 城市 |\n| --- |\n| 上海 |';
    expect(updateMarkdownTableAtIndex(singleRow, 0, 'row-remove')).toBe(singleRow);
    expect(updateMarkdownTableAtIndex(source, 0, 'row-remove')).toContain('| 小明 | 18 |');
    expect(updateMarkdownTableAtIndex(source, 0, 'row-remove')).not.toContain('| 小红 | 19 |');
  });
});
