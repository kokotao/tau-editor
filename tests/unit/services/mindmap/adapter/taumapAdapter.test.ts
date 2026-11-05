import { describe, expect, it } from 'vitest';
import { taumapAdapter } from '@/services/mindmap/adapters/taumapAdapter';
import { createEmptyMindMapDocument, parseMindMapDocument, serializeMindMapDocument } from '@/services/mindmapService';

describe('taumapAdapter', () => {
  it('声明 lossless 能力', () => {
    expect(taumapAdapter.formatId).toBe('taumap');
    expect(taumapAdapter.capabilities.read).toBe('lossless');
    expect(taumapAdapter.capabilities.write).toBe('lossless');
  });

  it('导入合法 .taumap 内容成功', () => {
    const document = createEmptyMindMapDocument('适配器');
    const result = taumapAdapter.importFromString(serializeMindMapDocument(document));
    expect(result.ok).toBe(true);
    expect(result.document).toEqual(document);
    expect(result.lossy).toEqual([]);
  });

  it('导入损坏 JSON 失败且不带文档', () => {
    const result = taumapAdapter.importFromString('{ bad json');
    expect(result.ok).toBe(false);
    expect(result.document).toBeNull();
    expect(result.error?.category).toBe('corrupt-content');
  });

  it('导入未知 schema 失败分类 correct', () => {
    const raw = JSON.stringify({ format: 'tau-mindmap', schemaVersion: 99, topics: {} });
    const result = taumapAdapter.importFromString(raw);
    expect(result.ok).toBe(false);
    expect(result.document).toBeNull();
    expect(result.error?.category).toBe('unsupported-schema');
  });

  it('导出合法文档成功且可往返解析', () => {
    const document = createEmptyMindMapDocument('导出');
    const exportResult = taumapAdapter.exportToString(document);
    expect(exportResult.ok).toBe(true);
    const parsed = parseMindMapDocument(exportResult.output);
    expect(parsed).toEqual(document);
  });
});