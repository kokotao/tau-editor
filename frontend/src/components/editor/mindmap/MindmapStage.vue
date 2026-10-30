<script setup lang="ts">
/**
 * MindmapStage（思维导图 阶段 2：画布 + 工作表条；UX-3B 面板外移）
 *
 * 职责：
 * 1. 组装 SVG 画布、工作表切换条与统计条，统一承载编辑命令、键盘操作与确认流程；
 *    工具栏（mm-* 按钮）已外移到 App 顶部全局 Toolbar（UX-3C）：本组件通过
 *    defineExpose 暴露同名方法（addChild / doUndo / fitView / runLayoutCommand …），
 *    由 App 持有 ref 转发，Stage 仍是唯一真正改文档的地方；
 * 2. 画布与大纲/属性面板共享同一选中态（store.selectedTopicId），实现双向同步；
 *    大纲与属性面板已外移到编辑器外壳右侧（MindmapRightPanel，UX-3B），
 *    这里只保留画布，并通过 store.outlineVisible / store.propertiesVisible
 *    控制右侧两列的显隐；
 * 3. 视口（平移/缩放/适配）由画布发出、写回 store，不进入文档历史与 dirty；
 * 4. 删除含子树先确认、中心主题删除走「重置」、损坏文件安全失败；
 * 5. 每次成功编辑把序列化 JSON 通过 change 事件交给标签管线。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { buildMindmapOutlineRows, useMindmapStore } from '@/stores/mindmap';
import {
  addChildTopic,
  addSiblingTopic,
  countDescendants,
  deleteTopic,
  duplicateTopic,
  isDescendantOf,
  moveTopic,
  moveTopicByOffset,
  renameTopic,
  setTopicCollapsed,
} from '@/services/mindmap/mindmapCommands';
import type { MindMapCommandResult } from '@/services/mindmap/mindmapCommands';
import {
  DEFAULT_MINDMAP_THEME_ID,
  resolveMindmapTheme,
} from '@/services/mindmapThemeService';
import type {
  MindMapLayoutMode,
  MindMapSheet,
  MindmapOutlineRow,
} from '@/types/mindmap';
import type { TabDocumentKind } from '@/stores/tabs';
import MindmapCanvas from './MindmapCanvas.vue';
import MindmapContextMenu from './MindmapContextMenu.vue';
import MindmapImportPreviewDialog from './MindmapImportPreviewDialog.vue';
import MindmapExportDialog from './MindmapExportDialog.vue';
import {
  MINDMAP_EXPORT_FORMATS,
  buildExportFileName,
  exportMindmapPdfFile,
  exportMindmapText,
  previewMindmapImport,
  type MindmapExportFormatId,
  type MindmapImportPreview,
} from '@/services/mindmap/importExportService';
import { exportMindmapPng } from '@/services/mindmapSvgService';
import { printMindmap } from '@/services/mindmapPdfService';
import {
  pickMindmapExportPath,
  pickMindmapImportFile,
  readMindmapImportFile,
  writeMindmapExportFile,
} from '@/services/mindmapFileIoService';

const props = defineProps<{
  tabId: string;
  documentJson: string;
  fileName: string;
  documentKind?: TabDocumentKind;
}>();

const emit = defineEmits<{
  (event: 'change', json: string): void;
}>();

const store = useMindmapStore();
const document = computed(() => store.document);
const selectedTopicId = computed(() => store.selectedTopicId);
const viewport = computed(() => store.viewport);
const loadError = computed(() => store.loadError);
const canUndo = computed(() => store.canUndo);
const canRedo = computed(() => store.canRedo);

/** 当前结构布局模式（来自文档正文，切换后可撤销）。 */
const layoutMode = computed<MindMapLayoutMode>(() => document.value?.layoutMode ?? 'mindmap');

/** 布局切换按钮定义：顺序即工具栏顺序，label 用于按钮文案。 */
const layoutModeOptions: { id: MindMapLayoutMode; label: string; title: string }[] = [
  { id: 'mindmap', label: '导图', title: '中心双侧导图（mindmap）' },
  { id: 'logic', label: '逻辑图', title: '单侧向右的逻辑图（logic）' },
  { id: 'tree', label: '树形', title: '右侧树形，正交连线（tree）' },
  { id: 'org', label: '组织图', title: '自上而下的组织图（org）' },
];

const isExternal = computed(() => props.documentKind === 'mindmap-external');

const stageRef = ref<HTMLElement | null>(null);
const canvasRef = ref<InstanceType<typeof MindmapCanvas> | null>(null);

const notice = ref<string | null>(null);
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

const editingTopicId = ref<string | null>(null);
const editingText = ref('');
const confirmAction = ref<
  | { type: 'delete'; topicId: string; count: number }
  | { type: 'reset' }
  | null
>(null);

/* 导入/导出对话框状态 */
const importDialogVisible = ref(false);
const importBusy = ref(false);
const importFileName = ref('');
const importPreview = ref<MindmapImportPreview | null>(null);
const exportDialogVisible = ref(false);
const exportBusy = ref(false);

/* 阶段 4：右侧两列（大纲 / 属性）显隐 —— 状态在 store，不进历史 */

