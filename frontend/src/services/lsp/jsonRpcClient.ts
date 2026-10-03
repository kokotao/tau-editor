/**
 * @description LSP JSON-RPC 请求、通知、超时、取消和服务端请求处理器。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 09:40
 */

import type {
  JsonRpcErrorObject,
  JsonRpcId,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcTransport,
  LspNotificationHandler,
  LspRequestOptions,
  LspServerRequestHandler,
} from './types';

export const DEFAULT_LSP_REQUEST_TIMEOUT_MS = 15_000;

export class LspRpcError extends Error {
  readonly code: number;
  readonly data: unknown;

  constructor(error: JsonRpcErrorObject) {
    super(error.message);
    this.name = 'LspRpcError';
    this.code = error.code;
    this.data = error.data;
  }
}

export class LspRequestCancelledError extends Error {
  readonly requestId: JsonRpcId;

  constructor(requestId: JsonRpcId) {
    super(`LSP request ${String(requestId)} was cancelled`);
    this.name = 'LspRequestCancelledError';
    this.requestId = requestId;
  }
}

export class LspRequestTimeoutError extends Error {
  readonly requestId: JsonRpcId;
  readonly timeoutMs: number;

  constructor(requestId: JsonRpcId, timeoutMs: number) {
    super(`LSP request ${String(requestId)} timed out after ${timeoutMs}ms`);
    this.name = 'LspRequestTimeoutError';
    this.requestId = requestId;
    this.timeoutMs = timeoutMs;
  }
}

export class LspClientClosedError extends Error {
  constructor(message = 'LSP client is closed') {
    super(message);
    this.name = 'LspClientClosedError';
  }
}

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout> | null;
  abortCleanup: (() => void) | null;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isResponse(message: JsonRpcMessage): message is JsonRpcResponse {
  return hasOwn(message, 'id') && (hasOwn(message, 'result') || hasOwn(message, 'error'));
}

function isServerRequest(message: JsonRpcMessage): message is JsonRpcRequest {
  return hasOwn(message, 'id') && hasOwn(message, 'method');
}

function isNotification(message: JsonRpcMessage): message is JsonRpcNotification {
  return hasOwn(message, 'method') && !hasOwn(message, 'id');
}

export class JsonRpcClient {
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readonly notificationHandlers = new Map<string, Set<LspNotificationHandler>>();
  private readonly requestHandlers = new Map<string, Set<LspServerRequestHandler>>();
  private nextRequestId = 1;
  private started = false;
  private starting: Promise<void> | null = null;
  private unsubscribeTransport: (() => void) | null = null;

  constructor(
    private readonly transport: JsonRpcTransport,
    private readonly defaultTimeoutMs = DEFAULT_LSP_REQUEST_TIMEOUT_MS,
  ) {}

  get isStarted(): boolean {
    return this.started;
  }

  async start(): Promise<void> {
    if (this.started) return;
    if (this.starting) return this.starting;

    this.starting = (async () => {
      this.unsubscribeTransport = this.transport.onMessage((message) => {
        void this.handleMessage(message);
      });
      try {
        await this.transport.start?.();
        this.started = true;
      } catch (error) {
        this.unsubscribeTransport?.();
        this.unsubscribeTransport = null;
        throw error;
      }
    })();

    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  async stop(reason = new LspClientClosedError()): Promise<void> {
    this.started = false;
    this.unsubscribeTransport?.();
    this.unsubscribeTransport = null;
    this.rejectPending(reason);
    await this.transport.stop?.();
  }

  async request<T = unknown>(
    method: string,
    params?: unknown,
    options: LspRequestOptions = {},
  ): Promise<T> {
    await this.start();

    const id = this.nextRequestId;
    this.nextRequestId += 1;
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;

    if (options.signal?.aborted) {
      throw new LspRequestCancelledError(id);
    }

    return new Promise<T>((resolve, reject) => {
      const pending: PendingRequest = {
        resolve: (value) => resolve(value as T),
        reject: (error) => reject(error),
        timer: null,
        abortCleanup: null,
      };

      const settle = (error?: unknown, result?: unknown) => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        if (pending.timer !== null) clearTimeout(pending.timer);
        pending.abortCleanup?.();
        if (error !== undefined) pending.reject(error);
        else pending.resolve(result);
      };

      pending.timer = timeoutMs > 0
        ? setTimeout(() => {
            void this.notify('$/cancelRequest', { id }).catch(() => undefined);
            settle(new LspRequestTimeoutError(id, timeoutMs));
          }, timeoutMs)
        : null;

      if (options.signal) {
        const onAbort = () => {
          void this.notify('$/cancelRequest', { id }).catch(() => undefined);
          settle(new LspRequestCancelledError(id));
        };
        options.signal.addEventListener('abort', onAbort, { once: true });
        pending.abortCleanup = () => options.signal?.removeEventListener('abort', onAbort);
      }

      this.pending.set(id, pending);
      void this.transport.send({
        jsonrpc: '2.0',
        id,
        method,
        ...(params === undefined ? {} : { params }),
      }).catch((error: unknown) => settle(error));
    });
  }

  async notify(method: string, params?: unknown): Promise<void> {
    await this.start();
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params === undefined ? {} : { params }),
    };
    await this.transport.send(notification);
  }

  onNotification(method: string, handler: LspNotificationHandler): () => void {
    const handlers = this.notificationHandlers.get(method) ?? new Set<LspNotificationHandler>();
    handlers.add(handler);
    this.notificationHandlers.set(method, handlers);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) this.notificationHandlers.delete(method);
    };
  }

  onRequest(method: string, handler: LspServerRequestHandler): () => void {
    const handlers = this.requestHandlers.get(method) ?? new Set<LspServerRequestHandler>();
    handlers.add(handler);
    this.requestHandlers.set(method, handlers);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) this.requestHandlers.delete(method);
    };
  }

  private async handleMessage(message: JsonRpcMessage): Promise<void> {
    if (isResponse(message)) {
      this.handleResponse(message);
      return;
    }

    if (isServerRequest(message)) {
      await this.handleServerRequest(message);
      return;
    }

    if (isNotification(message)) {
      const handlers = [
        ...(this.notificationHandlers.get(message.method) ?? []),
        ...(this.notificationHandlers.get('*') ?? []),
      ];
      await Promise.allSettled(handlers.map((handler) => handler(message.params)));
    }
  }

  private handleResponse(message: JsonRpcResponse): void {
    if (message.id === null) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;

    this.pending.delete(message.id);
    if (pending.timer !== null) clearTimeout(pending.timer);
    pending.abortCleanup?.();

    if ('error' in message) pending.reject(new LspRpcError(message.error));
    else pending.resolve(message.result);
  }

  private async handleServerRequest(message: JsonRpcRequest): Promise<void> {
    const handlers = this.requestHandlers.get(message.method);
    const handler = handlers?.values().next().value as LspServerRequestHandler | undefined;

    if (!handler) {
      await this.transport.send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: `Method not found: ${message.method}` },
      });
      return;
    }

    try {
      const result = await handler(message.params, message);
      await this.transport.send({ jsonrpc: '2.0', id: message.id, result });
    } catch (error) {
      await this.transport.send({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private rejectPending(reason: unknown): void {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      if (pending.timer !== null) clearTimeout(pending.timer);
      pending.abortCleanup?.();
      pending.reject(reason);
    }
  }
}
