/**
 * 文档类型集中识别服务（思维导图阶段 0）
 *
 * 职责：
 * 1. 集中识别「专用地图扩展名」（.taumap / .xmind / .mm / .mmap 等），
 *    避免 App/Workspace/Tab 各写一份扩展名规则；
 * 2. 明确约定：`.map` 是高歧义扩展名，绝不注册成通用思维导图格式，
 *    是否受理由格式探测器按内容判定（见 fileFormatDetector）。
 *
 * 说明：
 * - 这里只负责「扩展名层面的第一层识别」；真正判定外部格式必须走内容探测，
 *   本服务不把 `.map` 列入已知扩展名。
 *
 * @author Albert_Luo
 * @date 2026-10-29
 */

/** 已知地图格式扩展名（不含歧义的 .map）。 */
const MINDMAP_EXTENSIONS = new Set([
  'taumap',
  'xmind',
  'mm',
  'mmap',
  'mindnode',
  'opml',
]);

const MINDMAP_EXTENSIONS_MAX = new Set(['mm']);

/**
 * 是否为已知映射扩展名。此判断只基于扩展名，不保证内容合法。
 * @param filePath 文件路径或文件名
 */
export function isMindMapPath(filePath: string | null | undefined): boolean {
  const baseName = filePath?.trim().split(/[\\/]/).pop() ?? '';
  const extension = baseName.includes('.')
    ? baseName.slice(baseName.lastIndexOf('.') + 1).toLowerCase()
    : '';
  return MINDMAP_EXTENSIONS.has(extension);
}

/**
 * 是否为 Tau 原生 .taumap 文档。
 */
export function isTaumapPath(filePath: string | null | undefined): boolean {
  const baseName = filePath?.trim().split(/[\\/]/).pop() ?? '';
  return baseName.toLowerCase().endsWith('.taumap');
}

/**
 * 是否为（可能）歧义的 .map 文件。此类文件必须经内容探测，不预设格式。
 */
export function isAmbiguousMapPath(filePath: string | null | undefined): boolean {
  const baseName = filePath?.trim().split(/[\\/]/).pop() ?? '';
  return baseName.toLowerCase().endsWith('.map');
}

/**
 * 是否为 OPML 大纲文件（开放桥接格式之一）。
 */
export function isOpmlPath(filePath: string | null | undefined): boolean {
  const baseName = filePath?.trim().split(/[\\/]/).pop() ?? '';
  return baseName.toLowerCase().endsWith('.opml');
}

/** 已知地图扩展名（导出/另存为提示用）。 */
export function getKnownMindMapExtensions(): string[] {
  return Array.from(MINDMAP_EXTENSIONS).sort();
}

// 保留导出，便于需要同时匹配 .mm 的调用方使用。
export { MINDMAP_EXTENSIONS, MINDMAP_EXTENSIONS_MAX };