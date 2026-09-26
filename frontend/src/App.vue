<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { open as openFileDialog, save as saveFileDialog } from '@tauri-apps/plugin-dialog';
import { useFileSystemStore, type FileTreeNode } from '@/stores/fileSystem';
import { useWorkspaceStore } from '@/stores/workspace';
import { useTabsStore, type Tab } from '@/stores/tabs';
import { useEditorStore } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';
import { useNotificationStore } from '@/stores/notification';
import { useKeyboardStore } from '@/stores/keyboard';
import { useCommandStore } from '@/stores/commands';
import { useFileConflictsStore } from '@/stores/fileConflicts';
import { useDiffStore } from '@/stores/diff';
import {
  loadGitDiffSession,
  loadWorkspaceFileDiffSession,
  type DiffSessionResult,
} from '@/services/diffService';
import {
  consumePendingWindowTransfer,
  openTabsInNewWindow,
  payloadToTabs,
} from '@/services/windowTransferService';
import type { WindowTransferPayload } from '@/lib/tauri';
import { providerRegistry } from '@/services/providerRegistry';
import { registerBuiltinProviders } from '@/services/providers/builtinProviders';
import { useProvidersStore } from '@/stores/providers';
import { createCommandExecutor, createCommandRegistry } from '@/services/commandRegistry';
import type { AppCommand } from '@/services/commandRegistry';
import {
  createWorkspaceWatcherService,
  normalizeWorkspacePath,
} from '@/services/workspaceWatcherService';
import { sessionService } from '@/services/sessionService';
import { createWorkspaceService } from '@/services/workspaceService';
import { createTabService } from '@/services/tabService';
import { createWindowService } from '@/services/windowService';
import { buildDocumentOutline } from '@/services/documentOutlineService';
import { collectMarkdownContext } from '@/services/markdownService';
import {
  flattenWorkspaceTasks,
  importMarkdownAsset,
  loadMarkdownLinkStatuses,
  loadWorkspaceTasks,
} from '@/services/markdownContextService';
import { rankQuickOpenFiles } from '@/services/quickOpenService';
import { resolveWorkbenchSidebarVisibility } from '@/utils/workbenchLayout';
import {
  DEFAULT_KEYBINDINGS,
  formatKeybinding,
  keybindingToShortcut,
  resolveKeybinding,
  resolveKeybindings,
} from '@/services/keybindingService';
import {
  appCommands,
  fileCommands,
  gitCommands,
  isTauriApp,
  type GitStatusResponse,
  type WorkspaceFileChange,
  searchCommands,
  replaceCommands,
  type WorkspaceSearchMatch,
  type WorkspaceReplaceFileResult,
  type WorkspaceReplacePreviewResponse,
  workspaceCommands,
} from '@/lib/tauri';
import type { MarkdownLinkStatus, WorkspaceTaskResponse } from '@/lib/tauri';
import { normalizeModifiedTimestamp, resolveExternalFileSyncAction } from '@/services/externalFileSync';
import {
  getAppI18n,
  getCommandText,
  type CommandId,
  type EditorLanguageMode,
  type SystemMenuAction,
} from '@/i18n/ui';
import CommandPalette from './components/editor/CommandPalette.vue';
import WorkspaceSearchPanel from './components/editor/WorkspaceSearchPanel.vue';
import ReplacePreviewDialog from './components/editor/ReplacePreviewDialog.vue';
import Toolbar from './components/editor/Toolbar.vue';
import FileTree from './components/editor/FileTree.vue';
import EditorTabs from './components/editor/EditorTabs.vue';
import { LazyEditorCore } from './components/editor/LazyEditorCore';
import MarkdownPreview from './components/editor/MarkdownPreview.vue';
import ContextRail from './components/editor/ContextRail.vue';
import DiffView from './components/editor/DiffView.vue';
import ExternalChangeDialog from './components/editor/ExternalChangeDialog.vue';
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
const fileConflictsStore = useFileConflictsStore();
const diffStore = useDiffStore();
const providersStore = useProvidersStore();
const workspaceService = createWorkspaceService(
  fileSystemStore,
  tabsStore,
  workspaceStore,
  editorStore,
  settingsStore,
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
const workspaceWatcherService = createWorkspaceWatcherService();
const LANGUAGE_MODE_ORDER: EditorLanguageMode[] = [
  'plaintext',
  'javascript',
  'typescript',
  'python',
  'java',
  'c',
  'cpp',
  'csharp',
  'go',
  'rust',
  'html',
  'css',
  'scss',
  'json',
  'xml',
  'markdown',
  'yaml',
  'sql',
  'shell',
];
const FILE_LANGUAGE_MAP: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  vue: 'vue',
  py: 'python',
  java: 'java',
  rs: 'rust',
  md: 'markdown',
  json: 'json',
  html: 'html',
  css: 'css',
  scss: 'scss',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  sql: 'sql',
  sh: 'shell',
  bat: 'shell',
  cmd: 'shell',
  go: 'go',
  c: 'c',
  cpp: 'cpp',
  cs: 'csharp',
};

const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 420;
const MIN_CONTEXT_RAIL_WIDTH = 240;
const MAX_CONTEXT_RAIL_WIDTH = 420;
const isResizingSidebar = ref(false);
const isResizingContextRail = ref(false);
const sidebarWidth = ref(300);
const contextRailWidth = ref(300);
const fileTreeDrawerOpen = ref(false);
const contextRailDrawerOpen = ref(false);
const paletteMode = ref<'commands' | 'quick-open'>('commands');
const workspaceRuntimeId = ref<string | null>(null);
const gitStatus = ref<GitStatusResponse | null>(null);
const workspaceSearchOpen = ref(false);
const workspaceSearchQuery = ref('');
const workspaceSearchResults = ref<WorkspaceSearchMatch[]>([]);
const workspaceSearchLoading = ref(false);
const workspaceSearchError = ref<string | null>(null);
const workspaceSearchCancelled = ref(false);
const workspaceReplaceReplacement = ref('');
const replacePreviewVisible = ref(false);
const replacePreview = ref<WorkspaceReplacePreviewResponse | null>(null);
const replacePreviewLoading = ref(false);
const replacePreviewError = ref<string | null>(null);
const replaceApplying = ref(false);
const replaceResults = ref<WorkspaceReplaceFileResult[]>([]);
const replaceUndoId = ref<string | null>(null);
const replaceUndoBusy = ref(false);
const replaceUndone = ref(false);
// 一次预览只能提交一次：后端在 apply 时会消费 previewId。
const replacePreviewConsumed = ref(false);
const markdownLinkStatuses = ref<Record<string, MarkdownLinkStatus>>({});
const workspaceTasks = ref<WorkspaceTaskResponse | null>(null);
const workspaceTasksWorkspaceId = ref<string | null>(null);
const workspaceTasksLoading = ref(false);
const markdownAssetImporting = ref(false);
const viewportWidth = ref(typeof window === 'undefined' ? 1280 : window.innerWidth);
const syncViewportWidth = () => {
  viewportWidth.value = window.innerWidth;
};
type SettingsContainer = 'workspace' | 'drawer';
type SettingsCategory = 'general' | 'editor' | 'fileAssociations' | 'updates' | 'about';
const settingsContainer = ref<SettingsContainer | null>(null);
const activeSettingsCategory = ref<SettingsCategory>('general');
const fileTreeContextEntry = ref<FileTreeNode | null>(null);
const editorScrollState = ref<{ top: number; height: number; scrollHeight: number } | null>(null);
type EditorCoreExpose = {
  getContent: () => string;
  focusAtStart: () => void;
  insertText: (text: string) => void;
  layout: () => void;
  triggerFindWidget: () => void;
  triggerGoToLine: () => void;
  revealLine: (line: number, column?: number) => void;
};
const editorCoreRef = ref<EditorCoreExpose | null>(null);
type MarkdownPreviewExpose = { scrollToSourceLine: (line: number) => void };
const markdownPreviewRef = ref<MarkdownPreviewExpose | null>(null);
const FIRST_INSTALL_GUIDE_KEY = 'text-editor-first-install-guide-v1';
const GUIDE_LAST_OPENED_AT_KEY = 'text-editor-last-opened-at-v1';
const GUIDE_LAST_SHOWN_AT_KEY = 'text-editor-guide-last-shown-at-v1';
const GUIDE_REOPEN_DAYS = 14;
const GUIDE_REOPEN_INTERVAL_MS = GUIDE_REOPEN_DAYS * 24 * 60 * 60 * 1000;
const SESSION_SAVE_DEBOUNCE_MS = 600;
const LARGE_FILE_WORD_COUNT_THRESHOLD_CHARS = 500_000;
const EXTERNAL_FILE_SYNC_INTERVAL_MS = 1500;
const MARKDOWN_ASSET_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'];
const externalConflictDialogOpen = ref(false);
const externalConflictBusy = ref(false);
let unlistenExternalOpen: (() => void) | null = null;
let sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
let externalFileSyncTimer: ReturnType<typeof setInterval> | null = null;
let externalFileSyncInFlight = false;

const clampSidebarWidth = (value: number) =>
  Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value));
const clampContextRailWidth = (value: number) =>
  Math.min(MAX_CONTEXT_RAIL_WIDTH, Math.max(MIN_CONTEXT_RAIL_WIDTH, value));
const normalizeFsPath = (path: string) => path.replace(/\\/g, '/');
const getBaseNameFromFsPath = (path: string) =>
  normalizeFsPath(path).split('/').filter(Boolean).pop() ?? path;
