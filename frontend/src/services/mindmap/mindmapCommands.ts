/**
 * 思维导图领域命令（阶段 1）
 *
 * 职责：
 * 1. 新增子节点 / 同级节点、改名、复制子树、删除子树、重排、拖放移动、折叠；
 * 2. 所有命令都是纯函数：成功返回新文档（不可变），失败返回分类错误且不修改入参；
 * 3. 移动命令校验祖先关系，拒绝把节点移到自身或其后代之下（防成环）；
 * 4. root 删除被拒绝，由「重置文档」显式流程替代。
 *
 * 约定：
 * - childIds 是同级顺序的唯一来源，parentId 必须与其父节点 childIds 保持一致；
 * - 自动布局坐标不在此层持久化。
 *
 * @author Albert_Luo
 * @date 2026-10-29
 */

import {
  cloneMindMapDocument,
  createEmptyMindMapDocument,
  generateTopicId,
} from '@/services/mindmapService';
import type { MindMapDocument, MindMapTopic } from '@/types/mindmap';

export type MindMapCommandErrorCode =
  | 'TOPIC_NOT_FOUND'
  | 'ROOT_NODE_DELETE'
  | 'ROOT_NODE_NO_SIBLING'
  | 'ROOT_NODE_NO_MOVE'
  | 'CYCLE_NOT_ALLOWED'
  | 'INVALID_TARGET';

export interface MindMapCommandError {
  code: MindMapCommandErrorCode;
  message: string;
}

export type MindMapCommandResult =
  | {
      ok: true;
      document: MindMapDocument;
      newTopicId?: string;
      selectionId?: string;
    }
  | { ok: false; error: MindMapCommandError };

export const DEFAULT_NEW_TOPIC_TEXT = '新主题';

function ok(
  document: MindMapDocument,
  extra: { newTopicId?: string; selectionId?: string } = {},
): MindMapCommandResult {
  return { ok: true, document, ...extra };
}

function fail(code: MindMapCommandErrorCode, message: string): MindMapCommandResult {
  return { ok: false, error: { code, message } };
}

function findTopic(document: MindMapDocument, topicId: string): MindMapTopic | undefined {
  return document.topics[topicId];
}

/** 收集以 rootId 为根的整棵子树（含自身）。 */
export function collectSubtreeTopicIds(
  document: MindMapDocument,
  rootId: string,
): Set<string> {
  const result = new Set<string>();
  const stack: string[] = [rootId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (result.has(id)) continue;
    result.add(id);
    const topic = document.topics[id];
    if (topic) stack.push(...topic.childIds);
  }
  return result;
}

/** 统计某节点的后代数量（不含自身），供删除确认展示影响面。 */
export function countDescendants(document: MindMapDocument, topicId: string): number {
  if (!document.topics[topicId]) return 0;
  return Math.max(0, collectSubtreeTopicIds(document, topicId).size - 1);
}

/** candidateId 是否为 ancestorId 的后代。 */
export function isDescendantOf(
  document: MindMapDocument,
  ancestorId: string,
  candidateId: string,
): boolean {
  let cursor = document.topics[candidateId]?.parentId ?? null;
  let guard = 0;
  const limit = Object.keys(document.topics).length + 1;
  while (cursor !== null && guard <= limit) {
    if (cursor === ancestorId) return true;
    cursor = document.topics[cursor]?.parentId ?? null;
    guard += 1;
  }
  return false;
}

/** 在父节点 childIds 中按索引插入。 */
function insertChildAt(
  document: MindMapDocument,
  parentId: string,
  childId: string,
  index: number,
): void {
  const parent = document.topics[parentId];
  if (!parent) return;
  const next = [...parent.childIds];
  const bounded = Math.max(0, Math.min(index, next.length));
  next.splice(bounded, 0, childId);
  parent.childIds = next;
}

/** 新增子节点（追加到父节点末尾并展开父节点）。 */
export function addChildTopic(
  document: MindMapDocument,
  parentId: string,
  text = DEFAULT_NEW_TOPIC_TEXT,
): MindMapCommandResult {
  const parent = findTopic(document, parentId);
  if (!parent) return fail('TOPIC_NOT_FOUND', `父节点 ${parentId} 不存在`);

  const next = cloneMindMapDocument(document);
  const id = generateTopicId();
  next.topics[id] = { id, parentId, childIds: [], text };
  insertChildAt(next, parentId, id, next.topics[parentId]?.childIds.length ?? 0);
  const nextParent = next.topics[parentId];
  if (nextParent) nextParent.collapsed = false;
  return ok(next, { newTopicId: id, selectionId: id });
}

