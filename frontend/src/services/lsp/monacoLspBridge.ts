/**
 * @description 将 LSP JSON-RPC 能力适配为 Monaco Provider，并在 LSP 不可用时允许上层降级。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 10:08
 */

import * as monaco from '@/lib/monaco/editor';
import { DocumentStore } from './documentStore';
import { pathToUri } from './pathUri';
import {
  lspRangeToMonaco,
  monacoRangeToLsp,
  monacoPositionToLsp,
  type MonacoRange,
} from './utf16';
import type {
  LspPosition,
  LspRange,
  TextDocumentContentChangeEvent,
} from './types';

/** 供 Monaco Bridge 使用的最小 LSP Client 契约。 */
export interface MonacoLspClient {
  request<T = unknown>(method: string, params?: unknown, options?: { signal?: AbortSignal }): Promise<T>;
  notify?(method: string, params?: unknown): Promise<void>;
  onNotification?(method: string, handler: (params: unknown) => void | Promise<void>): () => void;
}

export interface MonacoLspModelContext {
  /** 优先使用真实文件 URI；未保存文档可以传入 untitled URI。 */
  uri?: string;
  filePath?: string | null;
  languageId?: string;
}

export type MonacoLspClientResolver = (
  model: monaco.editor.ITextModel,
  context: Required<Pick<MonacoLspModelContext, 'uri'>> & MonacoLspModelContext,
) => MonacoLspClient | null | undefined | Promise<MonacoLspClient | null | undefined>;

export interface MonacoLspDiagnostics {
  uri: string;
  diagnostics: monaco.editor.IMarkerData[];
}

export interface MonacoLspBridgeOptions {
  resolveClient?: MonacoLspClientResolver;
  onDiagnostics?: (event: MonacoLspDiagnostics) => void;
  semanticTokensLegend?: monaco.languages.SemanticTokensLegend;
}

export interface LspTextEdit {
  range: LspRange;
  newText: string;
}

export interface LspLocation {
  uri: string;
  range: LspRange;
}

export interface LspLocationLink {
  targetUri: string;
  targetRange: LspRange;
  targetSelectionRange?: LspRange;
}

/** LSP 文档/工作区符号信息。LSP 的 SymbolKind 从 1 开始，映射时会转换为 Monaco 枚举。 */
export interface LspSymbolInformation {
  name: string;
  kind: number;
  tags?: number[];
  containerName?: string;
  location: LspLocation | LspLocationLink;
}

export interface LspDocumentSymbol {
  name: string;
  detail?: string;
  kind: number;
  tags?: number[];
  range: LspRange;
  selectionRange: LspRange;
  children?: LspDocumentSymbol[];
}

export interface MonacoWorkspaceSymbol {
  name: string;
  kind: monaco.languages.SymbolKind;
  containerName?: string;
  location: monaco.languages.Location;
}

/** LSP call/type hierarchy item，保留 raw item 供后续层级请求继续回传。 */
export interface MonacoHierarchyItem {
  name: string;
  kind: monaco.languages.SymbolKind;
  detail?: string;
  uri: monaco.Uri;
  range: monaco.IRange;
  selectionRange: monaco.IRange;
  raw: LspHierarchyItem;
}

export interface LspHierarchyItem {
  name: string;
  kind: number;
  detail?: string;
  uri: string;
  range: LspRange;
  selectionRange: LspRange;
  tags?: number[];
  data?: unknown;
}

export interface MonacoCallHierarchyIncomingCall {
  from: MonacoHierarchyItem;
  fromRanges: monaco.IRange[];
}

export interface MonacoCallHierarchyOutgoingCall {
  to: MonacoHierarchyItem;
  fromRanges: monaco.IRange[];
}

export interface MonacoTypeHierarchyRelation {
  item: MonacoHierarchyItem;
}

export interface LspHover {
  contents: string | { kind?: string; value: string } | Array<string | { kind?: string; value: string }>;
  range?: LspRange;
}

export interface LspWorkspaceEdit {
  changes?: Record<string, LspTextEdit[]>;
  documentChanges?: Array<{
    textDocument?: { uri?: string; version?: number | null };
    edits?: LspTextEdit[];
  }>;
}

export interface LspDiagnostic {
  range: LspRange;
  message: string;
  severity?: number;
  source?: string;
  code?: string | number;
  relatedInformation?: Array<{
    location?: LspLocation;
    message: string;
  }>;
}

export interface LspPublishDiagnosticsParams {
  uri: string;
  diagnostics: LspDiagnostic[];
}

export interface LspCompletionItem {
  label: string | { label: string; detail?: string; description?: string };
  kind?: number;
  detail?: string;
  documentation?: string | { kind?: string; value: string };
  sortText?: string;
  filterText?: string;
  preselect?: boolean;
  insertText?: string;
  insertTextFormat?: number;
  textEdit?: { range: LspRange; newText: string } | { insert: LspRange; replace: LspRange; newText: string };
  additionalTextEdits?: LspTextEdit[];
  commitCharacters?: string[];
  tags?: number[];
  command?: { title: string; command: string; arguments?: unknown[] };
}

export interface LspCompletionList {
  isIncomplete?: boolean;
  items: LspCompletionItem[];
}