const getParentFsPath = (path: string) => {
  const normalized = normalizeFsPath(path);
  const index = normalized.lastIndexOf('/');
  return index > 0 ? normalized.slice(0, index) : '';
};
const joinFsPath = (dir: string, name: string) => {
  const base = normalizeFsPath(dir).replace(/\/+$/, '');
  const leaf = name.trim().replace(/^\/+/, '');
  return `${base}/${leaf}`;
};
const detectLanguageFromFileName = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return FILE_LANGUAGE_MAP[ext] ?? 'plaintext';
};
const getContextBaseDirectory = () => {
  const entry = fileTreeContextEntry.value;
  if (entry?.type === 'folder') {
    return normalizeFsPath(entry.path);
  }
  if (entry?.type === 'file') {
    return getParentFsPath(entry.path);
  }
  return workspaceStore.currentWorkspacePath ? normalizeFsPath(workspaceStore.currentWorkspacePath) : '';
};
const isPathUnderFolder = (path: string, folderPath: string) => {
  const normalizedPath = normalizeFsPath(path);
  const normalizedFolder = normalizeFsPath(folderPath);
  return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`);
};
const estimateTabsMemoryBytes = (additionalContent = '') =>
  tabsStore.tabs.reduce((total, tab) => total + tab.content.length * 2, 0) + additionalContent.length * 2;
const ensureAdditionalTabCapacity = (additionalContent: string, sourceLabel: string) => {
  const maxOpenTabs = Math.max(1, Math.floor(settingsStore.maxOpenTabs));
  const memoryLimitMB = Math.max(64, Math.floor(settingsStore.memoryLimitMB));
  const memoryLimitBytes = memoryLimitMB * 1024 * 1024;

  if (tabsStore.tabs.length >= maxOpenTabs) {
    const title = settingsStore.uiLanguage === 'en-US' ? 'Tab limit reached' : '已达到标签页上限';
    const message = settingsStore.uiLanguage === 'en-US'
      ? `Cannot open ${sourceLabel}. Close a tab or increase max open tabs in settings.`
      : `无法打开 ${sourceLabel}。请先关闭一些标签，或在设置里提高最大标签页数量。`;
    notificationStore.warning(title, message);
    return false;
  }

  const estimatedBytes = estimateTabsMemoryBytes(additionalContent);
  if (estimatedBytes > memoryLimitBytes) {
    const title = settingsStore.uiLanguage === 'en-US' ? 'Memory limit reached' : '已达到标签内存上限';
    const message = settingsStore.uiLanguage === 'en-US'
      ? `Estimated tab memory exceeds ${memoryLimitMB}MB. Close tabs or raise memory limit in settings.`
      : `预计标签内存将超过 ${memoryLimitMB}MB。请关闭部分标签，或在设置里提高内存上限。`;
    notificationStore.warning(title, message);
    return false;
  }

  return true;
};

const fileTree = computed(() => fileSystemStore.fileTree);
const loading = computed(() => fileSystemStore.loading);
const selectedPath = computed(() => fileSystemStore.selectedPath);
const mode = computed(() => workspaceStore.mode);
const tabs = computed(() => tabsStore.tabs);
const openedModelIds = computed(() => tabsStore.tabs.map((tab) => tab.id));
const activeTab = computed(() => tabsStore.activeTab);
const activeTabId = computed(() => tabsStore.activeTabId);
const cursorPosition = computed(() => editorStore.cursorPosition);
const encoding = computed(() => editorStore.encoding);
const language = computed(() => activeTab.value?.language ?? editorStore.language);
const autoSaveEnabled = computed(() => settingsStore.autoSaveEnabled);
const lastSaveTime = computed(() => editorStore.lastAutoSaveTime ?? undefined);
const isDirty = computed(() => activeTab.value?.isDirty ?? false);
const isMarkdownTab = computed(() => activeTab.value?.language === 'markdown');
const markdownPreviewMode = computed(() => settingsStore.markdownPreviewMode);
const previewTheme = computed<'dark' | 'light'>(() => settingsStore.previewTheme);
const canUndo = computed(() => editorStore.canUndo);
const canRedo = computed(() => editorStore.canRedo);
const lineCount = computed(() => editorStore.lineCount);
const wordCount = computed(() => {
  const tab = activeTab.value;
  if (!tab) {
    return 0;
  }

  if (tab.isLargeFile || tab.content.length > LARGE_FILE_WORD_COUNT_THRESHOLD_CHARS) {
    return -1;
  }

  const content = tab.content;
  return content.trim() ? content.trim().split(/\s+/).length : 0;
});
const appText = computed(() => getAppI18n(settingsStore.uiLanguage));
const workspaceLabel = computed(() => workspaceStore.currentWorkspaceName ?? appText.value.workspaceNotOpen);
const currentFileLabel = computed(() => {
  if (!activeTab.value) {
    return appText.value.fileNotOpen;
  }

  return activeTab.value.fileName;
});
const currentModeLabel = computed(() =>
  mode.value === 'single-file' ? appText.value.singleFileMode : appText.value.emptyMode,
);
const filteredCommands = computed(() => commandStore.filteredCommands);
const flattenFileTree = (nodes: FileTreeNode[]): Array<{ path: string; name: string }> => nodes.flatMap((node) => [
  ...(node.type === 'file' ? [{ path: node.path, name: node.name }] : []),
  ...(node.children ? flattenFileTree(node.children) : []),
]);
const quickOpenCommands = computed(() => rankQuickOpenFiles(
  flattenFileTree(fileSystemStore.fileTree),
  commandStore.query,
).map((file) => ({
  id: `quick-open:${file.path}`,
  title: file.name,
  category: 'workspace' as const,
  keywords: [file.path],
})));
const paletteCommands = computed(() => paletteMode.value === 'quick-open'
  ? quickOpenCommands.value
  : filteredCommands.value);
const highlightedCommand = computed(() => paletteCommands.value[commandStore.highlightedIndex] ?? paletteCommands.value[0] ?? null);
const documentOutline = computed(() => {
  const tab = activeTab.value;
  if (!tab || tab.isLargeFile) {
    return [];
  }
  return buildDocumentOutline({ content: tab.content, language: tab.language });
});
const markdownContext = computed(() => {
  const tab = activeTab.value;
  if (!tab || tab.isLargeFile || tab.language !== 'markdown') {
    return { tasks: [], links: [] };
  }
  return collectMarkdownContext(tab.content);
});
const workspaceTaskEntries = computed(() => flattenWorkspaceTasks(workspaceTasks.value));
const workspaceTaskTotal = computed(() => workspaceTasks.value?.totalTasks ?? 0);
const workspaceTasksTruncated = computed(() => workspaceTasks.value?.truncated ?? false);
const workbenchSidebarVisibility = computed(() => resolveWorkbenchSidebarVisibility({
  viewportWidth: viewportWidth.value,
  sidebarCollapsed: settingsStore.sidebarCollapsed,
  contextRailCollapsed: settingsStore.contextRailCollapsed,
  fileTreeDrawerOpen: fileTreeDrawerOpen.value,
  contextRailDrawerOpen: contextRailDrawerOpen.value,
}));
const isFileTreeDrawerBreakpoint = computed(() => viewportWidth.value < 1024);
const isContextRailDrawerBreakpoint = computed(() =>
  viewportWidth.value < 800 || (viewportWidth.value >= 1024 && viewportWidth.value < 1280),
);
const showFileTree = computed({
  get: () => workbenchSidebarVisibility.value.fileTreeVisible,
  set: (nextVisible: boolean) => {
    if (isFileTreeDrawerBreakpoint.value) {
      fileTreeDrawerOpen.value = nextVisible;
      if (nextVisible) {
        contextRailDrawerOpen.value = false;
        void settingsStore.updateSettings({ sidebarCollapsed: false, contextRailCollapsed: true });
        return;
      }
      void settingsStore.updateSettings({ sidebarCollapsed: true });
      return;
    }
    void settingsStore.updateSettings({ sidebarCollapsed: !nextVisible });
  },
});
const showContextRail = computed({
  get: () => workbenchSidebarVisibility.value.contextRailVisible,
  set: (nextVisible: boolean) => {
    if (isContextRailDrawerBreakpoint.value) {
      contextRailDrawerOpen.value = nextVisible;
      if (viewportWidth.value < 800) {
        fileTreeDrawerOpen.value = false;
        void settingsStore.updateSettings({
          sidebarCollapsed: nextVisible,
          contextRailCollapsed: !nextVisible,
        });
        return;
      }
      void settingsStore.updateSettings({ contextRailCollapsed: !nextVisible });
      return;
    }
    if (nextVisible && viewportWidth.value >= 800 && viewportWidth.value < 1024) {
      fileTreeDrawerOpen.value = false;
      void settingsStore.updateSettings({ sidebarCollapsed: true, contextRailCollapsed: false });
      return;
    }
    void settingsStore.updateSettings({ contextRailCollapsed: !nextVisible });
  },
});

watch(viewportWidth, () => {
  if (isFileTreeDrawerBreakpoint.value) {
    fileTreeDrawerOpen.value = false;
  }
  if (isContextRailDrawerBreakpoint.value) {
    contextRailDrawerOpen.value = false;
  }
});

watch(activeTab, (tab) => {
  tabService.syncTabToEditor(tab);
}, { immediate: true });

const handleNewFile = () => {
  workspaceService.createUntitledFile();
  void nextTick(() => {
    editorCoreRef.value?.focusAtStart();
  });
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
  syncActiveEditorContent();
  await tabService.saveActiveTab();
  // 保存后任务勾选状态可能变化，静默重扫一次工作区任务。
  if (workspaceRuntimeId.value && activeTab.value?.language === 'markdown') {
    void refreshWorkspaceTasks();
  }
};

const handleSaveAs = async () => {
  syncActiveEditorContent();
  await tabService.saveActiveTabAs();
};

const handleUndo = () => {
  notificationStore.info(appText.value.undoTitle, appText.value.undoHint);
};

const handleRedo = () => {
  notificationStore.info(appText.value.redoTitle, appText.value.redoHint);
};

const handleToggleFileTree = () => {
  showFileTree.value = !showFileTree.value;
};

const handleToggleContextRail = () => {
  showContextRail.value = !showContextRail.value;
};

const handleContextNavigate = (line: number) => {
  editorCoreRef.value?.revealLine(line);
  markdownPreviewRef.value?.scrollToSourceLine(line);
};

const refreshWorkspaceContext = async (workspacePath: string | null) => {
  workspaceRuntimeId.value = null;
  gitStatus.value = null;
  if (!workspacePath || !isTauriApp()) {
    return;
  }

  try {
    const runtime = await workspaceCommands.resolveWorkspace(workspacePath);
    workspaceRuntimeId.value = runtime.workspaceId;
    gitStatus.value = await gitCommands.status(runtime.workspaceId);
  } catch (error) {
    // 非 Git 工作区或暂时不可访问时保持空上下文，不打断编辑流程。
    console.debug('[WorkspaceContext] unavailable', error);
  }
};

// ========== v0.4.0 文件对比 ==========

const diffLoaders = {
  readFile: (filePath: string) => fileCommands.readFile(filePath),
  gitShowFile: (workspaceId: string, relativePath: string, revision = 'HEAD') =>
    gitCommands.showFile(workspaceId, relativePath, revision),
};

const openDiffResult = (result: DiffSessionResult, failureTitle: string) => {
  if (result.ok) {
    diffStore.openSession(result.session);
    return;
  }
  diffStore.setError(result.error);
  notificationStore.error(failureTitle, result.error.message);
};

const requireActiveTab = (): Tab | null => {
  const tab = tabsStore.activeTab;
  if (!tab) {
    notificationStore.error('无法对比', '请先打开要对比的文件');
    return null;
  }
  return tab;
};

/** 命令面板入口：选择任意文件与当前标签对比。 */
const handleCompareWithFile = async () => {
  const tab = requireActiveTab();
  if (!tab) {
    return;
  }
  if (!isTauriApp()) {
    notificationStore.error('无法对比', '仅桌面端支持选择本地文件进行对比');
    return;
  }

  const selected = await openFileDialog({ multiple: false, directory: false });
  const compareFilePath = typeof selected === 'string' ? selected : null;
  if (!compareFilePath) {
    return;
  }

  const result = await loadWorkspaceFileDiffSession(diffLoaders, {
    compareFilePath,
    compareLabel: compareFilePath.split(/[\\/]/).pop() ?? compareFilePath,
    currentLabel: tab.fileName,
    currentFilePath: tab.filePath,
    currentContent: tab.content,
    currentIsDirty: tab.isDirty,
  });
  openDiffResult(result, '打开对比失败');
};

/** 文件树右键入口：与当前标签对比。 */
const handleCompareWithCurrentFile = async (entry: FileTreeNode) => {
  if (entry.type !== 'file') {
    return;
  }
  const tab = requireActiveTab();
  if (!tab) {
    return;
  }

  const result = await loadWorkspaceFileDiffSession(diffLoaders, {
    compareFilePath: entry.path,
    compareLabel: entry.name,
    currentLabel: tab.fileName,
    currentFilePath: tab.filePath,
    currentContent: tab.content,
    currentIsDirty: tab.isDirty,
  });
  openDiffResult(result, '打开对比失败');
};

/** Git 变更入口：HEAD 版本 vs 工作区内容。 */
const handleSelectGitEntry = async (relativePath: string) => {
  const rootPath = workspaceStore.currentWorkspacePath;
  if (!workspaceRuntimeId.value || !rootPath) {
    return;
  }

  // 已打开的标签优先用内存内容，未保存修改也能真实对比。
  const openTab = tabsStore.tabs.find((tab) => {
    if (!tab.filePath || tab.isLargeFile || tab.isLoadingContent) {
      return false;
    }
    const normalized = normalizeFsPath(tab.filePath);
    return normalized === normalizeFsPath(`${rootPath}/${relativePath}`) || normalized.endsWith(`/${relativePath}`);
  });

  const result = await loadGitDiffSession(diffLoaders, {
    workspaceId: workspaceRuntimeId.value,
    rootPath,
    relativePath,
    currentContent: openTab?.content,
  });
  openDiffResult(result, '打开 Git 差异失败');
};

// ========== v0.4.0 多窗口标签迁移 ==========

const applyWindowTransferPayload = (payload: WindowTransferPayload) => {
  const tabIds = payloadToTabs(payload).map((tab) => tabsStore.addTab(tab));
  const activeId = tabIds[payload.activeIndex] ?? tabIds[0];
  if (activeId) {
    tabsStore.activateTab(activeId);
  }
  notificationStore.info('已在新窗口打开标签', `${payload.tabs.length} 个标签`);
};

/** 在新窗口打开当前标签，源窗口保留。 */
const handleOpenTabInNewWindow = async () => {
  const tab = requireActiveTab();
  if (!tab) {
    return;
  }

  const result = await openTabsInNewWindow([tab], tab.id, workspaceStore.currentWorkspacePath);
  if (!result.ok) {
    notificationStore.error('打开新窗口失败', result.error.message);
    return;
  }
  notificationStore.info('已在新窗口打开', tab.fileName);
};

/** 把当前标签移动到新窗口，迁移成功后从源窗口移除。 */
const handleMoveTabToNewWindow = async () => {
  const tab = requireActiveTab();
  if (!tab) {
    return;
  }

  const result = await openTabsInNewWindow([tab], tab.id, workspaceStore.currentWorkspacePath);
  if (!result.ok) {
    notificationStore.error('迁移标签失败', result.error.message);
    return;
  }
  tabsStore.closeTab(tab.id);
  notificationStore.info('标签已迁移到新窗口', tab.fileName);
};

// ========== v0.4.0 Provider 扩展点 ==========

/** 装配内置 provider；单个 provider 抛错会被注册表隔离，不影响启动。 */
const bootstrapProviders = async () => {
  // 测试或降级环境下 store 可能缺少新 API，任何装配失败都不能阻断启动。
  try {
    registerBuiltinProviders(providerRegistry);
    const providerThemes = await providerRegistry.loadThemes();
    providerThemes.forEach((theme) => {
      settingsStore.importThemePackage?.(JSON.stringify(theme), { activate: false });
    });
    providersStore.setCommands(providerRegistry.loadCommands());
    providersStore.setFileActions(providerRegistry.loadFileActions());
    providersStore.refresh(providerRegistry.snapshot());

    if (providersStore.commands.length > 0 || providerThemes.length > 0) {
      refreshLocalizedCommands();
    }
  } catch (error) {
    console.warn('[Providers] 装配失败', error);
  }
};

const handleProviderFileAction = async (actionId: string, entry: FileTreeNode) => {
  try {
    await providersStore.runFileAction(actionId, {
      filePath: entry.path,
      workspacePath: workspaceStore.currentWorkspacePath,
      isTauri: isTauriApp(),
    });
  } catch (error) {
    notificationStore.error('文件动作执行失败', error instanceof Error ? error.message : String(error));
  }
};

const handleReloadExternalChange = async () => {
  const tab = activeTab.value;
  if (!tab?.filePath) {
    return;
  }
  try {
    await reloadTabContentFromDisk(tab.id, tab.filePath, tab.externalModifiedAt ?? tab.lastKnownModified ?? null);
    fileConflictsStore.resolve(tab.filePath);
    externalConflictDialogOpen.value = false;
    notificationStore.info('文件已重新加载', tab.fileName);
  } catch (error: any) {
    notificationStore.error('重新加载失败', error?.message || '无法读取磁盘文件');
  }
};

const handleSaveAsExternalChange = async () => {
  const tab = activeTab.value;
  if (!tab) {
    return;
  }

  const conflictedPath = tab.filePath;
  externalConflictBusy.value = true;
  try {
    await tabService.saveActiveTabAs();
    fileConflictsStore.resolve(conflictedPath);
    externalConflictDialogOpen.value = false;
  } finally {
    externalConflictBusy.value = false;
  }
};

const handleKeepExternalChange = async () => {
  const tab = activeTab.value;
  if (!tab) {
    return;
  }
  // 用户明确选择用当前内容覆盖磁盘，重新采样 revision 作为下次保存的基线。
  const fileRevision = tab.filePath
    ? await tabService.captureFileRevision(tab.filePath)
    : null;
  tabsStore.updateTab(tab.id, {
    lastKnownModified: tab.externalModifiedAt ?? tab.lastKnownModified ?? null,
    fileRevision,
    externalModifiedAt: null,
  });
  fileConflictsStore.resolve(tab.filePath);
  externalConflictDialogOpen.value = false;
  notificationStore.info('已保留当前修改', '下次保存将使用当前编辑内容。');
};

let markdownLinkStatusTimer: ReturnType<typeof setTimeout> | null = null;
let markdownLinkStatusRequestId = 0;
let workspaceTasksRequestId = 0;

const cancelScheduledMarkdownLinkStatusRefresh = () => {
  if (markdownLinkStatusTimer) {
    clearTimeout(markdownLinkStatusTimer);
    markdownLinkStatusTimer = null;
  }
};

/** 当前标签相对工作区根目录的路径；未打开工作区或文件在工作区外时返回 null。 */
const resolveWorkspaceRelativePath = (filePath: string | null | undefined): string | null => {
  const root = workspaceStore.currentWorkspacePath;
  if (!filePath || !root) {
    return null;
  }

  const normalizedRoot = normalizeFsPath(root).replace(/\/+$/, '');
  const normalizedFile = normalizeFsPath(filePath);
  if (!normalizedRoot) {
    return null;
  }

  const prefix = `${normalizedRoot}/`;
  if (!normalizedFile.startsWith(prefix)) {
    return null;
  }

  const relativePath = normalizedFile.slice(prefix.length);
  return relativePath && !relativePath.startsWith('../') ? relativePath : null;
};

const refreshMarkdownLinkStatuses = async () => {
  const tab = activeTab.value;
  const workspaceId = workspaceRuntimeId.value;
  markdownLinkStatusRequestId += 1;
  const requestId = markdownLinkStatusRequestId;

  const documentRelativePath = resolveWorkspaceRelativePath(tab?.filePath);
  if (
    !tab
    || tab.language !== 'markdown'
    || tab.isLargeFile
    || !workspaceId
    || !documentRelativePath
    || !isTauriApp()
  ) {
    markdownLinkStatuses.value = {};
    return;
  }

  const links = collectMarkdownContext(tab.content).links;
  try {
    const statuses = await loadMarkdownLinkStatuses(workspaceId, documentRelativePath, links);
    if (requestId !== markdownLinkStatusRequestId) {
      return;
    }
    markdownLinkStatuses.value = statuses;
  } catch (error) {
    if (requestId !== markdownLinkStatusRequestId) {
      return;
    }
    // 链接校验是辅助信息，失败时保持静默，不影响编辑。
    markdownLinkStatuses.value = {};
    console.debug('[MarkdownContext] link check unavailable', error);
  }
};

const scheduleMarkdownLinkStatusRefresh = (delay = 600) => {
  cancelScheduledMarkdownLinkStatusRefresh();
  markdownLinkStatusTimer = setTimeout(() => {
    markdownLinkStatusTimer = null;
    void refreshMarkdownLinkStatuses();
  }, delay);
};

const refreshWorkspaceTasks = async () => {
  const workspaceId = workspaceRuntimeId.value;
  workspaceTasksRequestId += 1;
  const requestId = workspaceTasksRequestId;

  if (!workspaceId || !isTauriApp()) {
    workspaceTasks.value = null;
    workspaceTasksWorkspaceId.value = null;
    workspaceTasksLoading.value = false;
    return;
  }

  workspaceTasksLoading.value = true;
  try {
    const response = await loadWorkspaceTasks(workspaceId);
    if (requestId !== workspaceTasksRequestId) {
      return;
    }
    workspaceTasks.value = response;
    workspaceTasksWorkspaceId.value = workspaceId;
  } catch (error) {
    if (requestId !== workspaceTasksRequestId) {
      return;
    }
    workspaceTasks.value = null;
    notificationStore.warning(
      '工作区任务加载失败',
      error instanceof Error ? error.message : '无法扫描工作区任务',
    );
  } finally {
    if (requestId === workspaceTasksRequestId) {
      workspaceTasksLoading.value = false;
    }
  }
};

/** 打开工作区后惰性扫描一次任务；同一工作区不重复扫描，手动刷新走 refreshWorkspaceTasks。 */
const syncWorkspaceTasksForWorkspace = () => {
  const workspaceId = workspaceRuntimeId.value;
  if (!workspaceId) {
    workspaceTasksRequestId += 1;
    workspaceTasks.value = null;
    workspaceTasksWorkspaceId.value = null;
    workspaceTasksLoading.value = false;
    return;
  }

  if (workspaceTasksWorkspaceId.value === workspaceId) {
    return;
  }

  void refreshWorkspaceTasks();
};

const handleWorkspaceTaskRefresh = () => {
  void refreshWorkspaceTasks();
};

/** 打开工作区内文件并定位到指定行，供搜索结果与工作区任务共用。 */
const openWorkspaceFileAtLine = async (relativePath: string, line: number) => {
  const root = workspaceStore.currentWorkspacePath;
  if (!root || !relativePath) {
    return;
  }

  await openFileInEditor(joinFsPath(root, relativePath));
  await nextTick();
  editorCoreRef.value?.revealLine(line);
};

const handleWorkspaceTaskNavigate = async (relativePath: string, line: number) => {
  await openWorkspaceFileAtLine(relativePath, line);
};

const handleInsertMarkdownImage = async () => {
  const tab = activeTab.value;
  if (!tab || tab.language !== 'markdown' || markdownAssetImporting.value) {
    return;
  }
  if (tab.isLargeFile) {
    notificationStore.warning('大文件暂不支持插入图片', '请等待文件完整加载后再试。');
    return;
  }

  const workspaceId = workspaceRuntimeId.value;
  const documentRelativePath = resolveWorkspaceRelativePath(tab.filePath);
  if (!workspaceId || !documentRelativePath) {
    notificationStore.warning('需要先保存文档并打开工作区', '图片会导入到文档同级的 assets 目录。');
    return;
  }

  try {
    const selected = await openFileDialog({
      title: '选择图片',
      multiple: false,
      directory: false,
      filters: [{ name: 'Images', extensions: [...MARKDOWN_ASSET_EXTENSIONS] }],
    });
    const sourcePath = Array.isArray(selected) ? selected[0] : selected;
    if (typeof sourcePath !== 'string' || !sourcePath) {
      return;
    }

    syncActiveEditorContent();
    markdownAssetImporting.value = true;
    const result = await importMarkdownAsset(workspaceId, documentRelativePath, sourcePath);
    editorCoreRef.value?.insertText(result.markdownSnippet);
    notificationStore.success(
      result.reusedExisting ? '已复用资产目录中的图片' : '图片已导入',
      result.relativePath,
    );
  } catch (error: any) {
    notificationStore.error('插入图片失败', error?.message || '无法导入图片资产');
  } finally {
    markdownAssetImporting.value = false;
  }
};

/** 导出以编辑器实时内容为准，避免预览模式或未失焦时拿到旧快照。 */
const resolveExportMarkdownContent = (fallback: string): string => {
  const editorContent = editorCoreRef.value?.getContent();
  return typeof editorContent === 'string' && editorContent.length > 0 ? editorContent : fallback;
};

const exportMarkdownHtmlInBrowser = (html: string, fileName: string) => {
  if (typeof document === 'undefined') {
    return false;
  }

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
};

const handleExportMarkdownHtml = async () => {
  const tab = activeTab.value;
  if (!tab || tab.language !== 'markdown') {
    return;
  }

  const baseName = tab.fileName.replace(/\.md$/i, '') || 'tau-document';
  const fileName = `${baseName}.html`;
  // 导出时才加载 marked / DOMPurify，避免渲染依赖进入首屏。
  const { createStandaloneHtml } = await import('@/services/markdownRenderService');
  const html = createStandaloneHtml(resolveExportMarkdownContent(tab.content), baseName);

  if (!isTauriApp()) {
    if (exportMarkdownHtmlInBrowser(html, fileName)) {
      notificationStore.success('HTML 导出完成', fileName);
    }
    return;
  }

  try {
    const defaultPath = tab.filePath
      ? joinFsPath(getParentFsPath(tab.filePath), fileName)
      : fileName;
    const targetPath = await saveFileDialog({
      title: '导出 HTML',
      defaultPath,
      filters: [{ name: 'HTML', extensions: ['html'] }],
    });
    if (typeof targetPath !== 'string' || !targetPath) {
      return;
    }

    await fileCommands.writeFile(targetPath, html);
    notificationStore.success('HTML 导出完成', targetPath);
  } catch (error: any) {
    notificationStore.error('HTML 导出失败', error?.message || '无法写入目标文件');
  }
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

const toggleSettingsContainer = (container: SettingsContainer) => {
  if (settingsContainer.value === container) {
    settingsContainer.value = null;
    return;
  }

  settingsContainer.value = container;
};

const handleToolbarToggleSettings = () => {
  toggleSettingsContainer('workspace');
};

const closeTransientPanels = () => {
  const wasWorkspaceSettingsOpen = settingsContainer.value === 'workspace';
  settingsContainer.value = null;
  if (wasWorkspaceSettingsOpen) {
    void nextTick(() => {
      editorCoreRef.value?.layout();
    });
  }
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

const handleFileTreeContextMenu = (entry: FileTreeNode) => {
  fileTreeContextEntry.value = entry;
};

const requestName = (title: string, defaultValue: string) => {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = window.prompt(title, defaultValue);
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const updateTabsAfterPathRename = (oldPath: string, newPath: string, targetType: 'file' | 'folder') => {
  const oldNormalized = normalizeFsPath(oldPath);
  const newNormalized = normalizeFsPath(newPath);

  for (const tab of tabsStore.tabs) {
    if (!tab.filePath) {
      continue;
    }

    const tabPathNormalized = normalizeFsPath(tab.filePath);
    const matched = targetType === 'folder'
      ? isPathUnderFolder(tabPathNormalized, oldNormalized)
      : tabPathNormalized === oldNormalized;
    if (!matched) {
      continue;
    }

    const replacedPath = targetType === 'folder'
      ? tabPathNormalized.replace(oldNormalized, newNormalized)
      : newNormalized;
    const nextName = replacedPath.split('/').pop() ?? tab.fileName;
    tabsStore.updateTab(tab.id, {
      filePath: replacedPath,
      fileName: nextName,
      language: detectLanguageFromFileName(nextName),
    });
  }
};

const closeTabsByPath = (targetPath: string, targetType: 'file' | 'folder') => {
  const normalizedTarget = normalizeFsPath(targetPath);
  const tabIds = tabsStore.tabs
    .filter((tab) => {
      if (!tab.filePath) {
        return false;
      }
      const normalizedTabPath = normalizeFsPath(tab.filePath);
      return targetType === 'folder'
        ? isPathUnderFolder(normalizedTabPath, normalizedTarget)
        : normalizedTabPath === normalizedTarget;
    })
    .map((tab) => tab.id);

  for (const tabId of tabIds) {
    tabsStore.closeTab(tabId);
  }
};

const handleFileTreeCreateFile = async () => {
  const baseDir = getContextBaseDirectory();
  if (!baseDir) {
    notificationStore.warning('无法新建文件', '请先打开一个工作区文件夹');
    return;
  }

  const fileName = requestName('请输入新文件名', 'NewFile.txt');
  if (!fileName) {
    return;
  }

  const targetPath = joinFsPath(baseDir, fileName);
  try {
    await fileSystemStore.createNewFile(targetPath);
    await fileSystemStore.refreshFileTree();
    await openFileInEditor(targetPath);
    notificationStore.success('新建文件成功', fileName);
  } catch (error: any) {
    notificationStore.error('新建文件失败', error?.message || '无法创建文件');
  }
};

const handleFileTreeCreateFolder = async () => {
  const baseDir = getContextBaseDirectory();
  if (!baseDir) {
    notificationStore.warning('无法新建文件夹', '请先打开一个工作区文件夹');
    return;
  }

  const folderName = requestName('请输入新文件夹名称', 'NewFolder');
  if (!folderName) {
    return;
  }

  const targetPath = joinFsPath(baseDir, folderName);
  try {
    await fileSystemStore.createNewFolder(targetPath);
    fileSystemStore.expandedPaths.add(baseDir);
    await fileSystemStore.refreshFileTree();
    notificationStore.success('新建文件夹成功', folderName);
  } catch (error: any) {
    notificationStore.error('新建文件夹失败', error?.message || '无法创建文件夹');
  }
};

const handleFileTreeRename = async (entry: FileTreeNode) => {
  fileTreeContextEntry.value = entry;
  const nextName = requestName('请输入新的名称', entry.name);
  if (!nextName || nextName === entry.name) {
    return;
  }

  const parentDir = getParentFsPath(entry.path);
  const nextPath = joinFsPath(parentDir, nextName);

  try {
    await fileSystemStore.renameFileOrFolder(entry.path, nextPath);
    updateTabsAfterPathRename(entry.path, nextPath, entry.type as 'file' | 'folder');
    await fileSystemStore.refreshFileTree();
    notificationStore.success('重命名成功', `${entry.name} -> ${nextName}`);
  } catch (error: any) {
    notificationStore.error('重命名失败', error?.message || '无法重命名该项目');
  }
};

const handleFileTreeDelete = async (entry: FileTreeNode) => {
  fileTreeContextEntry.value = entry;
  if (typeof window !== 'undefined') {
    const confirmed = window.confirm(`确认删除「${entry.name}」吗？此操作不可恢复。`);
    if (!confirmed) {
      return;
    }
  }

  try {
    await fileSystemStore.deleteFileOrFolder(entry.path);
    closeTabsByPath(entry.path, entry.type as 'file' | 'folder');
    await fileSystemStore.refreshFileTree();
    notificationStore.success('删除成功', entry.name);
  } catch (error: any) {
    notificationStore.error('删除失败', error?.message || '无法删除该项目');
  }
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

const handleTabsReorder = (orderedTabIds: string[]) => {
  tabsStore.reorderTabs(orderedTabIds);
};

const handleCancelLargeFileLoad = (tabId: string) => {
  workspaceService.cancelLargeFileLoad(tabId);
};

const handleRetryLargeFileLoad = (tabId: string) => {
  void workspaceService.retryLargeFileLoad(tabId);
};

const handleContentChange = (content: string, modelId: string) => {
  // 编辑器可能在上一次输入去抖后才提交，这里按模型对应的标签回写，避免串写。
  tabService.updateTabContent(modelId, content);
  scheduleSessionSave();
};

const syncActiveEditorContent = () => {
  const tab = activeTab.value;
  const latestContent = editorCoreRef.value?.getContent();
  if (!tab || typeof latestContent !== 'string' || latestContent === tab.content) {
    return;
  }
  tabService.updateActiveTabContent(latestContent, { markDirty: true });
};

const handleCursorChange = (position: { line: number; column: number }) => {
  editorStore.updateCursorPosition(position.line, position.column);
};

const handleEditorScrollChange = (state: { top: number; height: number; scrollHeight: number }) => {
  if (!isMarkdownTab.value || !settingsStore.markdownPreviewEnabled || markdownPreviewMode.value === 'edit') {
    return;
  }
  editorScrollState.value = state;
};

const handleLanguageChange = (languageId: string) => {
  tabService.updateActiveTabLanguage(languageId);
};

const handleEncodingChange = (encodingName: string) => {
  editorStore.setEncoding(encodingName);
};

const handleThemeChange = (theme: string) => {
  settingsStore.updateSettings({ monacoTheme: theme as 'vs' | 'vs-dark' | 'hc-black' });
};

const handleCycleLanguageMode = () => {
  const currentLanguage = activeTab.value?.language ?? editorStore.language;
  const safeCurrent = LANGUAGE_MODE_ORDER.includes(currentLanguage as EditorLanguageMode)
    ? (currentLanguage as EditorLanguageMode)
    : 'plaintext';
  const currentIndex = LANGUAGE_MODE_ORDER.indexOf(safeCurrent);
  const nextLanguage = LANGUAGE_MODE_ORDER[(currentIndex + 1) % LANGUAGE_MODE_ORDER.length] ?? 'plaintext';
  tabService.updateActiveTabLanguage(nextLanguage);
};

const handleSystemAction = (action: SystemMenuAction) => {
  switch (action) {
    case 'open-command-palette':
      void executeCommand('commandPalette.open');
      break;
    case 'toggle-explorer':
      void executeCommand('view.toggleSidebar');
      break;
    case 'toggle-theme':
      settingsStore.toggleTheme();
      break;
    case 'cycle-language-mode':
      handleCycleLanguageMode();
      break;
    case 'toggle-settings':
      void executeCommand('view.toggleSettings');
      break;
    case 'refresh-workspace':
      void handleRefresh();
      break;
    default:
      break;
  }
};

const handleOpenCommandPalette = () => {
  paletteMode.value = 'commands';
  commandStore.openPalette();
};

const handleOpenQuickOpen = () => {
  paletteMode.value = 'quick-open';
  commandStore.openPalette();
};

const handleOpenWorkspaceSearch = () => {
  if (!workspaceRuntimeId.value) {
    notificationStore.warning('工作区搜索不可用', '请先打开本地工作区。');
    return;
  }
  workspaceSearchCancelled.value = false;
  workspaceSearchOpen.value = true;
};

let workspaceSearchSequence = 0;
const activeWorkspaceSearchId = ref<string | null>(null);

const createWorkspaceSearchId = () => {
  workspaceSearchSequence += 1;
  return `search-${Date.now()}-${workspaceSearchSequence}`;
};

const isSearchExpiredError = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'SEARCH_EXPIRED';

const handleWorkspaceSearch = async (query: string) => {
  if (!workspaceRuntimeId.value || !query.trim()) {
    return;
  }

  if (activeWorkspaceSearchId.value) {
    try {
      await searchCommands.cancel(activeWorkspaceSearchId.value);
    } catch (error) {
      if (!isSearchExpiredError(error)) {
        console.warn('[App] 取消上一轮搜索失败:', error);
      }
    }
  }

  const searchId = createWorkspaceSearchId();
  activeWorkspaceSearchId.value = searchId;
  workspaceSearchLoading.value = true;
  workspaceSearchError.value = null;
  workspaceSearchCancelled.value = false;

  try {
    const response = await searchCommands.workspace(workspaceRuntimeId.value, searchId, query, {
      isRegex: false,
      caseSensitive: false,
      wholeWord: false,
      maxResults: 200,
    });
    if (activeWorkspaceSearchId.value !== searchId) {
      return;
    }
    workspaceSearchResults.value = response.matches;
    workspaceSearchCancelled.value = response.cancelled;
  } catch (error: any) {
    if (activeWorkspaceSearchId.value !== searchId) {
      return;
    }
    if (isSearchExpiredError(error)) {
      workspaceSearchCancelled.value = true;
    } else {
      workspaceSearchError.value = error?.message || '项目搜索失败';
    }
  } finally {
    if (activeWorkspaceSearchId.value === searchId) {
      activeWorkspaceSearchId.value = null;
      workspaceSearchLoading.value = false;
    }
  }
};

const handleCancelWorkspaceSearch = async () => {
  const searchId = activeWorkspaceSearchId.value;
  if (!searchId) {
    return;
  }

  try {
    await searchCommands.cancel(searchId);
  } catch (error: any) {
    if (!isSearchExpiredError(error)) {
      workspaceSearchError.value = error?.message || '无法取消搜索';
    }
  }
};

const replaceSearchOptions = {
  isRegex: false,
  caseSensitive: false,
  wholeWord: false,
  maxResults: 200,
} as const;

const handlePreviewWorkspaceReplace = async (replacement: string) => {
  if (!workspaceRuntimeId.value || !workspaceSearchQuery.value.trim()) {
    notificationStore.warning('替换预览不可用', '请先输入搜索内容。');
    return;
  }

  replacePreviewVisible.value = true;
  replacePreviewLoading.value = true;
  replacePreviewError.value = null;
  replacePreview.value = null;
  replaceResults.value = [];
  replaceUndoId.value = null;
  replaceUndone.value = false;
  replacePreviewConsumed.value = false;

  try {
    const preview = await replaceCommands.preview(
      workspaceRuntimeId.value,
      workspaceSearchQuery.value,
      replacement,
      { ...replaceSearchOptions },
    );
    replacePreview.value = preview;
    if (preview.totalMatches === 0) {
      notificationStore.info('没有可替换的命中', '请调整搜索条件后重试。');
    }
  } catch (error: any) {
    replacePreviewError.value = error?.message || '替换预览失败';
  } finally {
    replacePreviewLoading.value = false;
  }
};

const refreshTabsAfterWorkspaceReplace = async (relativePaths: string[]) => {
  const root = workspaceStore.currentWorkspacePath;
  if (!root || relativePaths.length === 0) {
    return;
  }

  for (const relativePath of relativePaths) {
    const absolutePath = joinFsPath(root, relativePath);
    for (const tab of tabsStore.tabs) {
      // 统一分隔符后再比对，避免 Windows 路径导致标签刷新被跳过。
      if (!tab.filePath || normalizeFsPath(tab.filePath) !== normalizeFsPath(absolutePath)) {
        continue;
      }
      if (tab.isDirty) {
        const observed = Date.now();
        tabsStore.updateTab(tab.id, { externalModifiedAt: observed });
        fileConflictsStore.flag({
          path: tab.filePath,
          kind: 'modified',
          diskModifiedMs: observed,
          diskSize: null,
          baselineModifiedMs: tab.lastKnownModified ?? null,
        });
        notifyExternalConflict(tab.fileName);
        continue;
      }
      await reloadTabContentFromDisk(
        tab.id,
        tab.filePath,
        tab.externalModifiedAt ?? tab.lastKnownModified ?? null,
      );
    }
  }
};

const handleApplyWorkspaceReplace = async (matchIds: string[]) => {
  if (!workspaceRuntimeId.value || !replacePreview.value || matchIds.length === 0) {
    return;
  }

  if (replacePreviewConsumed.value) {
    notificationStore.warning('预览已使用', '同一次预览只能提交一次，请重新生成预览。');
    return;
  }

  replaceApplying.value = true;
  replacePreviewError.value = null;

  try {
    const response = await replaceCommands.apply(
      workspaceRuntimeId.value,
      replacePreview.value.previewId,
      matchIds,
    );
    replaceResults.value = response.results;
    replaceUndoId.value = response.undoId ?? null;
    replaceUndone.value = false;
    replacePreviewConsumed.value = true;

    const appliedPaths = response.results
      .filter((result) => result.status === 'applied')
      .map((result) => result.relativePath);

    if (response.applied > 0) {
      notificationStore.success(
        '替换完成',
        `已替换 ${response.applied} 个文件，跳过 ${response.skipped + response.conflicts} 个，失败 ${response.failed} 个。`,
      );
      await refreshTabsAfterWorkspaceReplace(appliedPaths);
      await fileSystemStore.refreshFileTree();
    } else {
      notificationStore.warning('替换未执行', '没有文件被修改，请查看逐项结果。');
    }
  } catch (error: any) {
    replacePreviewError.value = error?.message || '替换失败';
  } finally {
    replaceApplying.value = false;
  }
};

const handleUndoWorkspaceReplace = async () => {
  if (!workspaceRuntimeId.value || !replaceUndoId.value) {
    return;
  }

  replaceUndoBusy.value = true;
  replacePreviewError.value = null;

  try {
    const response = await replaceCommands.undo(workspaceRuntimeId.value, replaceUndoId.value);
    replaceUndone.value = true;
    notificationStore.info(
      '已撤销替换',
      `恢复 ${response.restored.length} 个文件，冲突 ${response.conflicts.length} 个。`,
    );
    await refreshTabsAfterWorkspaceReplace(response.restored);
    await fileSystemStore.refreshFileTree();
  } catch (error: any) {
    replacePreviewError.value = error?.message || '撤销失败';
  } finally {
    replaceUndoBusy.value = false;
  }
};

const handleWorkspaceSearchNavigate = async (relativePath: string, line: number) => {
  await openWorkspaceFileAtLine(relativePath, line);
};

const handleFindText = () => {
  editorCoreRef.value?.triggerFindWidget();
};

const handleGoToLine = () => {
  editorCoreRef.value?.triggerGoToLine();
};

const getLocalizedCommandTitle = (id: CommandId) =>
  getCommandText(settingsStore.uiLanguage, id).title;

const createLocalizedCommands = () => {
  const builtInCommands = createCommandRegistry({
  newFile: handleNewFile,
  openFile: handleOpenFile,
  openFolder: handleOpenFolder,
  save: handleSave,
  saveAs: handleSaveAs,
  findText: handleFindText,
  goToLine: handleGoToLine,
  toggleSidebar: handleToggleFileTree,
  toggleSettings: () => toggleSettingsContainer('workspace'),
  openCommandPalette: handleOpenCommandPalette,
  compareWithFile: handleCompareWithFile,
  openInNewWindow: handleOpenTabInNewWindow,
  moveToNewWindow: handleMoveTabToNewWindow,
  }, settingsStore.uiLanguage);

  // Provider 命令与内置命令合并，同 id 时内置优先。
  const knownIds = new Set(builtInCommands.map((command) => command.id));
  return [
    ...builtInCommands,
    ...providersStore.commands.filter((command) => !knownIds.has(command.id)),
  ];
};

/** 命令面板展示的快捷键以用户覆盖为准。 */
const resolveCommandShortcutLabel = (commandId: string, fallback?: string) => {
  const resolved = resolveKeybinding(DEFAULT_KEYBINDINGS, settingsStore.keybindingOverrides, commandId);
  if (!resolved) {
    return fallback;
  }
  if (resolved.isUnbound) {
    return undefined;
  }
  return formatKeybinding(resolved.keys) || fallback;
};

const applyCommandShortcuts = (commands: AppCommand[]): AppCommand[] =>
  commands.map((command) => ({
    ...command,
    shortcut: resolveCommandShortcutLabel(command.id, command.shortcut),
  }));
const refreshLocalizedCommands = () => {
  const commands = applyCommandShortcuts(createLocalizedCommands());
  commandStore.registerCommands(commands.map(({ id, title, category, shortcut, keywords }) => ({
    id,
    title,
    category,
    shortcut,
    keywords,
  })));
  runCommand = createCommandExecutor(commands, settingsStore.uiLanguage);
};

let runCommand = createCommandExecutor(createLocalizedCommands(), settingsStore.uiLanguage);
refreshLocalizedCommands();

const executeCommand = async (id: string) => {
  try {
    await runCommand(id);
  } catch (error: any) {
    notificationStore.error(appText.value.commandExecFail, error?.message || appText.value.unknownCommand);
  }
};

const handlePaletteSelect = async (id: string) => {
  commandStore.closePalette();
  if (id.startsWith('quick-open:')) {
    paletteMode.value = 'commands';
    await openFileInEditor(id.slice('quick-open:'.length));
    return;
  }
  await executeCommand(id);
};

const handlePaletteSelectHighlighted = async () => {
  if (!highlightedCommand.value) {
    return;
  }

  await handlePaletteSelect(highlightedCommand.value.id);
};

/**
 * 快捷键命令 id -> 处理函数。
 * 设置面板展示的绑定与这里注册的处理函数使用同一套命令 id。
 */
const keybindingCommandHandlers: Record<string, () => void> = {
  'commandPalette.open': () => void executeCommand('commandPalette.open'),
  'file.new': () => void executeCommand('file.new'),
  'file.open': () => void executeCommand('file.open'),
  'file.openFolder': () => void executeCommand('file.openFolder'),
  'file.save': () => void executeCommand('file.save'),
  'file.saveAs': () => void executeCommand('file.saveAs'),
  'search.findText': () => void executeCommand('search.findText'),
  'search.goToLine': () => void executeCommand('search.goToLine'),
  'workspace.search': handleOpenWorkspaceSearch,
  'workspace.quickOpen': handleOpenQuickOpen,
  'view.toggleSidebar': handleToggleFileTree,
  'view.toggleSettings': () => void executeCommand('view.toggleSettings'),
  'editor.zoomIn': () => settingsStore.adjustFontSize(1),
  'editor.zoomOut': () => settingsStore.adjustFontSize(-1),
  'editor.zoomReset': () => settingsStore.resetFontSize(),
  'diff.compareWithFile': () => void handleCompareWithFile(),
  'window.openInNewWindow': () => void handleOpenTabInNewWindow(),
  'window.moveToNewWindow': () => void handleMoveTabToNewWindow(),
};

const describeKeybindingCommand = (commandId: string): string => {
  const extraTitles: Record<string, string> = {
    'workspace.search': 'Search Workspace',
    'workspace.quickOpen': 'Quick Open',
    'editor.zoomIn': 'Zoom In',
    'editor.zoomOut': 'Zoom Out',
    'editor.zoomReset': 'Zoom Reset',
  };
  if (extraTitles[commandId]) {
    return extraTitles[commandId];
  }
  const text = getCommandText(settingsStore.uiLanguage, commandId as CommandId) as unknown as
    | { title?: string }
    | undefined;
  return text?.title ?? commandId;
};

const registerShortcuts = () => {
  // 重新注册前先清掉旧命令的绑定，避免改键后旧按键仍然生效。
  for (const definition of DEFAULT_KEYBINDINGS) {
    keyboardStore.unregister(definition.commandId);
  }
  keyboardStore.unregister('commandPalette.open.f1');

  for (const resolved of resolveKeybindings(DEFAULT_KEYBINDINGS, settingsStore.keybindingOverrides)) {
    const handler = keybindingCommandHandlers[resolved.commandId];
    if (!handler || !resolved.keys) {
      continue;
    }
    const shortcut = keybindingToShortcut(resolved.keys);
    if (!shortcut) {
      continue;
    }
    keyboardStore.register({
      id: resolved.commandId,
      key: shortcut.key,
      modifiers: shortcut.modifiers,
      handler,
      description: describeKeybindingCommand(resolved.commandId),
    });
  }

  // F1 固定作为命令面板的第二绑定，不参与自定义，避免误改后无法唤起设置。
  keyboardStore.register({
    id: 'commandPalette.open.f1',
    key: 'F1',
    handler: () => void executeCommand('commandPalette.open'),
    description: describeKeybindingCommand('commandPalette.open'),
  });
};

const getFirstInstallGuideContent = () => {
  if (settingsStore.uiLanguage === 'en-US') {
    return `# Tau Editor Quick Start

Welcome to Tau Editor.

## Core Actions
- Create file: toolbar "New File" or \`Ctrl/Cmd + N\`
- Open file: toolbar "Open File" or \`Ctrl/Cmd + O\`
- Save file: \`Ctrl/Cmd + S\`
- Save as: toolbar "Save As"
- Command palette: \`F1\` or \`Ctrl/Cmd + Shift + P\`

## Text Zoom
- Zoom in: \`Ctrl/Cmd + +\`
- Zoom out: \`Ctrl/Cmd + -\`
- Reset zoom: \`Ctrl/Cmd + 0\`

## Tips
- You can open external files from the OS "Open With -> Tau Editor".
- This guide is an unsaved tab. Save it if you want to keep it.
`;
  }

  return `# Tau Editor 使用说明

欢迎使用 Tau Editor。

## 常用操作
- 新建文件：工具栏「新建文件」或 \`Ctrl/Cmd + N\`
- 打开文件：工具栏「打开文件」或 \`Ctrl/Cmd + O\`
- 保存文件：\`Ctrl/Cmd + S\`
- 另存为：工具栏「另存为」
- 命令面板：\`F1\` 或 \`Ctrl/Cmd + Shift + P\`

## 文字缩放
- 放大：\`Ctrl/Cmd + +\`
- 缩小：\`Ctrl/Cmd + -\`
- 重置：\`Ctrl/Cmd + 0\`

## 提示
- 支持在系统里通过“打开方式 -> Tau Editor”直接打开外部文件。
- 本说明是未保存标签页，如需保留请手动保存。
`;
};

