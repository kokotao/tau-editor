<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useFileSystemStore } from '@/stores/fileSystem';
import { useWorkspaceStore } from '@/stores/workspace';
import { useTabsStore } from '@/stores/tabs';
import { useEditorStore } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';
import { useNotificationStore } from '@/stores/notification';
import { useKeyboardStore } from '@/stores/keyboard';
import { useCommandStore } from '@/stores/commands';
import { createCommandExecutor, createCommandRegistry } from '@/services/commandRegistry';
import { sessionService } from '@/services/sessionService';
import { createWorkspaceService } from '@/services/workspaceService';
import { createTabService } from '@/services/tabService';
import { createWindowService } from '@/services/windowService';
import CommandPalette from './components/editor/CommandPalette.vue';
import Toolbar from './components/editor/Toolbar.vue';
import FileTree from './components/editor/FileTree.vue';
import EditorTabs from './components/editor/EditorTabs.vue';
import EditorCore from './components/editor/EditorCore.vue';
import MarkdownPreview from './components/editor/MarkdownPreview.vue';
import StatusBar from './components/editor/StatusBar.vue';
import SettingsPanel from './components/editor/SettingsPanel.vue';
import Notification from './components/ui/Notification.vue';

const fileSystemStore = useFileSystemStore();
const workspaceStore = useWorkspaceStore();
const tabsStore = useTabsStore();
const editorStore = useEditorStore();
const settingsStore = useSettingsStore();
const notificationStore = useNotificationStore();
const keyboardStore = useKeyboardStore();
const commandStore = useCommandStore();
const workspaceService = createWorkspaceService(
  fileSystemStore,
  tabsStore,
  workspaceStore,
  editorStore,
  notificationStore,
);
const tabService = createTabService(
  tabsStore,
  fileSystemStore,
  editorStore,
  workspaceStore,
  notificationStore,
);
const windowService = createWindowService(settingsStore, tabsStore);

const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 420;
const isResizingSidebar = ref(false);
const sidebarWidth = ref(300);
const showSettingsPanel = ref(false);

const clampSidebarWidth = (value: number) =>
  Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value));

const fileTree = computed(() => fileSystemStore.fileTree);
const loading = computed(() => fileSystemStore.loading);
const selectedPath = computed(() => fileSystemStore.selectedPath);
const mode = computed(() => workspaceStore.mode);
const tabs = computed(() => tabsStore.tabs);
const activeTab = computed(() => tabsStore.activeTab);
const activeTabId = computed(() => tabsStore.activeTabId);
const cursorPosition = computed(() => editorStore.cursorPosition);
const language = computed(() => activeTab.value?.language ?? editorStore.language);
const autoSaveEnabled = computed(() => settingsStore.autoSaveEnabled);
const isDirty = computed(() => activeTab.value?.isDirty ?? false);
const isMarkdownTab = computed(() => activeTab.value?.language === 'markdown');
const markdownPreviewMode = computed(() => settingsStore.markdownPreviewMode);
const previewTheme = computed<'dark' | 'light'>(() => (settingsStore.theme === 'light' ? 'light' : 'dark'));
const canUndo = computed(() => editorStore.canUndo);
const canRedo = computed(() => editorStore.canRedo);
const lineCount = computed(() => editorStore.lineCount);
const wordCount = computed(() => {
  const content = activeTab.value?.content ?? '';
  return content.trim() ? content.trim().split(/\s+/).length : 0;
});
const filteredCommands = computed(() => commandStore.filteredCommands);
const highlightedCommand = computed(() => commandStore.highlightedCommand);
const showFileTree = computed({
  get: () => !settingsStore.sidebarCollapsed,
  set: (nextVisible: boolean) => {
    void settingsStore.updateSettings({ sidebarCollapsed: !nextVisible });
  },
});

watch(activeTab, (tab) => {
  tabService.syncTabToEditor(tab);
}, { immediate: true });

const handleNewFile = () => {
  workspaceService.createUntitledFile();
};

