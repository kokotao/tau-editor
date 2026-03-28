<template>
  <div ref="tabsRootRef" class="editor-tabs" data-testid="editor-tabs">
    <div ref="tabsContainerRef" class="tabs-container" data-testid="tab-bar" @wheel="handleTabsWheel">
      <div
        v-for="tab in props.tabs"
        :key="tab.id"
        class="tab"
        data-testid="tab"
        :class="{
          active: tab.id === props.activeTabId,
          dirty: tab.isDirty,
          dragging: tab.id === draggingTabId,
          'drop-target': tab.id === dragOverTabId,
        }"
        draggable="true"
        @click="handleTabClick(tab.id)"
        @dblclick="startRename(tab)"
        @contextmenu.prevent="handleContextMenu($event, tab.id)"
        @dragstart="handleTabDragStart($event, tab.id)"
        @dragover.prevent="handleTabDragOver($event, tab.id)"
        @dragenter.prevent="handleTabDragOver($event, tab.id)"
        @drop="handleTabDrop($event, tab.id)"
        @dragend="handleTabDragEnd"
      >
        <span class="tab-icon" :class="{ untitled: tab.isUntitled }">
          <svg v-if="tab.isDirty" width="12" height="12" viewBox="0 0 12 12">
            <circle cx="6" cy="6" r="3" fill="currentColor" />
          </svg>
          <svg v-else-if="tab.isUntitled" width="12" height="12" viewBox="0 0 12 12">
            <rect x="2" y="2" width="8" height="8" rx="2" fill="currentColor" />
          </svg>
        </span>

        <div class="tab-meta">
          <input
            v-if="renameState.tabId === tab.id"
            ref="renameInput"
            class="tab-rename-input"
            :value="renameState.value"
            @click.stop
            @input="handleRenameInput"
            @blur="commitRename"
            @keydown.enter.prevent="commitRename"
            @keydown.esc.prevent="cancelRename"
          />
          <div v-else class="tab-name-row">
            <span class="tab-name" data-testid="tab-title">{{ tab.fileName }}</span>
            <span v-if="tab.isLoadingContent" class="tab-loading-pill">
              {{ getLoadingProgressLabel(tab) }}
            </span>
          </div>
          <span class="tab-path">{{ tab.isUntitled ? copy.unsaved : tab.filePath }}</span>
        </div>

        <button
          class="tab-close"
          data-testid="btn-close-tab"
          @click.stop="handleTabClose(tab.id)"
          :title="copy.close"
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

    <div
      v-if="contextMenu.visible"
      ref="contextMenuRef"
      class="context-menu"
      :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
      @click.stop
    >
      <div class="context-menu-item" data-testid="menu-close-others" @click="handleCloseOthers">
        {{ copy.closeOthers }}
      </div>
      <div class="context-menu-item" data-testid="menu-close-all" @click="handleCloseAll">
        {{ copy.closeAll }}
      </div>
      <div class="context-menu-item" @click="renameFromMenu">
        {{ copy.renameTab }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import type { Tab } from '@/stores/tabs';
import { useSettingsStore } from '@/stores/settings';
import { getEditorTabsI18n } from '@/i18n/ui';

interface EditorTabsProps {
  tabs?: Tab[];
  activeTabId?: string | null;
}

const props = withDefaults(defineProps<EditorTabsProps>(), {
  tabs: () => [],
  activeTabId: null,
});

const emit = defineEmits<{
  'tab-click': [tabId: string];
  'tab-close': [tabId: string];
  'tab-close-others': [tabId: string];
  'tab-close-all': [];
  'rename-tab': [tabId: string, name: string];
  'tabs-reorder': [orderedTabIds: string[]];
}>();

const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  tabId: null as string | null,
});

const renameInput = ref<HTMLInputElement | null>(null);
const contextMenuRef = ref<HTMLElement | null>(null);
const tabsRootRef = ref<HTMLElement | null>(null);
const tabsContainerRef = ref<HTMLDivElement | null>(null);
const settingsStore = useSettingsStore();
const copy = computed(() => getEditorTabsI18n(settingsStore.uiLanguage));
const renameState = ref({
  tabId: null as string | null,
  value: '',
});
const draggingTabId = ref<string | null>(null);
const dragOverTabId = ref<string | null>(null);
const CONTEXT_MENU_MARGIN = 8;

