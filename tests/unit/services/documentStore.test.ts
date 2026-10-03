/**
 * @description 验证 LSP 文档打开、增量变更、保存、关闭和版本递增。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 09:45
 */

import { describe, expect, it } from 'vitest';
import { DocumentStore, DocumentStoreError } from '@/services/lsp/documentStore';
import type { TextDocumentContentChangeEvent } from '@/services/lsp/types';

class FakeDocumentClient {
  readonly notifications: Array<{ method: string; params: unknown }> = [];

  async notify(method: string, params?: unknown): Promise<void> {
    this.notifications.push({ method, params });
  }
}

describe('DocumentStore', () => {
  it('sends didOpen, didChange, didSave and didClose with monotonic versions', async () => {
    const client = new FakeDocumentClient();
    const store = new DocumentStore(client);
    const uri = 'file:///workspace/src/app.ts';

    await expect(store.open({
      uri,
      languageId: 'typescript',
      text: 'const value = 1;',
      version: 7,
    })).resolves.toMatchObject({ uri, version: 7 });
    await store.change(uri, 'const value = 2;');
    await store.save(uri);
    await store.close(uri);

    expect(client.notifications.map((entry) => entry.method)).toEqual([
      'textDocument/didOpen',
      'textDocument/didChange',
      'textDocument/didSave',
      'textDocument/didClose',
    ]);
    expect(client.notifications[1]?.params).toEqual({
      textDocument: { uri, version: 8 },
      contentChanges: [{ text: 'const value = 2;' }],
    });
    expect(store.has(uri)).toBe(false);
  });

  it('applies incremental edits and falls back to full content when needed', async () => {
    const client = new FakeDocumentClient();
    const store = new DocumentStore(client);
    const uri = 'untitled://draft';
    await store.open({ uri, languageId: 'typescript', text: 'hello world' });

    const changes: TextDocumentContentChangeEvent[] = [{
      range: {
        start: { line: 0, character: 6 },
        end: { line: 0, character: 11 },
      },
      text: 'LSP',
    }];
    await store.applyChanges(uri, changes);
    expect(store.get(uri)).toMatchObject({ text: 'hello LSP', version: 2 });
    expect(client.notifications[1]?.params).toEqual({
      textDocument: { uri, version: 2 },
      contentChanges: changes,
    });

    await store.change(uri, 'different', changes);
    expect(client.notifications[2]?.params).toEqual({
      textDocument: { uri, version: 3 },
      contentChanges: [{ text: 'different' }],
    });
  });

  it('rejects lifecycle operations for unopened documents', async () => {
    const store = new DocumentStore(new FakeDocumentClient());
    await expect(store.change('file:///missing', 'x')).rejects.toBeInstanceOf(DocumentStoreError);
    await expect(store.save('file:///missing')).rejects.toBeInstanceOf(DocumentStoreError);
    await expect(store.close('file:///missing')).rejects.toBeInstanceOf(DocumentStoreError);
  });
});
