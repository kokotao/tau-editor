<template>
  <div ref="tabsRootRef" class="editor-tabs" data-testid="editor-tabs">
    <div
      ref="tabsContainerRef"
      class="tabs-container"
      data-testid="tab-bar"
      role="tablist"
      :aria-label="copy.tabsLabel"
      @wheel="handleTabsWheel"
    >
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
        role="tab"
        :aria-label="getTabTooltip(tab)"
        :aria-selected="tab.id === props.activeTabId"
        :tabindex="tab.id === props.activeTabId ? 0 : -1"
        draggable="true"
        @click="handleTabClick(tab.id)"
        @dblclick="startRename(tab)"
        @mouseenter="showTabTooltip($event, tab)"
        @mouseleave="hideTabTooltip"
        @focusin="showTabTooltip($event, tab, true)"
        @focusout="hideTabTooltip"
        @keydown="handleTabKeydown($event, tab.id)"
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
              <span class="tab-loading-label">{{ getLoadingPillLabel(tab) }}</span>
              <button
                v-if="tab.largeFileLoadState === 'failed' || tab.largeFileLoadState === 'cancelled'"
                type="button"
                class="tab-loading-action"
                data-testid="btn-retry-large-file-load"
                :title="copy.retryLoad"
                @click.stop="emit('retry-large-file-load', tab.id)"
              >
                {{ copy.retryLoad }}
              </button>
              <button
                v-else
                type="button"
                class="tab-loading-action"
                data-testid="btn-cancel-large-file-load"
                :title="copy.cancelLoad"
                @click.stop="emit('cancel-large-file-load', tab.id)"
              >
                {{ copy.cancelLoad }}
              </button>
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

    <Teleport to="body">
      <Transition name="tab-tooltip">
        <div
          v-if="tooltip.visible && tooltip.tab"
          class="tab-tooltip"
          data-testid="tab-tooltip"
          role="tooltip"
          :style="{ top: `${tooltip.y}px`, left: `${tooltip.x}px` }"
        >
          <strong>{{ tooltip.tab.fileName }}</strong>
          <span>{{ tooltip.tab.isUntitled ? copy.unsaved : tooltip.tab.filePath }}</span>
          <div class="tab-tooltip-footer">
            <em :class="{ dirty: tooltip.tab.isDirty }">
              {{ tooltip.tab.isDirty ? copy.unsaved : copy.saved }}
            </em>
            <span>{{ copy.renameHint }}</span>
            <span>{{ copy.moreActionsHint }}</span>
          </div>
        </div>
      </Transition>
    </Teleport>
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
  'cancel-large-file-load': [tabId: string];
  'retry-large-file-load': [tabId: string];
}>();

const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  tabId: null as string | null,
});

const renameInput = ref<HTMLInputElement | HTMLInputElement[] | null>(null);
const contextMenuRef = ref<HTMLElement | null>(null);
const tabsRootRef = ref<HTMLElement | null>(null);
const tabsContainerRef = ref<HTMLDivElement | null>(null);
const settingsStore = useSettingsStore();
const copy = computed(() => getEditorTabsI18n(settingsStore.uiLanguage));
const renameState = ref({
  tabId: null as string | null,
  value: '',
});
const tooltip = ref({
  visible: false,
  x: 0,
  y: 0,
  tab: null as Tab | null,
});
let tooltipTimer: ReturnType<typeof setTimeout> | null = null;
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

const getLoadingPillLabel = (tab: Tab) => {
  if (tab.largeFileLoadState === 'failed') {
    return copy.value.loadingFailed;
  }
  if (tab.largeFileLoadState === 'cancelled') {
    return copy.value.loadingCancelled;
  }
  return getLoadingProgressLabel(tab);
};

const handleTabClick = (tabId: string) => {
  emit('tab-click', tabId);
};

const handleTabKeydown = (event: KeyboardEvent, tabId: string) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    handleTabClick(tabId);
    return;
  }

  const currentIndex = props.tabs.findIndex((tab) => tab.id === tabId);
  if (currentIndex < 0 || props.tabs.length === 0) return;

  let targetIndex = currentIndex;
  if (event.key === 'ArrowRight') targetIndex = (currentIndex + 1) % props.tabs.length;
  else if (event.key === 'ArrowLeft') targetIndex = (currentIndex - 1 + props.tabs.length) % props.tabs.length;
  else if (event.key === 'Home') targetIndex = 0;
  else if (event.key === 'End') targetIndex = props.tabs.length - 1;
  else return;

  event.preventDefault();
  const targetTab = props.tabs[targetIndex];
  if (!targetTab) return;
  handleTabClick(targetTab.id);
  void nextTick(() => {
    const tabNodes = tabsContainerRef.value?.querySelectorAll<HTMLElement>('[data-testid="tab"]');
    tabNodes?.[targetIndex]?.focus();
  });
};

const handleTabClose = (tabId: string) => {
  hideTabTooltip();
  emit('tab-close', tabId);
};

const getTabTooltip = (tab: Tab) => {
  const location = tab.isUntitled ? copy.value.unsaved : tab.filePath || copy.value.unsaved;
  const state = tab.isDirty ? copy.value.unsaved : copy.value.saved;
  return `${tab.fileName}\n${location}\n${state} · ${copy.value.renameHint} · ${copy.value.moreActionsHint}`;
};

const hideTabTooltip = () => {
  if (tooltipTimer) {
    clearTimeout(tooltipTimer);
    tooltipTimer = null;
  }
  tooltip.value.visible = false;
};

