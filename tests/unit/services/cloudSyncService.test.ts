import { describe, expect, it } from 'vitest';
import {
  CLOUD_SYNC_MAX_BYTES,
  isCloudSyncEligibleFile,
  resolveCloudDocPathForFile,
  resolveCloudSyncDecision,
  toCloudDocPath,
} from '@/services/cloudSyncService';

describe('cloudSyncService 白名单', () => {
  it('普通文本文件应允许同步', () => {
    expect(isCloudSyncEligibleFile('/ws/notes/readme.md', 1024)).toEqual({ eligible: true });
    expect(isCloudSyncEligibleFile('D:\\ws\\src\\main.ts')).toEqual({ eligible: true });
  });

  it('没有磁盘路径的标签应跳过', () => {
    expect(isCloudSyncEligibleFile(null).eligible).toBe(false);
    expect(isCloudSyncEligibleFile(undefined).eligible).toBe(false);
    expect(isCloudSyncEligibleFile('   ').eligible).toBe(false);
  });

  it('二进制预览与图片文件应跳过', () => {
    expect(isCloudSyncEligibleFile('/ws/manual.pdf').eligible).toBe(false);
    expect(isCloudSyncEligibleFile('/ws/report.docx').eligible).toBe(false);
    expect(isCloudSyncEligibleFile('/ws/screenshot.png').eligible).toBe(false);
  });

  it('超过单文件上限的文件应跳过并给出原因', () => {
    const overLimit = isCloudSyncEligibleFile('/ws/big.log', CLOUD_SYNC_MAX_BYTES + 1);
    expect(overLimit.eligible).toBe(false);
    expect(overLimit.reason).toContain('12 MB');
  });

  it('上限以内的文件仍允许同步', () => {
    expect(isCloudSyncEligibleFile('/ws/big.log', CLOUD_SYNC_MAX_BYTES).eligible).toBe(true);
    expect(isCloudSyncEligibleFile('/ws/big.log', -1).eligible).toBe(true);
  });
});

describe('cloudSyncService 云路径', () => {
  it('应按工作区名与相对路径生成 tau/ 前缀路径', () => {
    expect(toCloudDocPath('tau-workspace', 'notes/读书笔记.md'))
      .toBe('tau/tau-workspace/notes/读书笔记.md');
  });

  it('Windows 反斜杠应统一为正斜杠并去掉多余空段', () => {
    expect(toCloudDocPath('ws', '\\notes\\\\a.md')).toBe('tau/ws/notes/a.md');
    expect(toCloudDocPath('/ws/', '/notes/a.md')).toBe('tau/ws/notes/a.md');
  });

  it('缺少工作区名时只保留 tau 根段', () => {
    expect(toCloudDocPath(null, 'draft.md')).toBe('tau/draft.md');
    expect(toCloudDocPath(undefined, 'draft.md')).toBe('tau/draft.md');
  });

  it('路径中的 . 与 .. 段应被丢弃', () => {
    expect(toCloudDocPath('ws', './a/../b.md')).toBe('tau/ws/a/b.md');
  });

  it('超长路径应截断到 512 个字符', () => {
    const longRelative = `${'a'.repeat(400)}/${'b'.repeat(400)}.md`;
    const cloudPath = toCloudDocPath('ws', longRelative);
    expect(cloudPath.length).toBe(512);
    expect(cloudPath.startsWith('tau/ws/')).toBe(true);
  });

  it('工作区内文件应生成相对路径，工作区外退化为文件名', () => {
    expect(resolveCloudDocPathForFile('/ws/docs/a.md', 'ws', '/ws')).toBe('tau/ws/docs/a.md');
    expect(resolveCloudDocPathForFile('/other/a.md', 'ws', '/ws')).toBe('tau/ws/a.md');
    expect(resolveCloudDocPathForFile('/ws/a.md', null, null)).toBe('tau/a.md');
  });
});

describe('cloudSyncService 三方决策', () => {
  it('云端没有文档时应新建', () => {
    expect(
      resolveCloudSyncDecision({ localHash: 'sha256:aa', remoteHash: null, baseHash: null }),
    ).toBe('create');
  });

  it('本地与云端哈希一致时应跳过', () => {
    expect(
      resolveCloudSyncDecision({
        localHash: 'sha256:aa',
        remoteHash: 'sha256:aa',
        baseHash: 'sha256:aa',
      }),
    ).toBe('skip');
  });

  it('本地未改动而云端已更新时应拉取', () => {
    expect(
      resolveCloudSyncDecision({
        localHash: 'sha256:aa',
        remoteHash: 'sha256:bb',
        baseHash: 'sha256:aa',
      }),
    ).toBe('pull');
  });

  it('本地与云端都改动过时应判定冲突', () => {
    expect(
      resolveCloudSyncDecision({
        localHash: 'sha256:cc',
        remoteHash: 'sha256:bb',
        baseHash: 'sha256:aa',
      }),
    ).toBe('conflict');
  });

  it('缺少基线且哈希不同时应判定冲突', () => {
    expect(
      resolveCloudSyncDecision({
        localHash: 'sha256:cc',
        remoteHash: 'sha256:bb',
        baseHash: null,
      }),
    ).toBe('conflict');
  });

  it('本地哈希缺失时一律判定冲突，避免静默覆盖', () => {
    expect(
      resolveCloudSyncDecision({ localHash: null, remoteHash: 'sha256:bb', baseHash: null }),
    ).toBe('conflict');
  });

  it('单文件上限常量应为 12 MB', () => {
    expect(CLOUD_SYNC_MAX_BYTES).toBe(12 * 1024 * 1024);
  });
});
