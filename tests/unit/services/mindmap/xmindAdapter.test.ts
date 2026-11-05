import { describe, expect, it } from 'vitest';
import {
  detectXmindVariant,
  parseZenContent,
  parseXmind8Xml,
  xmindAdapter,
} from '@/services/mindmap/adapters/xmindAdapter';
import { documentToOutline } from '@/services/mindmap/outlineDocument';
import { listZipEntries, readZipTextEntry } from '@/services/mindmap/zipReader';
import { buildStoredZip } from './zipFixture';
import type { MindMapDocument } from '@/types/mindmap';

const ZEN_CONTENT = JSON.stringify([
  {
    id: 'sheet-1',
    class: 'sheet',
    title: 'Sheet 1',
    rootTopic: {
      id: 'root',
      title: '中心主题',
      children: {
        attached: [
          {
            id: 'a',
            title: '分支 A',
            children: { attached: [{ id: 'a1', title: 'A1' }] },
          },
          {
            id: 'b',
            title: '分支 B',
            notes: { plain: { content: 'B 的备注' } },
          },
        ],
      },
    },
  },
]);

const XMIND8_CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<xmap-content version="2.0">
  <sheet id="s1">
    <topic id="r">
      <title>中心主题</title>
      <children>
        <topics type="attached">
          <topic id="a">
            <title>分支 A</title>
            <children>
              <topics type="attached">
                <topic id="a1"><title>A1</title></topic>
              </topics>
            </children>
          </topic>
          <topic id="b">
            <title>分支 B</title>
            <notes><plain>B 的备注</plain></notes>
          </topic>
        </topics>
      </children>
    </topic>
  </sheet>
</xmap-content>`;

function zenZip(): Uint8Array {
  return buildStoredZip([
    { name: 'content.json', content: ZEN_CONTENT },
    { name: 'metadata.json', content: '{"creator":"test"}' },
  ]);
}

function xmind8Zip(): Uint8Array {
  return buildStoredZip([
    { name: 'content.xml', content: XMIND8_CONTENT },
    { name: 'META-INF/manifest.xml', content: '<manifest/>' },
  ]);
}

describe('ZIP 读取器', () => {
  it('列出 stored 条目并读取文本', async () => {
    const zip = zenZip();
    const entries = listZipEntries(zip);
    expect(entries.map((entry) => entry.name).sort()).toEqual(['content.json', 'metadata.json']);
    const text = await readZipTextEntry(zip, 'content.json');
    expect(text).toBe(ZEN_CONTENT);
    expect(await readZipTextEntry(zip, 'missing.json')).toBeNull();
  });

  it('非 ZIP 内容返回空条目列表', () => {
    expect(listZipEntries(new TextEncoder().encode('not a zip'))).toEqual([]);
  });
});

describe('XMind 分支识别', () => {
  it('content.json → Zen/Workbook', () => {
    const info = detectXmindVariant(zenZip());
    expect(info.variant).toBe('zen');
    expect(info.entryName).toBe('content.json');
  });

  it('content.xml → XMind 8', () => {
    const info = detectXmindVariant(xmind8Zip());
    expect(info.variant).toBe('xmind8');
    expect(info.entryName).toBe('content.xml');
  });

  it('缺少两种内容时 unknown', () => {
    const info = detectXmindVariant(buildStoredZip([{ name: 'a.txt', content: 'x' }]));
    expect(info.variant).toBe('unknown');
  });
});

describe('XMind 内容解析', () => {
  it('Zen content.json 递归读取标题与备注', () => {
    const root = parseZenContent(ZEN_CONTENT);
    expect(root.text).toBe('中心主题');
    expect(root.children.map((child) => child.text)).toEqual(['分支 A', '分支 B']);
    expect(root.children[0]?.children[0]?.text).toBe('A1');
    expect(root.children[1]?.note).toBe('B 的备注');
  });

  it('XMind 8 content.xml 递归读取并忽略非 attached 分支', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<xmap-content version="2.0">
  <sheet id="s1">
    <topic id="r">
      <title>中心主题</title>
      <children>
        <topics type="attached">
          <topic id="a"><title>分支 A</title></topic>
          <topic id="b"><title>分支 B</title></topic>
        </topics>
        <topics type="detached">
          <topic id="f"><title>浮动主题</title></topic>
        </topics>
      </children>
    </topic>
  </sheet>
</xmap-content>`;
    const root = parseXmind8Xml(xml);
    expect(root.text).toBe('中心主题');
    expect(root.children.map((child) => child.text)).toEqual(['分支 A', '分支 B']);
    expect(root.children.some((child) => child.text === '浮动主题')).toBe(false);
  });

  it('损坏/不安全 XML 抛错', () => {
    expect(() => parseXmind8Xml('<xmap-content><!DOCTYPE x></xmap-content>')).toThrow();
    expect(() => parseXmind8Xml('<other/>')).toThrow();
  });
});

describe('XMind 适配器导入', () => {
  it('导入 Zen 容器为合法文档并记录来源版本', async () => {
    const result = await xmindAdapter.importFromBytes(zenZip());
    expect(result.ok).toBe(true);
    const doc = result.document as MindMapDocument;
    expect(doc.sourceFormat).toBe('xmind-zen');
    expect(doc.title).toBe('中心主题');
    const outline = documentToOutline(doc);
    expect(outline.map((node) => node.text)).toEqual(['分支 A', '分支 B']);
    expect(result.lossy?.length).toBeGreaterThan(0);
  });

  it('导入 XMind 8 容器', async () => {
    const result = await xmindAdapter.importFromBytes(xmind8Zip());
    expect(result.ok).toBe(true);
    expect((result.document as MindMapDocument).sourceFormat).toBe('xmind-8');
  });

  it('非 ZIP 内容导入失败', async () => {
    const result = await xmindAdapter.importFromBytes(new TextEncoder().encode('plain text'));
    expect(result.ok).toBe(false);
    expect(result.error?.category).toBe('corrupt-content');
  });

  it('未知容器条目导入失败', async () => {
    const zip = buildStoredZip([{ name: 'other.json', content: '{}' }]);
    const result = await xmindAdapter.importFromBytes(zip);
    expect(result.ok).toBe(false);
  });

  it('文本导入提示需要二进制，导出明确不支持', () => {
    const imported = xmindAdapter.importFromString();
    expect(imported.ok).toBe(false);
    expect(imported.error?.code).toBe('BINARY_REQUIRED');
    const exported = xmindAdapter.exportToString();
    expect(exported.ok).toBe(false);
    expect(exported.error?.code).toBe('EXPORT_UNSUPPORTED');
  });
});