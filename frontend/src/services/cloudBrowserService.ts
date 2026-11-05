/**
 * @description 云端文档浏览器数据层：分页拉全量（带上限保护）、按路径分段构树、关键字过滤。
 * 树构建与过滤都是纯函数，便于单测；网络边界只有 cloudCommands.list。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 14:20
 */
import { cloudCommands, isTauriApp, type CloudCategoryNode, type CloudDocItem } from '@/lib/tauri';
import { normalizeCloudError, type CloudOutcome } from '@/services/cloudDocService';

/** 服务端单页上限（接口 clamp 到 100）。 */
export const CLOUD_BROWSER_PAGE_SIZE = 100;
/** 最多翻页数：50 页 × 100 条 = 5000 条，防止超大账号把界面拖死。 */
export const CLOUD_BROWSER_MAX_PAGES = 50;
/** 最多展示条数。 */
export const CLOUD_BROWSER_MAX_RECORDS = CLOUD_BROWSER_PAGE_SIZE * CLOUD_BROWSER_MAX_PAGES;

const WEB_UNSUPPORTED_MESSAGE = '当前是 Web 构建，云文档功能仅在 Tauri 桌面端可用。';

/** 树节点：目录节点 children 非空，文件节点带原始记录。 */
export interface CloudDocTreeNode {
  /** 稳定 key（目录与文件都用完整云端路径） */
  key: string;
  name: string;
  /** 云端完整路径（`tau/{workspace}/{rel}`） */
  path: string;
  kind: 'dir' | 'file';
  children: CloudDocTreeNode[];
  file: CloudDocItem | null;
}

export interface CloudDocFetchResult {
  records: CloudDocItem[];
  /** 服务端报告的匹配总数（可能是全量里的一部分） */
  total: number;
  /** 是否因为页数/条数上限而只拿到一部分 */
  truncated: boolean;
  /** 实际请求的页数 */
  pages: number;
}

/** 目录优先、同级按名称排序（中文按拼音，数字按自然序）。 */
function compareTreeNodes(left: CloudDocTreeNode, right: CloudDocTreeNode): number {
  if (left.kind !== right.kind) {
    return left.kind === 'dir' ? -1 : 1;
  }
  return left.name.localeCompare(right.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
}

/** 递归排序（每个目录只排一次，整体 O(n log n)）。 */
function sortTree(nodes: CloudDocTreeNode[]): void {
  nodes.sort(compareTreeNodes);
  for (const node of nodes) {
    if (node.children.length > 0) {
      sortTree(node.children);
    }
  }
}

function normalizeCloudPath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join('/');
}

export interface BuildCloudDocTreeOptions {
  /**
   * 展示时剥掉的路径前缀（例如 `tau/{workspace}`）：
   * 只影响分层结构，节点上的 `path` 仍是完整云端路径（打开文档要用它）。
   */
  stripPrefix?: string | null;
}

/**
 * 把云文档记录构造成树：按 `/` 分段，中间目录自动补齐。
 * 同一路径只保留第一条（分页边界重复时不产生重复节点）。
 */
export function buildCloudDocTree(
  records: CloudDocItem[],
  options: BuildCloudDocTreeOptions = {},
): CloudDocTreeNode[] {
  const roots: CloudDocTreeNode[] = [];
  const dirIndex = new Map<string, CloudDocTreeNode>();
  const seenFiles = new Set<string>();
  const stripPrefix = normalizeCloudPath(options.stripPrefix ?? '');

  const ensureDir = (path: string, name: string, parent: CloudDocTreeNode[]): CloudDocTreeNode => {
    const existing = dirIndex.get(path);
    if (existing) {
      return existing;
    }
    const node: CloudDocTreeNode = {
      key: path,
      name,
      path,
      kind: 'dir',
      children: [],
      file: null,
    };
    dirIndex.set(path, node);
    parent.push(node);
    return node;
  };

  for (const record of records) {
    const normalized = normalizeCloudPath(record.path ?? '');
    if (!normalized) {
      continue;
    }
    if (seenFiles.has(normalized)) {
      continue;
    }
    seenFiles.add(normalized);

    // 分段只用「去掉展示前缀」后的路径，节点 path 仍保留完整云端路径
    const displayPath = stripPrefix && normalized.startsWith(`${stripPrefix}/`)
      ? normalized.slice(stripPrefix.length + 1)
      : normalized;
    if (!displayPath) {
      continue;
    }

    const segments = displayPath.split('/');
    const lastIndex = segments.length - 1;
    const fileName = segments[lastIndex] ?? '';
    if (!fileName) {
      continue;
    }
    let currentPath = '';
    let bucket = roots;
    for (let index = 0; index < lastIndex; index += 1) {
      const segment = segments[index];
      if (!segment) {
        continue;
      }
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      bucket = ensureDir(currentPath, segment, bucket).children;
    }
    bucket.push({
      key: normalized,
      name: fileName,
      path: normalized,
      kind: 'file',
      children: [],
      file: record,
    });
  }

  sortTree(roots);
  return roots;
}

