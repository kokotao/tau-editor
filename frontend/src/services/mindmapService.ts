/**
 * 思维导图领域服务（阶段 0）
 *
 * 职责：
 * 1. 创建、解析、序列化 Canonical MindMap Model（.taumap 正文，UTF-8 JSON）；
 * 2. 结构校验：root 存在且 parentId 为空、父子引用互相一致、无重复/悬空 ID、
 *    无循环、关系端点存在；
 * 3. schema 迁移：按 schemaVersion 显式逐版执行，未知主版本安全失败；
 * 4. 错误分类：为导入/导出/打开路径提供统一的错误定位。
 *
 * 边界：
 * - 本服务是纯函数层，不依赖 Tauri / DOM；自动布局坐标不持久化。
 * - 解析失败或未知 schema 绝不静默降级写回，由调用方决定保留原文件或另存。
 *
 * @author Albert_Luo
 * @date 2026-10-29
 */

import {
  MINDMAP_CURRENT_SCHEMA_VERSION,
  MINDMAP_FORMAT,
  type MindMapDocument,
  type MindMapErrorCategory,
  type MindMapIssueCode,
  type MindMapTopic,
  type MindMapValidationIssue,
  type MindMapValidationResult,
} from '@/types/mindmap';

/** 解析/校验失败时抛出的领域错误。 */
export class MindMapError extends Error {
  readonly category: MindMapErrorCategory;
  readonly code: string;

  constructor(category: MindMapErrorCategory, message: string, code = 'MINDMAP_ERROR') {
    super(message);
    this.name = 'MindMapError';
    this.category = category;
    this.code = code;
  }
}

export function isMindMapError(error: unknown): error is MindMapError {
  return error instanceof MindMapError;
}

/** 生成稳定唯一 id（不依赖 Math.random 之外的状态；足够区分同文档节点）。 */
export function generateTopicId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 创建一个空思维导图文档。
 * @param title 文档标题；默认「未命名思维导图」。
 */
export function createEmptyMindMapDocument(title = '未命名思维导图'): MindMapDocument {
  const rootId = generateTopicId();
  const root: MindMapTopic = {
    id: rootId,
    parentId: null,
    childIds: [],
    text: title,
  };

  return {
    format: MINDMAP_FORMAT,
    schemaVersion: MINDMAP_CURRENT_SCHEMA_VERSION,
    id: generateTopicId(),
    title,
    rootTopicId: rootId,
    layoutMode: 'mindmap',
    themeId: 'default',
    saveMode: 'native',
    topics: {
      [rootId]: root,
    },
  };
}

/**
 * 解析 .taumap 正文文本（UTF-8 JSON）。返回新的文档对象，不做原地修改。
 *
 * @throws MindMapError —— 分类如下：
 *  - corrupt-content / unsupported-format：非法 JSON 或不是 tau-mindmap
 *  - unsupported-schema：未知主版本（不支持静默降级）
 *  - invalid-structure / inconsistent-reference：结构校验不通过
 */
export function parseMindMapDocument(raw: string): MindMapDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new MindMapError('corrupt-content', '思维导图文件不是合法的 JSON', 'INVALID_JSON');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new MindMapError('invalid-structure', '思维导图文件结构非法', 'NOT_AN_OBJECT');
  }

  const candidate = parsed as Partial<MindMapDocument>;
  if (candidate.format !== MINDMAP_FORMAT) {
    throw new MindMapError(
      'unsupported-format',
      `不是 tau-mindmap 文档（format=${String(candidate.format) ?? 'unknown'}）`,
      'UNSUPPORTED_FORMAT',
    );
  }

  const schemaVersion = typeof candidate.schemaVersion === 'number'
    ? candidate.schemaVersion
    : Number.NaN;
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new MindMapError(
      'unsupported-schema',
      '缺少合法的 schemaVersion',
      'MISSING_SCHEMA_VERSION',
    );
  }
  if (schemaVersion > MINDMAP_CURRENT_SCHEMA_VERSION) {
    throw new MindMapError(
      'unsupported-schema',
      `文件 schema 版本 ${schemaVersion} 高于当前支持版本 ${MINDMAP_CURRENT_SCHEMA_VERSION}，拒绝写回`,
      'SCHEMA_TOO_NEW',
    );
  }

  // 结构化数据迁移（当前只有 v1；预留逐版迁移函数链）。
  const migrated = migrateDocument(candidate);
  const validation = validateMindMapDocument(migrated);
  if (!validation.ok) {
    const firstError = validation.issues.find((issue) => issue.severity === 'error')
      ?? validation.issues[0];
    throw new MindMapError(
      mapIssueCodeToCategory(firstError?.code),
      firstError?.message ?? '思维导图结构校验失败',
      firstError?.code ?? 'INVALID_STRUCTURE',
    );
  }

  return migrated;
}

