/**
 * @description 新建文件的类型目录（本地文件树右键 / 云端分类右键共用）。
 *
 * 职责：
 * 1. 统一声明「可以新建哪些类型的文件」：id / 中英文名 / 扩展名 / 默认文件名 / 初始正文；
 * 2. `seedContent(fileName)` 生成与类型匹配的合法空文件内容：
 *    - `.taumap`：空思维导图 JSON（直接打开即可编辑，不会报「不是合法 JSON」）；
 *    - `.mm`：FreeMind 空地图（根节点 + 标题），能被既有 freemindAdapter 打开；
 *    - `.opml`：OPML 2.0 空大纲，能被既有 opmlAdapter 打开；
 *    - `.md` / `.txt` / `.json`：最小空模板；
 * 3. 提供扩展名 → 类型的反查（云端 `initialCloudDocContent` 按落盘文件名回填内容时复用）；
 * 4. 提供云端可用类型过滤：只保留三端白名单（cloudUploadPolicy）认可的类型；
 * 5. 提供「自定义格式」：`CUSTOM_NEW_FILE_TYPE`（不在固定数组里，避免默认回退到它）+
 *    `normalizeCustomExtension`（用户输入后缀的校验与归一化），本地与云端共用。
 *
 * 设计约束：
 * - 纯数据 + 纯函数，不读写 store、不依赖 DOM，便于单测与两端复用；
 * - 不引入新依赖：`.mm` / `.opml` 直接复用既有适配器的 build 函数（无新增 XML 依赖）。
 *
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-30
 */
import { createEmptyMindMapDocument, serializeMindMapDocument } from '@/services/mindmapService';
import { buildFreemind } from '@/services/mindmap/adapters/freemindAdapter';
import { buildOpml } from '@/services/mindmap/adapters/opmlAdapter';
import { isTextDocPath } from '@/services/cloudUploadPolicy';

/** 新建文件类型 id（稳定标识，UI 与测试共用）。 */
export type NewFileTypeId =
  | 'markdown'
  | 'taumap'
  | 'freemind'
  | 'opml'
  | 'plaintext'
  | 'json'
  /** 自定义格式：扩展名由用户输入（不进入固定类型数组，见 CUSTOM_NEW_FILE_TYPE） */
  | 'custom';

/** 一个可新建的文件类型。 */
export interface NewFileTypeOption {
  id: NewFileTypeId;
  /** 中英文展示名（菜单文案）。 */
  label: { 'zh-CN': string; 'en-US': string };
  /** 扩展名（不含点、小写）。 */
  extension: string;
  /** 默认文件名（不含扩展名）。 */
  defaultName: string;
  /** 初始正文：参数是最终落盘的文件名（用于从文件名推导标题）。 */
  seedContent: (fileName: string) => string;
}

/**
 * 从文件名推导「标题」：去掉目录与最后一个扩展名。
 *
 * @example titleFromFileName('docs/spring.知识点.taumap') → 'spring.知识点'
 */
export function titleFromFileName(fileName: string): string {
  const base = String(fileName ?? '').replace(/\\/g, '/').split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  // 点开头（`.taumap`）视为「没有主干」，交给调用方用兜底标题
  const stem = dot > 0 ? base.slice(0, dot) : (dot === 0 ? '' : base);
  return stem.trim();
}

/** 空思维导图 JSON（.taumap）。 */
function taumapSeed(fileName: string): string {
  const title = titleFromFileName(fileName) || '未命名思维导图';
  return serializeMindMapDocument(createEmptyMindMapDocument(title));
}

/** 空 FreeMind 地图（.mm）：只有根节点，打开后可继续添加子主题。 */
function freemindSeed(fileName: string): string {
  const title = titleFromFileName(fileName) || '未命名导图';
  return buildFreemind(title, []);
}

/**
 * 空 OPML 2.0 大纲（.opml）。
 *
 * 注意：既有 opmlAdapter 要求 body 里至少有一个 `<outline>`，否则导入直接失败；
 * 因此这里写入「一个与文件同名的根 outline」，保证新建后能正常打开预览。
 */
