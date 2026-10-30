import { describe, expect, it } from 'vitest';
import {
  markdownAdapter,
  markdownToOutline,
  outlineToMarkdown,
  stripInlineMarkdown,
} from '@/services/mindmap/adapters/markdownAdapter';
import { opmlAdapter, buildOpml, parseOpmlOutline } from '@/services/mindmap/adapters/opmlAdapter';
import {
  buildFreemind,
  freemindAdapter,
  parseFreemindOutline,
} from '@/services/mindmap/adapters/freemindAdapter';
import { createEmptyMindMapDocument, serializeMindMapDocument } from '@/services/mindmapService';
import { documentToOutline, type OutlineNode } from '@/services/mindmap/outlineDocument';
import type { MindMapDocument } from '@/types/mindmap';

function outlineShape(nodes: OutlineNode[]): unknown[] {
  return nodes.map((node) => ({ text: node.text, children: outlineShape(node.children) }));
}

function buildSampleDocument(): MindMapDocument {
  const doc = createEmptyMindMapDocument('示例导图');
  const root = doc.rootTopicId;
  doc.topics.a = { id: 'a', parentId: root, childIds: ['a1'], text: '分支 A' };
  doc.topics.a1 = { id: 'a1', parentId: 'a', childIds: [], text: 'A1' };
  doc.topics.b = { id: 'b', parentId: root, childIds: [], text: '分支 B', link: 'https://example.com' };
  doc.topics.b.notes = 'B 的备注';
  const rootTopic = doc.topics[root];
  if (rootTopic) {
    rootTopic.childIds = ['a', 'b'];
    rootTopic.text = '示例导图';
  }
  return doc;
}

describe('Markdown 适配器', () => {
  it('导入标题 + 嵌套列表，层级正确', () => {
    const md = [
      '# 产品规划',
      '',
      '- 需求',
      '  - 用户研究',
      '  - 竞品分析',
      '- 设计',
      '  - 交互稿',
      '',
      '```',
      '- 这段代码块不应成为节点',
      '# 也不是标题',
      '```',
    ].join('\n');
    const outline = markdownToOutline(md);
    expect(outline).toHaveLength(1);
    expect(outline[0]?.text).toBe('产品规划');
    expect(outline[0]?.children.map((child) => child.text)).toEqual(['需求', '设计']);
    expect(outline[0]?.children[0]?.children.map((child) => child.text))
      .toEqual(['用户研究', '竞品分析']);
  });

  it('导入结果为合法文档且保留顺序', () => {
    const result = markdownAdapter.importFromString('# 根\n- 一\n- 二\n- 三');
    expect(result.ok).toBe(true);
    const doc = result.document as MindMapDocument;
    const outline = documentToOutline(doc);
    expect(outline.map((node) => node.text)).toEqual(['一', '二', '三']);
    expect(doc.sourceFormat).toBe('markdown-outline');
    expect(doc.saveMode).toBe('imported');
  });

  it('空 Markdown 返回分类错误', () => {
    const result = markdownAdapter.importFromString('纯文本没有结构');
    expect(result.ok).toBe(false);
    expect(result.error?.category).toBe('invalid-structure');
  });

  it('行内样式剥离，不执行 HTML', () => {
    expect(stripInlineMarkdown('**粗体** 与 `代码` 与 [链接](https://x)'))
      .toBe('粗体 与 代码 与 链接');
    expect(stripInlineMarkdown('前 <script>alert(1)</script> 后')).toBe('前 alert(1) 后');
  });

  it('导出保留层级与顺序，且可再次导入', () => {
    const doc = buildSampleDocument();
    const exported = markdownAdapter.exportToString(doc);
    expect(exported.ok).toBe(true);
    expect(exported.output).toContain('# 示例导图');
    expect(exported.output).toContain('- 分支 A');
    expect(exported.output).toContain('  - A1');

    const reimported = markdownAdapter.importFromString(exported.output);
    expect(reimported.ok).toBe(true);
    const outline = documentToOutline(reimported.document as MindMapDocument);
    expect(outlineShape(outline)).toEqual([
      { text: '分支 A', children: [{ text: 'A1', children: [] }] },
      { text: '分支 B', children: [] },
    ]);
  });

  it('Unicode 与长文本往返', () => {
    const doc = createEmptyMindMapDocument('中文 🚀 导图');
    const root = doc.rootTopicId;
    doc.topics.u = { id: 'u', parentId: root, childIds: [], text: '这是一个很长很长的中文主题🚀 with latin' };
    const rootTopic = doc.topics[root];
    if (rootTopic) rootTopic.childIds = ['u'];

    const exported = markdownAdapter.exportToString(doc);
    const reimported = markdownAdapter.importFromString(exported.output);
    const outline = documentToOutline(reimported.document as MindMapDocument);
    expect(outline[0]?.text).toBe('这是一个很长很长的中文主题🚀 with latin');
  });
});

