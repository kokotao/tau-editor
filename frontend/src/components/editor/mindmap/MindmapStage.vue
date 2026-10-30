<script setup lang="ts">
/**
 * MindmapStage（思维导图 阶段 2：画布 + 大纲外壳）
 *
 * 职责：
 * 1. 组装工具栏、SVG 画布与大纲面板，统一承载编辑命令、键盘操作与确认流程；
 * 2. 画布与大纲共享同一选中态（store.selectedTopicId），实现双向同步；
 * 3. 视口（平移/缩放/适配）由画布发出、写回 store，不进入文档历史与 dirty；
 * 4. 删除含子树先确认、中心主题删除走「重置」、损坏文件安全失败；
 * 5. 每次成功编辑把序列化 JSON 通过 change 事件交给标签管线。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useMindmapStore } from '@/stores/mindmap';
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
import type { MindMapLayoutMode, MindmapOutlineRow } from '@/types/mindmap';
import type { TabDocumentKind } from '@/stores/tabs';
import MindmapCanvas from './MindmapCanvas.vue';
import MindmapOutlinePanel from './MindmapOutlinePanel.vue';
import MindmapPropertiesPanel from './MindmapPropertiesPanel.vue';
import { expandAncestors, searchMindmap } from '@/services/mindmapSearchService';
import MindmapImportPreviewDialog from './MindmapImportPreviewDialog.vue';
import MindmapExportDialog from './MindmapExportDialog.vue';
import {
  MINDMAP_EXPORT_FORMATS,
  buildExportFileName,
  exportMindmapText,
  previewMindmapImport,
  type MindmapExportFormatId,
  type MindmapImportPreview,
} from '@/services/mindmap/importExportService';
import { exportMindmapPng } from '@/services/mindmapSvgService';
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
const showOutline = ref(true);

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

/* 阶段 4：属性面板与大纲搜索 */
const propertiesVisible = ref(false);
const searchQuery = ref('');

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

/** 搜索命中的节点 id 集合（无查询时为空）。 */
const searchMatchIds = computed<Set<string>>(() => {
  const doc = document.value;
  const query = searchQuery.value.trim();
  if (!doc || !query) return new Set<string>();
  return new Set(searchMindmap(doc, query).map((item) => item.id));
});

const isSearching = computed(() => searchQuery.value.trim().length > 0);

/** 传给大纲面板的高亮 id 列表（Set 转数组）。 */
const searchMatchIdList = computed<string[]>(() => [...searchMatchIds.value]);

