<template>
  <div
    ref="fileTreeRootRef"
    class="file-tree"
    role="tree"
  >
    <div v-if="!nested" class="file-tree-header">
      <div class="file-tree-header-top">
        <div class="file-tree-header-action">
          <div class="file-tree-search-shell" data-testid="file-tree-search-shell">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="6" />
              <line x1="16" y1="16" x2="22" y2="22" />
            </svg>
            <input
              type="text"
              v-model="searchQuery"
              :placeholder="copy.searchPlaceholder"
              :aria-label="copy.searchAriaLabel"
            />
          </div>
          <button class="file-tree-action" @click="emit('refresh')" :title="copy.refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23,4 23,10 17,10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
      </div>
      <div class="file-tree-workspace">
        <div class="file-tree-workspace-copy">
          <span class="workspace-caption">{{ copy.workspace }}</span>
          <span class="file-tree-title">{{ workspaceLabel }}</span>
        </div>
        <button
          class="file-tree-action file-tree-locate-action"
          data-testid="btn-locate-current-file-tree"
          :disabled="!canRevealCurrentFile || locatingCurrentFile"
          :title="canRevealCurrentFile ? copy.locateCurrentFile : copy.currentFileUnavailable"
          :aria-label="canRevealCurrentFile ? copy.locateCurrentFile : copy.currentFileUnavailable"
          @click="emit('reveal-current-file')"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="7" />
            <circle cx="12" cy="12" r="2" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        </button>
        <button
          class="file-tree-action file-tree-locate-action file-tree-copy-action"
          data-testid="btn-copy-current-file-path"
          :disabled="!canRevealCurrentFile || locatingCurrentFile"
          :title="canRevealCurrentFile ? copy.copyCurrentFilePath : copy.currentFileUnavailable"
          :aria-label="canRevealCurrentFile ? copy.copyCurrentFilePath : copy.currentFileUnavailable"
          @click="emit('copy-current-file-path')"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
        <button
          class="file-tree-action file-tree-locate-action"
          data-testid="btn-reveal-current-file"
          :disabled="!canRevealCurrentFile || locatingCurrentFile"
          :title="canRevealCurrentFile ? copy.revealCurrentFile : copy.currentFileUnavailable"
          :aria-label="canRevealCurrentFile ? copy.revealCurrentFile : copy.currentFileUnavailable"
          @click="emit('reveal-current-file-manager')"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1" />
            <path d="M3 10h18l-2 8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <path d="M12 13v4m0 0 2-2m-2 2-2-2" />
          </svg>
        </button>
      </div>
    </div>

    <div
      v-if="!loading"
      class="file-tree-content"
      @contextmenu.prevent.stop="handleRootContextMenu"
    >
      <div
        v-for="entry in displayedTree"
        :key="entry.path"
        class="file-tree-node"
      >
        <!-- 使用 v-memo 优化重复渲染 -->
        <div
          v-memo="[entry.path, entry.isExpanded, selectedPath === entry.path, level, entry.created, entry.modified, entry.size]"
          class="file-tree-item"
          role="treeitem"
          tabindex="0"
          :data-node-path="entry.path"
          :data-testid="entry.type === 'folder' ? 'tree-folder' : 'tree-file'"
          :aria-expanded="entry.type === 'folder' ? Boolean(entry.isExpanded) : undefined"
          :class="{
            selected: entry.path === selectedPath,
            'is-folder': entry.type === 'folder',
          }"
          :style="{ paddingLeft: (level * 16 + 8) + 'px' }"
          @click="handleClick(entry)"
          @keydown="handleItemKeyDown($event, entry)"
          @contextmenu.prevent.stop="handleContextMenu($event, entry)"
        >
          <button
            v-if="entry.type === 'folder'"
            class="folder-toggle"
            :data-testid="`folder-toggle-${entry.isExpanded ? 'expanded' : 'collapsed'}`"
            @click.stop="toggleFolder(entry)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              :class="{ expanded: entry.isExpanded }"
            >
              <polyline points="9,18 15,12 9,6" />
            </svg>
          </button>
          <span v-else class="file-indent"></span>

          <span class="file-icon" :class="entry.type === 'folder' ? 'file-icon-folder' : `file-icon-${fileIconKind(entry.name)}`">
            <svg
              v-if="entry.type === 'folder' && entry.isExpanded"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              data-testid="folder-icon-open"
            >
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1" />
              <path d="M3 10h18l-2 8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            <svg
              v-else-if="entry.type === 'folder'"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              data-testid="folder-icon-closed"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <svg v-else-if="fileIconKind(entry.name) === 'image'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" data-testid="file-icon-image">
              <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="1.5" /><path d="m4 17 5-5 3 3 2-2 6 6" />
            </svg>
            <svg v-else-if="fileIconKind(entry.name) === 'markdown'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" data-testid="file-icon-markdown">
              <path d="M4 5h16v14H4z" /><path d="M7 15v-5l3 3 3-3v5M17 10v5m0 0 2-2m-2 2-2-2" />
            </svg>
            <svg v-else-if="fileIconKind(entry.name) === 'code'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" data-testid="file-icon-code">
              <path d="m8 6-6 6 6 6M16 6l6 6-6 6M14 3l-4 18" />
            </svg>
            <svg v-else-if="fileIconKind(entry.name) === 'config'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" data-testid="file-icon-config">
              <path d="M12 3v18M3 12h18" /><circle cx="12" cy="12" r="8" />
            </svg>
            <svg v-else-if="fileIconKind(entry.name) === 'archive'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" data-testid="file-icon-archive">
              <path d="M4 4h16v16H4zM9 4v4h6V4M10 12h4" />
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" data-testid="file-icon-default">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" />
            </svg>
          </span>

          <span class="file-name" :title="entry.name">{{ entry.name }}</span>
          <span class="file-meta-scroll" :title="formatEntryTooltip(entry)">
            <span class="file-meta" data-testid="file-tree-entry-meta" :title="formatEntryTooltip(entry)">
              <span v-if="entry.created" class="file-meta-field"><b>创建</b>{{ formatDateTime(entry.created) }}</span>
              <span v-if="entry.size !== undefined && entry.size !== null" class="file-meta-field"><b>大小</b>{{ formatEntrySize(entry.size) }}</span>
              <span v-if="entry.modified" class="file-meta-field"><b>修改</b>{{ formatDateTime(entry.modified) }}</span>
            </span>
          </span>
        </div>

        <!-- 子文件夹 - 懒渲染：只有展开时才渲染子组件 -->
        <div
          v-if="entry.type === 'folder' && entry.children && entry.isExpanded"
          class="file-tree-children"
        >
          <FileTree
            :file-tree="entry.children"
            :level="level + 1"
            :nested="true"
            :selected-path="selectedPath"
            :provider-actions="providerActions"
            @file-open="(path) => emit('file-open', path)"
            @folder-toggle="(path) => emit('folder-toggle', path)"
            @context-menu="handleNestedContextMenu"
            @compare-with-current="(entry) => emit('compare-with-current', entry)"
            @run-provider-action="(actionId, entry) => emit('run-provider-action', actionId, entry)"
            @new-file="emit('new-file')"
            @new-folder="emit('new-folder')"
            @rename="(entry) => emit('rename', entry)"
            @delete="(entry) => emit('delete', entry)"
          />
        </div>
      </div>

    </div>

    <div v-else class="file-tree-loading">
      <LoadingSpinner size="small" :text="copy.loading" />
    </div>

    <!-- 右键菜单 -->
    <Teleport v-if="!nested" to="body">
      <div
        v-if="contextMenu.visible"
        ref="contextMenuRef"
        class="context-menu"
        :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
        @click.stop
      >
      <div class="context-menu-item" @click="handleNewFile">
        {{ copy.newFile }}
      </div>
      <div class="context-menu-item" @click="handleNewFolder">
        {{ copy.newFolder }}
      </div>
      <div class="context-menu-divider"></div>
      <div v-if="contextMenu.entry" class="context-menu-item" @click="handleRename">
        {{ copy.rename }}
      </div>
      <div
        v-if="contextMenu.entry?.type === 'file'"
        class="context-menu-item"
        data-testid="file-tree-compare-current"
        @click="handleCompareWithCurrent"
      >
        {{ copy.compareWithCurrent }}
      </div>
      <div
        v-if="contextMenu.entry"
        class="context-menu-item"
        data-testid="file-tree-details"
        @click="handleDetails"
      >
        {{ copy.fileDetails }}
      </div>
      <template v-if="contextMenu.entry?.type === 'file'">
        <div
          v-for="action in providerActions"
          :key="action.id"
          class="context-menu-item"
          :data-testid="`file-tree-provider-${action.id}`"
          @click="handleRunProviderAction(action.id)"
        >
          {{ action.title }}
        </div>
      </template>
      <div v-if="contextMenu.entry" class="context-menu-divider"></div>
      <div v-if="contextMenu.entry" class="context-menu-item danger" @click="handleDelete">
        {{ copy.delete }}
      </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import type { FileTreeNode } from '@/stores/fileSystem';
