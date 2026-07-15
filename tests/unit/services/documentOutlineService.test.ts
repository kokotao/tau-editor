import { describe, expect, it } from 'vitest';
import { buildDocumentOutline } from '@/services/documentOutlineService';

describe('documentOutlineService', () => {
  it('解析 Markdown 标题并跳过 fenced code block 中的伪标题', () => {
    expect(
      buildDocumentOutline({
        language: 'markdown',
        content: '# Overview\n```md\n# ignored\n```\n## Details',
      }),
    ).toMatchObject([
      { label: 'Overview', kind: 'heading', level: 1, line: 1 },
      { label: 'Details', kind: 'heading', level: 2, line: 5 },
    ]);
  });

  it('仅由同字符且长度不短于开启围栏的标记关闭 fenced code block', () => {
    expect(
      buildDocumentOutline({
        language: 'markdown',
        content: '````\n# ignored first\n```\n# ignored second\n````\n# included',
      }),
    ).toMatchObject([{ label: 'included', kind: 'heading', level: 1, line: 6 }]);
  });

  it('不将带语言或其他文本后缀的围栏标记视为 fenced code block 关闭符', () => {
    expect(
      buildDocumentOutline({
        language: 'markdown',
        content: '```md\n# ignored first\n```not-a-closer\n# ignored second\n````js\n# ignored third\n```\n# included',
      }),
    ).toMatchObject([{ label: 'included', kind: 'heading', level: 1, line: 8 }]);
  });

  it('为重复 Markdown 标题生成稳定且不冲突的 ID', () => {
    const input = { language: 'markdown', content: '# Intro\n# Intro' };

    const firstResult = buildDocumentOutline(input);
    const secondResult = buildDocumentOutline(input);

    expect(firstResult.map((item) => item.id)).toEqual(secondResult.map((item) => item.id));
    expect(new Set(firstResult.map((item) => item.id)).size).toBe(2);
  });

  it('解析 JSON 的顶层和直属二层键', () => {
    expect(
      buildDocumentOutline({
        language: 'json',
        content: '{\n  "server": {\n    "port": 3000\n  },\n  "enabled": true\n}',
      }),
    ).toMatchObject([
      { label: 'server', kind: 'key', level: 1, line: 2 },
      { label: 'port', kind: 'key', level: 2, line: 3 },
      { label: 'enabled', kind: 'key', level: 1, line: 5 },
    ]);
  });

  it('JSON 只解析前 5000 行，忽略截断范围外的无效内容', () => {
    const content = [
      '{',
      '  "visible": true',
      '}',
      ...Array.from({ length: 4_997 }, () => ''),
      '{ invalid after the scan limit',
    ].join('\n');

    expect(buildDocumentOutline({ language: 'json', content })).toMatchObject([
      { label: 'visible', kind: 'key', level: 1, line: 2 },
    ]);
  });

  it('在根闭合位于截断范围外时保守输出已完成的顶层 JSON 键', () => {
    const content = [
      '{',
      '  "visible": true',
      ...Array.from({ length: 4_998 }, () => ''),
      '}',
    ].join('\n');

    expect(buildDocumentOutline({ language: 'json', content })).toMatchObject([
      { label: 'visible', kind: 'key', level: 1, line: 2 },
    ]);
  });

  it('不从根闭合位于截断范围外的畸形 JSON 片段输出键', () => {
    const content = [
      '{',
      '  "broken": }',
      ...Array.from({ length: 4_998 }, () => ''),
      '}',
    ].join('\n');

    expect(buildDocumentOutline({ language: 'json', content })).toEqual([]);
  });

  it('解析 YAML 的顶层和直属二层键', () => {
    expect(
      buildDocumentOutline({
        language: 'yaml',
        content: 'server:\n  host: localhost\n  port: 3000\nfeatures:\n  enabled: true',
      }),
    ).toMatchObject([
      { label: 'server', kind: 'key', level: 1, line: 1 },
      { label: 'host', kind: 'key', level: 2, line: 2 },
      { label: 'port', kind: 'key', level: 2, line: 3 },
      { label: 'features', kind: 'key', level: 1, line: 4 },
      { label: 'enabled', kind: 'key', level: 2, line: 5 },
    ]);
  });

  it('在 JSON 或 YAML 无法保守解析时安全降级为空数组', () => {
    expect(buildDocumentOutline({ language: 'json', content: '{ invalid' })).toEqual([]);
    expect(buildDocumentOutline({ language: 'yaml', content: '  orphan: value' })).toEqual([]);
  });

  it('不从截断范围内的畸形 JSON 输出键', () => {
    expect(buildDocumentOutline({ language: 'json', content: '{"server": }' })).toEqual([]);
  });

  it('仅识别受支持代码语言中的类、接口、函数和方法声明', () => {
    const outlines = buildDocumentOutline({
      language: 'typescript',
      content: [
        'export interface Config {}',
        'export class Editor {',
        '  render(): void {}',
        '}',
        'export function createEditor() {}',
        'if (ready) { run(); }',
      ].join('\n'),
    });

    expect(outlines).toMatchObject([
      { label: 'Config', kind: 'class', line: 1 },
      { label: 'Editor', kind: 'class', line: 2 },
      { label: 'render', kind: 'function', line: 3 },
      { label: 'createEditor', kind: 'function', line: 5 },
    ]);
    expect(outlines).toHaveLength(4);
  });

  it.each([
    ['typescript', 'interface Config {}\nclass App {}\nfunction boot() {}', [
      { label: 'Config', kind: 'class', line: 1 },
      { label: 'App', kind: 'class', line: 2 },
      { label: 'boot', kind: 'function', line: 3 },
    ]],
    ['javascript', 'class App {}\nfunction boot() {}', [
      { label: 'App', kind: 'class', line: 1 },
      { label: 'boot', kind: 'function', line: 2 },
    ]],
    ['vue', '<script setup>\nfunction submit() {}\n</script>', [
      { label: 'submit', kind: 'function', line: 2 },
    ]],
    ['python', 'class App:\n    def run(self):\n        pass', [
      { label: 'App', kind: 'class', line: 1 },
      { label: 'run', kind: 'function', line: 2 },
    ]],
    ['java', 'public final class App {}\nprotected interface Repository {}\n  void run() {}', [
      { label: 'App', kind: 'class', line: 1 },
      { label: 'Repository', kind: 'class', line: 2 },
      { label: 'run', kind: 'function', line: 3 },
    ]],
    ['go', 'type Server struct {}\nfunc (s Server) Run() {}', [
      { label: 'Server', kind: 'class', line: 1 },
      { label: 'Run', kind: 'function', line: 2 },
    ]],
    ['rust', 'struct App {}\nfn run() {}', [
      { label: 'App', kind: 'class', line: 1 },
      { label: 'run', kind: 'function', line: 2 },
    ]],
  ])('解析 %s 中的受限声明', (language, content, expected) => {
    const outline = buildDocumentOutline({ language, content });
    expect(outline.map(({ label, kind, line }) => ({ label, kind, line }))).toEqual(expected);
    expect(outline).toHaveLength(expected.length);
  });

  it('解析带常见修饰符的 Java 类、接口和枚举声明', () => {
    expect(
      buildDocumentOutline({
        language: 'java',
        content: 'public final class App {}\nprotected interface Repository {}\nprivate static enum Mode {}',
      }),
    ).toMatchObject([
      { label: 'App', kind: 'class', line: 1 },
      { label: 'Repository', kind: 'class', line: 2 },
      { label: 'Mode', kind: 'class', line: 3 },
    ]);
  });

  it('对未知语言返回空数组', () => {
    expect(buildDocumentOutline({ language: 'plaintext', content: '# not a heading' })).toEqual([]);
  });

  it('最多扫描前 5000 行，并允许 maxLines 进一步收紧扫描范围', () => {
    const beforeLimit = Array.from({ length: 4_999 }, () => 'text');
    const content = [...beforeLimit, '# Included', '# Excluded'].join('\n');

    expect(buildDocumentOutline({ language: 'markdown', content })).toMatchObject([
      { label: 'Included', line: 5_000 },
    ]);
    expect(buildDocumentOutline({ language: 'markdown', content, maxLines: 2 })).toEqual([]);
  });
});
