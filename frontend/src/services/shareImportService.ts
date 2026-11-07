/**
 * @description 分享转存的纯逻辑：默认目标路径、文件名净化、可转存判定与结果文案。
 *
 * 约定（与主流协作文档的「添加到我的云端」一致）：
 * - 只转存文本类分享；二进制文档保持在线预览，不复制原件；
 * - 目标路径固定落在当前账号的 `tau/导入/` 下，避免与作者路径、现有文件冲突；
 * - 重名时追加 ` (2)`、` (3)`，绝不静默覆盖已有云端文档。
 *
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-11-06 14:40
 */
import type { CloudShareImportResult, CloudSharePublicInfo } from '@/lib/tauri';
import { isTextDocPath, extensionOfPath } from '@/services/cloudUploadPolicy';
import { toCloudDocPath } from '@/services/cloudSyncService';

/** 转存默认落位目录：与本地工作区名解耦，导入结果始终可预期。 */
export const SHARE_IMPORT_WORKSPACE = '导入';

/** 文件名长度上限（与云端路径契约留出余量）。 */
const MAX_IMPORT_NAME_LENGTH = 120;

const FALLBACK_IMPORT_NAME = '分享文档.md';

/** 分享是否可转存为云端文档（二进制/图片只允许在线预览）。 */
export function canImportSharedDocument(info: CloudSharePublicInfo | null): boolean {
  if (!info || info.passwordRequired || typeof info.content !== 'string') {
    return false;
  }
  const fileName = (info.fileName ?? '').trim();
  if (!fileName) {
    // 没有文件名的老分享按 Markdown 处理，正文仍然可以完整转存
    return true;
  }
  return isTextDocPath(fileName);
}

/** 不可转存的原因文案（可转存时返回空串）。 */
export function describeImportBlock(info: CloudSharePublicInfo | null): string {
  if (!info) {
    return '还没有读取到分享内容';
  }
  if (info.passwordRequired) {
    return '该分享需要访问密码';
  }
  if (typeof info.content !== 'string') {
    return '该分享仅支持在线预览，暂不支持转存原件';
  }
  if (!canImportSharedDocument(info)) {
    return `云端暂不支持转存该文件类型（${extensionOfPath(info.fileName) ? '.' + extensionOfPath(info.fileName) : '无扩展名'}）`;
  }
  return '';
}

/**
 * 把分享里的文件名净化为可落库的名字：
 * 去掉路径分隔符与 Windows 保留字符，保留原扩展名，缺失时补 `.md`。
 */
export function sanitizeImportFileName(raw: string | null | undefined): string {
  const base = String(raw ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.trim() ?? '';
  const cleaned = base
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/^\.+/, '')
    .trim();
  const name = cleaned || FALLBACK_IMPORT_NAME;
  const withExtension = extensionOfPath(name) ? name : `${name}.md`;
  if (withExtension.length <= MAX_IMPORT_NAME_LENGTH) {
    return withExtension;
  }
  const extension = extensionOfPath(withExtension);
  const suffix = extension ? `.${extension}` : '';
  return `${withExtension.slice(0, MAX_IMPORT_NAME_LENGTH - suffix.length)}${suffix}`;
}

/** 按服务端公开元数据推断文件名，兼容没有 fileExt 的旧分享。 */
export function resolveShareImportFileName(info: Pick<CloudSharePublicInfo, 'fileName' | 'title'>): string {
  const raw = (info.fileName || info.title || '').trim();
  return sanitizeImportFileName(raw || FALLBACK_IMPORT_NAME);
}

/** 在文件名扩展名前插入去重序号：`方案.md` → `方案 (2).md`。 */
export function withImportSequence(fileName: string, sequence: number): string {
  if (sequence <= 1) {
    return fileName;
  }
  const extension = extensionOfPath(fileName);
  const suffix = extension ? `.${extension}` : '';
  const stem = suffix ? fileName.slice(0, -suffix.length) : fileName;
  return `${stem} (${sequence})${suffix}`;
}

/** 默认目标云端路径 `tau/导入/<文件名>`。 */
export function buildImportCloudPath(fileName: string, sequence = 1): string {
  return toCloudDocPath(SHARE_IMPORT_WORKSPACE, withImportSequence(sanitizeImportFileName(fileName), sequence));
}

/** 默认标题：去掉扩展名，读起来更像文档名。 */
export function buildImportTitle(fileName: string): string {
  const extension = extensionOfPath(fileName);
  return extension ? fileName.slice(0, -(extension.length + 1)) : fileName;
}

/** 转存成功文案：附带附件复制情况，失败附件单独提示。 */
export function describeImportSuccess(result: CloudShareImportResult): string {
  const total = result.assetsTotal ?? 0;
  const failed = result.assetsFailed ?? 0;
  if (total <= 0) {
    return '已添加到我的云端';
  }
  if (failed > 0) {
    return `已添加到我的云端，${failed}/${total} 张图片复制失败`;
  }
  return `已添加到我的云端（含 ${total} 张图片）`;
}
