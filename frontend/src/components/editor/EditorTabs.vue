<template>
  <div class="editor-tabs" data-testid="editor-tabs">
    <div ref="tabsContainerRef" class="tabs-container" data-testid="tab-bar" @wheel="handleTabsWheel">
      <div
        v-for="tab in props.tabs"
        :key="tab.id"
        class="tab"
        data-testid="tab"
        :class="{ active: tab.id === props.activeTabId, dirty: tab.isDirty }"
        @click="handleTabClick(tab.id)"
        @dblclick="startRename(tab)"
        @contextmenu.prevent="handleContextMenu($event, tab.id)"
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
          <span v-else class="tab-name" data-testid="tab-title">{{ tab.fileName }}</span>
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
}>();

const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  tabId: null as string | null,
});

const renameInput = ref<HTMLInputElement | null>(null);
const tabsContainerRef = ref<HTMLDivElement | null>(null);
const settingsStore = useSettingsStore();
const copy = computed(() => getEditorTabsI18n(settingsStore.uiLanguage));
const renameState = ref({
  tabId: null as string | null,
  value: '',
});

const handleTabClick = (tabId: string) => {
  emit('tab-click', tabId);
};

const handleTabClose = (tabId: string) => {
  emit('tab-close', tabId);
};

const handleContextMenu = (event: MouseEvent, tabId: string) => {
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    tabId,
  };
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
  border-radius: 12px 12px 0 0;
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
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
  position: fixed;
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
