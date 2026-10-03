/**
 * @description LSP 文档生命周期管理，负责 didOpen/didChange/didSave/didClose 与版本同步。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 09:40
 */

import { applyTextDocumentChanges } from './utf16';
import type {
  DidChangeTextDocumentParams,
  DidCloseTextDocumentParams,
  DidOpenTextDocumentParams,
  DidSaveTextDocumentParams,
  TextDocumentContentChangeEvent,
  TextDocumentItem,
} from './types';

export interface DocumentSyncClient {
  notify(method: string, params?: unknown): Promise<void>;
}
export interface OpenDocumentOptions {
  uri: string;
  languageId: string;
  text: string;
  version?: number;
}

export interface ManagedDocument extends OpenDocumentOptions {
  version: number;
}

export class DocumentStoreError extends Error {
  readonly uri: string;

  constructor(uri: string, message: string) {
    super(message);
    this.name = 'DocumentStoreError';
    this.uri = uri;
  }
}

function copyDocument(document: ManagedDocument): ManagedDocument {
  return { ...document };
}

function ensureVersion(version: number | undefined): number {
  return Number.isInteger(version) && (version as number) > 0 ? (version as number) : 1;
}

export class DocumentStore {
  private readonly documents = new Map<string, ManagedDocument>();

  constructor(private readonly client: DocumentSyncClient) {}

  get size(): number {
    return this.documents.size;
  }

  has(uri: string): boolean {
    return this.documents.has(uri);
  }

  get(uri: string): ManagedDocument | null {
    const document = this.documents.get(uri);
    return document ? copyDocument(document) : null;
  }

  list(): ManagedDocument[] {
    return [...this.documents.values()].map(copyDocument);
  }

  async open(options: OpenDocumentOptions): Promise<ManagedDocument> {
    const existing = this.documents.get(options.uri);
    if (existing) {
      if (existing.languageId === options.languageId && existing.text === options.text) {
        return copyDocument(existing);
      }
      await this.close(options.uri);
    }

    const document: ManagedDocument = {
      ...options,
      version: ensureVersion(options.version),
    };
    const params: DidOpenTextDocumentParams = {
      textDocument: document as TextDocumentItem,
    };
    await this.client.notify('textDocument/didOpen', params);
    this.documents.set(document.uri, document);
    return copyDocument(document);
  }

  async change(
    uri: string,
    text: string,
    changes?: readonly TextDocumentContentChangeEvent[],
  ): Promise<ManagedDocument> {
    const document = this.require(uri);
    const nextVersion = document.version + 1;
    const validChanges = changes && changes.length > 0 ? [...changes] : [{ text }];
    const reconstructed = applyTextDocumentChanges(document.text, validChanges);
    const contentChanges = reconstructed === text ? validChanges : [{ text }];
    const nextDocument: ManagedDocument = {
      ...document,
      text,
      version: nextVersion,
    };
    const params: DidChangeTextDocumentParams = {
      textDocument: { uri, version: nextVersion },
      contentChanges,
    };
    await this.client.notify('textDocument/didChange', params);
    this.documents.set(uri, nextDocument);
    return copyDocument(nextDocument);
  }

  async applyChanges(
    uri: string,
    changes: readonly TextDocumentContentChangeEvent[],
  ): Promise<ManagedDocument> {
    const document = this.require(uri);
    const text = applyTextDocumentChanges(document.text, changes);
    return this.change(uri, text, changes);
  }

  async save(uri: string, text?: string): Promise<ManagedDocument> {
    let document = this.require(uri);
    if (text !== undefined && text !== document.text) {
      document = await this.change(uri, text);
    }

    const params: DidSaveTextDocumentParams = {
      textDocument: { uri },
      ...(text === undefined ? {} : { text: document.text }),
    };
    await this.client.notify('textDocument/didSave', params);
    return copyDocument(document);
  }

  async close(uri: string): Promise<void> {
    this.require(uri);
    const params: DidCloseTextDocumentParams = { textDocument: { uri } };
    await this.client.notify('textDocument/didClose', params);
    this.documents.delete(uri);
  }

  async dispose(): Promise<void> {
    const uris = [...this.documents.keys()];
    for (const uri of uris) {
      await this.close(uri);
    }
  }

  private require(uri: string): ManagedDocument {
    const document = this.documents.get(uri);
    if (!document) {
      throw new DocumentStoreError(uri, `Document is not open: ${uri}`);
    }
    return document;
  }
}
