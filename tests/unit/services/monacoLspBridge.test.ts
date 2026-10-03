import { describe, expect, it, vi } from 'vitest';
import * as monaco from '@/lib/monaco/editor';
import {
  MonacoLspBridge,
  type MonacoLspClient,
} from '@/services/lsp/monacoLspBridge';

function createModel() {
  const uri = monaco.Uri.parse('file:///workspace/src/service.ts');
  return {
    uri,
    getValue: () => 'const answer = 42;\nanswer;\n',
    getLanguageId: () => 'typescript',
    getVersionId: () => 1,
  } as unknown as monaco.editor.ITextModel;
}

describe('MonacoLspBridge', () => {
  it('maps LSP definitions to Monaco locations and sends UTF-16 positions', async () => {
    const model = createModel();
    const request = vi.fn().mockResolvedValue({
      uri: 'file:///workspace/src/constants.ts',
      range: {
        start: { line: 3, character: 2 },
        end: { line: 3, character: 8 },
      },
    });
    const client: MonacoLspClient = {
      request,
      notify: vi.fn().mockResolvedValue(undefined),
    };
    const bridge = new MonacoLspBridge({
      resolveClient: () => client,
    });
    bridge.registerModel(model, { uri: model.uri.toString() });

    const result = await bridge.provideDefinition(model, new monaco.Position(2, 3));

    expect(request).toHaveBeenCalledWith(
      'textDocument/definition',
      expect.objectContaining({
        textDocument: { uri: model.uri.toString() },
        position: { line: 1, character: 2 },
      }),
      expect.anything(),
    );
    expect(result).toEqual({
      uri: monaco.Uri.parse('file:///workspace/src/constants.ts'),
      range: {
        startLineNumber: 4,
        startColumn: 3,
        endLineNumber: 4,
        endColumn: 9,
      },
    });
  });

  it('maps references and workspace rename edits', async () => {
    const model = createModel();
    const request = vi.fn()
      .mockResolvedValueOnce([
        {
          uri: model.uri.toString(),
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 6 },
          },
        },
      ])
      .mockResolvedValueOnce({
        changes: {
          [model.uri.toString()]: [
            {
              range: {
                start: { line: 1, character: 0 },
                end: { line: 1, character: 6 },
              },
              newText: 'result',
            },
          ],
        },
      });
    const client: MonacoLspClient = {
      request,
      notify: vi.fn().mockResolvedValue(undefined),
    };
    const bridge = new MonacoLspBridge({ resolveClient: () => client });
    bridge.registerModel(model, { uri: model.uri.toString() });

    const references = await bridge.provideReferences(model, new monaco.Position(2, 1));
    const rename = await bridge.provideRenameEdits(model, new monaco.Position(2, 1), 'result');

    expect(references).toHaveLength(1);
    expect(references[0]?.range.startLineNumber).toBe(2);
    const edit = rename?.edits[0] as monaco.languages.IWorkspaceTextEdit | undefined;
    expect(edit?.resource.toString()).toBe(model.uri.toString());
    expect(edit?.textEdit.text).toBe('result');
    expect(edit?.textEdit.range.startLineNumber).toBe(2);
  });

  it('keeps workspace edit ranges correct for unopened target files', async () => {
    const model = createModel();
    const targetUri = 'file:///workspace/src/other.ts';
    const request = vi.fn().mockResolvedValue({
      changes: {
        [targetUri]: [{
          range: {
            start: { line: 5, character: 2 },
            end: { line: 5, character: 8 },
          },
          newText: 'result',
        }],
      },
    });
    const client: MonacoLspClient = { request, notify: vi.fn().mockResolvedValue(undefined) };
    const bridge = new MonacoLspBridge({ resolveClient: () => client });
    bridge.registerModel(model, { uri: model.uri.toString() });

    const rename = await bridge.provideRenameEdits(model, new monaco.Position(2, 1), 'result');
    const edit = rename?.edits[0] as monaco.languages.IWorkspaceTextEdit | undefined;

    expect(edit?.resource.toString()).toBe(targetUri);
    expect(edit?.textEdit.range).toMatchObject({
      startLineNumber: 6,
      startColumn: 3,
      endLineNumber: 6,
      endColumn: 9,
    });
  });

  it('requests declaration, type definition, and implementation locations', async () => {
    const model = createModel();
    const request = vi.fn()
      .mockResolvedValueOnce({
        uri: 'file:///workspace/src/declarations.ts',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
      })
      .mockResolvedValueOnce({
        uri: 'file:///workspace/src/types.ts',
        range: { start: { line: 1, character: 2 }, end: { line: 1, character: 8 } },
      })
      .mockResolvedValueOnce([{ targetUri: 'file:///workspace/src/impl.ts', targetRange: { start: { line: 2, character: 1 }, end: { line: 2, character: 7 } } }]);
    const client: MonacoLspClient = { request, notify: vi.fn().mockResolvedValue(undefined) };
    const bridge = new MonacoLspBridge({ resolveClient: () => client });
    bridge.registerModel(model, { uri: model.uri.toString() });

    const declaration = await bridge.provideDeclaration(model, new monaco.Position(2, 1));
    const typeDefinition = await bridge.provideTypeDefinition(model, new monaco.Position(2, 1));
    const implementation = await bridge.provideImplementation(model, new monaco.Position(2, 1));

    expect(request.mock.calls.map(([method]) => method)).toEqual([
      'textDocument/declaration',
      'textDocument/typeDefinition',
      'textDocument/implementation',
    ]);
    expect((declaration as monaco.languages.Location).uri.toString()).toBe('file:///workspace/src/declarations.ts');
    expect((typeDefinition as monaco.languages.Location).range.startLineNumber).toBe(2);
    const implementationLocation = Array.isArray(implementation) ? implementation[0] : implementation;
    expect(implementationLocation?.uri.toString()).toBe('file:///workspace/src/impl.ts');
  });

  it('maps document and workspace symbols to Monaco symbol contracts', async () => {
    const model = createModel();
    const request = vi.fn()
      .mockResolvedValueOnce([
        {
          name: 'Answer',
          detail: 'const Answer = 42',
          kind: 13,
          range: { start: { line: 0, character: 6 }, end: { line: 0, character: 12 } },
          selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 12 } },
        },
      ])
      .mockResolvedValueOnce([
        {
          name: 'Answer',
          kind: 13,
          containerName: 'constants',
          location: {
            uri: 'file:///workspace/src/constants.ts',
            range: { start: { line: 2, character: 0 }, end: { line: 2, character: 6 } },
          },
        },
      ]);
    const client: MonacoLspClient = { request, notify: vi.fn().mockResolvedValue(undefined) };
    const bridge = new MonacoLspBridge({ resolveClient: () => client });
    bridge.registerModel(model, { uri: model.uri.toString() });

    const documentSymbols = await bridge.provideDocumentSymbols(model);
    const workspaceSymbols = await bridge.provideWorkspaceSymbols(model, 'Answer');

    expect(documentSymbols?.[0]).toMatchObject({ name: 'Answer', kind: monaco.languages.SymbolKind.Variable });
    expect(documentSymbols?.[0]?.range.startLineNumber).toBe(1);
    expect(workspaceSymbols?.[0]).toMatchObject({
      name: 'Answer',
      containerName: 'constants',
      kind: monaco.languages.SymbolKind.Variable,
    });
    expect(workspaceSymbols?.[0]?.location.uri.toString()).toBe('file:///workspace/src/constants.ts');
    expect(request.mock.calls.map(([method]) => method)).toEqual([
      'textDocument/documentSymbol',
      'workspace/symbol',
    ]);
  });

  it('maps LSP completion and signature help responses', async () => {
    const model = createModel();
    const request = vi.fn()
      .mockResolvedValueOnce({
        isIncomplete: true,
        items: [
          {
            label: 'map',
            kind: 3,
            detail: '(callback) => Array',
            documentation: { kind: 'markdown', value: '**map** docs' },
            insertText: 'map(${1:callback})',
            insertTextFormat: 2,
            textEdit: {
              range: { start: { line: 1, character: 0 }, end: { line: 1, character: 6 } },
              newText: 'map(${1:callback})',
            },
            tags: [1],
            sortText: '0',
            filterText: 'map',
            commitCharacters: ['('],
          },
        ],
      })
      .mockResolvedValueOnce({
        signatures: [{
          label: 'map(callback)',
          documentation: { kind: 'markdown', value: 'maps values' },
          parameters: [{ label: [4, 12], documentation: 'callback function' }],
        }],
        activeSignature: 0,
        activeParameter: 0,
      });
    const client: MonacoLspClient = { request, notify: vi.fn().mockResolvedValue(undefined) };
    const bridge = new MonacoLspBridge({ resolveClient: () => client });
    bridge.registerModel(model, { uri: model.uri.toString() });

    const completion = await bridge.provideCompletion(model, new monaco.Position(2, 3), {
      triggerKind: monaco.languages.CompletionTriggerKind.TriggerCharacter,
      triggerCharacter: '.',
    });
    const signature = await bridge.provideSignatureHelp(model, new monaco.Position(2, 3), {
      triggerKind: monaco.languages.SignatureHelpTriggerKind.TriggerCharacter,
      triggerCharacter: '(',
      isRetrigger: false,
    });

    expect(completion).toMatchObject({ incomplete: true });
    expect(completion?.suggestions[0]).toMatchObject({
      label: 'map',
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: 'map(${1:callback})',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '(callback) => Array',
      documentation: { value: '**map** docs', isTrusted: true },
      tags: [monaco.languages.CompletionItemTag.Deprecated],
    });
    expect(signature?.value.signatures[0]).toMatchObject({
      label: 'map(callback)',
      documentation: { value: 'maps values', isTrusted: true },
      parameters: [{ label: [4, 12], documentation: 'callback function' }],
    });
    expect(request.mock.calls.map(([method]) => method)).toEqual([
      'textDocument/completion',
      'textDocument/signatureHelp',
    ]);
  });

  it('maps code actions, formatting, semantic tokens, and inlay hints', async () => {
    const model = createModel();
    const request = vi.fn()
      .mockResolvedValueOnce([
        {
          title: 'Fix answer',
          kind: 'quickfix',
          isPreferred: true,
          edit: { changes: { [model.uri.toString()]: [{
            range: { start: { line: 0, character: 6 }, end: { line: 0, character: 12 } },
            newText: 'result',
          }] } },
        },
      ])
      .mockResolvedValueOnce([{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, newText: '// answer\n' }])
      .mockResolvedValueOnce({ resultId: 'tokens-1', data: [0, 0, 6, 1, 0] })
      .mockResolvedValueOnce([
        {
          position: { line: 1, character: 6 },
          label: 'number',
          kind: 1,
          tooltip: { kind: 'markdown', value: 'inferred type' },
          paddingLeft: true,
        },
      ]);
    const client: MonacoLspClient = { request, notify: vi.fn().mockResolvedValue(undefined) };
    const bridge = new MonacoLspBridge({
      resolveClient: () => client,
      semanticTokensLegend: { tokenTypes: ['variable'], tokenModifiers: [] },
    });
    bridge.registerModel(model, { uri: model.uri.toString() });

    const range = new monaco.Range(1, 1, 1, 7);
    const actions = await bridge.provideCodeActions(model, range, {
      markers: [],
      only: 'quickfix',
      trigger: monaco.languages.CodeActionTriggerType.Invoke,
    });
    const formatting = await bridge.provideDocumentFormattingEdits(model, { tabSize: 2, insertSpaces: true });
    const tokens = await bridge.provideDocumentSemanticTokens(model, null);
    const hints = await bridge.provideInlayHints(model, range);

    expect(actions?.actions[0]).toMatchObject({ title: 'Fix answer', kind: 'quickfix', isPreferred: true });
    expect(actions?.actions[0]?.edit?.edits[0]?.textEdit.text).toBe('result');
    expect(formatting?.[0]?.text).toBe('// answer\n');
    expect(tokens).toEqual({ resultId: 'tokens-1', data: new Uint32Array([0, 0, 6, 1, 0]) });
    expect(hints?.hints[0]).toMatchObject({ label: 'number', kind: monaco.languages.InlayHintKind.Type, paddingLeft: true });
    expect(hints?.hints[0]?.tooltip).toEqual({ value: 'inferred type', isTrusted: true });
  });

  it('maps call and type hierarchy items and relationships', async () => {
    const model = createModel();
    const item = {
      name: 'answer',
      kind: 12,
      detail: '() => number',
      uri: model.uri.toString(),
      range: { start: { line: 0, character: 6 }, end: { line: 0, character: 12 } },
      selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 12 } },
    };
    const parent = { ...item, name: 'BaseAnswer', kind: 5 };
    const child = { ...item, name: 'DerivedAnswer', kind: 5 };
    const request = vi.fn()
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([{ from: item, fromRanges: [item.range] }])
      .mockResolvedValueOnce([{ to: item, fromRanges: [item.range] }])
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([parent])
      .mockResolvedValueOnce([child]);
    const client: MonacoLspClient = { request, notify: vi.fn().mockResolvedValue(undefined) };
    const bridge = new MonacoLspBridge({ resolveClient: () => client });
    bridge.registerModel(model, { uri: model.uri.toString() });

    const calls = await bridge.prepareCallHierarchy(model, new monaco.Position(1, 7));
    const incoming = await bridge.provideIncomingCalls(model, calls![0]!);
    const outgoing = await bridge.provideOutgoingCalls(model, calls![0]!);
    const types = await bridge.prepareTypeHierarchy(model, new monaco.Position(1, 7));
    const supertypes = await bridge.provideTypeHierarchySupertypes(model, types![0]!);
    const subtypes = await bridge.provideTypeHierarchySubtypes(model, types![0]!);

    expect(calls?.[0]).toMatchObject({ name: 'answer', detail: '() => number' });
    expect(incoming?.[0]?.from.name).toBe('answer');
    expect(outgoing?.[0]?.to.name).toBe('answer');
    expect(supertypes?.[0]?.item.name).toBe('BaseAnswer');
    expect(subtypes?.[0]?.item.name).toBe('DerivedAnswer');
    expect(request.mock.calls.map(([method]) => method)).toEqual([
      'textDocument/prepareCallHierarchy',
      'callHierarchy/incomingCalls',
      'callHierarchy/outgoingCalls',
      'textDocument/prepareTypeHierarchy',
      'typeHierarchy/supertypes',
      'typeHierarchy/subtypes',
    ]);
  });

  it('returns empty provider results and passes Monaco cancellation to LSP', async () => {
    const model = createModel();
    const request = vi.fn()
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce(null);
    const client: MonacoLspClient = { request, notify: vi.fn().mockResolvedValue(undefined) };
    const bridge = new MonacoLspBridge({ resolveClient: () => client });
    bridge.registerModel(model, { uri: model.uri.toString() });
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: vi.fn() }),
    } as unknown as monaco.CancellationToken;

    const completion = await bridge.provideCompletion(model, new monaco.Position(1, 1), undefined, token);
    const signature = await bridge.provideSignatureHelp(model, new monaco.Position(1, 1), undefined, token);

    expect(completion).toEqual({ suggestions: [], incomplete: undefined });
    expect(signature).toBeUndefined();
    expect(request.mock.calls[0]?.[2]).toEqual({ signal: expect.any(AbortSignal) });
  });
});
