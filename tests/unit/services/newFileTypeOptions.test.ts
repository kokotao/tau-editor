/**
 * UX-3A：新建文件类型目录单测
 *
 * 覆盖：类型清单与扩展名映射、默认类型回退、默认文件名、中英文名、
 * 各类型 seedContent 的合法性（.taumap 能被导图解析器打开、.mm/.opml 能被导入
 * 预览识别并生成含根节点的文档）、云端白名单过滤。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */
import { describe, expect, it } from 'vitest';
import {
  CLOUD_NEW_FILE_TYPE_OPTIONS,
  DEFAULT_NEW_FILE_TYPE_ID,
  NEW_FILE_TYPE_OPTIONS,
  buildDefaultNewFileName,
  findNewFileTypeByExtension,
  isNewFileTypeId,
  newFileTypeLabel,
  resolveNewFileType,
  seedContentForFileName,
  titleFromFileName,
} from '@/services/newFileTypeOptions';
import { previewMindmapImport } from '@/services/mindmap/importExportService';
import { parseMindMapDocument } from '@/services/mindmapService';

describe('新建文件类型目录', () => {
  it('包含 Markdown / 两种导图 / OPML / 纯文本 / JSON 六种类型', () => {
    expect(NEW_FILE_TYPE_OPTIONS.map((option) => option.id)).toEqual([
      'markdown',
      'taumap',
      'freemind',
      'opml',
      'plaintext',
      'json',
    ]);
    expect(NEW_FILE_TYPE_OPTIONS.map((option) => option.extension)).toEqual([
      'md',
      'taumap',
      'mm',
      'opml',
      'txt',
      'json',
    ]);
  });

  it('默认类型是 Markdown（兼容旧的「新建文件」调用）', () => {
    expect(DEFAULT_NEW_FILE_TYPE_ID).toBe('markdown');
    expect(resolveNewFileType().id).toBe('markdown');
    expect(resolveNewFileType(undefined).id).toBe('markdown');
    expect(resolveNewFileType('unknown-type').id).toBe('markdown');
    expect(resolveNewFileType('opml').id).toBe('opml');
  });

  it('isNewFileTypeId 只接受目录内 id', () => {
    expect(isNewFileTypeId('taumap')).toBe(true);
    expect(isNewFileTypeId('exe')).toBe(false);
    expect(isNewFileTypeId(null)).toBe(false);
    expect(isNewFileTypeId(42)).toBe(false);
  });

  it('默认文件名带扩展名，中英文名可切换', () => {
    const taumap = resolveNewFileType('taumap');
    expect(buildDefaultNewFileName(taumap)).toBe('未命名思维导图.taumap');
    expect(newFileTypeLabel(taumap, 'zh-CN')).toBe('Tau 思维导图');
    expect(newFileTypeLabel(taumap, 'en-US')).toBe('Tau mind map');
    // 未知 locale 回退中文
    expect(newFileTypeLabel(taumap, null)).toBe('Tau 思维导图');
  });

  it('扩展名反查类型；标题从文件名推导', () => {
    expect(findNewFileTypeByExtension('MM')?.id).toBe('freemind');
    expect(findNewFileTypeByExtension('opml')?.id).toBe('opml');
    expect(findNewFileTypeByExtension('exe')).toBeUndefined();
    expect(findNewFileTypeByExtension('')).toBeUndefined();
    expect(titleFromFileName('docs/spring.知识点.taumap')).toBe('spring.知识点');
    expect(titleFromFileName('noext')).toBe('noext');
    expect(titleFromFileName('C:\\ws\\a.md')).toBe('a');
  });
});

describe('seedContent 生成的初始正文', () => {
  it('文本类使用最小空模板', () => {
    expect(seedContentForFileName('notes.md')).toBe('');
    expect(seedContentForFileName('todo.txt')).toBe('');
    expect(seedContentForFileName('data.json')).toBe('{}\n');
    // 未知扩展名保持空文本，不抛错
    expect(seedContentForFileName('weird.bin')).toBe('');
  });

  it('.taumap 是可直接打开的合法空导图 JSON', () => {
    const content = seedContentForFileName('spring知识点.taumap');
    const document = parseMindMapDocument(content);
    expect(document.format).toBe('tau-mindmap');
    expect(document.title).toBe('spring知识点');
    expect(Object.keys(document.topics)).toHaveLength(1);
    expect(document.topics[document.rootTopicId]?.text).toBe('spring知识点');
  });

  it('.mm 是合法的 FreeMind 空地图，可被导入预览识别', async () => {
    const content = seedContentForFileName('freemind.mm');
    expect(content).toContain('<map version="0.9.1">');
    expect(content).toContain('TEXT="freemind"');

    const preview = await previewMindmapImport({ fileName: 'freemind.mm', content });
    expect(preview.ok).toBe(true);
    expect(preview.formatId).toBe('freemind');
    expect(preview.document?.topics[preview.document.rootTopicId]?.text).toBe('freemind');
  });

  it('.opml 是合法的 OPML 2.0 空大纲，可被导入预览识别', async () => {
    const content = seedContentForFileName('outline.opml');
    expect(content.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(content).toContain('<opml version="2.0">');
    expect(content).toContain('<title>outline</title>');

    const preview = await previewMindmapImport({ fileName: 'outline.opml', content });
    expect(preview.ok).toBe(true);
    expect(preview.formatId).toBe('opml');
    const document = preview.document!;
    expect(document.topics[document.rootTopicId]).toBeDefined();
    // 同名根 outline 出现在导入结果里（OPML 适配器会再包一层中心主题，属既有行为）
    expect(Object.values(document.topics).some((topic) => topic.text === 'outline')).toBe(true);
  });

  it('文件名没有主干时使用兜底标题', () => {
    const content = seedContentForFileName('.taumap');
    const document = parseMindMapDocument(content);
    expect(document.title).toBe('未命名思维导图');
  });
});

describe('云端可用类型', () => {
  it('全部六种类型都在云白名单内（mm/opml 已同步）', () => {
    expect(CLOUD_NEW_FILE_TYPE_OPTIONS.map((option) => option.id)).toEqual([
      'markdown',
      'taumap',
      'freemind',
      'opml',
      'plaintext',
      'json',
    ]);
  });
});