/* 阶段 4C：主题模板 */
/**
 * 当前主题 id（来自文档正文，切换可撤销）。
 * UX-3C：主题下拉已移到全局 Toolbar，候选列表由 App 通过 themeService 提供。
 */
const themeId = computed(() => document.value?.themeId ?? DEFAULT_MINDMAP_THEME_ID);

function showNotice(message: string) {
  notice.value = message;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.value = null;
    noticeTimer = null;
  }, 3600);
}

onBeforeUnmount(() => {
  if (noticeTimer) clearTimeout(noticeTimer);
});

/* ------------------------------- 加载与同步 ------------------------------- */

watch(
  () => [props.tabId, props.documentJson, props.documentKind] as const,
  ([tabId, json, kind]) => {
    if (!tabId) return;
    if (kind === 'mindmap-external') {
      store.clear();
      return;
    }
    store.loadFromContent(tabId, json);
  },
  { immediate: true },
);

watch(
  () => props.tabId,
  (tabId) => {
    if (!tabId) store.clear();
  },
);

/** 把编辑结果回写标签内容（由 App 交给 tabService，保持 dirty 准确）。 */
function emitIfChanged(before: string) {
  const after = store.serialized;
  if (after && after !== before) {
    emit('change', after);
  }
}

/* ------------------------------- 大纲行计算 ------------------------------- */

/**
 * 大纲可见行：键盘上下移动与统计文案共用。
 *
 * UX-3B 起搜索框在右侧面板内（其搜索态只影响面板显示），
 * 因此这里按「无搜索」计算，键盘导航覆盖当前工作表的全部可见行。
 */
const rows = computed<MindmapOutlineRow[]>(() => {
  const doc = document.value;
  if (!doc) return [];
  return buildMindmapOutlineRows(doc).rows;
});

const selectedIndex = computed(() =>
  rows.value.findIndex((row) => row.id === selectedTopicId.value),
);

const descendantsOfSelected = computed(() => {
  const doc = document.value;
  const selected = selectedTopicId.value;
  if (!doc || !selected) return 0;
  return countDescendants(doc, selected);
});

const rootTopicId = computed(() => document.value?.rootTopicId ?? null);

/* ------------------------------- 命令执行 ------------------------------- */

function runCommand(
  label: string,
  command: (doc: NonNullable<typeof document.value>) => MindMapCommandResult,
): boolean {
  const current = document.value;
  if (!current) return false;
  const before = store.serialized;
  const result = store.applyCommand(label, command);
  if (!result) return false;
  if (!result.ok) {
    showNotice(result.error.message);
    return false;
  }
  emitIfChanged(before);
  void focusStage();
  return true;
}

function focusStage() {
  return nextTick(() => stageRef.value?.focus());
}

/**
 * 切换结构布局模式。
 *
 * 布局模式是文档正文的一部分，store.setLayoutMode 已负责校验、记录历史并更新
 * lastSerialized；这里沿用 runCommand 的「前后序列化对比 → emit change」模式，
 * 保证标签 dirty 与回写行为与其它命令完全一致。
 */
function runLayoutCommand(mode: MindMapLayoutMode): boolean {
  if (layoutMode.value === mode) return false;
  const before = store.serialized;
  if (!store.setLayoutMode(mode)) return false;
  emitIfChanged(before);
  void focusStage();
  return true;
}

function selectTopic(topicId: string) {
  store.selectTopic(topicId);
}

/* ------------------------------- 工作表（阶段 4E） ------------------------------- */

/** 全部工作表（旧文档没有 sheets 时，store 会兜底为「唯一工作表」）。 */
const sheets = computed(() => store.sheets);

/** 当前工作表 id，用于切换条的激活态判定。 */
const currentSheetId = computed(() => store.currentSheetId);

/**
 * 切换工作表。
 *
 * 与布局/主题切换一致：store 负责校验、记历史、换选中的根并复位视口，
 * 组件只按「前后序列化对比」决定是否 emit change。
 */
function switchSheet(sheet: MindMapSheet): boolean {
  if (sheet.id === currentSheetId.value) return false;
  const before = store.serialized;
  if (!store.switchSheet(sheet.id)) return false;
  emitIfChanged(before);
  showNotice(`已切换到工作表「${sheet.title}」`);
  void focusStage();
  return true;
}

/** 新增工作表（自动切到新工作表，可撤销）。 */
function addSheet() {
  const before = store.serialized;
  if (!store.addSheet()) return;
  emitIfChanged(before);
  showNotice('已新增工作表，可撤销');
  void focusStage();
}

/**
 * 删除当前工作表（含其中心主题与整棵子树，可撤销）。
 *
 * 「至少保留一个」在按钮 disabled 与 store.removeSheet 两处双重拦截。
 * TODO(阶段 5)：双击工作表标签重命名（store.renameSheet 已就绪，缺 UI 入口）。
 */
function removeCurrentSheet() {
  const sheetId = currentSheetId.value;
  if (!sheetId) return;
  const before = store.serialized;
  if (!store.removeSheet(sheetId)) return;
  emitIfChanged(before);
  showNotice('已删除工作表（含其中心主题与子树），可撤销');
  void focusStage();
}

function selectByIndex(index: number) {
  const row = rows.value[index];
  if (row) store.selectTopic(row.id);
}

