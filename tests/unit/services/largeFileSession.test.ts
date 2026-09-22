/**
 * largeFileSession 单元测试
 * 覆盖分片切分（UTF-8 边界）、revision 事务编排、进度回调与失败中止
 */

import { describe, expect, it, vi } from 'vitest';
import {
  commitLargeFileWithRevision,
  splitContentForTransaction,
  utf8ByteLength,
  type LargeFileTransactionCommands,
} from '@/services/largeFileSession';

function createCommands(overrides: Partial<LargeFileTransactionCommands> = {}) {
  const commands: LargeFileTransactionCommands = {
    begin: vi.fn().mockResolvedValue({ transactionId: 'txn-1', maxChunkBytes: 8 }),
    append: vi.fn().mockResolvedValue({ transactionId: 'txn-1', bytesWritten: 8 }),
    commit: vi.fn().mockResolvedValue({ revision: '9:9', size: 9, modifiedMs: 9 }),
    abort: vi.fn().mockResolvedValue({ aborted: true }),
    ...overrides,
  };
  return commands;
}

describe('largeFileSession 分片切分', () => {
  it('按 UTF-8 字节数统计长度', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('中文')).toBe(6);
    expect(utf8ByteLength('👍')).toBe(4);
    expect(utf8ByteLength('')).toBe(0);
  });

  it('不把代理对切成两半', () => {
    const chunks = splitContentForTransaction('👍👍👍', 5);

    expect(chunks.join('')).toBe('👍👍👍');
    expect(chunks.every((chunk) => !chunk.includes('\uFFFD'))).toBe(true);
    expect(chunks.every((chunk) => chunk === '👍')).toBe(true);
  });

  it('每个分片都不超过字节上限且可无损还原', () => {
    const content = '中文段落 with ascii and emoji 👍 混合内容'.repeat(20);
    const chunks = splitContentForTransaction(content, 64);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => utf8ByteLength(chunk) <= 64)).toBe(true);
    expect(chunks.join('')).toBe(content);
  });

  it('空内容返回空分片列表', () => {
    expect(splitContentForTransaction('', 1024)).toEqual([]);
  });
});

describe('largeFileSession revision 事务提交', () => {
  it('按序追加分片并在提交后返回新版本', async () => {
    const commands = createCommands({ begin: vi.fn().mockResolvedValue({ transactionId: 'txn-1', maxChunkBytes: 4 }) });
    const onProgress = vi.fn();

    const commit = await commitLargeFileWithRevision({
      workspaceId: 'ws-1',
      relativePath: 'notes.md',
      content: 'abcdefgh',
      expectedRevision: '1:8',
      commands,
      yieldToEventLoop: async () => {},
      onProgress,
    });

    expect(commands.begin).toHaveBeenCalledWith('ws-1', 'notes.md', '1:8');
    expect(commands.append).toHaveBeenCalledTimes(2);
    expect(commands.commit).toHaveBeenCalledWith('txn-1');
    expect(commands.abort).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenLastCalledWith(8, 8);
    expect(commit).toEqual({ revision: '9:9', size: 9, modifiedMs: 9 });
  });

  it('开始事务失败时不会尝试中止或提交', async () => {
    const commands = createCommands({
      begin: vi.fn().mockRejectedValue(Object.assign(new Error('冲突'), { code: 'FILE_CONFLICT' })),
    });

    await expect(
      commitLargeFileWithRevision({
        workspaceId: 'ws-1',
        relativePath: 'notes.md',
        content: 'abc',
        expectedRevision: '1:3',
        commands,
      }),
    ).rejects.toMatchObject({ code: 'FILE_CONFLICT' });

    expect(commands.append).not.toHaveBeenCalled();
    expect(commands.abort).not.toHaveBeenCalled();
  });

  it('分片写入失败时中止事务并丢弃临时文件', async () => {
    const commands = createCommands({
      append: vi.fn().mockRejectedValue(new Error('IO 失败')),
    });

    await expect(
      commitLargeFileWithRevision({
        workspaceId: 'ws-1',
        relativePath: 'notes.md',
        content: 'abcdefgh',
        expectedRevision: '1:8',
        commands,
        yieldToEventLoop: async () => {},
      }),
    ).rejects.toThrow('IO 失败');

    expect(commands.abort).toHaveBeenCalledWith('txn-1');
    expect(commands.commit).not.toHaveBeenCalled();
  });

  it('提交冲突时中止事务并向外抛出 FILE_CONFLICT', async () => {
    const commands = createCommands({
      commit: vi.fn().mockRejectedValue(Object.assign(new Error('文件已被外部修改'), { code: 'FILE_CONFLICT' })),
    });

    await expect(
      commitLargeFileWithRevision({
        workspaceId: 'ws-1',
        relativePath: 'notes.md',
        content: 'abcdefgh',
        expectedRevision: '1:8',
        commands,
        yieldToEventLoop: async () => {},
      }),
    ).rejects.toMatchObject({ code: 'FILE_CONFLICT' });

    expect(commands.abort).toHaveBeenCalledWith('txn-1');
  });

  it('空内容也会走完整事务，用于清空文件', async () => {
    const commands = createCommands();

    await commitLargeFileWithRevision({
      workspaceId: 'ws-1',
      relativePath: 'notes.md',
      content: '',
      expectedRevision: '1:3',
      commands,
    });

    expect(commands.append).not.toHaveBeenCalled();
    expect(commands.commit).toHaveBeenCalledWith('txn-1');
  });
});
