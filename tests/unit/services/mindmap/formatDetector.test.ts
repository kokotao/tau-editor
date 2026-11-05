import { describe, expect, it } from 'vitest';
import { detectMindMapFormat, resolveDetectedFormat } from '@/services/mindmap/fileFormatDetector';

const ZIP_HEADER = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);

describe('detectMindMapFormat', () => {
  it('.taumap 内容含 format 字段时按内容识别', () => {
    const result = detectMindMapFormat({
      fileName: 'foo.txt',
      content: JSON.stringify({ format: 'tau-mindmap', schemaVersion: 1 }),
    });
    expect(result.status).toBe('identified');
    expect(result.formatId).toBe('taumap');
  });

  it('.taumap 仅有扩展名按扩展名识别', () => {
    const result = detectMindMapFormat({ fileName: 'map.taumap' });
    expect(result.status).toBe('identified');
    expect(result.formatId).toBe('taumap');
  });

  it('.xmind 文件（无内容）按扩展名识别', () => {
    const result = detectMindMapFormat({ fileName: 'sample.xmind' });
    expect(result.formatId).toBe('xmind');
    expect(result.status).toBe('identified');
  });

  it('ZIP 头部 + .xmind 识别为 xmind', () => {
    const result = detectMindMapFormat({
      fileName: 'sample.xmind',
      headerBytes: ZIP_HEADER,
    });
    expect(result.formatId).toBe('xmind');
    expect(result.candidates).toContain('xmind');
  });

  it('ZIP 头部 + .map 扩展名 → ambiguous（不能静默判定）', () => {
    const result = detectMindMapFormat({
      fileName: 'sample.map',
      headerBytes: ZIP_HEADER,
    });
    expect(result.status).toBe('ambiguous');
    expect(result.formatId).toBeNull();
  });

  it('XML 根元素 <map> → freemind', () => {
    const result = detectMindMapFormat({
      fileName: 'mind.mm',
      content: '<map version="0.9.1"><node TEXT="a"/></map>',
    });
    expect(result.formatId).toBe('freemind');
    expect(result.status).toBe('identified');
  });

  it('XML 根元素 <opml> → opml', () => {
    const result = detectMindMapFormat({
      fileName: 'outline.opml',
      content: '<opml version="2.0"><body><outline text="a"/></body></opml>',
    });
    expect(result.formatId).toBe('opml');
  });

  it('.mmap 按扩展名识别为 mindmanager', () => {
    const result = detectMindMapFormat({ fileName: 'plan.mmap' });
    expect(result.formatId).toBe('mindmanager');
  });

  it('.mindnode 按扩展名识别', () => {
    const result = detectMindMapFormat({ fileName: 'idea.mindnode' });
    expect(result.formatId).toBe('mindnode');
  });

  it('.md 含 Markdown 大纲结构 → markdown', () => {
    const result = detectMindMapFormat({
      fileName: 'notes.md',
      content: '# 标题\n- 要点\n- 次要点',
    });
    expect(result.formatId).toBe('markdown');
  });

  it('.md 普通文本（无标题/列表）→ unknown', () => {
    const result = detectMindMapFormat({
      fileName: 'notes.md',
      content: '这是普通文本\n没有结构',
    });
    expect(result.status).toBe('unknown');
  });

  it('歧义 .map 且内容无法判定 → ambiguous', () => {
    const result = detectMindMapFormat({ fileName: 'map.map', content: 'nothing recognizable' });
    expect(result.status).toBe('ambiguous');
    expect(result.formatId).toBeNull();
  });

  it('.opml 扩展名直接识别（无内容）', () => {
    const result = detectMindMapFormat({ fileName: 'feed.opml' });
    expect(result.formatId).toBe('opml');
  });

  it('未知扩展名 → unknown', () => {
    const result = detectMindMapFormat({ fileName: 'data.csv' });
    expect(result.status).toBe('unknown');
  });
});

describe('resolveDetectedFormat', () => {
  it('identified 结果能映射到注册表条目', () => {
    const result = detectMindMapFormat({ fileName: 'sample.xmind' });
    const entry = resolveDetectedFormat(result);
    expect(entry).toBeDefined();
    expect(entry?.id).toBe('xmind');
    expect(entry?.capabilities.read).toBe('compatible');
  });

  it('ambiguous 结果无法解析出条目', () => {
    const result = detectMindMapFormat({ fileName: 'map.map' });
    expect(resolveDetectedFormat(result)).toBeUndefined();
  });
});