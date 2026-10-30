import { describe, expect, it } from 'vitest';
import {
  MINDMAP_EXPORT_FORMATS,
  buildExportFileName,
  canExportFormat,
  exportMindmapPdfFile,
  exportMindmapSvgText,
  exportMindmapText,
  previewMindmapImport,
} from '@/services/mindmap/importExportService';
import { createEmptyMindMapDocument, serializeMindMapDocument } from '@/services/mindmapService';
import { documentToOutline } from '@/services/mindmap/outlineDocument';
import { buildStoredZip } from './zipFixture';
import type { MindMapDocument } from '@/types/mindmap';

function sampleDoc(): MindMapDocument {
  const doc = createEmptyMindMapDocument('示例');
  const root = doc.rootTopicId;
  doc.topics.a = { id: 'a', parentId: root, childIds: [], text: '分支 A' };
  doc.topics.b = { id: 'b', parentId: root, childIds: [], text: '分支 B' };
  const rootTopic = doc.topics[root];
  if (rootTopic) rootTopic.childIds = ['a', 'b'];
  return doc;
}

describe('previewMindmapImport', () => {
  it('原生 .taumap 判为 native 且解析成功', async () => {
    const document = sampleDoc();
    const preview = await previewMindmapImport({
      fileName: 'my.taumap',
      content: serializeMindMapDocument(document),
    });
    expect(preview.ok).toBe(true);
    expect(preview.formatId).toBe('taumap');
    expect(preview.supportLevel).toBe('native');
    expect(documentToOutline(preview.document as MindMapDocument).map((n) => n.text))
      .toEqual(['分支 A', '分支 B']);
    expect(preview.lossy).toEqual([]);
  });

  it('Markdown 判为 compatible 并给出有损说明', async () => {
    const preview = await previewMindmapImport({
      fileName: 'outline.md',
      content: '# 根\n- 一\n- 二',
    });
    expect(preview.ok).toBe(true);
    expect(preview.formatId).toBe('markdown');
    expect(preview.supportLevel).toBe('compatible');
    expect(preview.lossy.length).toBeGreaterThan(0);
  });

  it('OPML / FreeMind 均可预览', async () => {
    const opml = '<?xml version="1.0"?><opml version="2.0"><body><outline text="A"><outline text="A1"/></outline></body></opml>';
    const opmlPreview = await previewMindmapImport({ fileName: 'a.opml', content: opml });
    expect(opmlPreview.ok).toBe(true);
    expect(opmlPreview.formatId).toBe('opml');

    const mm = '<?xml version="1.0"?><map version="0.9.1"><node TEXT="中心"><node TEXT="A"/></node></map>';
    const mmPreview = await previewMindmapImport({ fileName: 'a.mm', content: mm });
    expect(mmPreview.ok).toBe(true);
    expect(mmPreview.formatId).toBe('freemind');
  });

  it('XMind 需要二进制通道', async () => {
    const withoutBytes = await previewMindmapImport({ fileName: 'a.xmind' });
    expect(withoutBytes.ok).toBe(false);
    expect(withoutBytes.error?.code).toBe('BINARY_REQUIRED');
  });

  it('XMind 二进制导入成功并记录版本', async () => {
    const content = JSON.stringify([
      { id: 's', class: 'sheet', rootTopic: { id: 'r', title: '中心', children: { attached: [{ id: 'a', title: 'A' }] } } },
    ]);
    const zip = buildStoredZip([{ name: 'content.json', content }]);
    const preview = await previewMindmapImport({ fileName: 'a.xmind', bytes: zip });
    expect(preview.ok).toBe(true);
    expect(preview.formatId).toBe('xmind');
    expect(preview.supportLevel).toBe('compatible');
    expect(preview.version).toBe('Zen/Workbook');
    expect(preview.document?.sourceFormat).toBe('xmind-zen');
  });

  it('歧义 .map 不静默判定，要求明确格式', async () => {
    const preview = await previewMindmapImport({
      fileName: 'weird.map',
      content: 'nothing recognizable',
    });
    expect(preview.ok).toBe(false);
    expect(preview.error?.code).toBe('AMBIGUOUS_FORMAT');
    expect(preview.document).toBeNull();
  });

  it('未知格式返回 UNKNOWN_FORMAT', async () => {
    const preview = await previewMindmapImport({ fileName: 'data.csv', content: 'a,b' });
    expect(preview.ok).toBe(false);
    expect(preview.error?.code).toBe('UNKNOWN_FORMAT');
  });

  it('损坏的 .taumap 失败且不返回文档', async () => {
    const preview = await previewMindmapImport({ fileName: 'bad.taumap', content: '{ broken' });
    expect(preview.ok).toBe(false);
    expect(preview.document).toBeNull();
    expect(preview.error?.category).toBe('corrupt-content');
  });

  it('DOCTYPE 注入被安全拒绝', async () => {
    const evil = '<?xml version="1.0"?><!DOCTYPE opml [<!ENTITY x "y">]><opml><body><outline text="&x;"/></body></opml>';
    const preview = await previewMindmapImport({ fileName: 'evil.opml', content: evil });
    expect(preview.ok).toBe(false);
    expect(preview.error?.category).toBe('security-policy');
  });

  it('空内容导入失败但不抛异常', async () => {
    const preview = await previewMindmapImport({ fileName: 'empty.md', content: '' });
    expect(preview.ok).toBe(false);
    expect(preview.document).toBeNull();
  });
});