const readLocalTimestamp = (key: string): number | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const writeLocalTimestamp = (key: string, value: number) => {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(key, String(value));
};

const markGuideShown = (timestamp: number) => {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(FIRST_INSTALL_GUIDE_KEY, '1');
  writeLocalTimestamp(GUIDE_LAST_SHOWN_AT_KEY, timestamp);
};

const markAppOpened = (timestamp: number) => {
  writeLocalTimestamp(GUIDE_LAST_OPENED_AT_KEY, timestamp);
};

const shouldShowGuideOnLaunch = (timestamp: number) => {
  if (typeof window === 'undefined') {
    return false;
  }
  const lastOpenedAt = readLocalTimestamp(GUIDE_LAST_OPENED_AT_KEY);
  if (!lastOpenedAt) {
    return true;
  }
  return timestamp - lastOpenedAt >= GUIDE_REOPEN_INTERVAL_MS;
};

const findOperationGuideTabId = () => {
  const guideNames = new Set(['Getting Started.md', '操作说明.md']);
  return tabsStore.tabs.find((tab) => tab.filePath === null && guideNames.has(tab.fileName))?.id ?? null;
};

const openOperationGuide = (timestamp: number) => {
  if (typeof tabsStore.addTab !== 'function') {
    return false;
  }

  const existingGuideTabId = findOperationGuideTabId();
  if (existingGuideTabId) {
    tabsStore.activateTab(existingGuideTabId);
    markGuideShown(timestamp);
    return true;
  }

  const guideTitle = settingsStore.uiLanguage === 'en-US' ? 'Getting Started.md' : '操作说明.md';
  const guideContent = getFirstInstallGuideContent();
  if (!ensureAdditionalTabCapacity(guideContent, guideTitle)) {
    return false;
  }

  tabsStore.addTab({
    filePath: null,
    fileName: guideTitle,
    language: 'markdown',
    isDirty: false,
    isUntitled: true,
    content: guideContent,
  });

  if (workspaceStore.mode === 'empty' && !workspaceStore.currentWorkspacePath) {
    workspaceStore.setMode('single-file');
  }

  editorStore.setContent(guideContent, false);
  editorStore.setLanguage('markdown');
  editorStore.markAsSaved();
  markGuideShown(timestamp);
  return true;
};