/** 分类分组显示用的文案（由调用方按语言传入）。 */
export interface CloudCategoryTreeLabels {
  /** 文档没有任何分类时的分组名 */
  uncategorized: string;
  /**
   * 旧版「自定义分类」聚合父节点名称。
   * @deprecated 0.6.26 起不再生成该父节点；分类名匹配不到时按名称直接作为顶层目录。
   */
  customGroup?: string;
}

interface CategoryIndexEntry {
  node: CloudDocTreeNode;
  /** 父分类 id 链（含自身），用于挂载子分类 */
  parentId: string | null;
}

/** 把分类树展开成 id → 节点 的索引（保留原始顺序）。 */
function indexCategoryTree(
  categories: CloudCategoryNode[],
  roots: CloudDocTreeNode[],
  index: Map<string, CategoryIndexEntry>,
  parentId: string | null = null,
): void {
  for (const category of categories) {
    const id = String(category.id);
    if (index.has(id)) {
      continue;
    }
    const node: CloudDocTreeNode = {
      key: `cat:${id}`,
      name: category.name,
      path: `cat:${id}`,
      kind: 'dir',
      children: [],
      file: null,
    };
    index.set(id, { node, parentId });
    roots.push(node);
    if (category.children && category.children.length > 0) {
      indexCategoryTree(category.children, node.children, index, id);
    }
  }
}

/**
 * 收集显示用的分类节点。
 *
 * 受管分类（`cat:<id>`，来自服务端分类表）**即使没有任何文件也保留**：
 * 用户新建的空分类 / 空子分类必须在树里立即可见，否则无法在它下面新建文件，
 * 看起来就像「新建分类没成功」。
 * 仅非受管目录（自定义文本分类聚合、未分类分组等）按是否有内容过滤。
 */
function pruneEmptyCategories(nodes: CloudDocTreeNode[]): CloudDocTreeNode[] {
  const kept: CloudDocTreeNode[] = [];
  for (const node of nodes) {
    const children = pruneEmptyCategories(node.children);
    if (node.kind === 'file') {
      kept.push(node);
      continue;
    }
    const isManagedCategory = node.key.startsWith('cat:');
    if (children.length > 0 || isManagedCategory) {
      kept.push({ ...node, children });
    }
  }
  return kept;
}

/**
 * 按「分类 → 文件」构树（原 path 仍保留在 node.path，打开/同步逻辑不受影响）。
 *
 * 挂载规则：
 * 1. 有 `categoryId` 且能在分类树里找到 → 挂到该节点；
 * 2. `categoryId` 缺失时用 `category` 名称在分类树里找**唯一同名**节点；
 * 3. 名称匹配不到（或重名）→ 归入「自定义分类」下按名称聚合的子分组；
 * 4. 完全没有分类 → 归入「未分类」。
 *
 * 顺序：同级目录优先并按名称排序；受管分类（即使为空）都显示，自定义聚合与未分类排在最后且仅有内容时出现。
 */
export function buildCloudDocTreeByCategory(
  records: CloudDocItem[],
  categories: CloudCategoryNode[],
  labels: CloudCategoryTreeLabels,
): CloudDocTreeNode[] {
  const rootNodes: CloudDocTreeNode[] = [];
  const index = new Map<string, CategoryIndexEntry>();
  indexCategoryTree(categories, rootNodes, index);

  // 名称 → 分类 id 列表；只有唯一同名才允许按名称匹配
  const nameMatches = new Map<string, string[]>();
  for (const [id, entry] of index.entries()) {
    const name = entry.node.name.trim();
    if (!name) {
      continue;
    }
    const list = nameMatches.get(name) ?? [];
    list.push(id);
    nameMatches.set(name, list);
  }

  const customBuckets = new Map<string, CloudDocTreeNode>();
  const uncategorizedFiles: CloudDocTreeNode[] = [];
  const seenFiles = new Set<string>();

  const pushFile = (bucket: CloudDocTreeNode[], record: CloudDocItem, path: string) => {
    const fileName = path.split('/').pop() ?? path;
    bucket.push({
      key: path,
      name: fileName,
      path,
      kind: 'file',
      children: [],
      file: record,
    });
  };

  for (const record of records) {
    const normalized = normalizeCloudPath(record.path ?? '');
    if (!normalized || seenFiles.has(normalized)) {
      continue;
    }
    seenFiles.add(normalized);

    const rawCategoryId = record.categoryId;
    const categoryId = rawCategoryId === null || rawCategoryId === undefined
      ? ''
      : String(rawCategoryId);
    const categoryName = (record.category ?? '').trim();
    const uniqueIdByName = categoryName ? nameMatches.get(categoryName) : undefined;

    let bucket: CloudDocTreeNode[] | null = null;
    if (categoryId && index.has(categoryId)) {
      bucket = index.get(categoryId)!.node.children;
    } else if (uniqueIdByName && uniqueIdByName.length === 1) {
      bucket = index.get(uniqueIdByName[0]!)?.node.children ?? null;
    }

    if (bucket) {
      pushFile(bucket, record, normalized);
      continue;
    }
    if (categoryName) {
      // 分类树里匹配不到：按名称聚合成「自定义分类」子分组
      let custom = customBuckets.get(categoryName);
      if (!custom) {
        custom = {
          key: `custom:${categoryName}`,
          name: categoryName,
          path: `custom:${categoryName}`,
          kind: 'dir',
          children: [],
          file: null,
        };
        customBuckets.set(categoryName, custom);
      }
      pushFile(custom.children, record, normalized);
      continue;
    }
    pushFile(uncategorizedFiles, record, normalized);
  }

  const tree = pruneEmptyCategories(rootNodes);
  sortTree(tree);

  // 需求（0.6.26）：用户自建分类就是顶层分类，不再包一层「自定义分类」父节点。
  // 分类树里匹配不到的「文档自由文本分类」按名称聚合后直接挂在根下（没有就什么都不显示）。
  const customNodes = [...customBuckets.values()]
    .filter((node) => node.children.length > 0)
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN', { sensitivity: 'base' }));
  customNodes.forEach((node) => {
    sortTree(node.children);
    tree.push(node);
  });

  if (uncategorizedFiles.length > 0) {
    sortTree(uncategorizedFiles);
    tree.push({
      key: 'group:uncategorized',
      name: labels.uncategorized,
      path: 'group:uncategorized',
      kind: 'dir',
      children: uncategorizedFiles,
      file: null,
    });
  }

  return tree;
}

