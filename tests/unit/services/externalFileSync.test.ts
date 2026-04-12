import { describe, expect, it } from 'vitest';
import {
  normalizeModifiedTimestamp,
  resolveExternalFileSyncAction,
} from '@/services/externalFileSync';

describe('externalFileSync', () => {
  it('应将字符串时间戳转换为毫秒数', () => {
    expect(normalizeModifiedTimestamp('2026-04-12T14:00:00.000Z')).toBe(1776002400000);
  });

  it('文件有外部新版本且当前标签未修改时应触发重载', () => {
    expect(
      resolveExternalFileSyncAction({
        filePath: '/tmp/demo.txt',
        isUntitled: false,
        isLoadingContent: false,
        isDirty: false,
        lastKnownModified: 100,
        externalModifiedAt: null,
        observedModified: 200,
      }),
    ).toBe('reload');
  });

  it('文件有外部新版本且当前标签已修改时应标记冲突', () => {
    expect(
      resolveExternalFileSyncAction({
        filePath: '/tmp/demo.txt',
        isUntitled: false,
        isLoadingContent: false,
        isDirty: true,
        lastKnownModified: 100,
        externalModifiedAt: null,
        observedModified: 200,
      }),
    ).toBe('flag');
  });

  it('已记录外部冲突且标签恢复干净后应重载磁盘内容', () => {
    expect(
      resolveExternalFileSyncAction({
        filePath: '/tmp/demo.txt',
        isUntitled: false,
        isLoadingContent: false,
        isDirty: false,
        lastKnownModified: 100,
        externalModifiedAt: 200,
        observedModified: 200,
      }),
    ).toBe('reload');
  });

  it('未打开实体文件或仍在加载时应忽略同步', () => {
    expect(
      resolveExternalFileSyncAction({
        filePath: null,
        isUntitled: true,
        isLoadingContent: false,
        isDirty: false,
        lastKnownModified: 100,
        externalModifiedAt: null,
        observedModified: 200,
      }),
    ).toBe('noop');

    expect(
      resolveExternalFileSyncAction({
        filePath: '/tmp/demo.txt',
        isUntitled: false,
        isLoadingContent: true,
        isDirty: false,
        lastKnownModified: 100,
        externalModifiedAt: null,
        observedModified: 200,
      }),
    ).toBe('noop');
  });
});
