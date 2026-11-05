/**
 * 大纲结构 ↔ Canonical MindMap Model 转换（阶段 3）
 *
 * 职责：
 * 1. 为 Markdown / OPML / FreeMind 等「大纲型」格式提供统一的中间结构 OutlineNode；
 * 2. 由大纲构建合法的 MindMapDocument（生成稳定 id、维护 childIds/parentId 一致）；
 * 3. 由文档反向导出大纲，保证层级与同级顺序不变。
 *
 * 说明：本模块只做纯数据转换，不做解析与序列化，便于各适配器复用与单测。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */

import { cloneMindMapDocument, generateTopicId, validateMindMapDocument } from '@/services/mindmapService';
import {
  MINDMAP_FORMAT,
  MINDMAP_CURRENT_SCHEMA_VERSION,
  type MindMapDocument,
  type MindMapSourceFormat,
} from '@/types/mindmap';

/** 大纲节点（外部格式的通用中间表示）。 */
export interface OutlineNode {
  text: string;
  children: OutlineNode[];
  /** FreeMind/OPML 等格式的链接。 */
  link?: string;
  /** 节点备注（FreeMind richcontent / OPML 属性等）。 */
  note?: string;
}

export function createOutlineNode(text = '', children: OutlineNode[] = []): OutlineNode {
  return { text, children };
}

export interface OutlineDocumentOptions {
  /** 文档标题；缺省用「导入的导图」。 */
  title?: string;
  sourceFormat: MindMapSourceFormat;
  sourceVersion?: string;
  /**
   * 单个顶层节点且它有子节点时，把它直接作为中心主题（Markdown 单 H1 场景）。
   * 默认 false：标题作中心主题，所有顶层节点作为其子节点。
   */
  rootFromSingleNode?: boolean;
  /** 导入后记录为 imported。 */
  saveMode?: 'imported' | 'native';
}

/**
 * 由大纲构建 MindMapDocument。
 *
 * @throws Error 当构建结果结构校验失败时（调用方应视为导入失败）。
 */
export function createDocumentFromOutline(
  nodes: OutlineNode[],
  options: OutlineDocumentOptions,
): MindMapDocument {
  const useSingleRoot = Boolean(options.rootFromSingleNode)
    && nodes.length === 1
    && (nodes[0]?.children.length ?? 0) > 0;

  const rootText = useSingleRoot
    ? (nodes[0]?.text || options.title || '导入的导图')
    : (options.title || '导入的导图');
  const rootChildren = useSingleRoot ? (nodes[0]?.children ?? []) : nodes;

  const document: MindMapDocument = {
    format: MINDMAP_FORMAT,
    schemaVersion: MINDMAP_CURRENT_SCHEMA_VERSION,
    id: generateTopicId(),
    title: rootText,
    rootTopicId: '',
    layoutMode: 'mindmap',
    themeId: 'default',
    saveMode: options.saveMode ?? 'imported',
    sourceFormat: options.sourceFormat,
    topics: {},
  };
  if (options.sourceVersion) document.sourceVersion = options.sourceVersion;

  const rootId = generateTopicId();
  document.rootTopicId = rootId;
  document.topics[rootId] = {
    id: rootId,
    parentId: null,
    childIds: [],
    text: rootText,
  };

  const appendChildren = (parentId: string, children: OutlineNode[]) => {
    const parent = document.topics[parentId];
    if (!parent) return;
    for (const node of children) {
      const id = generateTopicId();
      const topic: MindMapDocument['topics'][string] = {
        id,
        parentId,
        childIds: [],
        text: node.text ?? '',
      };
      if (node.link) topic.link = node.link;
      if (node.note) topic.notes = node.note;
      document.topics[id] = topic;
      parent.childIds.push(id);
      appendChildren(id, node.children ?? []);
    }
  };
  appendChildren(rootId, rootChildren);

  const validation = validateMindMapDocument(document);
  if (!validation.ok) {
    const first = validation.issues[0];
    throw new Error(`导入结果结构非法：${first?.message ?? '未知错误'}`);
  }
  return document;
}

/** 由文档导出大纲（不包含中心主题本身）。 */
export function documentToOutline(document: MindMapDocument): OutlineNode[] {
  const build = (topicId: string): OutlineNode | null => {
    const topic = document.topics[topicId];
    if (!topic) return null;
    const node: OutlineNode = { text: topic.text ?? '', children: [] };
    if (topic.link) node.link = topic.link;
    if (topic.notes) node.note = topic.notes;
    node.children = (topic.childIds ?? [])
      .map((childId) => build(childId))
      .filter((child): child is OutlineNode => child !== null);
    return node;
  };

  const root = document.topics[document.rootTopicId];
  if (!root) return [];
  return (root.childIds ?? [])
    .map((childId) => build(childId))
    .filter((child): child is OutlineNode => child !== null);
}

/** 统计大纲节点数（含所有层级，不含中心主题）。 */
export function countOutlineNodes(nodes: OutlineNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countOutlineNodes(node.children), 0);
}

/** 计算大纲最大深度（顶层为 1）。 */
export function outlineDepth(nodes: OutlineNode[]): number {
  if (nodes.length === 0) return 0;
  return 1 + Math.max(...nodes.map((node) => outlineDepth(node.children)));
}

/** 深拷贝文档（导出前避免外部修改影响当前编辑态）。 */
export function cloneForExport(document: MindMapDocument): MindMapDocument {
  return cloneMindMapDocument(document);
}