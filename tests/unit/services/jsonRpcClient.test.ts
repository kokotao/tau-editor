/**
 * @description 验证 LSP JSON-RPC 请求、通知、超时、取消与服务端请求处理。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 09:45
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  JsonRpcClient,
  LspRequestCancelledError,
  LspRequestTimeoutError,
} from '@/services/lsp/jsonRpcClient';
import type { JsonRpcMessage, JsonRpcMessageHandler, JsonRpcTransport } from '@/services/lsp/types';

class FakeTransport implements JsonRpcTransport {
  readonly sent: JsonRpcMessage[] = [];
  private readonly handlers = new Set<JsonRpcMessageHandler>();
  started = false;

  async start(): Promise<void> {
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  async send(message: JsonRpcMessage): Promise<void> {
    this.sent.push(message);
  }

  onMessage(handler: JsonRpcMessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(message: JsonRpcMessage): void {
    for (const handler of [...this.handlers]) handler(message);
  }
}

describe('JsonRpcClient', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts lazily, resolves requests and dispatches notifications', async () => {
    const transport = new FakeTransport();
    const client = new JsonRpcClient(transport);
    const notification = vi.fn();
    client.onNotification('textDocument/publishDiagnostics', notification);

    const pending = client.request<{ ok: boolean }>('initialize', { rootUri: null });
    expect(transport.started).toBe(true);
    await vi.waitFor(() => expect(transport.sent).toHaveLength(1));
    expect(transport.sent[0]).toMatchObject({ id: 1, method: 'initialize' });

    transport.emit({ jsonrpc: '2.0', id: 1, result: { ok: true } });
    await expect(pending).resolves.toEqual({ ok: true });

    transport.emit({
      jsonrpc: '2.0',
      method: 'textDocument/publishDiagnostics',
      params: { uri: 'file:///a.ts', diagnostics: [] },
    });
    await vi.waitFor(() => expect(notification).toHaveBeenCalledWith({ uri: 'file:///a.ts', diagnostics: [] }));
  });

  it('cancels an in-flight request and sends $/cancelRequest', async () => {
    const transport = new FakeTransport();
    const client = new JsonRpcClient(transport);
    const controller = new AbortController();
    const pending = client.request('textDocument/references', undefined, { signal: controller.signal });
    await vi.waitFor(() => expect(transport.sent).toHaveLength(1));
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(LspRequestCancelledError);
    expect(transport.sent).toContainEqual(expect.objectContaining({
      method: '$/cancelRequest',
      params: { id: 1 },
    }));
  });

  it('rejects timed out requests and emits a cancellation notification', async () => {
    vi.useFakeTimers();
    const transport = new FakeTransport();
    const client = new JsonRpcClient(transport, 100);
    const pending = client.request('workspace/symbol');
    void pending.catch(() => undefined);
    await vi.waitFor(() => expect(transport.sent).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(100);

    await expect(pending).rejects.toBeInstanceOf(LspRequestTimeoutError);
    expect(transport.sent).toContainEqual(expect.objectContaining({ method: '$/cancelRequest' }));
  });

  it('answers server requests through registered handlers', async () => {
    const transport = new FakeTransport();
    const client = new JsonRpcClient(transport);
    client.onRequest('workspace/configuration', () => [{ trace: 'off' }]);
    await client.start();

    transport.emit({
      jsonrpc: '2.0',
      id: 22,
      method: 'workspace/configuration',
      params: { items: [] },
    });
    await vi.waitFor(() => expect(transport.sent).toContainEqual({
      jsonrpc: '2.0',
      id: 22,
      result: [{ trace: 'off' }],
    }));
  });
});
