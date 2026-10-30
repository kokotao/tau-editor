/**
 * 思维导图数据契约（阶段 0）
 *
 * 职责：
 * 1. 定义 `tau-mindmap` 原生格式的 Canonical MindMap Model；
 * 2. 定义 schemaVersion 迁移、稳定节点 ID、root/child 顺序规则；
 * 3. 定义格式化错误分类与校验问题（issue）结构；
 * 4. 定义格式能力报告与有损字段报告（供导入预览/导出提示使用）。
 *
 * 说明：
 * - 自动布局坐标不持久化；viewports 仅记录 UI 视口状态，不作为正文来源。
 * - sourceFormat/sourceVersion/opaqueExtensions 记录外部来源与暂未映射字段，
 *   原生 .taumap 往返时不得被无意丢弃。
 * - 首期单工作表；关系、概要等扩展数据采用独立集合，避免混入父子树。
 *
 * @author Albert_Luo
 * @date 2026-10-29
 */

/** 原生格式标识。 */
export const MINDMAP_FORMAT = 'tau-mindmap' as const;

/** 当前支持的 schema 主版本。 */
export const MINDMAP_CURRENT_SCHEMA_VERSION = 1;

/** 布局模式：首期仅 'mindmap'，P1 增加 logic/org/tree。 */
export type MindMapLayoutMode = 'mindmap' | 'logic' | 'org' | 'tree';

/** 保存来源：原生新建 / 外部导入 / 导出外部格式。 */
export type MindMapSaveMode = 'native' | 'imported' | 'exported';

/** 外部来源格式 id（用于 sourceFormat，与格式注册表 id 对齐）。 */
export type MindMapSourceFormat =
  | 'taumap'
  | 'xmind-8'
  | 'xmind-zen'
  | 'freemind-mm'
  | 'mindmanager-mmap'
  | 'mindnode'
  | 'markdown-outline'
  | 'opml'
  | string;

export interface MindMapViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface MindMapTopicStyle {
  color?: string;
  fill?: string;
  shape?: string;
}

export interface MindMapTopic {
  id: string;
  parentId: string | null;
  /** 作为同级顺序的唯一来源；与父节点的 childIds 保持一致（校验保证）。 */
  childIds: string[];
  text: string;
  collapsed?: boolean;
  style?: MindMapTopicStyle;
  /** P1 及以后：备注、标签、标记、链接 */
  notes?: string;
  labels?: string[];
  markers?: string[];
  link?: string;
}

export interface MindMapRelation {
  id: string;
  sourceTopicId: string;
  targetTopicId: string;
  label?: string;
  style?: string;
}

export interface MindMapAssetRef {
  id: string;
  originalPath?: string;
  mimeType?: string;
  sizeBytes?: number;
}

/**
 * P1：多工作表 / 多中心主题。
 *
 * 约定（阶段 4E）：
 * - `document.sheets` 列出全部工作表的根节点；每个 rootTopicId 必须存在于 topics；
 * - `document.rootTopicId` 永远等于「当前工作表」的根（布局/编辑/导出沿用这条路径）；
 * - 旧文档没有 `sheets` 时视为单工作表，`rootTopicId` 即唯一工作表；
 * - `rootTopicId` 指向的工作表不在 `sheets` 中时，同样按唯一工作表处理（不报错）。
 */
export interface MindMapSheet {
  id: string;
  title: string;
  rootTopicId: string;
}

/**
 * Canonical MindMap Model（.taumap 正文）。
 * 所有外部格式经适配器转换为该模型；原生格式无损读写也使用同一结构。
 */
export interface MindMapDocument {
  format: typeof MINDMAP_FORMAT;
  schemaVersion: number;
  /** 文档 id（稳定，不随保存变化）。 */
  id: string;
  title: string;
  sourceFormat?: MindMapSourceFormat;
  sourceVersion?: string;
  saveMode?: MindMapSaveMode;
  rootTopicId: string;
  layoutMode: MindMapLayoutMode;
  themeId: string;
  viewport?: MindMapViewport;
  topics: Record<string, MindMapTopic>;
  relations?: MindMapRelation[];
  /** 外部来源暂未映射的扩展数据，原生往返必须保留。 */
  opaqueExtensions?: Record<string, unknown>;
  assets?: MindMapAssetRef[];
  sheets?: MindMapSheet[];
}

/** 校验问题严重度。 */
export type MindMapValidationSeverity = 'error' | 'warning';

/** 结构错误 / 校验问题分类。 */
export type MindMapIssueCode =
  | 'MISSING_ROOT'
  | 'ROOT_HAS_PARENT'
  | 'DANGLING_CHILD'
  | 'DANGLING_PARENT'
  | 'DUPLICATE_CHILD'
  | 'PARENT_MISMATCH'
  | 'CYCLE'
  | 'ORPHAN_SUBTREE'
  | 'RELATION_ENDPOINT'
  | 'INVALID_SCHEMA'
  | 'INVALID_ROOT_REF'
  | 'EMPTY_TOPICS'
  /** sheets[i].rootTopicId 不存在（阶段 4E）。 */
  | 'INVALID_SHEET_REF'
  /** sheets 中工作表 id 重复（阶段 4E）。 */
  | 'DUPLICATE_SHEET_ID';

export interface MindMapValidationIssue {
  code: MindMapIssueCode;
  severity: MindMapValidationSeverity;
  /** 大概率的定位路径，如 topics.abc.childIds.0。 */
  path?: string;
  message: string;
}

export interface MindMapValidationResult {
  ok: boolean;
  issues: MindMapValidationIssue[];
}

/** 解析/导入错误大类（适配器能力报告也复用该粒度）。 */
export type MindMapErrorCategory =
  | 'unsupported-format'
  | 'unsupported-schema'
  | 'corrupt-content'
  | 'invalid-structure'
  | 'inconsistent-reference'
  | 'security-policy'
  | 'io-error';

/** 格式读写能力等级。 */
export type MindMapFormatReadCapability = 'lossless' | 'compatible' | 'read-only' | 'none';
export type MindMapFormatWriteCapability = 'lossless' | 'compatible' | 'none';

/** 格式能力报告：声明可逆字段、可能损失字段、不支持能力与安全限制。 */
export interface MindMapFormatCapabilities {
  formatId: string;
  displayName: string;
  extensions: string[];
  read: MindMapFormatReadCapability;
  write: MindMapFormatWriteCapability;
  /** 已确认的版本范围（例如 '8'、'zen'、'12'）。 */
  knownVersions: string[];
  /** 可无损双向往返的字段。 */
  reversibleFields: string[];
  /** 导入或导出时会丢失/改写的字段。 */
  lossyFields: string[];
  /** 明确不支持的特性说明。 */
  unsupportedFeatures: string[];
  /** 导入安全限制说明（如 XML 禁用外部实体、ZIP 条目上限）。 */
  securityNotes: string[];
}

/** 大纲面板的一行（可见节点，按树序展开、折叠子树不出现）。 */
export interface MindmapOutlineRow {
  id: string;
  text: string;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  childCount: number;
}

export interface MindMapFormatDescriptor {
  id: string;
  displayName: string;
  extensions: string[];
  capabilities: MindMapFormatCapabilities;
  /** 是否为原生 Tau 格式。 */
  isNative: boolean;
}