import { useSettingsStore } from '@/stores/settings';
import { getFileTreeI18n } from '@/i18n/ui';
import LoadingSpinner from '../ui/LoadingSpinner.vue';

// Props
interface FileTreeProps {
  fileTree: FileTreeNode[];
  level?: number;
  selectedPath?: string | null;
  loading?: boolean;
  nested?: boolean;
  workspaceLabel?: string;
  providerActions?: Array<{ id: string; title: string }>;
  canRevealCurrentFile?: boolean;
  locatingCurrentFile?: boolean;
}

const props = withDefaults(defineProps<FileTreeProps>(), {
  level: 0,
  selectedPath: null,
  loading: false,
  nested: false,
  providerActions: () => [],
  canRevealCurrentFile: false,
  locatingCurrentFile: false,
  workspaceLabel: '我的工作区',
});
const settingsStore = useSettingsStore();
const copy = computed(() => getFileTreeI18n(settingsStore.uiLanguage));
const searchQuery = ref('');
const normalizedSearchQuery = computed(() => searchQuery.value.trim().toLowerCase());

const fileIconKind = (name: string): 'image' | 'markdown' | 'code' | 'config' | 'archive' | 'default' => {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'].includes(extension)) return 'image';
  if (['md', 'markdown', 'mdx'].includes(extension)) return 'markdown';
  if (['js', 'jsx', 'ts', 'tsx', 'vue', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'hpp', 'cs', 'sql', 'html', 'css', 'scss', 'less'].includes(extension)) return 'code';
  if (['json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'env', 'properties'].includes(extension)) return 'config';
  if (['zip', 'tar', 'gz', 'rar', '7z', 'bz2'].includes(extension)) return 'archive';
  return 'default';
};

// Emits
const emit = defineEmits<{
  'file-open': [filePath: string];
  'folder-toggle': [folderPath: string];
  'contextMenu': [entry: FileTreeNode | null, event: MouseEvent];
  'refresh': [];
  'new-file': [];
  'new-folder': [];
  'rename': [entry: FileTreeNode];
  'details': [entry: FileTreeNode];
  'compare-with-current': [entry: FileTreeNode];
  'run-provider-action': [actionId: string, entry: FileTreeNode];
  'delete': [entry: FileTreeNode];
  'reveal-current-file': [];
  'copy-current-file-path': [];
  'reveal-current-file-manager': [];
}>();

// State
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  entry: null as FileTreeNode | null,
});
const contextMenuRef = ref<HTMLElement | null>(null);
const fileTreeRootRef = ref<HTMLElement | null>(null);
let revealPulseTimer: ReturnType<typeof setTimeout> | null = null;
const CONTEXT_MENU_MARGIN = 8;
const FILE_TREE_CONTEXT_MENU_EVENT = 'tau-editor:file-tree-context-menu-open';
let contextMenuOpenToken = 0;

