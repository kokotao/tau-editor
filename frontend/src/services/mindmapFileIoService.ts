/**
 * 思维导图文件 I/O（阶段 3）
 *
 * 职责：
 * 1. 导入：系统文件选择 → 读取字节 → 文本/二进制分流（ZIP 头判定）；
 * 2. 导出：系统保存对话框 → 文本或 PNG 字节落盘；
 * 3. 统一错误消息，供 UI 提示。
 *
 * 说明：本模块依赖 Tauri 对话框与文件命令，单测通过 mock 覆盖。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */

import { open, save } from '@tauri-apps/plugin-dialog';
import { fileCommands } from '@/lib/tauri';

export const MINDMAP_IMPORT_EXTENSIONS = [
  'taumap',
  'xmind',
  'mm',
  'mmap',
  'opml',
  'md',
  'markdown',
  'map',
];

export interface MindmapImportFile {
  path: string;
  fileName: string;
  /** 文本内容（文本格式）。 */
  content?: string;
  /** 原始字节（包/二进制格式，如 .xmind）。 */
  bytes?: Uint8Array;
}

function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** ZIP 头（PK\x03\x04 / PK\x05\x06）判定，用于区分二进制容器。 */
export function looksLikeZipBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return bytes[0] === 0x50 && bytes[1] === 0x4b
    && ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06));
}

/** 弹出导入文件选择器；取消返回 null。 */
export async function pickMindmapImportFile(): Promise<string | null> {
  const selected = await open({
    title: '导入思维导图',
    multiple: false,
    directory: false,
    filters: [{ name: '思维导图', extensions: MINDMAP_IMPORT_EXTENSIONS }],
  });
  const path = Array.isArray(selected) ? selected[0] : selected;
  return typeof path === 'string' && path ? path : null;
}

/** 读取导入文件并按文本/二进制分流。 */
export async function readMindmapImportFile(path: string): Promise<MindmapImportFile> {
  const bytes = await fileCommands.readFileBytes(path);
  if (looksLikeZipBytes(bytes)) {
    return { path, fileName: baseName(path), bytes };
  }
  return {
    path,
    fileName: baseName(path),
    content: new TextDecoder('utf-8').decode(bytes),
  };
}

/** 弹出导出保存对话框；取消返回 null。 */
export async function pickMindmapExportPath(
  defaultName: string,
  extension: string,
): Promise<string | null> {
  const target = await save({
    title: '导出思维导图',
    defaultPath: defaultName,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  });
  return typeof target === 'string' && target ? target : null;
}

export type MindmapExportPayload =
  | { kind: 'text'; text: string }
  | { kind: 'binary'; bytes: Uint8Array };

/** 按类型落盘：文本走 write_file，二进制走 write_file_bytes。 */
export async function writeMindmapExportFile(
  path: string,
  payload: MindmapExportPayload,
): Promise<void> {
  if (payload.kind === 'text') {
    await fileCommands.writeFile(path, payload.text);
    return;
  }
  await fileCommands.writeFileBytes(path, payload.bytes);
}