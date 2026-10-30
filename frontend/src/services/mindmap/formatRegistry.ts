/**
 * 思维导图格式注册表（阶段 0）
 *
 * 职责：
 * 1. 注册所有已知地图格式的元信息：扩展名、魔数/内部条目、读写能力、
 *    可逆字段、损失项、安全限制；
 * 2. 为探测器与导入导出服务提供单一事实来源。
 *
 * 说明：
 * - `.map` 因高歧义不在此注册表直接建立读写器，由内容探测后按厂商格式适配；
 * - 「已注册」不等于「正式支持」，正式支持以格式能力报告矩阵为准。
 *
 * @author Albert_Luo
 * @date 2026-10-29
 */

import type {
  MindMapFormatCapabilities,
  MindMapFormatDescriptor,
} from '@/types/mindmap';

/** 与 types/mindmap.ts 的 MindMapSourceFormat 对齐的注册表 id。 */
export type RegisteredMindMapFormatId =
  | 'taumap'
  | 'xmind'
  | 'freemind'
  | 'mindmanager'
  | 'mindnode'
  | 'markdown'
  | 'opml';

export interface MindMapMagicPattern {
  /** 文件头魔数（十六进制/ASCII 前缀）或 ZIP/XML 内部条目特征说明。 */
  description: string;
}

export interface MindMapFormatEntry extends MindMapFormatDescriptor {
  /** 文件头探测特征（供探测器优先于扩展名使用）。 */
  magic: MindMapMagicPattern;
  /** 内部条目探测说明（.xmind ZIP 的 content 等）。 */
  container?: string;
}

const TAUMAP_CAPABILITIES: MindMapFormatCapabilities = {
  formatId: 'taumap',
  displayName: 'Tau 思维导图',
  extensions: ['taumap'],
  read: 'lossless',
  write: 'lossless',
  knownVersions: ['1'],
  reversibleFields: ['title', 'topics', 'layoutMode', 'themeId', 'relations', 'viewport'],
  lossyFields: [],
  unsupportedFeatures: [],
  securityNotes: [],
};

const XMIND_CAPABILITIES: MindMapFormatCapabilities = {
  formatId: 'xmind',
  displayName: 'XMind',
  extensions: ['xmind'],
  read: 'compatible',
  write: 'none',
  knownVersions: ['8', 'zen'],
  reversibleFields: ['topics', 'text'],
  lossyFields: ['style', 'relations', 'summary', 'markers', 'labels', 'notes', 'attachments'],
  unsupportedFeatures: ['加密工作簿', '部分样式/主题', '图标与标记'],
  securityNotes: ['ZIP 包需限制条目数与解压总量，拒绝路径穿越与符号链接'],
};

const FREEMIND_CAPABILITIES: MindMapFormatCapabilities = {
  formatId: 'freemind',
  displayName: 'FreeMind / Freeplane (.mm)',
  extensions: ['mm'],
  read: 'compatible',
  write: 'compatible',
  knownVersions: ['0.9'],
  reversibleFields: ['text', 'link', 'notes'],
  lossyFields: ['插件属性', '部分布局', '部分样式', '图标', '箭头'],
  unsupportedFeatures: ['Freeplane 高级节点属性与自定义样式', '加密文件'],
  securityNotes: ['XML 禁止 DTD/外部实体/网络访问'],
};

const MINDMANAGER_CAPABILITIES: MindMapFormatCapabilities = {
  formatId: 'mindmanager',
  displayName: 'MindManager (.mmap)',
  extensions: ['mmap'],
  read: 'read-only',
  write: 'none',
  knownVersions: [],
  reversibleFields: ['text'],
  lossyFields: ['专有对象', '附件', '加密内容', '高级样式', '任务/资源字段'],
  unsupportedFeatures: ['加密包', '任务管理/资源/预算', '部分附件'],
  securityNotes: ['专有包格式需小样本验证，禁止执行导入内容'],
};

const MINDNODE_CAPABILITIES: MindMapFormatCapabilities = {
  formatId: 'mindnode',
  displayName: 'MindNode',
  extensions: ['mindnode'],
  read: 'read-only',
  write: 'none',
  knownVersions: [],
  reversibleFields: ['text'],
  lossyFields: ['样式', '附件', '自定义布局'],
  unsupportedFeatures: ['文件结构不稳定，不承诺原生无损回写'],
  securityNotes: ['实验性读取，禁止静默覆盖源文件'],
};