const rows = computed<MindmapOutlineRow[]>(() => {
  const doc = document.value;
  if (!doc) return [];

  const searching = isSearching.value;
  // 搜索时只保留「命中节点 + 其祖先」，并强制展开，保证命中项可见。
  const visibleIds: Set<string> | null = searching
    ? new Set<string>([
        ...searchMatchIds.value,
        ...expandAncestors(doc, [...searchMatchIds.value]),
      ])
    : null;

  const result: MindmapOutlineRow[] = [];
  const walk = (topicId: string, depth: number) => {
    const topic = doc.topics[topicId];
    if (!topic) return;
    if (visibleIds && !visibleIds.has(topic.id)) return;
    const childIds = topic.childIds ?? [];
    const hasChildren = childIds.length > 0;
    // 搜索期间忽略折叠标记，确保命中分支可展开查看。
    const collapsed = !searching && Boolean(topic.collapsed) && hasChildren;
    result.push({
      id: topic.id,
      text: topic.text ?? '',
      depth,
      hasChildren,
      collapsed,
      childCount: childIds.length,
    });
    if (collapsed) return;
    for (const childId of childIds) walk(childId, depth + 1);
  };
  walk(doc.rootTopicId, 0);
  return result;
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

/* ------------------------------- 属性面板 / 搜索 ------------------------------- */

/** 属性面板的数据源：只暴露面板需要的字段，避免面板直接持有文档。 */
const selectedTopicForPanel = computed(() => {
  const doc = document.value;
  const id = selectedTopicId.value;
  if (!doc || !id) return null;
  const topic = doc.topics[id];
  if (!topic) return null;
  return {
    id: topic.id,
    text: topic.text ?? '',
    notes: topic.notes,
    link: topic.link,
    labels: topic.labels,
  };
});

function toggleProperties() {
  propertiesVisible.value = !propertiesVisible.value;
}

function closeProperties() {
  propertiesVisible.value = false;
  void focusStage();
}

/** 属性面板提交：作为可撤销命令写入 store，并回写标签内容。 */
function applyTopicProperties(payload: {
  notes?: string;
  link?: string;
  labels?: string[];
}) {
  const id = selectedTopicId.value;
  if (!id) return;
  const before = store.serialized;
  if (store.updateTopicMeta(id, payload)) {
    emitIfChanged(before);
    showNotice('节点属性已更新');
  }
  void focusStage();
}

function setSearchQuery(value: string) {
  searchQuery.value = value;
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

    if (payload.formatId === 'png') {
      showNotice('正在导出 PNG…');
      const { blob, width, height } = await exportMindmapPng(current, {
        background: payload.background,
        scale: payload.scale,
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await writeMindmapExportFile(path, { kind: 'binary', bytes });
      showNotice(`已导出 PNG（${width}×${height}）`);
    } else {
      const result = exportMindmapText(payload.formatId, current);
      if (!result.ok) throw new Error(result.error?.message ?? '导出失败');
      await writeMindmapExportFile(path, { kind: 'text', text: result.output });
      showNotice(result.lossy && result.lossy.length > 0
        ? `已导出（${result.lossy.length} 项有损）`
        : '已导出');
    }
    exportDialogVisible.value = false;
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '导出失败');
  } finally {
    exportBusy.value = false;
  }
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
        原文件未被改动。可尝试从资源管理器重新打开，或先用文本编辑器检查 .taumap 内容。
      </div>
    </div>

    <template v-else-if="document">
      <div class="mindmap-toolbar" data-testid="mindmap-toolbar">
        <button type="button" class="mm-btn" data-testid="mm-add-child" :disabled="!selectedTopicId" @click="addChild">
          子主题
        </button>
        <button type="button" class="mm-btn" data-testid="mm-add-sibling" :disabled="!selectedTopicId" @click="addSibling">
          同级
        </button>
        <button type="button" class="mm-btn" data-testid="mm-rename" :disabled="!selectedTopicId" @click="selectedTopicId && startRename(selectedTopicId)">
          改名
        </button>
        <button type="button" class="mm-btn" data-testid="mm-duplicate" :disabled="!selectedTopicId" @click="duplicateSelected">
          复制
        </button>
        <button type="button" class="mm-btn danger" data-testid="mm-delete" :disabled="!selectedTopicId" @click="requestDelete">
          删除
        </button>
        <span class="mm-divider" aria-hidden="true"></span>
        <button type="button" class="mm-btn" data-testid="mm-move-up" :disabled="!selectedTopicId" title="上移（Alt+↑）" @click="moveSelected(-1)">
          ↑
        </button>
        <button type="button" class="mm-btn" data-testid="mm-move-down" :disabled="!selectedTopicId" title="下移（Alt+↓）" @click="moveSelected(1)">
          ↓
        </button>
        <span class="mm-divider" aria-hidden="true"></span>
        <button type="button" class="mm-btn" data-testid="mm-undo" :disabled="!canUndo" title="撤销（Ctrl+Z）" @click="doUndo">
          撤销
        </button>
        <button type="button" class="mm-btn" data-testid="mm-redo" :disabled="!canRedo" title="重做（Ctrl+Shift+Z）" @click="doRedo">
          重做
        </button>
        <span class="mm-divider" aria-hidden="true"></span>
        <button type="button" class="mm-btn" data-testid="mm-fit" title="适配内容" @click="canvasRef?.fitView()">
          适配
        </button>
        <button type="button" class="mm-btn" data-testid="mm-zoom-in" title="放大" @click="canvasRef?.zoomIn()">+</button>
        <button type="button" class="mm-btn" data-testid="mm-zoom-out" title="缩小" @click="canvasRef?.zoomOut()">−</button>
        <button type="button" class="mm-btn" data-testid="mm-reset-view" title="重置视口" @click="canvasRef?.resetView()">
          重置视口
        </button>
        <span class="mm-divider" aria-hidden="true"></span>
        <!-- 结构布局切换（阶段 4A）：当前模式高亮，点击记录为可撤销命令 -->
        <span class="mm-layout-group" role="group" aria-label="布局模式">
          <button
            v-for="option in layoutModeOptions"
            :key="option.id"
            type="button"
            class="mm-btn"
            :class="{ 'is-active': layoutMode === option.id }"
            :data-testid="`mm-layout-${option.id}`"
            :aria-pressed="layoutMode === option.id"
            :title="option.title"
            @click="runLayoutCommand(option.id)"
          >{{ option.label }}</button>
        </span>
        <span class="mm-divider" aria-hidden="true"></span>
        <button type="button" class="mm-btn" data-testid="mm-reset" @click="requestReset">重置</button>
        <span class="mm-divider" aria-hidden="true"></span>
        <button type="button" class="mm-btn" data-testid="mm-import" :disabled="importBusy" @click="handleImportPick">
          导入
        </button>
        <button type="button" class="mm-btn" data-testid="mm-export" :disabled="exportBusy" @click="openExportDialog">
          导出
        </button>
        <button
          type="button"
          class="mm-btn"
          data-testid="mm-toggle-outline"
          :aria-pressed="showOutline"
          @click="showOutline = !showOutline"
        >
          大纲{{ showOutline ? '开' : '关' }}
        </button>
        <button
          type="button"
          class="mm-btn"
          data-testid="mm-properties-toggle"
          :aria-pressed="propertiesVisible"
          @click="toggleProperties"
        >
          属性{{ propertiesVisible ? '开' : '关' }}
        </button>
        <span class="mm-spacer"></span>
        <span class="mm-stats">
          {{ rows.length }} 个可见节点<span v-if="isSearching"> · 命中 {{ searchMatchIdList.length }}</span> · {{ Math.round(viewport.zoom * 100) }}%<span v-if="descendantsOfSelected"> · 选中含 {{ descendantsOfSelected }} 个子节点</span>
        </span>
      </div>

      <div v-if="notice" class="mindmap-notice" role="status" data-testid="mindmap-notice">{{ notice }}</div>

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
        />
        <MindmapOutlinePanel
          v-if="showOutline"
          :rows="rows"
          :selected-id="selectedTopicId"
          :editing-id="editingTopicId"
          :editing-text="editingText"
          :search-query="searchQuery"
          :match-ids="searchMatchIdList"
          @select="selectTopic"
          @toggle="toggleCollapse"
          @start-rename="startRename"
          @commit-rename="commitRename"
          @cancel-rename="cancelRename"
          @update:editing-text="onEditingText"
          @update:search="setSearchQuery"
          @move="onMove"
        />
        <MindmapPropertiesPanel
          v-if="propertiesVisible && selectedTopicForPanel"
          :topic="selectedTopicForPanel"
          @update="applyTopicProperties"
          @close="closeProperties"
        />
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
      </div>
    </template>

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
.mindmap-stage {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--background, #ffffff);
  color: var(--text-primary, #1f2329);
  font-family: var(--font-sans, 'Manrope', 'Segoe UI', sans-serif);
  overflow: hidden;
  outline: none;
}
.mindmap-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border, #e5e7eb);
  flex-wrap: wrap;
}
.mm-btn {
  padding: 5px 10px;
  border-radius: 7px;
  border: 1px solid var(--border, #d8dee9);
  background: var(--surface, #fff);
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}
.mm-btn:hover:not(:disabled) { background: var(--hover, rgba(74, 144, 226, 0.08)); }
.mm-btn:disabled { opacity: 0.45; cursor: default; }
.mm-btn.danger { border-color: var(--danger-border, #f0b7b7); color: var(--danger, #d94f4f); }
.mm-divider { width: 1px; height: 18px; background: var(--border, #e5e7eb); }
/* 布局模式按钮组：当前模式用强调色高亮 */
.mm-layout-group { display: flex; gap: 4px; }
.mm-btn.is-active {
  border-color: var(--accent, #4a90e2);
  background: var(--accent-soft, rgba(74, 144, 226, 0.14));
  color: var(--accent, #4a90e2);
  font-weight: 600;
}
.mm-spacer { flex: 1; }
.mm-stats { font-size: 12px; opacity: 0.6; }
.mindmap-notice {
  padding: 6px 14px;
  font-size: 12px;
  background: var(--notice-bg, rgba(74, 144, 226, 0.1));
  border-bottom: 1px solid var(--border, #e5e7eb);
}
.mindmap-workspace {
  flex: 1;
  display: flex;
  min-height: 0;
}
.mindmap-confirm {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid var(--border, #e5e7eb);
  background: var(--confirm-bg, rgba(217, 79, 79, 0.06));
  font-size: 12px;
}
.mindmap-confirm-text { flex: 1; }
.mindmap-stage-note {
  padding: 8px 14px;
  border-top: 1px solid var(--border, #e5e7eb);
  font-size: 12px;
  opacity: 0.6;
}
.mindmap-error { padding: 32px; text-align: center; }
.mindmap-error-title { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
.mindmap-error-message { font-size: 13px; color: var(--danger, #d94f4f); margin-bottom: 8px; }
.mindmap-error-hint { font-size: 12px; opacity: 0.6; }
.mindmap-external-notice { padding: 24px; text-align: center; }
.mindmap-external-title { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
.mindmap-external-desc { font-size: 13px; opacity: 0.7; max-width: 520px; margin: 0 auto; line-height: 1.6; }
</style>