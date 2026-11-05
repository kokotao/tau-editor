/**
 * @description 多级分类创建：`后端/Java/Spring` 一次建三级（已存在则复用，同级同名不重复建）。
 * 依赖 cloudCategoryService 的树读取与 createCategory；错误统一转成可读 outcome。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-28 00:50
 */
import type { CloudCategoryNode } from '@/lib/tauri';
import {
  CATEGORY_MAX_DEPTH,
  parseCategoryPath,
  planCategoryPath,
  resolveCategoryPathIds,
} from '@/lib/categoryPath';
import {
  createCategory,
  fetchManagedCategories,
  type FlatCategory,
} from '@/services/cloudCategoryService';
import { normalizeCloudError, type CloudErrorKind } from '@/services/cloudDocService';

export interface EnsureCategoryPathInput {
  /** 用户输入的路径，例如 `后端/Java/Spring` */
  path: string;
  /** 已有分类树（不传则内部拉取一次） */
  tree?: CloudCategoryNode[];
  maxDepth?: number;
}

export interface EnsureCategoryPathResult {
  /** 末级分类 id（雪花 id 字符串） */
  id: string;
  /** 末级分类名称 */
  name: string;
  /** 本次实际新建的分类名（按创建顺序） */
  created: string[];
  /** 全部层级已存在（未新建任何分类） */
  reused: boolean;
  /** 从根到末级的分类 id 链（用于展开父节点） */
  chain: string[];
}

export type EnsureCategoryPathOutcome =
  | { ok: true; data: EnsureCategoryPathResult }
  | { ok: false; kind: CloudErrorKind; message: string };

function parseFailureMessage(
  reason: 'empty' | 'too-deep' | 'segment-too-long' | undefined,
  depth: number | undefined,
  maxDepth: number,
): string {
  if (reason === 'too-deep') {
    return `分类最多 ${maxDepth} 级，当前输入为 ${depth ?? '?'} 级，请精简后再试`;
  }
  if (reason === 'segment-too-long') {
    return '单个分类名称过长（最多 64 字）';
  }
  return '请输入分类名称';
}

/** 拉取最新分类树并对冲突/网络错误给出可读文案。 */
async function loadTree(): Promise<CloudCategoryNode[] | null> {
  const outcome = await fetchManagedCategories();
  if (!outcome.ok) {
    return null;
  }
  return outcome.data;
}

/**
 * 保证路径上的每一级分类都存在，返回末级分类。
 *
 * 409（同级重名）视为「已存在」：重新拉树按名称取已有 id，避免并发下重复创建失败。
 */
export async function ensureCategoryPath(
  input: EnsureCategoryPathInput,
): Promise<EnsureCategoryPathOutcome> {
  const maxDepth = input.maxDepth ?? CATEGORY_MAX_DEPTH;
  const parsed = parseCategoryPath(input.path, maxDepth);
  if (!parsed.ok) {
    return {
      ok: false,
      kind: 'unknown',
      message: parseFailureMessage(parsed.reason, parsed.depth, maxDepth),
    };
  }

  let tree = input.tree ?? (await loadTree());
  if (!tree) {
    return { ok: false, kind: 'network', message: '读取分类树失败，请稍后重试' };
  }

  const plan = planCategoryPath(tree, parsed.segments);
  const existingChain = resolveCategoryPathIds(tree, parsed.segments);
  const chain: string[] = [...existingChain];
  if (plan.existingId !== null) {
    const leafName = parsed.segments[parsed.segments.length - 1]!;
    return {
      ok: true,
      data: { id: plan.existingId, name: leafName, created: [], reused: true, chain: existingChain },
    };
  }

  const created: string[] = [];
  let parentId = plan.parentId;
  for (const step of plan.steps) {
    const outcome = await createCategory(step.name, parentId);
    if (outcome.ok) {
      parentId = String(outcome.data.id);
      chain.push(parentId);
      created.push(step.name);
      continue;
    }

    if (outcome.kind === 'conflict') {
      // 并发下同名分类已被创建：刷新树后按名称复用
      const latest = await loadTree();
      if (!latest) {
        return { ok: false, kind: 'network', message: '读取分类树失败，请稍后重试' };
      }
      const retryPlan = planCategoryPath(latest, parsed.segments);
      if (retryPlan.existingId !== null) {
        const leafName = parsed.segments[parsed.segments.length - 1]!;
        return {
          ok: true,
          data: {
            id: retryPlan.existingId,
            name: leafName,
            created: created.length ? created : [],
            reused: created.length === 0,
            chain: [...existingChain, ...chain, retryPlan.existingId],
          },
        };
      }
      // 仍然找不到同名：把后台原始冲突文案透出
      tree = latest;
      return { ok: false, kind: outcome.kind, message: outcome.message };
    }

    return { ok: false, kind: outcome.kind, message: outcome.message };
  }

  if (parentId === null) {
    return { ok: false, kind: 'unknown', message: '创建分类失败，请稍后重试' };
  }
  return {
    ok: true,
    data: {
      id: parentId,
      name: parsed.segments[parsed.segments.length - 1]!,
      created,
      reused: created.length === 0,
      chain,
    },
  };
}

/**
 * 把分类树拍平成「带路径的名称」候选，便于提示用户已有层级（如 `后端 / Java`）。
 */
export function describeCategoryPath(rows: FlatCategory[]): Map<string, string> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const result = new Map<string, string>();
  for (const row of rows) {
    const parts: string[] = [row.name];
    let parentId = row.parentId;
    let guard = 0;
    while (parentId && guard < 8) {
      const parent = byId.get(parentId);
      if (!parent) {
        break;
      }
      parts.unshift(parent.name);
      parentId = parent.parentId;
      guard += 1;
    }
    result.set(row.id, parts.join('/'));
  }
  return result;
}

/** 兜底把未知异常转成 outcome（供调用方 catch 使用）。 */
export function toCategoryPathFailure(error: unknown): { ok: false; kind: CloudErrorKind; message: string } {
  const normalized = normalizeCloudError(error);
  return { ok: false, kind: normalized.kind, message: normalized.message };
}
