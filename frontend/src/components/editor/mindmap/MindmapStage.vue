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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { buildMindmapOutlineRows, useMindmapStore } from '@/stores/mindmap';
import { useCloudQuotaStore } from '@/stores/cloudQuota';
import {
  addChildTopic,
  addSiblingTopic,
  collectSubtreeTopicIds,
  countDescendants,
  deleteTopic,
  duplicateTopic,
  isDescendantOf,
  moveTopic,
  moveTopicByOffset,
  renameTopic,
  setTopicCollapsed,
  setTopicTextStyle,
} from '@/services/mindmap/mindmapCommands';
import type { MindMapCommandResult } from '@/services/mindmap/mindmapCommands';
import { computeMindmapLayout } from '@/services/mindmapLayoutService';
import { DEFAULT_MINDMAP_THEME_ID, resolveMindmapTheme } from '@/services/mindmapThemeService';
import type {
  MindMapLayoutMode,
  MindMapSheet,
  MindmapOutlineRow,
} from '@/types/mindmap';
import type { TabDocumentKind } from '@/stores/tabs';
import MindmapCanvas from './MindmapCanvas.vue';
import MindmapImageNodeLayer from './MindmapImageNodeLayer.vue';
import MindmapContextMenu from './MindmapContextMenu.vue';
import MindmapImportPreviewDialog from './MindmapImportPreviewDialog.vue';
import MindmapExportDialog from './MindmapExportDialog.vue';
import {
  MINDMAP_EXPORT_FORMATS,
  buildExportFileName,
  previewMindmapImport,
  type MindmapExportFormatId,
  type MindmapImportPreview,
} from '@/services/mindmap/importExportService';
import { canExportMindmapFormat, exportMindmapBrandedText, exportMindmapVisualJpeg, exportMindmapVisualPng, exportMindmapVisualPdf, exportMindmapVisualSvg, resolveMindmapVisualExportOptions } from '@/services/mindmapExportService';
import { printMindmap } from '@/services/mindmapPdfService';
import {
  pickMindmapExportPath,
  pickMindmapImageFile,
  pickMindmapImportFile,
  readMindmapImageFile,
  readMindmapImportFile,
  writeMindmapExportFile,
} from '@/services/mindmapFileIoService';
import {
  addMindmapImageNode,
  getMindmapImageNodes,
  removeMindmapImageNode,
  MINDMAP_IMAGE_NODE_MAX_DATA_BYTES,
  type MindmapImageNode,
} from '@/services/mindmapImageNodeService';

const props = defineProps<{
  tabId: string;
  documentJson: string;
  fileName: string;
  documentKind?: TabDocumentKind;
  isDirty?: boolean;
}>();

const emit = defineEmits<{
  (event: 'change', json: string): void;
  (event: 'membership-required', payload: { feature: string; reason: string }): void;
}>();

const store = useMindmapStore();
const cloudQuotaStore = useCloudQuotaStore();
const document = computed(() => store.document);
const selectedTopicId = computed(() => store.selectedTopicId);
const viewport = computed(() => store.viewport);
const loadError = computed(() => store.loadError);
const canUndo = computed(() => store.canUndo);
const canRedo = computed(() => store.canRedo);
const imageNodes = computed(() => (document.value ? getMindmapImageNodes(document.value) : []));
const imageLayout = computed(() => (document.value ? computeMindmapLayout(document.value) : null));

function bytesToDataUrl(bytes: Uint8Array, fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? 'png';
  const mime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg'
    : extension === 'gif' ? 'image/gif'
      : extension === 'webp' ? 'image/webp' : 'image/png';
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

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
const exportError = ref('');

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
  window.removeEventListener('mindmap-outline-focus', onOutlineFocus);
});

function onOutlineFocus(event: Event) {
  const detail = (event as CustomEvent<{ tabId: string; topicId: string }>).detail;
  if (!detail || detail.tabId !== props.tabId || store.tabId !== props.tabId) return;
  void nextTick(() => {
    if (store.tabId === props.tabId) canvasRef.value?.focusTopic(detail.topicId);
  });
}