const showTabTooltip = (event: MouseEvent | FocusEvent, tab: Tab, immediate = false) => {
  const target = event.currentTarget as HTMLElement | null;
  if (!target) return;

  const rect = target.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 16);
  const height = 104;
  const x = Math.min(Math.max(rect.left, 8), Math.max(8, window.innerWidth - width - 8));
  let y = rect.bottom + 8;
  if (y + height > window.innerHeight - 8) {
    y = Math.max(8, rect.top - height - 8);
  }

  if (tooltipTimer) {
    clearTimeout(tooltipTimer);
    tooltipTimer = null;
  }
  tooltip.value = { visible: false, x, y, tab };
  tooltipTimer = setTimeout(() => {
    if (tooltip.value.tab?.id === tab.id) {
      tooltip.value.visible = true;
    }
    tooltipTimer = null;
  }, immediate ? 0 : 320);
};

const openContextMenu = async (event: MouseEvent, tabId: string) => {
  hideTabTooltip();
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
  const input = Array.isArray(renameInput.value) ? renameInput.value[0] : renameInput.value;
  input?.focus();
  input?.select();
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
  hideTabTooltip();
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
  hideTabTooltip();
  document.removeEventListener('click', closeContextMenu);
});
</script>

<style scoped>
.editor-tabs {
  position: relative;
  background: var(--panel, #131b2c);
  border-bottom: 1px solid var(--border-strong, #334155);
}

.tabs-container {
  display: flex;
  align-items: center;
  gap: 3px;
  height: var(--tabs-height, 44px);
  padding: 0 8px;
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
  height: 36px;
  padding: 0 9px;
  border-radius: 0;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.tab:hover {
  background: var(--surface-hover, rgba(255, 255, 255, 0.06));
  border-color: var(--border-soft, rgba(148, 163, 184, 0.18));
  color: var(--text-primary, #f8fafc);
}

.tab.active {
  background: var(--surface-raised, #1c2638);
  border-color: var(--border-strong, rgba(148, 163, 184, 0.3));
  box-shadow: inset 0 2px 0 var(--accent-blue, #7cc7ff);
  color: var(--text-primary, #f8fafc);
}

.tab.active .tab-name {
  font-weight: 700;
}

.tab.dragging {
  opacity: 0.55;
}

.tab.drop-target {
  border-color: rgba(77, 171, 255, 0.7);
}

.tab:focus-visible {
  outline: 1px solid var(--accent-blue-strong, #4dabff);
  outline-offset: -2px;
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
  font-size: var(--font-size-ui-md, 13px);
  font-weight: 650;
}

.tab-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.tab-loading-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  border-radius: 0;
  padding: 1px 6px;
  font-size: 10px;
  line-height: 1.2;
  color: var(--accent-blue-strong, #4dabff);
  border: 1px solid color-mix(in srgb, var(--accent-blue-strong, #4dabff) 50%, transparent);
  background: color-mix(in srgb, var(--accent-blue-strong, #4dabff) 16%, transparent);
}

.tab-loading-label {
  white-space: nowrap;
}

.tab-loading-action {
  flex-shrink: 0;
  border: none;
  border-radius: 0;
  padding: 0 4px;
  background: color-mix(in srgb, var(--accent-blue-strong, #4dabff) 28%, transparent);
  color: inherit;
  font-size: 10px;
  line-height: 1.5;
  cursor: pointer;
}

.tab-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted, #94a3b8);
  font-size: 11px;
}

.tab-rename-input {
  width: 100%;
  padding: 3px 7px;
  border-radius: 0;
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
  border-radius: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.42;
  transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
}

.tab:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: color-mix(in srgb, var(--state-danger, #f87171) 18%, transparent);
  color: var(--state-danger, #f87171);
}

.tab-close:focus-visible {
  opacity: 1;
  outline: 1px solid var(--accent-blue-strong, #4dabff);
  outline-offset: 0;
}

.context-menu {
  position: absolute;
  z-index: 40;
  min-width: 160px;
  padding: 6px;
  border-radius: 0;
  background: var(--surface-raised, #20242f);
  border: 1px solid var(--border-soft, #3d4354);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.34);
}

.context-menu-item {
  padding: 10px 12px;
  border-radius: 0;
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
}

.context-menu-item:hover {
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
}

.tab-tooltip {
  position: fixed;
  z-index: 9999;
  display: flex;
  width: min(360px, calc(100vw - 16px));
  flex-direction: column;
  gap: 5px;
  padding: 10px 12px;
  border: 1px solid var(--border-strong, rgba(148, 163, 184, 0.3));
  border-radius: 0;
  background: color-mix(in srgb, var(--panel-elevated, #151d2d) 96%, transparent);
  color: var(--text-secondary, #b6c2d9);
  box-shadow: 0 16px 38px rgba(2, 6, 23, 0.38);
  pointer-events: none;
  backdrop-filter: blur(10px);
}

.tab-tooltip strong,
.tab-tooltip > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-tooltip strong {
  color: var(--text-primary, #ecf2ff);
  font-size: var(--font-size-ui-md, 13px);
}

.tab-tooltip > span {
  font-family: var(--font-code);
  font-size: var(--font-size-ui-xs, 11px);
  color: var(--text-muted, #75829e);
}

.tab-tooltip-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-top: 2px;
  padding-top: 7px;
  border-top: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  font-size: var(--font-size-ui-xs, 11px);
}

.tab-tooltip-footer em {
  color: var(--state-success, #4ade80);
  font-style: normal;
  font-weight: 700;
}

.tab-tooltip-footer em.dirty {
  color: var(--accent-amber, #ffd166);
}

.tab-tooltip-enter-active,
.tab-tooltip-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.tab-tooltip-enter-from,
.tab-tooltip-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
</style>