export interface LspSignatureInformation {
  label: string;
  documentation?: string | { kind?: string; value: string };
  parameters?: Array<{
    label: string | [number, number];
    documentation?: string | { kind?: string; value: string };
  }>;
}

export interface LspSignatureHelp {
  signatures: LspSignatureInformation[];
  activeSignature?: number;
  activeParameter?: number;
}

export interface LspCodeAction {
  title: string;
  kind?: string;
  diagnostics?: LspDiagnostic[];
  isPreferred?: boolean;
  disabled?: { reason: string };
  edit?: LspWorkspaceEdit;
  command?: { title: string; command: string; arguments?: unknown[] };
}

export interface LspFormattingOptions {
  tabSize: number;
  insertSpaces: boolean;
  [key: string]: boolean | number | string;
}

export interface LspSemanticTokens {
  resultId?: string;
  data: number[];
}

export interface LspInlayHint {
  position: LspPosition;
  label: string | Array<{
    value?: string;
    label?: string;
    tooltip?: string | { kind?: string; value: string };
    location?: LspLocation;
    command?: { title: string; command: string; arguments?: unknown[] };
  }>;
  kind?: number;
  tooltip?: string | { kind?: string; value: string };
  textEdits?: LspTextEdit[];
  paddingLeft?: boolean;
  paddingRight?: boolean;
}

interface RegisteredModel {
  uri: string;
  filePath?: string | null;
  languageId: string;
}

interface CancellationHandle {
  signal?: AbortSignal;
  dispose: () => void;
}

const NOOP_CANCELLATION: CancellationHandle = {
  signal: undefined,
  dispose: () => undefined,
};

function getCancellationHandle(token?: monaco.CancellationToken): CancellationHandle {
  if (!token?.onCancellationRequested) {
    return NOOP_CANCELLATION;
  }

  const controller = new AbortController();
  if (token.isCancellationRequested) {
    controller.abort();
  }
  const disposable = token.onCancellationRequested(() => controller.abort());
  return {
    signal: controller.signal,
    dispose: () => disposable.dispose(),
  };
}

function toLspTextDocument(uri: string) {
  return { uri };
}

function isLocationLink(value: LspLocation | LspLocationLink): value is LspLocationLink {
  return 'targetUri' in value;
}

