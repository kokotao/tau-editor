/**
 * @description 验证 Monaco/LSP UTF-16 位置、范围和文本变更转换。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 09:45
 */

import { describe, expect, it } from 'vitest';
import {
  applyTextDocumentChanges,
  lspPositionToMonaco,
  lspRangeToMonaco,
  lspPositionToOffset,
  monacoPositionToLsp,
  monacoRangeToLsp,
  offsetToLspPosition,
} from '@/services/lsp/utf16';

describe('LSP UTF-16 position conversion', () => {
  it('uses UTF-16 code units for astral characters', () => {
    const text = '😀x\n第二行';
    expect(monacoPositionToLsp({ lineNumber: 1, column: 3 }, text)).toEqual({
      line: 0,
      character: 2,
    });
    expect(lspPositionToMonaco({ line: 0, character: 2 }, text)).toEqual({
      lineNumber: 1,
      column: 3,
    });
    expect(lspPositionToOffset(text, { line: 0, character: 2 })).toBe(2);
    expect(offsetToLspPosition(text, 2)).toEqual({ line: 0, character: 2 });
  });

  it('handles CRLF lines and clamps positions to line content', () => {
    const text = 'one\r\ntwo';
    expect(monacoPositionToLsp({ lineNumber: 2, column: 99 }, text)).toEqual({
      line: 1,
      character: 3,
    });
    expect(lspPositionToMonaco({ line: 99, character: 99 }, text)).toEqual({
      lineNumber: 2,
      column: 4,
    });
  });

  it('converts ranges and applies full and incremental text changes', () => {
    const text = 'const value = 1;\nvalue;';
    const range = {
      startLineNumber: 1,
      startColumn: 7,
      endLineNumber: 1,
      endColumn: 12,
    };
    expect(monacoRangeToLsp(range, text)).toEqual({
      start: { line: 0, character: 6 },
      end: { line: 0, character: 11 },
    });
    expect(lspRangeToMonaco(monacoRangeToLsp(range, text), text)).toEqual(range);

    expect(applyTextDocumentChanges(text, [{ text: 'let value = 2;' }])).toBe('let value = 2;');
    expect(applyTextDocumentChanges(text, [{
      range: {
        start: { line: 0, character: 14 },
        end: { line: 0, character: 15 },
      },
      text: '2',
    }])).toBe('const value = 2;\nvalue;');
  });
});
