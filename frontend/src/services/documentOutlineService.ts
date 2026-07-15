export type OutlineKind = 'heading' | 'class' | 'function' | 'key' | 'selector';

export interface OutlineItem {
  id: string;
  label: string;
  kind: OutlineKind;
  level: number;
  line: number;
  endLine?: number;
  children?: OutlineItem[];
}

export interface DocumentOutlineInput {
  content: string;
  language: string;
  maxLines?: number;
}

const DEFAULT_MAX_LINES = 5_000;

interface LimitedLineScan {
  lines: string[];
  isTruncated: boolean;
}

function resolveLineLimit(maxLines?: number): number {
  if (maxLines === undefined || !Number.isFinite(maxLines)) {
    return DEFAULT_MAX_LINES;
  }

  return Math.max(0, Math.min(DEFAULT_MAX_LINES, Math.floor(maxLines)));
}

function collectLeadingLines(content: string, maxLines: number): LimitedLineScan {
  const lines: string[] = [];
  let start = 0;

  while (lines.length < maxLines) {
    const lineBreak = content.indexOf('\n', start);
    if (lineBreak === -1) {
      lines.push(content.slice(start).replace(/\r$/, ''));
      return { lines, isTruncated: false };
    }

    const lineEnd = content[lineBreak - 1] === '\r' ? lineBreak - 1 : lineBreak;
    lines.push(content.slice(start, lineEnd));
    start = lineBreak + 1;
  }

  return { lines, isTruncated: start < content.length };
}

function createId(kind: OutlineKind, label: string, line: number): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  return `${kind}-${slug || 'item'}-${line}`;
}

function createItem(
  label: string,
  kind: OutlineKind,
  level: number,
  line: number,
): OutlineItem {
  return { id: createId(kind, label, line), label, kind, level, line };
}

function parseMarkdown(lines: string[]): OutlineItem[] {
  const outline: OutlineItem[] = [];
  let fenceMarker: { character: '`' | '~'; length: number } | null = null;

  lines.forEach((line, index) => {
    if (fenceMarker === null) {
      const openingMatch = line.match(/^\s*(`{3,}|~{3,})/);
      const marker = openingMatch?.[1];
      if (marker) {
        fenceMarker = {
          character: marker.startsWith('~') ? '~' : '`',
          length: marker.length,
        };
        return;
      }
    }

    if (fenceMarker !== null) {
      const closingMatch = line.match(/^\s*(`{3,}|~{3,})[ \t]*$/);
      const marker = closingMatch?.[1];
      if (marker) {
        const character = marker.startsWith('~') ? '~' : '`';
        if (fenceMarker.character === character && marker.length >= fenceMarker.length) {
          fenceMarker = null;
        }
      }
      return;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    const hashes = heading?.[1];
    const label = heading?.[2];
    if (!hashes || !label) return;

    outline.push(createItem(label.trim(), 'heading', hashes.length, index + 1));
  });

  return outline;
}

function parseJsonLabel(rawLabel: string): string {
  try {
    return JSON.parse(`"${rawLabel}"`) as string;
  } catch {
    return rawLabel;
  }
}

function jsonDepthAt(line: string, initialDepth: number, endIndex: number): number {
  let depth = initialDepth;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < endIndex; index += 1) {
    const character = line[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === '{' || character === '[') {
      depth += 1;
    } else if (character === '}' || character === ']') {
      depth -= 1;
    }
  }

  return depth;
}

function isValidTruncatedJsonRoot(source: string): boolean {
  const trimmed = source.trimEnd();
  if (!trimmed.startsWith('{')) return false;

  const completion = trimmed.endsWith(',')
    ? `${trimmed}"__outline_truncation__":null\n}`
    : `${trimmed}\n}`;

  try {
    const parsed = JSON.parse(completion) as unknown;
    return parsed !== null && !Array.isArray(parsed) && typeof parsed === 'object';
  } catch {
    return false;
  }
}

function parseJson(lines: string[], isTruncated: boolean): OutlineItem[] {
  const source = lines.join('\n');
  try {
    JSON.parse(source);
  } catch {
    if (!isTruncated || !isValidTruncatedJsonRoot(source)) return [];
  }

  const outline: OutlineItem[] = [];
  let depthBeforeLine = 0;
  const keyPattern = /"((?:\\.|[^"\\])*)"\s*:/g;

  lines.forEach((line, index) => {
    for (const match of line.matchAll(keyPattern)) {
      const depth = jsonDepthAt(line, depthBeforeLine, match.index ?? 0);
      const label = match[1];
      if ((depth === 1 || depth === 2) && label !== undefined) {
        outline.push(createItem(parseJsonLabel(label), 'key', depth, index + 1));
      }
    }
    depthBeforeLine = jsonDepthAt(line, depthBeforeLine, line.length);
  });

  return outline;
}

