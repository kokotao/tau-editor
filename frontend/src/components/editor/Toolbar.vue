<template>
  <div class="toolbar" data-testid="toolbar">
    <div class="toolbar-zone toolbar-zone-start">
      <div v-if="hasIdentity" class="toolbar-identity">
        <span v-if="appLabel" class="toolbar-app-label">{{ appLabel }}</span>
        <span v-if="workspaceLabel" class="toolbar-workspace-label">{{ workspaceLabel }}</span>
        <span v-if="currentFileLabel" class="toolbar-file-label">{{ currentFileLabel }}</span>
      </div>
    </div>

    <div class="toolbar-zone toolbar-zone-center">
      <div class="toolbar-group toolbar-group-main">
        <button class="toolbar-btn" data-testid="btn-new-file" @click="emit('new-file')" :title="copy.newFile">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14,2 14,8 20,8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        </button>
        <button class="toolbar-btn" data-testid="btn-open-file" @click="emit('open-file')" :title="copy.openFile">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14,2 14,8 20,8" />
          </svg>
        </button>
        <button class="toolbar-btn" data-testid="btn-open-folder" @click="emit('open-folder')" :title="copy.openFolder">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1" />
            <path d="M3 10h18l-2 8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
        </button>
        <button
          class="toolbar-btn"
          data-testid="btn-save"
          @click="emit('save')"
          :disabled="!isDirty"
          :class="{ disabled: !isDirty }"
          :title="copy.save"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17,21 17,13 7,13 7,21" />
            <polyline points="7,3 7,8 15,8" />
          </svg>
        </button>
        <button class="toolbar-btn" data-testid="btn-save-as" @click="emit('save-as')" :title="copy.saveAs">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17,21 17,13 7,13 7,21" />
            <polyline points="7,3 7,8 15,8" />
            <line x1="12" y1="10" x2="12" y2="16" />
            <line x1="9" y1="13" x2="15" y2="13" />
          </svg>
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <div class="toolbar-group toolbar-group-history">
        <button
          class="toolbar-btn"
          data-testid="btn-undo"
          @click="emit('undo')"
          :disabled="!canUndo"
          :class="{ disabled: !canUndo }"
          :title="copy.undo"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="1,4 1,10 7,10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </button>
        <button
          class="toolbar-btn"
          data-testid="btn-redo"
          @click="emit('redo')"
          :disabled="!canRedo"
          :class="{ disabled: !canRedo }"
          :title="copy.redo"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23,4 23,10 17,10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <div class="toolbar-group toolbar-group-views">
        <button
          class="toolbar-btn"
          data-testid="btn-toggle-file-tree"
          @click="emit('toggle-file-tree')"
          :title="sidebarVisible ? copy.collapseExplorer : copy.expandExplorer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="9" y1="4" x2="9" y2="20" />
          </svg>
        </button>
        <button
          v-if="isMarkdown"
          class="toolbar-btn"
          data-testid="btn-markdown-preview-mode"
          @click="emit('cycle-markdown-preview')"
          :title="`${copy.markdownViewPrefix}: ${previewModeLabel}`"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="8" y1="4" x2="8" y2="20" />
            <line x1="16" y1="4" x2="16" y2="20" />
          </svg>
        </button>
      </div>
    </div>

    <div class="toolbar-zone toolbar-zone-end">
      <div class="toolbar-group toolbar-status-group">
        <span class="toolbar-info" v-if="isDirty" data-testid="dirty-indicator">
          <span class="dirty-indicator">●</span>
          {{ copy.dirtyTip }}
        </span>
        <div ref="systemMenuRef" class="toolbar-system-menu" data-testid="system-menu">
          <button
            type="button"
            class="toolbar-system-trigger"
            data-testid="system-menu-trigger"
            :title="copy.systemMenuTitle"
            @click="toggleSystemMenu"
          >
            <span class="toolbar-system-label">{{ copy.systemMenu }}</span>
          </button>
          <div
            v-if="systemMenuOpen"
            class="toolbar-system-panel"
            data-testid="system-menu-panel"
            @click.stop
          >
            <input
              ref="systemMenuSearchInputRef"
              v-model="systemMenuQuery"
              class="toolbar-system-search"
              data-testid="system-menu-search"
              :placeholder="copy.systemMenuSearchPlaceholder"
              @keydown="handleSystemMenuKeydown"
            />
            <div
              v-if="flatFilteredActions.length === 0"
              class="toolbar-system-empty"
              data-testid="system-menu-empty"
            >
              {{ copy.systemMenuNoResult }}
            </div>
            <div
              v-for="group in groupedFilteredActions"
              :key="group.group"
              class="toolbar-system-group"
              :data-testid="`system-menu-group-${group.group}`"
            >
              <div class="toolbar-system-group-title">
                {{ copy.systemMenuGroups[group.group] }}
              </div>
              <button
                v-for="action in group.actions"
                :key="action.value"
                type="button"
                class="toolbar-system-item"
                :class="{ active: flatFilteredActions[activeMenuIndex]?.value === action.value }"
                :data-testid="`system-menu-item-${action.value}`"
                @mouseenter="setActiveAction(action.value)"
                @click="runSystemAction(action.value)"
              >
                {{ copy.systemMenuOptions[action.value] }}
              </button>
            </div>
          </div>
        </div>
        <button class="toolbar-btn" data-testid="btn-settings" @click="emit('toggle-settings')" :title="copy.settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l-.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { getToolbarI18n, type SystemMenuAction } from '@/i18n/ui';

interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  isMarkdown?: boolean;
  markdownPreviewMode?: 'edit' | 'split' | 'preview';
  sidebarVisible?: boolean;
  workspaceLabel?: string;
  currentFileLabel?: string;
  appLabel?: string;
}

const props = withDefaults(defineProps<ToolbarProps>(), {
  isMarkdown: false,
  markdownPreviewMode: 'split',
  sidebarVisible: true,
});

const settingsStore = useSettingsStore();
const copy = computed(() => getToolbarI18n(settingsStore.uiLanguage));
type SystemMenuGroupId = 'file' | 'view' | 'theme' | 'language';

const systemMenuActions: Array<{ value: SystemMenuAction; group: SystemMenuGroupId; keywords: string[] }> = [
  { value: 'file-new', group: 'file', keywords: ['new', 'file', '新建', '文件'] },
  { value: 'file-open', group: 'file', keywords: ['open', 'file', '打开', '文件'] },
  { value: 'file-open-folder', group: 'file', keywords: ['open', 'folder', 'workspace', '打开', '文件夹', '工作区'] },
  { value: 'file-save', group: 'file', keywords: ['save', '保存'] },
  { value: 'file-save-as', group: 'file', keywords: ['save as', '另存为', '导出'] },
  { value: 'refresh-workspace', group: 'file', keywords: ['refresh', 'workspace', '刷新', '工作区'] },
  { value: 'find-text', group: 'view', keywords: ['find', 'search', '查找', '搜索'] },
  { value: 'go-to-line', group: 'view', keywords: ['line', 'goto', '跳转', '行'] },
  { value: 'open-command-palette', group: 'view', keywords: ['f1', 'palette', 'command', '命令', '面板'] },
  { value: 'toggle-explorer', group: 'view', keywords: ['explorer', 'sidebar', '资源', '侧栏'] },
  { value: 'toggle-settings', group: 'view', keywords: ['settings', 'preferences', '设置', '偏好'] },
  { value: 'toggle-theme', group: 'theme', keywords: ['theme', 'dark', 'light', '主题', '深色', '浅色'] },
  { value: 'theme-light', group: 'theme', keywords: ['theme', 'light', '浅色', '亮色'] },
  { value: 'theme-dark', group: 'theme', keywords: ['theme', 'dark', '深色', '暗色'] },
  { value: 'theme-system', group: 'theme', keywords: ['theme', 'system', '跟随', '系统'] },
  { value: 'cycle-language-mode', group: 'language', keywords: ['language', 'mode', '语言', '模式'] },
  { value: 'language-plaintext', group: 'language', keywords: ['plaintext', 'text', '纯文本'] },
  { value: 'language-markdown', group: 'language', keywords: ['markdown', 'md'] },
  { value: 'language-typescript', group: 'language', keywords: ['typescript', 'ts'] },
  { value: 'language-python', group: 'language', keywords: ['python', 'py'] },
  { value: 'language-json', group: 'language', keywords: ['json'] },
];
const groupOrder: SystemMenuGroupId[] = ['file', 'view', 'theme', 'language'];
const systemMenuRef = ref<HTMLElement | null>(null);
const systemMenuSearchInputRef = ref<HTMLInputElement | null>(null);
const systemMenuOpen = ref(false);
const systemMenuQuery = ref('');
const activeMenuIndex = ref(0);

const filteredActions = computed(() => {
  const keyword = systemMenuQuery.value.trim().toLowerCase();
  if (!keyword) {
    return systemMenuActions;
  }

  return systemMenuActions.filter((action) => {
    const label = copy.value.systemMenuOptions[action.value].toLowerCase();
    if (label.includes(keyword)) return true;
    return action.keywords.some((item) => item.toLowerCase().includes(keyword));
  });
});

const groupedFilteredActions = computed(() =>
  groupOrder
    .map((group) => ({
      group,
      actions: filteredActions.value.filter((action) => action.group === group),
    }))
    .filter((entry) => entry.actions.length > 0)
);

const flatFilteredActions = computed(() =>
  groupedFilteredActions.value.flatMap((entry) => entry.actions)
);

const previewModeLabel = computed(() => copy.value.previewModeLabels[props.markdownPreviewMode]);
const hasIdentity = computed(
  () => Boolean(props.appLabel?.length || props.workspaceLabel?.length || props.currentFileLabel?.length)
);