const openFileInEditor = async (filePath: string) => {
  await workspaceService.openFile(filePath);
};

const handleOpenFile = async () => {
  await workspaceService.openFileWithPicker();
};

const handleOpenFolder = async () => {
  const opened = await workspaceService.openFolderWithPicker();
  if (opened) {
    showFileTree.value = true;
  }
};

const handleSave = async () => {
  await tabService.saveActiveTab();
};

const handleSaveAs = async () => {
  await tabService.saveActiveTabAs();
};

const handleUndo = () => {
  notificationStore.info('撤销', '请使用编辑器内置撤销，快捷键为 Ctrl/Cmd + Z');
};

const handleRedo = () => {
  notificationStore.info('重做', '请使用编辑器内置重做，快捷键为 Ctrl/Cmd + Shift + Z');
};

const handleToggleFileTree = () => {
  showFileTree.value = !showFileTree.value;
};

const setMarkdownPreviewMode = (mode: 'edit' | 'split' | 'preview') => {
  void settingsStore.updateSettings({ markdownPreviewMode: mode });
};

const handleCycleMarkdownPreview = () => {
  if (!isMarkdownTab.value || !settingsStore.markdownPreviewEnabled) {
    return;
  }

  const order: Array<'edit' | 'split' | 'preview'> = ['edit', 'split', 'preview'];
  const currentIndex = order.indexOf(markdownPreviewMode.value);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextMode = order[(safeIndex + 1) % order.length] ?? 'split';
  setMarkdownPreviewMode(nextMode);
};

const handleToggleSettings = () => {
  showSettingsPanel.value = !showSettingsPanel.value;
};

const handleRefresh = async () => {
  await workspaceService.refreshWorkspace();
};

const handleFolderToggle = (folderPath: string) => {
  fileSystemStore.toggleFolder(folderPath);
};

const handleFileOpen = async (filePath: string) => {
  await openFileInEditor(filePath);
};

const handleTabClick = (tabId: string) => {
  tabService.activateTab(tabId);
};

const handleTabClose = (tabId: string) => {
  tabService.closeTab(tabId);
};

const handleCloseOthers = (tabId: string) => {
  tabService.closeOthers(tabId);
};

const handleCloseAll = () => {
  tabService.closeAll();
};

const handleRenameTab = async (tabId: string, nextName: string) => {
  await tabService.renameTab(tabId, nextName);
};

const handleContentChange = (content: string) => {
  tabService.updateActiveTabContent(content);
};

const handleCursorChange = (position: { line: number; column: number }) => {
  editorStore.updateCursorPosition(position.line, position.column);
};

const handleLanguageChange = (languageId: string) => {
  tabService.updateActiveTabLanguage(languageId);
};

const handleThemeChange = (theme: string) => {
  settingsStore.updateSettings({ monacoTheme: theme as 'vs' | 'vs-dark' | 'hc-black' });
};

const handleOpenCommandPalette = () => {
  commandStore.openPalette();
};

const commands = createCommandRegistry({
  newFile: handleNewFile,
  openFile: handleOpenFile,
  openFolder: handleOpenFolder,
  save: handleSave,
  saveAs: handleSaveAs,
  toggleSidebar: handleToggleFileTree,
  toggleSettings: handleToggleSettings,
  openCommandPalette: handleOpenCommandPalette,
});

commandStore.registerCommands(commands.map(({ id, title, category, shortcut, keywords }) => ({
  id,
  title,
  category,
  shortcut,
  keywords,
})));

const runCommand = createCommandExecutor(commands);

const executeCommand = async (id: string) => {
  try {
    await runCommand(id);
  } catch (error: any) {
    notificationStore.error('命令执行失败', error?.message || '未知命令');
  }
};

const handlePaletteSelect = async (id: string) => {
  commandStore.closePalette();
  await executeCommand(id);
};