function opmlSeed(fileName: string): string {
  const title = titleFromFileName(fileName) || '未命名大纲';
  return buildOpml(title, [{ text: title, children: [] }]);
}

/**
 * 新建类型目录（顺序即菜单顺序）。
 *
 * 默认第一项是 Markdown：与历史行为一致（未指定类型时创建 `.md`），
 * 因此旧的「新建文件」调用方无需改动。
 */
export const NEW_FILE_TYPE_OPTIONS: readonly NewFileTypeOption[] = [
  {
    id: 'markdown',
    label: { 'zh-CN': 'Markdown 文档', 'en-US': 'Markdown document' },
    extension: 'md',
    defaultName: '未命名文档',
    seedContent: () => '',
  },
  {
    id: 'taumap',
    label: { 'zh-CN': 'Tau 思维导图', 'en-US': 'Tau mind map' },
    extension: 'taumap',
    defaultName: '未命名思维导图',
    seedContent: taumapSeed,
  },
  {
    id: 'freemind',
    label: { 'zh-CN': 'FreeMind 思维导图', 'en-US': 'FreeMind mind map' },
    extension: 'mm',
    defaultName: '未命名导图',
    seedContent: freemindSeed,
  },
  {
    id: 'opml',
    label: { 'zh-CN': 'OPML 大纲', 'en-US': 'OPML outline' },
    extension: 'opml',
    defaultName: '未命名大纲',
    seedContent: opmlSeed,
  },
  {
    id: 'plaintext',
    label: { 'zh-CN': '纯文本', 'en-US': 'Plain text' },
    extension: 'txt',
    defaultName: '未命名文本',
    seedContent: () => '',
  },
  {
    id: 'json',
    label: { 'zh-CN': 'JSON 文件', 'en-US': 'JSON file' },
    extension: 'json',
    defaultName: '未命名',
    seedContent: () => '{}\n',
  },
];

/** 默认新建类型（Markdown）。 */
export const DEFAULT_NEW_FILE_TYPE_ID: NewFileTypeId = 'markdown';

/** 是否是合法的类型 id。 */
export function isNewFileTypeId(value: unknown): value is NewFileTypeId {
  return typeof value === 'string'
    && NEW_FILE_TYPE_OPTIONS.some((option) => option.id === value);
}

/**
 * 解析类型：未知 / 缺失一律回退到默认类型（Markdown）。
 * 这样旧调用方（只传文件名、不传类型）保持原有行为。
 */
export function resolveNewFileType(typeId?: string | null): NewFileTypeOption {
  const found = NEW_FILE_TYPE_OPTIONS.find((option) => option.id === typeId);
  return found ?? (NEW_FILE_TYPE_OPTIONS[0] as NewFileTypeOption);
}

/** 取类型的中英文展示名。 */
export function newFileTypeLabel(option: NewFileTypeOption, locale?: string | null): string {
  return String(locale ?? '').toLowerCase().startsWith('en')
    ? option.label['en-US']
    : option.label['zh-CN'];
}

/** 默认文件名（含扩展名），例如 `未命名文档.md`。 */
export function buildDefaultNewFileName(option: NewFileTypeOption): string {
  return `${option.defaultName}.${option.extension}`;
}

/** 扩展名 → 类型（小写、不含点）；未知扩展名返回 undefined。 */
export function findNewFileTypeByExtension(extension: string | null | undefined): NewFileTypeOption | undefined {
  const normalized = String(extension ?? '').toLowerCase();
  if (!normalized) return undefined;
  return NEW_FILE_TYPE_OPTIONS.find((option) => option.extension === normalized);
}

/**
 * 取文件名的小写扩展名（不含点）；无扩展名返回空串。
 *
 * 与 `cloudUploadPolicy.extensionOfPath` 口径一致：点开头的文件名（`.taumap`）
 * 也按扩展名处理，无点或以点结尾返回空串。
 */