onMounted(() => window.addEventListener('mindmap-outline-focus', onOutlineFocus));

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
  const limitNotice = store.nodeLimitNotice;
  const result = store.applyCommand(label, command);
  if (!result) return false;
  if (!result.ok) {
    if (store.nodeLimitNotice !== limitNotice) {
      emit('membership-required', {
        feature: '大规模导图',
        reason: '免费版每个导图最多 30 个节点，升级会员即可创建更大规模的导图。',
      });
    }
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

async function addImageToTopic(topicId: string) {
  const current = document.value;
  if (!current || isExternal.value) return;
  if (cloudQuotaStore.tier !== 'PLUS' && cloudQuotaStore.tier !== 'PRO') {
    emit('membership-required', {
      feature: '图片节点',
      reason: '图片节点支持主题配图、尺寸调整与导图内联保存，仅对 PLUS / PRO 会员开放。',
    });
    return;
  }
  try {
    const path = await pickMindmapImageFile();
    if (!path) return;
    const file = await readMindmapImageFile(path);
    // data URL 会产生约 4/3 的 Base64 膨胀；预先限制原始文件，确保持久化校验也能通过。
    if (file.bytes.byteLength > Math.floor(MINDMAP_IMAGE_NODE_MAX_DATA_BYTES * 0.74)) {
      showNotice('图片不能超过约 3.7MB（会以内联方式写入导图）');
      return;
    }
    const result = addMindmapImageNode(current, topicId, {
      src: bytesToDataUrl(file.bytes, file.fileName),
      alt: file.fileName.replace(/\.[^.]+$/, ''),
    }, cloudQuotaStore.tier);
    if (!result.ok) {
      showNotice(result.error.message);
      return;
    }
    const before = store.serialized;
    if (store.commitDocumentChange('添加图片节点', result.document)) {
      emitIfChanged(before);
      showNotice('已添加图片节点');
    }
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '添加图片节点失败');
  } finally {
    void focusStage();
  }
}

