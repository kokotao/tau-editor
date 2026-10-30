/**
 * 测试用最小 ZIP 构造器：只生成 stored(压缩方式 0) 条目，
 * 供 .xmind 读取 spike 在无 deflate 环境下验证结构解析。
 */

const encoder = new TextEncoder();

function u16(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function u32(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

/** 构造一个仅含 stored 条目的 ZIP。 */
export function buildStoredZip(files: Array<{ name: string; content: string }>): Uint8Array {
  const bytes: number[] = [];
  const names: Uint8Array[] = [];
  const datas: Uint8Array[] = [];
  const offsets: number[] = [];

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content);
    names.push(nameBytes);
    datas.push(dataBytes);
    offsets.push(bytes.length);

    bytes.push(
      ...u32(0x04034b50),
      ...u16(20), // version needed
      ...u16(0), // flags
      ...u16(0), // compression = stored
      ...u16(0), // mod time
      ...u16(0), // mod date
      ...u32(0), // crc (reader 不校验)
      ...u32(dataBytes.length),
      ...u32(dataBytes.length),
      ...u16(nameBytes.length),
      ...u16(0), // extra length
      ...Array.from(nameBytes),
      ...Array.from(dataBytes),
    );
  }

  const centralStart = bytes.length;
  for (let i = 0; i < files.length; i += 1) {
    const nameBytes = names[i] as Uint8Array;
    const dataBytes = datas[i] as Uint8Array;
    bytes.push(
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(dataBytes.length),
      ...u32(dataBytes.length),
      ...u16(nameBytes.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offsets[i] as number),
      ...Array.from(nameBytes),
    );
  }
  const centralSize = bytes.length - centralStart;

  bytes.push(
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(files.length),
    ...u16(files.length),
    ...u32(centralSize),
    ...u32(centralStart),
    ...u16(0),
  );

  return new Uint8Array(bytes);
}