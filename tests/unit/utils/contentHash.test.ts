/**
 * @description contentHash 单测：与 node:crypto 交叉验证（等价于校验与 Rust sha2 的一致性）、
 * 前缀归一化、同文件并发计算合并。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-27 10:40
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CONTENT_HASH_PREFIX,
  computeContentHash,
  createContentHasher,
  normalizeContentHash,
  sha256Hex,
} from '@/utils/contentHash';

const nodeSha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

describe('sha256Hex（纯 JS 实现）', () => {
  it('命中标准测试向量', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('与 node:crypto 逐字节一致（含中文、emoji、超出一个分组的长内容）', () => {
    const samples = [
      '',
      'a',
      '中文内容，带标点。',
      'emoji 🎉🚀 与混合 ascii',
      'x'.repeat(55), // padding 边界：刚好不多补一个分组
      'x'.repeat(56), // padding 边界：需要多补一个分组
      'y'.repeat(64),
      '长文档'.repeat(1000),
    ];
    for (const sample of samples) {
      expect(sha256Hex(sample)).toBe(nodeSha256(sample));
    }
  });
});

describe('computeContentHash', () => {
  it('输出 sha256:<小写hex>，与 Rust format!("sha256:{}", ...) 同格式', async () => {
    const hash = await computeContentHash('你好，Tau');
    expect(hash).toBe(`${CONTENT_HASH_PREFIX}${nodeSha256('你好，Tau')}`);
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('与纯 JS 实现结果一致（crypto.subtle 与兜底实现不打架）', async () => {
    for (const sample of ['', 'abc', '多行\n内容\n', '长'.repeat(500)]) {
      await expect(computeContentHash(sample)).resolves.toBe(`sha256:${sha256Hex(sample)}`);
    }
  });
});

describe('normalizeContentHash', () => {
  it('补前缀、压小写、剥重复前缀', () => {
    const hex = nodeSha256('内容');
    expect(normalizeContentHash(hex)).toBe(`sha256:${hex}`);
    expect(normalizeContentHash(`sha256:${hex}`)).toBe(`sha256:${hex}`);
    expect(normalizeContentHash(`  SHA256:${hex.toUpperCase()}  `)).toBe(`sha256:${hex}`);
  });

  it('空值一律归一成空串（调用方据此判断"哈希未知"）', () => {
    expect(normalizeContentHash(null)).toBe('');
    expect(normalizeContentHash(undefined)).toBe('');
    expect(normalizeContentHash('   ')).toBe('');
    expect(normalizeContentHash('sha256:')).toBe('');
  });
});

describe('createContentHasher（并发合并）', () => {
  it('同 fileId 同内容的并发调用共用同一个 promise，只算一次', async () => {
    const hasher = createContentHasher();
    const first = hasher.hashFor(7, '同一份内容');
    const second = hasher.hashFor(7, '同一份内容');

    expect(first).toBe(second);
    await expect(first).resolves.toBe(`sha256:${nodeSha256('同一份内容')}`);
  });

  it('内容不同则各自计算、按值配对（不会把后算的结果串给先前的调用）', async () => {
    const hasher = createContentHasher();
    const first = hasher.hashFor(7, '内容 A');
    const second = hasher.hashFor(7, '内容 B');

    expect(first).not.toBe(second);
    await expect(first).resolves.toBe(`sha256:${nodeSha256('内容 A')}`);
    await expect(second).resolves.toBe(`sha256:${nodeSha256('内容 B')}`);
  });

  it('不同文件互不影响；算完后释放登记（不会无限占内存）', async () => {
    const hasher = createContentHasher();
    const a = hasher.hashFor(1, '同一份内容');
    const b = hasher.hashFor(2, '同一份内容');
    expect(a).not.toBe(b);
    await Promise.all([a, b]);

    const again = hasher.hashFor(1, '同一份内容');
    expect(again).not.toBe(a);
    await expect(again).resolves.toBe(`sha256:${nodeSha256('同一份内容')}`);
  });
});