const handlePaletteSelectHighlighted = async () => {
  if (!highlightedCommand.value) {
    return;
  }

  await handlePaletteSelect(highlightedCommand.value.id);
};

const registerShortcuts = () => {
  keyboardStore.register({
    id: 'new-file',
    key: 'n',
    modifiers: ['ctrl'],
    handler: () => void executeCommand('file.new'),
    description: '新建文件',
  });

  keyboardStore.register({
    id: 'open-file',
    key: 'o',
    modifiers: ['ctrl'],
    handler: () => void executeCommand('file.open'),
    description: '打开文件',
  });

  keyboardStore.register({
    id: 'save',
    key: 's',
    modifiers: ['ctrl'],
    handler: () => void executeCommand('file.save'),
    description: '保存文件',
  });

  keyboardStore.register({
    id: 'command-palette',
    key: 'p',
    modifiers: ['ctrl', 'shift'],
    handler: () => void executeCommand('commandPalette.open'),
    description: '打开命令面板',
  });

  keyboardStore.register({
    id: 'toggle-sidebar',
    key: 'b',
    modifiers: ['ctrl'],
    handler: handleToggleFileTree,
    description: '切换资源管理器',
  });
};

const startSidebarResize = (event: MouseEvent) => {
  if (!showFileTree.value) {
    return;
  }
  isResizingSidebar.value = true;
  const startX = event.clientX;
  const startWidth = sidebarWidth.value;

  const onMove = (moveEvent: MouseEvent) => {
    const nextWidth = clampSidebarWidth(startWidth + (moveEvent.clientX - startX));
    sidebarWidth.value = nextWidth;
  };

  const onUp = () => {
    isResizingSidebar.value = false;
    void settingsStore.updateSettings({ fileTreeWidth: sidebarWidth.value });
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
};

function restoreSession() {
  if (!settingsStore.restoreLastSession) {
    sessionService.clear();
    workspaceStore.setEmptyMode();
    tabsStore.closeAll();
    return;
  }

  const snapshot = sessionService.load();
  if (!snapshot) return;

  tabsStore.restoreSession(snapshot.tabs, snapshot.activeTabId);

  if (snapshot.workspacePath && snapshot.mode === 'workspace') {
    workspaceStore.openWorkspace(snapshot.workspacePath);
    void fileSystemStore.syncFromWorkspace();
  } else if (snapshot.tabs.length > 0) {
    workspaceStore.setMode('single-file');
  } else {
    workspaceStore.setEmptyMode();
  }
}

function saveSession() {
  if (!settingsStore.restoreLastSession) {
    sessionService.clear();
    return;
  }

  sessionService.save({
    mode: workspaceStore.mode,
    workspacePath: workspaceStore.currentWorkspacePath,
    workspaceName: workspaceStore.currentWorkspaceName,
    activeTabId: tabsStore.activeTabId,
    tabs: tabsStore.tabs,
  });
}

watch(
  () => ({
    mode: workspaceStore.mode,
    workspacePath: workspaceStore.currentWorkspacePath,
    workspaceName: workspaceStore.currentWorkspaceName,
    activeTabId: tabsStore.activeTabId,
    tabs: tabsStore.tabs,
  }),
  () => {
    saveSession();
  },
  { deep: true },
);

watch(
  () => settingsStore.restoreLastSession,
  (enabled) => {
    if (enabled) {
      saveSession();
      return;
    }

    sessionService.clear();
  },
);

watch(
  () => workspaceStore.currentWorkspacePath,
  (workspacePath) => {
    if (workspacePath) {
      return;
    }

    fileSystemStore.clearWorkspaceState();
  },
);

watch(
  () => settingsStore.fileTreeWidth,
  (width) => {
    sidebarWidth.value = clampSidebarWidth(width);
  },
);

watch(
  () => ({ tabCount: tabsStore.tabs.length, workspacePath: workspaceStore.currentWorkspacePath }),
  ({ tabCount, workspacePath }) => {
    if (tabCount === 0 && !workspacePath) {
      workspaceStore.setEmptyMode();
    }
  },
);

onMounted(async () => {
  workspaceStore.loadFromStorage();
  await settingsStore.init();
  sidebarWidth.value = clampSidebarWidth(settingsStore.fileTreeWidth);
  restoreSession();
  await windowService.attach();
  registerShortcuts();
});

onUnmounted(() => {
  saveSession();
  windowService.detach();
  keyboardStore.removeGlobalHandler();
});
</script>

<template>
  <div class="app-shell">
    <Notification />
    <CommandPalette
      :visible="commandStore.paletteOpen"
      :query="commandStore.query"
      :commands="filteredCommands"
      :highlighted-index="commandStore.highlightedIndex"
      @close="commandStore.closePalette()"
      @move="commandStore.moveHighlight"
      @highlight="commandStore.setHighlightedIndex"
      @select="handlePaletteSelect"
      @select-highlighted="handlePaletteSelectHighlighted"
      @update:query="commandStore.setQuery"
    />

    <Toolbar
      :can-undo="canUndo"
      :can-redo="canRedo"
      :is-dirty="isDirty"
      :sidebar-visible="showFileTree"
      :is-markdown="isMarkdownTab && settingsStore.markdownPreviewEnabled"
      :markdown-preview-mode="markdownPreviewMode"
      @new-file="handleNewFile"
      @open-file="() => executeCommand('file.open')"
      @open-folder="() => executeCommand('file.openFolder')"
      @save="() => executeCommand('file.save')"
      @save-as="() => executeCommand('file.saveAs')"
      @undo="handleUndo"
      @redo="handleRedo"
      @toggle-file-tree="() => executeCommand('view.toggleSidebar')"
      @toggle-settings="() => executeCommand('view.toggleSettings')"
      @cycle-markdown-preview="handleCycleMarkdownPreview"
    />

    <div class="main-layout">
      <aside
        v-show="showFileTree"
        class="sidebar"
        data-testid="sidebar-panel"
        :style="{ width: `${sidebarWidth}px` }"
      >
        <FileTree
          v-if="workspaceStore.currentWorkspacePath"
          :file-tree="fileTree"
          :loading="loading"
          :selected-path="selectedPath"
          @file-open="handleFileOpen"
          @folder-toggle="handleFolderToggle"
          @refresh="handleRefresh"
          @new-file="handleNewFile"
        />
        <div v-else class="sidebar-empty">
          <p class="sidebar-empty-title">资源管理器目前为空</p>
          <p class="sidebar-empty-text">当前模式是 {{ mode === 'single-file' ? '单文件编辑' : '空启动' }}，只有在你主动打开工作区后这里才会展示真实文件树。</p>
          <button class="sidebar-empty-action" @click="handleOpenFolder">选择文件夹</button>
        </div>
        <button class="sidebar-toggle-handle" data-testid="btn-sidebar-collapse" title="折叠资源管理器" @click="showFileTree = false">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15,18 9,12 15,6" />
          </svg>
        </button>
      </aside>
      <div
        v-if="showFileTree"
        class="sidebar-resizer"
        data-testid="sidebar-resizer"
        :class="{ dragging: isResizingSidebar }"
        @mousedown.prevent="startSidebarResize"
      ></div>
      <button v-else class="sidebar-expand-fab" data-testid="btn-sidebar-expand" title="展开资源管理器" @click="showFileTree = true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9,18 15,12 9,6" />
        </svg>
      </button>

      <section class="editor-panel">
        <EditorTabs
          :tabs="tabs"
          :active-tab-id="activeTabId"
          @tab-click="handleTabClick"
          @tab-close="handleTabClose"
          @tab-close-others="handleCloseOthers"
          @tab-close-all="handleCloseAll"
          @rename-tab="handleRenameTab"
        />

        <div
          v-if="activeTab"
          class="editor-stage"
          :class="{
            'markdown-stage': isMarkdownTab && settingsStore.markdownPreviewEnabled,
            [`markdown-mode-${markdownPreviewMode}`]: isMarkdownTab && settingsStore.markdownPreviewEnabled,
          }"
        >
          <div
            v-if="!isMarkdownTab || !settingsStore.markdownPreviewEnabled || markdownPreviewMode !== 'preview'"
            class="editor-pane"
          >
            <EditorCore
              :key="activeTab.id"
              :model-id="activeTab.id"
              :value="activeTab.content"
              :language="activeTab.language"
              :theme="settingsStore.monacoTheme"
              @content-change="handleContentChange"
              @cursor-change="handleCursorChange"
              @model-save="handleSave"
            />
          </div>
          <MarkdownPreview
            v-if="isMarkdownTab && settingsStore.markdownPreviewEnabled && markdownPreviewMode !== 'edit'"
            class="preview-pane"
            data-testid="markdown-preview-pane"
            :content="activeTab.content"
            :theme="previewTheme"
          />
        </div>

        <div v-else class="hero-empty">
          <div class="hero-actions minimal">
            <button class="hero-btn primary" @click="handleOpenFolder">打开文件夹</button>
            <button class="hero-btn" @click="handleOpenFile">打开文件</button>
            <button class="hero-btn" @click="handleNewFile">新建文件</button>
          </div>
        </div>
      </section>

      <aside v-show="showSettingsPanel" class="settings-sidebar">
        <SettingsPanel @close="showSettingsPanel = false" />
      </aside>
    </div>

    <StatusBar
      :cursor-position="cursorPosition"
      :language="language"
      :monaco-theme="settingsStore.monacoTheme"
      :auto-save-enabled="autoSaveEnabled"
      @language-change="handleLanguageChange"
      @theme-change="handleThemeChange"
    />

    <div class="floating-meta meta-left" data-testid="word-count">行数 {{ lineCount }} / 字数 {{ wordCount }}</div>
    <div class="floating-meta meta-right" data-testid="save-status">{{ isDirty ? '未保存更改' : '所有更改已保存' }}</div>
  </div>
