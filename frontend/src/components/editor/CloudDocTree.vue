<template>
  <div class="cloud-doc-tree" :class="{ 'cloud-doc-tree--compact': compact }">
    <p v-if="notice" class="cloud-doc-tree__notice" data-testid="cloud-browser-notice">{{ notice }}</p>

    <ul class="cloud-doc-tree__list" data-testid="cloud-browser-tree" role="tree">
      <li
        v-for="row in visibleRows"
        :key="row.node.key"
        class="cloud-doc-tree__row"
        :class="[
          `cloud-doc-tree__row--${row.node.kind}`,
          { 'is-drop-target': dropTargetKey === row.node.key },
        ]"
        :data-testid="row.node.kind === 'dir' ? 'cloud-browser-dir' : 'cloud-browser-file'"
        :data-cloud-path="row.node.path"
        :style="{ paddingLeft: `${row.depth * 14 + 4}px` }"
        role="treeitem"
        :draggable="row.node.kind === 'file'"
        @dblclick="row.node.kind === 'file' ? openDoc(row.node) : toggleDir(row.node.key)"
        @contextmenu.prevent="openRowMenu(row, $event)"
        @dragstart="handleDragStart(row, $event)"
        @dragover="handleDragOver(row, $event)"
        @dragleave="handleDragLeave(row)"
        @drop="handleDrop(row, $event)"
      >
        <button
          v-if="row.node.kind === 'dir'"
          type="button"
          class="cloud-doc-tree__toggle"
          data-testid="cloud-browser-toggle"
          :aria-expanded="!collapsedKeys.has(row.node.key)"
          @click="toggleDir(row.node.key)"
        >
          {{ collapsedKeys.has(row.node.key) ? '▸' : '▾' }}
        </button>
        <span v-else class="cloud-doc-tree__toggle cloud-doc-tree__toggle--leaf" aria-hidden="true">·</span>

        <span v-if="row.node.kind === 'file'" class="cloud-doc-tree__type" aria-hidden="true" :data-type="iconForFile(row.node.name)">{{ iconForFile(row.node.name) }}</span>
        <span class="cloud-doc-tree__name" :title="row.node.path">{{ row.node.name }}</span>
        <span v-if="row.node.kind === 'dir'" class="cloud-doc-tree__count">{{ countFiles(row.node) }}</span>

        <span v-if="row.node.kind === 'file' && !compact" class="cloud-doc-tree__meta">
          <span>{{ formatSize(row.node.file?.size ?? 0) }}</span>
          <span>{{ copy.version(row.node.file?.version ?? 0) }}</span>
          <span v-if="row.node.file?.updatedAt">{{ copy.updatedAt(formatTime(row.node.file.updatedAt)) }}</span>
        </span>

        <button
          v-if="row.node.kind === 'file'"
          type="button"
          class="cloud-doc-tree__open"
          data-testid="cloud-browser-open"
          :disabled="busy"
          @click="openDoc(row.node)"
        >
          {{ copy.open }}
        </button>
      </li>
    </ul>

    <div v-if="pendingTarget" class="cloud-doc-tree__confirm" data-testid="cloud-browser-confirm">
      <p class="cloud-doc-tree__confirm-title">{{ copy.confirmTitle }}</p>
      <p class="cloud-doc-tree__confirm-hint">{{ copy.confirmHint(pendingTarget.cloudPath) }}</p>
      <div class="cloud-doc-tree__confirm-actions">
        <button
          type="button"
          class="cloud-doc-tree__button"
          data-testid="cloud-browser-confirm-overwrite"
          :disabled="busy"
          @click="confirmOverwrite()"
        >
          {{ copy.overwrite }}
        </button>
        <button
          type="button"
          class="cloud-doc-tree__button"
          data-testid="cloud-browser-confirm-saveas"
          :disabled="busy"
          @click="confirmSaveAs()"
        >
          {{ copy.saveAs }}
        </button>
        <button
          type="button"
          class="cloud-doc-tree__button"
          data-testid="cloud-browser-confirm-cancel"
          :disabled="busy"
          @click="cancelOpen()"
        >
          {{ copy.cancel }}
        </button>
      </div>
    </div>

    <!-- 右键菜单：Teleport 到 body，避免被侧栏/面板 overflow 裁剪导致点击热区错位 -->
    <Teleport to="body">
    <div
      v-if="rowMenu.visible && rowMenu.node"
      class="cloud-doc-tree__menu"
      :style="{ left: `${rowMenu.x}px`, top: `${rowMenu.y}px` }"
      :data-flip-x="rowMenu.flipX ? 'left' : 'right'"
      :data-flip-y="rowMenu.flipY ? 'up' : 'down'"
      data-testid="cloud-doc-tree-menu"
      @mousedown.stop
      @click.stop
    >
      <template v-if="rowMenu.node.kind === 'file'">
        <button type="button" class="cloud-doc-tree__menu-item" data-testid="cloud-doc-menu-open" @click.stop="menuOpenDoc()">{{ panel.menuOpen }}</button>
        <button type="button" class="cloud-doc-tree__menu-item" data-testid="cloud-doc-menu-sync" @click.stop="menuDocAction('sync')">{{ panel.menuSync }}</button>
        <button type="button" class="cloud-doc-tree__menu-item" data-testid="cloud-doc-menu-share" @click.stop="menuDocAction('share')">{{ panel.menuShare }}</button>
        <button type="button" class="cloud-doc-tree__menu-item" data-testid="cloud-doc-menu-properties" @click.stop="menuOpenProperties()">{{ panel.menuProperties }}</button>
        <button type="button" class="cloud-doc-tree__menu-item" data-testid="cloud-doc-menu-history" @click.stop="menuOpenHistory()">{{ panel.menuHistory }}</button>
        <button type="button" class="cloud-doc-tree__menu-item" data-testid="cloud-doc-menu-move" @click.stop="menuOpenMove()">{{ panel.menuMoveTo }}</button>
        <div class="cloud-doc-tree__menu-divider"></div>
        <button type="button" class="cloud-doc-tree__menu-item cloud-doc-tree__menu-item--danger" data-testid="cloud-doc-menu-delete" @click.stop="menuDeleteDoc()">{{ panel.menuDelete }}</button>
      </template>
      <template v-else>
        <button
          type="button"
          class="cloud-doc-tree__menu-item"
          data-testid="cloud-category-menu-new"
          :disabled="!canAddChild(rowMenu.node)"
          :title="canAddChild(rowMenu.node) ? '' : panel.maxDepthReached"
          @click.stop="menuNewSubCategory()"
        >
          {{ panel.newSubCategory }}
        </button>
        <button type="button" class="cloud-doc-tree__menu-item" data-testid="cloud-category-menu-rename" @click.stop="menuRenameCategory()">{{ panel.renameCategory }}</button>
        <button
          type="button"
          class="cloud-doc-tree__menu-item cloud-doc-tree__menu-item--danger"
          data-testid="cloud-category-menu-delete"
          :disabled="!categoryIdOf(rowMenu.node)"
          @click.stop="menuDeleteCategory()"
        >
          {{ panel.deleteCategory }}
        </button>
      </template>
    </div>

    </Teleport>

    <!-- 移动到分类 -->
    <div
      v-if="moveMenuVisible && moveTarget"
      class="cloud-doc-tree__menu cloud-doc-tree__menu--scroll"
      :style="{ left: `${rowMenu.x}px`, top: `${rowMenu.y}px` }"
      data-testid="cloud-doc-move-menu"
      @click.stop
    >
      <button type="button" class="cloud-doc-tree__menu-item" data-testid="cloud-doc-move-root" @click="moveTo('')">{{ panel.moveRoot }}</button>
      <button
        v-for="option in categoryRows"
        :key="option.id"
        type="button"
        class="cloud-doc-tree__menu-item"
        :data-testid="`cloud-doc-move-${option.id}`"
        :style="{ paddingLeft: `${8 + (option.depth - 1) * 12}px` }"
        @click="moveTo(option.id)"
      >
        {{ option.name }}
      </button>
    </div>

    <Teleport to="body">
    <!-- 分类新建/重命名：内联卡片面板 -->
    <div
      v-if="prompt.visible"
      class="cloud-doc-tree__prompt"
      data-testid="cloud-category-prompt"
      @keydown.esc.prevent="closePrompt()"
    >
      <p class="cloud-doc-tree__prompt-title">
        {{ prompt.mode === 'create' ? (prompt.parentName ? `${panel.newSubCategory} · ${prompt.parentName}` : panel.newCategory) : panel.renameCategory }}
      </p>
      <input
        ref="promptInputRef"
        v-model="prompt.name"
        class="cloud-doc-tree__prompt-input"
        data-testid="cloud-category-name-input"
        type="text"
        :placeholder="panel.categoryNamePlaceholder"
        @keydown.enter.prevent="submitPrompt()"
      />
      <p v-if="prompt.error" class="cloud-doc-tree__prompt-error" data-testid="cloud-category-prompt-error">{{ prompt.error }}</p>
      <div class="cloud-doc-tree__prompt-actions">
        <button type="button" class="cloud-doc-tree__button" data-testid="cloud-category-prompt-cancel" @click="closePrompt()">{{ panel.cancel }}</button>
        <button type="button" class="cloud-doc-tree__button" data-testid="cloud-category-prompt-confirm" :disabled="prompt.busy" @click="submitPrompt()">{{ panel.confirm }}</button>
      </div>
    </div>

    <!-- 分类删除确认 -->
    <div v-if="categoryDeleteTarget" class="cloud-doc-tree__prompt" data-testid="cloud-category-delete-confirm">
      <p class="cloud-doc-tree__prompt-title">{{ panel.deleteCategory }}</p>
      <p class="cloud-doc-tree__prompt-error">{{ panel.deleteCategoryConfirm }}</p>
      <div class="cloud-doc-tree__prompt-actions">
        <button type="button" class="cloud-doc-tree__button" data-testid="cloud-category-delete-cancel" @click="categoryDeleteTarget = null">{{ panel.cancel }}</button>
        <button type="button" class="cloud-doc-tree__button" data-testid="cloud-category-delete-confirm-btn" :disabled="busy" @click="confirmDeleteCategory()">{{ panel.confirm }}</button>
      </div>
    </div>

    <!-- 跨工作区/无法映射：只读预览 或 另存为 -->
    <div v-if="openChoice.visible" class="cloud-doc-tree__prompt" data-testid="cloud-doc-choice-dialog">
      <p class="cloud-doc-tree__prompt-title">{{ panel.choiceTitle }}</p>
      <p class="cloud-doc-tree__prompt-hint">{{ panel.choiceHint }}</p>
      <div class="cloud-doc-tree__prompt-actions">
        <button type="button" class="cloud-doc-tree__button" data-testid="cloud-doc-choice-cancel" @click="cancelChoice()">{{ panel.cancel }}</button>
        <button type="button" class="cloud-doc-tree__button" data-testid="cloud-doc-choice-save-as" @click="chooseSaveAs()">{{ panel.choiceSaveAs }}</button>
        <button type="button" class="cloud-doc-tree__button" data-testid="cloud-doc-choice-preview" @click="choosePreview()">{{ panel.choicePreview }}</button>
      </div>
    </div>

    <!-- 只读预览 -->
    <div v-if="previewState.visible" class="cloud-doc-tree__preview" data-testid="cloud-doc-preview-dialog">
      <header class="cloud-doc-tree__preview-header">
        <span class="cloud-doc-tree__preview-title">{{ panel.previewTitle(previewState.name) }}</span>
        <button type="button" class="cloud-doc-tree__preview-close" data-testid="cloud-doc-preview-close" @click="previewState.visible = false">×</button>
      </header>
      <pre v-if="previewState.kind === 'text'" class="cloud-doc-tree__preview-body" data-testid="cloud-doc-preview-content">{{ previewState.content }}</pre>
      <p v-else class="cloud-doc-tree__preview-hint" data-testid="cloud-doc-preview-hint">{{ previewState.hint }}</p>
    </div>

    <!-- 删除确认 -->
    <div v-if="deleteTarget" class="cloud-doc-tree__prompt" data-testid="cloud-doc-delete-confirm">
      <p class="cloud-doc-tree__prompt-title">{{ panel.menuDelete }}</p>
      <p class="cloud-doc-tree__prompt-error">{{ panel.deleteConfirm }}</p>
      <div class="cloud-doc-tree__prompt-actions">
        <button type="button" class="cloud-doc-tree__button" data-testid="cloud-doc-delete-cancel" @click="deleteTarget = null">{{ panel.cancel }}</button>
        <button type="button" class="cloud-doc-tree__button" data-testid="cloud-doc-delete-confirm-btn" :disabled="busy" @click="confirmDeleteDoc()">{{ panel.confirm }}</button>
      </div>
    </div>

    </Teleport>

    <VersionHistoryDialog
      :visible="historyVisible"
      :file-id="historyTarget?.file?.fileId ?? null"
      :file-name="historyTarget?.name ?? ''"
      :current-version="historyTarget?.file?.version ?? null"
      @close="historyVisible = false"
      @restored="emit('changed')"
    />

    <DocPropertiesDialog
      :visible="propsVisible"
      :doc="propsTarget?.file ?? null"
      @close="propsVisible = false"
      @saved="emit('changed')"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @description 云端文档树（面板与左侧资源管理器共用）：折叠行渲染 + 打开流程（已同步直开 / 落盘后开 / 冲突确认）。
 * 路径映射与可打开性判定在 Rust（cloud_doc_open_target），这里只编排。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 15:20
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { save as saveFileDialog } from '@tauri-apps/plugin-dialog';
import { cloudCommands, fileCommands, type CloudCategoryNode, type CloudDocOpenTarget } from '@/lib/tauri';
import { formatCloudDocSize, type CloudDocTreeNode } from '@/services/cloudBrowserService';
import { deleteCloudDoc, getCloudDoc, normalizeCloudError } from '@/services/cloudDocService';
import { useCenterToastStore } from '@/stores/centerToast';
import {
  canAddChildCategory,
  createCategory,
  deleteCategory,
  fetchManagedCategories,
  flattenCategoryTree,
  moveDocumentToCategory,
  renameCategory,
  type FlatCategory,
} from '@/services/cloudCategoryService';
import { getCloudDocPanelI18n } from '@/i18n/ui';
import VersionHistoryDialog from './VersionHistoryDialog.vue';
import DocPropertiesDialog from './DocPropertiesDialog.vue';
import { getCloudDocBrowserI18n } from '@/i18n/ui';
import { useSettingsStore } from '@/stores/settings';
import { useWorkspaceStore } from '@/stores/workspace';