/* ------------------------------- 编辑操作 ------------------------------- */

function addChild() {
  const selected = selectedTopicId.value;
  if (!selected) return;
  editingTopicId.value = null;
  runCommand('添加子主题', (doc) => addChildTopic(doc, selected));
}

function addSibling() {
  const selected = selectedTopicId.value;
  if (!selected) return;
  editingTopicId.value = null;
  runCommand('添加同级主题', (doc) => addSiblingTopic(doc, selected));
}

/** Enter：中心主题走「添加子主题」，其余走「添加同级主题」。 */
function addSiblingOrChild() {
  if (selectedTopicId.value && selectedTopicId.value === rootTopicId.value) {
    addChild();
  } else {
    addSibling();
  }
}

function duplicateSelected() {
  const selected = selectedTopicId.value;
  if (!selected) return;
  editingTopicId.value = null;
  runCommand('复制主题', (doc) => duplicateTopic(doc, selected));
}

function moveSelected(offset: -1 | 1) {
  const selected = selectedTopicId.value;
  if (!selected) return;
  editingTopicId.value = null;
  runCommand(offset === -1 ? '上移主题' : '下移主题', (doc) => moveTopicByOffset(doc, selected, offset));
}

function toggleCollapse(topicId: string) {
  const topic = document.value?.topics[topicId];
  if (!topic) return;
  runCommand(topic.collapsed ? '展开主题' : '折叠主题', (current) =>
    setTopicCollapsed(current, topicId, !topic.collapsed),
  );
}

/* ------------------------------- 改名 ------------------------------- */

function startRename(topicId: string) {
  const topic = document.value?.topics[topicId];
  if (!topic) return;
  editingTopicId.value = topicId;
  editingText.value = topic.text;
}

function commitRename(text: string) {
  const topicId = editingTopicId.value;
  if (!topicId) return;
  editingTopicId.value = null;
  const topic = document.value?.topics[topicId];
  if (topic && topic.text === text) {
    void focusStage();
    return;
  }
  runCommand('重命名主题', (doc) => renameTopic(doc, topicId, text));
}

function cancelRename() {
  editingTopicId.value = null;
  void focusStage();
}

/* ------------------------------- 删除 ------------------------------- */

function requestDelete() {
  const selected = selectedTopicId.value;
  const doc = document.value;
  if (!selected || !doc) return;
  if (selected === doc.rootTopicId) {
    showNotice('中心主题不能直接删除，请使用工具栏「重置」');
    return;
  }
  const count = countDescendants(doc, selected);
  if (count > 0) {
    confirmAction.value = { type: 'delete', topicId: selected, count };
    return;
  }
  performDelete(selected);
}

function performDelete(topicId: string) {
  confirmAction.value = null;
  runCommand('删除主题', (doc) => deleteTopic(doc, topicId));
}

function requestReset() {
  confirmAction.value = { type: 'reset' };
}

function confirmPending() {
  const action = confirmAction.value;
  if (!action) return;
  if (action.type === 'delete') {
    performDelete(action.topicId);
    return;
  }
  confirmAction.value = null;
  const before = store.serialized;
  if (store.resetToEmpty()) {
    emitIfChanged(before);
    showNotice('已重置为空白导图，可撤销');
  }
  void focusStage();
}

function cancelPending() {
  confirmAction.value = null;
  void focusStage();
}

/* ------------------------------- 撤销/重做 ------------------------------- */

function doUndo() {
  if (!canUndo.value) return;
  const before = store.serialized;
  if (store.undo()) emitIfChanged(before);
  void focusStage();
}

function doRedo() {
  if (!canRedo.value) return;
  const before = store.serialized;
  if (store.redo()) emitIfChanged(before);
  void focusStage();
}

/* ------------------------------- 画布事件 ------------------------------- */

function onViewportChange(next: typeof viewport.value) {
  // 视口只影响渲染：不写文档、不触发 change、不进入历史
  store.setViewport(next);
}

/* ---------------------- 视口命令（UX-3C：全局工具栏转发） ---------------------- */

/**
 * 适配/缩放/重置视口走画布实例方法。
 *
 * 工具栏外移后按钮在 Stage 之外，点击会把焦点留在 Toolbar 上；这里沿用编辑命令的
 * 做法在动作后把焦点还给 Stage，保证紧接着的 Ctrl+Z / Tab 等快捷键仍由 Stage 接收
 * （与「按钮原本就在 Stage 内」时的焦点行为一致）。
 */
function fitView() {
  canvasRef.value?.fitView();
  void focusStage();
}

function zoomIn() {
  canvasRef.value?.zoomIn();
  void focusStage();
}

function zoomOut() {
  canvasRef.value?.zoomOut();
  void focusStage();
}

function resetView() {
  canvasRef.value?.resetView();
  void focusStage();
}

function onEditingText(text: string) {
  editingText.value = text;
}

function onMove(draggedId: string, targetId: string) {
  const doc = document.value;
  if (!doc || draggedId === targetId) return;
  if (draggedId === doc.rootTopicId) {
    showNotice('中心主题不能移动');
    return;
  }
  if (isDescendantOf(doc, draggedId, targetId)) {
    showNotice('不能把节点移动到自身的后代之下');
    return;
  }
  runCommand('拖放移动', (current) => moveTopic(current, draggedId, targetId));
}

