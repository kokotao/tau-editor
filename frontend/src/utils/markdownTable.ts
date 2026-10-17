/**
 * @description 提供 Markdown 表格行列增量编辑能力，供编辑器上下文菜单复用。
 */

export interface MarkdownTableContext {
  startLine: number;
  endLine: number;
  currentLine: number;
  currentColumn: number;
  columnIndex: number;
}

export interface MarkdownTableBlock {
  startLine: number;
  endLine: number;
}

const isTableLine = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isSeparatorLine = (line: string) => {
  if (!isTableLine(line)) return false;
  const cells = splitTableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
};

export const splitTableCells = (line: string): string[] => {
  const normalized = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return normalized.split('|').map((cell) => cell.trim());
};

const columnAtPosition = (line: string, column: number) => {
  const content = line.slice(0, Math.max(0, column - 1));
  const separators = (content.match(/\|/g) || []).length;
  return Math.max(0, Math.min(splitTableCells(line).length - 1, separators - (line.trimStart().startsWith('|') ? 1 : 0)));
};

export const findMarkdownTableContext = (content: string, lineIndex: number, column: number): MarkdownTableContext | null => {
  const lines = content.split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length || !isTableLine(lines[lineIndex] || '')) return null;

  let startLine = lineIndex;
  let endLine = lineIndex;
  while (startLine > 0 && isTableLine(lines[startLine - 1] || '')) startLine -= 1;
  while (endLine + 1 < lines.length && isTableLine(lines[endLine + 1] || '')) endLine += 1;
  if (endLine - startLine < 1 || !isSeparatorLine(lines[startLine + 1] || '')) return null;

  const cells = splitTableCells(lines[lineIndex] || '');
  return {
    startLine,
    endLine,
    currentLine: lineIndex,
    currentColumn: column,
    columnIndex: columnAtPosition(lines[lineIndex] || '', column),
  };
};

const formatRow = (cells: string[]) => `| ${cells.join(' | ')} |`;

export const insertMarkdownTableRow = (content: string, context: MarkdownTableContext): string => {
  const lines = content.split('\n');
  const tableLines = lines.slice(context.startLine, context.endLine + 1);
  const columnCount = Math.max(1, splitTableCells(tableLines[0] || '').length);
  const insertAt = context.currentLine <= context.startLine + 1
    ? context.startLine + 2
    : Math.min(context.currentLine + 1, context.endLine + 1);
  const row = formatRow(Array.from({ length: columnCount }, () => '内容'));
  lines.splice(insertAt, 0, row);
  return lines.join('\n');
};

export const insertMarkdownTableColumn = (content: string, context: MarkdownTableContext, side: 'left' | 'right' = 'right'): string => {
  const lines = content.split('\n');
  const insertAt = Math.max(0, Math.min(
    context.columnIndex + (side === 'right' ? 1 : 0),
    splitTableCells(lines[context.currentLine] || '').length,
  ));
  for (let lineIndex = context.startLine; lineIndex <= context.endLine; lineIndex += 1) {
    const cells = splitTableCells(lines[lineIndex] || '');
    if (cells.length === 0) continue;
    cells.splice(insertAt, 0, isSeparatorLine(lines[lineIndex] || '') ? '---' : '内容');
    lines[lineIndex] = formatRow(cells);
  }
  return lines.join('\n');
};

export const findMarkdownTableBlocks = (content: string): MarkdownTableBlock[] => {
  const lines = content.split('\n');
  const blocks: MarkdownTableBlock[] = [];
  let lineIndex = 0;
  while (lineIndex < lines.length - 1) {
    if (!isTableLine(lines[lineIndex] || '') || !isSeparatorLine(lines[lineIndex + 1] || '')) {
      lineIndex += 1;
      continue;
    }
    let endLine = lineIndex + 1;
    while (endLine + 1 < lines.length && isTableLine(lines[endLine + 1] || '')) endLine += 1;
    blocks.push({ startLine: lineIndex, endLine });
    lineIndex = endLine + 1;
  }
  return blocks;
};

export const updateMarkdownTableAtIndex = (
  content: string,
  tableIndex: number,
  operation: 'row' | 'row-remove' | 'column-left' | 'column-right' | 'column-left-remove' | 'column-right-remove' | 'table-remove',
): string => {
  const block = findMarkdownTableBlocks(content)[tableIndex];
  if (!block) return content;
  const lines = content.split('\n');
  const tableContent = lines.slice(block.startLine, block.endLine + 1).join('\n');
  if (operation === 'table-remove') {
    lines.splice(block.startLine, block.endLine - block.startLine + 1);
    if (lines[block.startLine] === '') lines.splice(block.startLine, 1);
    if (lines[block.startLine - 1] === '') lines.splice(block.startLine - 1, 1);
    return lines.join('\n');
  }
  const context = findMarkdownTableContext(tableContent, Math.min(2, block.endLine - block.startLine), 3);
  if (!context) return content;
  let nextTable = tableContent;
  if (operation === 'row') {
    nextTable = insertMarkdownTableRow(tableContent, { ...context, currentLine: Math.max(2, block.endLine - block.startLine) });
  } else if (operation === 'row-remove') {
    const tableLines = tableContent.split('\n');
    if (tableLines.length > 3) tableLines.splice(tableLines.length - 1, 1);
    nextTable = tableLines.join('\n');
  } else {
    const isLeft = operation === 'column-left' || operation === 'column-left-remove';
    const isRemove = operation.endsWith('-remove');
    const tableLines = tableContent.split('\n');
    const columnCount = splitTableCells(tableLines[0] || '').length;
    if (isRemove && columnCount > 1) {
      const removeAt = isLeft ? 0 : columnCount - 1;
      for (let index = 0; index < tableLines.length; index += 1) {
        const cells = splitTableCells(tableLines[index] || '');
        if (cells.length > removeAt) {
          cells.splice(removeAt, 1);
          tableLines[index] = formatRow(cells);
        }
      }
      nextTable = tableLines.join('\n');
    } else if (!isRemove) {
      nextTable = insertMarkdownTableColumn(tableContent, { ...context, currentLine: Math.max(2, block.endLine - block.startLine), columnIndex: isLeft ? 0 : columnCount - 1 }, isLeft ? 'left' : 'right');
    }
  }
  lines.splice(block.startLine, block.endLine - block.startLine + 1, ...nextTable.split('\n'));
  return lines.join('\n');
};

export const updateMarkdownTableCellAtIndex = (
  content: string,
  tableIndex: number,
  rowIndex: number,
  columnIndex: number,
  value: string,
): string => {
  const block = findMarkdownTableBlocks(content)[tableIndex];
  if (!block || rowIndex === 1) return content;
  const lines = content.split('\n');
  const lineIndex = block.startLine + rowIndex;
  const cells = splitTableCells(lines[lineIndex] || '');
  if (rowIndex < 0 || lineIndex > block.endLine || columnIndex < 0 || columnIndex >= cells.length) return content;
  cells[columnIndex] = value.trim().replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  lines[lineIndex] = formatRow(cells);
  return lines.join('\n');
};
