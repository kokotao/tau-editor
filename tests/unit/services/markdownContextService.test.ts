import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectMarkdownContext, type MarkdownLink } from '@/services/markdownService';
import {
  collectLinkTargets,
  flattenWorkspaceTasks,
  indexLinkStatuses,
  isBrokenLink,
  loadMarkdownLinkStatuses,
  summarizeMarkdownLinkStates,
} from '@/services/markdownContextService';
import { markdownCommands, type MarkdownLinkStatus } from '@/lib/tauri';

vi.mock('@/lib/tauri', () => ({
  markdownCommands: {
    checkLinks: vi.fn(),
    workspaceTasks: vi.fn(),
    importAsset: vi.fn(),
  },
}));

const createLink = (target: string, overrides: Partial<MarkdownLink> = {}): MarkdownLink => ({
  id: `link-${target}`,
  label: target,
  target,
  external: false,
  line: 1,
  ...overrides,
});

const createStatus = (target: string, status: MarkdownLinkStatus['status']): MarkdownLinkStatus => ({
  target,
  status,
});

describe('markdownContextService', () => {
  beforeEach(() => {
    vi.mocked(markdownCommands.checkLinks).mockReset();
  });

  it('聚合任务与链接，并跳过围栏代码中的伪内容', () => {
    const context = collectMarkdownContext([
      '- [ ] 发布 v0.3.0',
      '- [x] 完成设计',
      '[内部文档](docs/guide.md)',
      '[官网](https://example.com)',
      '```markdown',
      '- [ ] 不应出现',
      '[伪链接](fake.md)',
      '```',
    ].join('\n'));

    expect(context.tasks).toEqual([
      { id: 'task-1', label: '发布 v0.3.0', completed: false, line: 1 },
      { id: 'task-2', label: '完成设计', completed: true, line: 2 },
    ]);
    expect(context.links).toEqual([
      { id: 'link-3-1', label: '内部文档', target: 'docs/guide.md', external: false, line: 3 },
      { id: 'link-4-1', label: '官网', target: 'https://example.com', external: true, line: 4 },
    ]);
  });

  it('只把站内相对链接交给工作区校验，并去重', () => {
    const targets = collectLinkTargets([
      createLink('docs/guide.md'),
      createLink('docs/guide.md'),
      createLink('  assets/logo.png  '),
      createLink('#anchor'),
      createLink('mailto:someone@example.com', { external: true }),
      createLink('https://example.com', { external: true }),
      createLink('   '),
    ]);

    expect(targets).toEqual(['docs/guide.md', 'assets/logo.png']);
  });

  it('按状态汇总链接并标记失效链接', () => {
    const links = [
      createLink('docs/guide.md'),
      createLink('missing.md'),
      createLink('../../outside.md'),
      createLink('https://example.com', { external: true }),
    ];
    const statuses = indexLinkStatuses([
      createStatus('docs/guide.md', 'ok'),
      createStatus('missing.md', 'missing'),
      createStatus('../../outside.md', 'outside'),
    ]);

    const summary = summarizeMarkdownLinkStates(links, statuses);

    expect(summary).toMatchObject({
      ok: 1,
      missing: 1,
      outside: 1,
      external: 1,
      broken: 2,
    });
    expect(isBrokenLink(statuses['missing.md']?.status)).toBe(true);
    expect(isBrokenLink(statuses['docs/guide.md']?.status)).toBe(false);
    expect(isBrokenLink(undefined)).toBe(false);
  });

  it('把工作区任务响应展平为可导航条目', () => {
    const entries = flattenWorkspaceTasks({
      files: [
        { relativePath: 'README.md', tasks: [{ line: 3, label: 'Ship v0.3.3', completed: false }] },
        { relativePath: 'docs/plan.md', tasks: [{ line: 12, label: '回归测试', completed: true }] },
      ],
      totalTasks: 2,
      scannedFiles: 2,
      truncated: false,
    });

    expect(entries).toEqual([
      { id: 'README.md:3', relativePath: 'README.md', line: 3, label: 'Ship v0.3.3', completed: false },
      { id: 'docs/plan.md:12', relativePath: 'docs/plan.md', line: 12, label: '回归测试', completed: true },
    ]);
    expect(flattenWorkspaceTasks(null)).toEqual([]);
  });

  it('没有站内链接时跳过工作区校验请求', async () => {
    const statuses = await loadMarkdownLinkStatuses('ws-1', 'notes.md', [
      createLink('https://example.com', { external: true }),
      createLink('#top'),
    ]);

    expect(statuses).toEqual({});
    expect(markdownCommands.checkLinks).not.toHaveBeenCalled();
  });

  it('调用后端校验并返回按目标索引的状态表', async () => {
    vi.mocked(markdownCommands.checkLinks).mockResolvedValue([
      createStatus('docs/guide.md', 'ok'),
      createStatus('missing.md', 'missing'),
    ]);

    const statuses = await loadMarkdownLinkStatuses('ws-1', 'notes.md', [
      createLink('docs/guide.md'),
      createLink('missing.md'),
    ]);

    expect(markdownCommands.checkLinks).toHaveBeenCalledWith('ws-1', 'notes.md', ['docs/guide.md', 'missing.md']);
    expect(statuses['missing.md']?.status).toBe('missing');
  });
});