</template>

<style>
:root {
  color-scheme: dark;
  --app-bg: #0b1020;
  --panel: #101726;
  --panel-elevated: #151d2d;
  --surface-muted: rgba(255, 255, 255, 0.04);
  --surface-hover: rgba(255, 255, 255, 0.08);
  --surface-raised: #192235;
  --border-soft: rgba(148, 163, 184, 0.18);
  --border-strong: rgba(148, 163, 184, 0.3);
  --text-primary: #ecf2ff;
  --text-secondary: #b6c2d9;
  --text-muted: #75829e;
  --accent-blue: #7cc7ff;
  --accent-blue-strong: #4dabff;
  --accent-amber: #ffd166;
}

:root.light {
  color-scheme: light;
  --app-bg: #eef3ff;
  --panel: #ffffff;
  --panel-elevated: #ffffff;
  --surface-muted: rgba(15, 23, 42, 0.03);
  --surface-hover: rgba(15, 23, 42, 0.06);
  --surface-raised: #f8fbff;
  --border-soft: rgba(51, 65, 85, 0.12);
  --border-strong: rgba(51, 65, 85, 0.18);
  --text-primary: #162033;
  --text-secondary: #49566d;
  --text-muted: #7b879d;
  --accent-blue: #2563eb;
  --accent-blue-strong: #1d4ed8;
  --accent-amber: #b45309;
}