function removeImageNode(imageNode: MindmapImageNode) {
  const current = document.value;
  if (!current) return;
  const result = removeMindmapImageNode(current, imageNode.id, cloudQuotaStore.tier);
  if (!result.ok) {
    showNotice(result.error.message);
    return;
  }
  const before = store.serialized;
  if (store.commitDocumentChange('删除图片节点', result.document)) {
    emitIfChanged(before);
    showNotice('已删除图片节点');
  }
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
const currentSheet = computed(() => sheets.value.find((sheet) => sheet.id === currentSheetId.value));
const editingSheet = ref<{ id: string; tabId: string; originalTitle: string } | null>(null);
const sheetTitleDraft = ref('');
const sheetRenameButton = ref<HTMLButtonElement | null>(null);

function startSheetRename(sheet: MindMapSheet) {
  editingSheet.value = { id: sheet.id, tabId: props.tabId, originalTitle: sheet.title };
  sheetTitleDraft.value = sheet.title;
  void nextTick(() => {
    const input = stageRef.value?.querySelector<HTMLInputElement>('[data-testid="mm-sheet-rename-input"]');
    input?.focus();
    input?.select();
  });
}

function finishSheetRename(commit: boolean, restoreFocus = false) {
  const editing = editingSheet.value;
  if (!editing) return;
  editingSheet.value = null;
  const current = sheets.value.find((sheet) => sheet.id === editing.id);
  if (commit && editing.tabId === props.tabId && store.tabId === props.tabId && current?.title === editing.originalTitle) {
    const before = store.serialized;
    if (store.renameSheet(editing.id, sheetTitleDraft.value)) emitIfChanged(before);
  }
  if (restoreFocus) void nextTick(() => sheetRenameButton.value?.focus());
}

watch(() => props.tabId, () => { editingSheet.value = null; });

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
  if (cloudQuotaStore.tier !== 'PLUS' && cloudQuotaStore.tier !== 'PRO') {
    emit('membership-required', {
      feature: '多工作表',
      reason: '免费版每个文件只能创建一个工作表，升级 Plus 或 Pro 后可创建多个工作表。',
    });
    return;
  }
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

function applyEditingTextStyle(payload: { start: number; end: number; color?: string | null; background?: string | null }) {
  const topicId = editingTopicId.value;
  if (!topicId || payload.end <= payload.start) return;
  const currentText = document.value?.topics[topicId]?.text;
  if (currentText !== editingText.value) {
    if (!runCommand('重命名主题', (doc) => renameTopic(doc, topicId, editingText.value))) return;
  }
  runCommand('设置节点文字样式', (doc) => setTopicTextStyle(
    doc,
    topicId,
    payload.start,
    payload.end,
    { color: payload.color, background: payload.background },
  ));
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
 * 是否存在可折叠/可展开的节点（有子节点的节点）。
 * 用于空白区菜单的「展开全部 / 折叠全部」禁用态。
 */
function hasCollapsibleNodes(doc: typeof document.value): boolean {
  if (!doc) return false;
  return Object.values(doc.topics).some((topic) => (topic.childIds ?? []).length > 0);
}

/**
 * 批量设置某节点整棵子树（含自身）的折叠状态。
 *
 * 与 store 的历史机制一致：整批修改合并为**一次**文档提交，
 * 用户按一次撤销即可整体回退，不会产生 N 条历史。
 */
function setSubtreeCollapsed(topicId: string, collapsed: boolean, includeSelf = true) {
  const before = store.serialized;
  const result = store.applyCommand(
    collapsed ? '折叠子树' : '展开子树',
    (doc) => {
      const ids = new Set(collectSubtreeTopicIds(doc, topicId));
      if (!includeSelf) ids.delete(topicId);
      let current = doc;
      for (const id of ids) {
        const step = setTopicCollapsed(current, id, collapsed);
        if (!step.ok) return step;
        current = step.document;
      }
      return { ok: true as const, document: current };
    },
  );
  if (result?.ok) emitIfChanged(before);
}

/** 展开/折叠文档内全部含子节点的节点。 */
function setAllCollapsed(collapsed: boolean) {
  const doc = document.value;
  if (!doc) return;
  const targets = Object.values(doc.topics)
    .filter((topic) => (topic.childIds ?? []).length > 0)
    .map((topic) => topic.id);
  if (targets.length === 0) return;
  const before = store.serialized;
  const result = store.applyCommand(
    collapsed ? '折叠全部' : '展开全部',
    (current) => {
      let next = current;
      for (const id of targets) {
        const step = setTopicCollapsed(next, id, collapsed);
        if (!step.ok) return step;
        next = step.document;
      }
      return { ok: true as const, document: next };
    },
  );
  if (result?.ok) emitIfChanged(before);
}

/** 复制当前节点文字到剪贴板。 */
async function copyTopicText(topicId: string) {
  const text = document.value?.topics[topicId]?.text ?? '';
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showNotice('已复制节点文字');
  } catch {
    showNotice('复制失败，请手动选择文字复制');
  }
}

/** 清除某个节点上的全部文字颜色/背景高亮。 */
function clearTopicTextStyle(topicId: string) {
  const topic = document.value?.topics[topicId];
  if (!topic || (topic.textStyles ?? []).length === 0) return;
  const before = store.serialized;
  const result = store.applyCommand('清除文字样式', (doc) => {
    const target = doc.topics[topicId];
    if (!target) return { ok: false as const, error: { code: 'TOPIC_NOT_FOUND', message: '节点不存在' } };
    const next = { ...target };
    delete next.textStyles;
    return {
      ok: true as const,
      document: { ...doc, topics: { ...doc.topics, [topicId]: next } },
    };
  });
  if (result?.ok) {
    emitIfChanged(before);
    showNotice('已清除文字颜色与高亮');
  }
}

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
    const expandable = hasCollapsibleNodes(doc);
    return [
      { id: 'add-root-child', label: '新增中心子主题', shortcut: 'Tab' },
      { id: 'group-empty-1', label: '', separator: true },
      { id: 'expand-all', label: '展开全部节点', disabled: !expandable },
      { id: 'collapse-all', label: '折叠全部节点', disabled: !expandable },
      { id: 'group-empty-2', label: '', separator: true },
      { id: 'fit-view', label: '适配内容' },
      { id: 'reset-view', label: '重置视口' },
      { id: 'zoom-in', label: '放大' },
      { id: 'zoom-out', label: '缩小' },
      { id: 'group-empty-3', label: '', separator: true },
      { id: 'export', label: '导出…' },
      { id: 'toggle-properties', label: '属性面板' },
      { id: 'group-empty-4', label: '', separator: true },
      { id: 'undo', label: '撤销', shortcut: 'Ctrl+Z', disabled: !canUndo.value },
      { id: 'redo', label: '重做', shortcut: 'Ctrl+Shift+Z', disabled: !canRedo.value },
    ];
  }

  const hasChildren = (topic.childIds ?? []).length > 0;
  const isRoot = topic.id === doc.rootTopicId;
  const descendantCount = countDescendants(doc, topic.id);
  const hasStyledText = (topic.textStyles ?? []).length > 0;
  return [
    // 结构
    { id: 'add-child', label: '新增子主题', shortcut: 'Tab' },
    { id: 'add-sibling', label: '新增同级主题', shortcut: 'Enter', disabled: isRoot },
    { id: 'rename', label: '重命名', shortcut: 'F2' },
    { id: 'duplicate', label: '复制主题' },
    { id: 'group-1', label: '', separator: true },
    // 折叠
    { id: 'toggle-collapse', label: topic.collapsed ? '展开本节点' : '折叠本节点', disabled: !hasChildren },
    {
      id: 'collapse-descendants',
      label: descendantCount > 0 ? `折叠全部后代（${descendantCount}）` : '折叠全部后代',
      disabled: descendantCount === 0,
    },
    {
      id: 'expand-descendants',
      label: descendantCount > 0 ? `展开全部后代（${descendantCount}）` : '展开全部后代',
      disabled: descendantCount === 0,
    },
    { id: 'group-2', label: '', separator: true },
    // 排序与内容
    { id: 'move-up', label: '上移', shortcut: 'Alt+↑', disabled: isRoot },
    { id: 'move-down', label: '下移', shortcut: 'Alt+↓', disabled: isRoot },
    { id: 'copy-text', label: '复制节点文字' },
    { id: 'add-image', label: '添加图片节点…' },
    { id: 'group-3', label: '', separator: true },
    // 装饰（UX-2）
    topic.boundary
      ? { id: 'clear-boundary', label: '清除边界' }
      : { id: 'add-boundary', label: '添加边界…' },
    topic.summary
      ? { id: 'clear-summary', label: '清除概要' }
      : { id: 'add-summary', label: '添加概要…' },
    { id: 'clear-text-style', label: '清除文字颜色与高亮', disabled: !hasStyledText },
    { id: 'group-4', label: '', separator: true },
    { id: 'toggle-properties', label: '打开属性面板' },
    { id: 'delete', label: isRoot ? '重置为中心主题' : '删除主题', shortcut: 'Delete', danger: true },
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
      case 'expand-all':
        setAllCollapsed(false);
        break;
      case 'collapse-all':
        setAllCollapsed(true);
        break;
      case 'fit-view':
        canvasRef.value?.fitView();
        break;
      case 'reset-view':
        canvasRef.value?.resetView();
        break;
      case 'zoom-in':
        canvasRef.value?.zoomIn();
        break;
      case 'zoom-out':
        canvasRef.value?.zoomOut();
        break;
      case 'export':
        openExportDialog();
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
    case 'add-image':
      void addImageToTopic(nodeId);
      break;
    case 'toggle-collapse':
      toggleCollapse(nodeId);
      break;
    case 'collapse-descendants':
      setSubtreeCollapsed(nodeId, true, false);
      break;
    case 'expand-descendants':
      setSubtreeCollapsed(nodeId, false, false);
      break;
    case 'copy-text':
      void copyTopicText(nodeId);
      break;
    case 'clear-text-style':
      clearTopicTextStyle(nodeId);
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
      // 中心主题不能删除：改为「重置」并走确认流程，菜单标签也已据此变化
      if (doc.rootTopicId === nodeId) requestReset();
      else requestDelete();
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
  const limitNotice = store.nodeLimitNotice;
  const replaced = store.replaceDocument(preview.document, `导入 ${preview.formatName}`);
  if (replaced) {
    emitIfChanged(before);
    showNotice(`已导入 ${preview.formatName}`);
  } else if (store.nodeLimitNotice !== limitNotice) {
    emit('membership-required', {
      feature: '大规模导图',
      reason: '免费版每个导图最多 30 个节点，升级后可创建更大规模的思维导图。',
    });
    showNotice('导入失败：普通用户每个导图最多 30 个节点');
  } else {
    showNotice('导入内容与当前文档相同，未做修改');
  }
  importDialogVisible.value = false;
  importPreview.value = null;
  void focusStage();
}

