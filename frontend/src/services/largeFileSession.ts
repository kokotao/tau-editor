import type { FileWriteTransactionCommit } from '@/lib/tauri';
import { fileTransactionCommands } from '@/lib/tauri';

/** 单个分片的字符上限保护；实际按 UTF-8 字节数切分。 */
export const LARGE_FILE_TRANSACTION_FALLBACK_CHUNK_BYTES = 512 * 1024;

export interface LargeFileTransactionCommands {
  begin(
    workspaceId: string,
    relativePath: string,
    expectedRevision: string,
  ): Promise<{ transactionId: string; maxChunkBytes: number }>;
  append(transactionId: string, content: string): Promise<unknown>;
  commit(transactionId: string): Promise<FileWriteTransactionCommit>;
  abort(transactionId: string): Promise<unknown>;
}

export interface CommitLargeFileOptions {
  workspaceId: string;
  relativePath: string;
  content: string;
  expectedRevision: string;
  chunkBytes?: number;
  commands?: LargeFileTransactionCommands;
  onProgress?: (writtenBytes: number, totalBytes: number) => void;
  yieldToEventLoop?: () => Promise<void>;
}

function utf8BytesOfCodePoint(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/** 统计 UTF-8 字节数，避免为分片再生成 Buffer。 */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length;) {
    const codePoint = value.codePointAt(index) ?? 0;
    bytes += utf8BytesOfCodePoint(codePoint);
    index += codePoint > 0xffff ? 2 : 1;
  }
  return bytes;
}

/**
 * 按 UTF-8 字节数切分内容：不会把代理对（emoji、扩展汉字）切成两半，
 * 也不会让单个分片超过后端单次写入上限。
 */
export function splitContentForTransaction(content: string, maxBytes: number): string[] {
  const limit = Math.max(1, Math.floor(maxBytes) || 0);
  if (content.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let chunkStart = 0;
  let chunkBytes = 0;

  for (let index = 0; index < content.length;) {
    const codePoint = content.codePointAt(index) ?? 0;
    const charLength = codePoint > 0xffff ? 2 : 1;
    const charBytes = utf8BytesOfCodePoint(codePoint);

    if (chunkBytes + charBytes > limit && index > chunkStart) {
      chunks.push(content.slice(chunkStart, index));
      chunkStart = index;
      chunkBytes = 0;
      continue;
    }

    chunkBytes += charBytes;
    index += charLength;
  }

  if (chunkStart < content.length) {
    chunks.push(content.slice(chunkStart));
  }

  return chunks;
}

/**
 * 通过后端分段写入事务保存大文件：写临时文件 → 提交前复核 revision → 原子替换。
 * 任一步失败都会中止事务并丢弃临时文件，磁盘上的原文件保持不变。
 */
export async function commitLargeFileWithRevision(
  options: CommitLargeFileOptions,
): Promise<FileWriteTransactionCommit> {
  const commands = options.commands ?? fileTransactionCommands;
  const yieldToEventLoop = options.yieldToEventLoop
    ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

  const handle = await commands.begin(
    options.workspaceId,
    options.relativePath,
    options.expectedRevision,
  );

  const maxBytes = options.chunkBytes ?? handle.maxChunkBytes ?? LARGE_FILE_TRANSACTION_FALLBACK_CHUNK_BYTES;
  const totalBytes = utf8ByteLength(options.content);
  const chunks = splitContentForTransaction(options.content, maxBytes);

  try {
    let writtenBytes = 0;
    for (const chunk of chunks) {
      await commands.append(handle.transactionId, chunk);
      writtenBytes += utf8ByteLength(chunk);
      options.onProgress?.(writtenBytes, totalBytes);
      await yieldToEventLoop();
    }

    return await commands.commit(handle.transactionId);
  } catch (error) {
    try {
      await commands.abort(handle.transactionId);
    } catch (abortError) {
      console.warn('[LargeFile] 事务中止失败，临时文件将由超时清理:', abortError);
    }
    throw error;
  }
}