/* ----------------------- 右侧面板（UX-3B：大纲 / 属性） ----------------------- */

/**
 * 右侧两列的显隐由 store.outlineVisible / store.propertiesVisible 统一维护
 * （App 负责渲染 MindmapRightPanel，开关在全局 Toolbar）。
 * Stage 只提供开关方法与快捷键入口：
 * - toggle 语义与旧工具栏一致：同一面板再点一次 = 关掉；
 * - 两列相互独立，可同时打开。
 */
function toggleOutlinePanel(): boolean {
  const visible = store.toggleOutlineVisible();
  void focusStage();
  return visible;
}

function togglePropertiesPanel(): boolean {
  const visible = store.togglePropertiesVisible();
  void focusStage();
  return visible;
}

/** 打开属性列（右键菜单「属性面板 / 添加边界 / 添加概要」入口）。 */
function openPropertiesPanel() {
  store.setPropertiesVisible(true);
}

/** 右键菜单「清除边界」：直接清空当前选中节点的边界（可撤销）。 */
function clearSelectedBoundary() {
  const id = selectedTopicId.value;
  if (!id) return;
  const before = store.serialized;
  if (store.setTopicBoundary(id, null)) {
    emitIfChanged(before);
    showNotice('已清除节点边界');
  }
}

/** 右键菜单「清除概要」：直接清空当前选中节点的概要（可撤销）。 */
function clearSelectedSummary() {
  const id = selectedTopicId.value;
  if (!id) return;
  const before = store.serialized;
  if (store.setTopicSummary(id, null)) {
    emitIfChanged(before);
    showNotice('已清除节点概要');
  }
}

/**
 * 应用主题模板（可撤销）。
 *
 * 与布局切换同样沿用「前后序列化对比 → emit change」模式：
 * store.setTheme 负责校验与历史，组件只负责把新内容交回标签管线。
 * UX-3C：全局 Toolbar 的主题下拉经 App 转发到这里（Stage 内不再有 select）。
 */
function applyTheme(nextThemeId: string): boolean {
  if (!nextThemeId || nextThemeId === themeId.value) return false;
  const before = store.serialized;
  if (!store.setTheme(nextThemeId)) return false;
  emitIfChanged(before);
  showNotice(`已切换主题：${resolveMindmapTheme(nextThemeId).name}`);
  void focusStage();
  return true;
}

/* ------------------------------- 右键菜单（UX-1） ------------------------------- */

/** 与 MindmapContextMenu 的 items 结构保持一致（结构类型，无需共享声明）。 */
interface StageMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
}

/** 右键事件载荷：nodeId 为 null 表示空白区域。 */
interface MindmapContextMenuPayload {
  nodeId: string | null;
  clientX: number;
  clientY: number;
}

const contextMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  nodeId: string | null;
}>({ visible: false, x: 0, y: 0, nodeId: null });

function closeContextMenu() {
  contextMenu.value.visible = false;
}

/** 画布 / 大纲统一的右键入口：先选中目标节点，再打开菜单。 */
function openMindmapContextMenu(payload: MindmapContextMenuPayload) {
  if (isExternal.value || !document.value) return;
  if (payload.nodeId) store.selectTopic(payload.nodeId);
  contextMenu.value = {
    visible: true,
    x: payload.clientX,
    y: payload.clientY,
    nodeId: payload.nodeId,
  };
}

/** 当前右键目标的节点（空白菜单为 null）。 */
const contextMenuTopic = computed(() => {
  const id = contextMenu.value.nodeId;
  if (!id) return null;
  return document.value?.topics[id] ?? null;
});

/**
 * 当前应展示的菜单项：节点菜单（≥7 项）与空白菜单（≥4 项）。
 * 菜单只负责「展示 + 派发 id」，实际动作统一交给 runContextMenuAction。
 */
const contextMenuItems = computed<StageMenuItem[]>(() => {
  const doc = document.value;
  if (!doc) return [];

  const topic = contextMenuTopic.value;
  if (!topic) {
    // 空白区域：不针对具体节点，只提供画布级操作
    return [
      { id: 'add-root-child', label: '新增中心子主题', shortcut: 'Tab' },
      { id: 'fit-view', label: '适配内容' },
      { id: 'reset-view', label: '重置视口' },
      { id: 'toggle-properties', label: '属性面板' },
      { id: 'undo', label: '撤销', shortcut: 'Ctrl+Z', disabled: !canUndo.value },
      { id: 'redo', label: '重做', shortcut: 'Ctrl+Shift+Z', disabled: !canRedo.value },
    ];
  }

  const hasChildren = (topic.childIds ?? []).length > 0;
  const isRoot = topic.id === doc.rootTopicId;
  return [
    { id: 'add-child', label: '新增子主题', shortcut: 'Tab' },
    { id: 'add-sibling', label: '新增同级主题', shortcut: 'Enter', disabled: isRoot },
    { id: 'rename', label: '重命名', shortcut: 'F2' },
    { id: 'duplicate', label: '复制主题' },
    { id: 'group-1', label: '', separator: true },
    { id: 'toggle-collapse', label: topic.collapsed ? '展开子主题' : '折叠子主题', disabled: !hasChildren },
    { id: 'move-up', label: '上移', shortcut: 'Alt+↑', disabled: isRoot },
    { id: 'move-down', label: '下移', shortcut: 'Alt+↓', disabled: isRoot },
    { id: 'group-2', label: '', separator: true },
    // UX-2：边界 / 概要按当前是否已有决定「添加」还是「清除」
    topic.boundary
      ? { id: 'clear-boundary', label: '清除边界' }
      : { id: 'add-boundary', label: '添加边界…' },
    topic.summary
      ? { id: 'clear-summary', label: '清除概要' }
      : { id: 'add-summary', label: '添加概要…' },
    { id: 'group-3', label: '', separator: true },
    { id: 'toggle-properties', label: '打开属性面板' },
    { id: 'delete', label: '删除主题', shortcut: 'Delete', danger: true, disabled: isRoot },
  ];
});