function openExportDialog() {
  exportError.value = '';
  exportDialogVisible.value = true;
}

async function confirmExport(payload: {
  formatId: MindmapExportFormatId;
  background: 'transparent' | string;
  scale: number;
  colorMode: 'monochrome' | 'color';
  customWatermark?: string;
}) {
  const current = document.value;
  if (!current || exportBusy.value) return;
  if (!canExportMindmapFormat(payload.formatId, cloudQuotaStore.tier)) {
    const tier = cloudQuotaStore.tier === 'FREE' ? '免费版' : cloudQuotaStore.tier;
    emit('membership-required', {
      feature: `${payload.formatId.toUpperCase()} 导出`,
      reason: `${tier}暂不支持该格式，请升级会员解锁更多导出格式。`,
    });
    exportError.value = `${tier}暂不支持该格式，请升级会员解锁更多导出格式。`;
    return;
  }
  exportError.value = '';
  exportBusy.value = true;
  let successMessage = '';
  try {
    const extension = MINDMAP_EXPORT_FORMATS.find((format) => format.id === payload.formatId)?.extension
      ?? 'txt';
    const defaultName = buildExportFileName(current.title, extension);
    const path = await pickMindmapExportPath(defaultName, extension);
    if (!path) return;

    // 多工作表时，非原生格式只会导出当前工作表，明确告知避免误解
    const sheetSuffix = store.sheets.length > 1 ? '（仅当前工作表）' : '';

    if (payload.formatId === 'png') {
      const { blob, width, height } = await exportMindmapVisualPng(current, {
        tier: cloudQuotaStore.tier,
        background: payload.background,
        scale: payload.scale,
        colorMode: payload.colorMode,
        customWatermark: payload.customWatermark,
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await writeMindmapExportFile(path, { kind: 'binary', bytes });
      successMessage = `已导出 PNG（${width}×${height}）${sheetSuffix}`;
    } else if (payload.formatId === 'jpg') {
      const { blob, width, height } = await exportMindmapVisualJpeg(current, {
        tier: cloudQuotaStore.tier,
        background: '#ffffff',
        scale: payload.scale,
        colorMode: payload.colorMode,
        customWatermark: payload.customWatermark,
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await writeMindmapExportFile(path, { kind: 'binary', bytes });
      successMessage = `已导出 JPG（${width}×${height}）${sheetSuffix}`;
    } else if (payload.formatId === 'pdf') {
      const result = await exportMindmapVisualPdf(current, {
        tier: cloudQuotaStore.tier,
        background: '#ffffff',
        scale: 1,
        colorMode: payload.colorMode,
        customWatermark: payload.customWatermark,
      });
      if (!result.ok || !result.bytes) {
        throw new Error(result.error?.message ?? 'PDF 导出失败');
      }
      await writeMindmapExportFile(path, { kind: 'binary', bytes: result.bytes });
      successMessage = `已导出 PDF（${result.width}×${result.height}）${sheetSuffix}`;
    } else if (payload.formatId === 'svg') {
      const result = exportMindmapVisualSvg(current, {
        tier: cloudQuotaStore.tier,
        background: payload.background,
        colorMode: payload.colorMode,
        customWatermark: payload.customWatermark,
      });
      if (!result.ok) throw new Error(result.error?.message ?? 'SVG 导出失败');
      await writeMindmapExportFile(path, { kind: 'text', text: result.output });
      successMessage = `已导出 SVG${sheetSuffix}`;
    } else {
      const result = exportMindmapBrandedText(payload.formatId, current, cloudQuotaStore.tier);
      if (!result.ok) throw new Error(result.error?.message ?? '导出失败');
      await writeMindmapExportFile(path, { kind: 'text', text: result.output });
      const baseMessage = result.lossy && result.lossy.length > 0
        ? `已导出（${result.lossy.length} 项有损）`
        : '已导出';
      successMessage = `${baseMessage}${sheetSuffix}`;
    }
    exportDialogVisible.value = false;
    exportError.value = '';
    await nextTick();
    showNotice(successMessage || '导出成功');
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : '导出失败';
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
    const options = resolveMindmapVisualExportOptions({ tier: cloudQuotaStore.tier, background: 'transparent' });
    const { width, height } = await printMindmap(current, options);
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
      <div v-if="notice" class="mindmap-notice" role="status" data-testid="mindmap-notice">
        <span class="mindmap-notice-icon" aria-hidden="true">!</span>
        <span>{{ notice }}</span>
      </div>

      <!-- 工作表切换条（阶段 4E）：切换 / 新增 / 删除均以可撤销命令写回文档并 emit change -->
      <div class="mindmap-sheet-bar" data-testid="mm-sheet-bar" @keydown.stop>
        <div class="mm-sheet-tabs" role="tablist" aria-label="工作表">
          <template v-for="(sheet, index) in sheets" :key="sheet.id">
            <input
              v-if="editingSheet?.id === sheet.id"
              ref="sheetTitleInput"
              v-model="sheetTitleDraft"
              class="mm-sheet-input"
              data-testid="mm-sheet-rename-input"
              aria-label="工作表名称"
              @blur="finishSheetRename(true)"
              @keydown.enter.prevent="!$event.isComposing && finishSheetRename(true, true)"
              @keydown.esc.prevent="finishSheetRename(false, true)"
            >
            <button
              v-else
              type="button"
              role="tab"
              class="mm-sheet-tab"
              :class="{ 'is-active': sheet.id === currentSheetId }"
              :data-testid="`mm-sheet-tab-${index}`"
              :aria-selected="sheet.id === currentSheetId"
              :title="sheet.title"
              @click="switchSheet(sheet)"
              @dblclick="startSheetRename(sheet)"
              @keydown.f2.prevent="startSheetRename(sheet)"
            >{{ sheet.title }}</button>
          </template>
        </div>
        <span class="mm-divider" aria-hidden="true"></span>
        <button
          ref="sheetRenameButton"
          type="button"
          class="mm-btn"
          data-testid="mm-sheet-rename"
          title="重命名当前工作表"
          :disabled="!currentSheet"
          @click="currentSheet && startSheetRename(currentSheet)"
        >重命名工作表</button>
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
          :canvas-background="store.canvasBackground"
          :canvas-grid-visible="store.canvasGridVisible"
          :canvas-root-visible="store.canvasRootVisible"
          @select="selectTopic"
          @style-target="!isExternal && store.showStyleTarget($event)"
          @toggle-collapse="toggleCollapse"
          @start-rename="startRename"
          @commit-rename="commitRename"
          @cancel-rename="cancelRename"
          @update:viewport="onViewportChange"
          @update:editing-text="onEditingText"
          @apply-text-style="applyEditingTextStyle"
          @move="onMove"
          @contextmenu="openMindmapContextMenu"
        />
        <MindmapImageNodeLayer
          :layout="imageLayout"
          :viewport="viewport"
          :image-nodes="imageNodes"
          :tier="cloudQuotaStore.tier"
          @remove="removeImageNode"
          @error="showNotice('图片节点无法加载')"
        />
        <div class="mm-document-pill" data-testid="mm-document-pill">
          <span class="mm-document-pill-mark" aria-hidden="true">✣</span>
          <span class="mm-document-title">{{ document.title || props.fileName }}</span>
          <span class="mm-document-sheet">{{ sheets.find((sheet) => sheet.id === currentSheetId)?.title }}</span>
          <span class="mm-document-state" :class="{ 'is-dirty': props.isDirty }">
            {{ props.isDirty ? '未保存' : '已保存' }}
          </span>
        </div>
        <div class="mm-canvas-hud" data-testid="mm-canvas-hud" role="group" aria-label="画布视图">
          <span class="mm-stats">
            {{ rows.length }} 个节点 · {{ Math.round(viewport.zoom * 100) }}%<span v-if="descendantsOfSelected"> · 选中含 {{ descendantsOfSelected }} 个子节点</span>
          </span>
          <button type="button" data-testid="mm-hud-fit" title="适配内容" aria-label="适配内容" @click="fitView">适配</button>
          <button type="button" data-testid="mm-hud-zoom-out" title="缩小" aria-label="缩小" @click="zoomOut">−</button>
          <button type="button" data-testid="mm-hud-zoom-in" title="放大" aria-label="放大" @click="zoomIn">＋</button>
          <button type="button" data-testid="mm-hud-reset" title="重置视口" aria-label="重置视口" @click="resetView">重置</button>
        </div>
        <!-- 大纲 / 属性面板由外壳渲染；画布 HUD 直接复用本舞台视口命令。 -->
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
      :error-message="exportError"
      :membership-tier="cloudQuotaStore.tier"
      @close="exportDialogVisible = false; exportError = ''"
      @membership-required="(payload) => emit('membership-required', payload)"
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
  position: absolute;
  z-index: 30;
  top: 50%;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(520px, calc(100% - 40px));
  padding: 14px 18px;
  transform: translate(-50%, -50%);
  border: 1px solid color-mix(in srgb, var(--accent-brand) 55%, var(--border-strong));
  border-radius: 8px;
  color: var(--text-primary);
  background: color-mix(in srgb, var(--panel-elevated) 94%, var(--accent-brand));
  box-shadow: 0 12px 36px color-mix(in srgb, #000 42%, transparent), 0 0 0 9999px color-mix(in srgb, #000 16%, transparent);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  text-align: center;
  pointer-events: none;
}
.mindmap-notice-icon {
  display: grid;
  flex: 0 0 24px;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: var(--panel-elevated);
  background: var(--accent-brand);
  font-size: 15px;
  font-weight: 800;
}
.mindmap-workspace {
  position: relative;
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}
.mm-document-pill,
.mm-canvas-hud {
  position: absolute;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid color-mix(in srgb, var(--border-strong) 72%, transparent);
  /* 常规圆角：胶囊（999px）在左右两侧显得过于圆润，改为控件级圆角 */
  border-radius: var(--radius-control, 6px);
  background: color-mix(in srgb, var(--panel-base) 90%, transparent);
  color: var(--text-primary);
  box-shadow: 0 8px 26px rgba(2, 6, 23, .24);
  backdrop-filter: blur(14px) saturate(130%);
}
.mm-document-pill {
  top: 16px;
  left: 18px;
  max-width: min(62%, 520px);
  min-height: 38px;
  padding: 0 14px;
}
.mm-document-pill-mark {
  color: var(--accent-brand);
  font-size: 17px;
}
.mm-document-title {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mm-document-sheet {
  padding-left: 9px;
  border-left: 1px solid var(--border-soft);
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
}
.mm-document-state {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--state-success);
  font-size: 11px;
  white-space: nowrap;
}
.mm-document-state::before {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  content: '';
}
.mm-document-state.is-dirty { color: var(--state-warning); }
.mm-canvas-hud {
  right: 20px;
  bottom: 18px;
  min-height: 42px;
  padding: 4px 7px 4px 13px;
}
.mm-stats {
  padding-right: 5px;
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
}
.mm-canvas-hud button {
  min-width: 30px;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-xs, 4px);
  background: transparent;
  color: var(--text-secondary);
  font: 600 12px var(--font-ui);
  cursor: pointer;
}
.mm-canvas-hud button:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
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
.mm-sheet-tabs { display: flex; align-items: center; gap: 6px; }
.mm-sheet-input {
  width: 140px;
  padding: 4px 10px;
  border: 1px solid var(--accent-brand);
  border-radius: var(--radius-control);
  background: var(--panel-elevated);
  color: var(--text-primary);
  font: 12px var(--font-ui);
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
@media (max-width: 760px) {
  .mm-document-pill { top: 10px; left: 10px; max-width: calc(100% - 20px); }
  .mm-canvas-hud { right: 10px; bottom: 10px; gap: 2px; }
  .mm-stats { display: none; }
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
