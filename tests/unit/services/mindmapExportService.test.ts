import { describe, expect, it } from 'vitest';
import { MINDMAP_EXPORT_FORMATS } from '@/services/mindmap/importExportService';
import { canExportMindmapFormat, exportMindmapBrandedText, resolveMindmapVisualExportOptions } from '@/services/mindmapExportService';
import { createEmptyMindMapDocument } from '@/services/mindmapService';

describe('mindmap export membership policy', () => {
  it('严格按免费、Plus、Pro 格式矩阵授权', () => {
    const allowed = (tier: unknown) => MINDMAP_EXPORT_FORMATS.filter((format) => canExportMindmapFormat(format.id, tier)).map((format) => format.id);
    expect(allowed('FREE').sort()).toEqual(['taumap', 'markdown', 'pdf', 'jpg'].sort());
    expect(allowed('PLUS').sort()).toEqual(['taumap', 'markdown', 'pdf', 'jpg', 'freemind', 'svg'].sort());
    expect(allowed('PRO')).toHaveLength(MINDMAP_EXPORT_FORMATS.length);
    expect(allowed('unknown')).toEqual(allowed('FREE'));
  });

  it('付费会员可自定义或关闭水印，免费档始终保留品牌水印', () => {
    expect(resolveMindmapVisualExportOptions({ tier: 'FREE', customWatermark: 'private' })).toMatchObject({ watermark: true, watermarkText: 'TauEditor' });
    expect(resolveMindmapVisualExportOptions({ tier: 'PLUS', customWatermark: 'private' })).toMatchObject({ watermark: true, watermarkText: 'private' });
    expect(resolveMindmapVisualExportOptions({ tier: 'PLUS', customWatermark: ' ' }).watermark).toBe(false);
    expect(resolveMindmapVisualExportOptions({ tier: 'PRO', customWatermark: '  private  ' })).toMatchObject({ watermark: true, watermarkText: 'private' });
    expect(resolveMindmapVisualExportOptions({ tier: 'PRO', customWatermark: ' ' }).watermark).toBe(false);
  });

  it('免费结构化导出包含兼容的品牌标记且不修改原文档', () => {
    const doc = createEmptyMindMapDocument('中心');
    const native = exportMindmapBrandedText('taumap', doc, 'FREE');
    expect(JSON.parse(native.output).opaqueExtensions.tauEditorBrand).toBe('TauEditor');
    expect(doc.opaqueExtensions?.tauEditorBrand).toBeUndefined();
    expect(exportMindmapBrandedText('markdown', doc, 'FREE').output).toContain('<!-- Exported with TauEditor -->');
    expect(exportMindmapBrandedText('markdown', doc, 'PLUS').output).not.toContain('<!-- Exported with TauEditor -->');
  });
});