/**
 * 执行菜单项：全部复用既有命令函数，菜单本身不直接改文档。
 * 右键时已经选中了目标节点，因此这里的命令都作用于「当前选中」。
 */
function runContextMenuAction(id: string) {
  const nodeId = contextMenu.value.nodeId;
  const doc = document.value;
  closeContextMenu();
  if (!doc) return;

  if (!nodeId) {
    switch (id) {
      case 'add-root-child':
        store.selectTopic(doc.rootTopicId);
        addChild();
        break;
      case 'fit-view':
        canvasRef.value?.fitView();
        break;
      case 'reset-view':
        canvasRef.value?.resetView();
        break;
      case 'toggle-properties':
        openPropertiesPanel();
        break;
      case 'undo':
        doUndo();
        break;
      case 'redo':
        doRedo();
        break;
      default:
        break;
    }
    return;
  }

  store.selectTopic(nodeId);
  switch (id) {
    case 'add-child':
      addChild();
      break;
    case 'add-sibling':
      addSibling();
      break;
    case 'rename':
      startRename(nodeId);
      break;
    case 'duplicate':
      duplicateSelected();
      break;
    case 'toggle-collapse':
      toggleCollapse(nodeId);
      break;
    case 'move-up':
      moveSelected(-1);
      break;
    case 'move-down':
      moveSelected(1);
      break;
    case 'toggle-properties':
      openPropertiesPanel();
      break;
    // UX-2：添加边界/概要需要输入，先打开属性面板（不产生空文档噪音）
    case 'add-boundary':
      openPropertiesPanel();
      showNotice('可在属性面板中设置边界标签与颜色');
      break;
    case 'clear-boundary':
      clearSelectedBoundary();
      break;
    case 'add-summary':
      openPropertiesPanel();
      showNotice('可在属性面板中输入概要文本');
      break;
    case 'clear-summary':
      clearSelectedSummary();
      break;
    case 'delete':
      requestDelete();
      break;
    default:
      break;
  }
}

/* ------------------------------- 导入 / 导出 ------------------------------- */

async function handleImportPick() {
  if (importBusy.value) return;
  try {
    const path = await pickMindmapImportFile();
    if (!path) return;
    importBusy.value = true;
    const file = await readMindmapImportFile(path);
    importFileName.value = file.fileName;
    importPreview.value = await previewMindmapImport({
      fileName: file.fileName,
      content: file.content,
      bytes: file.bytes,
    });
    importDialogVisible.value = true;
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '读取导入文件失败');
  } finally {
    importBusy.value = false;
  }
}

function cancelImport() {
  importDialogVisible.value = false;
  importPreview.value = null;
}

function confirmImport() {
  const preview = importPreview.value;
  if (!preview?.ok || !preview.document) return;
  const before = store.serialized;
  const replaced = store.replaceDocument(preview.document, `导入 ${preview.formatName}`);
  if (replaced) {
    emitIfChanged(before);
    showNotice(`已导入 ${preview.formatName}`);
  } else {
    showNotice('导入内容与当前文档相同，未做修改');
  }
  importDialogVisible.value = false;
  importPreview.value = null;
  void focusStage();
}

function openExportDialog() {
  exportDialogVisible.value = true;
}

