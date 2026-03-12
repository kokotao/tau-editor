<template>
  <div class="editor-tabs" data-testid="editor-tabs">
    <div class="tabs-container" data-testid="tab-bar">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="tab"
        data-testid="tab"
        :class="{ active: tab.id === activeTabId, dirty: tab.isDirty }"
        @click="handleTabClick(tab.id)"
        @contextmenu="handleContextMenu($event, tab.id)"
      >
        <span class="tab-icon">
          <svg v-if="tab.isDirty" width="12" height="12" viewBox="0 0 12 12">
            <circle cx="6" cy="6" r="3" fill="currentColor" />
          </svg>
        </span>
        <span class="tab-name" data-testid="tab-title">{{ tab.fileName }}</span>
        <button
          class="tab-close"
          data-testid="btn-close-tab"
          @click.stop="handleTabClose(tab.id)"
          title="关闭"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path
              d="M2 2L10 10M10 2L2 10"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
      @click.stop
    >
      <div class="context-menu-item" data-testid="menu-close-others" @click="handleCloseOthers">
        关闭其他标签
      </div>
      <div class="context-menu-item" data-testid="menu-close-all" @click="handleCloseAll">
        关闭所有标签
      </div>
    </div>
  </div>

  <!-- 编辑器核心 -->
  <div class="editor-content">
    <EditorCore
      v-if="activeTabId"
      :model-id="activeTabId"
      :language="activeTab?.language"
      @content-change="handleContentChange"
      @cursor-change="handleCursorChange"
      @model-save="handleModelSave"
      @error="handleError"
    />
    <div v-else class="empty-state">
      <div class="empty-icon">📝</div>
      <div class="empty-text">打开文件开始编辑</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useTabsStore, type Tab } from '@/stores/tabs';
import { useEditorStore } from '@/stores/editor';
import EditorCore from './EditorCore.vue';

// Props
interface EditorTabsProps {
  tabs?: Tab[];
  activeTabId?: string | null;
}

const props = withDefaults(defineProps<EditorTabsProps>(), {
  tabs: () => [],
  activeTabId: null,
});

// Emits
const emit = defineEmits<{
  'tab-click': [tabId: string];
  'tab-close': [tabId: string];
  'tab-close-others': [tabId: string];
  'tab-close-all': [];
}>();

// Stores
const tabsStore = useTabsStore();
const editorStore = useEditorStore();

// State
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  tabId: null as string | null,
});

// Computed
const tabs = computed(() => tabsStore.tabs);
const activeTabId = computed(() => tabsStore.activeTabId);
const activeTab = computed(() => tabsStore.activeTab);

// Methods
const handleTabClick = (tabId: string) => {
  tabsStore.activateTab(tabId);
  emit('tab-click', tabId);
};

const handleTabClose = (tabId: string) => {
  tabsStore.closeTab(tabId);
  emit('tab-close', tabId);
};

const handleContextMenu = (event: MouseEvent, tabId: string) => {
  event.preventDefault();
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    tabId,
  };
};

const handleCloseOthers = () => {
  if (contextMenu.value.tabId) {
    tabsStore.closeOthers(contextMenu.value.tabId);
    emit('tab-close-others', contextMenu.value.tabId);
  }
  contextMenu.value.visible = false;
};

const handleCloseAll = () => {
  tabsStore.closeAll();
  emit('tab-close-all');
  contextMenu.value.visible = false;
};

const handleContentChange = (content: string) => {
  if (activeTabId.value) {
    tabsStore.updateTabDirty(activeTabId.value, true);
  }
};

const handleCursorChange = (position: { line: number; column: number }) => {
  editorStore.updateCursorPosition(position.line, position.column);
};

const handleModelSave = () => {
  // 触发保存事件，由父组件处理
  if (activeTabId.value) {
    tabsStore.updateTabDirty(activeTabId.value, false);
    editorStore.markAsSaved();
  }
};

const handleError = (error: Error) => {
  console.error('Editor error:', error);
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
.editor-tabs {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--n-color, #1e1e1e);
}

.tabs-container {
  display: flex;
  align-items: center;
  height: 36px;
  background: var(--n-color, #252526);
  border-bottom: 1px solid var(--n-border-color, #333);
  overflow-x: auto;
  overflow-y: hidden;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 100%;
  min-width: 120px;
  max-width: 200px;
  background: transparent;
  border: none;
  border-right: 1px solid var(--n-border-color, #333);
  cursor: pointer;
  color: var(--n-text-color, #ccc);
  font-size: 13px;
  transition: background 0.15s;
}

.tab:hover {
  background: var(--n-hover-color, #2a2d2e);
}

.tab.active {
  background: var(--n-color, #1e1e1e);
  color: var(--n-text-color, #fff);
}

.tab-icon {
  display: flex;
  align-items: center;
  color: #e5c07b;
}

.tab-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-close {
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

.tab:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: var(--n-hover-color, #444);
}

.context-menu {
  position: fixed;
  background: var(--n-color, #252526);
  border: 1px solid var(--n-border-color, #333);
  border-radius: 4px;
  padding: 4px 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
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

.editor-content {
  flex: 1;
  overflow: hidden;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--n-text-color, #666);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 16px;
}
</style>