/** 新增同级节点（插到当前节点之后）。中心主题没有同级节点。 */
export function addSiblingTopic(
  document: MindMapDocument,
  topicId: string,
  text = DEFAULT_NEW_TOPIC_TEXT,
): MindMapCommandResult {
  const topic = findTopic(document, topicId);
  if (!topic) return fail('TOPIC_NOT_FOUND', `节点 ${topicId} 不存在`);
  if (topic.parentId === null || topicId === document.rootTopicId) {
    return fail('ROOT_NODE_NO_SIBLING', '中心主题没有同级节点');
  }
  const parentId = topic.parentId;
  const parent = findTopic(document, parentId);
  if (!parent) return fail('TOPIC_NOT_FOUND', `父节点 ${parentId} 不存在`);

  const next = cloneMindMapDocument(document);
  const id = generateTopicId();
  next.topics[id] = { id, parentId, childIds: [], text };
  const siblings = next.topics[parentId]?.childIds ?? [];
  const index = siblings.indexOf(topicId);
  insertChildAt(next, parentId, id, index >= 0 ? index + 1 : siblings.length);
  const nextParent = next.topics[parentId];
  if (nextParent) nextParent.collapsed = false;
  return ok(next, { newTopicId: id, selectionId: id });
}

/** 改名；中心主题改名时同步文档 title。 */
export function renameTopic(
  document: MindMapDocument,
  topicId: string,
  text: string,
): MindMapCommandResult {
  const topic = findTopic(document, topicId);
  if (!topic) return fail('TOPIC_NOT_FOUND', `节点 ${topicId} 不存在`);

  const next = cloneMindMapDocument(document);
  const target = next.topics[topicId];
  if (!target) return fail('TOPIC_NOT_FOUND', `节点 ${topicId} 不存在`);
  target.text = text;
  if (topicId === next.rootTopicId) {
    const trimmed = text.trim();
    if (trimmed) next.title = trimmed;
  }
  return ok(next, { selectionId: topicId });
}

/** 删除节点及其整棵子树；中心主题不允许删除。 */
export function deleteTopic(
  document: MindMapDocument,
  topicId: string,
): MindMapCommandResult {
  const topic = findTopic(document, topicId);
  if (!topic) return fail('TOPIC_NOT_FOUND', `节点 ${topicId} 不存在`);
  if (topicId === document.rootTopicId || topic.parentId === null) {
    return fail('ROOT_NODE_DELETE', '中心主题不能直接删除，请使用「重置文档」');
  }

  const next = cloneMindMapDocument(document);
  const removed = collectSubtreeTopicIds(next, topicId);
  for (const id of removed) {
    delete next.topics[id];
  }

  const parentId = topic.parentId;
  const parent = parentId ? next.topics[parentId] : undefined;
  if (parent && parentId) {
    parent.childIds = parent.childIds.filter((id) => id !== topicId);
  }
  if (Array.isArray(next.relations)) {
    next.relations = next.relations.filter(
      (relation) => !removed.has(relation.sourceTopicId) && !removed.has(relation.targetTopicId),
    );
  }

  const selectionId = parentId && next.topics[parentId]
    ? parentId
    : next.rootTopicId;
  return ok(next, { selectionId });
}

/**
 * 移动节点到指定父节点下；targetIndex 省略时追加到末尾。
 * 拒绝：移动 root、移动到自身或自身后代之下（成环）。
 */
export function moveTopic(
  document: MindMapDocument,
  topicId: string,
  targetParentId: string,
  targetIndex?: number,
): MindMapCommandResult {
  const topic = findTopic(document, topicId);
  if (!topic) return fail('TOPIC_NOT_FOUND', `节点 ${topicId} 不存在`);
  if (!findTopic(document, targetParentId)) {
    return fail('TOPIC_NOT_FOUND', `目标父节点 ${targetParentId} 不存在`);
  }
  if (topicId === document.rootTopicId || topicId === targetParentId) {
    return fail('ROOT_NODE_NO_MOVE', '中心主题不能移动，且节点不能移动到自身之下');
  }
  if (isDescendantOf(document, topicId, targetParentId)) {
    return fail('CYCLE_NOT_ALLOWED', '不能把节点移动到自身的后代之下');
  }

  const next = cloneMindMapDocument(document);
  const oldParentId = topic.parentId;
  const oldParent = oldParentId ? next.topics[oldParentId] : undefined;
  if (oldParent && oldParentId) {
    oldParent.childIds = oldParent.childIds.filter((id) => id !== topicId);
  }

  const targetParent = next.topics[targetParentId];
  if (!targetParent) return fail('TOPIC_NOT_FOUND', `目标父节点 ${targetParentId} 不存在`);
  const filtered = targetParent.childIds.filter((id) => id !== topicId);
  targetParent.childIds = filtered;
  const index = typeof targetIndex === 'number' ? targetIndex : filtered.length;
  insertChildAt(next, targetParentId, topicId, index);
  targetParent.collapsed = false;

  const moved = next.topics[topicId];
  if (moved) moved.parentId = targetParentId;
  return ok(next, { selectionId: topicId });
}