describe('OPML 适配器', () => {
  const sample = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>测试</title></head>
  <body>
    <outline text="分支 A" _link="https://a.example">
      <outline text="A1" _note="备注1" />
    </outline>
    <outline text="分支 B" />
    <outline text="转义 &lt;tag&gt; &amp; more" />
  </body>
</opml>`;

  it('解析嵌套 outline、链接与备注', () => {
    const outline = parseOpmlOutline(sample);
    expect(outline).toHaveLength(3);
    expect(outline[0]?.text).toBe('分支 A');
    expect(outline[0]?.link).toBe('https://a.example');
    expect(outline[0]?.children[0]?.text).toBe('A1');
    expect(outline[0]?.children[0]?.note).toBe('备注1');
    expect(outline[2]?.text).toBe('转义 <tag> & more');
  });

  it('导入 OPML 生成合法文档', () => {
    const result = opmlAdapter.importFromString(sample);
    expect(result.ok).toBe(true);
    const outline = documentToOutline(result.document as MindMapDocument);
    expect(outlineShape(outline)[0]).toEqual({
      text: '分支 A',
      children: [{ text: 'A1', children: [] }],
    });
  });

  it('拒绝 DOCTYPE/ENTITY（安全边界）', () => {
    const evil = '<?xml version="1.0"?><!DOCTYPE opml [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><opml><body><outline text="&xxe;" /></body></opml>';
    const result = opmlAdapter.importFromString(evil);
    expect(result.ok).toBe(false);
    expect(result.error?.category).toBe('security-policy');
  });

  it('导出并往返保持层级与链接', () => {
    const doc = buildSampleDocument();
    const exported = opmlAdapter.exportToString(doc);
    expect(exported.ok).toBe(true);
    const reimported = opmlAdapter.importFromString(exported.output);
    const outline = documentToOutline(reimported.document as MindMapDocument);
    expect(outlineShape(outline)).toEqual([
      { text: '分支 A', children: [{ text: 'A1', children: [] }] },
      { text: '分支 B', children: [] },
    ]);
    expect(outline[1]?.link).toBe('https://example.com');
  });

  it('buildOpml 转义特殊字符', () => {
    const xml = buildOpml('根 <&>', [{ text: 'a & b < c', children: [] }]);
    expect(xml).toContain('a &amp; b &lt; c');
    expect(parseOpmlOutline(xml)[0]?.text).toBe('a & b < c');
  });
});

describe('FreeMind .mm 适配器', () => {
  const sample = `<?xml version="1.0" encoding="UTF-8"?>
<map version="0.9.1">
  <node TEXT="中心">
    <node TEXT="分支 A" LINK="https://a.example">
      <richcontent TYPE="NOTE"><html><body><p>备注 A</p></body></html></richcontent>
      <node TEXT="A1" />
    </node>
    <node TEXT="分支 B &amp; 转义" />
  </node>
</map>`;

  it('解析树、链接与备注', () => {
    const root = parseFreemindOutline(sample);
    expect(root?.text).toBe('中心');
    expect(root?.children).toHaveLength(2);
    expect(root?.children[0]?.link).toBe('https://a.example');
    expect(root?.children[0]?.note).toBe('备注 A');
    expect(root?.children[0]?.children[0]?.text).toBe('A1');
    expect(root?.children[1]?.text).toBe('分支 B & 转义');
  });

  it('导入生成合法文档并记录来源', () => {
    const result = freemindAdapter.importFromString(sample);
    expect(result.ok).toBe(true);
    const doc = result.document as MindMapDocument;
    expect(doc.sourceFormat).toBe('freemind-mm');
    expect(doc.title).toBe('中心');
  });

  it('导出并往返保持层级/链接/备注', () => {
    const doc = buildSampleDocument();
    const exported = freemindAdapter.exportToString(doc);
    expect(exported.ok).toBe(true);
    expect(exported.output).toContain('LINK="https://example.com"');
    expect(exported.output).toContain('TYPE="NOTE"');

    const reimported = freemindAdapter.importFromString(exported.output);
    const outline = documentToOutline(reimported.document as MindMapDocument);
    expect(outlineShape(outline)).toEqual([
      { text: '分支 A', children: [{ text: 'A1', children: [] }] },
      { text: '分支 B', children: [] },
    ]);
    expect(outline[1]?.link).toBe('https://example.com');
    expect(outline[1]?.note).toBe('B 的备注');
  });

  it('拒绝 DOCTYPE（安全边界）', () => {
    const evil = '<?xml version="1.0"?><!DOCTYPE map [<!ENTITY x "y">]><map><node TEXT="&x;" /></map>';
    const result = freemindAdapter.importFromString(evil);
    expect(result.ok).toBe(false);
    expect(result.error?.category).toBe('security-policy');
  });

  it('损坏 XML 返回失败分类', () => {
    const result = freemindAdapter.importFromString('<map><node TEXT="a"></map>');
    expect(result.ok).toBe(false);
  });

  it('buildFreemind 可被重新解析', () => {
    const xml = buildFreemind('根', [{ text: 'a', children: [{ text: 'b', children: [] }] }]);
    const root = parseFreemindOutline(xml);
    expect(root?.text).toBe('根');
    expect(root?.children[0]?.children[0]?.text).toBe('b');
  });
});

describe('示例文档基线', () => {
  it('导出后序列化不修改原文档', () => {
    const doc = buildSampleDocument();
    const before = serializeMindMapDocument(doc);
    markdownAdapter.exportToString(doc);
    opmlAdapter.exportToString(doc);
    freemindAdapter.exportToString(doc);
    expect(serializeMindMapDocument(doc)).toBe(before);
  });

  it('outlineToMarkdown 根标题为空时使用占位', () => {
    expect(outlineToMarkdown('', [])).toContain('# 未命名导图');
  });
});