* {
  box-sizing: border-box;
}

html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
}

body {
  background:
    radial-gradient(circle at top left, rgba(76, 146, 255, 0.18), transparent 28%),
    radial-gradient(circle at top right, rgba(85, 239, 196, 0.12), transparent 24%),
    var(--app-bg);
  color: var(--text-primary);
  font-family: 'SF Pro Display', 'PingFang SC', 'Segoe UI', sans-serif;
}
</style>

<style scoped>
.app-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.main-layout {
  display: flex;
  flex: 1;
  min-height: 0;
  position: relative;
}

.sidebar,
.settings-sidebar {
  flex-shrink: 0;
  border-right: 1px solid var(--border-soft);
  background: rgba(9, 14, 26, 0.52);
  backdrop-filter: blur(14px);
  min-height: 0;
  position: relative;
}

.settings-sidebar {
  width: 380px;
  border-left: 1px solid var(--border-soft);
  border-right: none;
}

.sidebar-empty {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 28px 20px;
  color: var(--text-secondary);
}

.sidebar-empty-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.sidebar-empty-text {
  line-height: 1.6;
  color: var(--text-muted);
}

.sidebar-empty-action {
  width: fit-content;
  min-width: 132px;
  height: 38px;
  padding: 0 14px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, var(--accent-blue-strong), #38bdf8);
  color: #fff;
  cursor: pointer;
}