const props = withDefaults(defineProps<{
  nodes: CloudDocTreeNode[];
  /** 侧栏紧凑模式：隐藏大小/版本/时间列 */
  compact?: boolean;
}>(), { compact: false });

const emit = defineEmits<{
  'open-file': [path: string];
  written: [];
  /** 云端数据发生变化（删除/移动/属性/历史恢复），宿主应刷新树 */
  changed: [];
  /** 文档级动作交给宿主处理（同步/分享） */
  'doc-action': [action: 'sync' | 'share', node: CloudDocTreeNode];
}>();

const settingsStore = useSettingsStore();
const workspaceStore = useWorkspaceStore();
const copy = computed(() => getCloudDocBrowserI18n(settingsStore.uiLanguage));

const collapsedKeys = ref(new Set<string>());
const busy = ref(false);
const notice = ref('');
const pendingTarget = ref<CloudDocOpenTarget | null>(null);
const pendingNode = ref<CloudDocTreeNode | null>(null);

interface VisibleRow {
  node: CloudDocTreeNode;
  depth: number;
}

const visibleRows = computed<VisibleRow[]>(() => {
  const rows: VisibleRow[] = [];
  const walk = (nodes: CloudDocTreeNode[], depth: number) => {
    for (const node of nodes) {
      rows.push({ node, depth });
      if (node.kind === 'dir' && !collapsedKeys.value.has(node.key)) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(props.nodes, 0);
  return rows;
});

function toggleDir(key: string): void {
  const next = new Set(collapsedKeys.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  collapsedKeys.value = next;
}

function formatSize(bytes: number): string {
  return formatCloudDocSize(bytes);
}

function formatTime(value: string | null): string {
  if (!value) {
    return '';
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  return new Date(timestamp).toLocaleString(settingsStore.uiLanguage);
}

async function openDoc(node: CloudDocTreeNode): Promise<void> {
  const file = node.file;
  if (!file || busy.value) {
    return;
  }
  const workspaceRoot = workspaceStore.currentWorkspacePath ?? '';
  if (!workspaceRoot) {
    notice.value = copy.value.workspaceRequired;
    return;
  }

  busy.value = true;
  notice.value = '';
  try {
    const target = await cloudCommands.openTarget({
      workspaceRoot,
      workspaceName: workspaceStore.currentWorkspaceName ?? '',
      cloudPath: node.path,
      remoteHash: file.contentHash ?? null,
    });

    if (target.action === 'rejected') {
      // 不在当前工作区 / 路径无法映射：不再直接报错，改为「只读预览 / 另存为 / 取消」
      if (target.reasonCode === 'CLOUD_PATH_NOT_IN_WORKSPACE') {
        openChoice.value = { visible: true, node };
        return;
      }
      notice.value = target.reason || copy.value.openFailed(target.reasonCode ?? 'unsupported');
      return;
    }
    if (target.action === 'openExisting') {
      emit('open-file', target.absolutePath);
      return;
    }
    if (target.action === 'confirmOverwrite') {
      pendingTarget.value = target;
      pendingNode.value = node;
      return;
    }
    await downloadAndOpen(node, target.absolutePath);
  } catch (openError) {
    notice.value = copy.value.openFailed(normalizeCloudError(openError).message);
  } finally {
    busy.value = false;
  }
}

async function downloadAndOpen(node: CloudDocTreeNode, absolutePath: string): Promise<void> {
  const fileId = node.file?.fileId;
  if (typeof fileId !== 'number') {
    notice.value = copy.value.openFailed(copy.value.noContent);
    return;
  }
  const detail = await cloudCommands.get(fileId);
  if (detail.content === null || detail.content === undefined) {
    notice.value = copy.value.noContent;
    return;
  }
  await fileCommands.writeFile(absolutePath, detail.content);
  // 文件是新写到磁盘上的：通知上层刷新工作区文件树，别让用户手动刷新才看得到
  emit('written');
  emit('open-file', absolutePath);
}

async function confirmOverwrite(): Promise<void> {
  const target = pendingTarget.value;
  const node = pendingNode.value;
  if (!target || !node || busy.value) {
    return;
  }
  busy.value = true;
  try {
    await downloadAndOpen(node, target.absolutePath);
    pendingTarget.value = null;
    pendingNode.value = null;
  } catch (openError) {
    notice.value = copy.value.openFailed(normalizeCloudError(openError).message);
  } finally {
    busy.value = false;
  }
}

async function confirmSaveAs(): Promise<void> {
  const target = pendingTarget.value;
  const node = pendingNode.value;
  if (!target || !node || busy.value) {
    return;
  }
  busy.value = true;
  try {
    const chosen = await saveFileDialog({ defaultPath: target.absolutePath });
    if (!chosen) {
      return;
    }
    const path = Array.isArray(chosen) ? chosen[0] : chosen;
    if (!path) {
      return;
    }
    await downloadAndOpen(node, path);
    pendingTarget.value = null;
    pendingNode.value = null;
    notice.value = copy.value.saveAsDone(path);
  } catch (openError) {
    notice.value = copy.value.openFailed(normalizeCloudError(openError).message);
  } finally {
    busy.value = false;
  }
}

function cancelOpen(): void {
  pendingTarget.value = null;
  pendingNode.value = null;
  notice.value = copy.value.cancelled;
}

// ------------------------------------------------------------------
// 右键菜单 / 拖拽移动 / 分类管理
// ------------------------------------------------------------------
const panel = computed(() => getCloudDocPanelI18n(settingsStore.uiLanguage));

const rowMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  node: CloudDocTreeNode | null;
  flipX: boolean;
  flipY: boolean;
}>({
  visible: false,
  x: 0,
  y: 0,
  node: null,
  flipX: false,
  flipY: false,
});
const moveMenuVisible = ref(false);
const moveTarget = ref<CloudDocTreeNode | null>(null);
const deleteTarget = ref<CloudDocTreeNode | null>(null);
const categoryDeleteTarget = ref<CloudDocTreeNode | null>(null);
const centerToast = useCenterToastStore();
/** 跨工作区/路径无法映射时的选择弹层 */
const openChoice = ref<{ visible: boolean; node: CloudDocTreeNode | null }>({ visible: false, node: null });
/** 只读预览状态 */
const previewState = ref<{
  visible: boolean;
  name: string;
  content: string;
  kind: 'text' | 'hint';
  hint: string;
}>({ visible: false, name: '', content: '', kind: 'text', hint: '' });
const historyVisible = ref(false);
const historyTarget = ref<CloudDocTreeNode | null>(null);
const propsVisible = ref(false);
const propsTarget = ref<CloudDocTreeNode | null>(null);
const dropTargetKey = ref('');
const dragSource = ref<CloudDocTreeNode | null>(null);
const categoryRows = ref<FlatCategory[]>([]);
const categoryTree = ref<CloudCategoryNode[]>([]);
const promptInputRef = ref<HTMLInputElement | null>(null);
const prompt = ref<{
  visible: boolean;
  mode: 'create' | 'rename';
  name: string;
  parentId: string | null;
  parentName: string;
  id: string | null;
  busy: boolean;
  error: string;
}>({ visible: false, mode: 'create', name: '', parentId: null, parentName: '', id: null, busy: false, error: '' });

/** 分类节点 key → 分类 id（`cat:<id>`）。 */
/** 文件类型徽标（md / 代码 / 图片 / Office / 其他）。 */
function iconForFile(name: string): string {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  if (['md', 'markdown', 'mdx'].includes(ext)) return 'MD';
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'vue', 'json', 'yaml', 'yml', 'toml', 'sh'].includes(ext)) return '</>';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) return 'IMG';
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'DOC';
  return '·';
}

