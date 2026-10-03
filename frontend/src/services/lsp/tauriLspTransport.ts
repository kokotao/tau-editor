/**
 * @description 将 JSON-RPC LSP 消息桥接到 Tauri command/event 的前端传输实现。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 09:40
 */

import {
  listenLspMessages,
  lspCommands,
  type LspMessageEventPayload,
  type LspSessionStartOptions,
} from '@/lib/tauri';
import type { JsonRpcMessage, JsonRpcMessageHandler, JsonRpcTransport } from './types';

export interface TauriLspTransportOptions extends LspSessionStartOptions {
  sessionId: string;
}

export class TauriLspTransport implements JsonRpcTransport {
  private readonly handlers = new Set<JsonRpcMessageHandler>();
  private unlisten: (() => void) | null = null;
  private started = false;

  constructor(private readonly options: TauriLspTransportOptions) {}

  async start(): Promise<void> {
    if (this.started) return;

    this.unlisten = await listenLspMessages((payload: LspMessageEventPayload) => {
      if (payload.sessionId !== this.options.sessionId) return;
      // Rust emits both directions for observability; only server-to-client
      // frames are inbound messages for this transport.
      if (payload.direction !== 'serverToClient') return;
      // lsp_send_request returns response frames through the invoke call below.
      // Rust also emits those frames for logging, so do not deliver them twice
      // through the event channel. Rust currently auto-answers server requests
      // (workspace/configuration, client/registerCapability, ...), so those are
      // intentionally not exposed as inbound frames until a response command
      // is added to the Tauri bridge.
      const message = payload.message as JsonRpcMessage;
      if ('id' in message) return;
      for (const handler of [...this.handlers]) {
        handler(message);
      }
    });

    try {
      await lspCommands.startSession(this.options);
      this.started = true;
    } catch (error) {
      this.unlisten?.();
      this.unlisten = null;
      throw error;
    }
  }

  async send(message: JsonRpcMessage): Promise<void> {
    if (!this.started) throw new Error('Tauri LSP transport is not started');

    if ('method' in message && 'id' in message) {
      const response = await lspCommands.sendRequest({
        sessionId: this.options.sessionId,
        method: message.method,
        ...(message.params === undefined ? {} : { params: message.params }),
      });
      const responseMessage: JsonRpcMessage = response.error
        ? {
            jsonrpc: '2.0',
            id: message.id,
            error: response.error,
          }
        : {
            jsonrpc: '2.0',
            id: message.id,
            result: response.result,
          };
      for (const handler of [...this.handlers]) handler(responseMessage);
      return;
    }

    if ('method' in message) {
      await lspCommands.sendNotification({
        sessionId: this.options.sessionId,
        method: message.method,
        ...(message.params === undefined ? {} : { params: message.params }),
      });
      return;
    }

    // 当前 Rust Supervisor 会自动响应服务端 request；前端不会主动发送响应。
    throw new Error('LSP Tauri transport does not accept response messages from the client');
  }

  onMessage(handler: JsonRpcMessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async stop(): Promise<void> {
    const wasStarted = this.started;
    this.started = false;
    this.unlisten?.();
    this.unlisten = null;
    if (wasStarted) await lspCommands.stopSession(this.options.sessionId);
  }
}