function isSymbolInformation(value: LspSymbolInformation | LspDocumentSymbol): value is LspSymbolInformation {
  return 'location' in value;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function directMonacoRange(range: LspRange): MonacoRange {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

/**
 * LSP 到 Monaco 的桥接器。它不负责选择语言服务器，只接受外部注入的 client resolver，
 * 因而可以在桌面端接入 Tauri，也能在单测或 Web 模式使用内存 JSON-RPC client。
 */
export class MonacoLspBridge {
  private readonly models = new WeakMap<monaco.editor.ITextModel, RegisteredModel>();
  private readonly modelsByUri = new Map<string, monaco.editor.ITextModel>();
  private readonly stores = new WeakMap<object, DocumentStore>();
  private readonly diagnosticSubscriptions = new WeakMap<object, () => void>();

  constructor(private readonly options: MonacoLspBridgeOptions = {}) {}

  registerModel(model: monaco.editor.ITextModel, context: MonacoLspModelContext = {}): string {
    const previous = this.models.get(model);
    if (previous && previous.uri !== context.uri && this.modelsByUri.get(previous.uri) === model) {
      this.modelsByUri.delete(previous.uri);
    }
    const uri = context.uri
      || (context.filePath ? pathToUri(context.filePath) : model.uri.toString());
    const registered: RegisteredModel = {
      uri,
      filePath: context.filePath,
      languageId: context.languageId || model.getLanguageId(),
    };
    this.models.set(model, registered);
    this.modelsByUri.set(uri, model);
    return uri;
  }

  unregisterModel(model: monaco.editor.ITextModel): void {
    const registered = this.models.get(model);
    if (!registered) return;
    this.models.delete(model);
    if (this.modelsByUri.get(registered.uri) === model) {
      this.modelsByUri.delete(registered.uri);
    }
    const clientPromise = this.resolveClient(model, registered);
    void clientPromise.then((client) => {
      if (!client) return;
      const store = this.stores.get(client);
      if (!store?.has(registered.uri)) return;
      return store.close(registered.uri).catch(() => undefined);
    });
  }

  getModelUri(model: monaco.editor.ITextModel): string {
    return this.models.get(model)?.uri || model.uri.toString();
  }

  /** 判断当前模型是否能解析到可用语言服务器，供上层决定是否走原生 fallback。 */
  async hasClient(model: monaco.editor.ITextModel): Promise<boolean> {
    const registered = this.getRegisteredModel(model);
    return Boolean(await this.resolveClient(model, registered));
  }

  async syncModel(
    model: monaco.editor.ITextModel,
    changes?: readonly TextDocumentContentChangeEvent[],
  ): Promise<void> {
    const registered = this.getRegisteredModel(model);
    const client = await this.resolveClient(model, registered);
    if (!client || !client.notify) return;
    const store = this.getDocumentStore(client);
    if (!store.has(registered.uri)) {
      await store.open({
        uri: registered.uri,
        languageId: registered.languageId || model.getLanguageId(),
        text: model.getValue(),
        version: model.getVersionId(),
      });
      return;
    }
    const document = store.get(registered.uri);
    if (document?.text === model.getValue()) return;
    await store.change(registered.uri, model.getValue(), changes);
  }

  /** 将当前模型内容以 didSave 通知发送给语言服务器。 */
  async saveModel(model: monaco.editor.ITextModel): Promise<void> {
    const registered = this.getRegisteredModel(model);
    const client = await this.resolveClient(model, registered);
    if (!client || !client.notify) return;
    await this.ensureDocument(model, registered, client);
    const store = this.getDocumentStore(client);
    if (store.has(registered.uri)) {
      await store.save(registered.uri, model.getValue());
    }
  }

  async provideDefinition(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    token?: monaco.CancellationToken,
  ): Promise<monaco.languages.Definition | undefined> {
    return this.provideLocationResult(model, 'textDocument/definition', position, token);
  }

  async provideDeclaration(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    token?: monaco.CancellationToken,
  ): Promise<monaco.languages.Definition | undefined> {
    return this.provideLocationResult(model, 'textDocument/declaration', position, token);
  }

  async provideTypeDefinition(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    token?: monaco.CancellationToken,
  ): Promise<monaco.languages.Definition | undefined> {
    return this.provideLocationResult(model, 'textDocument/typeDefinition', position, token);
  }

  async provideImplementation(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    token?: monaco.CancellationToken,
  ): Promise<monaco.languages.Definition | undefined> {
    return this.provideLocationResult(model, 'textDocument/implementation', position, token);
  }

  async prepareCallHierarchy(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    token?: monaco.CancellationToken,
  ): Promise<MonacoHierarchyItem[] | undefined> {
    const response = await this.requestForModel<LspHierarchyItem[] | null>(
      model,
      'textDocument/prepareCallHierarchy',
      {
        textDocument: toLspTextDocument(this.getModelUri(model)),
        position: monacoPositionToLsp(position, model.getValue()),
      },
      token,
    );
    if (!response) return undefined;
    return response.map((item) => this.mapHierarchyItem(item, model)).filter(Boolean) as MonacoHierarchyItem[];
  }

  async provideIncomingCalls(
    model: monaco.editor.ITextModel,
    item: MonacoHierarchyItem,
    token?: monaco.CancellationToken,
  ): Promise<MonacoCallHierarchyIncomingCall[] | undefined> {
    const response = await this.requestForModel<Array<{ from: LspHierarchyItem; fromRanges: LspRange[] }> | null>(
      model,
      'callHierarchy/incomingCalls',
      { item: item.raw },
      token,
    );
    if (!response) return undefined;
    return response.map((entry) => ({
      from: this.mapHierarchyItem(entry.from, model),
      fromRanges: entry.fromRanges.map((range) => this.mapRange(range, model)),
    }));
  }

  async provideOutgoingCalls(
    model: monaco.editor.ITextModel,
    item: MonacoHierarchyItem,
    token?: monaco.CancellationToken,
  ): Promise<MonacoCallHierarchyOutgoingCall[] | undefined> {
    const response = await this.requestForModel<Array<{ to: LspHierarchyItem; fromRanges: LspRange[] }> | null>(
      model,
      'callHierarchy/outgoingCalls',
      { item: item.raw },
      token,
    );
    if (!response) return undefined;
    return response.map((entry) => ({
      to: this.mapHierarchyItem(entry.to, model),
      fromRanges: entry.fromRanges.map((range) => this.mapRange(range, model)),
    }));
  }

  async prepareTypeHierarchy(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    token?: monaco.CancellationToken,
  ): Promise<MonacoHierarchyItem[] | undefined> {
    const response = await this.requestForModel<LspHierarchyItem[] | null>(
      model,
      'textDocument/prepareTypeHierarchy',
      {
        textDocument: toLspTextDocument(this.getModelUri(model)),
        position: monacoPositionToLsp(position, model.getValue()),
      },
      token,
    );
    if (!response) return undefined;
    return response.map((item) => this.mapHierarchyItem(item, model)).filter(Boolean) as MonacoHierarchyItem[];
  }

  async provideTypeHierarchySupertypes(
    model: monaco.editor.ITextModel,
    item: MonacoHierarchyItem,
    token?: monaco.CancellationToken,
  ): Promise<MonacoTypeHierarchyRelation[] | undefined> {
    return this.provideTypeHierarchyRelations(model, 'typeHierarchy/supertypes', item, token);
  }

  async provideTypeHierarchySubtypes(
    model: monaco.editor.ITextModel,
    item: MonacoHierarchyItem,
    token?: monaco.CancellationToken,
  ): Promise<MonacoTypeHierarchyRelation[] | undefined> {
    return this.provideTypeHierarchyRelations(model, 'typeHierarchy/subtypes', item, token);
  }

  async provideDocumentSymbols(
    model: monaco.editor.ITextModel,
    token?: monaco.CancellationToken,
  ): Promise<monaco.languages.DocumentSymbol[] | undefined> {
    const response = await this.requestForModel<LspDocumentSymbol[] | LspSymbolInformation[]>(
      model,
      'textDocument/documentSymbol',
      { textDocument: toLspTextDocument(this.getModelUri(model)) },
      token,
    );
    if (!response || response.length === 0) return undefined;
    const first = response[0];
    if (!first) return undefined;
    if (isSymbolInformation(first)) {
      return (response as LspSymbolInformation[])
        .map((symbol) => {
          const location = this.mapLocation(symbol.location);
          if (!location) return null;
          return {
            name: symbol.name,
            detail: symbol.containerName || '',
            kind: this.mapSymbolKind(symbol.kind),
            tags: this.mapSymbolTags(symbol.tags),
            range: location.range,
            selectionRange: location.range,
          } satisfies monaco.languages.DocumentSymbol;
        })
        .filter(Boolean) as monaco.languages.DocumentSymbol[];
    }
    return (response as LspDocumentSymbol[]).map((symbol) => this.mapDocumentSymbol(symbol, model));
  }

  /**
   * 请求工作区符号。Monaco 没有内置 WorkspaceSymbolProvider，因此通过此 API
   * 暴露给命令面板/侧栏等上层调用方；model 作为当前工作区的 client 锚点。
   */
  async provideWorkspaceSymbols(
    model: monaco.editor.ITextModel,
    query: string,
    token?: monaco.CancellationToken,
  ): Promise<MonacoWorkspaceSymbol[] | undefined> {
    const response = await this.requestForModel<LspSymbolInformation[]>(
      model,
      'workspace/symbol',
      { query },
      token,
    );
    if (!response) return undefined;
    return response
      .map((symbol) => {
        const location = this.mapLocation(symbol.location);
        if (!location) return null;
        return {
          name: symbol.name,
          kind: this.mapSymbolKind(symbol.kind),
          containerName: symbol.containerName,
          location,
        } satisfies MonacoWorkspaceSymbol;
      })
      .filter(Boolean) as MonacoWorkspaceSymbol[];
  }

  async provideHover(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    token?: monaco.CancellationToken,
  ): Promise<monaco.languages.Hover | undefined> {
    const response = await this.requestForModel<LspHover>(
      model,
      'textDocument/hover',
      {
        textDocument: toLspTextDocument(this.getModelUri(model)),
        position: monacoPositionToLsp(position, model.getValue()),
      },
      token,
    );
    if (!response) return undefined;
    const contents = Array.isArray(response.contents) ? response.contents : [response.contents];
    const mapped = contents
      .map((content) => typeof content === 'string'
        ? { value: content }
        : { value: content.value, isTrusted: content.kind === 'markdown' })
      .filter((content) => content.value.length > 0);
    if (mapped.length === 0) return undefined;
    const result: monaco.languages.Hover = { contents: mapped };
    if (response.range) {
      result.range = this.mapRange(response.range, model);
    }
    return result;
  }

  async provideCompletion(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context?: monaco.languages.CompletionContext,
    token?: monaco.CancellationToken,
  ): Promise<monaco.languages.CompletionList | undefined> {
    const response = await this.requestForModel<LspCompletionList | LspCompletionItem[]>(
      model,
      'textDocument/completion',
      {
        textDocument: toLspTextDocument(this.getModelUri(model)),
        position: monacoPositionToLsp(position, model.getValue()),
        context: context ? {
          triggerKind: context.triggerKind + 1,
          triggerCharacter: context.triggerCharacter,
        } : undefined,
      },
      token,
    );
    if (!response) return undefined;
    const items = Array.isArray(response) ? response : response.items;
    const suggestions = items.map((item) => this.mapCompletionItem(item, model, position));
    return {
      suggestions,
      incomplete: Array.isArray(response) ? undefined : response.isIncomplete,
    };
  }

  async provideSignatureHelp(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context?: monaco.languages.SignatureHelpContext,
    token?: monaco.CancellationToken,
  ): Promise<monaco.languages.SignatureHelpResult | undefined> {
    const response = await this.requestForModel<LspSignatureHelp>(
      model,
      'textDocument/signatureHelp',
      {
        textDocument: toLspTextDocument(this.getModelUri(model)),
        position: monacoPositionToLsp(position, model.getValue()),
        context: context ? {
          triggerKind: context.triggerKind,
          triggerCharacter: context.triggerCharacter,
          isRetrigger: context.isRetrigger,
        } : undefined,
      },
      token,
    );
    if (!response || !Array.isArray(response.signatures) || response.signatures.length === 0) return undefined;
    return {
      value: {
        signatures: response.signatures.map((signature) => ({
          label: signature.label,
          documentation: this.mapDocumentation(signature.documentation),
          parameters: (signature.parameters || []).map((parameter) => ({
            label: parameter.label,
            documentation: this.mapDocumentation(parameter.documentation),
          })),
        })),
        activeSignature: response.activeSignature ?? 0,
        activeParameter: response.activeParameter ?? 0,
      },
      dispose: () => undefined,
    };
  }

  async provideCodeActions(
    model: monaco.editor.ITextModel,
    range: monaco.Range,
    context: monaco.languages.CodeActionContext,
    token?: monaco.CancellationToken,
  ): Promise<monaco.languages.CodeActionList | undefined> {
    const response = await this.requestForModel<Array<LspCodeAction | { title: string; command: { title: string; command: string; arguments?: unknown[] } }>>(
      model,
      'textDocument/codeAction',
      {
        textDocument: toLspTextDocument(this.getModelUri(model)),
        range: this.monacoRangeToLsp(range, model),
        context: {
          diagnostics: context.markers.map((marker) => this.markerToLspDiagnostic(marker, model)),
          only: context.only,
        },
      },
      token,
    );
    if (!response) return undefined;
    const actions = response.map((action) => {
      if (!('edit' in action) && action.command) {
        return {
          title: action.title,
          command: this.mapCommand(action.command),
        } satisfies monaco.languages.CodeAction;
      }
      const mapped = action as LspCodeAction;
      return {
        title: mapped.title,
        kind: mapped.kind,
        isPreferred: mapped.isPreferred,
        disabled: mapped.disabled?.reason,
        edit: mapped.edit ? this.mapWorkspaceEdit(mapped.edit, model) : undefined,
        command: mapped.command ? this.mapCommand(mapped.command) : undefined,
      } satisfies monaco.languages.CodeAction;
    });
    return { actions, dispose: () => undefined };
  }

  async provideDocumentFormattingEdits(
    model: monaco.editor.ITextModel,
    options: monaco.languages.FormattingOptions,
    token?: monaco.CancellationToken,
  ): Promise<monaco.languages.TextEdit[] | undefined> {
    const response = await this.requestForModel<LspTextEdit[]>(
      model,
      'textDocument/formatting',
      {
        textDocument: toLspTextDocument(this.getModelUri(model)),
        options: { tabSize: options.tabSize, insertSpaces: options.insertSpaces },
      },
      token,
    );
    if (!response) return undefined;
    return response.map((edit) => ({ range: this.mapRange(edit.range, model), text: edit.newText }));
  }

  getSemanticTokensLegend(): monaco.languages.SemanticTokensLegend {
    return this.options.semanticTokensLegend || { tokenTypes: [], tokenModifiers: [] };
  }

  async provideDocumentSemanticTokens(
    model: monaco.editor.ITextModel,
    lastResultId: string | null,
    token?: monaco.CancellationToken,
  ): Promise<monaco.languages.SemanticTokens | monaco.languages.SemanticTokensEdits | undefined> {
    const response = await this.requestForModel<LspSemanticTokens | { edits: monaco.languages.SemanticTokensEdit[]; resultId?: string }>(
      model,
      'textDocument/semanticTokens/full',
      {
        textDocument: toLspTextDocument(this.getModelUri(model)),
        ...(lastResultId ? { previousResultId: lastResultId } : {}),
      },
      token,
    );
    if (!response) return undefined;
    if ('edits' in response) {
      return {
        resultId: response.resultId,
        edits: response.edits.map((edit) => ({
          start: edit.start,
          deleteCount: edit.deleteCount,
          data: edit.data ? new Uint32Array(edit.data) : undefined,
        })),
      };
    }
    return { resultId: response.resultId, data: new Uint32Array(response.data || []) };
  }

  releaseDocumentSemanticTokens(_resultId: string | undefined): void {
    // LSP full semantic token responses are immutable snapshots; no release request is required.
  }

  async provideInlayHints(
    model: monaco.editor.ITextModel,
    range: monaco.Range,
    token?: monaco.CancellationToken,
  ): Promise<monaco.languages.InlayHintList | undefined> {
    const response = await this.requestForModel<LspInlayHint[]>(
      model,
      'textDocument/inlayHint',
      {
        textDocument: toLspTextDocument(this.getModelUri(model)),
        range: this.monacoRangeToLsp(range, model),
      },
      token,
    );
    if (!response) return undefined;
    return {
      hints: response.map((hint) => ({
        position: this.mapPosition(hint.position, model),
        label: typeof hint.label === 'string'
          ? hint.label
          : hint.label.map((part) => ({
            label: part.value ?? part.label ?? '',
            tooltip: this.mapDocumentation(part.tooltip),
            location: part.location ? this.mapLocation(part.location) || undefined : undefined,
            command: part.command ? this.mapCommand(part.command) : undefined,
          })),
        tooltip: this.mapDocumentation(hint.tooltip),
        kind: hint.kind === 1 ? monaco.languages.InlayHintKind.Type
          : hint.kind === 2 ? monaco.languages.InlayHintKind.Parameter : undefined,
        textEdits: hint.textEdits?.map((edit) => ({ range: this.mapRange(edit.range, model), text: edit.newText })),
        paddingLeft: hint.paddingLeft,
        paddingRight: hint.paddingRight,
      })),
      dispose: () => undefined,
    };
  }

  async provideReferences(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.ReferenceContext = { includeDeclaration: true },
    token?: monaco.CancellationToken,
  ): Promise<monaco.languages.Location[] | undefined> {
    const response = await this.requestForModel<LspLocation[]>(
      model,
      'textDocument/references',
      {
        textDocument: toLspTextDocument(this.getModelUri(model)),
        position: monacoPositionToLsp(position, model.getValue()),
        context,
      },
      token,
    );
    if (!response) return undefined;
    const locations = response.map((location) => this.mapLocation(location)).filter(Boolean) as monaco.languages.Location[];
    return locations.length > 0 ? locations : undefined;
  }

  async provideRenameEdits(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    newName: string,
    token?: monaco.CancellationToken,
  ): Promise<monaco.languages.WorkspaceEdit | undefined> {
    const response = await this.requestForModel<LspWorkspaceEdit>(
      model,
      'textDocument/rename',
      {
        textDocument: toLspTextDocument(this.getModelUri(model)),
        position: monacoPositionToLsp(position, model.getValue()),
        newName,
      },
      token,
    );
    if (!response) return undefined;
    return this.mapWorkspaceEdit(response, model);
  }

  private async provideLocationResult(
    model: monaco.editor.ITextModel,
    method: string,
    position: monaco.Position,
    token?: monaco.CancellationToken,
  ): Promise<monaco.languages.Definition | undefined> {
    const response = await this.requestForModel<LspLocation | LspLocation[] | LspLocationLink | LspLocationLink[]>(
      model,
      method,
      {
        textDocument: toLspTextDocument(this.getModelUri(model)),
        position: monacoPositionToLsp(position, model.getValue()),
      },
      token,
    );
    if (response === null) return undefined;
    const rawLocations = asArray(response);
    const locations = rawLocations
      .map((location) => this.mapLocation(location))
      .filter(Boolean) as monaco.languages.Location[];
    if (locations.length === 0) return undefined;
    return locations.length === 1 ? locations[0] : locations;
  }

  private async requestForModel<T>(
    model: monaco.editor.ITextModel,
    method: string,
    params: unknown,
    token?: monaco.CancellationToken,
  ): Promise<T | null> {
    const registered = this.getRegisteredModel(model);
    const client = await this.resolveClient(model, registered);
    if (!client) return null;
    await this.ensureDocument(model, registered, client);
    this.ensureDiagnostics(client);
    const cancellation = getCancellationHandle(token);
    try {
      return await client.request<T>(method, params, { signal: cancellation.signal });
    } catch (error) {
      // Provider 层将 null 解释为“交给 regex fallback”，因此语言服务器异常不会阻塞编辑器。
      console.warn(`[MonacoLspBridge] ${method} 请求失败，已降级：`, error);
      return null;
    } finally {
      cancellation.dispose();
    }
  }

  private getRegisteredModel(model: monaco.editor.ITextModel): Required<Pick<MonacoLspModelContext, 'uri'>> & MonacoLspModelContext {
    const registered = this.models.get(model);
    if (registered) return registered;
    return {
      uri: model.uri.toString(),
      languageId: model.getLanguageId(),
    };
  }

  private async resolveClient(
    model: monaco.editor.ITextModel,
    context: Required<Pick<MonacoLspModelContext, 'uri'>> & MonacoLspModelContext,
  ): Promise<MonacoLspClient | null> {
    if (!this.options.resolveClient) return null;
    try {
      return (await this.options.resolveClient(model, context)) || null;
    } catch (error) {
      console.warn('[MonacoLspBridge] 无法解析 LSP client，已使用 fallback：', error);
      return null;
    }
  }

  private getDocumentStore(client: MonacoLspClient): DocumentStore {
    const key = client as unknown as object;
    const existing = this.stores.get(key);
    if (existing) return existing;
    const store = new DocumentStore({
      notify: async (method, params) => {
        if (client.notify) {
          await client.notify(method, params);
          return;
        }
        await client.request(method, params);
      },
    });
    this.stores.set(key, store);
    return store;
  }

  private async ensureDocument(
    model: monaco.editor.ITextModel,
    registered: Required<Pick<MonacoLspModelContext, 'uri'>> & MonacoLspModelContext,
    client: MonacoLspClient,
  ): Promise<void> {
    if (!client.notify) return;
    const store = this.getDocumentStore(client);
    const currentText = model.getValue();
    if (!store.has(registered.uri)) {
      await store.open({
        uri: registered.uri,
        languageId: registered.languageId || model.getLanguageId(),
        text: currentText,
        version: model.getVersionId(),
      });
      return;
    }
    const existing = store.get(registered.uri);
    if (existing?.text !== currentText) {
      await store.change(registered.uri, currentText);
    }
  }

  private mapLocation(location: LspLocation | LspLocationLink): monaco.languages.Location | null {
    const uri = isLocationLink(location) ? location.targetUri : location.uri;
    const range = isLocationLink(location) ? location.targetSelectionRange || location.targetRange : location.range;
    if (!uri || !range) return null;
    const targetModel = this.modelsByUri.get(uri) || monaco.editor.getModel(monaco.Uri.parse(uri));
    return {
      uri: monaco.Uri.parse(uri),
      range: targetModel ? this.mapRange(range, targetModel) : directMonacoRange(range),
    };
  }

  private mapHierarchyItem(item: LspHierarchyItem, sourceModel: monaco.editor.ITextModel): MonacoHierarchyItem {
    const targetModel = this.modelsByUri.get(item.uri) || monaco.editor.getModel(monaco.Uri.parse(item.uri));
    return {
      name: item.name,
      kind: this.mapSymbolKind(item.kind),
      detail: item.detail,
      uri: monaco.Uri.parse(item.uri),
      range: targetModel ? this.mapRange(item.range, targetModel) : directMonacoRange(item.range),
      selectionRange: targetModel
        ? this.mapRange(item.selectionRange || item.range, targetModel)
        : directMonacoRange(item.selectionRange || item.range),
      raw: item,
    };
  }

  private async provideTypeHierarchyRelations(
    model: monaco.editor.ITextModel,
    method: 'typeHierarchy/supertypes' | 'typeHierarchy/subtypes',
    item: MonacoHierarchyItem,
    token?: monaco.CancellationToken,
  ): Promise<MonacoTypeHierarchyRelation[] | undefined> {
    const response = await this.requestForModel<LspHierarchyItem[] | null>(model, method, { item: item.raw }, token);
    if (!response) return undefined;
    return response.map((relation) => ({ item: this.mapHierarchyItem(relation, model) }));
  }

  private mapPosition(position: LspPosition, model: monaco.editor.ITextModel): monaco.IPosition {
    const text = model.getValue();
    const line = Math.max(1, position.line + 1);
    const lineText = text.split(/\r?\n/)[line - 1] || '';
    const character = Math.max(0, Math.min(position.character, lineText.length));
    return { lineNumber: line, column: character + 1 };
  }

  private monacoRangeToLsp(range: monaco.IRange, model: monaco.editor.ITextModel): LspRange {
    return monacoRangeToLsp({
      startLineNumber: range.startLineNumber,
      startColumn: range.startColumn,
      endLineNumber: range.endLineNumber,
      endColumn: range.endColumn,
    }, model.getValue());
  }

  private markerToLspDiagnostic(marker: monaco.editor.IMarkerData, model: monaco.editor.ITextModel): LspDiagnostic {
    return {
      range: this.monacoRangeToLsp({
        startLineNumber: marker.startLineNumber,
        startColumn: marker.startColumn,
        endLineNumber: marker.endLineNumber,
        endColumn: marker.endColumn,
      }, model),
      message: marker.message,
      severity: marker.severity,
      source: marker.source,
      code: typeof marker.code === 'string' || typeof marker.code === 'number' ? marker.code : undefined,
    };
  }

  private mapDocumentation(value?: string | { kind?: string; value: string }): string | monaco.IMarkdownString | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    return { value: value.value, isTrusted: value.kind === 'markdown' };
  }

  private mapCommand(command: { title: string; command: string; arguments?: unknown[] }): monaco.languages.Command {
    return { id: command.command, title: command.title, arguments: command.arguments };
  }

  private mapCompletionKind(kind?: number): monaco.languages.CompletionItemKind {
    // LSP CompletionItemKind and Monaco CompletionItemKind have different
    // orderings (and Monaco includes extra kinds), so this cannot be an offset.
    const lspToMonaco: Record<number, monaco.languages.CompletionItemKind> = {
      1: monaco.languages.CompletionItemKind.Text,
      2: monaco.languages.CompletionItemKind.Method,
      3: monaco.languages.CompletionItemKind.Function,
      4: monaco.languages.CompletionItemKind.Constructor,
      5: monaco.languages.CompletionItemKind.Field,
      6: monaco.languages.CompletionItemKind.Variable,
      7: monaco.languages.CompletionItemKind.Class,
      8: monaco.languages.CompletionItemKind.Interface,
      9: monaco.languages.CompletionItemKind.Module,
      10: monaco.languages.CompletionItemKind.Property,
      11: monaco.languages.CompletionItemKind.Unit,
      12: monaco.languages.CompletionItemKind.Value,
      13: monaco.languages.CompletionItemKind.Enum,
      14: monaco.languages.CompletionItemKind.Keyword,
      15: monaco.languages.CompletionItemKind.Snippet,
      16: monaco.languages.CompletionItemKind.Color,
      17: monaco.languages.CompletionItemKind.File,
      18: monaco.languages.CompletionItemKind.Reference,
      19: monaco.languages.CompletionItemKind.Folder,
      20: monaco.languages.CompletionItemKind.EnumMember,
      21: monaco.languages.CompletionItemKind.Constant,
      22: monaco.languages.CompletionItemKind.Struct,
      23: monaco.languages.CompletionItemKind.Event,
      24: monaco.languages.CompletionItemKind.Operator,
      25: monaco.languages.CompletionItemKind.TypeParameter,
    };
    return Number.isInteger(kind) ? lspToMonaco[kind!] ?? monaco.languages.CompletionItemKind.Text
      : monaco.languages.CompletionItemKind.Text;
  }

  private mapCompletionItem(
    item: LspCompletionItem,
    model: monaco.editor.ITextModel,
    position: monaco.Position,
  ): monaco.languages.CompletionItem {
    const label = typeof item.label === 'string' ? item.label : item.label.label;
    const word = typeof model.getWordUntilPosition === 'function'
      ? model.getWordUntilPosition(position)
      : model.getWordAtPosition?.(position) || {
        startColumn: position.column,
        endColumn: position.column,
      };
    const defaultRange = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };
    const textEdit = item.textEdit;
    const range = textEdit && 'insert' in textEdit
      ? {
        insert: this.mapRange(textEdit.insert, model),
        replace: this.mapRange(textEdit.replace, model),
      }
      : textEdit
        ? this.mapRange(textEdit.range, model)
        : defaultRange;
    const insertText = textEdit?.newText || item.insertText || label;
    return {
      label: typeof item.label === 'string' ? item.label : item.label,
      kind: this.mapCompletionKind(item.kind),
      detail: item.detail || (typeof item.label === 'string' ? undefined : item.label.detail),
      documentation: this.mapDocumentation(item.documentation),
      sortText: item.sortText,
      filterText: item.filterText,
      preselect: item.preselect,
      insertText,
      insertTextRules: item.insertTextFormat === 2
        ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        : undefined,
      range,
      commitCharacters: item.commitCharacters,
      tags: item.tags?.filter((tag) => tag === 1).map(() => monaco.languages.CompletionItemTag.Deprecated),
      additionalTextEdits: item.additionalTextEdits?.map((edit) => ({
        range: this.mapRange(edit.range, model),
        text: edit.newText,
      })),
      command: item.command ? this.mapCommand(item.command) : undefined,
    };
  }

  private mapDocumentSymbol(
    symbol: LspDocumentSymbol,
    model: monaco.editor.ITextModel,
  ): monaco.languages.DocumentSymbol {
    return {
      name: symbol.name,
      detail: symbol.detail || '',
      kind: this.mapSymbolKind(symbol.kind),
      tags: this.mapSymbolTags(symbol.tags),
      range: this.mapRange(symbol.range, model),
      selectionRange: this.mapRange(symbol.selectionRange || symbol.range, model),
      children: symbol.children?.map((child) => this.mapDocumentSymbol(child, model)),
    };
  }

  private mapSymbolKind(kind: number): monaco.languages.SymbolKind {
    const normalized = Number.isFinite(kind) ? Math.max(0, Math.min(25, Math.trunc(kind) - 1)) : 0;
    return normalized as monaco.languages.SymbolKind;
  }

  private mapSymbolTags(tags?: number[]): monaco.languages.SymbolTag[] {
    return (tags || [])
      .filter((tag) => tag === 1)
      .map(() => monaco.languages.SymbolTag.Deprecated);
  }

  private mapRange(range: LspRange, model: monaco.editor.ITextModel): monaco.IRange {
    const text = model?.getValue?.() || '';
    return text.length > 0 ? lspRangeToMonaco(range, text) : directMonacoRange(range);
  }

  private mapWorkspaceEdit(edit: LspWorkspaceEdit, _sourceModel: monaco.editor.ITextModel): monaco.languages.WorkspaceEdit {
    const edits: monaco.languages.IWorkspaceTextEdit[] = [];
    const append = (uri: string, textEdits: LspTextEdit[]) => {
      const targetModel = this.modelsByUri.get(uri) || monaco.editor.getModel(monaco.Uri.parse(uri));
      for (const textEdit of textEdits) {
        edits.push({
          resource: monaco.Uri.parse(uri),
          versionId: targetModel?.getVersionId?.(),
          textEdit: {
            range: targetModel ? this.mapRange(textEdit.range, targetModel) : directMonacoRange(textEdit.range),
            text: textEdit.newText,
          },
        });
      }
    };
    for (const [uri, textEdits] of Object.entries(edit.changes || {})) {
      append(uri, textEdits);
    }
    for (const documentChange of edit.documentChanges || []) {
      if (documentChange.textDocument?.uri && documentChange.edits) {
        append(documentChange.textDocument.uri, documentChange.edits);
      }
    }
    return { edits };
  }

  private ensureDiagnostics(client: MonacoLspClient): void {
    if (!client.onNotification || this.diagnosticSubscriptions.has(client as unknown as object)) return;
    const unsubscribe = client.onNotification('textDocument/publishDiagnostics', (payload) => {
      const params = payload as LspPublishDiagnosticsParams;
      if (!params?.uri || !Array.isArray(params.diagnostics)) return;
      const model = this.modelsByUri.get(params.uri) || monaco.editor.getModel(monaco.Uri.parse(params.uri));
      const text = model?.getValue?.() || '';
      const diagnostics = params.diagnostics.map((diagnostic) => ({
        severity: this.mapDiagnosticSeverity(diagnostic.severity),
        message: diagnostic.message,
        source: diagnostic.source,
        code: diagnostic.code === undefined ? undefined : String(diagnostic.code),
        startLineNumber: diagnostic.range.start.line + 1,
        startColumn: text ? lspRangeToMonaco(diagnostic.range, text).startColumn : diagnostic.range.start.character + 1,
        endLineNumber: diagnostic.range.end.line + 1,
        endColumn: text ? lspRangeToMonaco(diagnostic.range, text).endColumn : diagnostic.range.end.character + 1,
      } satisfies monaco.editor.IMarkerData));
      if (model) {
        monaco.editor.setModelMarkers(model, 'tau-lsp', diagnostics);
      }
      this.options.onDiagnostics?.({ uri: params.uri, diagnostics });
    });
    this.diagnosticSubscriptions.set(client as unknown as object, unsubscribe);
  }

  private mapDiagnosticSeverity(severity?: number): monaco.MarkerSeverity {
    switch (severity) {
      case 1: return monaco.MarkerSeverity.Error;
      case 2: return monaco.MarkerSeverity.Warning;
      case 3: return monaco.MarkerSeverity.Info;
      case 4: return monaco.MarkerSeverity.Hint;
      default: return monaco.MarkerSeverity.Info;
    }
  }
}

let configuredBridge: MonacoLspBridge | null = null;

/** 配置全局 Monaco LSP bridge；未配置时 setupMonaco 自动使用 regex fallback。 */
export function configureMonacoLspBridge(options: MonacoLspBridgeOptions | MonacoLspBridge | null): MonacoLspBridge | null {
  configuredBridge = options instanceof MonacoLspBridge ? options : options ? new MonacoLspBridge(options) : null;
  return configuredBridge;
}

export function getMonacoLspBridge(): MonacoLspBridge | null {
  return configuredBridge;
}
