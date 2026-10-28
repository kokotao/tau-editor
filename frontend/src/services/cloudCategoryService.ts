/**
 * @description 云端分类管理：分类树读取（管理接口，按当前用户隔离）、新建/重命名、文档移动分类。
 * 层级上限 3 级（一级/二级/三级），超出时前端直接禁用并给提示，避免无效请求。
 *
 * 注意：**不再回退博客公开分类**。博客 category 是全局共享的博客分类表，与用户私有云文档分类
 * 不是一回事；早期回退会把别人/博客的分类塞进云文档树与同步弹窗（跨用户串分类的根因之一）。
 *
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 19:10
 */
import { cloudCommands, isTauriApp, type CloudCategoryNode } from '@/lib/tauri';
import { normalizeCloudError, type CloudOutcome } from '@/services/cloudDocService';

/** 分类层级上限（一级/二级/三级）。 */
export const CLOUD_CATEGORY_MAX_DEPTH = 3;

const WEB_UNSUPPORTED_MESSAGE = '当前是 Web 构建，云文档功能仅在 Tauri 桌面端可用。';

export interface FlatCategory {
  id: string;
  name: string;
  parentId: string | null;
  /** 从 1 开始：一级分类 = 1 */
  depth: number;
}

/** 把分类树拍平（保留层级信息，供下拉/上下文菜单使用）。 */
export function flattenCategoryTree(
  nodes: CloudCategoryNode[],
  depth = 1,
  parentId: string | null = null,
): FlatCategory[] {
  const rows: FlatCategory[] = [];
  for (const node of nodes) {
    const id = String(node.id);
    rows.push({ id, name: node.name, parentId, depth });
    if (node.children && node.children.length > 0) {
      rows.push(...flattenCategoryTree(node.children, depth + 1, id));
    }
  }
  return rows;
}

/** 某个分类的层级（找不到按 1 级处理）。 */
export function findCategoryDepth(nodes: CloudCategoryNode[], id: string | null | undefined): number {
  if (!id) {
    return 0;
  }
  return flattenCategoryTree(nodes).find((row) => row.id === id)?.depth ?? 1;
}

/** 是否还能在该分类下新建子分类（最多 3 级）。 */
export function canAddChildCategory(nodes: CloudCategoryNode[], parentId: string | null | undefined): boolean {
  if (!parentId) {
    return true;
  }
  return findCategoryDepth(nodes, parentId) < CLOUD_CATEGORY_MAX_DEPTH;
}

/** 读取分类树：只走管理接口（服务端按登录用户隔离），不再回退全局博客分类。 */
export async function fetchManagedCategories(): Promise<CloudOutcome<CloudCategoryNode[]>> {
  if (!isTauriApp()) {
    return { ok: false, kind: 'unsupported', message: WEB_UNSUPPORTED_MESSAGE };
  }
  try {
    const nodes = await cloudCommands.categoriesList();
    if (Array.isArray(nodes)) {
      return { ok: true, data: nodes };
    }
    return { ok: false, kind: 'unknown', message: '分类接口返回格式异常' };
  } catch (error) {
    const normalized = normalizeCloudError(error);
    return { ok: false, kind: normalized.kind, message: normalized.message };
  }
}

/** 新建分类（POST）。 */
export async function createCategory(
  name: string,
  parentId?: string | null,
): Promise<CloudOutcome<CloudCategoryNode>> {
  if (!isTauriApp()) {
    return { ok: false, kind: 'unsupported', message: WEB_UNSUPPORTED_MESSAGE };
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, kind: 'unknown', message: '分类名称不能为空' };
  }
  try {
    // 雪花 id 全程按字符串透传（2114279859393396737 > 2^53，经 number 会丢精度）
    const node = await cloudCommands.categoryCreate(trimmed, parentId ?? null);
    return { ok: true, data: node };
  } catch (error) {
    const normalized = normalizeCloudError(error);
    return { ok: false, kind: normalized.kind, message: normalized.message };
  }
}

/** 重命名分类（PUT /categories/{id}）。 */
export async function renameCategory(
  id: string,
  name: string,
): Promise<CloudOutcome<CloudCategoryNode>> {
  if (!isTauriApp()) {
    return { ok: false, kind: 'unsupported', message: WEB_UNSUPPORTED_MESSAGE };
  }
  const trimmedId = (id ?? '').trim();
  const trimmedName = name.trim();
  if (!trimmedId) {
    return { ok: false, kind: 'unknown', message: '缺少分类 id' };
  }
  if (!trimmedName) {
    return { ok: false, kind: 'unknown', message: '分类名称不能为空' };
  }
  try {
    const node = await cloudCommands.categoryUpdate(trimmedId, trimmedName);
    return { ok: true, data: node };
  } catch (error) {
    const normalized = normalizeCloudError(error);
    return { ok: false, kind: normalized.kind, message: normalized.message };
  }
}

/** 删除分类（DELETE）；有子分类/仍有文档引用时服务端 409，原样透出原因。 */
export async function deleteCategory(id: string): Promise<CloudOutcome<void>> {
  if (!isTauriApp()) {
    return { ok: false, kind: 'unsupported', message: WEB_UNSUPPORTED_MESSAGE };
  }
  const trimmedId = (id ?? '').trim();
  if (!trimmedId) {
    return { ok: false, kind: 'unknown', message: '缺少分类 id' };
  }
  try {
    await cloudCommands.categoryDelete(trimmedId);
    return { ok: true, data: undefined };
  } catch (error) {
    const normalized = normalizeCloudError(error);
    return { ok: false, kind: normalized.kind, message: normalized.message };
  }
}

/** 把文档移动到指定分类；`categoryId` 为 null 表示取消分类。 */
export async function moveDocumentToCategory(
  fileId: number,
  categoryId: string | null,
): Promise<CloudOutcome<void>> {
  if (!isTauriApp()) {
    return { ok: false, kind: 'unsupported', message: WEB_UNSUPPORTED_MESSAGE };
  }
  try {
    await cloudCommands.moveDocCategory(fileId, categoryId);
    return { ok: true, data: undefined };
  } catch (error) {
    const normalized = normalizeCloudError(error);
    return { ok: false, kind: normalized.kind, message: normalized.message };
  }
}