const clampMenuPosition = (x: number, y: number, maxWidth: number, maxHeight: number) => {
  const safeMaxX = Math.max(CONTEXT_MENU_MARGIN, maxWidth - CONTEXT_MENU_MARGIN);
  const safeMaxY = Math.max(CONTEXT_MENU_MARGIN, maxHeight - CONTEXT_MENU_MARGIN);

  return {
    x: Math.max(CONTEXT_MENU_MARGIN, Math.min(x, safeMaxX)),
    y: Math.max(CONTEXT_MENU_MARGIN, Math.min(y, safeMaxY)),
  };
};

const filterTreeByQuery = (entries: FileTreeNode[], query: string): FileTreeNode[] => {
  if (!query) {
    return entries;
  }

  const results: FileTreeNode[] = [];
  for (const entry of entries) {
    const childEntries = entry.children ?? [];
    const filteredChildren = childEntries.length ? filterTreeByQuery(childEntries, query) : [];
    const selfMatches = entry.name.toLowerCase().includes(query) || entry.path.toLowerCase().includes(query);

    if (!selfMatches && filteredChildren.length === 0) {
      continue;
    }

    if (entry.type === 'folder') {
      results.push({
        ...entry,
        isExpanded: true,
        children: selfMatches ? childEntries : filteredChildren,
      });
      continue;
    }

    results.push(entry);
  }

  return results;
};

