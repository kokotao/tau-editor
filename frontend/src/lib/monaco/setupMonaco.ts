/**
 * @description 配置 Monaco Worker、补全和代码导航 Provider，并优先桥接 LSP 能力。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 10:18
 */

import * as monaco from '@/lib/monaco/editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { buildCompletionEntries } from '@/services/editorCompletionService';
import { extractCodeSymbols, findSymbol, type CodeSymbol } from '@/services/codeNavigationService';
import { getMonacoLspBridge, type MonacoLspModelContext } from '@/services/lsp/monacoLspBridge';

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
const NAVIGATION_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'java',
  'rust',
  'go',
  'c',
  'cpp',
  'csharp',
  'shell',
  'vue',
  'ruby',
  'php',
  'powershell',
];
const LSP_TOOLING_LANGUAGES = NAVIGATION_LANGUAGES.filter((language) => language !== 'shell');
const NAVIGATION_CONTENT_LIMIT = 1_000_000;
const symbolCache = new WeakMap<monaco.editor.ITextModel, { version: number; symbols: CodeSymbol[] }>();

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

function getWordAtPosition(model: monaco.editor.ITextModel, position: monaco.Position): string | null {
  const word = model.getWordAtPosition(position);
  return word?.word || null;
}

function getSymbols(model: monaco.editor.ITextModel): CodeSymbol[] {
  const version = model.getVersionId();
  const cached = symbolCache.get(model);
  if (cached?.version === version) {
    return cached.symbols;
  }
  const symbols = extractCodeSymbols(model.getValue());
  symbolCache.set(model, { version, symbols });
  return symbols;
}

function countReferences(name: string, models: monaco.editor.ITextModel[]): number {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(`\\b${escapedName}\\b`, 'g');
  return models.reduce((count, candidate) => count + (candidate.getValue().match(matcher)?.length ?? 0), 0);
}

function findFallbackReferences(name: string, models: monaco.editor.ITextModel[]): monaco.languages.Location[] {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(`\\b${escapedName}\\b`, 'g');
  const locations: monaco.languages.Location[] = [];
  for (const candidate of models) {
    for (let lineNumber = 1; lineNumber <= candidate.getLineCount(); lineNumber += 1) {
      const line = candidate.getLineContent(lineNumber);
      matcher.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = matcher.exec(line)) !== null) {
        const startColumn = match.index + 1;
        locations.push({
          uri: candidate.uri,
          range: {
            startLineNumber: lineNumber,
            startColumn,
            endLineNumber: lineNumber,
            endColumn: startColumn + name.length,
          },
        });
        if (match[0].length === 0) matcher.lastIndex += 1;
      }
    }
  }
  return locations;
}

function getNavigationModels(): monaco.editor.ITextModel[] {
  return monaco.editor.getModels().filter((candidate) => (
    !candidate.isDisposed() && candidate.getValueLength() <= NAVIGATION_CONTENT_LIMIT
  ));
}

function getFallbackDefinition(model: monaco.editor.ITextModel, name: string): monaco.languages.Definition | undefined {
  const models = getNavigationModels();
  const orderedModels = [model, ...models.filter((candidate) => candidate !== model)];
  for (const candidate of orderedModels) {
    const symbol = findSymbol(getSymbols(candidate), name);
    if (!symbol) continue;
    return {
      uri: candidate.uri,
      range: {
        startLineNumber: symbol.lineNumber,
        startColumn: symbol.startColumn,
        endLineNumber: symbol.lineNumber,
        endColumn: symbol.endColumn,
      },
    };
  }
  return undefined;
}

function getFallbackDocumentSymbols(model: monaco.editor.ITextModel): monaco.languages.DocumentSymbol[] {
  return getSymbols(model).map((symbol) => {
    const range = {
      startLineNumber: symbol.lineNumber,
      startColumn: symbol.startColumn,
      endLineNumber: symbol.lineNumber,
      endColumn: symbol.endColumn,
    };
    const kind = symbol.kind === 'class'
      ? monaco.languages.SymbolKind.Class
      : symbol.kind === 'interface'
        ? monaco.languages.SymbolKind.Interface
        : symbol.kind === 'type'
          ? monaco.languages.SymbolKind.TypeParameter
          : symbol.kind === 'method'
            ? monaco.languages.SymbolKind.Method
            : symbol.kind === 'variable'
              ? monaco.languages.SymbolKind.Variable
              : monaco.languages.SymbolKind.Function;
    return {
      name: symbol.name,
      detail: symbol.signature,
      kind,
      tags: [],
      range,
      selectionRange: range,
    } satisfies monaco.languages.DocumentSymbol;
  });
}