const MARKDOWN_CAPABILITIES: MindMapFormatCapabilities = {
  formatId: 'markdown',
  displayName: 'Markdown 大纲',
  extensions: ['md', 'markdown'],
  read: 'compatible',
  write: 'compatible',
  knownVersions: [],
  reversibleFields: ['text', 'hierarchy', 'order'],
  lossyFields: ['样式', '链接内容', 'HTML', '代码块语义'],
  unsupportedFeatures: ['富文本、图片附件、关系线'],
  securityNotes: ['仅解析标题/列表结构，不执行 HTML 或链接内容'],
};

const OPML_CAPABILITIES: MindMapFormatCapabilities = {
  formatId: 'opml',
  displayName: 'OPML 大纲',
  extensions: ['opml'],
  read: 'compatible',
  write: 'compatible',
  knownVersions: ['2.0'],
  reversibleFields: ['text', 'hierarchy', 'order', 'link'],
  lossyFields: ['备注/属性', '样式', '扩展属性'],
  unsupportedFeatures: ['富文本、图片附件、关系线'],
  securityNotes: ['XML 禁止 DTD/外部实体/网络访问'],
};

/** 格式注册表：一个格式一个条目，id 稳定。 */
export const MINDMAP_FORMAT_REGISTRY: MindMapFormatEntry[] = [
  {
    id: 'taumap',
    displayName: 'Tau 思维导图',
    extensions: ['taumap'],
    isNative: true,
    capabilities: TAUMAP_CAPABILITIES,
    magic: { description: 'JSON 正文且含 "format":"tau-mindmap"' },
  },
  {
    id: 'xmind',
    displayName: 'XMind',
    extensions: ['xmind'],
    isNative: false,
    capabilities: XMIND_CAPABILITIES,
    magic: { description: 'ZIP 容器 (PK\\x03\\x04)，内部含 content.xml / content.json' },
    container: 'ZIP',
  },
  {
    id: 'freemind',
    displayName: 'FreeMind / Freeplane',
    extensions: ['mm'],
    isNative: false,
    capabilities: FREEMIND_CAPABILITIES,
    magic: { description: 'XML，根元素 <map version="...">' },
  },
  {
    id: 'mindmanager',
    displayName: 'MindManager',
    extensions: ['mmap'],
    isNative: false,
    capabilities: MINDMANAGER_CAPABILITIES,
    magic: { description: '专有包格式，无稳定公共魔数' },
  },
  {
    id: 'mindnode',
    displayName: 'MindNode',
    extensions: ['mindnode'],
    isNative: false,
    capabilities: MINDNODE_CAPABILITIES,
    magic: { description: '专有/包格式，无稳定公共魔数' },
  },
  {
    id: 'markdown',
    displayName: 'Markdown 大纲',
    extensions: ['md', 'markdown'],
    isNative: false,
    capabilities: MARKDOWN_CAPABILITIES,
    magic: { description: '文本；含 Markdown 标题/列表结构' },
  },
  {
    id: 'opml',
    displayName: 'OPML 大纲',
    extensions: ['opml'],
    isNative: false,
    capabilities: OPML_CAPABILITIES,
    magic: { description: 'XML，根元素 <opml> 且含 <outline>' },
  },
];

const REGISTRY_BY_ID = new Map<string, MindMapFormatEntry>(
  MINDMAP_FORMAT_REGISTRY.map((entry) => [entry.id, entry]),
);

/** 按 id 获取格式条目。 */
export function getMindMapFormatEntry(id: string): MindMapFormatEntry | undefined {
  return REGISTRY_BY_ID.get(id);
}

/** 列出某种读写能力（含）级别以上的格式。 */
export function listMindMapFormatsByReadLevel(
  minimum: MindMapFormatCapabilities['read'],
): MindMapFormatEntry[] {
  const rank: Record<MindMapFormatCapabilities['read'], number> = {
    lossless: 3,
    compatible: 2,
    'read-only': 1,
    none: 0,
  };
  return MINDMAP_FORMAT_REGISTRY.filter(
    (entry) => rank[entry.capabilities.read] >= rank[minimum],
  );
}

/** 列出所有已注册格式的 id。 */
export function listMindMapFormatIds(): string[] {
  return MINDMAP_FORMAT_REGISTRY.map((entry) => entry.id);
}