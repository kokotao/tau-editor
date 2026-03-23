<template>
  <div class="file-tree" role="tree">
    <div v-if="!nested" class="file-tree-header">
      <div class="file-tree-header-top">
        <div class="file-tree-workspace">
          <span class="workspace-caption">{{ copy.workspace }}</span>
          <span class="file-tree-title">{{ workspaceLabel }}</span>
        </div>
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
      <div class="file-tree-operations">
        <span class="operations-label">{{ copy.quickOps }}</span>
        <div class="operation-tags">
          <span>{{ copy.quickCreate }}</span>
          <span>{{ copy.quickOpen }}</span>
        </div>
      </div>
    </div>

    <div class="file-tree-content" v-if="!loading">
      <div
        v-for="entry in displayedTree"
        :key="entry.path"
        class="file-tree-node"
      >
        <!-- 使用 v-memo 优化重复渲染 -->
        <div
          v-memo="[entry.path, entry.isExpanded, selectedPath === entry.path, level]"
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
          @contextmenu.prevent="handleContextMenu($event, entry)"
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

          <span class="file-icon">
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
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14,2 14,8 20,8" />
            </svg>
          </span>

          <span class="file-name">{{ entry.name }}</span>
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
            @file-open="(path) => emit('file-open', path)"
            @folder-toggle="(path) => emit('folder-toggle', path)"
            @contextMenu="(entry, event) => emit('contextMenu', entry, event)"
          />
        </div>
      </div>

      <div v-if="displayedTree.length === 0" class="file-tree-empty">
        <div class="empty-title">{{ copy.emptyTitle }}</div>
        <div class="empty-hint">{{ copy.emptyHint }}</div>
      </div>
    </div>

    <div v-else class="file-tree-loading">
      <LoadingSpinner size="small" :text="copy.loading" />
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
      @click.stop
    >
      <div class="context-menu-item" @click="handleNewFile">
        {{ copy.newFile }}
      </div>
      <div class="context-menu-item" @click="handleNewFolder">
        {{ copy.newFolder }}
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" @click="handleRename">
        {{ copy.rename }}
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item danger" @click="handleDelete">
        {{ copy.delete }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
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
}

const props = withDefaults(defineProps<FileTreeProps>(), {
  level: 0,
  selectedPath: null,
  loading: false,
  nested: false,
  workspaceLabel: '我的工作区',
});
const settingsStore = useSettingsStore();
const copy = computed(() => getFileTreeI18n(settingsStore.uiLanguage));
const searchQuery = ref('');
const normalizedSearchQuery = computed(() => searchQuery.value.trim().toLowerCase());

// Emits
const emit = defineEmits<{
  'file-open': [filePath: string];
  'folder-toggle': [folderPath: string];
  'contextMenu': [entry: FileTreeNode, event: MouseEvent];
  'refresh': [];
  'new-file': [];
  'new-folder': [];
  'rename': [entry: FileTreeNode];
  'delete': [entry: FileTreeNode];
}>();

// State
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  entry: null as FileTreeNode | null,
});

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
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('.file-tree-item[data-node-path]'));
  const target = nodes.find((node) => node.dataset.nodePath === targetPath);
  target?.focus();
};

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

const handleContextMenu = (event: MouseEvent, entry: FileTreeNode) => {
  event.preventDefault();
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    entry,
  };
  emit('contextMenu', entry, event);
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

// Lifecycle
onMounted(() => {
  document.addEventListener('click', closeContextMenu);
});
onUnmounted(() => {
  document.removeEventListener('click', closeContextMenu);
});
</script>

<style scoped>
.file-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--n-color, #252526);
  overflow: hidden;
}

.file-tree-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--n-text-color, #999);
  border-bottom: 1px solid var(--n-border-color, #333);
}

.file-tree-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
}

.file-tree-workspace {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.workspace-caption {
  font-size: 10px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--n-muted-text-color, #a2a2a2);
}

.file-tree-header-action {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-tree-search-shell {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
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
  font-size: 13px;
  width: 120px;
}

.file-tree-operations {
  margin-top: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding-top: 4px;
}

.operations-label {
  font-size: 11px;
  letter-spacing: 0.4px;
  color: var(--n-muted-text-color, #a2a2a2);
}

.operation-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--n-muted-text-color, #a2a2a2);
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
  border-radius: 4px;
  cursor: pointer;
  color: inherit;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
}

.file-tree-header:hover .file-tree-action {
  opacity: 1;
}

.file-tree-action:hover {
  background: var(--n-hover-color, #2a2d2e);
}

.file-tree-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.file-tree-node {
  user-select: none;
}

.file-tree-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  cursor: pointer;
  color: var(--n-text-color, #ccc);
  font-size: 13px;
  transition: background 0.15s;
  outline: none;
}

.file-tree-item:hover {
  background: var(--n-hover-color, #2a2d2e);
}

.file-tree-item.selected {
  background: var(--n-active-color, #37373d);
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

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-tree-children {
  margin-left: 0;
}

.file-tree-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--n-text-color, #666);
  font-size: 13px;
}

.file-tree-empty {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--n-text-color, #666);
  font-size: 13px;
}

.file-tree-empty .empty-title {
  font-weight: 600;
  color: var(--n-text-color, #ccc);
}

.file-tree-empty .empty-hint {
  font-size: 12px;
  color: var(--n-muted-text-color, #9a9a9a);
}

.context-menu {
  position: fixed;
  background: var(--n-color, #252526);
  border: 1px solid var(--n-border-color, #333);
  border-radius: 4px;
  padding: 4px 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  min-width: 140px;
}

.context-menu-item {
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
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