function getFallbackHover(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  word: monaco.editor.IWordAtPosition,
  name: string,
): monaco.languages.Hover | undefined {
  const models = getNavigationModels();
  const symbol = models
    .map((candidate) => findSymbol(getSymbols(candidate), name))
    .find((candidate): candidate is CodeSymbol => Boolean(candidate));
  if (!symbol) return undefined;
  const usageCount = countReferences(name, models);
  return {
    range: {
      startLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endLineNumber: position.lineNumber,
      endColumn: word.endColumn,
    },
    contents: [
      { value: `**${symbol.kind}** \`${symbol.name}\` · ${usageCount} usages` },
      { value: ['```', symbol.signature, '```'].join('\n') },
    ],
  };
}

function registerCodeNavigationProviders() {
  if (!monaco.languages) {
    return;
  }

  for (const language of NAVIGATION_LANGUAGES) {
    if (monaco.languages.registerDefinitionProvider) {
      monaco.languages.registerDefinitionProvider(language, {
        async provideDefinition(model, position, token) {
          const name = getWordAtPosition(model, position);
          if (!name || model.getValueLength() > NAVIGATION_CONTENT_LIMIT) {
            return undefined;
          }

          const lspResult = await getMonacoLspBridge()?.provideDefinition(model, position, token);
          if (lspResult) {
            return lspResult;
          }
          return getFallbackDefinition(model, name);
        },
      });
    }

    if (monaco.languages.registerHoverProvider) {
      monaco.languages.registerHoverProvider(language, {
        async provideHover(model, position, token) {
          const word = model.getWordAtPosition(position);
          const name = word?.word || null;
          if (!word || !name || model.getValueLength() > NAVIGATION_CONTENT_LIMIT) {
            return undefined;
          }

          const lspResult = await getMonacoLspBridge()?.provideHover(model, position, token);
          if (lspResult) {
            return lspResult;
          }
          return getFallbackHover(model, position, word, name);
        },
      });
    }

    if (monaco.languages.registerDeclarationProvider) {
      monaco.languages.registerDeclarationProvider(language, {
        async provideDeclaration(model, position, token) {
          const name = getWordAtPosition(model, position);
          if (!name || model.getValueLength() > NAVIGATION_CONTENT_LIMIT) return undefined;
          const lspResult = await getMonacoLspBridge()?.provideDeclaration(model, position, token);
          return lspResult || getFallbackDefinition(model, name);
        },
      });
    }

    if (monaco.languages.registerTypeDefinitionProvider) {
      monaco.languages.registerTypeDefinitionProvider(language, {
        async provideTypeDefinition(model, position, token) {
          const name = getWordAtPosition(model, position);
          if (!name || model.getValueLength() > NAVIGATION_CONTENT_LIMIT) return undefined;
          const lspResult = await getMonacoLspBridge()?.provideTypeDefinition(model, position, token);
          return lspResult || getFallbackDefinition(model, name);
        },
      });
    }

    if (monaco.languages.registerImplementationProvider) {
      monaco.languages.registerImplementationProvider(language, {
        async provideImplementation(model, position, token) {
          const name = getWordAtPosition(model, position);
          if (!name || model.getValueLength() > NAVIGATION_CONTENT_LIMIT) return undefined;
          const lspResult = await getMonacoLspBridge()?.provideImplementation(model, position, token);
          return lspResult || getFallbackDefinition(model, name);
        },
      });
    }

    if (monaco.languages.registerDocumentSymbolProvider) {
      monaco.languages.registerDocumentSymbolProvider(language, {
        async provideDocumentSymbols(model, token) {
          if (model.getValueLength() > NAVIGATION_CONTENT_LIMIT) return [];
          const lspResult = await getMonacoLspBridge()?.provideDocumentSymbols(model, token);
          return lspResult || getFallbackDocumentSymbols(model);
        },
      });
    }

    if (monaco.languages.registerReferenceProvider) {
      monaco.languages.registerReferenceProvider(language, {
        async provideReferences(model, position, context, token) {
          if (model.getValueLength() > NAVIGATION_CONTENT_LIMIT) return undefined;
          const lspResult = await getMonacoLspBridge()?.provideReferences(model, position, context, token);
          if (lspResult) return lspResult;
          const name = getWordAtPosition(model, position);
          return name ? findFallbackReferences(name, getNavigationModels()) : undefined;
        },
      });
    }

    if (monaco.languages.registerRenameProvider) {
      monaco.languages.registerRenameProvider(language, {
        async provideRenameEdits(model, position, newName, token) {
          if (model.getValueLength() > NAVIGATION_CONTENT_LIMIT) return undefined;
          return (await getMonacoLspBridge()?.provideRenameEdits(model, position, newName, token)) || undefined;
        },
      });
    }

    if (LSP_TOOLING_LANGUAGES.includes(language) && monaco.languages.registerCompletionItemProvider) {
      monaco.languages.registerCompletionItemProvider(language, {
        triggerCharacters: ['.', ':', '<', '"', "'", '/', '@'],
        async provideCompletionItems(model, position, context, token) {
          return await getMonacoLspBridge()?.provideCompletion(model, position, context, token) || { suggestions: [] };
        },
      });
    }

    if (LSP_TOOLING_LANGUAGES.includes(language) && monaco.languages.registerSignatureHelpProvider) {
      monaco.languages.registerSignatureHelpProvider(language, {
        signatureHelpTriggerCharacters: ['(', ','],
        signatureHelpRetriggerCharacters: [')'],
        provideSignatureHelp(model, position, token, context) {
          return getMonacoLspBridge()?.provideSignatureHelp(model, position, context, token);
        },
      });
    }

    if (LSP_TOOLING_LANGUAGES.includes(language) && monaco.languages.registerCodeActionProvider) {
      monaco.languages.registerCodeActionProvider(language, {
        provideCodeActions(model, range, context, token) {
          return getMonacoLspBridge()?.provideCodeActions(model, range, context, token);
        },
      });
    }

    if (LSP_TOOLING_LANGUAGES.includes(language) && monaco.languages.registerDocumentFormattingEditProvider) {
      monaco.languages.registerDocumentFormattingEditProvider(language, {
        provideDocumentFormattingEdits(model, options, token) {
          return getMonacoLspBridge()?.provideDocumentFormattingEdits(model, options, token);
        },
      });
    }

    if (LSP_TOOLING_LANGUAGES.includes(language) && monaco.languages.registerDocumentSemanticTokensProvider) {
      monaco.languages.registerDocumentSemanticTokensProvider(language, {
        getLegend: () => getMonacoLspBridge()?.getSemanticTokensLegend() || { tokenTypes: [], tokenModifiers: [] },
        provideDocumentSemanticTokens(model, lastResultId, token) {
          return getMonacoLspBridge()?.provideDocumentSemanticTokens(model, lastResultId, token);
        },
        releaseDocumentSemanticTokens(resultId) {
          getMonacoLspBridge()?.releaseDocumentSemanticTokens(resultId);
        },
      });
    }

    if (LSP_TOOLING_LANGUAGES.includes(language) && monaco.languages.registerInlayHintsProvider) {
      monaco.languages.registerInlayHintsProvider(language, {
        provideInlayHints(model, range, token) {
          return getMonacoLspBridge()?.provideInlayHints(model, range, token);
        },
      });
    }
  }
}