async function confirmExport(payload: {
  formatId: MindmapExportFormatId;
  background: 'transparent' | string;
  scale: number;
}) {
  const current = document.value;
  if (!current || exportBusy.value) return;
  exportBusy.value = true;
  try {
    const extension = MINDMAP_EXPORT_FORMATS.find((format) => format.id === payload.formatId)?.extension
      ?? 'txt';
    const defaultName = buildExportFileName(current.title, extension);
    const path = await pickMindmapExportPath(defaultName, extension);
    if (!path) return;

    // 多工作表时，非原生格式只会导出当前工作表，明确告知避免误解
    const sheetSuffix = store.sheets.length > 1 ? '（仅当前工作表）' : '';

    if (payload.formatId === 'png') {
      showNotice('正在导出 PNG…');
      const { blob, width, height } = await exportMindmapPng(current, {
        background: payload.background,
        scale: payload.scale,
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await writeMindmapExportFile(path, { kind: 'binary', bytes });
      showNotice(`已导出 PNG（${width}×${height}）${sheetSuffix}`);
    } else if (payload.formatId === 'pdf') {
      showNotice('正在导出 PDF…');
      const result = await exportMindmapPdfFile(current, {
        background: '#ffffff',
        scale: 1,
      });
      if (!result.ok || !result.bytes) {
        throw new Error(result.error?.message ?? 'PDF 导出失败');
      }
      await writeMindmapExportFile(path, { kind: 'binary', bytes: result.bytes });
      showNotice(`已导出 PDF（${result.width}×${result.height}）${sheetSuffix}`);
    } else {
      const result = exportMindmapText(payload.formatId, current);
      if (!result.ok) throw new Error(result.error?.message ?? '导出失败');
      await writeMindmapExportFile(path, { kind: 'text', text: result.output });
      const baseMessage = result.lossy && result.lossy.length > 0
        ? `已导出（${result.lossy.length} 项有损）`
        : '已导出';
      showNotice(`${baseMessage}${sheetSuffix}`);
    }
    exportDialogVisible.value = false;
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '导出失败');
  } finally {
    exportBusy.value = false;
  }
}

/** 打印当前导图：把 SVG 放进隐藏 iframe 调起系统打印对话框。 */
async function handlePrint() {
  const current = document.value;
  if (!current) return;
  try {
    showNotice('正在准备打印…');
    const { width, height } = await printMindmap(current, { background: 'transparent' });
    showNotice(`已调起打印（${width}×${height}）`);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '打印失败');
  }
}

/* ------------------------------- 打开失败恢复 ------------------------------- */

/**
 * 空 / 损坏的 .taumap：按用户点击重建为空白导图。
 * 这会替换标签内容（随后可保存覆盖），是显式操作，不在加载路径里自动执行。
 */
function recoverFromError() {
  const title = (props.fileName || '未命名思维导图')
    .replace(/\.[^.]+$/, '')
    .trim() || '未命名思维导图';
  if (store.recoverAsEmptyDocument(title)) {
    emit('change', store.serialized);
    showNotice('已创建空白导图，保存后即写入该文件');
  }
  void focusStage();
}

/* ------------------------------- 键盘 ------------------------------- */

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function onKeydown(event: KeyboardEvent) {
  if (isTextInputTarget(event.target)) return;
  if (isExternal.value || !document.value) return;

  // 右键菜单打开时，方向键 / Enter / Esc 由菜单自己处理，舞台不再响应
  if (contextMenu.value.visible) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeContextMenu();
    }
    return;
  }

  if (confirmAction.value) {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelPending();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      confirmPending();
    }
    return;
  }

  const currentRows = rows.value;
  if (currentRows.length === 0) return;
  const index = selectedIndex.value;
  const meta = event.ctrlKey || event.metaKey;
  const key = event.key;

  // UX-3B：Ctrl+Alt+O 切换大纲面板、Ctrl+Alt+P 切换属性面板
  if (meta && event.altKey && (key === 'o' || key === 'O')) {
    event.preventDefault();
    toggleOutlinePanel();
    return;
  }
  if (meta && event.altKey && (key === 'p' || key === 'P')) {
    event.preventDefault();
    togglePropertiesPanel();
    return;
  }

  if (meta && (key === 'z' || key === 'Z')) {
    event.preventDefault();
    if (event.shiftKey) doRedo();
    else doUndo();
    return;
  }
  if (meta && (key === 'y' || key === 'Y')) {
    event.preventDefault();
    doRedo();
    return;
  }
  if (event.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
    event.preventDefault();
    moveSelected(key === 'ArrowUp' ? -1 : 1);
    return;
  }

  switch (key) {
    case 'ArrowDown':
      event.preventDefault();
      selectByIndex(Math.min(index + 1, currentRows.length - 1));
      break;
    case 'ArrowUp':
      event.preventDefault();
      selectByIndex(Math.max(index - 1, 0));
      break;
    case 'ArrowRight': {
      event.preventDefault();
      const row = currentRows[index];
      if (!row) break;
      if (row.hasChildren && row.collapsed) {
        toggleCollapse(row.id);
      } else if (row.hasChildren) {
        const first = document.value?.topics[row.id]?.childIds?.[0];
        if (first) selectTopic(first);
      }
      break;
    }
    case 'ArrowLeft': {
      event.preventDefault();
      const row = currentRows[index];
      if (!row) break;
      if (row.hasChildren && !row.collapsed) {
        toggleCollapse(row.id);
      } else {
        const parentId = document.value?.topics[row.id]?.parentId;
        if (parentId) selectTopic(parentId);
      }
      break;
    }
    case 'Tab':
      event.preventDefault();
      addChild();
      break;
    case 'Enter':
      event.preventDefault();
      addSiblingOrChild();
      break;
    case 'F2': {
      event.preventDefault();
      const row = currentRows[index];
      if (row) startRename(row.id);
      break;
    }
    case 'Delete':
    case 'Backspace':
      event.preventDefault();
      requestDelete();
      break;
    default:
      break;
  }
}

/**
 * 对外暴露的方法。
 *
 * - UX-3B：右侧面板在大纲行右键时复用的正是 Stage 这套统一右键菜单
 *   （Teleport 到 body，位置为 fixed，因此跨组件复用不会错位）；
 * - UX-3C：工具栏外移到全局 Toolbar 后，按钮点击经 App 的 ref 转发到这里，
 *   保证「组件仍是唯一改文档的地方」这一受控约定不被打破。
 */