/**
 * 关键字过滤：命中文件（文件名或完整路径，忽略大小写）才保留，同时保留其祖先目录。
 * 空关键字原样返回。
 */
export function filterCloudDocTree(
  nodes: CloudDocTreeNode[],
  keyword: string,
): CloudDocTreeNode[] {
  const needle = keyword.trim().toLowerCase();
  if (!needle) {
    return nodes;
  }

  const walk = (list: CloudDocTreeNode[]): CloudDocTreeNode[] => {
    const kept: CloudDocTreeNode[] = [];
    for (const node of list) {
      if (node.kind === 'file') {
        const haystack = `${node.name} ${node.path}`.toLowerCase();
        if (haystack.includes(needle)) {
          kept.push(node);
        }
        continue;
      }
      const children = walk(node.children);
      if (children.length > 0) {
        kept.push({ ...node, children });
      }
    }
    return kept;
  };

  return walk(nodes);
}

/** 统计文件节点数量（用于面板标题上的计数）。 */
export function countCloudDocFiles(nodes: CloudDocTreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += node.kind === 'file' ? 1 : countCloudDocFiles(node.children);
  }
  return count;
}

/** 文件大小展示。 */
export function formatCloudDocSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index] ?? 'B'}`;
}

/**
 * 分页拉全量：page 1..N（size=100，上限 50 页/5000 条）。
 * 翻到短页或空页即停；触到上限时 truncated=true，由 UI 提示「仅显示前 N 条」。
 */
export async function fetchAllCloudDocs(
  options: { keyword?: string | null } = {},
): Promise<CloudOutcome<CloudDocFetchResult>> {
  if (!isTauriApp()) {
    return { ok: false, kind: 'unsupported', message: WEB_UNSUPPORTED_MESSAGE };
  }

  const keyword = options.keyword?.trim() ? options.keyword.trim() : null;
  const records: CloudDocItem[] = [];
  const seen = new Set<number>();
  let total = 0;
  let pages = 0;
  let truncated = false;

  try {
    for (let page = 1; page <= CLOUD_BROWSER_MAX_PAGES; page += 1) {
      const data = await cloudCommands.list({
        keyword,
        page,
        size: CLOUD_BROWSER_PAGE_SIZE,
      });
      pages = page;

      if (typeof data?.total === 'number' && Number.isFinite(data.total)) {
        total = data.total;
      }
      const pageRecords = Array.isArray(data?.records) ? data.records : [];
      if (pageRecords.length === 0) {
        break;
      }

      for (const record of pageRecords) {
        if (records.length >= CLOUD_BROWSER_MAX_RECORDS) {
          truncated = true;
          break;
        }
        const id = record?.fileId;
        if (typeof id === 'number' && Number.isFinite(id)) {
          if (seen.has(id)) {
            continue;
          }
          seen.add(id);
        }
        records.push(record);
      }

      if (truncated || pageRecords.length < CLOUD_BROWSER_PAGE_SIZE) {
        break;
      }
    }
  } catch (error) {
    const normalized = normalizeCloudError(error);
    return { ok: false, kind: normalized.kind, message: normalized.message };
  }

  // 服务端总数比实际拿到的大：说明被上限截断（或翻页异常），统一按截断提示。
  if (total > records.length) {
    truncated = true;
  }

  return { ok: true, data: { records, total, truncated, pages } };
}