/** 目录下文件数量（含后代）。 */
function countFiles(node: CloudDocTreeNode): number {
  if (node.kind === 'file') {
    return 1;
  }
  return node.children.reduce((total, child) => total + countFiles(child), 0);
}

function categoryIdOf(node: CloudDocTreeNode | null): string | null {
  if (!node || node.kind !== 'dir') {
    return null;
  }
  return node.key.startsWith('cat:') ? node.key.slice(4) : null;
}

async function refreshCategoryTree(): Promise<void> {
  const outcome = await fetchManagedCategories();
  categoryTree.value = outcome.ok ? outcome.data : [];
  categoryRows.value = flattenCategoryTree(categoryTree.value);
}

function canAddChild(node: CloudDocTreeNode | null): boolean {
  return canAddChildCategory(categoryTree.value, categoryIdOf(node));
}

function closeMenus(): void {
  rowMenu.value.visible = false;
  moveMenuVisible.value = false;
}

const MENU_WIDTH = 208;
const MENU_ITEM_HEIGHT = 34;

function openRowMenu(row: { node: CloudDocTreeNode }, event: MouseEvent): void {
  const viewportWidth = window.innerWidth || 1024;
  const viewportHeight = window.innerHeight || 768;
  const itemCount = row.node.kind === 'file' ? 7 : 4;
  const menuHeight = itemCount * MENU_ITEM_HEIGHT + 18;
  // 右侧/底部空间不足时翻转，保证浮层不出视口（点击热区跟随视觉位置）
  const flipX = event.clientX + MENU_WIDTH + 8 > viewportWidth;
  const flipY = event.clientY + menuHeight + 8 > viewportHeight;
  const x = flipX ? Math.max(8, event.clientX - MENU_WIDTH) : Math.max(8, event.clientX);
  const y = flipY ? Math.max(8, event.clientY - menuHeight) : Math.max(8, event.clientY);
  rowMenu.value = { visible: true, x, y, node: row.node, flipX, flipY };
  moveMenuVisible.value = false;
  if (row.node.kind === 'dir') {
    void refreshCategoryTree();
  }
}