const displayedTree = computed(() => {
  const query = normalizedSearchQuery.value;
  if (!query) {
    return props.fileTree;
  }
  return filterTreeByQuery(props.fileTree, query);
});

const formatDateTime = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const date = new Date(typeof value === 'number' && value < 10_000_000_000 ? value * 1000 : value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getDate())} ${date.getMonth() + 1}月 ${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatEntrySize = (size: number | null | undefined): string => {
  if (size === null || size === undefined) {
    return '';
  }
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${size} B`;
};

const formatEntryTooltip = (entry: FileTreeNode): string => {
  const details = [
    `路径：${entry.path}`,
    entry.created ? `创建时间：${formatDateTime(entry.created)}` : '',
    entry.modified ? `修改时间：${formatDateTime(entry.modified)}` : '',
    entry.size === undefined || entry.size === null ? '' : `大小：${formatEntrySize(entry.size)}`,
  ].filter(Boolean);
  return details.join('\n');
};

// Methods
const handleClick = (entry: FileTreeNode) => {
  if (entry.type === 'folder') {
    emit('folder-toggle', entry.path);
  } else {
    emit('file-open', entry.path);
  }
};

const toggleFolder = (entry: FileTreeNode) => {
  emit('folder-toggle', entry.path);
};

const focusNodeByPath = (targetPath: string) => {
  const nodes = Array.from(fileTreeRootRef.value?.querySelectorAll<HTMLElement>('.file-tree-item[data-node-path]') ?? []);
  const target = nodes.find((node) => node.dataset.nodePath === targetPath);
  target?.focus();
};

const revealPath = async (targetPath: string) => {
  await nextTick();
  const nodes = Array.from(fileTreeRootRef.value?.querySelectorAll<HTMLElement>('.file-tree-item[data-node-path]') ?? []);
  const normalizedTargetPath = targetPath.replace(/\\/g, '/');
  const target = nodes.find((node) => node.dataset.nodePath?.replace(/\\/g, '/') === normalizedTargetPath);
  if (!target) return false;

  fileTreeRootRef.value?.querySelector<HTMLElement>('.file-tree-item.is-revealed')?.classList.remove('is-revealed');
  target.classList.add('is-revealed');
  if (revealPulseTimer) clearTimeout(revealPulseTimer);
  revealPulseTimer = setTimeout(() => {
    target.classList.remove('is-revealed');
    revealPulseTimer = null;
  }, 1200);

  target.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'center' });
  target.focus({ preventScroll: true });
  return true;
};

defineExpose({ revealPath });

const getParentPath = (path: string) => {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (index <= 0) {
    return '';
  }
  return path.slice(0, index);
};

const handleItemKeyDown = (event: KeyboardEvent, entry: FileTreeNode) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    handleClick(entry);
    return;
  }

  const siblings = displayedTree.value;
  const currentIndex = siblings.findIndex((item) => item.path === entry.path);
  if (event.key === 'ArrowDown' && currentIndex < siblings.length - 1) {
    event.preventDefault();
    focusNodeByPath(siblings[currentIndex + 1]!.path);
    return;
  }

  if (event.key === 'ArrowUp' && currentIndex > 0) {
    event.preventDefault();
    focusNodeByPath(siblings[currentIndex - 1]!.path);
    return;
  }

  if (event.key === 'ArrowRight' && entry.type === 'folder' && !entry.isExpanded) {
    event.preventDefault();
    toggleFolder(entry);
    return;
  }

  if (event.key === 'ArrowLeft') {
    if (entry.type === 'folder' && entry.isExpanded) {
      event.preventDefault();
      toggleFolder(entry);
      return;
    }
    const parentPath = getParentPath(entry.path);
    if (parentPath) {
      event.preventDefault();
      focusNodeByPath(parentPath);
    }
  }
};

const openContextMenu = async (event: MouseEvent, entry: FileTreeNode | null) => {
  const localX = event.clientX;
  const localY = event.clientY;
  const openToken = ++contextMenuOpenToken;

  // 递归文件树的每个实例都会监听该事件，打开新菜单前先关闭旧实例。
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(FILE_TREE_CONTEXT_MENU_EVENT));
  }

  contextMenu.value = {
    visible: true,
    x: localX,
    y: localY,
    entry,
  };

  await nextTick();

  if (openToken !== contextMenuOpenToken || !contextMenu.value.visible || !contextMenuRef.value) {
    return;
  }

  const menuRect = contextMenuRef.value.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const x = localX + menuRect.width > viewportWidth - CONTEXT_MENU_MARGIN ? localX - menuRect.width : localX;
  const y = localY + menuRect.height > viewportHeight - CONTEXT_MENU_MARGIN ? localY - menuRect.height : localY;
  contextMenu.value.x = Math.max(CONTEXT_MENU_MARGIN, Math.min(x, viewportWidth - menuRect.width - CONTEXT_MENU_MARGIN));
  contextMenu.value.y = Math.max(CONTEXT_MENU_MARGIN, Math.min(y, viewportHeight - menuRect.height - CONTEXT_MENU_MARGIN));
};

const handleContextMenu = (event: MouseEvent, entry: FileTreeNode) => {
  event.preventDefault();
  if (!props.nested) {
    void openContextMenu(event, entry);
  }
  emit('contextMenu', entry, event);
};

const handleNestedContextMenu = (entry: FileTreeNode | null, event: MouseEvent) => {
  if (!props.nested) {
    void openContextMenu(event, entry);
  }
  emit('contextMenu', entry, event);
};

const handleRootContextMenu = (event: MouseEvent) => {
  // 子节点会在自身处理右键并阻止冒泡；此处只负责工作区空白区域。
  if ((event.target as HTMLElement | null)?.closest('.file-tree-item')) {
    return;
  }

  event.preventDefault();
  if (!props.nested) {
    void openContextMenu(event, null);
  }
  emit('contextMenu', null, event);
};

const handleNewFile = () => {
  emit('new-file');
  contextMenu.value.visible = false;
};

const handleNewFolder = () => {
  emit('new-folder');
  contextMenu.value.visible = false;
};

const handleRename = () => {
  if (contextMenu.value.entry) {
    emit('rename', contextMenu.value.entry);
  }
  contextMenu.value.visible = false;
};

const handleDetails = () => {
  if (contextMenu.value.entry) {
    emit('details', contextMenu.value.entry);
  }
  contextMenu.value.visible = false;
};

const handleCompareWithCurrent = () => {
  const entry = contextMenu.value.entry;
  if (entry?.type === 'file') {
    emit('compare-with-current', entry);
  }
  contextMenu.value.visible = false;
};

const handleRunProviderAction = (actionId: string) => {
  const entry = contextMenu.value.entry;
  if (entry?.type === 'file') {
    emit('run-provider-action', actionId, entry);
  }
  contextMenu.value.visible = false;
};

const handleDelete = () => {
  if (contextMenu.value.entry) {
    emit('delete', contextMenu.value.entry);
  }
  contextMenu.value.visible = false;
};

// 点击其他地方关闭右键菜单
const closeContextMenu = () => {
  contextMenu.value.visible = false;
};

const handleExternalContextMenuOpen = () => {
  closeContextMenu();
};

// Lifecycle
onMounted(() => {
  window.addEventListener(FILE_TREE_CONTEXT_MENU_EVENT, handleExternalContextMenuOpen);
  document.addEventListener('click', closeContextMenu);
});
onUnmounted(() => {
  if (revealPulseTimer) clearTimeout(revealPulseTimer);
  window.removeEventListener(FILE_TREE_CONTEXT_MENU_EVENT, handleExternalContextMenuOpen);
  document.removeEventListener('click', closeContextMenu);
});
</script>

<style scoped>
.file-tree {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: var(--n-color, #252526);
  overflow: hidden;
}

.file-tree-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  font-size: var(--font-size-ui-xs, 11px);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--n-text-color, #999);
  border-bottom: 1px solid var(--n-border-color, #333);
}

.file-tree-header-top {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 8px;
}

.file-tree-workspace {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.file-tree-workspace-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.workspace-caption {
  font-size: var(--font-size-ui-xs, 10px);
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--n-muted-text-color, #a2a2a2);
}

.file-tree-header-action {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.file-tree-search-shell {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--n-border-color, #333);
  background: var(--n-background-strong, #1e1e1e);
  color: var(--n-text-color, #ccc);
}

.file-tree-search-shell svg {
  color: var(--n-muted-text-color, #888);
}

.file-tree-search-shell input {
  background: transparent;
  border: none;
  outline: none;
  color: inherit;
  font-size: var(--font-size-ui-md, 13px);
  width: 120px;
}

.file-tree-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: inherit;
  opacity: 0.82;
  transition: opacity 0.15s, background 0.15s;
}

/* Keep the design SVG visible even when the action is temporarily disabled. */
.file-tree-action .tau-icon {
  color: var(--n-text-color, #c8c8c8);
  opacity: 1;
}

.file-tree-action .tau-icon :deep(svg) {
  color: inherit;
  stroke: currentColor;
}

.file-tree-locate-action {
  flex: 0 0 auto;
}

.file-tree-action:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.file-tree-copy-action:disabled {
  opacity: 0.82;
}

.file-tree-header:hover .file-tree-action {
  opacity: 1;
}

.file-tree-action:hover {
  background: var(--n-hover-color, #2a2d2e);
}

.file-tree-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--n-muted-text-color, #7f8b96) 70%, transparent) transparent;
}

.file-tree-content::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.file-tree-content::-webkit-scrollbar-track {
  background: transparent;
}

.file-tree-content::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--n-muted-text-color, #7f8b96) 70%, transparent);
  background-clip: padding-box;
}

.file-tree-content::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--n-text-color, #c8c8c8) 80%, transparent);
  background-clip: padding-box;
}

.file-tree-node {
  width: max-content;
  min-width: 100%;
  user-select: none;
}

.file-tree-item {
  display: flex;
  align-items: center;
  gap: 4px;
  width: max-content;
  min-width: 100%;
  padding: 4px 8px;
  cursor: pointer;
  color: var(--n-text-color, #ccc);
  font-size: var(--font-size-ui-md, 13px);
  transition: background 0.15s, box-shadow 0.15s;
  outline: none;
}

.file-tree-item:hover {
  background: var(--n-hover-color, #2a2d2e);
}

.file-tree-item.selected {
  background: var(--n-active-color, #37373d);
  box-shadow: inset 2px 0 0 var(--accent-blue);
}

.file-tree-item.is-revealed {
  animation: file-tree-reveal-pulse 1.2s ease-out;
}

@keyframes file-tree-reveal-pulse {
  0%, 100% { background: var(--n-active-color, #37373d); }
  35% { background: color-mix(in srgb, var(--accent-blue, #4dabff) 34%, var(--n-active-color, #37373d)); }
}

.file-tree-item:focus-visible {
  box-shadow: inset 0 0 0 1px rgba(77, 171, 255, 0.9);
}

.folder-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  color: inherit;
}

.folder-toggle svg {
  transition: transform 0.15s;
}

.folder-toggle svg.expanded {
  transform: rotate(90deg);
}

.file-indent {
  width: 16px;
}

.file-icon {
  display: flex;
  align-items: center;
  color: #e5c07b;
}

.file-tree-item.is-folder .file-icon {
  color: #61afef;
}

.file-icon-markdown { color: #a78bfa; }
.file-icon-image { color: #34d399; }
.file-icon-code { color: #60a5fa; }
.file-icon-config { color: #fbbf24; }
.file-icon-archive { color: #fb923c; }
.file-icon-default { color: #cbd5e1; }

.file-name {
  flex: 0 0 auto;
  min-width: max-content;
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
}

.file-meta {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 12px;
  color: var(--n-muted-text-color, #7f8b96);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0;
  line-height: 1.2;
  white-space: nowrap;
  opacity: 0.82;
}

.file-meta-scroll {
  flex: 0 0 auto;
  min-width: max-content;
  overflow: visible;
}

.file-meta-field {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.file-meta-field b {
  color: var(--n-text-color-3, #c5cbd1);
  font-weight: 300;
  font-size: 9px;
}

.file-tree-item:hover .file-meta,
.file-tree-item.selected .file-meta {
  color: var(--n-text-color-3, #a8b3bd);
  opacity: 1;
}

.file-tree-children {
  width: max-content;
  min-width: 100%;
  margin-left: 0;
}

.file-tree-children > .file-tree {
  width: max-content;
  min-width: 100%;
}

.file-tree-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--n-text-color, #666);
  font-size: var(--font-size-ui-md, 13px);
}

.context-menu {
  position: fixed;
  background: var(--n-color, #252526);
  border: 1px solid var(--n-border-color, #333);
  border-radius: var(--radius-md);
  padding: 4px 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 20000;
  min-width: 140px;
}

.context-menu-item {
  padding: 6px 16px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-size-ui-md, 13px);
  color: var(--n-text-color, #ccc);
}

.context-menu-item:hover {
  background: var(--n-hover-color, #2a2d2e);
}

.context-menu-item.danger:hover {
  background: #d84545;
}

.context-menu-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--n-border-color, #333);
}
</style>
