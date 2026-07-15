export type CompletionEntryKind = 'snippet' | 'keyword' | 'text';

export interface CompletionEntry {
  label: string;
  insertText: string;
  detail?: string;
  kind: CompletionEntryKind;
  sortText: string;
}

export interface BuildCompletionEntriesInput {
  language: string;
  currentWord: string;
  content: string;
  maxItems?: number;
}

interface SnippetDefinition {
  label: string;
  insertText: string;
  detail: string;
  kind: CompletionEntryKind;
}

const DEFAULT_MAX_ITEMS = 24;
const MIN_DOCUMENT_PREFIX_LENGTH = 2;
const WORD_PATTERN = /\b[A-Za-z_][A-Za-z0-9_-]{2,}\b/g;

const LANGUAGE_SNIPPETS: Record<string, SnippetDefinition[]> = {
  javascript: [
    { label: 'function', insertText: 'function ${1:name}(${2:args}) {\n  ${3}\n}', detail: 'Function snippet', kind: 'snippet' },
    { label: 'const', insertText: 'const ${1:name} = ${2:value};', detail: 'Const declaration', kind: 'keyword' },
    { label: 'import', insertText: "import { ${1:name} } from '${2:module}';", detail: 'Import statement', kind: 'snippet' },
  ],
  typescript: [
    { label: 'function', insertText: 'function ${1:name}(${2:args}): ${3:void} {\n  ${4}\n}', detail: 'Function snippet', kind: 'snippet' },
    { label: 'interface', insertText: 'interface ${1:Name} {\n  ${2}\n}', detail: 'Interface snippet', kind: 'snippet' },
    { label: 'const', insertText: 'const ${1:name}: ${2:type} = ${3:value};', detail: 'Typed const declaration', kind: 'snippet' },
  ],
  python: [
    { label: 'def', insertText: 'def ${1:name}(${2:args}):\n    ${3:pass}', detail: 'Function definition', kind: 'snippet' },
    { label: 'class', insertText: 'class ${1:Name}:\n    def __init__(self, ${2:args}):\n        ${3:pass}', detail: 'Class definition', kind: 'snippet' },
  ],
  markdown: [
    { label: 'heading', insertText: '# ${1:Heading}', detail: 'Markdown heading', kind: 'snippet' },
    { label: 'code-block', insertText: '```$1\n$2\n```', detail: 'Markdown code block', kind: 'snippet' },
  ],
  html: [
    { label: 'div', insertText: '<div>$1</div>', detail: 'HTML div', kind: 'snippet' },
    { label: 'section', insertText: '<section>\n  $1\n</section>', detail: 'HTML section', kind: 'snippet' },
  ],
  vue: [
    { label: 'template', insertText: '<template>\n  <div>$1</div>\n</template>', detail: 'Vue template', kind: 'snippet' },
    { label: 'script-setup', insertText: '<script setup lang=\"ts\">\n$1\n</script>', detail: 'Vue script setup', kind: 'snippet' },
  ],
  json: [
    { label: 'true', insertText: 'true', detail: 'Boolean literal', kind: 'keyword' },
    { label: 'false', insertText: 'false', detail: 'Boolean literal', kind: 'keyword' },
    { label: 'null', insertText: 'null', detail: 'Null literal', kind: 'keyword' },
  ],
};

function normalizeLanguage(language: string): string {
  return language.toLowerCase();
}

function buildSnippetEntries(language: string, currentWord: string): CompletionEntry[] {
  const normalizedWord = currentWord.toLowerCase();
  const snippets = LANGUAGE_SNIPPETS[language] ?? [];

  return snippets
    .filter((snippet) => normalizedWord.length === 0 || snippet.label.toLowerCase().startsWith(normalizedWord))
    .map((snippet, index) => ({
      label: snippet.label,
      insertText: snippet.insertText,
      detail: snippet.detail,
      kind: snippet.kind,
      sortText: `0-${String(index).padStart(3, '0')}-${snippet.label}`,
    }));
}

function buildDocumentWordEntries(content: string, currentWord: string, maxItems: number): CompletionEntry[] {
  if (currentWord.length < MIN_DOCUMENT_PREFIX_LENGTH) {
    return [];
  }

  const normalizedWord = currentWord.toLowerCase();
  const seen = new Set<string>();
  const entries: CompletionEntry[] = [];
  const matches = content.matchAll(WORD_PATTERN);

  for (const match of matches) {
    const label = match[0];
    const normalizedLabel = label.toLowerCase();
    if (!normalizedLabel.startsWith(normalizedWord) || normalizedLabel === normalizedWord || seen.has(normalizedLabel)) {
      continue;
    }

    seen.add(normalizedLabel);
    entries.push({
      label,
      insertText: label,
      detail: 'Current document',
      kind: 'text',
      sortText: `1-${String(entries.length).padStart(3, '0')}-${label}`,
    });

    if (entries.length >= maxItems) {
      break;
    }
  }

  return entries;
}

export function buildCompletionEntries(input: BuildCompletionEntriesInput): CompletionEntry[] {
  const maxItems = input.maxItems ?? DEFAULT_MAX_ITEMS;
  const currentWord = input.currentWord.trim();
  const language = normalizeLanguage(input.language);

  const snippets = buildSnippetEntries(language, currentWord);
  const words = buildDocumentWordEntries(input.content, currentWord, Math.max(0, maxItems - snippets.length));

  return [...snippets, ...words].slice(0, maxItems);
}