const showOperationGuideOnLaunchIfNeeded = (timestamp: number) => {
  if (!shouldShowGuideOnLaunch(timestamp)) {
    return;
  }
  openOperationGuide(timestamp);
};

const openExternalFiles = async (paths: string[]) => {
  const uniquePaths = Array.from(new Set(paths.filter((path) => typeof path === 'string' && path.trim().length > 0)));
  for (const filePath of uniquePaths) {
    await openFileInEditor(filePath);
  }
};

const setupExternalFileOpenBridge = async (): Promise<boolean> => {
  if (!isTauriApp()) {
    return false;
  }

  try {
    const { listen } = await import('@tauri-apps/api/event');

    unlistenExternalOpen = await listen<string[] | string>('app:open-file-requested', async (event) => {
      const payload = event.payload;
      const paths = Array.isArray(payload) ? payload : typeof payload === 'string' ? [payload] : [];
      await openExternalFiles(paths);
    });

    const startupPaths = await appCommands.consumePendingOpenPaths();
    if (startupPaths.length > 0) {
      await openExternalFiles(startupPaths);
      return true;
    }
  } catch (error) {
    console.warn('[App] 外部文件打开桥接初始化失败:', error);
  }

  return false;
};

const reloadTabContentFromDisk = async (tabId: string, filePath: string, modifiedAt: number | null) => {
  // 大文件由服务层关闭后重新分段打开；普通文件整块重读并刷新 revision 基线。
  const replaced = await workspaceService.reloadFileFromDisk(tabId, filePath, modifiedAt);

  if (replaced && tabsStore.activeTabId === tabId) {
    tabService.syncTabToEditor(tabsStore.activeTab);
    editorStore.markAsSaved();
  }
};

