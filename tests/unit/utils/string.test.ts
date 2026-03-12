import { describe, it, expect } from 'vitest'
import { countLines, countWords, getLine, getCursorPosition } from '@/utils/string'

describe('String Utils', () => {
  describe('countLines', () => {
    it('should return 1 for empty string', () => {
      expect(countLines('')).toBe(1)
    })

    it('should return 1 for single line without newline', () => {
      expect(countLines('hello world')).toBe(1)
    })

    it('should return 2 for single line with newline', () => {
      expect(countLines('hello world\n')).toBe(2)
    })

    it('should count multiple lines correctly', () => {
      expect(countLines('line1\nline2\nline3')).toBe(3)
    })

    it('should handle trailing newline', () => {
      expect(countLines('line1\nline2\n')).toBe(3)
    })

    it('should handle Windows line endings', () => {
      expect(countLines('line1\r\nline2\r\nline3')).toBe(3)
    })
  })

  describe('countWords', () => {
    it('should return 0 for empty string', () => {
      expect(countWords('')).toBe(0)
    })

    it('should return 0 for whitespace only', () => {
      expect(countWords('   \t\n  ')).toBe(0)
    })

    it('should count single word', () => {
      expect(countWords('hello')).toBe(1)
    })

    it('should count multiple words', () => {
      expect(countWords('hello world test')).toBe(3)
    })

    it('should handle multiple spaces between words', () => {
      expect(countWords('hello    world')).toBe(2)
    })

    it('should handle punctuation', () => {
      expect(countWords('hello, world!')).toBe(2)
    })

    it('should handle Chinese characters', () => {
      expect(countWords('你好 世界')).toBe(2)
    })
  })

  describe('getLine', () => {
    const text = 'line1\nline2\nline3'

    it('should return first line', () => {
      expect(getLine(text, 1)).toBe('line1')
    })

    it('should return second line', () => {
      expect(getLine(text, 2)).toBe('line2')
    })

    it('should return last line', () => {
      expect(getLine(text, 3)).toBe('line3')
    })

    it('should return empty string for out of range', () => {
      expect(getLine(text, 10)).toBe('')
    })

    it('should return empty string for line 0', () => {
      expect(getLine(text, 0)).toBe('')
    })

    it('should handle negative line numbers', () => {
      expect(getLine(text, -1)).toBe('')
    })
  })

  describe('getCursorPosition', () => {
    it('should return position 1,1 for start', () => {
      expect(getCursorPosition('hello', 0)).toEqual({ line: 1, column: 1 })
    })

    it('should calculate position in single line', () => {
      expect(getCursorPosition('hello', 3)).toEqual({ line: 1, column: 4 })
    })

    it('should calculate position after newline', () => {
      expect(getCursorPosition('hi\nworld', 3)).toEqual({ line: 2, column: 1 })
    })

    it('should calculate position in second line', () => {
      expect(getCursorPosition('hi\nworld', 5)).toEqual({ line: 2, column: 3 })
    })

    it('should handle empty string', () => {
      expect(getCursorPosition('', 0)).toEqual({ line: 1, column: 1 })
    })
  })
})
