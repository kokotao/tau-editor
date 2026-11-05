/**
 * @description 云博客分类/标签数据源：为云文档属性面板提供分类树与标签候选，复用云文档统一错误归类。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 09:50
 */
import { cloudCommands, isTauriApp, type CloudCategoryNode } from '@/lib/tauri';
import { normalizeCloudError, type CloudOutcome } from '@/services/cloudDocService';

const WEB_UNSUPPORTED_MESSAGE = '当前是 Web 构建，云文档功能仅在 Tauri 桌面端可用。';

function unsupportedOutcome<T>(): CloudOutcome<T> {
  return { ok: false, kind: 'unsupported', message: WEB_UNSUPPORTED_MESSAGE };
}

function failureFromError<T>(error: unknown): CloudOutcome<T> {
  const normalized = normalizeCloudError(error);
  return { ok: false, kind: normalized.kind, message: normalized.message };
}

/**
 * 拉取博客分类树。
 * 服务端两种形态（分类表树 / 文章表分类名数组）已由 Rust 归一化成同一结构，
 * 这里不需要再区分；返回空数组表示云端还没有任何分类。
 */
export async function fetchCloudCategories(): Promise<CloudOutcome<CloudCategoryNode[]>> {
  if (!isTauriApp()) {
    return unsupportedOutcome<CloudCategoryNode[]>();
  }

  try {
    const categories = await cloudCommands.blogCategories();
    return { ok: true, data: categories };
  } catch (error) {
    return failureFromError<CloudCategoryNode[]>(error);
  }
}

/**
 * 拉取博客标签候选。
 * 服务端返回无序集合，Rust 已去重并排序，保证同一份数据在前端渲染顺序稳定。
 */
export async function fetchCloudTags(): Promise<CloudOutcome<string[]>> {
  if (!isTauriApp()) {
    return unsupportedOutcome<string[]>();
  }

  try {
    const tags = await cloudCommands.blogTags();
    return { ok: true, data: tags };
  } catch (error) {
    return failureFromError<string[]>(error);
  }
}