const findTabByPath = (path: string | null | undefined) => {
  if (!path) return null;
  const key = normalizeWorkspacePath(path);
  return tabsStore.tabs.find((tab) => tab.filePath && normalizeWorkspacePath(tab.filePath) === key) ?? null;
};

const activeExternalConflict = computed(() => fileConflictsStore.find(activeTab.value?.filePath));

const notifyExternalConflict = (fileName: string) => {
  notificationStore.warning(
    settingsStore.uiLanguage === 'en-US' ? 'External change detected' : '检测到外部文件更新',
    settingsStore.uiLanguage === 'en-US'
      ? `${fileName} changed on disk. Resolve the conflict before saving.`
      : `${fileName} 已在磁盘上更新，请先处理冲突再保存。`,
  );
};

/**
 * 处理工作区监听推送的批量变更：脏标签只标记冲突，干净标签自动重新加载。
 */
const handleWorkspaceFileChanges = async (changes: WorkspaceFileChange[]) => {
  let shouldRefreshTree = false;

  for (const change of changes) {
    if (
      workspaceStore.currentWorkspacePath
      && isPathUnderFolder(change.path, workspaceStore.currentWorkspacePath)
    ) {
      shouldRefreshTree = true;
    }

    const tab = findTabByPath(change.path);

    // 用户重命名了已打开的文件：跟随新路径，内容不需要重读。
    if (!tab && change.kind === 'renamed' && change.oldPath) {
      const renamedTab = findTabByPath(change.oldPath);
      if (renamedTab) {
        tabsStore.updateTab(renamedTab.id, {
          filePath: change.path,
          fileName: getBaseNameFromFsPath(change.path),
          lastKnownModified: change.modifiedMs ?? renamedTab.lastKnownModified ?? null,
          externalModifiedAt: null,
        });
        fileConflictsStore.resolve(change.oldPath);
        continue;
      }
    }

    const filePath = tab?.filePath;
    if (!tab || !filePath || tab.isLoadingContent) {
      continue;
    }

    if (change.kind === 'removed') {
      const isNew = fileConflictsStore.flag({
        path: filePath,
        kind: change.kind,
        diskModifiedMs: null,
        diskSize: null,
        baselineModifiedMs: tab.lastKnownModified ?? null,
      });
      if (isNew) notifyExternalConflict(tab.fileName);
      continue;
    }

    if (tab.isDirty) {
      const isNew = fileConflictsStore.flag({
        path: filePath,
        kind: change.kind,
        diskModifiedMs: change.modifiedMs,
        diskSize: change.size,
        baselineModifiedMs: tab.lastKnownModified ?? null,
      });
      tabsStore.updateTab(tab.id, {
        externalModifiedAt: change.modifiedMs ?? Date.now(),
      });
      if (isNew) notifyExternalConflict(tab.fileName);
      continue;
    }

    try {
      await reloadTabContentFromDisk(tab.id, filePath, change.modifiedMs ?? null);
      fileConflictsStore.resolve(filePath);
    } catch (error) {
      console.warn('[App] 外部变更重新加载失败:', error);
    }
  }

  if (shouldRefreshTree) {
    await fileSystemStore.refreshFileTree();
  }
};

