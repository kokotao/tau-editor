/**
 * @description 按 workspace + language 复用和关闭 LSP JSON-RPC 会话。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 09:40
 */

import { TauriLspTransport, type TauriLspTransportOptions } from './tauriLspTransport';
import { JsonRpcClient } from './jsonRpcClient';
import { pathToUri } from './pathUri';
import type { JsonRpcTransport } from './types';

export interface LspSessionOptions extends Omit<TauriLspTransportOptions, 'sessionId'> {
  sessionId?: string;
  /** 默认 true；关闭后由调用方自行发送 initialize/initialized。 */
  autoInitialize?: boolean;
  initializeParams?: Record<string, unknown>;
  initializeTimeoutMs?: number;
}

export type LspTransportFactory = (options: Required<Pick<LspSessionOptions, 'sessionId'>> & LspSessionOptions) => JsonRpcTransport;

function sessionKey(workspaceId: string, languageId: string): string {
  return `${workspaceId}\u0000${languageId}`;
}

function withSessionId(options: LspSessionOptions): Required<Pick<LspSessionOptions, 'sessionId'>> & LspSessionOptions {
  return {
    ...options,
    sessionId: options.sessionId ?? `${options.workspaceId}:${options.languageId}`,
  };
}

function workspaceName(rootPath: string): string {
  const normalized = rootPath.replace(/\\/g, '/').replace(/\/$/, '');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? 'workspace';
}

function defaultInitializeParams(options: LspSessionOptions): Record<string, unknown> {
  const rootUri = pathToUri(options.rootPath);
  return {
    processId: null,
    clientInfo: { name: 'Tau Editor', version: '0.6.7' },
    rootUri,
    workspaceFolders: [{ uri: rootUri, name: workspaceName(options.rootPath) }],
    capabilities: {
      workspace: {
        configuration: true,
        workspaceFolders: true,
      },
      textDocument: {
        synchronization: {
          dynamicRegistration: false,
          willSave: false,
          didSave: true,
          willSaveWaitUntil: false,
        },
        completion: { completionItem: { snippetSupport: true } },
        definition: { linkSupport: true },
        declaration: { linkSupport: true },
        typeDefinition: { linkSupport: true },
        implementation: { linkSupport: true },
        callHierarchy: { dynamicRegistration: false },
        typeHierarchy: { dynamicRegistration: false },
        documentSymbol: {
          hierarchicalDocumentSymbolSupport: true,
          symbolKind: { valueSet: Array.from({ length: 26 }, (_, index) => index + 1) },
          tagSupport: { valueSet: [1] },
        },
        references: {},
        hover: { contentFormat: ['markdown', 'plaintext'] },
        publishDiagnostics: { relatedInformation: true },
      },
      workspaceSymbol: {
        symbolKind: { valueSet: Array.from({ length: 26 }, (_, index) => index + 1) },
        tagSupport: { valueSet: [1] },
      },
      window: { workDoneProgress: true },
    },
    ...options.initializeParams,
  };
}

export class LspClientManager {
  private readonly clients = new Map<string, JsonRpcClient>();
  private readonly starts = new Map<string, Promise<JsonRpcClient>>();

  constructor(
    private readonly transportFactory: LspTransportFactory = (options) => new TauriLspTransport(options),
  ) {}

  async start(options: LspSessionOptions): Promise<JsonRpcClient> {
    const key = sessionKey(options.workspaceId, options.languageId);
    const existing = this.clients.get(key);
    if (existing) return existing;
    const starting = this.starts.get(key);
    if (starting) return starting;

    const resolved = withSessionId(options);
    const pending = (async () => {
      const client = new JsonRpcClient(this.transportFactory(resolved));
      await client.start();
      if (resolved.autoInitialize !== false) {
        try {
          await client.request('initialize', defaultInitializeParams(resolved), {
            timeoutMs: resolved.initializeTimeoutMs,
          });
          await client.notify('initialized', {});
        } catch (error) {
          await client.stop().catch(() => undefined);
          throw error;
        }
      }
      this.clients.set(key, client);
      return client;
    })();
    this.starts.set(key, pending);

    try {
      return await pending;
    } finally {
      this.starts.delete(key);
    }
  }

  get(workspaceId: string, languageId: string): JsonRpcClient | null {
    return this.clients.get(sessionKey(workspaceId, languageId)) ?? null;
  }

  /** 向当前工作区已启动的所有语言服务器广播同一条通知。 */
  async notifyAll(method: string, params?: unknown): Promise<void> {
    await Promise.all([...this.clients.values()].map((client) => client.notify(method, params)));
  }

  async stop(workspaceId: string, languageId: string): Promise<void> {
    const key = sessionKey(workspaceId, languageId);
    const pending = this.starts.get(key);
    if (pending) {
      try {
        await pending;
      } catch {
        return;
      }
    }
    const client = this.clients.get(key);
    if (!client) return;
    this.clients.delete(key);
    await client.stop();
  }

  async stopAll(): Promise<void> {
    const entries = [...this.clients.entries()];
    this.clients.clear();
    await Promise.all(entries.map(([, client]) => client.stop()));
  }

  get size(): number {
    return this.clients.size;
  }
}

export function createLspClientManager(factory?: LspTransportFactory): LspClientManager {
  return new LspClientManager(factory);
}
