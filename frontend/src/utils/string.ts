export const countLines = (text: string): number => text.split(/\r\n|\r|\n/).length;

export const countWords = (text: string): number => {
  const normalized = text.trim();
  return normalized ? normalized.split(/\s+/).length : 0;
};

export const getLine = (text: string, lineNumber: number): string => {
  if (!Number.isInteger(lineNumber) || lineNumber < 1) {
    return '';
  }
  return text.split(/\r\n|\r|\n/)[lineNumber - 1] ?? '';
};

export const getCursorPosition = (text: string, offset: number) => {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const prefix = text.slice(0, safeOffset);
  const lines = prefix.split(/\r\n|\r|\n/);
  return {
    line: lines.length,
    column: (lines[lines.length - 1] ?? '').length + 1,
  };
};