function menuOpenDoc(): void {
  const node = rowMenu.value.node;
  closeMenus();
  if (node) {
    void openDoc(node);
  }
}

function menuDocAction(action: 'sync' | 'share'): void {
  const node = rowMenu.value.node;
  closeMenus();
  if (node?.kind === 'file') {
    emit('doc-action', action, node);
  }
}

function menuOpenProperties(): void {
  propsTarget.value = rowMenu.value.node;
  propsVisible.value = true;
  closeMenus();
}

function menuOpenHistory(): void {
  historyTarget.value = rowMenu.value.node;
  historyVisible.value = true;
  closeMenus();
}

async function menuOpenMove(): Promise<void> {
  // 只保留坐标、先收起右键菜单：两层浮层同坐标叠着时，Teleport 到 body 的右键菜单
  // 会盖住「移动到分类」列表（点击热区也归它），表现为点了没反应。
  const node = rowMenu.value.node;
  rowMenu.value.visible = false;
  moveTarget.value = node;
  moveMenuVisible.value = true;
  await refreshCategoryTree();
}

/** 移动文档到目标分类（null = 取消分类）；失败提示并保持原状（刷新即回滚）。 */
async function moveDocToCategory(node: CloudDocTreeNode, categoryId: string | null): Promise<void> {
  const fileId = node.file?.fileId;
  if (fileId === undefined) {
    return;
  }
  busy.value = true;
  try {
    const outcome = await moveDocumentToCategory(fileId, categoryId);
    if (!outcome.ok) {
      console.warn('[cloud-doc] 移动分类失败', { kind: outcome.kind, message: outcome.message });
      notice.value = panel.value.moveFailed(outcome.message);
      return;
    }
    notice.value = panel.value.moveDone;
    emit('changed');
  } catch (error) {
    console.warn('[cloud-doc] 移动分类异常', error);
    notice.value = panel.value.moveFailed(error instanceof Error ? error.message : String(error));
  } finally {
    busy.value = false;
  }
}

