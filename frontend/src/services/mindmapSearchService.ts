/**
 * 思维导图搜索服务（阶段 4B）
 *
 * 职责：
 * 1. 按文本在 Canonical 文档中检索主题节点，返回节点 id、文本、祖先路径与命中区间；
 * 2. 提供「展开祖先」工具：把命中节点的父级链展开，便于在折叠分支中定位结果；
 * 3. 纯函数实现——不读写 store、不依赖 DOM，便于在面板、命令层与单测中复用。
 *
 * 设计约束：
 * - 大小写不敏感，但命中区间下标始终指向原始文本（不做大小写折叠后的偏移换算）；
 * - 检索覆盖全部节点（含折叠分支内的节点），是否展开由调用方决定；
 * - 结果按文档顺序（根 → 先序遍历）返回，超过 limit 时截断。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */

import type { MindMapDocument, MindMapTopic } from '@/types/mindmap';

/** 单次命中的文本区间（左闭右开，下标基于节点原始 text）。 */
export interface MindmapSearchMatchRange {
  start: number;
  end: number;
}

/** 一条搜索命中。 */
export interface MindmapSearchMatch {
  /** 命中节点 id。 */
  id: string;
  /** 命中节点的完整文本。 */
  text: string;
  /** 中心主题到该节点父级的文本数组（中心主题自身为空数组）。 */
  path: string[];
  /** 该节点文本内的全部命中区间（按出现顺序）。 */
  matchRanges: MindmapSearchMatchRange[];
}

export interface MindmapSearchOptions {
  /** 结果上限，默认 {@link DEFAULT_MINDMAP_SEARCH_LIMIT}。 */
  limit?: number;
}

/** 默认结果上限，避免超大文档一次返回过多行。 */
export const DEFAULT_MINDMAP_SEARCH_LIMIT = 200;

/** 正则元字符转义，保证查询串按字面量匹配。 */
function escapeRegExp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 在单段文本中找出查询串的全部命中区间（大小写不敏感）。
 *
 * 使用带 `i` 标志的正则而非小写化后比较：正则的命中片段取自原始文本，
 * 因此即使某些字符大小写折叠后长度变化，返回的下标仍然准确。
 */
export function findMindmapMatchRanges(text: string, query: string): MindmapSearchMatchRange[] {
  if (!text || !query) return [];
  const pattern = new RegExp(escapeRegExp(query), 'gi');
  const ranges: MindmapSearchMatchRange[] = [];
  let matched: RegExpExecArray | null = pattern.exec(text);
  while (matched !== null) {
    ranges.push({ start: matched.index, end: matched.index + matched[0].length });
    // 防御：零宽匹配（查询串为空时已提前返回）避免死循环。
    if (matched[0].length === 0) pattern.lastIndex += 1;
    matched = pattern.exec(text);
  }
  return ranges;
}

/** 按 childIds 顺序取子节点，忽略悬空引用。 */
function childTopicsOf(document: MindMapDocument, parent: MindMapTopic): MindMapTopic[] {
  const children: MindMapTopic[] = [];
  for (const childId of parent.childIds ?? []) {
    const child = document.topics[childId];
    if (child) children.push(child);
  }
  return children;
}

/**
 * 搜索思维导图文档。
 *
 * - query 为空或纯空白 → 返回空数组；
 * - 大小写不敏感，按子串匹配节点文本；
 * - path 为中心主题到该节点父级的文本数组；
 * - limit 默认 200，超出截断（`limit <= 0` 视为不返回结果）。
 *
 * @param document Canonical 文档（只读，不会被修改）
 * @param query 查询串
 * @param options 检索选项
 */
export function searchMindmap(
  document: MindMapDocument,
  query: string,
  options: MindmapSearchOptions = {},
): MindmapSearchMatch[] {
  const needle = String(query ?? '').trim();
  const requested = options.limit;
  const limit = typeof requested === 'number' && Number.isFinite(requested)
    ? Math.max(0, Math.floor(requested))
    : DEFAULT_MINDMAP_SEARCH_LIMIT;

  if (!needle || limit === 0 || !document || !document.topics) return [];
  const root = document.topics[document.rootTopicId];
  if (!root) return [];

  const results: MindmapSearchMatch[] = [];
  // 显式栈实现先序遍历，避免深文档递归爆栈；入栈时携带祖先文本路径。
  const stack: Array<{ topic: MindMapTopic; path: string[] }> = [{ topic: root, path: [] }];

  while (stack.length > 0) {
    const current = stack.pop() as { topic: MindMapTopic; path: string[] };
    const text = current.topic.text ?? '';
    const ranges = findMindmapMatchRanges(text, needle);
    if (ranges.length > 0) {
      results.push({ id: current.topic.id, text, path: [...current.path], matchRanges: ranges });
      if (results.length >= limit) break;
    }

    const pathForChildren = [...current.path, text];
    const children = childTopicsOf(document, current.topic);
    // 逆序入栈，保证出栈顺序与文档顺序一致。
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (!child) continue;
      stack.push({ topic: child, path: pathForChildren });
    }
  }

  return results;
}

/**
 * 返回给定节点集合的所有祖先 id（含中心主题）。
 *
 * 用途：搜索命中折叠分支内的节点时，先把这些祖先展开，再定位/高亮。
 * - 不包含传入节点自身；
 * - 未知 id 与断链（parentId 指向不存在的节点）被安全忽略；
 * - 对环形 parentId 做了防御，不会死循环。
 *
 * @param document Canonical 文档（只读，不会被修改）
 * @param ids 命中节点 id 列表
 */
export function expandAncestors(document: MindMapDocument, ids: string[]): Set<string> {
  const ancestors = new Set<string>();
  if (!document || !document.topics || !Array.isArray(ids)) return ancestors;

  for (const id of ids) {
    const topic = document.topics[id];
    if (!topic) continue;
    // seen 同时用于防御环引用：从自身出发不会把自己算作祖先。
    const seen = new Set<string>([id]);
    let parentId = topic.parentId;
    while (parentId) {
      const parent = document.topics[parentId];
      if (!parent || seen.has(parentId)) break;
      ancestors.add(parentId);
      seen.add(parentId);
      parentId = parent.parentId;
    }
  }

  return ancestors;
}