function parseYaml(lines: string[]): OutlineItem[] {
  const candidates: Array<{ label: string; indentation: number; line: number }> = [];
  const keyPattern = /^(\s*)(?:-\s+)?([A-Za-z0-9_.-]+|"[^"\n]+"|'[^'\n]+')\s*:/;

  lines.forEach((line, index) => {
    if (line.trimStart().startsWith('#')) return;

    const match = line.match(keyPattern);
    const key = match?.[2];
    const indentation = match?.[1];
    if (!key || indentation === undefined) return;

    const label = key.replace(/^(?:"|')|(?:"|')$/g, '');
    candidates.push({ label, indentation: indentation.length, line: index + 1 });
  });

  const rootIndentation = candidates.length > 0 ? Math.min(...candidates.map((item) => item.indentation)) : 0;
  const roots = candidates.filter((item) => item.indentation === rootIndentation);
  if (roots.length === 0 || rootIndentation !== 0) return [];

  const childIndentation = candidates.find((item) => item.indentation > rootIndentation)?.indentation;
  return candidates.flatMap((item) => {
    if (item.indentation === rootIndentation) {
      return [createItem(item.label, 'key', 1, item.line)];
    }
    if (item.indentation === childIndentation) {
      return [createItem(item.label, 'key', 2, item.line)];
    }
    return [];
  });
}

function declarationLevel(line: string): number {
  return /^\s+/.test(line) ? 2 : 1;
}

function parseCode(lines: string[], language: string): OutlineItem[] {
  const outline: OutlineItem[] = [];
  const excludedMethodNames = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);
  const add = (label: string, kind: 'class' | 'function', line: string, index: number) => {
    outline.push(createItem(label, kind, declarationLevel(line), index + 1));
  };

  lines.forEach((line, index) => {
    let match: RegExpMatchArray | null = null;

    if (language === 'python') {
      match = line.match(/^\s*(?:async\s+)?class\s+([A-Za-z_][\w]*)\b/);
      if (match?.[1] !== undefined) return add(match[1], 'class', line, index);
      match = line.match(/^\s*(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/);
      if (match?.[1] !== undefined) return add(match[1], 'function', line, index);
      return;
    }

    if (language === 'go') {
      match = line.match(/^\s*type\s+([A-Za-z_][\w]*)\s+(?:struct|interface)\b/);
      if (match?.[1] !== undefined) return add(match[1], 'class', line, index);
      match = line.match(/^\s*func\s+(?:\([^)]*\)\s+)?([A-Za-z_][\w]*)\s*\(/);
      if (match?.[1] !== undefined) return add(match[1], 'function', line, index);
      return;
    }

    if (language === 'rust') {
      match = line.match(/^\s*(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_][\w]*)\b/);
      if (match?.[1] !== undefined) return add(match[1], 'class', line, index);
      match = line.match(/^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][\w]*)\s*(?:<[^>]*>)?\s*\(/);
      if (match?.[1] !== undefined) return add(match[1], 'function', line, index);
      return;
    }

    if (language === 'java') {
      match = line.match(
        /^\s*(?:(?:public|protected|private|static|final|abstract|sealed|non-sealed|strictfp)\s+)*(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)\b/,
      );
      if (match?.[1] !== undefined) return add(match[1], 'class', line, index);
    }

    match = line.match(/^\s*(?:export\s+(?:default\s+)?|declare\s+)?(?:abstract\s+)?(?:class|interface|enum)\s+([A-Za-z_$][\w$]*)\b/);
    if (match?.[1] !== undefined) return add(match[1], 'class', line, index);

    match = line.match(/^\s*(?:export\s+(?:default\s+)?|declare\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/);
    if (match?.[1] !== undefined) return add(match[1], 'function', line, index);

    const method = line.match(
      /^\s*(?:(?:public|private|protected|static|final|abstract|async|override|virtual|inline|const|mut|unsafe|extern|readonly|get|set)\s+)*(?:[A-Za-z_$][\w$<>, ?[\]|.&:]*\s+)?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\([^;{}]*\)\s*(?::\s*[^={]+)?\s*\{/,
    );
    const methodName = method?.[1];
    if (methodName && !excludedMethodNames.has(methodName)) {
      add(methodName, 'function', line, index);
    }
  });

  return outline;
}

function normalizeLanguage(language: string): string {
  const normalized = language.trim().toLowerCase();
  if (normalized === 'md') return 'markdown';
  if (normalized === 'yml') return 'yaml';
  if (['ts', 'tsx'].includes(normalized)) return 'typescript';
  if (['js', 'jsx'].includes(normalized)) return 'javascript';
  return normalized;
}

export function buildDocumentOutline(input: DocumentOutlineInput): OutlineItem[] {
  const { lines, isTruncated } = collectLeadingLines(input.content, resolveLineLimit(input.maxLines));
  const language = normalizeLanguage(input.language);

  if (language === 'markdown') return parseMarkdown(lines);
  if (language === 'json') return parseJson(lines, isTruncated);
  if (language === 'yaml') return parseYaml(lines);
  if (['typescript', 'javascript', 'vue', 'python', 'java', 'go', 'rust'].includes(language)) {
    return parseCode(lines, language);
  }

  return [];
}
