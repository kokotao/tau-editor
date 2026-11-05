/**
 * @description 分类路径纯逻辑：把「后端/Java/Spring」这类斜杠路径解析成层级片段，
 * 并在现有分类树里规划「哪些已存在可复用、哪些需要逐级新建」。
 * 约定：层级最多三级（与后端一致），空段与多余斜杠忽略，超层级显式报错而不静默截断。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-28 00:45
 */
import type { CloudCategoryNode } from '@/lib/tauri';

/** 分类最大层级（一级/二级/三级）。 */
export const CATEGORY_MAX_DEPTH = 3;

export type CategoryPathError = 'empty' | 'too-deep' | 'segment-too-long';

export interface CategoryPathParseResult {
  ok: boolean;
  /** 规范化后的层级片段（已 trim、去掉空段） */
  segments: string[];
  /** 失败原因：空输入、超过层级、单段过长 */
  reason?: CategoryPathError;
  /** 原始层级数（含空段之外的实际段数），用于错误文案 */
  depth?: number;
}

/** 单个分类名称长度上限（与 Rust 侧校验保持一致）。 */
const SEGMENT_MAX_CHARS = 64;

/**
 * 解析斜杠路径：
 * - `A/B/C` → ['A','B','C']
 * - `A//B/` → ['A','B']（空段忽略）
 * - `A/B/C/D` → 失败（too-deep），不截断
 * - `   ` → 失败（empty）
 */
export function parseCategoryPath(
  input: string | null | undefined,
  maxDepth = CATEGORY_MAX_DEPTH,
): CategoryPathParseResult {
  const raw = (input ?? '').replace(/／/g, '/').trim();
  if (!raw) {
    return { ok: false, segments: [], reason: 'empty', depth: 0 };
  }
  const segments = raw
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return { ok: false, segments: [], reason: 'empty', depth: 0 };
  }
  if (segments.length > maxDepth) {
    return { ok: false, segments, reason: 'too-deep', depth: segments.length };
  }
  if (segments.some((segment) => segment.length > SEGMENT_MAX_CHARS)) {
    return { ok: false, segments, reason: 'segment-too-long', depth: segments.length };
  }
  return { ok: true, segments, depth: segments.length };
}

/** 路径里是否包含层级分隔符（用于判断要不要走「多级创建」）。 */
export function isCategoryPath(input: string | null | undefined): boolean {
  return (input ?? '').replace(/／/g, '/').includes('/');
}

export interface CategoryPathCreateStep {
  name: string;
  parentId: string | null;
}

export interface CategoryPathPlan {
  /** 已完整存在的末级分类 id（全部已存在时非空） */
  existingId: string | null;
  /** 已存在部分的末级 id（新增链的父节点；一级新建时为 null） */
  parentId: string | null;
  /** 需要按顺序创建的分类（从浅到深） */
  steps: CategoryPathCreateStep[];
}

/** 名称比较：忽略首尾空白与大小写，避免「Java/java」重复建。 */
function sameName(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function findChild(nodes: CloudCategoryNode[], name: string, parentId: string | null): CloudCategoryNode | null {
  for (const node of nodes) {
    const matchesParent = parentId === null
      ? node.parentId === null || node.parentId === undefined || node.parentId === ''
      : String(node.parentId) === parentId;
    if (matchesParent && sameName(node.name, name)) {
      return node;
    }
    const nested = findChild(node.children ?? [], name, parentId);
    if (nested) {
      return nested;
    }
  }
  return null;
}

/** 返回路径中「已存在前缀」的分类 id 链（从根到最深的已存在层）。 */
export function resolveCategoryPathIds(tree: CloudCategoryNode[], segments: string[]): string[] {
  const ids: string[] = [];
  let currentId: string | null = null;
  for (const segment of segments) {
    const found = findChild(tree, segment, currentId);
    if (!found) {
      break;
    }
    currentId = String(found.id);
    ids.push(currentId);
  }
  return ids;
}

/**
 * 在已有分类树里规划路径：已存在的层级复用，缺失的层级按顺序创建。
 * 返回的 `steps` 第一项的 `parentId` 即 `parentId`（已有部分的末级）。
 */
export function planCategoryPath(
  tree: CloudCategoryNode[],
  segments: string[],
): CategoryPathPlan {
  let currentId: string | null = null;
  let index = 0;
  for (; index < segments.length; index += 1) {
    const found = findChild(tree, segments[index]!, currentId);
    if (!found) {
      break;
    }
    currentId = String(found.id);
  }
  const steps: CategoryPathCreateStep[] = [];
  let parentId = currentId;
  for (; index < segments.length; index += 1) {
    steps.push({ name: segments[index]!, parentId });
    // 后续步骤的父节点要在创建后才能知道，调用方按顺序回填
    parentId = null;
  }
  return {
    existingId: steps.length === 0 ? currentId : null,
    parentId: currentId,
    steps,
  };
}
