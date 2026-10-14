/**
 * @description 文档预览文件类型判断，供编辑器布局与预览组件共享。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-14 22:05
 */

const extensionOf = (filePath?: string | null) => {
  const fileName = filePath?.trim().split(/[\\/]/).pop() ?? '';
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
};

export function isHtmlFilePath(filePath?: string | null): boolean {
  return extensionOf(filePath) === 'html' || extensionOf(filePath) === 'htm';
}

export function isPdfFilePath(filePath?: string | null): boolean {
  return extensionOf(filePath) === 'pdf';
}

export function isSpreadsheetFilePath(filePath?: string | null): boolean {
  return ['csv', 'tsv', 'xls', 'xlsx'].includes(extensionOf(filePath));
}

export function isDocumentPreviewFilePath(filePath?: string | null): boolean {
  return isHtmlFilePath(filePath) || isPdfFilePath(filePath) || isSpreadsheetFilePath(filePath);
}

export function documentPreviewExtension(filePath?: string | null): string {
  return extensionOf(filePath);
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 返回 HTML 文件所在目录的 file URL，用作 srcdoc 中相对资源的基准路径。
 * 仅处理路径，不授予 iframe 访问宿主页面的同源权限。
 */
export function documentDirectoryUrl(filePath?: string | null): string {
  const value = filePath?.trim();
  if (!value) return '';

  if (value.startsWith('file://')) {
    try {
      const url = new URL(value);
      const directory = url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1) || '/';
      url.pathname = directory;
      url.search = '';
      url.hash = '';
      return url.toString();
    } catch {
      return '';
    }
  }

  const normalized = value.replace(/\\/g, '/');
  const separator = normalized.lastIndexOf('/');
  const directory = separator >= 0 ? normalized.slice(0, separator + 1) : '/';
  return `file://${directory.startsWith('/') ? '' : '/'}${encodeURI(directory)}`;
}

/**
 * 为 srcdoc 注入工作区目录基准，并删除文档自带的 base，避免相对路径使用不明确的来源。
 * iframe 使用空 sandbox，因此即使 HTML 包含脚本也不会执行。
 */
export function buildHtmlPreviewDocument(content: string, filePath?: string | null): string {
  const baseUrl = documentDirectoryUrl(filePath);
  if (!baseUrl) return content;

  const baseTag = `<base href="${escapeHtmlAttribute(baseUrl)}">`;
  const withoutBase = content.replace(/<base\b[^>]*>/gi, '');
  if (/<head\b[^>]*>/i.test(withoutBase)) {
    return withoutBase.replace(/(<head\b[^>]*>)/i, `$1${baseTag}`);
  }
  if (/<html\b[^>]*>/i.test(withoutBase)) {
    return withoutBase.replace(/(<html\b[^>]*>)/i, `$1<head>${baseTag}</head>`);
  }
  return `${baseTag}${withoutBase}`;
}