.editor-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: rgba(8, 12, 22, 0.3);
}

.editor-stage {
  display: flex;
  flex: 1;
  flex-direction: row;
  min-height: 0;
  min-width: 0;
}

.editor-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.markdown-stage {
  display: flex;
  min-width: 0;
}

.markdown-stage.markdown-mode-split .editor-pane,
.markdown-stage.markdown-mode-split .preview-pane {
  width: 50%;
}

.markdown-stage.markdown-mode-split .preview-pane {
  border-left: 1px solid var(--border-soft);
}

.markdown-stage.markdown-mode-preview .preview-pane {
  width: 100%;
}

.preview-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.sidebar-toggle-handle {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 24px;
  height: 24px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--surface-muted);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.sidebar-resizer {
  width: 6px;
  cursor: col-resize;
  flex-shrink: 0;
  background: transparent;
  transition: background 0.15s ease;
}

.sidebar-resizer:hover,
.sidebar-resizer.dragging {
  background: rgba(77, 171, 255, 0.45);
}

.sidebar-expand-fab {
  position: absolute;
  top: 68px;
  left: 8px;
  z-index: 8;
  width: 28px;
  height: 28px;
  border-radius: 10px;
  border: 1px solid var(--border-soft);
  background: rgba(16, 23, 38, 0.85);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.hero-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.hero-card {
  max-width: 720px;
  padding: 36px;
  border-radius: 28px;
  background:
    radial-gradient(circle at top right, rgba(124, 199, 255, 0.16), transparent 26%),
    var(--panel);
  border: 1px solid var(--border-soft);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.22);
}

.hero-kicker {
  display: inline-flex;
  margin-bottom: 14px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(124, 199, 255, 0.12);
  color: var(--accent-blue);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.hero-card h1 {
  margin: 0 0 12px;
  font-size: 34px;
  line-height: 1.15;
}

.hero-card p {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.hero-recents {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.recent-block {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.recent-label {
  min-width: 64px;
  font-size: 12px;
  color: var(--text-muted);
}

.recent-chip {
  height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--border-soft);
  background: var(--surface-muted);
  color: var(--text-secondary);
  cursor: pointer;
}

.hero-btn {
  min-width: 120px;
  height: 42px;
  padding: 0 16px;
  border-radius: 14px;
  border: 1px solid var(--border-soft);
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}

.hero-btn.primary {
  border-color: transparent;
  background: linear-gradient(135deg, var(--accent-blue-strong), #38bdf8);
  color: white;
}

.floating-meta {
  position: fixed;
  bottom: 52px;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(16, 23, 38, 0.72);
  border: 1px solid var(--border-soft);
  color: var(--text-secondary);
  font-size: 12px;
  backdrop-filter: blur(12px);
}

.meta-left {
  left: 14px;
}

.meta-right {
  right: 14px;
}

@media (max-width: 960px) {
  .sidebar,
  .settings-sidebar {
    width: 260px;
  }

  .hero-card {
    padding: 24px;
  }

  .hero-card h1 {
    font-size: 28px;
  }
}
</style>
