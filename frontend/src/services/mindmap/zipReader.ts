/**
 * 最小 ZIP 读取器（阶段 3，用于 .xmind 读取 spike）
 *
 * 能力：
 * - 解析 EOCD 与中央目录，列出条目（名称/压缩方式/大小/偏移）；
 * - 读取条目内容：stored(0) 直接切片；deflate(8) 走 DecompressionStream('deflate-raw')；
 * - 安全上限：条目数、单条目解压后大小、总解压大小，拒绝可疑压缩包。
 *
 * 说明：只读、不写、不执行任何包内内容；不支持加密条目与 ZIP64。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */

export const ZIP_LIMITS = {
  maxEntries: 2048,
  maxEntryBytes: 64 * 1024 * 1024,
  maxTotalBytes: 128 * 1024 * 1024,
};

export interface ZipEntryInfo {
  name: string;
  compression: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function findEocd(view: DataView): number {
  const minOffset = Math.max(0, view.byteLength - 65557);
  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (readU32(view, offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

function decodeName(view: DataView, offset: number, length: number): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length);
  return new TextDecoder('utf-8').decode(bytes);
}

/** 列出 ZIP 条目（失败返回空数组，调用方按「不是 ZIP」处理）。 */
export function listZipEntries(bytes: Uint8Array): ZipEntryInfo[] {
  if (bytes.byteLength < 22) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view);
  if (eocd < 0) return [];

  const totalEntries = readU16(view, eocd + 10);
  const centralOffset = readU32(view, eocd + 16);
  if (totalEntries <= 0 || centralOffset <= 0 || centralOffset >= bytes.byteLength) return [];

  const entries: ZipEntryInfo[] = [];
  let cursor = centralOffset;
  for (let i = 0; i < totalEntries && i < ZIP_LIMITS.maxEntries; i += 1) {
    if (cursor + 46 > bytes.byteLength) break;
    if (readU32(view, cursor) !== CENTRAL_SIGNATURE) break;

    const compression = readU16(view, cursor + 10);
    const compressedSize = readU32(view, cursor + 20);
    const uncompressedSize = readU32(view, cursor + 24);
    const nameLength = readU16(view, cursor + 28);
    const extraLength = readU16(view, cursor + 30);
    const commentLength = readU16(view, cursor + 32);
    const localHeaderOffset = readU32(view, cursor + 42);

    const name = decodeName(view, cursor + 46, nameLength);
    entries.push({
      name,
      compression,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** 读取条目原始压缩数据（尚未解压）。 */
function readEntryCompressedData(bytes: Uint8Array, entry: ZipEntryInfo): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localHeaderOffset;
  if (offset + 30 > bytes.byteLength || readU32(view, offset) !== LOCAL_SIGNATURE) {
    throw new Error(`ZIP 条目 ${entry.name} 的本地头损坏`);
  }
  const nameLength = readU16(view, offset + 26);
  const extraLength = readU16(view, offset + 28);
  const dataOffset = offset + 30 + nameLength + extraLength;
  const end = dataOffset + entry.compressedSize;
  if (dataOffset < 0 || end > bytes.byteLength) {
    throw new Error(`ZIP 条目 ${entry.name} 数据越界`);
  }
  return bytes.subarray(dataOffset, end);
}

/**
 * 读取并解压条目内容（deflate 需要 DecompressionStream 支持）。
 * @throws Error 当压缩方式不支持、超出上限或数据损坏时。
 */
export async function readZipEntryData(
  bytes: Uint8Array,
  entry: ZipEntryInfo,
): Promise<Uint8Array> {
  if (entry.uncompressedSize > ZIP_LIMITS.maxEntryBytes) {
    throw new Error(`ZIP 条目 ${entry.name} 解压后过大`);
  }

  const raw = readEntryCompressedData(bytes, entry);
  if (entry.compression === 0) {
    return raw;
  }
  if (entry.compression !== 8) {
    throw new Error(`ZIP 条目 ${entry.name} 使用了不支持的压缩方式 ${entry.compression}`);
  }

  const globalWithStream = globalThis as typeof globalThis & {
    DecompressionStream?: new (format: string) => TransformStream<Uint8Array, Uint8Array>;
  };
  if (typeof globalWithStream.DecompressionStream === 'undefined') {
    throw new Error('当前环境不支持 deflate 解压，无法读取该 ZIP 条目');
  }

  // 复制为独立 ArrayBuffer，避免 SharedArrayBuffer 与 BlobPart 类型不兼容
  const bufferCopy = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const stream = new Blob([bufferCopy]).stream()
    .pipeThrough(new globalWithStream.DecompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

/** 按名称读取文本条目（不存在返回 null）。 */
export async function readZipTextEntry(
  bytes: Uint8Array,
  name: string,
): Promise<string | null> {
  const entry = listZipEntries(bytes).find((item) => item.name === name);
  if (!entry) return null;
  const data = await readZipEntryData(bytes, entry);
  return new TextDecoder('utf-8').decode(data);
}

/** 条目总数与总解压大小是否在安全范围内。 */
export function isZipWithinLimits(entries: ZipEntryInfo[]): boolean {
  if (entries.length > ZIP_LIMITS.maxEntries) return false;
  const total = entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
  if (total > ZIP_LIMITS.maxTotalBytes) return false;
  return entries.every((entry) => entry.uncompressedSize <= ZIP_LIMITS.maxEntryBytes);
}