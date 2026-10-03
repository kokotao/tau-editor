/**
 * @description 在本地路径、file:// URI 和 untitled:// URI 之间转换，保证 LSP 文档标识稳定。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 09:40
 */

export type PathPlatform = 'auto' | 'posix' | 'win32';

export interface PathUriOptions {
  platform?: PathPlatform;
}
function isWindowsPath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('\\\\') || path.startsWith('//');
}

function detectPlatform(path: string, platform: PathPlatform = 'auto'): Exclude<PathPlatform, 'auto'> {
  if (platform !== 'auto') return platform;
  return isWindowsPath(path) ? 'win32' : 'posix';
}

function encodePathSegment(segment: string): string {
  // encodeURIComponent 编码空格、#、? 等路径敏感字符，同时保留 Windows 驱动器冒号。
  return encodeURIComponent(segment).replace(/%3A/gi, ':');
}

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    // 对不完整的百分号编码保持可用，避免损坏编辑器中的原始路径。
    return path;
  }
}

function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}

/** 将本地绝对路径转换为 LSP 使用的 file:// URI。 */
export function pathToUri(filePath: string, options: PathUriOptions = {}): string {
  if (filePath.startsWith('file://')) return filePath;

  const platform = detectPlatform(filePath, options.platform);
  const normalized = normalizeSlashes(filePath);

  if (platform === 'win32' && normalized.startsWith('//')) {
    const segments = normalized.slice(2).split('/').filter(Boolean);
    const host = segments.shift() ?? '';
    return `file://${host}/${segments.map(encodePathSegment).join('/')}`;
  }

  if (platform === 'win32' && /^[a-zA-Z]:\//.test(normalized)) {
    const encoded = normalized
      .split('/')
      .map(encodePathSegment)
      .join('/');
    return `file:///${encoded}`;
  }

  const posixPath = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${posixPath.split('/').map(encodePathSegment).join('/')}`;
}

/** 将 file:// URI 转换为本地路径；其他协议返回 null。 */
export function uriToPath(uri: string, options: PathUriOptions = {}): string | null {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'file:') return null;

  const platform = options.platform === 'auto' || options.platform === undefined
    ? (/^\/[a-zA-Z]:\//.test(parsed.pathname) || parsed.hostname.length > 0 ? 'win32' : 'posix')
    : options.platform;
  const pathname = decodePath(parsed.pathname);

  if (platform === 'win32') {
    const windowsPath = pathname.replace(/^\/+([a-zA-Z]:)/, '$1');
    if (parsed.hostname) {
      return `//${parsed.hostname}${windowsPath}`.replace(/\/$/, '');
    }
    return windowsPath || '/';
  }

  return pathname || '/';
}

/** 为未保存文档生成可重复的 untitled URI。 */
export function untitledUri(documentId: string): string {
  return `untitled://${encodeURIComponent(documentId)}`;
}

export function isFileUri(uri: string): boolean {
  return uri.toLowerCase().startsWith('file://');
}

export function isUntitledUri(uri: string): boolean {
  return uri.toLowerCase().startsWith('untitled://');
}
