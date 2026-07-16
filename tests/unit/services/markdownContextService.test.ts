import { describe, expect, it } from 'vitest';
import { collectMarkdownContext } from '@/services/markdownService';

describe('markdownContextService', () => {
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
});