/**
 * 将编辑器模型登记到 LSP Bridge。没有配置 Bridge 时保持 no-op，保证 regex 导航可用。
 */
export function registerMonacoLspModel(
  model: monaco.editor.ITextModel,
  context: MonacoLspModelContext = {},
): string {
  return getMonacoLspBridge()?.registerModel(model, context) || model.uri.toString();
}

/**
 * 注册跨文件打开器。Monaco 默认只能打开已经存在的模型，外部工作区需要在
 * LSP 返回 file:// 位置时先把文件加入应用标签，再由应用编辑器定位选区。
 */
export function registerMonacoEditorOpener(
  opener: monaco.editor.ICodeEditorOpener,
): monaco.IDisposable {
  if (typeof monaco.editor.registerEditorOpener !== 'function') {
    return { dispose: () => undefined };
  }
  return monaco.editor.registerEditorOpener(opener);
}

/** 清理被销毁的 Monaco 模型在 LSP Bridge 中的 URI 和文档会话。 */
export function unregisterMonacoLspModel(model: monaco.editor.ITextModel): void {
  getMonacoLspBridge()?.unregisterModel(model);
}

/** 将 Monaco 当前文本同步到已注入的 LSP client；未配置时保持 no-op。 */
export function syncMonacoLspModel(
  model: monaco.editor.ITextModel,
  context: MonacoLspModelContext = {},
): void {
  const bridge = getMonacoLspBridge();
  if (!bridge) return;
  bridge.registerModel(model, context);
  void bridge.syncModel(model).catch((error) => {
    console.warn('[MonacoSetup] LSP 文档同步失败，编辑器保持可用：', error);
  });
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
  registerCodeNavigationProviders();
  monacoSetupComplete = true;
}
