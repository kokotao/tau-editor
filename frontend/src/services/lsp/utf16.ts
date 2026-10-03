/**
 * @description Monaco 位置与 LSP UTF-16 位置、文本偏移和增量编辑之间的转换工具。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 09:40
 */

import type { LspPosition, LspRange, TextDocumentContentChangeEvent } from './types';

export interface MonacoPosition {
  lineNumber: number;
  column: number;
}
export interface MonacoRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '\r') {
      if (text[index + 1] === '\n') index += 1;
      starts.push(index + 1);
    } else if (character === '\n') {
      starts.push(index + 1);
    }
  }
  return starts;
}

function lineEnd(text: string, start: number): number {
  let index = start;
  while (index < text.length && text[index] !== '\r' && text[index] !== '\n') index += 1;
  return index;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function lineIndexForOffset(starts: number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const start = starts[middle] ?? 0;
    if (start <= offset) low = middle + 1;
    else high = middle - 1;
  }
  return Math.max(0, high);
}

/** Monaco 的行/列从 1 开始，LSP 的行/列从 0 开始且 character 是 UTF-16 code unit。 */
export function monacoPositionToLsp(position: MonacoPosition, text: string): LspPosition {
  const starts = lineStarts(text);
  const line = clamp(Math.floor(position.lineNumber) - 1, 0, starts.length - 1);
  const start = starts[line] ?? 0;
  const end = lineEnd(text, start);
  const character = clamp(Math.floor(position.column) - 1, 0, end - start);
  return { line, character };
}

export function lspPositionToMonaco(position: LspPosition, text: string): MonacoPosition {
  const starts = lineStarts(text);
  const line = clamp(Math.floor(position.line), 0, starts.length - 1);
  const start = starts[line] ?? 0;
  const end = lineEnd(text, start);
  const character = clamp(Math.floor(position.character), 0, end - start);
  return { lineNumber: line + 1, column: character + 1 };
}

export function monacoRangeToLsp(
  range: MonacoRange,
  text: string,
): LspRange {
  return {
    start: monacoPositionToLsp({ lineNumber: range.startLineNumber, column: range.startColumn }, text),
    end: monacoPositionToLsp({ lineNumber: range.endLineNumber, column: range.endColumn }, text),
  };
}

export function lspRangeToMonaco(range: LspRange, text: string): MonacoRange {
  const start = lspPositionToMonaco(range.start, text);
  const end = lspPositionToMonaco(range.end, text);
  return {
    startLineNumber: start.lineNumber,
    startColumn: start.column,
    endLineNumber: end.lineNumber,
    endColumn: end.column,
  };
}

export function lspPositionToOffset(text: string, position: LspPosition): number {
  const starts = lineStarts(text);
  const line = clamp(Math.floor(position.line), 0, starts.length - 1);
  const start = starts[line] ?? 0;
  const end = lineEnd(text, start);
  return start + clamp(Math.floor(position.character), 0, end - start);
}

export function offsetToLspPosition(text: string, offset: number): LspPosition {
  const safeOffset = clamp(Math.floor(offset), 0, text.length);
  const starts = lineStarts(text);
  const line = lineIndexForOffset(starts, safeOffset);
  const start = starts[line] ?? 0;
  const end = lineEnd(text, start);
  return { line, character: clamp(safeOffset - start, 0, end - start) };
}

/** 依次应用 LSP contentChanges；调用方可用它校验编辑器内容与协议内容的一致性。 */
export function applyTextDocumentChanges(
  text: string,
  changes: readonly TextDocumentContentChangeEvent[],
): string {
  let next = text;
  for (const change of changes) {
    if (!change.range) {
      next = change.text;
      continue;
    }

    const start = lspPositionToOffset(next, change.range.start);
    const end = lspPositionToOffset(next, change.range.end);
    const from = Math.min(start, end);
    const to = Math.max(start, end);
    next = `${next.slice(0, from)}${change.text}${next.slice(to)}`;
  }
  return next;
}