const syncActiveTabExternalChanges = async () => {
  if (!isTauriApp() || externalFileSyncInFlight) {
    return;
  }

  const tab = activeTab.value;
  if (!tab?.filePath) {
    return;
  }

  externalFileSyncInFlight = true;

  try {
    const fileInfo = await fileCommands.getFileInfo(tab.filePath);
    const observedModified = normalizeModifiedTimestamp(fileInfo.modified);
    const action = resolveExternalFileSyncAction({
      filePath: tab.filePath,
      isUntitled: tab.isUntitled,
      isLoadingContent: tab.isLoadingContent,
      isDirty: tab.isDirty,
      lastKnownModified: tab.lastKnownModified ?? null,
      externalModifiedAt: tab.externalModifiedAt ?? null,
      observedModified,
    });

    if (action === 'flag') {
      const isNew = fileConflictsStore.flag({
        path: tab.filePath,
        kind: 'modified',
        diskModifiedMs: observedModified,
        diskSize: typeof fileInfo.size === 'number' ? fileInfo.size : null,
        baselineModifiedMs: tab.lastKnownModified ?? null,
      });
      tabsStore.updateTab(tab.id, {
        externalModifiedAt: observedModified,
      });
      if (isNew) notifyExternalConflict(tab.fileName);
    } else if (action === 'reload') {
      await reloadTabContentFromDisk(
        tab.id,
        tab.filePath,
        observedModified ?? tab.externalModifiedAt ?? tab.lastKnownModified ?? null,
      );
      fileConflictsStore.resolve(tab.filePath);
      if (workspaceStore.currentWorkspacePath && isPathUnderFolder(tab.filePath, workspaceStore.currentWorkspacePath)) {
        await fileSystemStore.refreshFileTree();
      }
    } else if ((tab.lastKnownModified === null || tab.lastKnownModified === undefined) && observedModified !== null) {
      tabsStore.updateTab(tab.id, {
        lastKnownModified: observedModified,
      });
    }
  } catch (error) {
    console.warn('[App] 外部文件同步检查失败:', error);
  } finally {
    externalFileSyncInFlight = false;
  }
};

const startExternalFileSync = () => {
  if (!isTauriApp()) {
    return;
  }

  if (externalFileSyncTimer) {
    clearInterval(externalFileSyncTimer);
  }

  externalFileSyncTimer = setInterval(() => {
    void syncActiveTabExternalChanges();
  }, EXTERNAL_FILE_SYNC_INTERVAL_MS);
};

const stopExternalFileSync = () => {
  if (!externalFileSyncTimer) {
    return;
  }

  clearInterval(externalFileSyncTimer);
  externalFileSyncTimer = null;
};

/**
 * 优先使用原生工作区监听；监听失败时退回轮询，保证外部修改仍能被发现。
 */
const startExternalFileWatch = async () => {
  if (!isTauriApp()) {
    return;
  }

  const root = workspaceStore.currentWorkspacePath
    || getParentFsPath(activeTab.value?.filePath ?? '');
  if (!root) {
    return;
  }

  const watching = await workspaceWatcherService.start(root);
  if (watching) {
    stopExternalFileSync();
    return;
  }

  startExternalFileSync();
};