const clampMenuPosition = (x: number, y: number, maxWidth: number, maxHeight: number) => {
  const safeMaxX = Math.max(CONTEXT_MENU_MARGIN, maxWidth - CONTEXT_MENU_MARGIN);
  const safeMaxY = Math.max(CONTEXT_MENU_MARGIN, maxHeight - CONTEXT_MENU_MARGIN);

  return {
    x: Math.max(CONTEXT_MENU_MARGIN, Math.min(x, safeMaxX)),
    y: Math.max(CONTEXT_MENU_MARGIN, Math.min(y, safeMaxY)),
  };
};

const getLoadingProgressLabel = (tab: Tab) => {
  const progress = typeof tab.largeFileLoadProgress === 'number'
    ? Math.max(0, Math.min(100, Math.round(tab.largeFileLoadProgress)))
    : 0;
  return copy.value.loadingProgress(progress);
};

const handleTabClick = (tabId: string) => {
  emit('tab-click', tabId);
};

const handleTabClose = (tabId: string) => {
  emit('tab-close', tabId);
};

const openContextMenu = async (event: MouseEvent, tabId: string) => {
  const root = tabsRootRef.value;
  const rootRect = root?.getBoundingClientRect();
  const localX = rootRect ? event.clientX - rootRect.left : event.clientX;
  const localY = rootRect ? event.clientY - rootRect.top : event.clientY;
  const viewportWidth = rootRect?.width ?? window.innerWidth;
  const viewportHeight = rootRect?.height ?? window.innerHeight;
  const estimated = clampMenuPosition(localX, localY, viewportWidth - 180, viewportHeight - 160);

  contextMenu.value = {
    visible: true,
    x: estimated.x,
    y: estimated.y,
    tabId,
  };

  await nextTick();

  if (!contextMenu.value.visible || !contextMenuRef.value) {
    return;
  }

  const menuRect = contextMenuRef.value.getBoundingClientRect();
  const adjusted = clampMenuPosition(
    localX,
    localY,
    viewportWidth - menuRect.width - CONTEXT_MENU_MARGIN,
    viewportHeight - menuRect.height - CONTEXT_MENU_MARGIN,
  );

  contextMenu.value.x = adjusted.x;
  contextMenu.value.y = adjusted.y;
};

const handleContextMenu = (event: MouseEvent, tabId: string) => {
  void openContextMenu(event, tabId);
};

const handleCloseOthers = () => {
  if (contextMenu.value.tabId) {
    emit('tab-close-others', contextMenu.value.tabId);
  }
  contextMenu.value.visible = false;
};

const handleCloseAll = () => {
  emit('tab-close-all');
  contextMenu.value.visible = false;
};

const startRename = async (tab: Tab) => {
  renameState.value = {
    tabId: tab.id,
    value: tab.fileName,
  };
  contextMenu.value.visible = false;

  await nextTick();
  renameInput.value?.focus();
  renameInput.value?.select();
};

const renameFromMenu = () => {
  if (!contextMenu.value.tabId) return;
  const tab = props.tabs.find((item) => item.id === contextMenu.value.tabId);
  if (!tab) return;
  startRename(tab);
};

const handleRenameInput = (event: Event) => {
  renameState.value.value = (event.target as HTMLInputElement).value;
};

const cancelRename = () => {
  renameState.value = {
    tabId: null,
    value: '',
  };
};

const commitRename = () => {
  const tabId = renameState.value.tabId;
  const nextName = renameState.value.value.trim();

  if (tabId && nextName) {
    emit('rename-tab', tabId, nextName);
  }

  cancelRename();
};

const closeContextMenu = () => {
  contextMenu.value.visible = false;
};

const handleTabsWheel = (event: WheelEvent) => {
  const container = tabsContainerRef.value;
  if (!container || container.scrollWidth <= container.clientWidth) {
    return;
  }

  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) {
    return;
  }

  const previousScrollLeft = container.scrollLeft;
  container.scrollLeft += delta;
  if (container.scrollLeft !== previousScrollLeft) {
    event.preventDefault();
  }
};

