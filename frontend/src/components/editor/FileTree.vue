<template>
  <div class="file-tree">
    <div class="file-tree-header">
      <span class="file-tree-title">资源管理器</span>
      <button class="file-tree-action" @click="emit('refresh')" title="刷新">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23,4 23,10 17,10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </button>
    </div>

    <div class="file-tree-content" v-if="!loading">
      <div
        v-for="entry in fileTree"
        :key="entry.path"
        class="file-tree-node"
      >
        <!-- 使用 v-memo 优化重复渲染 -->
        <div
          v-memo="[entry.path, entry.isExpanded, selectedPath === entry.path, level]"
          class="file-tree-item"
          :class="{
            selected: entry.path === selectedPath,
            'is-folder': entry.type === 'folder',
          }"
          :style="{ paddingLeft: (level * 16 + 8) + 'px' }"
          @click="handleClick(entry)"
          @contextmenu.prevent="handleContextMenu($event, entry)"
        >
          <button
            v-if="entry.type === 'folder'"
            class="folder-toggle"
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
            <svg v-if="entry.type === 'folder'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
            :selected-path="selectedPath"
            @file-open="(path) => emit('file-open', path)"
            @folder-toggle="(path) => emit('folder-toggle', path)"
            @contextMenu="(entry, event) => emit('contextMenu', entry, event)"
          />
        </div>
      </div>

      <div v-if="fileTree.length === 0" class="file-tree-empty">
        暂无文件
      </div>
    </div>

    <div v-else class="file-tree-loading">
      <LoadingSpinner size="small" text="加载文件树..." />
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
      @click.stop
    >
      <div class="context-menu-item" @click="handleNewFile">
        新建文件
      </div>
      <div class="context-menu-item" @click="handleNewFolder">
        新建文件夹
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" @click="handleRename">
        重命名
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item danger" @click="handleDelete">
        删除
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import type { FileEntry } from '@/lib/tauri';
import type { FileTreeNode } from '@/stores/fileSystem';
import LoadingSpinner from '../ui/LoadingSpinner.vue';

// Props
interface FileTreeProps {
  fileTree: FileTreeNode[];
  level?: number;
  selectedPath?: string | null;
  loading?: boolean;
}

const props = withDefaults(defineProps<FileTreeProps>(), {
  level: 0,
  selectedPath: null,
  loading: false,
});

// 性能优化：缓存文件图标渲染函数
const getFileIcon = (entry: FileTreeNode) => {
  if (entry.type === 'folder') {
    return 'folder';
  }
  // 根据文件扩展名返回不同图标
  const ext = entry.name.split('.').pop()?.toLowerCase();
  const iconMap: Record<string, string> = {
    'js': 'javascript',
    'ts': 'typescript',
    'vue': 'vue',
    'py': 'python',
    'rs': 'rust',
    'md': 'markdown',
    'json': 'json',
    'html': 'html',
    'css': 'css',
    'yml': 'yaml',
    'yaml': 'yaml',
  };
  return iconMap[ext || ''] || 'file';
};

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
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--n-text-color, #999);
  border-bottom: 1px solid var(--n-border-color, #333);
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
}

.file-tree-item:hover {
  background: var(--n-hover-color, #2a2d2e);
}

.file-tree-item.selected {
  background: var(--n-active-color, #37373d);
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

.file-tree-loading,
.file-tree-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--n-text-color, #666);
  font-size: 13px;
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