async function moveTo(categoryId: string): Promise<void> {
  const node = moveTarget.value ?? rowMenu.value.node;
  closeMenus();
  if (!node?.file) {
    return;
  }
  // 雪花 id 直接按字符串下发，避免 number 精度丢失
  await moveDocToCategory(node, categoryId || null);
}

function menuDeleteDoc(): void {
  deleteTarget.value = rowMenu.value.node;
  closeMenus();
}

async function confirmDeleteDoc(): Promise<void> {
  const node = deleteTarget.value;
  deleteTarget.value = null;
  const fileId = node?.file?.fileId;
  if (fileId === undefined) {
    return;
  }
  busy.value = true;
  try {
    const outcome = await deleteCloudDoc(fileId);
    if (!outcome.ok) {
      console.warn('[cloud-doc] 删除失败', { kind: outcome.kind, message: outcome.message });
      notice.value = panel.value.deleteFailed(outcome.message);
      return;
    }
    notice.value = panel.value.deleteDone;
    emit('changed');
  } catch (error) {
    console.warn('[cloud-doc] 删除异常', error);
    notice.value = panel.value.deleteFailed(error instanceof Error ? error.message : String(error));
  } finally {
    busy.value = false;
  }
}

function menuDeleteCategory(): void {
  categoryDeleteTarget.value = rowMenu.value.node;
  closeMenus();
}

