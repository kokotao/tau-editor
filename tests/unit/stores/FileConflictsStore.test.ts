/**
 * FileConflictsStore 单元测试
 * 覆盖外部变更冲突的标记、查询、清理与路径归一化
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useFileConflictsStore } from '@/stores/fileConflicts';

describe('FileConflictsStore', () => {
  let conflicts: ReturnType<typeof useFileConflictsStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    conflicts = useFileConflictsStore();
  });

  it('标记冲突并记录磁盘元数据', () => {
    const firstTime = conflicts.flag({
      path: '/ws/notes.md',
      kind: 'modified',
      diskModifiedMs: 1700,
      diskSize: 128,
      baselineModifiedMs: 1600,
      detectedAt: 1900,
    });

    expect(firstTime).toBe(true);
    expect(conflicts.hasConflicts).toBe(true);
    expect(conflicts.count).toBe(1);
    expect(conflicts.find('/ws/notes.md')).toEqual({
      path: '/ws/notes.md',
      kind: 'modified',
      detectedAt: 1900,
      diskModifiedMs: 1700,
      diskSize: 128,
      baselineModifiedMs: 1600,
    });
  });

  it('重复标记同一路径返回 false 并刷新最新状态', () => {
    conflicts.flag({ path: '/ws/notes.md', kind: 'modified', detectedAt: 1 });
    const secondTime = conflicts.flag({
      path: '/ws/notes.md',
      kind: 'modified',
      diskModifiedMs: 2000,
      detectedAt: 2,
    });

    expect(secondTime).toBe(false);
    expect(conflicts.count).toBe(1);
    expect(conflicts.find('/ws/notes.md')?.diskModifiedMs).toBe(2000);
    expect(conflicts.find('/ws/notes.md')?.detectedAt).toBe(2);
  });

  it('Windows 路径大小写与分隔符不影响匹配', () => {
    conflicts.flag({ path: 'C:\\Work\\Notes.md', kind: 'modified' });

    expect(conflicts.find('c:/work/notes.md')?.path).toBe('C:\\Work\\Notes.md');
    expect(conflicts.paths).toEqual(['c:/work/notes.md']);

    conflicts.resolve('c:/work/NOTES.md');
    expect(conflicts.count).toBe(0);
  });

  it('空路径查询与清理是安全空操作', () => {
    conflicts.flag({ path: '/ws/a.md', kind: 'created' });

    expect(conflicts.find(null)).toBeNull();
    expect(conflicts.find('')).toBeNull();
    conflicts.resolve(null);
    conflicts.resolve(undefined);

    expect(conflicts.count).toBe(1);
  });

  it('retainOnly 丢弃已关闭标签的冲突记录', () => {
    conflicts.flag({ path: '/ws/a.md', kind: 'modified' });
    conflicts.flag({ path: '/ws/b.md', kind: 'modified' });
    conflicts.flag({ path: '/ws/c.md', kind: 'removed' });

    conflicts.retainOnly(['/ws/a.md', '/ws/b.md']);

    expect(conflicts.paths).toEqual(['/ws/a.md', '/ws/b.md']);
    expect(conflicts.find('/ws/c.md')).toBeNull();
  });

  it('clear 清空全部记录', () => {
    conflicts.flag({ path: '/ws/a.md', kind: 'modified' });
    conflicts.flag({ path: '/ws/b.md', kind: 'renamed' });

    conflicts.clear();

    expect(conflicts.hasConflicts).toBe(false);
    expect(conflicts.paths).toEqual([]);
  });
});