defineExpose({
  openMindmapContextMenu,
  // 编辑
  addChild,
  addSibling,
  startRename,
  duplicateSelected,
  requestDelete,
  moveSelected,
  // 历史
  doUndo,
  doRedo,
  // 视口
  fitView,
  zoomIn,
  zoomOut,
  resetView,
  // 文档级切换
  runLayoutCommand,
  applyTheme,
  requestReset,
  // 导入 / 导出 / 打印
  handleImportPick,
  openExportDialog,
  handlePrint,
  // 右侧面板开关（store.outlineVisible / store.propertiesVisible）
  toggleOutlinePanel,
  togglePropertiesPanel,
});
</script>

<template>
  <div
    ref="stageRef"
    class="mindmap-stage"
    data-testid="mindmap-stage"
    tabindex="0"
    @keydown="onKeydown"
  >
    <!-- 外部格式：仍只提供识别与只读提示 -->
    <div v-if="isExternal" class="mindmap-external-notice" data-testid="mindmap-external-notice">
      <div class="mindmap-external-title">外部思维导图格式</div>
      <div class="mindmap-external-desc">
        {{ props.fileName }} 是外部思维导图格式。当前阶段仅提供格式识别与安全只读打开，
        版本化导入（XMind / FreeMind / MindManager 等）将在后续阶段提供，不会改写源文件。
      </div>
    </div>

    <!-- 解析失败：安全失败，不改写源文件 -->
    <div v-else-if="loadError" class="mindmap-error" data-testid="mindmap-error">
      <div class="mindmap-error-title">无法打开该思维导图</div>
      <div class="mindmap-error-message">{{ loadError }}</div>
      <div class="mindmap-error-hint">
        文件内容为空或不是合法的思维导图 JSON（.taumap 应为带 format 字段的 JSON）。
        可以新建空白导图覆盖它开始创作；原文件在你确认前不会被改动。
      </div>
      <div class="mindmap-error-actions">
        <button
          type="button"
          class="mm-btn primary"
          data-testid="mm-error-create-empty"
          @click="recoverFromError"
        >
          新建空白导图并覆盖
        </button>
      </div>
    </div>

    <template v-else-if="document">
      <!-- 统计条（UX-3C）：工具栏已外移到 App 顶部全局 Toolbar，这里只保留只读统计 -->
      <div class="mindmap-stats-bar">
        <span class="mm-stats">
          {{ rows.length }} 个可见节点 · {{ Math.round(viewport.zoom * 100) }}%<span v-if="descendantsOfSelected"> · 选中含 {{ descendantsOfSelected }} 个子节点</span>
        </span>
      </div>

      <div v-if="notice" class="mindmap-notice" role="status" data-testid="mindmap-notice">{{ notice }}</div>

      <!-- 工作表切换条（阶段 4E）：切换 / 新增 / 删除均以可撤销命令写回文档并 emit change -->
      <div class="mindmap-sheet-bar" data-testid="mm-sheet-bar" role="tablist" aria-label="工作表">
        <button
          v-for="(sheet, index) in sheets"
          :key="sheet.id"
          type="button"
          role="tab"
          class="mm-sheet-tab"
          :class="{ 'is-active': sheet.id === currentSheetId }"
          :data-testid="`mm-sheet-tab-${index}`"
          :aria-selected="sheet.id === currentSheetId"
          :title="sheet.title"
          @click="switchSheet(sheet)"
        >{{ sheet.title }}</button>
        <span class="mm-divider" aria-hidden="true"></span>
        <button type="button" class="mm-btn" data-testid="mm-sheet-add" title="新增工作表" @click="addSheet">
          ＋ 工作表
        </button>
        <button
          type="button"
          class="mm-btn danger"
          data-testid="mm-sheet-remove"
          :disabled="sheets.length <= 1"
          title="删除当前工作表（至少保留一个）"
          @click="removeCurrentSheet"
        >
          删除工作表
        </button>
      </div>

      <div class="mindmap-workspace">
        <MindmapCanvas
          ref="canvasRef"
          :document="document"
          :selected-id="selectedTopicId"
          :viewport="viewport"
          :editing-id="editingTopicId"
          :editing-text="editingText"
          @select="selectTopic"
          @toggle-collapse="toggleCollapse"
          @start-rename="startRename"
          @commit-rename="commitRename"
          @cancel-rename="cancelRename"
          @update:viewport="onViewportChange"
          @update:editing-text="onEditingText"
          @move="onMove"
          @contextmenu="openMindmapContextMenu"
        />
        <!-- 大纲 / 属性面板已外移到外壳右侧（MindmapRightPanel，由 App 渲染） -->
      </div>

      <div v-if="confirmAction" class="mindmap-confirm" role="alertdialog" data-testid="mindmap-confirm">
        <span class="mindmap-confirm-text">
          <template v-if="confirmAction.type === 'delete'">
            删除该主题及其 {{ confirmAction.count }} 个子节点？此操作可撤销。
          </template>
          <template v-else>重置为空白导图？当前内容会被替换（可撤销）。</template>
        </span>
        <button type="button" class="mm-btn danger" data-testid="mm-confirm-ok" @click="confirmPending">确认</button>
        <button type="button" class="mm-btn" data-testid="mm-confirm-cancel" @click="cancelPending">取消</button>
      </div>

      <div class="mindmap-stage-note">
        阶段 2：画布与大纲。滚轮缩放 · 空白拖拽平移 · 双击改名 · 拖节点改变父级 · Tab 子主题 · Enter 同级 · F2 改名 · Delete 删除 · Alt+↑↓ 重排 · Ctrl+Z 撤销。
        布局可在「导图 / 逻辑图 / 树形 / 组织图」间切换（可撤销）。
        阶段 4：节点样式 / 标记 / 关系线可在属性面板中调整，主题模板与布局在窗口顶部工具栏切换（均可撤销）。
        阶段 4E：多工作表可新增 / 切换 / 删除（均可撤销，至少保留一个工作表）。右键画布节点或大纲行可打开快捷菜单。边界（包住主题与后代）与概要（子节点括线）可在属性面板中设置。
        面板：大纲 / 属性在外壳右侧双 tab 面板中查看（Ctrl+Alt+O 大纲、Ctrl+Alt+P 属性，可收起）。
      </div>
    </template>

    <MindmapContextMenu
      :visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenuItems"
      @select="runContextMenuAction"
      @close="closeContextMenu"
    />

    <MindmapImportPreviewDialog
      :visible="importDialogVisible"
      :file-name="importFileName"
      :preview="importPreview"
      :busy="importBusy"
      @close="cancelImport"
      @confirm="confirmImport"
    />
    <MindmapExportDialog
      :visible="exportDialogVisible"
      :busy="exportBusy"
      @close="exportDialogVisible = false"
      @confirm="confirmExport"
    />
  </div>
