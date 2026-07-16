import { describe, expect, it } from 'vitest';
import { rankQuickOpenFiles } from '@/services/quickOpenService';

describe('quickOpenService', () => {
  it('优先匹配文件名，其次匹配完整相对路径', () => {
    const results = rankQuickOpenFiles([
      { path: '/workspace/docs/release-notes.md', name: 'release-notes.md' },
      { path: '/workspace/src/releaseService.ts', name: 'releaseService.ts' },
      { path: '/workspace/src/app.ts', name: 'app.ts' },
    ], 'release');

    expect(results.map((item) => item.name)).toEqual([
      'release-notes.md',
      'releaseService.ts',
    ]);
  });
});