function extensionOf(fileName: string): string {
  const base = String(fileName ?? '').replace(/\\/g, '/').split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot < 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

/**
 * 按落盘文件名生成初始正文（云端 `initialCloudDocContent` 与本地新建共用）。
 *
 * 未知扩展名返回空串（保持「空文本」语义），不会因为类型表缺项而报错。
 */
export function seedContentForFileName(fileName: string): string {
  const option = findNewFileTypeByExtension(extensionOf(fileName));
  return option ? option.seedContent(fileName) : '';
}

/**
 * 云端可用的新建类型：只保留三端白名单（cloudUploadPolicy）认可的类型。
 *
 * 白名单是唯一事实来源：若某天白名单收紧，云端二级菜单会自动少掉对应项，
 * 而不是先让用户选到、再在提交时被后端 400 拒绝。
 */
export const CLOUD_NEW_FILE_TYPE_OPTIONS: readonly NewFileTypeOption[] =
  NEW_FILE_TYPE_OPTIONS.filter((option) => isTextDocPath(`new-file.${option.extension}`));

/* ------------------------------ 自定义格式（custom） ------------------------------ */

/** 自定义格式的类型 id（菜单里的「自定义格式…」项用它）。 */
export const CUSTOM_NEW_FILE_TYPE_ID = 'custom' as const;

/** 自定义扩展名的最大长度（1–20）。 */
export const CUSTOM_EXTENSION_MAX_LENGTH = 20;

/**
 * 自定义格式的类型描述。
 *
 * 刻意**不放进** `NEW_FILE_TYPE_OPTIONS`：
 * - `resolveNewFileType('custom')` 必须继续回退到 Markdown（未知 id 语义），
 *   否则旧调用方拿到一个没有扩展名的类型会生成本名；
 * - 固定类型菜单遍历的仍是 6 项，自定义项由组件单独渲染（末尾 + 分隔线）。
 */
export const CUSTOM_NEW_FILE_TYPE: NewFileTypeOption = {
  id: CUSTOM_NEW_FILE_TYPE_ID,
  label: { 'zh-CN': '自定义格式', 'en-US': 'Custom format' },
  extension: '',
  defaultName: '未命名',
  // 自定义扩展名没有已知模板：按空文本创建（未知扩展名同样回退为空串）
  seedContent: () => '',
};

/** 是否是「自定义格式」类型 id。 */
export function isCustomNewFileTypeId(value: unknown): boolean {
  return value === CUSTOM_NEW_FILE_TYPE_ID;
}

/**
 * 归一化用户输入的自定义扩展名。
 *
 * 规则（与云端、本地共用同一套，避免两端口径漂移）：
 * 1. 去首尾空白与首尾的点（`.doc` / `doc.` → `doc`）；
 * 2. 只允许字母、数字、`-`、`_`、`.`（不含路径分隔符与控制字符）；
 * 3. 长度 1–20；
 * 4. 统一转小写（三端白名单与 seed 分派都按小写比较）。
 *
 * @returns 成功 `{ ok: true, extension }`；失败给出 `empty` / `invalid`。
 */
export function normalizeCustomExtension(
  raw: string | null | undefined,
): { ok: true; extension: string } | { ok: false; reason: 'empty' | 'invalid' } {
  const trimmed = String(raw ?? '').trim().replace(/^\.+|\.+$/g, '');
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (trimmed.length > CUSTOM_EXTENSION_MAX_LENGTH) return { ok: false, reason: 'invalid' };
  // 单段扩展名：不允许路径分隔符，也不允许空白与控制字符
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed)) return { ok: false, reason: 'invalid' };
  // 连续点会生成 `a..b` 这类可疑文件名，直接拒绝
  if (trimmed.includes('..')) return { ok: false, reason: 'invalid' };
  return { ok: true, extension: trimmed.toLowerCase() };
}

/**
 * 自定义格式的默认文件名（含扩展名），例如 `未命名.doc`。
 *
 * 本地新建与云端卡片的默认值共用，保证「自定义」与固定类型的行为一致。
 */
export function buildCustomNewFileName(extension: string, baseName?: string): string {
  const stem = String(baseName ?? '').trim() || CUSTOM_NEW_FILE_TYPE.defaultName;
  return `${stem}.${extension}`;
}
