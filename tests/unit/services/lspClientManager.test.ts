/**
 * @description 验证 LSP 会话按工作区和语言复用、停止与批量释放。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 09:45
 */

import { describe, expect, it, vi } from 'vitest';
import { LspClientManager } from '@/services/lsp/lspClientManager';
import type { JsonRpcMessage, JsonRpcMessageHandler, JsonRpcTransport } from '@/services/lsp/types';

class FakeTransport implements JsonRpcTransport {
  readonly sent: JsonRpcMessage[] = [];
  readonly start = vi.fn(async () => undefined);
  readonly stop = vi.fn(async () => undefined);
  private readonly handlers = new Set<JsonRpcMessageHandler>();
  async send(message: JsonRpcMessage): Promise<void> {
    this.sent.push(message);
    if ('id' in message && 'method' in message) {
      queueMicrotask(() => {
        for (const handler of [...this.handlers]) {
          handler({ jsonrpc: '2.0', id: message.id, result: { capabilities: {} } });
        }
      });
    }
  }
  onMessage(handler: JsonRpcMessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}

const options = {
  workspaceId: 'workspace-1',
  languageId: 'typescript',
  rootPath: '/workspace',
  command: 'typescript-language-server',
};

describe('LspClientManager', () => {
  it('reuses one client for the same workspace and language', async () => {
    const transports: FakeTransport[] = [];
    const manager = new LspClientManager((resolved) => {
      expect(resolved.sessionId).toBe('workspace-1:typescript');
      const transport = new FakeTransport();
      transports.push(transport);
      return transport;
    });

    const [first, second] = await Promise.all([manager.start(options), manager.start(options)]);
    expect(first).toBe(second);
    expect(manager.size).toBe(1);
    expect(transports).toHaveLength(1);
  });

  it('stops one session and all remaining sessions', async () => {
    const transports: FakeTransport[] = [];
    const manager = new LspClientManager(() => {
      const transport = new FakeTransport();
      transports.push(transport);
      return transport;
    });
    await manager.start(options);
    await manager.start({ ...options, languageId: 'javascript' });
    await manager.stop(options.workspaceId, options.languageId);
    expect(manager.size).toBe(1);
    expect(transports[0]?.stop).toHaveBeenCalledTimes(1);
    await manager.stopAll();
    expect(manager.size).toBe(0);
    expect(transports[1]?.stop).toHaveBeenCalledTimes(1);
  });

  it('广播文件变更通知到全部语言服务器会话', async () => {
    const transports: FakeTransport[] = [];
    const manager = new LspClientManager(() => {
      const transport = new FakeTransport();
      transports.push(transport);
      return transport;
    });
    await manager.start(options);
    await manager.start({ ...options, languageId: 'python' });

    await manager.notifyAll('workspace/didChangeWatchedFiles', { changes: [] });

    expect(transports[0]?.sent.some((message) => 'method' in message && message.method === 'workspace/didChangeWatchedFiles')).toBe(true);
    expect(transports[1]?.sent.some((message) => 'method' in message && message.method === 'workspace/didChangeWatchedFiles')).toBe(true);
  });
});