const emit = defineEmits<{
  'new-file': [];
  'open-file': [];
  'open-folder': [];
  'save': [];
  'save-as': [];
  'undo': [];
  'redo': [];
  'toggle-file-tree': [];
  'toggle-settings': [];
  'cycle-markdown-preview': [];
  'system-action': [action: SystemMenuAction];
}>();

const closeSystemMenu = () => {
  systemMenuOpen.value = false;
  systemMenuQuery.value = '';
  activeMenuIndex.value = 0;
};

const runSystemAction = (action: SystemMenuAction) => {
  emit('system-action', action);
  closeSystemMenu();
};

const toggleSystemMenu = async () => {
  systemMenuOpen.value = !systemMenuOpen.value;
  if (systemMenuOpen.value) {
    systemMenuQuery.value = '';
    activeMenuIndex.value = 0;
    await nextTick();
    systemMenuSearchInputRef.value?.focus();
  }
};

const setActiveAction = (action: SystemMenuAction) => {
  const index = flatFilteredActions.value.findIndex((item) => item.value === action);
  if (index >= 0) {
    activeMenuIndex.value = index;
  }
};

const handleSystemMenuKeydown = (event: KeyboardEvent) => {
  const actions = flatFilteredActions.value;

  if (event.key === 'Escape') {
    event.preventDefault();
    closeSystemMenu();
    return;
  }

  if (actions.length === 0) {
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeMenuIndex.value = (activeMenuIndex.value + 1) % actions.length;
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeMenuIndex.value = (activeMenuIndex.value - 1 + actions.length) % actions.length;
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    const targetAction = actions[activeMenuIndex.value];
    if (targetAction) {
      runSystemAction(targetAction.value);
    }
  }
};

const handleDocumentPointerDown = (event: MouseEvent) => {
  if (!systemMenuOpen.value) {
    return;
  }
  const target = event.target as Node | null;
  if (target && systemMenuRef.value?.contains(target)) {
    return;
  }
  closeSystemMenu();
};

watch(systemMenuQuery, () => {
  activeMenuIndex.value = 0;
});

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentPointerDown);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentPointerDown);
});
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 14px;
  gap: 6px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent),
    var(--panel-elevated, #151d2d);
  border-bottom: 1px solid var(--border-strong, rgba(148, 163, 184, 0.3));
  user-select: none;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-zone {
  display: flex;
  align-items: center;
  min-height: 100%;
}

.toolbar-zone-center {
  flex: 1;
  gap: 8px;
  justify-content: center;
}

.toolbar-zone-start,
.toolbar-zone-end {
  flex: 0;
}

.toolbar-group-main .toolbar-btn {
  border-radius: 12px;
}

.toolbar-group-history,
.toolbar-group-views {
  gap: 4px;
}

.toolbar-status-group {
  gap: 10px;
}

.toolbar-system-menu {
  position: relative;
}

.toolbar-system-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.2));
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
}

.toolbar-system-trigger:hover {
  border-color: var(--border-strong, rgba(148, 163, 184, 0.3));
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
}

.toolbar-system-label {
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
  white-space: nowrap;
}

.toolbar-system-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 280px;
  max-height: 360px;
  overflow: auto;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.2));
  background: var(--surface-raised, #1b2436);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.3);
  z-index: 40;
}

.toolbar-system-search {
  width: 100%;
  height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.2));
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary, #f8fafc);
  outline: none;
}

.toolbar-system-search:focus {
  border-color: var(--accent-blue-strong, #4dabff);
}

.toolbar-system-empty {
  padding: 12px 10px;
  color: var(--text-muted, #94a3b8);
  font-size: 12px;
}

.toolbar-system-group {
  margin-top: 8px;
}

.toolbar-system-group-title {
  padding: 4px 8px;
  font-size: 11px;
  color: var(--text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.toolbar-system-item {
  width: 100%;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary, #cbd5e1);
  text-align: left;
  padding: 8px 10px;
  font-size: 13px;
  cursor: pointer;
}

.toolbar-system-item:hover,
.toolbar-system-item.active {
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
  color: var(--text-primary, #f8fafc);
}

.toolbar-identity {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toolbar-identity span {
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
  white-space: nowrap;
}

.toolbar-app-label {
  font-weight: 600;
  color: var(--text-primary, #f8fafc);
}

.toolbar-workspace-label {
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.toolbar-file-label {
  color: var(--accent-cyan, #22d3ee);
}

.toolbar-divider {
  width: 1px;
  height: 28px;
  margin: 0 6px;
  background: var(--border-soft, rgba(148, 163, 184, 0.18));
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.toolbar-btn:hover:not(.disabled) {
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
  border-color: var(--border-soft, rgba(148, 163, 184, 0.18));
  color: var(--text-primary, #f8fafc);
  transform: translateY(-1px);
}

.toolbar-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-spacer {
  flex: 1;
}

.toolbar-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 999px;
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  color: var(--text-secondary, #cbd5e1);
  font-size: 12px;
}

.dirty-indicator {
  color: var(--accent-amber, #ffd166);
  font-size: 10px;
}
</style>
