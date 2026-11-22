import { describe, expect, it } from 'vitest';
import { validateMindMapDocument } from '@/services/mindmapService';
import { getMindmapImageNodes, MINDMAP_IMAGE_NODES_EXTENSION } from '@/services/mindmapImageNodeService';
import { createWelcomeMindMapDocument } from '@/services/welcomeMindMap';

describe('createWelcomeMindMapDocument', () => {
  it('returns a valid, multi-sheet tour that demonstrates editing and visual features', () => {
    const document = createWelcomeMindMapDocument();
    const validation = validateMindMapDocument(document);

    expect(validation.ok).toBe(true);
    expect(document.sheets).toHaveLength(4);
    expect(document.relations).toHaveLength(3);
    expect(document.themeId).toBe('rainbow');
    expect(Object.values(document.topics).some((topic) => topic.notes)).toBe(true);
    expect(Object.values(document.topics).some((topic) => topic.labels?.length)).toBe(true);
    expect(Object.values(document.topics).some((topic) => topic.markers?.length)).toBe(true);
    expect(Object.values(document.topics).some((topic) => topic.link)).toBe(true);
    expect(Object.values(document.topics).some((topic) => topic.textStyles?.length)).toBe(true);
    expect(Object.values(document.topics).some((topic) => topic.boundary)).toBe(true);
    expect(Object.values(document.topics).some((topic) => topic.summary)).toBe(true);
    expect(document.opaqueExtensions?.[MINDMAP_IMAGE_NODES_EXTENSION]).toBeDefined();
    expect(getMindmapImageNodes(document)).toHaveLength(1);
    expect(Object.keys(document.topics).length).toBeGreaterThanOrEqual(80);
    expect(Object.values(document.topics).some((topic) => topic.text.includes('Mermaid'))).toBe(true);
    expect(Object.values(document.topics).some((topic) => topic.text.includes('工作区搜索'))).toBe(true);
    expect(Object.values(document.topics).some((topic) => topic.text.includes('暂不支持导入'))).toBe(true);
    expect(document.sheets?.map((sheet) => sheet.title)).toContain('应用功能地图');
  });
});