</template>

<style scoped>
/*
 * 配色一律使用 Tau 主题 token（frontend/src/assets/workbench-theme.css）：
 * 之前这里引用了不存在的 --background/--surface/--border/--hover/--danger，
 * fallback 又是写死的浅色，导致暗色主题下出现「白底浅字」。
 */
.mindmap-stage {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-app);
  color: var(--text-primary);
  font-family: var(--font-ui);
  overflow: hidden;
  outline: none;
}
/* UX-3C：工具栏外移后舞台顶部只保留一条只读统计 */
.mindmap-stats-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 4px 12px;
  background: var(--panel-base);
  border-bottom: 1px solid var(--border-soft);
}
.mm-btn {
  padding: 5px 10px;
  border-radius: var(--radius-control);
  border: 1px solid var(--border-soft);
  background: var(--panel-elevated);
  color: var(--text-primary);
  font-size: 12px;
  font-family: var(--font-ui);
  cursor: pointer;
}
.mm-btn:hover:not(:disabled) { background: var(--surface-hover); }
.mm-btn:disabled { opacity: 0.45; cursor: default; }
.mm-btn.danger {
  border-color: var(--state-danger);
  color: var(--state-danger);
}
.mm-btn.danger:hover:not(:disabled) { background: var(--surface-hover); }
.mm-divider { width: 1px; height: 18px; background: var(--border-soft); }
.mm-stats { font-size: 12px; color: var(--text-muted); }
.mindmap-notice {
  padding: 6px 14px;
  font-size: 12px;
  color: var(--text-primary);
  background: var(--surface-active);
  border-bottom: 1px solid var(--border-soft);
}
.mindmap-workspace {
  flex: 1;
  display: flex;
  min-height: 0;
}
/* 工作表切换条（阶段 4E） */
.mindmap-sheet-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--panel-base);
  border-bottom: 1px solid var(--border-soft);
  overflow-x: auto;
}
.mm-sheet-tab {
  padding: 4px 10px;
  border-radius: var(--radius-control);
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-family: var(--font-ui);
  cursor: pointer;
  white-space: nowrap;
}
.mm-sheet-tab:hover { background: var(--surface-hover); color: var(--text-primary); }
.mm-sheet-tab.is-active {
  border-color: var(--accent-brand);
  background: var(--surface-active);
  color: var(--accent-brand-strong);
  font-weight: 600;
}
.mindmap-confirm {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid var(--border-strong);
  background: var(--panel-elevated);
  color: var(--text-primary);
  font-size: 12px;
}
.mindmap-confirm-text { flex: 1; }
.mindmap-stage-note {
  padding: 8px 14px;
  border-top: 1px solid var(--border-soft);
  font-size: 12px;
  color: var(--text-muted);
}
.mindmap-error {
  padding: 32px;
  text-align: center;
  color: var(--text-primary);
}
.mindmap-error-title { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
.mindmap-error-message { font-size: 13px; color: var(--state-danger); margin-bottom: 8px; }
.mindmap-error-hint { font-size: 12px; color: var(--text-muted); line-height: 1.7; }
.mindmap-error-actions { margin-top: 14px; display: flex; justify-content: center; }
.mindmap-external-notice { padding: 24px; text-align: center; color: var(--text-primary); }
.mindmap-external-title { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
.mindmap-external-desc {
  font-size: 13px;
  color: var(--text-secondary);
  max-width: 520px;
  margin: 0 auto;
  line-height: 1.6;
}
</style>