const stopExternalFileWatch = async () => {
  stopExternalFileSync();
  await workspaceWatcherService.stop();
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

const startContextRailResize = (event: MouseEvent) => {
  if (!showContextRail.value) {
    return;
  }
  isResizingContextRail.value = true;
  const startX = event.clientX;
  const startWidth = contextRailWidth.value;

  const onMove = (moveEvent: MouseEvent) => {
    contextRailWidth.value = clampContextRailWidth(startWidth - (moveEvent.clientX - startX));
  };

  const onUp = () => {
    isResizingContextRail.value = false;
    void settingsStore.updateSettings({ contextRailWidth: contextRailWidth.value });
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
};

const handleShellKeydown = (event: KeyboardEvent) => {
  const isSettingsOpen = settingsContainer.value !== null;
  if (event.key === 'Escape' && isSettingsOpen) {
    event.preventDefault();
    closeTransientPanels();
    return;
  }

  const hasModifier = event.ctrlKey || event.metaKey;
  const isCommaKey = event.code === 'Comma' || event.key === ',' || event.key === '<';
  if (!hasModifier || !isCommaKey) {
    return;
  }

  event.preventDefault();
  if (event.shiftKey) {
    toggleSettingsContainer('drawer');
    return;
  }

  toggleSettingsContainer('workspace');
};

async function restoreSession() {
  if (!settingsStore.restoreLastSession) {
    await sessionService.clear();
    await sessionService.clearRecoveryDrafts();
    workspaceStore.setEmptyMode();
    tabsStore.closeAll();
    return;
  }

  const snapshot = sessionService.load();
  const recoveryDrafts = sessionService.loadRecoveryDrafts() ?? [];
  if (!snapshot && recoveryDrafts.length === 0) return;

  const shouldRestoreDrafts = recoveryDrafts.length > 0 && (
    typeof window === 'undefined'
    || window.confirm(`检测到 ${recoveryDrafts.length} 个未保存草稿，是否恢复？`)
  );
  if (recoveryDrafts.length > 0 && !shouldRestoreDrafts) {
    await sessionService.clearRecoveryDrafts();
  }

  const restoredTabs = shouldRestoreDrafts
    ? [
        ...(snapshot?.tabs ?? []).filter((tab) => !recoveryDrafts.some((draft) => draft.id === tab.id)),
        ...recoveryDrafts,
      ]
    : snapshot?.tabs ?? [];
  const activeTabId = snapshot?.activeTabId ?? restoredTabs[0]?.id ?? null;

  tabsStore.restoreSession(restoredTabs, activeTabId);

  if (snapshot?.workspacePath && snapshot.mode === 'workspace') {
    workspaceStore.openWorkspace(snapshot.workspacePath);
    void fileSystemStore.syncFromWorkspace();
  } else if (restoredTabs.length > 0) {
    workspaceStore.setMode('single-file');
  } else {
    workspaceStore.setEmptyMode();
  }
}

async function saveSession() {
  if (!settingsStore.restoreLastSession) {
    await sessionService.clear();
    await sessionService.clearRecoveryDrafts();
    return;
  }

  // 只阻断正在加载中的快照；已取消/失败的半加载标签需要落盘，重启后才能继续续传。
  if (tabsStore.tabs.some((tab) => tab.largeFileLoadState === 'loading')) {
    return;
  }

  await sessionService.save({
    mode: workspaceStore.mode,
    workspacePath: workspaceStore.currentWorkspacePath,
    workspaceName: workspaceStore.currentWorkspaceName,
    activeTabId: tabsStore.activeTabId,
    tabs: tabsStore.tabs,
  });
  await sessionService.saveRecoveryDrafts(tabsStore.tabs);
}

function cancelScheduledSessionSave() {
  if (sessionSaveTimer) {
    clearTimeout(sessionSaveTimer);
    sessionSaveTimer = null;
  }
}

function scheduleSessionSave() {
  if (!settingsStore.restoreLastSession) {
    void sessionService.clear();
    return;
  }

  cancelScheduledSessionSave();
  sessionSaveTimer = setTimeout(() => {
    sessionSaveTimer = null;
    void saveSession();
  }, SESSION_SAVE_DEBOUNCE_MS);
}

watch(
  () => ({
    mode: workspaceStore.mode,
    workspacePath: workspaceStore.currentWorkspacePath,
    workspaceName: workspaceStore.currentWorkspaceName,
    activeTabId: tabsStore.activeTabId,
    tabOutline: tabsStore.tabs
      .map((tab) =>
        [
          tab.id,
          tab.filePath ?? '',
          tab.fileName,
          tab.language,
          tab.isDirty ? '1' : '0',
          tab.isUntitled ? '1' : '0',
          String(tab.createdAt),
        ].join('|'),
      )
      .join('||'),
  }),
  () => {
    scheduleSessionSave();
  },
);

watch(
  () => activeTab.value?.content,
  () => {
    scheduleSessionSave();
  },
);

watch(
  () => settingsStore.restoreLastSession,
  (enabled) => {
    if (enabled) {
      scheduleSessionSave();
      return;
    }

    cancelScheduledSessionSave();
    void sessionService.clear();
    void sessionService.clearRecoveryDrafts();
  },
);

watch(
  () => workspaceStore.currentWorkspacePath,
  (workspacePath) => {
    void refreshWorkspaceContext(workspacePath);
    void startExternalFileWatch();
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
  () => settingsStore.contextRailWidth,
  (width) => {
    contextRailWidth.value = clampContextRailWidth(width);
  },
);

watch(
  () => settingsStore.uiLanguage,
  () => {
    refreshLocalizedCommands();
    registerShortcuts();
  },
);

// 快捷键覆盖变化后立即重建注册表，并刷新命令面板展示的绑定。
watch(
  () => settingsStore.keybindingOverrides,
  () => {
    registerShortcuts();
    refreshLocalizedCommands();
  },
  { deep: true },
);

watch(
  () => ({ tabCount: tabsStore.tabs.length, workspacePath: workspaceStore.currentWorkspacePath }),
  ({ tabCount, workspacePath }) => {
    if (tabCount === 0 && !workspacePath) {
      workspaceStore.setEmptyMode();
    }
  },
);

watch(
  () => [activeTabId.value, markdownPreviewMode.value],
  () => {
    editorScrollState.value = null;
  },
);

watch(
  () => activeTab.value?.id,
  () => {
    void syncActiveTabExternalChanges();
    void startExternalFileWatch();
  },
);

// Markdown 链接状态：依赖解析后的链接与文档身份，内容变化时去抖后才校验工作区。
watch(
  () => {
    const tab = activeTab.value;
    const linkSignature = markdownContext.value.links
      .map((link) => `${link.line}:${link.target}`)
      .join('|');
    return [workspaceRuntimeId.value ?? '', tab?.id ?? '', tab?.filePath ?? '', linkSignature].join('|');
  },
  () => {
    scheduleMarkdownLinkStatusRefresh();
  },
);

// 工作区任务：切换工作区或进入 Markdown 文档时惰性扫描一次，之后由手动刷新与保存后重扫接管。
watch(
  () => {
    const workspaceId = workspaceRuntimeId.value ?? '';
    const isMarkdown = activeTab.value?.language === 'markdown';
    return `${workspaceId}|${isMarkdown ? 'markdown' : 'other'}`;
  },
  () => {
    if (!workspaceRuntimeId.value) {
      // 工作区关闭时立即清空任务，避免残留上一个工作区的结果。
      syncWorkspaceTasksForWorkspace();
      return;
    }

    if (activeTab.value?.language === 'markdown') {
      syncWorkspaceTasksForWorkspace();
    }
  },
);

// 标签关闭后不再需要对应的冲突提示。
watch(
  () => tabsStore.tabs.map((tab) => tab.filePath ?? '').join('|'),
  () => {
    fileConflictsStore.retainOnly(
      tabsStore.tabs
        .map((tab) => tab.filePath)
        .filter((path): path is string => Boolean(path)),
    );
    if (!activeExternalConflict.value) {
      externalConflictDialogOpen.value = false;
    }
  },
);

onMounted(async () => {
  window.addEventListener('resize', syncViewportWidth);
  workspaceStore.loadFromStorage();
  await settingsStore.init();
  await bootstrapProviders();
  sidebarWidth.value = clampSidebarWidth(settingsStore.fileTreeWidth);
  contextRailWidth.value = clampContextRailWidth(settingsStore.contextRailWidth);
  await sessionService.initialize();
  // 新窗口优先消费一次性迁移 payload，避免再走一遍会话恢复覆盖标签。
  const pendingWindowTransfer = await consumePendingWindowTransfer();
  if (pendingWindowTransfer) {
    applyWindowTransferPayload(pendingWindowTransfer);
  } else {
    await restoreSession();
  }
  await refreshWorkspaceContext(workspaceStore.currentWorkspacePath);
  await windowService.attach();
  windowService.onBeforeClose(() => saveSession());
  registerShortcuts();
  const launchTimestamp = Date.now();
  await setupExternalFileOpenBridge();
  workspaceWatcherService.onChange((changes) => {
    void handleWorkspaceFileChanges(changes);
  });
  await startExternalFileWatch();
  showOperationGuideOnLaunchIfNeeded(launchTimestamp);
  markAppOpened(launchTimestamp);
  window.addEventListener('keydown', handleShellKeydown);
});

onUnmounted(() => {
  cancelScheduledSessionSave();
  void saveSession();
  cancelScheduledMarkdownLinkStatusRefresh();
  windowService.detach();
  keyboardStore.removeGlobalHandler();
  if (unlistenExternalOpen) {
    unlistenExternalOpen();
    unlistenExternalOpen = null;
  }
  void stopExternalFileWatch();
  window.removeEventListener('keydown', handleShellKeydown);
  window.removeEventListener('resize', syncViewportWidth);
});
</script>

<template>
  <div class="app-shell">
    <Notification />
    <ExternalChangeDialog
      :visible="externalConflictDialogOpen && Boolean(activeExternalConflict)"
      :conflict="activeExternalConflict"
      :file-name="activeTab?.fileName ?? null"
      :locale="settingsStore.uiLanguage"
      :busy="externalConflictBusy"
      @close="externalConflictDialogOpen = false"
      @reload="handleReloadExternalChange"
      @keep="handleKeepExternalChange"
      @save-as="handleSaveAsExternalChange"
    />
    <CommandPalette
      :visible="commandStore.paletteOpen"
      :query="commandStore.query"
      :commands="paletteCommands"
      :highlighted-index="commandStore.highlightedIndex"
      @close="commandStore.closePalette(); paletteMode = 'commands'"
      @move="commandStore.moveHighlight"
      @highlight="commandStore.setHighlightedIndex"
      @select="handlePaletteSelect"
      @select-highlighted="handlePaletteSelectHighlighted"
      @update:query="commandStore.setQuery"
    />
    <WorkspaceSearchPanel
      :visible="workspaceSearchOpen"
      :query="workspaceSearchQuery"
      :results="workspaceSearchResults"
      :loading="workspaceSearchLoading"
      :error="workspaceSearchError"
      :cancelled="workspaceSearchCancelled"
      :replacement="workspaceReplaceReplacement"
      @close="workspaceSearchOpen = false"
      @update:query="workspaceSearchQuery = $event"
      @update:replacement="workspaceReplaceReplacement = $event"
      @search="handleWorkspaceSearch"
      @cancel="handleCancelWorkspaceSearch"
      @preview-replace="handlePreviewWorkspaceReplace"
      @navigate="handleWorkspaceSearchNavigate"
    />
    <ReplacePreviewDialog
      :visible="replacePreviewVisible"
      :preview="replacePreview"
      :loading="replacePreviewLoading"
      :error="replacePreviewError"
      :applying="replaceApplying"
      :results="replaceResults"
      :undo-id="replaceUndoId"
      :undo-busy="replaceUndoBusy"
      :undone="replaceUndone"
      @close="replacePreviewVisible = false"
      @apply="handleApplyWorkspaceReplace"
      @undo="handleUndoWorkspaceReplace"
    />

    <Toolbar
      :can-undo="canUndo"
      :can-redo="canRedo"
      :is-dirty="isDirty"
      :app-label="appText.appLabel"
      :workspace-label="workspaceLabel"
      :current-file-label="currentFileLabel"
      :sidebar-visible="showFileTree"
      :context-rail-visible="showContextRail"
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
      @toggle-context-rail="handleToggleContextRail"
      @toggle-settings="handleToolbarToggleSettings"
      @cycle-markdown-preview="handleCycleMarkdownPreview"
      @system-action="handleSystemAction"
    />

    <div class="main-layout">
      <div
        v-if="settingsContainer === 'drawer'"
        class="shell-overlay"
        data-testid="shell-overlay"
        @click="closeTransientPanels"
      ></div>

      <transition name="sidebar-shell">
        <div
          v-if="showFileTree && settingsContainer !== 'workspace'"
          class="sidebar-shell"
          :class="{ resizing: isResizingSidebar }"
          :style="{ '--sidebar-width': `${sidebarWidth}px` }"
        >
          <aside
            class="sidebar"
            data-testid="sidebar-panel"
            :style="{ width: `${sidebarWidth}px` }"
          >
            <FileTree
              v-if="workspaceStore.currentWorkspacePath"
              :file-tree="fileTree"
              :loading="loading"
              :selected-path="selectedPath"
              :workspace-label="workspaceLabel"
              :provider-actions="providersStore.fileActions.map((action) => ({ id: action.id, title: action.title }))"
              @file-open="handleFileOpen"
              @folder-toggle="handleFolderToggle"
              @context-menu="handleFileTreeContextMenu"
              @refresh="handleRefresh"
              @new-file="handleFileTreeCreateFile"
              @new-folder="handleFileTreeCreateFolder"
              @rename="handleFileTreeRename"
              @delete="handleFileTreeDelete"
              @compare-with-current="handleCompareWithCurrentFile"
              @run-provider-action="handleProviderFileAction"
            />
            <div v-else class="sidebar-empty">
              <p class="sidebar-empty-title">{{ appText.sidebarEmptyTitle }}</p>
              <p class="sidebar-empty-text">{{ appText.sidebarEmptyDesc.replace('{mode}', currentModeLabel) }}</p>
              <button class="sidebar-empty-action" @click="handleOpenFolder">{{ appText.selectFolder }}</button>
            </div>
          </aside>
          <div
            class="sidebar-resizer"
            data-testid="sidebar-resizer"
            :class="{ dragging: isResizingSidebar }"
            @mousedown.prevent="startSidebarResize"
          ></div>
        </div>
      </transition>

      <div
        v-if="settingsContainer !== 'workspace'"
        class="floating-controls"
        data-testid="left-bottom-controls"
      >
        <button
          class="floating-action-btn"
          :data-testid="showFileTree ? 'btn-sidebar-collapse' : 'btn-sidebar-expand'"
          :title="showFileTree ? appText.collapseExplorer : appText.expandExplorer"
          @click="showFileTree = !showFileTree"
        >
          <svg v-if="showFileTree" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15,18 9,12 15,6" />
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9,18 15,12 9,6" />
          </svg>
        </button>
      </div>

      <section
        v-show="settingsContainer === 'workspace'"
        class="settings-page"
        data-testid="settings-page"
        :data-active="settingsContainer === 'workspace' ? 'true' : 'false'"
      >
        <SettingsPanel
          mode="workspace"
          :active-category="activeSettingsCategory"
          @update:active-category="activeSettingsCategory = $event"
          @close="closeTransientPanels"
        />
      </section>

      <section v-show="settingsContainer !== 'workspace'" class="editor-panel">
        <EditorTabs
          :tabs="tabs"
          :active-tab-id="activeTabId"
          @tab-click="handleTabClick"
          @tab-close="handleTabClose"
          @tab-close-others="handleCloseOthers"
          @tab-close-all="handleCloseAll"
          @rename-tab="handleRenameTab"
          @tabs-reorder="handleTabsReorder"
          @cancel-large-file-load="handleCancelLargeFileLoad"
            @retry-large-file-load="handleRetryLargeFileLoad"
        />

        <DiffView
          v-if="diffStore.isOpen && diffStore.session"
          :session="diffStore.session"
          @close="diffStore.close()"
          @update:layout="diffStore.setLayout($event)"
        />

        <div
          v-else-if="activeTab"
          class="editor-stage"
          :class="{
            'markdown-stage': isMarkdownTab && settingsStore.markdownPreviewEnabled,
            [`markdown-mode-${markdownPreviewMode}`]: isMarkdownTab && settingsStore.markdownPreviewEnabled,
          }"
        >
          <div class="editor-pane">
            <LazyEditorCore
              ref="editorCoreRef"
              :model-id="activeTab.id"
              :file-path="activeTab.filePath"
              :opened-model-ids="openedModelIds"
              :value="activeTab.content"
              :language="activeTab.language"
              :is-large-file="Boolean(activeTab.isLargeFile)"
              :read-only="Boolean(activeTab.isLoadingContent)"
              :theme="settingsStore.monacoTheme"
              @content-change="handleContentChange"
              @cursor-change="handleCursorChange"
              @scroll-change="handleEditorScrollChange"
              @model-save="handleSave"
            />
          </div>
          <div
            v-if="isMarkdownTab && settingsStore.markdownPreviewEnabled"
            class="preview-pane"
            data-testid="markdown-preview-pane"
          >
            <MarkdownPreview
              ref="markdownPreviewRef"
              :content="activeTab.content"
              :theme="previewTheme"
              :source-file-path="activeTab.filePath"
              :editor-scroll-state="editorScrollState"
              @request-preview-mode-change="setMarkdownPreviewMode"
            />
          </div>
        </div>

        <div v-else class="hero-empty">
          <div class="hero-actions minimal">
            <button class="hero-btn primary" @click="handleOpenFolder">{{ appText.openFolder }}</button>
            <button class="hero-btn" @click="handleOpenFile">{{ appText.openFile }}</button>
            <button class="hero-btn" @click="handleNewFile">{{ appText.newFile }}</button>
          </div>
        </div>
      </section>

      <transition name="context-rail-shell">
        <div
          v-if="showContextRail && settingsContainer !== 'workspace'"
          class="context-rail-shell"
          :class="{ resizing: isResizingContextRail }"
          :style="{ '--context-rail-width': `${contextRailWidth}px` }"
          data-testid="context-rail-shell"
        >
          <div
            class="context-rail-resizer"
            data-testid="context-rail-resizer"
            :class="{ dragging: isResizingContextRail }"
            @mousedown.prevent="startContextRailResize"
          ></div>
          <ContextRail
            :outline="documentOutline"
            :tasks="markdownContext.tasks"
            :links="markdownContext.links"
            :link-statuses="markdownLinkStatuses"
            :workspace-tasks="workspaceTaskEntries"
            :workspace-task-total="workspaceTaskTotal"
            :workspace-tasks-loading="workspaceTasksLoading"
            :workspace-tasks-truncated="workspaceTasksTruncated"
            :git-branch="gitStatus?.branch"
            :git-entries="gitStatus?.entries"
            :external-conflict-file-name="activeExternalConflict ? activeTab?.fileName ?? null : null"
            :language="activeTab?.language"
            :locale="settingsStore.uiLanguage"
            @navigate="handleContextNavigate"
            @find="editorCoreRef?.triggerFindWidget()"
            @go-to-line="editorCoreRef?.triggerGoToLine()"
            @select-git="handleSelectGitEntry"
            @reload-external="handleReloadExternalChange"
            @keep-external="handleKeepExternalChange"
            @show-external-details="externalConflictDialogOpen = true"
            @insert-image="handleInsertMarkdownImage"
            @refresh-tasks="handleWorkspaceTaskRefresh"
            @navigate-file="handleWorkspaceTaskNavigate"
            @export-html="handleExportMarkdownHtml"
            @toggle-collapse="showContextRail = false"
          />
        </div>
      </transition>

      <transition name="settings-drawer">
        <aside
          v-if="settingsContainer === 'drawer'"
          class="settings-drawer"
          data-testid="settings-drawer"
        >
          <SettingsPanel
            mode="drawer"
            :active-category="activeSettingsCategory"
            @update:active-category="activeSettingsCategory = $event"
            @open-workspace="toggleSettingsContainer('workspace')"
            @close="closeTransientPanels"
          />
        </aside>
      </transition>
    </div>

    <StatusBar
      :cursor-position="cursorPosition"
      :encoding="encoding"
      :language="language"
      :monaco-theme="settingsStore.monacoTheme"
      :word-count="wordCount"
      :auto-save-enabled="autoSaveEnabled"
      :last-save-time="lastSaveTime"
      @encoding-change="handleEncodingChange"
      @language-change="handleLanguageChange"
      @theme-change="handleThemeChange"
    />

  </div>
</template>

<style>
:root {
  color-scheme: dark;
  --font-ui: 'Manrope Variable', 'Avenir Next', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Segoe UI', sans-serif;
  --font-code: 'JetBrains Mono Variable', 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
  --panel-radius: 0;
  --panel-gap: 8px;
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
  font-family: var(--font-ui);
  font-synthesis: none;
  letter-spacing: 0;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code,
pre,
kbd,
samp {
  font-family: var(--font-code);
}

button,
input,
select,
textarea {
  font-family: inherit;
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
  overflow: hidden;
  padding: var(--panel-gap);
  gap: calc(var(--panel-gap) * 0.8);
}

.sidebar-shell {
  display: flex;
  flex-shrink: 0;
  min-height: 0;
  min-width: 0;
  width: calc(var(--sidebar-width) + 10px);
  overflow: hidden;
}

.context-rail-shell {
  display: flex;
  flex: 0 0 var(--context-rail-width);
  width: var(--context-rail-width);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border-soft);
  border-radius: var(--panel-radius);
  background: rgba(9, 14, 26, 0.52);
  box-shadow: var(--shadow-soft);
}

.context-rail-resizer {
  width: 10px;
  flex-shrink: 0;
  cursor: col-resize;
  opacity: 0;
  background: transparent;
  transition: opacity .2s ease, background .2s ease;
}

.context-rail-shell:hover .context-rail-resizer,
.context-rail-resizer.dragging {
  opacity: 1;
  background: rgba(77, 171, 255, .45);
}

.sidebar,
.editor-panel,
.settings-page,
.settings-drawer {
  flex-shrink: 0;
  border: 1px solid var(--border-soft);
  border-radius: var(--panel-radius);
  background: rgba(9, 14, 26, 0.52);
  backdrop-filter: blur(14px);
  min-height: 0;
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-soft);
}

.settings-drawer {
  position: absolute;
  top: var(--panel-gap);
  right: var(--panel-gap);
  bottom: var(--panel-gap);
  width: 520px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--panel-overlay);
  box-shadow: var(--shadow-overlay);
  z-index: var(--z-drawer, 50);
}