describe('导出', () => {
  it('清单包含 taumap/markdown/opml/freemind/png/svg/pdf 共 7 种', () => {
    const ids = MINDMAP_EXPORT_FORMATS.map((format) => format.id).sort();
    expect(ids).toEqual(['freemind', 'markdown', 'opml', 'pdf', 'png', 'svg', 'taumap']);
    expect(MINDMAP_EXPORT_FORMATS).toHaveLength(7);
    const svg = MINDMAP_EXPORT_FORMATS.find((format) => format.id === 'svg');
    expect(svg?.extension).toBe('svg');
    expect(svg?.label).toContain('SVG');

    const pdf = MINDMAP_EXPORT_FORMATS.find((format) => format.id === 'pdf');
    expect(pdf?.extension).toBe('pdf');
    expect(pdf?.label).toBe('PDF 文档（.pdf）');
  });

  it('文本导出覆盖四种格式且内容可用', () => {
    const doc = sampleDoc();
    const taumap = exportMindmapText('taumap', doc);
    expect(taumap.ok).toBe(true);
    expect(JSON.parse(taumap.output).format).toBe('tau-mindmap');

    const markdown = exportMindmapText('markdown', doc);
    expect(markdown.ok).toBe(true);
    expect(markdown.output).toContain('- 分支 A');

    const opml = exportMindmapText('opml', doc);
    expect(opml.ok).toBe(true);
    expect(opml.output).toContain('<outline text="分支 A"');

    const mm = exportMindmapText('freemind', doc);
    expect(mm.ok).toBe(true);
    expect(mm.output).toContain('TEXT="分支 A"');
  });

  it('XMind 不可导出，PNG / SVG / PDF 可导出', () => {
    expect(canExportFormat('xmind')).toBe(false);
    expect(canExportFormat('png')).toBe(true);
    expect(canExportFormat('svg')).toBe(true);
    expect(canExportFormat('pdf')).toBe(true);
    expect(canExportFormat('markdown')).toBe(true);
  });

  it('SVG 导出：输出以 <svg 开头且包含节点文本与连线', () => {
    const doc = sampleDoc();
    const result = exportMindmapSvgText(doc);
    expect(result.ok).toBe(true);
    expect(result.output.startsWith('<svg')).toBe(true);
    expect(result.output.trimEnd().endsWith('</svg>')).toBe(true);
    // 不携带 XML 声明，便于内联
    expect(result.output).not.toContain('<?xml');
    // 节点文本
    expect(result.output).toContain('示例');
    expect(result.output).toContain('分支 A');
    expect(result.output).toContain('分支 B');
    // 连线
    expect(result.output).toContain('<path');
    expect(result.lossy && result.lossy.length).toBeGreaterThan(0);
  });

  it('SVG 默认透明背景，指定颜色时渲染背景矩形', () => {
    const doc = sampleDoc();
    const transparent = exportMindmapSvgText(doc);
    expect(transparent.ok).toBe(true);
    expect(transparent.output).not.toContain('<rect x="0" y="0"');

    const filled = exportMindmapSvgText(doc, { background: '#ffffff' });
    expect(filled.ok).toBe(true);
    expect(filled.output).toContain('<rect x="0" y="0"');
    expect(filled.output).toContain('fill="#ffffff"');
  });

  it('exportMindmapText 对 svg 委托矢量导出、对 png/pdf 返回明确错误', () => {
    const doc = sampleDoc();
    const viaText = exportMindmapText('svg', doc);
    expect(viaText.ok).toBe(true);
    expect(viaText.output.startsWith('<svg')).toBe(true);

    const png = exportMindmapText('png', doc);
    expect(png.ok).toBe(false);
    expect(png.output).toBe('');
    expect(png.error?.code).toBe('BINARY_EXPORT_REQUIRED');

    const pdf = exportMindmapText('pdf', doc);
    expect(pdf.ok).toBe(false);
    expect(pdf.output).toBe('');
    expect(pdf.error?.code).toBe('BINARY_EXPORT_REQUIRED');
    expect(pdf.error?.message).toContain('exportMindmapPdfFile');
  });

  it('exportMindmapPdfFile 在无画布环境返回分类错误而非抛异常', async () => {
    // happy-dom 无 2D 画布能力：必须优雅失败，绝不返回坏字节
    const result = await exportMindmapPdfFile(sampleDoc());
    expect(result.ok).toBe(false);
    expect(result.bytes).toBeUndefined();
    expect(result.error?.code).toBe('PDF_UNSUPPORTED_ENV');
    expect(result.error?.message).toMatch(/不支持/);
  });

  it('exportMindmapPdfFile 尺寸超限归类为 PDF_SIZE_LIMIT', async () => {
    const result = await exportMindmapPdfFile(sampleDoc(), { scale: 100000 });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PDF_SIZE_LIMIT');
    expect(result.error?.category).toBe('invalid-structure');
  });

  it('导出文件名清理非法字符并补扩展名', () => {
    expect(buildExportFileName('我的/导图:*?', 'taumap')).toBe('我的 导图.taumap');
    expect(buildExportFileName('', 'md')).toBe('思维导图.md');
  });
});