async function confirmDeleteCategory(): Promise<void> {
  const node = categoryDeleteTarget.value;
  categoryDeleteTarget.value = null;
  const id = categoryIdOf(node);
  if (!id) {
    return;
  }
  busy.value = true;
  try {
    const outcome = await deleteCategory(id);
    if (!outcome.ok) {
      console.warn('[cloud-category] 删除分类失败', { kind: outcome.kind, message: outcome.message });
      notice.value = outcome.message;
      return;
    }
    await refreshCategoryTree();
    emit('changed');
    centerToast.show(panel.value.deleteCategoryDone, 'success', 3000);
  } catch (error) {
    console.warn('[cloud-category] 删除分类异常', error);
    notice.value = error instanceof Error ? error.message : String(error);
  } finally {
    busy.value = false;
  }
}

/** 应用内预览只支持文本类（markdown/代码/纯文本）。 */
function isPreviewableText(name: string): boolean {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  return [
    'md', 'markdown', 'mdx', 'txt', 'log', 'csv', 'json', 'yaml', 'yml', 'toml', 'ini', 'conf',
    'ts', 'tsx', 'js', 'jsx', 'vue', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'hpp', 'sh',
    'ps1', 'bat', 'sql', 'html', 'css', 'scss', 'xml',
  ].includes(ext);
}

function cancelChoice(): void {
  openChoice.value = { visible: false, node: null };
}

/** 只读预览：不写盘（文本类直接展示，其它类型给提示）。 */
async function choosePreview(): Promise<void> {
  const node = openChoice.value.node;
  openChoice.value = { visible: false, node: null };
  const fileId = node?.file?.fileId;
  if (!node || fileId === undefined) {
    return;
  }
  const outcome = await getCloudDoc(fileId);
  if (!outcome.ok) {
    notice.value = outcome.message;
    return;
  }
  const content = outcome.data.content ?? '';
  if (isPreviewableText(node.name) && content) {
    previewState.value = { visible: true, name: node.name, content, kind: 'text', hint: '' };
    return;
  }
  previewState.value = {
    visible: true,
    name: node.name,
    content: '',
    kind: 'hint',
    hint: panel.value.previewUnsupported,
  };
}

/** 另存为：系统保存对话框选位置后写盘；取消则不写。 */
async function chooseSaveAs(): Promise<void> {
  const node = openChoice.value.node;
  openChoice.value = { visible: false, node: null };
  const fileId = node?.file?.fileId;
  if (!node || fileId === undefined) {
    return;
  }
  const outcome = await getCloudDoc(fileId);
  if (!outcome.ok) {
    notice.value = panel.value.saveAsFailed(outcome.message);
    return;
  }
  const content = outcome.data.content ?? '';
  if (!isPreviewableText(node.name) || !content) {
    notice.value = panel.value.saveAsFailed(panel.value.previewUnsupported);
    return;
  }
  const target = await saveFileDialog({ defaultPath: node.name });
  if (typeof target !== 'string' || !target) {
    return; // 取消：不写盘
  }
  try {
    await fileCommands.writeFile(target, content);
    centerToast.show(panel.value.saveAsDone(target), 'success', 3000);
  } catch (error) {
    notice.value = panel.value.saveAsFailed(error instanceof Error ? error.message : String(error));
  }
}

function openCreateCategory(): void {
  prompt.value = {
    visible: true,
    mode: 'create',
    name: '',
    parentId: null,
    parentName: '',
    id: null,
    busy: false,
    error: '',
  };
  focusPrompt();
  void refreshCategoryTree();
}

function menuNewSubCategory(): void {
  const parentId = categoryIdOf(rowMenu.value.node);
  if (!canAddChildCategory(categoryTree.value, parentId)) {
    notice.value = panel.value.maxDepthReached;
    closeMenus();
    return;
  }
  prompt.value = {
    visible: true,
    mode: 'create',
    name: '',
    parentId,
    parentName: rowMenu.value.node?.name ?? '',
    id: null,
    busy: false,
    error: '',
  };
  focusPrompt();
  closeMenus();
}

function menuRenameCategory(): void {
  const node = rowMenu.value.node;
  prompt.value = {
    visible: true,
    mode: 'rename',
    name: node?.name ?? '',
    parentId: null,
    parentName: '',
    id: categoryIdOf(node),
    busy: false,
    error: '',
  };
  focusPrompt();
  closeMenus();
}