/** 在同级中上移/下移（offset 取 -1 / 1）；到边界时返回原文档（无变更）。 */
export function moveTopicByOffset(
  document: MindMapDocument,
  topicId: string,
  offset: -1 | 1,
): MindMapCommandResult {
  const topic = findTopic(document, topicId);
  if (!topic) return fail('TOPIC_NOT_FOUND', `节点 ${topicId} 不存在`);
  if (topic.parentId === null || topicId === document.rootTopicId) {
    return fail('ROOT_NODE_NO_MOVE', '中心主题不能调整顺序');
  }
  const siblings = document.topics[topic.parentId]?.childIds ?? [];
  const index = siblings.indexOf(topicId);
  if (index < 0) return fail('TOPIC_NOT_FOUND', `节点 ${topicId} 不在父节点下`);
  const targetIndex = index + offset;
  if (targetIndex < 0 || targetIndex >= siblings.length) {
    // 边界不视为错误：返回无变更文档，由调用方比较序列化结果决定是否记录历史。
    return ok(cloneMindMapDocument(document), { selectionId: topicId });
  }
  return moveTopic(document, topicId, topic.parentId, targetIndex);
}

/** 复制节点及其整棵子树，作为当前节点的下一个同级节点插入。 */
export function duplicateTopic(
  document: MindMapDocument,
  topicId: string,
): MindMapCommandResult {
  const topic = findTopic(document, topicId);
  if (!topic) return fail('TOPIC_NOT_FOUND', `节点 ${topicId} 不存在`);
  if (topic.parentId === null || topicId === document.rootTopicId) {
    return fail('ROOT_NODE_NO_SIBLING', '中心主题不能复制为同级节点');
  }

  const next = cloneMindMapDocument(document);
  const subtreeIds = collectSubtreeTopicIds(document, topicId);
  const idMap = new Map<string, string>();
  for (const oldId of subtreeIds) {
    idMap.set(oldId, generateTopicId());
  }

  for (const oldId of subtreeIds) {
    const source = document.topics[oldId];
    const newId = idMap.get(oldId);
    if (!source || !newId) continue;
    const isRootOfCopy = oldId === topicId;
    const newParentId = isRootOfCopy
      ? topic.parentId
      : idMap.get(source.parentId ?? '') ?? null;
    next.topics[newId] = {
      ...source,
      id: newId,
      parentId: newParentId,
      childIds: source.childIds
        .map((childId) => idMap.get(childId))
        .filter((childId): childId is string => Boolean(childId)),
    };
  }

  const newRootId = idMap.get(topicId);
  if (!newRootId || !topic.parentId) {
    return fail('INVALID_TARGET', '复制失败');
  }
  const parent = next.topics[topic.parentId];
  if (!parent) return fail('TOPIC_NOT_FOUND', `父节点 ${topic.parentId} 不存在`);
  const index = parent.childIds.indexOf(topicId);
  insertChildAt(next, topic.parentId, newRootId, index >= 0 ? index + 1 : parent.childIds.length);
  return ok(next, { newTopicId: newRootId, selectionId: newRootId });
}

/** 折叠/展开节点。 */
export function setTopicCollapsed(
  document: MindMapDocument,
  topicId: string,
  collapsed: boolean,
): MindMapCommandResult {
  if (!findTopic(document, topicId)) {
    return fail('TOPIC_NOT_FOUND', `节点 ${topicId} 不存在`);
  }
  const next = cloneMindMapDocument(document);
  const target = next.topics[topicId];
  if (!target) return fail('TOPIC_NOT_FOUND', `节点 ${topicId} 不存在`);
  target.collapsed = collapsed;
  return ok(next, { selectionId: topicId });
}

/** 重置为空白文档（中心主题删除的显式替代流程）。 */
export function resetDocument(title = '未命名思维导图'): MindMapCommandResult {
  const document = createEmptyMindMapDocument(title);
  return ok(document, { selectionId: document.rootTopicId });
}