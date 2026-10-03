/**
 * @description LSP/JSON-RPC 客户端共用的协议类型与传输抽象。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 09:40
 */

export type JsonRpcId = number | string;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: JsonRpcId | null;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: JsonRpcId | null;
  error: JsonRpcErrorObject;
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

export type JsonRpcMessageHandler = (message: JsonRpcMessage) => void;

/**
 * JSON-RPC 帧传输层。stdio、Tauri event/channel 和测试内存传输都实现此接口。
 */
export interface JsonRpcTransport {
  send(message: JsonRpcMessage): Promise<void>;
  onMessage(handler: JsonRpcMessageHandler): () => void;
  start?(): Promise<void>;
  stop?(): Promise<void>;
}

export interface LspPosition {
  /** LSP 行号从 0 开始。 */
  line: number;
  /** LSP 字符偏移使用 UTF-16 code unit，从 0 开始。 */
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface TextDocumentIdentifier {
  uri: string;
}

export interface VersionedTextDocumentIdentifier extends TextDocumentIdentifier {
  version: number;
}

export interface TextDocumentItem extends TextDocumentIdentifier {
  languageId: string;
  version: number;
  text: string;
}

export interface TextDocumentContentChangeEvent {
  range?: LspRange;
  rangeLength?: number;
  text: string;
}

export interface DidOpenTextDocumentParams {
  textDocument: TextDocumentItem;
}

export interface DidChangeTextDocumentParams {
  textDocument: VersionedTextDocumentIdentifier;
  contentChanges: TextDocumentContentChangeEvent[];
}

export interface DidSaveTextDocumentParams {
  textDocument: TextDocumentIdentifier;
  text?: string;
}

export interface DidCloseTextDocumentParams {
  textDocument: TextDocumentIdentifier;
}

export interface LspRequestOptions {
  /** 超时毫秒数；不传时使用客户端默认值。 */
  timeoutMs?: number;
  /** 取消请求时会额外发送 $/cancelRequest 通知。 */
  signal?: AbortSignal;
}

export type LspNotificationHandler = (params: unknown) => void | Promise<void>;

export type LspServerRequestHandler = (
  params: unknown,
  request: JsonRpcRequest,
) => unknown | Promise<unknown>;