/** 打开面板后自动聚焦输入框（下一帧，等 v-if 渲染完）。 */
function focusPrompt(): void {
  void nextTick(() => {
    promptInputRef.value?.focus();
    promptInputRef.value?.select();
  });
}

function closePrompt(): void {
  prompt.value.visible = false;
  prompt.value.error = '';
}

async function submitPrompt(): Promise<void> {
  const current = prompt.value;
  if (current.busy) {
    return;
  }
  if (!current.name.trim()) {
    current.error = panel.value.categoryNamePlaceholder;
    return;
  }
  current.busy = true;
  current.error = '';
  try {
    const outcome = current.mode === 'rename' && current.id
      ? await renameCategory(current.id, current.name)
      : await createCategory(current.name, current.parentId);
    if (!outcome.ok) {
      // 业务错误（HTTP 200 + body.code）已在 Rust 侧映射；这里展示后端 message 原文
      console.warn('[cloud-category] 保存分类失败', { kind: outcome.kind, message: outcome.message });
      current.error = outcome.message;
      return;
    }
    prompt.value.visible = false;
    // 展开到父分类，便于看到刚建好的子分类
    if (current.mode === 'create' && current.parentId) {
      collapsedKeys.value.delete(`cat:${current.parentId}`);
    }
    await refreshCategoryTree();
    emit('changed');
    centerToast.show(
      current.mode === 'create' ? panel.value.createDone : panel.value.renameDone,
      'success',
      3000,
    );
  } catch (error) {
    // 兜底：IPC/参数异常此前会被静默吞掉（表现为「点确定没反应」）
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[cloud-category] 保存分类异常', error);
    current.error = message;
  } finally {
    prompt.value.busy = false;
  }
}

// ---- 拖拽移动：文档拖到分类节点 ----
function handleDragStart(row: { node: CloudDocTreeNode }, event: DragEvent): void {
  if (row.node.kind !== 'file') {
    return;
  }
  dragSource.value = row.node;
  event.dataTransfer?.setData('text/plain', row.node.path);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
}

function handleDragOver(row: { node: CloudDocTreeNode }, event: DragEvent): void {
  if (row.node.kind !== 'dir' || !dragSource.value) {
    return;
  }
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  dropTargetKey.value = row.node.key;
}

function handleDragLeave(row: { node: CloudDocTreeNode }): void {
  if (dropTargetKey.value === row.node.key) {
    dropTargetKey.value = '';
  }
}

async function handleDrop(row: { node: CloudDocTreeNode }, event: DragEvent): Promise<void> {
  event.preventDefault();
  const target = row.node;
  const source = dragSource.value;
  dragSource.value = null;
  dropTargetKey.value = '';
  if (!source?.file || target.kind !== 'dir') {
    return;
  }
  const categoryId = categoryIdOf(target);
  if (target.key.startsWith('group:') || target.key.startsWith('custom:')) {
    // 「未分类」组可以放回，其余聚合分组不允许直接移动
    if (target.key === 'group:uncategorized') {
      await moveDocToCategory(source, null);
      return;
    }
    notice.value = panel.value.moveFailed(panel.value.maxDepthReached);
    return;
  }
  await moveDocToCategory(source, categoryId || null);
}

/** 外部点击关闭：菜单本身用 mousedown.stop 防误关，这里再按 closest 兜底（菜单已 Teleport 到 body）。 */
function handleDocumentClick(event?: MouseEvent): void {
  const target = event?.target;
  if (target instanceof Element && target.closest('.cloud-doc-tree__menu')) {
    return;
  }
  if (rowMenu.value.visible || moveMenuVisible.value) {
    closeMenus();
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentClick as EventListener);
});
onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentClick as EventListener);
});
defineExpose({ cancelOpen, openCreateCategory });
</script>