.shell-overlay {
  position: absolute;
  inset: var(--panel-gap);
  border-radius: 0;
  background: rgba(2, 6, 23, 0.48);
  backdrop-filter: blur(4px);
  z-index: calc(var(--z-drawer, 50) - 1);
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
  border-radius: var(--radius-sm);
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
  background: rgba(8, 12, 22, 0.34);
}

.settings-page {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, rgba(13, 21, 36, 0.92), rgba(10, 16, 29, 0.96));
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
  overflow: hidden;
}

.markdown-stage {
  display: flex;
  min-width: 0;
}

.markdown-stage .editor-pane,
.markdown-stage .preview-pane {
  transition:
    flex-basis 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    max-width 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.22s ease,
    transform 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.22s ease;
  will-change: flex-basis, max-width, opacity, transform;
}

.markdown-stage.markdown-mode-split .preview-pane {
  flex-basis: 50%;
  max-width: 50%;
  border-left: 1px solid var(--border-soft);
  border-radius: 0;
  opacity: 1;
  transform: translateX(0);
}

.markdown-stage.markdown-mode-preview .preview-pane {
  flex-basis: 100%;
  max-width: 100%;
  border-left: 1px solid transparent;
  border-radius: 0;
  opacity: 1;
  transform: translateX(0);
}

.markdown-stage.markdown-mode-split .editor-pane {
  flex-basis: 50%;
  max-width: 50%;
  border-radius: 0;
}

.preview-pane {
  flex: 0 0 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.markdown-stage.markdown-mode-edit .editor-pane {
  flex-basis: 100%;
  max-width: 100%;
}

.markdown-stage.markdown-mode-edit .preview-pane {
  flex-basis: 0;
  max-width: 0;
  opacity: 0;
  transform: translateX(22px);
  border-left: 1px solid transparent;
  pointer-events: none;
}

.markdown-stage.markdown-mode-preview .editor-pane {
  flex-basis: 0;
  max-width: 0;
  opacity: 0;
  transform: translateX(-22px);
  pointer-events: none;
}

.sidebar-shell .sidebar {
  transition: width 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

.sidebar-shell.resizing .sidebar {
  transition: none;
}

.sidebar-shell-enter-active,
.sidebar-shell-leave-active {
  transition:
    width 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.24s ease,
    transform 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    filter 0.24s ease;
}

.sidebar-shell-enter-from,
.sidebar-shell-leave-to {
  width: 0;
  opacity: 0;
  transform: translateX(-14px) scale(0.985);
  filter: saturate(0.88);
}

.context-rail-shell-enter-active,
.context-rail-shell-leave-active {
  transition: width .24s ease, flex-basis .24s ease, opacity .2s ease, transform .24s ease;
}

.context-rail-shell-enter-from,
.context-rail-shell-leave-to {
  width: 0;
  flex-basis: 0;
  opacity: 0;
  transform: translateX(12px);
}

.sidebar-resizer {
  width: 10px;
  cursor: col-resize;
  flex-shrink: 0;
  border-radius: 0;
  margin: 14px 0;
  background: transparent;
  opacity: 0;
  transition: opacity 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.sidebar-resizer.dragging {
  opacity: 1;
  background: rgba(77, 171, 255, 0.45);
  transform: scaleX(1.08);
}

.floating-controls {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 9;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.floating-action-btn {
  min-width: 28px;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-soft);
  background: rgba(16, 23, 38, 0.85);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.floating-action-btn:hover {
  border-color: rgba(125, 211, 252, 0.55);
  color: var(--text-primary);
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
  border-radius: var(--radius-lg);
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
  border-radius: var(--radius-xs);
  background: rgba(124, 199, 255, 0.12);
  color: var(--accent-blue);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0;
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
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-soft);
  background: var(--surface-muted);
  color: var(--text-secondary);
  cursor: pointer;
}

.hero-btn {
  min-width: 120px;
  height: 42px;
  padding: 0 16px;
  border-radius: var(--radius-sm);
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

.settings-drawer-enter-active,
.settings-drawer-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}

.settings-drawer-enter-from,
.settings-drawer-leave-to {
  transform: translateX(24px);
  opacity: 0;
}

@media (max-width: 960px) {
  .sidebar {
    width: 260px;
  }

  .settings-drawer {
    top: 8px;
    right: 8px;
    bottom: 8px;
    width: min(90vw, 420px);
  }

  .main-layout {
    --panel-gap: 6px;
  }

  .hero-card {
    padding: 24px;
  }

  .hero-card h1 {
    font-size: 28px;
  }
}

@media (min-width: 1280px) {
  .main-layout {
    --panel-gap: 0px;
    gap: 0;
    padding: 0;
  }

  .sidebar-shell {
    width: var(--sidebar-width);
  }

  .sidebar,
  .editor-panel,
  .settings-page,
  .context-rail-shell {
    border: 0;
    border-radius: 0;
    box-shadow: none;
    background: var(--panel);
    backdrop-filter: none;
  }

  .sidebar {
    border-right: 1px solid var(--border-soft);
  }

  .context-rail-shell {
    border-left: 1px solid var(--border-soft);
  }

  .sidebar-resizer {
    width: 1px;
    margin: 0;
  }

  .sidebar-resizer:hover,
  .sidebar-resizer.dragging {
    opacity: 1;
    background: var(--accent-blue);
  }

  .context-rail-resizer {
    width: 1px;
  }

  .context-rail-shell:hover .context-rail-resizer,
  .context-rail-resizer.dragging {
    background: var(--accent-blue);
  }
}

@media (min-width: 1024px) and (max-width: 1279px) {
  .context-rail-shell {
    position: absolute;
    z-index: calc(var(--z-drawer, 50) - 1);
    top: var(--panel-gap);
    right: var(--panel-gap);
    bottom: var(--panel-gap);
    box-shadow: var(--shadow-overlay);
  }
}

@media (min-width: 800px) and (max-width: 1023px) {
  .sidebar-shell {
    position: absolute;
    z-index: calc(var(--z-drawer, 50) - 1);
    top: var(--panel-gap);
    left: var(--panel-gap);
    bottom: var(--panel-gap);
    box-shadow: var(--shadow-overlay);
  }

  .context-rail-shell {
    position: absolute;
    z-index: calc(var(--z-drawer, 50) - 1);
    top: var(--panel-gap);
    right: var(--panel-gap);
    bottom: var(--panel-gap);
    box-shadow: var(--shadow-overlay);
  }
}

@media (max-width: 799px) {
  .sidebar-shell {
    position: fixed;
    z-index: calc(var(--z-drawer, 50) + 1);
    inset: 0 auto 0 0;
    width: min(var(--sidebar-width), 100vw);
    max-width: 100vw;
  }

  .context-rail-shell {
    position: fixed;
    z-index: calc(var(--z-drawer, 50) + 1);
    inset: 0 0 0 auto;
    width: min(var(--context-rail-width), 100vw);
    max-width: 100vw;
    border: 0;
    border-radius: 0;
    box-shadow: var(--shadow-overlay);
  }
}
</style>
