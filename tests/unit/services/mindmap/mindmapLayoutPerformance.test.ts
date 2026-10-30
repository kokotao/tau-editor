/**
 * 思维导图布局性能与 200 节点验收（阶段 2）。
 *
 * - 200 节点：用仓库内 acceptance-200.taumap.json 做「真实文件」验收；
 * - 1k / 5k / 10k：合成宽树，记录布局耗时并设宽松上限，防止明显退化。
 *
 * 说明：阈值按开发机留足余量，仅用于发现数量级退化，不作为 SLA。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMindMapDocument } from '@/services/mindmapService';
import { computeMindmapLayout } from '@/services/mindmapLayoutService';
import type { MindMapDocument } from '@/types/mindmap';

// vitest 以项目根目录为 cwd 运行
const FIXTURE_PATH = resolve(process.cwd(), 'tests/fixtures/mindmap/acceptance-200.taumap.json');

function buildWideTree(total: number): MindMapDocument {
  const doc: MindMapDocument = {
    format: 'tau-mindmap',
    schemaVersion: 1,
    id: 'perf',
    title: '性能',
    rootTopicId: 'root',
    layoutMode: 'mindmap',
    themeId: 'default',
    saveMode: 'native',
    topics: { root: { id: 'root', parentId: null, childIds: [], text: '中心' } },
  };
  const ids: string[] = [];
  for (let i = 0; i < total - 1; i += 1) {
    const id = `n${i}`;
    doc.topics[id] = { id, parentId: 'root', childIds: [], text: `节点 ${i}` };
    ids.push(id);
  }
  doc.topics.root.childIds = ids;
  return doc;
}

function timeLayout(doc: MindMapDocument): { nodes: number; ms: number } {
  const start = performance.now();
  const layout = computeMindmapLayout(doc);
  return { nodes: layout.nodes.length, ms: performance.now() - start };
}

describe('思维导图布局性能', () => {
  it('200 节点真实 fixture：解析 + 布局可用', () => {
    const raw = readFileSync(FIXTURE_PATH, 'utf-8');
    const document = parseMindMapDocument(raw);
    expect(Object.keys(document.topics)).toHaveLength(200);

    const result = timeLayout(document);
    expect(result.nodes).toBe(200);
    expect(result.ms).toBeLessThan(200);
    // eslint-disable-next-line no-console
    console.log(`[mindmap-layout] 200 节点 fixture: ${result.ms.toFixed(1)}ms`);
  });

  it('1k 节点布局 < 1500ms', () => {
    const result = timeLayout(buildWideTree(1000));
    expect(result.nodes).toBe(1000);
    expect(result.ms).toBeLessThan(1500);
    // eslint-disable-next-line no-console
    console.log(`[mindmap-layout] 1k 节点: ${result.ms.toFixed(1)}ms`);
  });

  it('5k 节点布局 < 8000ms', () => {
    const result = timeLayout(buildWideTree(5000));
    expect(result.nodes).toBe(5000);
    expect(result.ms).toBeLessThan(8000);
    // eslint-disable-next-line no-console
    console.log(`[mindmap-layout] 5k 节点: ${result.ms.toFixed(1)}ms`);
  });

  it('10k 节点布局 < 20000ms', () => {
    const result = timeLayout(buildWideTree(10000));
    expect(result.nodes).toBe(10000);
    expect(result.ms).toBeLessThan(20000);
    // eslint-disable-next-line no-console
    console.log(`[mindmap-layout] 10k 节点: ${result.ms.toFixed(1)}ms`);
  });
});