function migrateDocument(candidate: Partial<MindMapDocument>): MindMapDocument {
  // 未来版本迁移链：MIGRATIONS[fromVersion] = (doc) => doc
  // 当前仅 v1，直接按最小必需字段归一化。未知主版本已在 parse 中拦截。
  if (candidate.schemaVersion !== MINDMAP_CURRENT_SCHEMA_VERSION) {
    throw new MindMapError(
      'unsupported-schema',
      `无法从 schema v${String(candidate.schemaVersion)} 迁移`,
      'UNSUPPORTED_MIGRATION',
    );
  }

  const normalized: MindMapDocument = {
    format: MINDMAP_FORMAT,
    schemaVersion: MINDMAP_CURRENT_SCHEMA_VERSION,
    id: candidate.id ?? generateTopicId(),
    title: candidate.title ?? '未命名思维导图',
    rootTopicId: candidate.rootTopicId ?? '',
    layoutMode: candidate.layoutMode === 'logic' || candidate.layoutMode === 'org'
      || candidate.layoutMode === 'tree'
      ? candidate.layoutMode
      : 'mindmap',
    themeId: candidate.themeId ?? 'default',
    saveMode: candidate.saveMode === 'native' || candidate.saveMode === 'imported'
      || candidate.saveMode === 'exported'
      ? candidate.saveMode
      : 'native',
    topics: candidate.topics ?? {},
  };

  if (typeof candidate.sourceFormat === 'string') normalized.sourceFormat = candidate.sourceFormat;
  if (typeof candidate.sourceVersion === 'string') normalized.sourceVersion = candidate.sourceVersion;
  if (isRecord(candidate.viewport)) {
    const { x, y, zoom } = candidate.viewport as { x?: unknown; y?: unknown; zoom?: unknown };
    if (typeof x === 'number' && typeof y === 'number' && typeof zoom === 'number') {
      normalized.viewport = { x, y, zoom };
    }
  }
  if (Array.isArray(candidate.relations)) {
    normalized.relations = candidate.relations as MindMapDocument['relations'];
  }
  if (isRecord(candidate.opaqueExtensions)) {
    normalized.opaqueExtensions = candidate.opaqueExtensions as Record<string, unknown>;
  }
  if (Array.isArray(candidate.assets)) {
    normalized.assets = candidate.assets as MindMapDocument['assets'];
  }
  if (Array.isArray(candidate.sheets)) {
    normalized.sheets = candidate.sheets as MindMapDocument['sheets'];
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 把校验 issue code 映射到导入错误大类。 */
export function mapIssueCodeToCategory(code: MindMapIssueCode | undefined): MindMapErrorCategory {
  switch (code) {
    case 'INVALID_SCHEMA':
    case 'INVALID_ROOT_REF':
      return 'unsupported-schema';
    case 'MISSING_ROOT':
    case 'EMPTY_TOPICS':
      return 'invalid-structure';
    case 'DANGLING_CHILD':
    case 'DANGLING_PARENT':
    case 'DUPLICATE_CHILD':
    case 'PARENT_MISMATCH':
    case 'CYCLE':
    case 'ORPHAN_SUBTREE':
    case 'RELATION_ENDPOINT':
    case 'ROOT_HAS_PARENT':
      return 'inconsistent-reference';
    default:
      return 'invalid-structure';
  }
}

/**
 * 结构校验。
 *
 * 规则（与规格 §5 一致）：
 * 1. root 存在且 parentId 为空；
 * 2. 父子引用互相一致：父节点 childIds 包含该子 id，子节点 parentId 指向父 id；
 * 3. 无重复 child id、无悬空 child/parent 引用；
 * 4. 无循环；关系端点存在。
 */
export function validateMindMapDocument(document: MindMapDocument): MindMapValidationResult {
  const issues: MindMapValidationIssue[] = [];

  const topics = document.topics;
  const topicIds = new Set(Object.keys(topics));

  // 1. root
  if (topicIds.size === 0) {
    issues.push({
      code: 'EMPTY_TOPICS',
      severity: 'error',
      message: '文档没有任何节点',
    });
    return { ok: false, issues };
  }
  const root = topics[document.rootTopicId];
  if (!root) {
    issues.push({
      code: 'INVALID_ROOT_REF',
      severity: 'error',
      path: 'rootTopicId',
      message: `rootTopicId=${document.rootTopicId} 不存在`,
    });
  }

  // 2. 父子的 childIds 引用
  for (const [topicId, topic] of Object.entries(topics)) {
    if (!topic || typeof topic !== 'object') {
      issues.push({
        code: 'DANGLING_CHILD',
        severity: 'error',
        path: `topics.${topicId}`,
        message: `节点 ${topicId} 数据非法`,
      });
      continue;
    }
    if (topic.parentId === null) {
      if (topicId !== document.rootTopicId) {
        issues.push({
          code: 'ROOT_HAS_PARENT',
          severity: 'error',
          path: `topics.${topicId}.parentId`,
          message: `节点 ${topicId} 的 parentId 为空但又不是 root`,
        });
      }
    } else if (!topicIds.has(topic.parentId)) {
      issues.push({
        code: 'DANGLING_PARENT',
        severity: 'error',
        path: `topics.${topicId}.parentId`,
        message: `节点 ${topicId} 的父节点 ${topic.parentId} 不存在`,
      });
    }

    if (!Array.isArray(topic.childIds)) {
      issues.push({
        code: 'DANGLING_CHILD',
        severity: 'error',
        path: `topics.${topicId}.childIds`,
        message: `节点 ${topicId} 的 childIds 不是数组`,
      });
      continue;
    }

    const seen = new Set<string>();
    for (let i = 0; i < topic.childIds.length; i += 1) {
      const childId = topic.childIds[i];
      if (childId === undefined) continue;
      if (!topicIds.has(childId)) {
        issues.push({
          code: 'DANGLING_CHILD',
          severity: 'error',
          path: `topics.${topicId}.childIds.${i}`,
          message: `节点 ${topicId} 引用了不存在的子节点 ${childId}`,
        });
        continue;
      }
      if (seen.has(childId)) {
        issues.push({
          code: 'DUPLICATE_CHILD',
          severity: 'error',
          path: `topics.${topicId}.childIds.${i}`,
          message: `节点 ${topicId} 的 childIds 中 ${childId} 重复`,
        });
        continue;
      }
      seen.add(childId);

      const child = topics[childId];
      if (child && child.parentId !== topicId) {
        issues.push({
          code: 'PARENT_MISMATCH',
          severity: 'error',
          path: `topics.${childId}.parentId`,
          message: `子节点 ${childId} 的 parentId=${String(child.parentId)} 与父节点 ${topicId} 不一致`,
        });
      }
    }
  }

  // 3. 循环检测：从每个节点沿 parent 链探测，限制深度确保终止。
  const stack = new Set<string>();
  for (const topicId of topicIds) {
    let cursor: string | null = topicId;
    let guard = 0;
    stack.clear();
    while (cursor !== null && !issues.some((issue) => issue.code === 'CYCLE')) {
      if (stack.has(cursor)) {
        issues.push({
          code: 'CYCLE',
          severity: 'error',
          path: `topics.${cursor}`,
          message: `检测到父链循环：${cursor}`,
        });
        break;
      }
      stack.add(cursor);
      const current: MindMapTopic | undefined = topics[cursor];
      const next: string | null = current?.parentId ?? null;
      if (next !== null && !topicIds.has(next)) break;
      cursor = next;
      guard += 1;
      if (guard > topicIds.size + 1) break;
    }
  }

  // 4. 关系端点
  for (const relation of document.relations ?? []) {
    if (!relation || !topicIds.has(relation.sourceTopicId) || !topicIds.has(relation.targetTopicId)) {
      issues.push({
        code: 'RELATION_ENDPOINT',
        severity: 'error',
        path: `relations.${relation?.id ?? '?'}`,
        message: `关系端点不存在：${String(relation?.sourceTopicId)} -> ${String(relation?.targetTopicId)}`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * 序列化为 .taumap 正文（UTF-8 JSON，格式化输出便于审阅）。
 */
export function serializeMindMapDocument(document: MindMapDocument): string {
  return JSON.stringify(document, null, 2);
}

/**
 * 深度克隆文档，避免调用方意外修改共享对象。
 */
export function cloneMindMapDocument(document: MindMapDocument): MindMapDocument {
  return JSON.parse(JSON.stringify(document)) as MindMapDocument;
}