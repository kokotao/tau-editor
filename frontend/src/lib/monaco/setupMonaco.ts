import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { buildCompletionEntries } from '@/services/editorCompletionService';

const COMPLETION_LANGUAGES = [
  'plaintext',
  'javascript',
  'typescript',
  'python',
  'java',
  'rust',
  'markdown',
  'json',
  'html',
  'css',
  'scss',
  'xml',
  'yaml',
  'sql',
  'shell',
  'go',
  'c',
  'cpp',
  'csharp',
  'vue',
];
const LARGE_FILE_COMPLETION_LIMIT = 600_000;

let monacoSetupComplete = false;

type MonacoTypescriptApi = {
  javascriptDefaults: {
    setEagerModelSync: (value: boolean) => void;
    setDiagnosticsOptions: (options: Record<string, unknown>) => void;
    setCompilerOptions: (options: Record<string, unknown>) => void;
  };
  typescriptDefaults: {
    setEagerModelSync: (value: boolean) => void;
    setDiagnosticsOptions: (options: Record<string, unknown>) => void;
    setCompilerOptions: (options: Record<string, unknown>) => void;
  };
  ScriptTarget: {
    ES2020: number;
  };
  ModuleResolutionKind: {
    NodeJs: number;
  };
  ModuleKind: {
    ESNext: number;
  };
};

function getWorker(label: string): Worker {
  switch (label) {
    case 'json':
      return new JsonWorker();
    case 'css':
    case 'scss':
    case 'less':
      return new CssWorker();
    case 'html':
    case 'handlebars':
    case 'razor':
      return new HtmlWorker();
    case 'typescript':
    case 'javascript':
      return new TsWorker();
    default:
      return new EditorWorker();
  }
}

function configureTypescriptDefaults() {
  const typescriptApi = monaco.languages?.typescript as unknown as MonacoTypescriptApi | undefined;
  if (!typescriptApi) {
    return;
  }

  typescriptApi.javascriptDefaults.setEagerModelSync(true);
  typescriptApi.typescriptDefaults.setEagerModelSync(true);
  typescriptApi.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  typescriptApi.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  typescriptApi.javascriptDefaults.setCompilerOptions({
    allowNonTsExtensions: true,
    target: typescriptApi.ScriptTarget.ES2020,
    moduleResolution: typescriptApi.ModuleResolutionKind.NodeJs,
    module: typescriptApi.ModuleKind.ESNext,
  });
  typescriptApi.typescriptDefaults.setCompilerOptions({
    allowNonTsExtensions: true,
    target: typescriptApi.ScriptTarget.ES2020,
    moduleResolution: typescriptApi.ModuleResolutionKind.NodeJs,
    module: typescriptApi.ModuleKind.ESNext,
  });
}

function registerCompletionProviders() {
  if (!monaco.languages?.registerCompletionItemProvider || !monaco.languages.CompletionItemKind) {
    return;
  }

  const completionKind = monaco.languages.CompletionItemKind;
  const insertTextRules = monaco.languages.CompletionItemInsertTextRule;

  for (const language of COMPLETION_LANGUAGES) {
    monaco.languages.registerCompletionItemProvider(language, {
      provideCompletionItems(model, position) {
        if (model.getValueLength() > LARGE_FILE_COMPLETION_LIMIT) {
          return { suggestions: [] };
        }

        const word = model.getWordUntilPosition(position);
        const entries = buildCompletionEntries({
          language,
          currentWord: word.word,
          content: model.getValue(),
        });
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        return {
          suggestions: entries.map((entry) => ({
            label: entry.label,
            insertText: entry.insertText,
            detail: entry.detail,
            range,
            sortText: entry.sortText,
            kind: entry.kind === 'snippet'
              ? completionKind.Snippet
              : entry.kind === 'keyword'
                ? completionKind.Keyword
                : completionKind.Text,
            insertTextRules: entry.kind === 'snippet' ? insertTextRules.InsertAsSnippet : undefined,
          })),
        };
      },
    });
  }
}

export function ensureMonacoSetup() {
  if (monacoSetupComplete) {
    return;
  }

  const globalScope = globalThis as typeof globalThis & {
    MonacoEnvironment?: {
      getWorker?: (_moduleId: string, label: string) => Worker;
    };
  };

  globalScope.MonacoEnvironment = {
    ...(globalScope.MonacoEnvironment ?? {}),
    getWorker: (_moduleId, label) => getWorker(label),
  };

  configureTypescriptDefaults();
  registerCompletionProviders();
  monacoSetupComplete = true;
}