const emitTabsReorder = (sourceTabId: string, targetTabId: string) => {
  if (sourceTabId === targetTabId) {
    return;
  }

  const orderedTabIds = props.tabs.map((tab) => tab.id);
  const sourceIndex = orderedTabIds.indexOf(sourceTabId);
  const targetIndex = orderedTabIds.indexOf(targetTabId);

  if (sourceIndex === -1 || targetIndex === -1) {
    return;
  }

  orderedTabIds.splice(sourceIndex, 1);
  orderedTabIds.splice(targetIndex, 0, sourceTabId);
  emit('tabs-reorder', orderedTabIds);
};

const handleTabDragStart = (event: DragEvent, tabId: string) => {
  draggingTabId.value = tabId;
  dragOverTabId.value = null;

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', tabId);
  }
};

const handleTabDragOver = (event: DragEvent, tabId: string) => {
  if (!draggingTabId.value || draggingTabId.value === tabId) {
    return;
  }

  dragOverTabId.value = tabId;
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
};

const handleTabDrop = (event: DragEvent, tabId: string) => {
  event.preventDefault();
  const sourceTabId = draggingTabId.value ?? event.dataTransfer?.getData('text/plain') ?? null;
  if (!sourceTabId) {
    return;
  }

  emitTabsReorder(sourceTabId, tabId);
  draggingTabId.value = null;
  dragOverTabId.value = null;
};

const handleTabDragEnd = () => {
  draggingTabId.value = null;
  dragOverTabId.value = null;
};

onMounted(() => {
  document.addEventListener('click', closeContextMenu);
});

onUnmounted(() => {
  document.removeEventListener('click', closeContextMenu);
});
</script>

<style scoped>
.editor-tabs {
  position: relative;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent),
    var(--panel, #131b2c);
  border-bottom: 1px solid var(--border-strong, #334155);
}

.tabs-container {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 46px;
  padding: 0 10px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.tabs-container::-webkit-scrollbar {
  display: none;
}

.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 160px;
  max-width: 240px;
  height: 34px;
  padding: 0 10px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: var(--surface-muted, rgba(255, 255, 255, 0.03));
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.tab:hover {
  background: var(--surface-hover, rgba(255, 255, 255, 0.06));
  border-color: var(--border-soft, rgba(148, 163, 184, 0.18));
}

.tab.active {
  background: var(--surface-raised, #1c2638);
  border-color: var(--border-strong, rgba(148, 163, 184, 0.3));
  color: var(--text-primary, #f8fafc);
  transform: translateY(1px);
}

.tab.dragging {
  opacity: 0.55;
}

.tab.drop-target {
  border-color: rgba(77, 171, 255, 0.7);
}

.tab-icon {
  display: flex;
  justify-content: center;
  width: 14px;
  color: var(--accent-amber, #ffd166);
  flex-shrink: 0;
}

.tab-icon.untitled {
  color: var(--accent-blue, #7cc7ff);
}

.tab-meta {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}

.tab-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
}

.tab-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.tab-loading-pill {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 1px 6px;
  font-size: 9px;
  line-height: 1.2;
  color: var(--accent-blue-strong, #4dabff);
  border: 1px solid color-mix(in srgb, var(--accent-blue-strong, #4dabff) 50%, transparent);
  background: color-mix(in srgb, var(--accent-blue-strong, #4dabff) 16%, transparent);
}

.tab-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted, #94a3b8);
  font-size: 10px;
}

.tab-rename-input {
  width: 100%;
  padding: 3px 7px;
  border-radius: 7px;
  border: 1px solid var(--accent-blue-strong, #4dabff);
  background: rgba(0, 0, 0, 0.16);
  color: var(--text-primary, #fff);
  font: inherit;
  outline: none;
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0;
}

.tab:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
}

.context-menu {
  position: absolute;
  z-index: 40;
  min-width: 160px;
  padding: 6px;
  border-radius: 12px;
  background: var(--surface-raised, #20242f);
  border: 1px solid var(--border-soft, #3d4354);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
}

.context-menu-item {
  padding: 10px 12px;
  border-radius: 8px;
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
}

.context-menu-item:hover {
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
}
</style>
