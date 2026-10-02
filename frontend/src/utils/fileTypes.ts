const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'tif', 'tiff']);

/**
 * 判断路径是否为编辑器支持的图片文件。
 * @author Albert_Luo
 * @date 2026-10-02
 */
export function isImageFilePath(filePath: string | null | undefined): boolean {
  const fileName = filePath?.trim().split(/[\\/]/).pop() ?? '';
  const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase() : '';
  return IMAGE_EXTENSIONS.has(extension);
}