<style scoped>
.cloud-doc-tree {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  color: var(--text-primary, #e5e9f0);
}

.cloud-doc-tree__notice {
  margin: 0;
  padding: 6px 8px;
  font-size: 11px;
  color: var(--text-secondary, #a8b3c5);
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  border-radius: var(--radius-control, 5px);
}

.cloud-doc-tree__list {
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.cloud-doc-tree__row {
  /* 统一行高与内边距：侧栏、浏览弹窗共用同一套行样式 */
  min-height: 28px;
  padding-block: 2px;
  gap: 4px;
  border-radius: var(--radius-control, 5px);
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 2px 4px;
  font-size: 12px;
  color: var(--text-secondary, #a8b3c5);
  border-radius: var(--radius-control, 5px);
}

.cloud-doc-tree__row:hover {
  color: var(--text-primary, #e5e9f0);
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
}

.cloud-doc-tree__row--dir {
  color: var(--text-primary, #e5e9f0);
  font-weight: 600;
}

.cloud-doc-tree__toggle {
  width: 14px;
  padding: 0;
  font-size: 10px;
  color: inherit;
  text-align: center;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.cloud-doc-tree__toggle--leaf {
  opacity: 0.45;
  cursor: default;
}

.cloud-doc-tree__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloud-doc-tree__meta {
  display: flex;
  gap: 8px;
  margin-left: auto;
  font-size: 10.5px;
  white-space: nowrap;
  color: var(--text-muted, #75829e);
}

.cloud-doc-tree__menu-item--danger {
  color: var(--state-danger, #dc2626);
}

.cloud-doc-tree__menu-item--danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--state-danger, #dc2626) 14%, transparent);
}

/* ---------- 右键菜单浮层（fixed + 视口翻转 + 深色卡片） ---------- */
.cloud-doc-tree__menu {
  position: fixed;
  /* 防止文字逐字竖排：容器给足宽度并禁止换行，不受父级 writing-mode/word-break 影响 */
  min-width: 180px;
  width: max-content;
  max-width: 280px;
  white-space: nowrap;
  word-break: keep-all;
  writing-mode: horizontal-tb;
  z-index: 13000;
  display: flex;
  flex-direction: column;
  min-width: 208px;
  padding: 4px;
  color: var(--text-primary, #e5e9f0);
  background: var(--panel-elevated, #151d2d);
  border: 1px solid var(--border-strong, rgba(148, 163, 184, 0.38));
  border-radius: var(--radius-panel, 8px);
  box-shadow: var(--shadow-overlay, 0 18px 40px rgba(0, 0, 0, 0.45));
}

.cloud-doc-tree__menu--scroll {
  max-height: 320px;
  overflow: auto;
}

.cloud-doc-tree__menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  min-height: 34px;
  line-height: 34px;
  white-space: nowrap;
  word-break: keep-all;
  padding: 0 10px;
  font-size: 12px;
  color: var(--text-primary, #e5e9f0);
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: var(--radius-control, 5px);
}

.cloud-doc-tree__menu-item:hover:not(:disabled) {
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
}

.cloud-doc-tree__menu-item:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.cloud-doc-tree__menu-divider {
  height: 1px;
  margin: 4px 6px;
  background: var(--border-soft, rgba(148, 163, 184, 0.24));
}

/* ---------- 新建/重命名分类：居中卡片 ---------- */
.cloud-doc-tree__prompt {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 13500;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(360px, calc(100vw - 32px));
  padding: 14px;
  color: var(--text-primary, #e5e9f0);
  background: var(--panel-elevated, #151d2d);
  border: 1px solid var(--border-strong, rgba(148, 163, 184, 0.38));
  border-radius: var(--radius-dialog, 10px);
  box-shadow: var(--shadow-overlay, 0 18px 40px rgba(0, 0, 0, 0.45));
  transform: translate(-50%, -50%);
}

.cloud-doc-tree__prompt-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.cloud-doc-tree__prompt-input {
  width: 100%;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text-primary, #e5e9f0);
  background: var(--panel-base, #101726);
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-control, 5px);
}

.cloud-doc-tree__prompt-input:focus {
  border-color: var(--accent-brand, #7cc7ff);
  outline: none;
}

.cloud-doc-tree__prompt-error {
  margin: 0;
  font-size: 11px;
  color: var(--state-danger, #dc2626);
}

.cloud-doc-tree__prompt-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.cloud-doc-tree__prompt-actions .cloud-doc-tree__button:last-child {
  color: var(--accent-brand, #7cc7ff);
  border-color: var(--accent-brand, #7cc7ff);
}

/* ---------- 行：统一行高 / 图标 / 悬浮操作 ---------- */
.cloud-doc-tree__type {
  flex-shrink: 0;
  width: 26px;
  font-size: 9px;
  font-weight: 700;
  text-align: center;
  color: var(--text-muted, #75829e);
  letter-spacing: 0.02em;
}

.cloud-doc-tree__count {
  margin-left: auto;
  padding: 0 6px;
  font-size: 10px;
  color: var(--text-muted, #75829e);
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  border-radius: var(--radius-badge, 999px);
}

.cloud-doc-tree__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

.cloud-doc-tree__row--dir .cloud-doc-tree__name {
  font-weight: 600;
  color: var(--text-primary, #e5e9f0);
}
.cloud-doc-tree__open {
  flex: 0 0 52px;
  width: 52px;
  margin-left: 6px;
  opacity: 0;
  transition: opacity 0.12s ease;
  padding: 1px 8px;
  font-size: 11px;
  color: var(--text-primary, #e5e9f0);
  cursor: pointer;
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-control, 5px);
}

.cloud-doc-tree__row:hover .cloud-doc-tree__open,
.cloud-doc-tree__row:focus-within .cloud-doc-tree__open {
  opacity: 1;
}

.cloud-doc-tree__open:hover:not(:disabled) {
  border-color: var(--accent-brand, #7cc7ff);
  color: var(--accent-brand, #7cc7ff);
}

.cloud-doc-tree__open:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.cloud-doc-tree__confirm {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: var(--panel-elevated, #151d2d);
  border: 1px solid var(--state-warning, #fbbf24);
  border-radius: var(--radius-card, 7px);
}

.cloud-doc-tree__confirm-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary, #e5e9f0);
}

.cloud-doc-tree__confirm-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary, #a8b3c5);
  word-break: break-all;
}

.cloud-doc-tree__confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cloud-doc-tree__button {
  padding: 3px 10px;
  font-size: 11.5px;
  color: var(--text-primary, #e5e9f0);
  cursor: pointer;
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-control, 5px);
}

.cloud-doc-tree__button:hover:not(:disabled) {
  border-color: var(--accent-brand, #7cc7ff);
  color: var(--accent-brand, #7cc7ff);
}

.cloud-doc-tree--compact .cloud-doc-tree__row {
  /* 统一行高与内边距：侧栏、浏览弹窗共用同一套行样式 */
  min-height: 28px;
  padding-block: 2px;
  gap: 4px;
  border-radius: var(--radius-control, 5px);
  font-size: 11.5px;
}
</style>
