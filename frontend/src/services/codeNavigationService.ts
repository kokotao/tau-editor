/**
 * Lightweight symbol index used by Monaco definition/hover providers.
 * It intentionally stays syntax-aware enough for common class/function forms
 * without introducing a language-server dependency for every supported file.
 */

export interface CodeSymbol {
  name: string;
  kind: 'class' | 'function' | 'method' | 'interface' | 'type' | 'variable';
  lineNumber: number;
  startColumn: number;
  endColumn: number;
  signature: string;
}

const IDENTIFIER = '[A-Za-z_$][\\w$]*';

const SYMBOL_PATTERNS: Array<{ kind: CodeSymbol['kind']; pattern: RegExp }> = [
  { kind: 'class', pattern: new RegExp(`\\b(?:class|struct|trait)\\s+(${IDENTIFIER})`) },
  { kind: 'interface', pattern: new RegExp(`\\binterface\\s+(${IDENTIFIER})`) },
  { kind: 'type', pattern: new RegExp(`\\b(?:type|enum)\\s+(${IDENTIFIER})`) },
  { kind: 'function', pattern: new RegExp(`\\b(?:function|def|fn)\\s+(${IDENTIFIER})\\s*\\(`) },
  // Java/C#/Go/Rust/TypeScript methods. Exclude control-flow keywords below.
  {
    kind: 'method',
    pattern: new RegExp(`(?:^|[\\s{};])(?:[A-Za-z_$][\\w$<>\\[\\],.?]*\\s+)+(${IDENTIFIER})\\s*\\([^;]*\\)\\s*(?:\\{|=>)`),
  },
  {
    kind: 'function',
    pattern: new RegExp(`\\b(?:const|let|var)\\s+(${IDENTIFIER})\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|${IDENTIFIER})\\s*=>`),
  },
  {
    kind: 'method',
    pattern: new RegExp(`^\\s*(?:public|private|protected|static|async|get|set|override|abstract|readonly|\\s)*(${IDENTIFIER})\\s*\\([^;]*\\)\\s*\\{`),
  },
];

const CONTROL_NAMES = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'return', 'new']);

export function extractCodeSymbols(content: string): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((line, lineIndex) => {
    const lineNumber = lineIndex + 1;
    for (const { kind, pattern } of SYMBOL_PATTERNS) {
      pattern.lastIndex = 0;
      const match = pattern.exec(line);
      const name = match?.[1];
      if (!match || !name || CONTROL_NAMES.has(name)) continue;

      const nameOffset = match.index + match[0].lastIndexOf(name);
      const symbol: CodeSymbol = {
        name,
        kind,
        lineNumber,
        startColumn: nameOffset + 1,
        endColumn: nameOffset + name.length + 1,
        signature: line.trim().slice(0, 240),
      };
      // Prefer the more specific declaration when a line matches multiple patterns.
      if (!symbols.some((item) => item.name === name && item.lineNumber === lineNumber)) {
        symbols.push(symbol);
      }
    }
  });

  return symbols;
}

export function findSymbol(symbols: CodeSymbol[], name: string): CodeSymbol | undefined {
  return symbols.find((symbol) => symbol.name === name);
}
