/**
 * @description 内容哈希：与 Rust 侧 `format!("sha256:{}", sha256_hex(bytes))` 对齐
 * （UTF-8 字节 → 小写 hex → `sha256:` 前缀），否则标签上的 `cloudContentHash` 与本地算出来的
 * 哈希格式不一致，空写抑制会永远命中不了。同时合并同一文件的在飞计算，避免 debounce 抖动时重复算。
 * 不依赖 Rust `cloud_read_sync_source`（那要过一次磁盘 + IPC，在线编辑场景太重）。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-27 10:05
 */

/** `sha256:` 前缀，与 Rust `normalize_remote_hash` 保持一致。 */
export const CONTENT_HASH_PREFIX = 'sha256:';

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (value: number, bits: number): number => (value >>> bits) | (value << (32 - bits));

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/** 纯 JS 的 SHA-256（hex，小写）。作用：无 `crypto.subtle` 的环境（旧 webview / 测试环境）兜底。 */
export function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const totalLen = (((bytes.length + 8) >> 6) + 1) << 6;
  const buffer = new Uint8Array(totalLen);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;

  const view = new DataView(buffer.buffer);
  const bitLen = bytes.length * 8;
  view.setUint32(totalLen - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(totalLen - 4, bitLen >>> 0);

  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4);
    }
    for (let i = 16; i < 64; i += 1) {
      const x = w[i - 15] as number;
      const y = w[i - 2] as number;
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) >>> 0;
    }

    let a = state[0] as number;
    let b = state[1] as number;
    let c = state[2] as number;
    let d = state[3] as number;
    let e = state[4] as number;
    let f = state[5] as number;
    let g = state[6] as number;
    let h = state[7] as number;

    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + (SHA256_K[i] as number) + (w[i] as number)) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    state[0] = ((state[0] as number) + a) >>> 0;
    state[1] = ((state[1] as number) + b) >>> 0;
    state[2] = ((state[2] as number) + c) >>> 0;
    state[3] = ((state[3] as number) + d) >>> 0;
    state[4] = ((state[4] as number) + e) >>> 0;
    state[5] = ((state[5] as number) + f) >>> 0;
    state[6] = ((state[6] as number) + g) >>> 0;
    state[7] = ((state[7] as number) + h) >>> 0;
  }

  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  for (let i = 0; i < 8; i += 1) {
    digestView.setUint32(i * 4, state[i] as number);
  }
  return toHex(digest);
}

/**
 * 归一化成 `sha256:<小写hex>`，与 Rust `normalize_remote_hash` 同语义。
 * 云端返回的 hash 可能带也可能不带前缀，比较前两边都要过一遍这个函数。
 */
export function normalizeContentHash(value: string | null | undefined): string {
  const trimmed = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!trimmed) {
    return '';
  }
  const hex = trimmed.startsWith(CONTENT_HASH_PREFIX)
    ? trimmed.slice(CONTENT_HASH_PREFIX.length)
    : trimmed;
  return hex ? `${CONTENT_HASH_PREFIX}${hex}` : '';
}

/**
 * 计算内容哈希（`sha256:<hex>`，async）。
 * 优先用 `crypto.subtle.digest`（Tauri webview 原生实现，走浏览器加密栈）；
 * 环境没有 subtle 时退回纯 JS 实现，两者输出一致。
 */
export async function computeContentHash(content: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const digest = await subtle.digest('SHA-256', new TextEncoder().encode(content));
      return `${CONTENT_HASH_PREFIX}${toHex(new Uint8Array(digest))}`;
    } catch {
      // 非安全上下文等情况直接降级，不把异常抛给调用方
    }
  }
  return `${CONTENT_HASH_PREFIX}${sha256Hex(content)}`;
}

export interface ContentHasher {
  /**
   * 取该文件当前内容的哈希。
   * 契约：同一 fileId **且内容相同**的并发调用共用同一个在飞 promise（debounce 抖动不会重复计算）；
   * 内容不同则各自计算、各自按值配对，不串味。计算结束后立刻释放登记，不留内存。
   */
  hashFor(fileId: number, content: string): Promise<string>;
}

export function createContentHasher(): ContentHasher {
  const inFlight = new Map<number, { content: string; promise: Promise<string> }>();

  return {
    hashFor(fileId: number, content: string): Promise<string> {
      const existing = inFlight.get(fileId);
      if (existing && existing.content === content) {
        return existing.promise;
      }

      const promise = computeContentHash(content).finally(() => {
        if (inFlight.get(fileId)?.promise === promise) {
          inFlight.delete(fileId);
        }
      });
      inFlight.set(fileId, { content, promise });
      return promise;
    },
  };
}
