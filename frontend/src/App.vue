<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
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
import { useDiagnosticsStore, type DiagnosticRecord } from '@/stores/diagnostics';
import { useCloudSyncStore } from '@/stores/cloudSync';
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
import type { WindowTransferPayload, WindowTransferTab } from '@/lib/tauri';
import { providerRegistry } from '@/services/providerRegistry';
import { registerBuiltinProviders } from '@/services/providers/builtinProviders';
import { useProvidersStore } from '@/stores/providers';
import { createCommandExecutor, createCommandRegistry } from '@/services/commandRegistry';
import type { AppCommand } from '@/services/commandRegistry';
import {
  createWorkspaceWatcherService,
  normalizeWorkspacePath,
} from '@/services/workspaceWatcherService';
import { createWorkspaceRuntimeService } from '@/services/workspaceRuntimeService';
import { sessionService } from '@/services/sessionService';
import { createWorkspaceService } from '@/services/workspaceService';
import { createTabService } from '@/services/tabService';
import { createWindowService } from '@/services/windowService';
import { createApplicationLspService } from '@/services/lsp/applicationLspService';
import {
  configureMonacoLspBridge,
  getMonacoLspBridge,
  type MonacoHierarchyItem,
  type MonacoWorkspaceSymbol,
} from '@/services/lsp/monacoLspBridge';
import { registerMonacoEditorOpener } from '@/lib/monaco/setupMonaco';
import { pathToUri, uriToPath, untitledUri } from '@/services/lsp/pathUri';
import {
  buildDocumentOutline,
  buildOutlineFromDocumentSymbols,
  type OutlineItem,
} from '@/services/documentOutlineService';
import {
  collectMarkdownContext,
  replaceMarkdownCodeFenceLanguage,
} from '@/services/markdownService';
import {
  flattenWorkspaceTasks,
  importMarkdownAsset,
  importMarkdownAssetBytes,
  loadMarkdownLinkStatuses,
  loadWorkspaceTasks,
} from '@/services/markdownContextService';
import { rankQuickOpenFiles } from '@/services/quickOpenService';
import { NavigationHistory, type NavigationLocation } from '@/services/navigationHistory';
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
  cloudCommands,
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
import { guardPersistedScratchWorkspace } from '@/services/scratchWorkspaceGuard';
import {
  getAppI18n,
  getCloudDocConflictI18n,
  getCloudDocEditOpenI18n,
  getCloudDocPanelI18n,
  getCommandText,
  getFileTreeI18n,
  getMarkdownPreviewI18n,
  getSettingsPanelI18n,
  getToolbarI18n,
  type CommandId,
} from '@/i18n/ui';
import CommandPalette from './components/editor/CommandPalette.vue';
import WorkspaceSearchPanel from './components/editor/WorkspaceSearchPanel.vue';
import ReplacePreviewDialog from './components/editor/ReplacePreviewDialog.vue';
import Toolbar from './components/editor/Toolbar.vue';
import FileTree from './components/editor/FileTree.vue';
import ScratchWorkspaceBanner from './components/editor/ScratchWorkspaceBanner.vue';
import CloudDocSidebar from './components/editor/CloudDocSidebar.vue';
import EditorTabs from './components/editor/EditorTabs.vue';
import EditorBreadcrumbs, { type EditorBreadcrumbSegment } from './components/editor/EditorBreadcrumbs.vue';
import { LazyEditorCore } from './components/editor/LazyEditorCore';
import MarkdownPreview from './components/editor/MarkdownPreview.vue';
import ContextRail from './components/editor/ContextRail.vue';
import DiffView from './components/editor/DiffView.vue';
import ExternalChangeDialog from './components/editor/ExternalChangeDialog.vue';
import ProblemsPanel from './components/editor/ProblemsPanel.vue';
import ReferenceResultsPanel, { type ReferenceResultGroup, type ReferenceResultItem } from './components/editor/ReferenceResultsPanel.vue';
import HierarchyPanel, { type HierarchyMode, type HierarchyRow } from './components/editor/HierarchyPanel.vue';
import CloudDocBrowser from './components/editor/CloudDocBrowser.vue';
import CloudDocConflictDialog from './components/editor/CloudDocConflictDialog.vue';
import CloudDocSyncDialog from './components/editor/CloudDocSyncDialog.vue';
import CloudFolderUploadDialog from './components/editor/CloudFolderUploadDialog.vue';
import ShareDialog from './components/editor/ShareDialog.vue';
import CenterToast from './components/ui/CenterToast.vue';
import ShareStatsDialog from './components/editor/ShareStatsDialog.vue';
import { useCenterToastStore } from './stores/centerToast';
import { resolveCloudDocPathForFile } from '@/services/cloudSyncService';
import type { CloudSyncResult } from '@/services/cloudSyncService';
import { folderAssetsOk, shouldShowFolderAssets } from '@/services/cloudFolderUploadService';
import type { FolderUploadSummary } from '@/services/cloudFolderUploadService';
import { getShareStatus } from '@/services/cloudShareService';
import { isBinaryDocPath, uploadBinaryDocument, validateBinaryDocLocal } from '@/services/cloudBinaryService';
import StatusBar from './components/editor/StatusBar.vue';
import SettingsPanel from './components/editor/SettingsPanel.vue';
import Notification from './components/ui/Notification.vue';
import ImagePreview from './components/editor/ImagePreview.vue';
import ImageViewer from './components/editor/ImageViewer.vue';
import { isImageFilePath } from '@/utils/fileTypes';
import { createAutoSaveScheduler } from '@/utils/autoSaveScheduler';
import { createContentHasher, normalizeContentHash } from '@/utils/contentHash';
import { getCloudDoc, saveCloudDoc } from '@/services/cloudDocService';
import { materializeCloudDocForEdit } from '@/services/cloudDocEditOpen';
import type { CloudDocTreeNode } from '@/services/cloudBrowserService';
import {
  createCloudDocSaveController,
  type SaveControllerEvent,
} from '@/services/cloudDocSaveController';
import DocumentPreview from './components/editor/DocumentPreview.vue';
import {
  isDocumentPreviewFilePath,
  isPdfFilePath,
  isSpreadsheetFilePath,
} from '@/utils/documentPreview';
import * as monaco from '@/lib/monaco/editor';

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
const diagnosticsStore = useDiagnosticsStore();
const cloudSyncStore = useCloudSyncStore();
const centerToast = useCenterToastStore();
const pendingLocalWrites = new Map<string, number>();
const markLocalWritePending = (filePath?: string | null) => {
  if (filePath) pendingLocalWrites.set(normalizeFsPath(filePath), Date.now() + 4000);
};
const consumePendingLocalWrite = (filePath: string) => {
  const key = normalizeFsPath(filePath);
  const expiresAt = pendingLocalWrites.get(key);
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) {
    pendingLocalWrites.delete(key);
    return false;
  }
  pendingLocalWrites.delete(key);
  return true;
};
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
const applicationLspService = createApplicationLspService(undefined, {
  onUnavailable: (descriptor) => {
    const languages = descriptor.languageIds.join(', ');
    notificationStore.warning(
      `语言服务不可用：${languages}`,
      `Tau Editor 未能自动准备 ${descriptor.displayName}，已回退基础导航。请检查网络后重试，或在设置中点击“自动准备”。`,
    );
  },
});
const lspDiagnosticCounts = new Map<string, number>();
const problemsPanelVisible = ref(false);
/** 云端文档浏览器（命令面板 / 设置页「浏览云端文档」打开） */
const cloudBrowserVisible = ref(false);
const referencePanelVisible = ref(false);
const referencePanelLoading = ref(false);
const referencePanelError = ref<string | null>(null);
const referenceGroups = ref<ReferenceResultGroup[]>([]);
let referenceRequestId = 0;
const hierarchyPanelVisible = ref(false);
const hierarchyPanelMode = ref<HierarchyMode>('call');
const hierarchyPanelLoading = ref(false);
const hierarchyPanelError = ref<string | null>(null);
const hierarchyRoot = ref<{ name: string; detail?: string } | null>(null);
const hierarchyRows = ref<HierarchyRow[]>([]);
let hierarchyRequestId = 0;
configureMonacoLspBridge({
  resolveClient: (model, context) => applicationLspService.resolveClient(model, context),
  onDiagnostics: ({ uri, diagnostics }) => {
    diagnosticsStore.setDiagnostics(uri, diagnostics.map((diagnostic) => ({
      message: diagnostic.message,
      severity: diagnostic.severity,
      source: diagnostic.source,
      code: typeof diagnostic.code === 'object' ? diagnostic.code.value : diagnostic.code,
      startLineNumber: diagnostic.startLineNumber,
      startColumn: diagnostic.startColumn,
      endLineNumber: diagnostic.endLineNumber,
      endColumn: diagnostic.endColumn,
    })));
    if (diagnostics.length > 0) {
      lspDiagnosticCounts.set(uri, diagnostics.length);
      problemsPanelVisible.value = true;
    } else {
      lspDiagnosticCounts.delete(uri);
    }
  },
});
// Markdown 图片粘贴可以在未打开工作区时按文档所在目录静默注册临时工作区。
const markdownWorkspaceRuntime = createWorkspaceRuntimeService();
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
const paletteMode = ref<'commands' | 'quick-open' | 'workspace-symbol'>('commands');
const navigationHistory = new NavigationHistory();
const navigationHistoryRevision = ref(0);
const pushNavigationHistory = (location: NavigationLocation) => {
  navigationHistory.push(location);
  navigationHistoryRevision.value += 1;
};
const canGoBack = computed(() => {
  navigationHistoryRevision.value;
  return navigationHistory.canGoBack;
});
const canGoForward = computed(() => {
  navigationHistoryRevision.value;
  return navigationHistory.canGoForward;
});
const restoringNavigation = ref(false);
const workspaceSymbolCommands = ref<AppCommand[]>([]);
const workspaceSymbolTargets = ref<NavigationLocation[]>([]);
let workspaceSymbolRequestId = 0;
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
type SettingsCategory = 'general' | 'editor' | 'themes' | 'cloudSync' | 'fileAssociations' | 'updates' | 'about';
const settingsContainer = ref<SettingsContainer | null>(null);
const activeSettingsCategory = ref<SettingsCategory>('general');
const fileTreeContextEntry = ref<FileTreeNode | null>(null);
const nameDialogInput = ref<HTMLInputElement | null>(null);
const nameDialog = ref({
  visible: false,
  title: '',
  value: '',
  resolve: null as ((value: string | null) => void) | null,
});
const fileDetailsDialog = ref<{ visible: boolean; entry: FileTreeNode | null }>({
  visible: false,
  entry: null,
});
const editorScrollState = ref<{ top: number; height: number; scrollHeight: number } | null>(null);
/**
 * 目录联动高亮的唯一状态源（D6）：编辑器视口首行 / 预览当前标题行 / 点击大纲项，
 * 三条路径都写入这里，由 ContextRail 映射到具体大纲项。0 表示暂无当前项。
 */
const activeOutlineLine = ref(0);
/** 预览滚动驱动编辑器比例同步的时间窗，避免编辑器回写的高亮抢走预览当前标题。 */
let previewDrivingActiveLineUntil = 0;
/** 点击大纲项后短暂锁定高亮，避免 revealLine / scrollIntoView 引发的事件立刻改写它。 */
let navigationLockedActiveLineUntil = 0;
const PREVIEW_DRIVING_WINDOW_MS = 200;
const NAVIGATION_LOCK_WINDOW_MS = 400;
const writeActiveOutlineLine = (line: number) => {
  if (!Number.isFinite(line) || line <= 0) {
    return;
  }
  activeOutlineLine.value = Math.floor(line);
};
type EditorCoreExpose = {
  getContent: () => string;
  replaceContent: (content: string) => boolean;
  getPosition: () => { line: number; column: number } | null;
  focusAtStart: () => void;
  insertText: (text: string) => void;
  layout: () => void;
  triggerFindWidget: () => void;
  triggerGoToLine: () => void;
  goToDefinition: () => void;
  goToDeclaration: () => void;
  goToTypeDefinition: () => void;
  goToImplementation: () => void;
  peekDefinition: () => void;
  peekReferences: () => void;
  findReferences: () => void;
  renameSymbol: () => void;
  requestReferences: () => Promise<monaco.languages.Location[] | null>;
  cancelReferences: () => void;
  setScrollTop: (top: number) => void;
  triggerNativeReferences: () => void;
  requestCallHierarchy: () => Promise<{
    root: MonacoHierarchyItem | null;
    rows: Array<{ direction: string; item: MonacoHierarchyItem }>;
  } | null>;
  requestTypeHierarchy: () => Promise<{
    root: MonacoHierarchyItem | null;
    rows: Array<{ direction: string; item: MonacoHierarchyItem }>;
  } | null>;
  cancelHierarchy: () => void;
  saveLspDocument: () => void;
  revealLine: (line: number, column?: number) => void;
  applyMarkdownAction: (action: MarkdownAction) => void;
  applyMarkdownHeading: (level: number) => void;
  applyMarkdownCode: (language: string) => void;
  undo: () => void;
  redo: () => void;
};
type MarkdownAction = 'heading' | 'bold' | 'italic' | 'strike' | 'quote' | 'bullet-list' | 'ordered-list' | 'task-list' | 'code' | 'link' | 'timestamp' | 'table' | 'horizontal-rule' | 'details' | 'mermaid' | 'toc' | 'image';
const editorCoreRef = ref<EditorCoreExpose | null>(null);
type SettingsPanelExpose = {
  installUpdate: () => Promise<{ success: boolean; error?: string }>;
};
const workspaceSettingsPanelRef = ref<SettingsPanelExpose | null>(null);
type TitlebarUpdateState = {
  available: boolean;
  canInstall: boolean;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  releaseUrl: string;
};
type UpdateDownloadProgress = {
  downloadedBytes: number;
  totalBytes: number | null;
  progress: number | null;
};
const titlebarUpdate = ref<TitlebarUpdateState | null>(null);
const titlebarUpdateProgress = ref<number | null>(null);
const titlebarUpdateProgressVisible = ref(false);
const titlebarUpdateComplete = ref(false);
let unlistenUpdateProgress: (() => void) | null = null;
let titlebarProgressTimer: ReturnType<typeof setTimeout> | null = null;
type FileTreeExpose = { revealPath: (path: string) => Promise<boolean> | boolean };
const fileTreeRef = ref<FileTreeExpose | null>(null);
type MarkdownPreviewExpose = { scrollToSourceLine: (line: number) => void };
const markdownPreviewRef = ref<MarkdownPreviewExpose | null>(null);
type ImageViewerPayload = {
  src: string;
  alt?: string;
  resolvedSrc?: string;
};
type ImageViewerState = {
  src: string;
  alt: string;
};
const imageViewerState = ref<ImageViewerState | null>(null);
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
let disposeMonacoEditorOpener: (() => void) | null = null;
let sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
let autoSaveTimer: ReturnType<typeof setInterval> | null = null;
let autoSaveInFlight = false;
let externalFileSyncTimer: ReturnType<typeof setInterval> | null = null;
let externalFileSyncInFlight = false;
let workspaceContextRequestId = 0;

const clampSidebarWidth = (value: number) =>
  Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value));
const clampContextRailWidth = (value: number) =>
  Math.min(MAX_CONTEXT_RAIL_WIDTH, Math.max(MIN_CONTEXT_RAIL_WIDTH, value));
const normalizeFsPath = (path: string) => path.replace(/\\/g, '/');
const canonicalFsPath = (path: string) => {
  const normalized = normalizeFsPath(path).replace(/\/+/g, '/');
  const prefix = /^[A-Za-z]:\//.test(normalized) ? normalized.slice(0, 3) : normalized.startsWith('/') ? '/' : '';
  const segments = normalized.slice(prefix.length).split('/');
  const resolved: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      // Keep the path normalizer compatible with the DOM lib target used by
      // the release runners; avoid Array.prototype.at() here.
      if (resolved.length && resolved[resolved.length - 1] !== '..') resolved.pop();
      else if (!prefix) resolved.push('..');
      continue;
    }
    resolved.push(segment);
  }
  const body = resolved.join('/');
  if (prefix === '/') return `/${body}` || '/';
  if (prefix) return `${prefix}${body}`;
  return body;
};
const isWindowsFsPath = (path: string) => /^[A-Za-z]:\//.test(normalizeFsPath(path)) || normalizeFsPath(path).startsWith('//');
const comparableFsPath = (path: string) => {
  const normalized = canonicalFsPath(path);
  if (normalized === '/') return normalized;
  return isWindowsFsPath(normalized) ? normalized.toLowerCase() : normalized;
};
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
const findFileTreeEntryByNormalizedPath = (entries: FileTreeNode[], targetPath: string): FileTreeNode | null => {
  const normalizedTarget = comparableFsPath(targetPath);
  for (const entry of entries) {
    if (comparableFsPath(entry.path) === normalizedTarget) {
      return entry;
    }
    if (entry.children) {
      const found = findFileTreeEntryByNormalizedPath(entry.children, normalizedTarget);
      if (found) return found;
    }
  }
  return null;
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
const editorBreadcrumbBackground = computed(() => {
  const theme = settingsStore.activeMonacoThemeDefinition;
  const builtInBackgrounds: Record<string, string> = {
    vs: '#fffffe',
    'vs-dark': '#1e1e1e',
    'hc-black': '#000000',
  };
  return theme?.colors['editor.background']
    ?? builtInBackgrounds[theme?.base ?? settingsStore.monacoTheme]
    ?? '#1e1e1e';
});
const editorBreadcrumbSegments = computed<EditorBreadcrumbSegment[]>(() => {
  const tab = activeTab.value;
  if (!tab) return [];
  if (!tab.filePath) {
    return [{ label: tab.fileName, path: null, kind: 'file', navigable: false }];
  }

  const workspacePath = workspaceStore.currentWorkspacePath;
  if (!workspacePath) {
    return [{ label: tab.fileName, path: tab.filePath, kind: 'file', navigable: false }];
  }

  const normalizedWorkspacePath = canonicalFsPath(workspacePath);
  const normalizedFilePath = canonicalFsPath(tab.filePath);
  const comparableWorkspacePath = comparableFsPath(normalizedWorkspacePath);
  const comparableFilePath = comparableFsPath(normalizedFilePath);
  const isWorkspaceRoot = comparableWorkspacePath === '/';
  const isInsideWorkspace = comparableFilePath === comparableWorkspacePath
    || (isWorkspaceRoot
      ? comparableFilePath.startsWith('/')
      : comparableFilePath.startsWith(`${comparableWorkspacePath}/`));

  if (!isInsideWorkspace) {
    return [{ label: tab.fileName, path: tab.filePath, kind: 'file', navigable: false }];
  }

  const segments: EditorBreadcrumbSegment[] = [{
    label: workspaceStore.currentWorkspaceName ?? getBaseNameFromFsPath(workspacePath),
    path: workspacePath,
    kind: 'workspace',
    navigable: true,
  }];
  const relativePath = normalizedFilePath.slice(normalizedWorkspacePath.length).replace(/^\/+/, '');
  const parts = relativePath.split('/').filter(Boolean);
  let currentPath = normalizedWorkspacePath;

  parts.forEach((part, index) => {
    currentPath = joinFsPath(currentPath, part);
    const isFile = index === parts.length - 1;
    segments.push({
      label: part,
      path: currentPath,
      kind: isFile ? 'file' : 'folder',
      navigable: true,
    });
  });

  return segments;
});
const cursorPosition = computed(() => editorStore.cursorPosition);
const encoding = computed(() => editorStore.encoding);
const language = computed(() => activeTab.value?.language ?? editorStore.language);
const autoSaveEnabled = computed(() => settingsStore.autoSaveEnabled);
const lastSaveTime = computed(() => editorStore.lastAutoSaveTime ?? undefined);
const isDirty = computed(() => activeTab.value?.isDirty ?? false);
const isMarkdownTab = computed(() => activeTab.value?.language === 'markdown');
const isImageTab = computed(() => isImageFilePath(activeTab.value?.filePath));
const isPdfTab = computed(() => isPdfFilePath(activeTab.value?.filePath));
const isSpreadsheetTab = computed(() => isSpreadsheetFilePath(activeTab.value?.filePath));
const isFullDocumentPreviewTab = computed(() => isPdfTab.value || isSpreadsheetTab.value);
const isDocumentPreviewTab = computed(() => isDocumentPreviewFilePath(activeTab.value?.filePath));
const isPreviewableTab = computed(() => (
  isDocumentPreviewTab.value
  || (isMarkdownTab.value && settingsStore.markdownPreviewEnabled)
));
const hasMacWindowTitlebar = computed(() => isTauriApp()
  && typeof navigator !== 'undefined'
  && /Macintosh|Mac OS X/.test(navigator.userAgent));
const hasDesktopWindowTitlebar = computed(() => isTauriApp());
const markdownPreviewMode = computed(() => isFullDocumentPreviewTab.value
  ? 'preview'
  : activeTab.value?.markdownPreviewMode ?? settingsStore.markdownPreviewMode);
const markdownPreviewFontSize = computed(() => {
  const value = activeTab.value?.markdownPreviewFontSize;
  return typeof value === 'number' && Number.isFinite(value) ? value : 16;
});
const titlebarUpdateNotes = computed(() => titlebarUpdate.value?.releaseNotes.trim() || (
  settingsStore.uiLanguage === 'en-US' ? 'No release notes provided.' : '暂无更新说明。'
));
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

const openImageViewer = (payload: ImageViewerPayload) => {
  const src = payload.resolvedSrc?.trim() || payload.src.trim();
  if (!src) {
    return;
  }

  imageViewerState.value = {
    src,
    alt: payload.alt?.trim() || '图片',
  };
};

const closeImageViewer = () => {
  imageViewerState.value = null;
};
const appText = computed(() => getAppI18n(settingsStore.uiLanguage));
const toolbarText = computed(() => getToolbarI18n(settingsStore.uiLanguage));
const markdownPreviewText = computed(() => getMarkdownPreviewI18n(settingsStore.uiLanguage));
const cloudSyncCopy = computed(() => getSettingsPanelI18n(settingsStore.uiLanguage));
/** 文件树文案（含 R3「上传该文件夹到云端」的提示与结果文案） */
const fileTreeCopy = computed(() => getFileTreeI18n(settingsStore.uiLanguage));
const workspaceLabel = computed(() => {
  if (mode.value !== 'workspace') {
    return undefined;
  }

  return workspaceStore.currentWorkspaceName ?? appText.value.workspaceNotOpen;
});
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
  : paletteMode.value === 'workspace-symbol' ? workspaceSymbolCommands.value : filteredCommands.value);
const highlightedCommand = computed(() => paletteCommands.value[commandStore.highlightedIndex] ?? paletteCommands.value[0] ?? null);
const lspDocumentOutline = ref<OutlineItem[] | null>(null);
let documentOutlineRequestId = 0;

/**
 * 优先从当前 Monaco 模型请求 LSP documentSymbol；模型尚未创建或服务不可用时
 * 返回 null，由 documentOutline computed 自动使用原有 Markdown/正则解析器。
 */
const refreshLspDocumentOutline = async (tab: Tab | null) => {
  const requestId = ++documentOutlineRequestId;
  lspDocumentOutline.value = null;
  if (!tab || tab.isLargeFile || !['markdown', 'json', 'yaml', 'typescript', 'javascript', 'vue', 'python', 'java', 'go', 'rust', 'c', 'cpp', 'csharp'].includes(tab.language)) {
    return;
  }

  const modelUris = [
    tab.filePath ? pathToUri(tab.filePath) : null,
    // 保存前创建的缓存模型在部分切换时仍保持 untitled URI；Bridge 的注册上下文
    // 已经会更新为 file URI，因此这里把两种 URI 都作为查找候选。
    untitledUri(tab.id),
  ].filter((uri): uri is string => Boolean(uri));
  // EditorCore 在 Vue 更新后才创建模型；短暂重试可覆盖切换标签和首次恢复会话。
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (requestId !== documentOutlineRequestId) return;
    await nextTick();
    const model = modelUris
      .map((uri) => monaco.editor.getModel(monaco.Uri.parse(uri)))
      .find((candidate): candidate is monaco.editor.ITextModel => Boolean(candidate));
    if (model) {
      const bridge = getMonacoLspBridge();
      if (!bridge) return;
      try {
        const symbols = await bridge.provideDocumentSymbols(model);
        if (requestId !== documentOutlineRequestId) return;
        const outline = buildOutlineFromDocumentSymbols(symbols);
        // 空响应通常表示语言服务未启动、文件暂时未解析或该语言没有符号，
        // 此时保留既有 fallback，避免侧栏从可用内容变为空白。
        lspDocumentOutline.value = outline.length > 0 ? outline : null;
      } catch (error) {
        if (requestId === documentOutlineRequestId) {
          console.debug('[DocumentOutline] LSP documentSymbol unavailable', error);
        }
      }
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
  }
};

const documentOutline = computed(() => {
  const tab = activeTab.value;
  if (!tab || tab.isLargeFile) {
    return [];
  }
  if (lspDocumentOutline.value !== null) {
    return lspDocumentOutline.value;
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
  fileSystemStore.selectEntry?.(tab?.filePath ?? null);
  void refreshLspDocumentOutline(tab);
}, { immediate: true });

watch(activeTab, (tab, previousTab) => {
  if (restoringNavigation.value || tab?.id === previousTab?.id) {
    return;
  }

  const previousPosition = editorCoreRef.value?.getPosition?.();
  if (previousTab?.filePath) {
    pushNavigationHistory({
      filePath: previousTab.filePath,
      line: previousPosition?.line ?? editorStore.cursorPosition.line,
      column: previousPosition?.column ?? editorStore.cursorPosition.column,
    });
  }

  if (tab?.filePath) {
    const filePath = tab.filePath;
    void nextTick(() => {
      if (restoringNavigation.value || activeTab.value?.id !== tab.id) {
        return;
      }
      const position = editorCoreRef.value?.getPosition?.();
      pushNavigationHistory({
        filePath,
        line: position?.line ?? 1,
        column: position?.column ?? 1,
      });
    });
  }
}, { immediate: true });

// 内容、路径或语言变化时重新请求符号；未安装 LSP 时 computed 仍稳定使用 fallback。
watch(
  () => [
    activeTab.value?.id ?? '',
    activeTab.value?.content ?? '',
    activeTab.value?.filePath ?? '',
    activeTab.value?.language ?? '',
  ],
  () => {
    if (activeTab.value) void refreshLspDocumentOutline(activeTab.value);
  },
  { flush: 'post' },
);

const handleNewFile = () => {
  workspaceService.createUntitledFile();
  void nextTick(() => {
    editorCoreRef.value?.focusAtStart();
  });
};

const openFileInEditor = async (filePath: string) => {
  await workspaceService.openFile(filePath);
};

const handleMarkdownOpenFile = async (payload: { path: string; href: string }) => {
  if (!payload.path.trim()) {
    return;
  }
  await openFileInEditor(payload.path);
};

/**
 * 等待目标标签和 EditorCore 完成响应式切换。openFile() 会同步激活已有标签，
 * 新标签则要等 Vue 更新一次后才会由 EditorCore 创建/绑定 Monaco model。
 */
const waitForEditorTarget = async (filePath: string, attempts = 40): Promise<boolean> => {
  const targetPath = comparableFsPath(filePath);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await nextTick();
    const activePath = activeTab.value?.filePath;
    if (
      activePath
      && comparableFsPath(activePath) === targetPath
      && editorCoreRef.value
    ) {
      return true;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
  }
  return false;
};

/**
 * 接管 Monaco 的跨文件 openCodeEditor 请求，让 LSP 返回的 file:// 位置进入
 * Tau 的标签/工作区打开流程，再按 Monaco 已转换好的 1-based 选区定位。
 */
const openMonacoCodeEditor: monaco.editor.ICodeEditorOpener['openCodeEditor'] = async (
  _source,
  resource,
  selectionOrPosition,
): Promise<boolean> => {
  const filePath = uriToPath(resource.toString());
  if (!filePath) {
    return false;
  }

  pushCurrentNavigation();
  await openFileInEditor(filePath);
  if (!await waitForEditorTarget(filePath)) {
    return false;
  }

  const line = selectionOrPosition && 'startLineNumber' in selectionOrPosition
    ? selectionOrPosition.startLineNumber
    : selectionOrPosition?.lineNumber;
  const column = selectionOrPosition && 'startColumn' in selectionOrPosition
    ? selectionOrPosition.startColumn
    : selectionOrPosition?.column;
  editorCoreRef.value?.revealLine(line ?? 1, column ?? 1);
  pushNavigationHistory({
    filePath,
    line: line ?? 1,
    column: column ?? 1,
  });
  return true;
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

const handleOpenRecentFolder = async (path: string) => {
  try {
    await workspaceService.openRecentProject(path);
    showFileTree.value = true;
  } catch (error) {
    notificationStore.error('打开文件夹失败', error instanceof Error ? error.message : '无法打开此文件夹');
  }
};

/* ===== 云文档在线编辑：自动保存接线（方案 §3.2 T1 的客户端部分） ===== */

/** fileId → 云端落点。cloud_docs_save 按 path 定位文档，baseVersion 才是乐观锁，两者都必需。 */
const cloudSaveTargets = new Map<number, { path: string; title: string }>();

/** 同一文件同内容的并发哈希计算会被合并，debounce 抖动不会重复算。 */
const cloudContentHasher = createContentHasher();

/**
 * 409 冲突对话框状态。云端保存被乐观锁拒绝时打开，用户在
 * 「保留我的 / 用云端版本 / 另存副本」里选一个，选择结果交给 cloudSaveController.resolveConflict 执行。
 */
const cloudConflict = ref<{
  visible: boolean;
  fileId: number | null;
  tabId: string | null;
  fileName: string;
  message: string;
  remoteVersion: number | null;
  busy: boolean;
}>({ visible: false, fileId: null, tabId: null, fileName: '', message: '', remoteVersion: null, busy: false });

const conflictCopy = computed(() => getCloudDocConflictI18n(settingsStore.uiLanguage));
const editOpenCopy = computed(() => getCloudDocEditOpenI18n(settingsStore.uiLanguage));

/** 冲突时顺手把云端最新版本号读出来，供对话框展示（失败不影响三选一，值留空）。 */
const refreshConflictRemoteVersion = async (fileId: number): Promise<void> => {
  const outcome = await getCloudDoc(fileId);
  if (!outcome.ok) {
    return;
  }
  if (cloudConflict.value.fileId !== fileId) {
    return;
  }
  cloudConflict.value.remoteVersion = outcome.data.version;
};

/** 409：登记冲突 + 弹出三选一对话框（绝不自动覆盖云端）。 */
const handleCloudSaveEvent = (event: SaveControllerEvent): void => {
  if (event.type === 'saved') {
    // 回写标签元数据：下次重新打开这份文档时，基线来自这里而不是内存里的控制器
    const savedTab = tabsStore.tabs.find((item) => item.cloudFileId === event.fileId);
    if (savedTab) {
      tabsStore.updateTab(savedTab.id, {
        cloudFileId: event.fileId,
        cloudVersion: event.version,
        cloudContentHash: event.contentHash,
        lastSyncedAt: event.at,
      });
    }
    return;
  }

  if (event.type !== 'conflict') {
    // failed 只是这一次没落地（网络/配额），本地文件已保存；每 2.5s 弹一次会变成骚扰
    return;
  }

  const conflictTab = tabsStore.tabs.find((item) => item.cloudFileId === event.fileId);
  fileConflictsStore.flag({
    path: conflictTab?.filePath ?? `cloud-doc:${event.fileId}`,
    kind: 'modified',
    source: 'cloud',
    detectedAt: Date.now(),
  });

  cloudConflict.value = {
    visible: true,
    fileId: event.fileId,
    tabId: conflictTab?.id ?? null,
    fileName: conflictTab?.fileName ?? '',
    message: event.message ?? '',
    remoteVersion: null,
    busy: false,
  };
  void refreshConflictRemoteVersion(event.fileId);
};

const cloudSaveController = createCloudDocSaveController({
  // 真正的 IPC：path 定位文档，baseVersion 由控制器按会话基线透传（绝不传 null 走"新建"）
  save: async (snapshot) => {
    const target = cloudSaveTargets.get(snapshot.fileId);
    // 派发这一刻再确认标签还开着：标签关掉/工作区切走后，即便队列里还排着一次，
    // 这里也直接返回失败 —— 文档已经没了，不允许再发 IPC 把旧内容写回云端。
    const stillOpen = tabsStore.tabs.some((tab) => tab.cloudFileId === snapshot.fileId);
    if (!target || !stillOpen) {
      return { ok: false, kind: 'unsupported', message: '文档已关闭，已丢弃这次云端保存。' };
    }
    return saveCloudDoc({
      path: target.path,
      title: target.title,
      content: snapshot.content,
      contentHash: snapshot.contentHash,
      baseVersion: snapshot.baseVersion,
    });
  },
  notify: handleCloudSaveEvent,
});

/** 一次自动保存：算哈希（async）→ 交给控制器（空写抑制、单飞合并、409 停止都在里面）。 */
const runCloudAutoSave = async (): Promise<void> => {
  const tab = activeTab.value;
  const fileId = tab?.cloudFileId ?? null;
  if (!tab || fileId === null) {
    return;
  }

  // 409 未处理前不再自动保存：控制器本来就会拦，这里省掉一次哈希计算
  const session = cloudSaveController.session();
  if (session && session.fileId === fileId && session.status === 'conflict') {
    return;
  }

  // 编辑器可能还有一次去抖没回写到标签，保存前先对齐
  syncActiveEditorContent();
  const current = activeTab.value;
  if (!current || current.cloudFileId !== fileId) {
    return; // 期间换了文档：这次触发作废（控制器里还有一层 Lane 防护）
  }

  const content = current.content ?? '';
  const hash = await cloudContentHasher.hashFor(fileId, content);
  if (activeTab.value?.cloudFileId !== fileId) {
    return; // 哈希算完时文档已经切走
  }
  await cloudSaveController.schedule(content, hash);
};

const createCloudAutoSave = () => createAutoSaveScheduler({ onTrigger: () => runCloudAutoSave() });

/** 当前文档的自动保存窗口；换文档时整个替换（destroy 是终态，不能复用）。 */
let cloudAutoSave = createCloudAutoSave();

/**
 * 打开/切换云文档时建立编辑基线。
 * 第一步永远是销毁旧的自动保存窗口 —— 这是"文档关掉/切走后不得再补发一次保存"的第一道闸：
 * 窗口没了，触发源就没了；即便真的在飞，控制器也会因 Lane 引用失效而丢弃结果。
 */
const syncCloudSaveSession = (): void => {
  cloudAutoSave.destroy();
  cloudAutoSave = createCloudAutoSave();

  const tab = activeTab.value;
  const fileId = tab?.cloudFileId ?? null;
  if (!tab || fileId === null) {
    return;
  }

  // 云端落点优先取 docMap（cloudPath → fileId 的权威映射）：落位到 scratch 后 path 仍与原文一致，
  // 用本地 scratch 路径反推会"搬家"。
  let path: string | null = null;
  let version: number | null = tab.cloudVersion ?? null;
  let contentHash: string | null = tab.cloudContentHash ?? null;
  for (const [docPath, meta] of Object.entries(cloudSyncStore.docMap)) {
    if (meta.fileId !== fileId) {
      continue;
    }
    path = docPath;
    version = version ?? meta.version;
    contentHash = contentHash ?? meta.contentHash;
    break;
  }
  if (!path && tab.filePath) {
    path = resolveCloudDocPathForFile(
      tab.filePath,
      workspaceStore.currentWorkspaceName,
      workspaceStore.currentWorkspacePath,
    );
  }
  if (!path) {
    return;
  }

  cloudSaveTargets.set(fileId, { path, title: tab.fileName });
  cloudSaveController.open(fileId, {
    version: version ?? 0,
    contentHash: normalizeContentHash(contentHash),
  });
};

// 打开或切换云文档标签：建立基线（换文档时旧 Lane 立即失权）。
watch(
  () => [activeTab.value?.id ?? '', activeTab.value?.cloudFileId ?? null] as const,
  () => {
    syncCloudSaveSession();
  },
  { immediate: true },
);

// 标签关闭后丢掉已无主的落点映射：既避免 map 随会话增长，也避免重复用旧 path 保存。
watch(
  () => tabsStore.tabs.map((tab) => tab.cloudFileId ?? 0).join('|'),
  () => {
    const alive = new Set(
      tabsStore.tabs
        .map((tab) => tab.cloudFileId)
        .filter((fileId): fileId is number => typeof fileId === 'number'),
    );
    for (const fileId of [...cloudSaveTargets.keys()]) {
      if (!alive.has(fileId)) {
        cloudSaveTargets.delete(fileId);
      }
    }
  },
);

/* ===== 409 冲突三选一：把编辑流水线的 resolveConflict 接到 UI ===== */

const closeCloudConflict = (): void => {
  if (cloudConflict.value.busy) {
    return;
  }
  cloudConflict.value = {
    visible: false,
    fileId: null,
    tabId: null,
    fileName: '',
    message: '',
    remoteVersion: null,
    busy: false,
  };
};

/** 拉一次云端详情作为冲突决策依据（版本/哈希/正文）；失败直接提示并放弃本次选择。 */
const fetchRemoteSnapshot = async (
  fileId: number,
): Promise<{ version: number; contentHash: string; content: string } | null> => {
  const outcome = await getCloudDoc(fileId);
  if (!outcome.ok) {
    notificationStore.error(conflictCopy.value.title, outcome.message);
    return null;
  }
  return {
    version: outcome.data.version,
    contentHash: outcome.data.contentHash ?? '',
    content: outcome.data.content ?? '',
  };
};

/** 用云端正文替换标签内容（编辑器同步刷新 + 落盘 + 元数据推进）。 */
const applyRemoteContentToTab = async (
  tabId: string | null,
  content: string,
  remote: { version: number; contentHash: string },
): Promise<void> => {
  if (!tabId) {
    return;
  }
  if (!tabsStore.tabs.some((item) => item.id === tabId)) {
    return;
  }
  // 编辑器正显示这份文档时同步刷新，避免「标签内容变了但编辑器还是旧文本」
  if (activeTab.value?.id === tabId) {
    editorCoreRef.value?.replaceContent(content);
  }
  tabService.updateTabContent(tabId, content, { markDirty: false });
  tabsStore.updateTab(tabId, {
    isDirty: false,
    cloudVersion: remote.version,
    cloudContentHash: remote.contentHash,
    lastSyncedAt: Date.now(),
  });
  await tabService.saveTab(tabId, { silent: true });
};

/** 另存副本时把冲突标记插在扩展名之前：`a.md` → `a（冲突副本）.md`。 */
const buildConflictCopyPath = (cloudPath: string, tag: string): string => {
  const slash = cloudPath.lastIndexOf('/');
  const dir = slash >= 0 ? cloudPath.slice(0, slash + 1) : '';
  const name = slash >= 0 ? cloudPath.slice(slash + 1) : cloudPath;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${dir}${name.slice(0, dot)}${tag}${name.slice(dot)}` : `${dir}${name}${tag}`;
};

/** 保留我的：以云端最新版本为基线重试一次，用本地内容覆盖云端。 */
const resolveConflictKeepMine = async (): Promise<void> => {
  const state = cloudConflict.value;
  if (state.fileId === null || state.busy) {
    return;
  }
  const remote = await fetchRemoteSnapshot(state.fileId);
  if (!remote) {
    return;
  }
  state.busy = true;
  try {
    const outcome = await cloudSaveController.resolveConflict('keepMine', remote);
    if (outcome.action === 'retried') {
      if (outcome.result === 'saved' || outcome.result === 'skipped') {
        notificationStore.success(conflictCopy.value.title, editOpenCopy.value.conflictKeepMineDone);
        closeCloudConflict();
        return;
      }
      notificationStore.error(conflictCopy.value.title, editOpenCopy.value.conflictFailed(outcome.result));
      return;
    }
    if (outcome.action === 'retryExhausted') {
      notificationStore.warning(conflictCopy.value.title, editOpenCopy.value.conflictRetryExhausted);
      return;
    }
    notificationStore.warning(conflictCopy.value.title, editOpenCopy.value.conflictFailed(outcome.action));
  } finally {
    state.busy = false;
  }
};

/** 用云端版本：放弃本地修改，编辑器内容替换为云端最新正文。 */
const resolveConflictUseRemote = async (): Promise<void> => {
  const state = cloudConflict.value;
  if (state.fileId === null || state.busy) {
    return;
  }
  const remote = await fetchRemoteSnapshot(state.fileId);
  if (!remote) {
    return;
  }
  state.busy = true;
  try {
    const outcome = await cloudSaveController.resolveConflict('useRemote', remote);
    if (outcome.action !== 'replaceLocalWithRemote') {
      notificationStore.warning(conflictCopy.value.title, editOpenCopy.value.conflictFailed(outcome.action));
      return;
    }
    const content = outcome.content ?? remote.content;
    await applyRemoteContentToTab(state.tabId, content, remote);
    notificationStore.success(conflictCopy.value.title, editOpenCopy.value.conflictUseRemoteDone);
    closeCloudConflict();
  } finally {
    state.busy = false;
  }
};

/** 另存副本：本地内容作为新文档上传，原文档回到云端内容，两端都不丢。 */
const resolveConflictSaveCopy = async (): Promise<void> => {
  const state = cloudConflict.value;
  if (state.fileId === null || state.busy) {
    return;
  }
  const remote = await fetchRemoteSnapshot(state.fileId);
  if (!remote) {
    return;
  }
  const target = cloudSaveTargets.get(state.fileId);
  if (!target) {
    notificationStore.error(conflictCopy.value.title, editOpenCopy.value.conflictFailed('找不到该文档的云端落点'));
    return;
  }
  const outcome = await cloudSaveController.resolveConflict('saveCopy', remote);
  if (outcome.action !== 'saveAsCopy') {
    notificationStore.warning(conflictCopy.value.title, editOpenCopy.value.conflictFailed(outcome.action));
    return;
  }
  state.busy = true;
  try {
    const copyPath = buildConflictCopyPath(target.path, outcome.copy.copyTag);
    const saved = await saveCloudDoc({
      path: copyPath,
      title: copyPath.split('/').pop() ?? copyPath,
      content: outcome.copy.content,
      contentHash: outcome.copy.contentHash,
      // 副本是新建：baseVersion 必须是 null，否则会覆盖原文档
      baseVersion: null,
    });
    if (!saved.ok) {
      notificationStore.error(conflictCopy.value.title, editOpenCopy.value.conflictFailed(saved.message));
      return;
    }
    cloudSyncStore.rememberDoc(copyPath, {
      fileId: saved.data.fileId,
      version: saved.data.version,
      contentHash: saved.data.contentHash,
      updatedAt: saved.data.updatedAt ?? null,
    });
    // 原文档回到云端内容（副本已保住本地修改），否则下一次自动保存会把云端又覆盖回去
    await applyRemoteContentToTab(state.tabId, remote.content, remote);
    notificationStore.success(conflictCopy.value.title, editOpenCopy.value.conflictSavedCopy(copyPath));
    closeCloudConflict();
  } finally {
    state.busy = false;
  }
};

/* ===== 跨工作区云文档：在编辑器中打开（替代原先的只读预览） ===== */

/**
 * 「在编辑器中打开」：把云端文档落位到该云工作区对应的本地临时工作区，打开标签并打上云端绑定，
 * 之后的保存由既有自动保存流水线（2.5s 空闲 / Ctrl+S / 失焦）同步回云端。
 */
const handleCloudDocEditOpen = async (node: CloudDocTreeNode): Promise<void> => {
  const file = node.file;
  if (!file) {
    return;
  }
  const fileId = file.fileId;

  // 已经打开过：直接切到那个标签，不再重复落位
  const existing = tabsStore.tabs.find((tab) => tab.cloudFileId === fileId);
  if (existing?.filePath) {
    await openFileInEditor(existing.filePath);
    cloudBrowserVisible.value = false;
    notificationStore.info(editOpenCopy.value.alreadyOpen(existing.fileName), editOpenCopy.value.openedHint);
    return;
  }

  const result = await materializeCloudDocForEdit({ fileId, cloudPath: node.path, title: node.name });
  if (!result.ok) {
    notificationStore.error(node.name, editOpenCopy.value.openFailed(result.message));
    return;
  }

  const target = result.target;
  // 先登记云端落点与基线：标签一旦激活，syncCloudSaveSession 会立刻按 docMap 建编辑会话
  cloudSyncStore.rememberDoc(target.cloudPath, {
    fileId: target.fileId,
    version: target.version,
    contentHash: target.contentHash,
    updatedAt: file.updatedAt ?? null,
  });
  cloudSaveTargets.set(target.fileId, { path: target.cloudPath, title: target.title });

  await openFileInEditor(target.absolutePath);

  const opened = tabsStore.tabs.find((tab) => tab.filePath === target.absolutePath) ?? tabsStore.activeTab;
  if (opened) {
    tabsStore.updateTab(opened.id, {
      cloudFileId: target.fileId,
      cloudVersion: target.version,
      cloudContentHash: target.contentHash,
    });
  }

  cloudBrowserVisible.value = false;
  notificationStore.success(editOpenCopy.value.opened(target.title), editOpenCopy.value.openedHint);
};

const handleSave = async () => {
  syncActiveEditorContent();
  markLocalWritePending(activeTab.value?.filePath);
  await tabService.saveActiveTab();
  editorCoreRef.value?.saveLspDocument();
  // Ctrl+S：本地保存保持原样，云端保存是追加动作（不阻塞、不改变本地保存时延）
  if (activeTab.value?.cloudFileId != null) {
    void cloudAutoSave.triggerNow('manual');
  }
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
  editorCoreRef.value?.undo();
};

const handleRedo = () => {
  editorCoreRef.value?.redo();
};

const handleMarkdownImagePaste = async (payload: { fileName: string; bytes: Uint8Array }) => {
  const tab = activeTab.value;
  const documentPath = tab?.filePath?.trim();
  if (!tab || tab.language !== 'markdown' || tab.isLargeFile || !documentPath) {
    notificationStore.warning('无法插入剪贴板图片', '请先保存 Markdown 文档。');
    return;
  }

  try {
    const location = await markdownWorkspaceRuntime.resolveForFile(
      documentPath,
      workspaceStore.currentWorkspacePath,
    );
    syncActiveEditorContent();
    const result = await importMarkdownAssetBytes(
      location.workspaceId,
      location.relativePath,
      payload.fileName,
      payload.bytes,
    );
    editorCoreRef.value?.insertText(result.markdownSnippet);
    notificationStore.success('图片已插入', result.relativePath);
  } catch (error: any) {
    notificationStore.error('插入剪贴板图片失败', error?.message || '无法保存图片资源');
  }
};

const handleToggleFileTree = () => {
  showFileTree.value = !showFileTree.value;
};

const canRevealCurrentFile = computed(() => {
  const filePath = activeTab.value?.filePath;
  const workspacePath = workspaceStore.currentWorkspacePath;
  if (!filePath || !workspacePath) return false;
  const normalizedFilePath = comparableFsPath(filePath);
  const normalizedWorkspacePath = comparableFsPath(workspacePath);
  return normalizedFilePath === normalizedWorkspacePath
    || (normalizedWorkspacePath === '/' ? normalizedFilePath.startsWith('/') : normalizedFilePath.startsWith(`${normalizedWorkspacePath}/`));
});

const locatingCurrentFile = ref(false);
let locateRequestId = 0;
const handleRevealCurrentFile = async () => {
  const filePath = activeTab.value?.filePath;
  const workspacePath = workspaceStore.currentWorkspacePath;
  if (!filePath || !workspacePath || !canRevealCurrentFile.value) return;
  const requestId = ++locateRequestId;
  locatingCurrentFile.value = true;
  const isCurrentRequest = () => requestId === locateRequestId
    && activeTab.value?.filePath === filePath
    && workspaceStore.currentWorkspacePath === workspacePath;

  try {
    const normalizedFilePath = normalizeFsPath(filePath);
    const comparableWorkspacePath = comparableFsPath(workspacePath);
    const parentPaths: string[] = [];
    let parentPath = getParentFsPath(normalizedFilePath);
    while (
      parentPath
      && comparableFsPath(parentPath) !== comparableWorkspacePath
      && comparableFsPath(parentPath).startsWith(`${comparableWorkspacePath}/`)
    ) {
      parentPaths.unshift(parentPath);
      parentPath = getParentFsPath(parentPath);
    }

    for (const folderPath of parentPaths) {
      if (!isCurrentRequest()) return;
      const folder = findFileTreeEntryByNormalizedPath(fileSystemStore.fileTree, folderPath);
      if (folder?.type === 'folder' && !folder.isExpanded) await fileSystemStore.toggleFolder(folder.path);
    }
    if (!isCurrentRequest()) return;
    const targetEntry = findFileTreeEntryByNormalizedPath(fileSystemStore.fileTree, normalizedFilePath);
    if (!targetEntry) {
      notificationStore.warning('无法定位当前文件', '文件树未能加载当前文件所在目录，请刷新资源区后重试。');
      return;
    }
    fileSystemStore.selectEntry?.(targetEntry.path);
    showFileTree.value = true;
    await nextTick();
    if (!isCurrentRequest()) return;
    const revealed = await fileTreeRef.value?.revealPath(targetEntry.path);
    if (revealed === false) notificationStore.warning('无法定位当前文件', '文件树视图已发生变化，请重试。');
  } finally {
    if (requestId === locateRequestId) locatingCurrentFile.value = false;
  }
};

const handleBreadcrumbNavigate = async (segment: EditorBreadcrumbSegment) => {
  const workspacePath = workspaceStore.currentWorkspacePath;
  if (!segment.navigable || !segment.path || !workspacePath) return;

  showFileTree.value = true;
  if (segment.kind === 'workspace') {
    fileSystemStore.selectEntry(null);
    return;
  }

  const targetPath = normalizeFsPath(segment.path);
  const normalizedWorkspacePath = comparableFsPath(workspacePath);
  const expandTarget = segment.kind === 'folder';
  const firstFolderPath = expandTarget ? targetPath : getParentFsPath(targetPath);
  const parentPaths: string[] = [];
  let parentPath = firstFolderPath;

  while (parentPath) {
    const comparableParentPath = comparableFsPath(parentPath);
    if (comparableParentPath === normalizedWorkspacePath) break;
    const isInsideWorkspace = normalizedWorkspacePath === '/'
      ? comparableParentPath.startsWith('/')
      : comparableParentPath.startsWith(`${normalizedWorkspacePath}/`);
    if (!isInsideWorkspace) break;
    parentPaths.unshift(parentPath);
    parentPath = getParentFsPath(parentPath);
  }

  for (const folderPath of parentPaths) {
    const folder = findFileTreeEntryByNormalizedPath(fileSystemStore.fileTree, folderPath);
    if (folder?.type === 'folder' && !folder.isExpanded) {
      await fileSystemStore.toggleFolder(folder.path);
    }
  }

  const targetEntry = findFileTreeEntryByNormalizedPath(fileSystemStore.fileTree, targetPath);
  if (!targetEntry) {
    notificationStore.warning('无法定位路径', '文件树未能加载该路径，请刷新资源区后重试。');
    return;
  }

  fileSystemStore.selectEntry(targetEntry.path);
  await nextTick();
  const revealed = await fileTreeRef.value?.revealPath(targetEntry.path);
  if (revealed === false) {
    notificationStore.warning('无法定位路径', '文件树视图已发生变化，请重试。');
  }
};

const handleCopyCurrentFilePath = async () => {
  const filePath = activeTab.value?.filePath?.trim();
  if (!filePath || !canRevealCurrentFile.value) return;

  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      throw new Error('当前环境不支持剪贴板写入');
    }
    await navigator.clipboard.writeText(filePath);
    notificationStore.success('路径已复制', filePath);
  } catch (error: any) {
    notificationStore.error('复制路径失败', error?.message || '无法写入系统剪贴板');
  }
};

const handleRevealCurrentFileInManager = async () => {
  const filePath = activeTab.value?.filePath?.trim();
  if (!filePath || !canRevealCurrentFile.value) return;

  try {
    await appCommands.revealInFileManager(filePath);
  } catch (error: any) {
    notificationStore.error('打开文件位置失败', error?.message || '无法在文件管理器中显示文件');
  }
};

const handleToggleContextRail = () => {
  showContextRail.value = !showContextRail.value;
};

const handleContextNavigate = (line: number) => {
  // 点击立即高亮：锁定窗口内忽略 revealLine / scrollIntoView 触发的事件回写，
  // 否则「跳转后视口首行」可能落到上一个标题，看起来像没点中。
  writeActiveOutlineLine(line);
  navigationLockedActiveLineUntil = Date.now() + NAVIGATION_LOCK_WINDOW_MS;
  editorCoreRef.value?.revealLine(line);
  markdownPreviewRef.value?.scrollToSourceLine(line);
};

const refreshWorkspaceContext = async (workspacePath: string | null) => {
  const requestId = ++workspaceContextRequestId;
  workspaceRuntimeId.value = null;
  gitStatus.value = null;
  lspDiagnosticCounts.clear();
  diagnosticsStore.clearAll();
  problemsPanelVisible.value = false;
  await applicationLspService.setWorkspace(null);
  if (!workspacePath || !isTauriApp()) {
    return;
  }

  try {
    const runtime = await workspaceCommands.resolveWorkspace(workspacePath);
    if (requestId !== workspaceContextRequestId) {
      return;
    }
    workspaceRuntimeId.value = runtime.workspaceId;
    await applicationLspService.setWorkspace({
      workspaceId: runtime.workspaceId,
      rootPath: workspacePath,
    });
    if (requestId !== workspaceContextRequestId) {
      await applicationLspService.setWorkspace(null);
      return;
    }
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
const handleOpenTabInNewWindow = async (tabId?: string) => {
  const tab = tabId
    ? tabsStore.tabs.find((candidate) => candidate.id === tabId) ?? null
    : requireActiveTab();
  if (!tab) {
    return;
  }

  const result = await openTabsInNewWindow([tab], tab.id, workspaceStore.currentWorkspacePath);
  if (!result.ok) {
    notificationStore.error('打开新窗口失败', result.error.message);
    return;
  }
  tabsStore.closeTab(tab.id);
  notificationStore.info('已在新窗口打开', tab.fileName);
};

const handleImportTabFromAnotherWindow = (transferTab: WindowTransferTab, targetTabId: string | null) => {
  const tabId = tabsStore.addTab({
    filePath: transferTab.filePath,
    fileName: transferTab.fileName,
    content: transferTab.content,
    isDirty: transferTab.isDirty,
    isUntitled: transferTab.isUntitled,
    language: transferTab.language ?? 'plaintext',
  });
  const orderedIds = tabsStore.tabs.map((tab) => tab.id);
  const targetIndex = targetTabId ? orderedIds.indexOf(targetTabId) : -1;
  if (targetIndex >= 0) {
    orderedIds.splice(orderedIds.indexOf(tabId), 1);
    orderedIds.splice(targetIndex + 1, 0, tabId);
    tabsStore.reorderTabs(orderedIds);
  }
  tabsStore.activateTab(tabId);
  notificationStore.info('标签已合并到当前窗口', transferTab.fileName);
};

const handleTransferredTabDropped = (tabId: string) => {
  tabsStore.closeTab(tabId);
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

  const filePath = joinFsPath(root, relativePath);
  pushCurrentNavigation();
  await openFileInEditor(filePath);
  await nextTick();
  editorCoreRef.value?.revealLine(line);
  pushNavigationHistory({ filePath, line, column: 1 });
};

/** 打开 LSP 诊断对应文件，并将编辑器定位到具体行列。 */
const handleDiagnosticNavigate = async (diagnostic: DiagnosticRecord) => {
  const filePath = uriToPath(diagnostic.uri);
  if (!filePath) return;

  if (activeTab.value?.filePath && canonicalFsPath(activeTab.value.filePath) === canonicalFsPath(filePath)) {
    pushCurrentNavigation();
    editorCoreRef.value?.revealLine(diagnostic.startLineNumber, diagnostic.startColumn);
    pushNavigationHistory({
      filePath,
      line: diagnostic.startLineNumber,
      column: diagnostic.startColumn,
    });
    return;
  }

  pushCurrentNavigation();
  await openFileInEditor(filePath);
  if (await waitForEditorTarget(filePath)) {
    editorCoreRef.value?.revealLine(diagnostic.startLineNumber, diagnostic.startColumn);
    pushNavigationHistory({
      filePath,
      line: diagnostic.startLineNumber,
      column: diagnostic.startColumn,
    });
  }
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
  if (isFullDocumentPreviewTab.value) {
    return;
  }
  const tab = activeTab.value;
  if (tab && isPreviewableTab.value && typeof tabsStore.updateTab === 'function') {
    tabsStore.updateTab(tab.id, { markdownPreviewMode: mode });
    return;
  }
  if (!tab) {
    void settingsStore.updateSettings({ markdownPreviewMode: mode });
  }
};

const setMarkdownPreviewFontSize = (fontSize: number) => {
  const tab = activeTab.value;
  if (tab?.language === 'markdown' && typeof tabsStore.updateTab === 'function') {
    tabsStore.updateTab(tab.id, { markdownPreviewFontSize: fontSize });
  }
};

const handleCycleMarkdownPreview = () => {
  if (!isPreviewableTab.value || isFullDocumentPreviewTab.value) {
    return;
  }

  const order: Array<'edit' | 'split' | 'preview'> = ['edit', 'split', 'preview'];
  const currentIndex = order.indexOf(markdownPreviewMode.value);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextMode = order[(safeIndex + 1) % order.length] ?? 'split';
  setMarkdownPreviewMode(nextMode);
};

const handleMarkdownAction = (action: MarkdownAction) => {
  if (isMarkdownTab.value) {
    editorCoreRef.value?.applyMarkdownAction(action);
  }
};

const handleMarkdownHeading = (level: number) => {
  if (isMarkdownTab.value) {
    editorCoreRef.value?.applyMarkdownHeading(level);
  }
};

const handleMarkdownCode = (language: string) => {
  if (isMarkdownTab.value) {
    editorCoreRef.value?.applyMarkdownCode(language);
  }
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

/** 云同步入口统一落在设置页的 cloudSync 分类，登录表单由设置页承载。 */
const openCloudSyncSettings = () => {
  activeSettingsCategory.value = 'cloudSync';
  settingsContainer.value = 'workspace';
};

const handleCloudLoginCommand = () => {
  openCloudSyncSettings();
};

const handleCloudLogoutCommand = async () => {
  await cloudSyncStore.logout();
  notificationStore.info(cloudSyncCopy.value.settingsCloudSync, cloudSyncCopy.value.cloudSyncSignedOut);
};

/** 从设置面板打开浏览面板时记下宿主，返回时再恢复（设置面板是整页层，叠着会互相遮挡）。 */
const pendingSettingsReturn = ref<{ container: SettingsContainer; category: SettingsCategory } | null>(null);

/** 云端文档浏览面板：未登录时先把用户带到设置页登录。 */
const openCloudDocBrowser = () => {
  if (!cloudSyncStore.signedIn) {
    notificationStore.warning(cloudSyncCopy.value.settingsCloudSync, cloudSyncCopy.value.cloudSyncLoginRequired);
    openCloudSyncSettings();
    return;
  }
  // 先关设置面板：两者都是整屏层，同时开着按 z-index 谁压谁都不稳
  if (settingsContainer.value !== null) {
    pendingSettingsReturn.value = {
      container: settingsContainer.value,
      category: activeSettingsCategory.value,
    };
    settingsContainer.value = null;
  }
  cloudBrowserVisible.value = true;
};

const closeCloudDocBrowser = () => {
  cloudBrowserVisible.value = false;
  const restore = pendingSettingsReturn.value;
  pendingSettingsReturn.value = null;
  if (restore) {
    activeSettingsCategory.value = restore.category;
    settingsContainer.value = restore.container;
  }
};

const handleCloudDocBrowserOpenFile = async (path: string) => {
  await openFileInEditor(path);
  cloudBrowserVisible.value = false;
};

const handleCloudSyncNowCommand = async () => {
  const copy = cloudSyncCopy.value;
  if (!cloudSyncStore.signedIn) {
    notificationStore.warning(copy.settingsCloudSync, copy.cloudSyncLoginRequired);
    openCloudSyncSettings();
    return;
  }

  const result = await cloudSyncStore.syncCurrentDocument();
  if (result.status === 'synced') {
    notificationStore.success(copy.settingsCloudSync, copy.cloudSyncResultSynced(result.version));
    return;
  }
  if (result.status === 'conflict') {
    notificationStore.warning(copy.settingsCloudSync, copy.cloudSyncResultConflict);
    return;
  }
  if (result.status === 'skipped') {
    notificationStore.info(copy.settingsCloudSync, copy.cloudSyncResultSkipped(result.message || ''));
    return;
  }
  notificationStore.error(copy.settingsCloudSync, copy.cloudSyncResultFailed(result.message || ''));
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

/** 左侧边栏面板：工作区文件树 / 云端文档，互斥显示并记住上次选择。 */
const sidebarPanel = computed(() => settingsStore.sidebarPanel);
const selectSidebarPanel = (panel: 'workspace' | 'cloud') => {
  settingsStore.setSidebarPanel(panel);
};

/**
 * 云端文档被写到本地磁盘后刷新工作区文件树，
 * 让用户不用手动点刷新才看到新落盘的文件。
 */
const handleCloudFileSaved = async () => {
  await workspaceService.refreshWorkspace();
};

/** 云端文档树需要重新拉取的信号（同步成功后自增）。 */
const cloudTreeRefreshToken = ref(0);

/** 右键「同步至云端」：未登录先引导登录，登录了才弹分类弹窗。 */
const cloudSyncDialog = ref<{
  visible: boolean;
  filePath: string;
  fileName: string;
  /** 云端身份：临时区落位的文档靠它回显分类并走「更新」而不是「新建」 */
  cloudFileId: number | null;
  cloudPath: string | null;
  category: string | null;
  categoryId: string | number | null;
}>({
  visible: false,
  filePath: '',
  fileName: '',
  cloudFileId: null,
  cloudPath: null,
  category: null,
  categoryId: null,
});

const handleFileTreeSyncToCloud = (entry: FileTreeNode) => {
  if (!cloudSyncStore.signedIn) {
    notificationStore.warning(
      cloudSyncCopy.value.settingsCloudSync,
      cloudSyncCopy.value.cloudSyncLoginRequired,
    );
    openCloudSyncSettings();
    return;
  }
  // pdf/doc/docx/xls/xlsx/ppt/pptx 走二进制上传（无分类弹窗，V1 不支持覆盖更新）
  if (isBinaryDocPath(entry.path)) {
    void syncBinaryDocument(entry);
    return;
  }
  cloudSyncDialog.value = {
    visible: true,
    filePath: entry.path,
    fileName: entry.name,
    cloudFileId: null,
    cloudPath: null,
    category: null,
    categoryId: null,
  };
};

const handleCloudDocSynced = (result: CloudSyncResult) => {
  cloudSyncDialog.value = {
    visible: false,
    filePath: '',
    fileName: '',
    cloudFileId: null,
    cloudPath: null,
    category: null,
    categoryId: null,
  };
  cloudTreeRefreshToken.value += 1;
  // 居中 toast：3 秒自动消失（同步成功不再占用弹窗内状态行）
  centerToast.show(cloudSyncCopy.value.cloudSyncResultSynced(result.version), 'success', 3000);
};

/** 分享统计弹窗目标（从分享弹窗的「查看统计」进入）。 */
const shareStatsTarget = ref<{ visible: boolean; fileId: number | null; fileName: string }>({
  visible: false,
  fileId: null,
  fileName: '',
});

const handleOpenShareStats = (payload: { fileId: number; fileName: string }) => {
  shareStatsTarget.value = { visible: true, fileId: payload.fileId, fileName: payload.fileName };
};

/** 一键分享弹窗（先自动同步，再生成/复用分享链接）。 */
const shareDialog = ref<{ visible: boolean; filePath: string; fileName: string }>({
  visible: false,
  filePath: '',
  fileName: '',
});

/** 已分享过的本地路径（右键菜单据此显示「分享（已分享）」）。 */
const sharedFilePaths = ref<string[]>([]);

/** 已完成二进制上传的本地路径（右键菜单据此显示「已同步」）。 */
const syncedBinaryPaths = ref<string[]>([]);

const markBinarySynced = (filePath: string, synced: boolean) => {
  const next = new Set(syncedBinaryPaths.value);
  if (synced) {
    next.add(filePath);
  } else {
    next.delete(filePath);
  }
  syncedBinaryPaths.value = [...next];
};

/** 二进制文档（pdf/doc/xls/ppt）走 multipart 上传；文本走原有同步弹窗。 */
const syncBinaryDocument = async (entry: FileTreeNode) => {
  const eligibility = validateBinaryDocLocal(entry.path, entry.size ?? null);
  if (!eligibility.eligible) {
    notificationStore.warning(
      cloudSyncCopy.value.settingsCloudSync,
      eligibility.reason ?? '该文件不支持上传到云端',
    );
    return;
  }
  const cloudPath = resolveCloudDocPathForFile(
    entry.path,
    workspaceStore.currentWorkspaceName,
    workspaceStore.currentWorkspacePath,
  );
  const outcome = await uploadBinaryDocument(
    { cloudPath, localPath: entry.path, title: entry.name },
    { fileSize: entry.size ?? null },
  );
  if (!outcome.ok) {
    notificationStore.error(cloudSyncCopy.value.settingsCloudSync, outcome.message);
    return;
  }
  markBinarySynced(entry.path, true);
  cloudTreeRefreshToken.value += 1;
  notificationStore.success(
    cloudSyncCopy.value.settingsCloudSync,
    cloudSyncCopy.value.cloudSyncResultSynced(outcome.data.version),
  );
};

/** 文件夹整目录上传弹窗（R3）：确认 → 进度 → 汇总都在弹窗里完成。 */
const folderUploadDialog = ref<{ visible: boolean; folderName: string; folderPath: string }>({
  visible: false,
  folderName: '',
  folderPath: '',
});

/**
 * 整目录上传的「后台进行」状态：
 * 队列活在常驻挂载的 CloudFolderUploadDialog 里，弹窗隐藏不影响上传，
 * 这里只保留一份进度镜像，供状态栏徽标回显与完成后提示。
 */
const folderUploadRunning = ref(false);
const folderUploadProgress = ref<{ done: number; total: number; name: string }>({
  done: 0,
  total: 0,
  name: '',
});

/** 弹窗开始跑队列：立刻点亮状态栏徽标（0/N） */
const handleFolderUploadStarted = (payload: { total: number }) => {
  folderUploadRunning.value = true;
  folderUploadProgress.value = { done: 0, total: payload.total, name: '' };
};

/** 每完成一个文件：更新状态栏徽标进度 */
const handleFolderUploadProgress = (payload: { done: number; total: number; name: string }) => {
  folderUploadRunning.value = true;
  folderUploadProgress.value = { ...payload };
};

/** 点状态栏徽标 / 上传中再次右键文件夹：重新打开弹窗（队列与进度都还在，不会重开一次上传） */
const reopenFolderUploadDialog = () => {
  folderUploadDialog.value = { ...folderUploadDialog.value, visible: true };
};

/** 文件树文件夹右键「上传该文件夹到云端」：未登录先引导登录，没有工作区直接提示。 */
const handleFileTreeUploadFolder = (entry: FileTreeNode) => {
  if (!cloudSyncStore.signedIn) {
    notificationStore.warning(
      fileTreeCopy.value.uploadFolderTitle,
      fileTreeCopy.value.uploadFolderLoginRequired,
    );
    openCloudSyncSettings();
    return;
  }
  if (!workspaceStore.currentWorkspacePath) {
    notificationStore.warning(fileTreeCopy.value.uploadFolderTitle, '请先打开一个工作区文件夹');
    return;
  }
  if (folderUploadRunning.value) {
    // 已有队列在跑：只把弹窗叫回来，绝不新建队列（否则会并发跑两份上传）
    notificationStore.info(
      fileTreeCopy.value.uploadFolderTitle,
      fileTreeCopy.value.uploadFolderBusy(folderUploadProgress.value.done, folderUploadProgress.value.total),
    );
    reopenFolderUploadDialog();
    return;
  }
  folderUploadDialog.value = { visible: true, folderName: entry.name, folderPath: entry.path };
};

/**
 * 整目录上传跑完（含提前中止）：
 * ① 清掉后台状态；② 自增刷新令牌让云端文档树重拉；③ 无论弹窗是否可见都给一次汇总提示。
 */
const handleFolderUploaded = (summary?: FolderUploadSummary) => {
  const wasBackground = !folderUploadDialog.value.visible;
  folderUploadRunning.value = false;
  cloudTreeRefreshToken.value += 1;

  const copy = fileTreeCopy.value;
  const ok = summary ? summary.uploaded + summary.unchanged : 0;
  const skipped = summary ? summary.skipped + summary.conflict : 0;
  const failed = summary?.failed ?? 0;
  const aborted = summary?.aborted ?? false;
  // 中止的队列不能读成「全部成功」：失败/跳过/中止都走 info，其余走 success
  const hasIssues = failed > 0 || skipped > 0 || aborted;
  const parts = [hasIssues ? copy.uploadFolderPartial(ok, failed, skipped) : copy.uploadFolderDone(ok)];
  if (aborted) {
    parts.push(getCloudDocPanelI18n(settingsStore.uiLanguage).uploadAborted);
  }

  // 图片附件（md 相对图片）不在逐条文件结果里：有计数/有问题时补一句
  if (summary && shouldShowFolderAssets(summary.assets)) {
    const assets = summary.assets;
    parts.push(copy.uploadAssetsSummary(folderAssetsOk(assets), assets.failed, assets.skipped));
  }
  if (summary && summary.assets.unsupported > 0) {
    parts.push(copy.uploadAssetsUnsupported(summary.assets.unsupported));
  }
  if (summary?.assets.disabled) {
    parts.push(copy.uploadAssetsDisabled);
  }
  if (wasBackground) {
    // 完成时弹窗是隐藏的：明确告诉用户这份汇总来自后台上传
    parts.push(copy.uploadFinishedInBackground);
  }

  const message = parts.join(' · ');
  if (hasIssues) {
    notificationStore.info(copy.uploadFolderTitle, message);
  } else {
    notificationStore.success(copy.uploadFolderTitle, message);
  }
};

const refreshShareHintFor = async (filePath: string) => {
  if (!cloudSyncStore.signedIn) {
    return;
  }
  const cloudPath = resolveCloudDocPathForFile(
    filePath,
    workspaceStore.currentWorkspaceName,
    workspaceStore.currentWorkspacePath,
  );
  const fileId = cloudSyncStore.docMap[cloudPath]?.fileId;
  if (fileId === null || fileId === undefined) {
    return;
  }
  const outcome = await getShareStatus(fileId);
  if (!outcome.ok) {
    return;
  }
  const next = new Set(sharedFilePaths.value);
  if (outcome.data.shared) {
    next.add(filePath);
  } else {
    next.delete(filePath);
  }
  sharedFilePaths.value = [...next];
};

/** 编辑器右键：把当前标签包装成文件树节点，复用同一套同步/分享逻辑。 */
const activeTabAsFileEntry = (): FileTreeNode | null => {
  const tab = tabsStore.activeTab;
  if (!tab?.filePath) {
    return null;
  }
  return { name: tab.fileName, path: tab.filePath, type: 'file' } as FileTreeNode;
};

const handleActiveTabSyncToCloud = () => {
  const entry = activeTabAsFileEntry();
  if (!entry) {
    notificationStore.warning(
      cloudSyncCopy.value.settingsCloudSync,
      '当前文档还没有磁盘文件，请先保存后再同步。',
    );
    return;
  }
  handleFileTreeSyncToCloud(entry);
};

const handleActiveTabShare = () => {
  const entry = activeTabAsFileEntry();
  if (!entry) {
    notificationStore.warning(
      cloudSyncCopy.value.settingsCloudSync,
      '当前文档还没有磁盘文件，请先保存后再分享。',
    );
    return;
  }
  handleFileTreeShare(entry);
};

const handleFileTreeShare = (entry: FileTreeNode) => {
  if (!cloudSyncStore.signedIn) {
    notificationStore.warning(
      cloudSyncCopy.value.settingsCloudSync,
      cloudSyncCopy.value.cloudSyncLoginRequired,
    );
    openCloudSyncSettings();
    return;
  }
  shareDialog.value = { visible: true, filePath: entry.path, fileName: entry.name };
};

const handleShareStateChanged = () => {
  cloudTreeRefreshToken.value += 1;
};

/**
 * 云文档树右键的「同步/分享」。
 *
 * 本地路径优先取「已打开的标签」：跨工作区文档会被落到系统临时区，它不在当前工作区里，
 * 按工作区反推会指向一个不存在（或另一份）的文件 —— 这也是「同步至云端」曾把更新做成新建的根因。
 * 同时把云端身份（fileId / 云端路径 / 分类）一并带给同步弹窗，回显与更新都靠它。
 */
const handleCloudDocAction = (
  action: 'sync' | 'share',
  node: CloudDocTreeNode,
) => {
  const file = node.file ?? null;
  const cloudFileId = file?.fileId ?? null;
  const openedTab = cloudFileId === null
    ? undefined
    : tabsStore.tabs.find((tab) => tab.cloudFileId === cloudFileId);

  let localPath = openedTab?.filePath ?? '';
  if (!localPath) {
    const workspaceName = workspaceStore.currentWorkspaceName ?? '';
    const prefix = workspaceName ? `tau/${workspaceName}/` : 'tau/';
    const root = workspaceStore.currentWorkspacePath ?? '';
    const relative = node.path.startsWith(prefix) ? node.path.slice(prefix.length) : '';
    if (!root || !relative || relative.includes('..')) {
      notificationStore.warning(
        cloudSyncCopy.value.settingsCloudSync,
        '本地没有对应文件，请先在云端文档树里打开它',
      );
      return;
    }
    localPath = `${root}/${relative}`;
  }

  if (action === 'sync') {
    if (isBinaryDocPath(localPath)) {
      void syncBinaryDocument({ path: localPath, name: node.name } as FileTreeNode);
      return;
    }
    cloudSyncDialog.value = {
      visible: true,
      filePath: localPath,
      fileName: node.name,
      cloudFileId,
      cloudPath: node.path ?? null,
      category: file?.category ?? null,
      categoryId: file?.categoryId ?? null,
    };
    return;
  }
  shareDialog.value = { visible: true, filePath: localPath, fileName: node.name };
};

const handleFolderToggle = (folderPath: string) => {
  fileSystemStore.toggleFolder(folderPath);
};

const handleFileOpen = async (filePath: string) => {
  pushCurrentNavigation();
  await openFileInEditor(filePath);
  await nextTick();
  pushCurrentNavigation();
};

const handleFileTreeContextMenu = (entry: FileTreeNode | null) => {
  fileTreeContextEntry.value = entry;
  // 右键文件时顺手刷新「是否已分享」标记，菜单里据此显示「分享（已分享）」
  if (entry?.type === 'file') {
    void refreshShareHintFor(entry.path);
  }
};

const formatFileDetailsDate = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return '未知';
  const date = new Date(typeof value === 'number' && value < 10_000_000_000 ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? '未知' : date.toLocaleString('zh-CN', { hour12: false });
};

const formatFileDetailsSize = (size: number | null | undefined) => {
  if (size === null || size === undefined) return '未知';
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
};

const handleFileTreeDetails = (entry: FileTreeNode) => {
  fileDetailsDialog.value = { visible: true, entry };
};

const closeFileDetailsDialog = () => {
  fileDetailsDialog.value = { visible: false, entry: null };
};

const requestName = async (title: string, defaultValue: string): Promise<string | null> => {
  if (typeof window === 'undefined') {
    return null;
  }

  if (nameDialog.value.resolve) {
    nameDialog.value.resolve(null);
  }

  return new Promise<string | null>((resolve) => {
    nameDialog.value = {
      visible: true,
      title,
      value: defaultValue,
      resolve,
    };
    void nextTick(() => {
      nameDialogInput.value?.focus();
      nameDialogInput.value?.select();
    });
  });
};

const closeNameDialog = (submitted: boolean) => {
  const dialog = nameDialog.value;
  if (!dialog.visible) {
    return;
  }

  const value = submitted ? dialog.value.trim() : null;
  nameDialog.value = {
    visible: false,
    title: '',
    value: '',
    resolve: null,
  };
  dialog.resolve?.(value && value.length > 0 ? value : null);
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

  const fileName = await requestName('请输入新文件名', 'NewFile.txt');
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

  const folderName = await requestName('请输入新文件夹名称', 'NewFolder');
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
  const nextName = await requestName('请输入新的名称', entry.name);
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
  pushCurrentNavigation();
  tabService.activateTab(tabId);
  void nextTick(() => {
    pushCurrentNavigation();
  });
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
  // 云文档：内容变化进入 2.5s 空闲窗口；后台模型的回写不参与计时
  if (modelId === activeTab.value?.id && activeTab.value?.cloudFileId != null) {
    cloudAutoSave.notifyEditing();
  }
};

const handleEditorBlur = (modelId: string) => {
  if (modelId !== activeTab.value?.id) return;
  syncActiveEditorContent();
  markLocalWritePending(activeTab.value?.filePath);
  void tabService.saveActiveTab({ silent: true });
  // 失焦立即补一次云端保存，并取消未到期的去抖窗口（同一次编辑不会存两遍）
  if (activeTab.value?.cloudFileId != null) {
    void cloudAutoSave.triggerNow('blur');
  }
};

const handleMarkdownCodeLanguageChange = (payload: {
  fenceIndex: number;
  originalLanguage: string;
  code: string;
  language: string;
}) => {
  const editor = editorCoreRef.value;
  const currentContent = editor?.getContent();
  const nextContent = typeof currentContent === 'string'
    ? replaceMarkdownCodeFenceLanguage(
      currentContent,
      payload.fenceIndex,
      { language: payload.originalLanguage, code: payload.code },
      payload.language,
    )
    : null;
  if (nextContent === null || !editor?.replaceContent(nextContent)) {
    notificationStore.error(markdownPreviewText.value.codeLanguageUpdateFailed);
    return;
  }
  notificationStore.info(markdownPreviewText.value.codeLanguageChanged(payload.language));
};

const handleMarkdownPreviewChange = (content: string) => {
  const editor = editorCoreRef.value;
  if (editor && editor.getContent() !== content) {
    editor.replaceContent(content);
  }
  tabService.updateActiveTabContent(content, { markDirty: true });
  scheduleSessionSave();
  markLocalWritePending(activeTab.value?.filePath);
  void tabService.saveActiveTab({ silent: true });
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

const handleEditorScrollChange = (state: {
  top: number;
  height: number;
  scrollHeight: number;
  topLine: number;
}) => {
  // 目录高亮与预览是否开启无关（代码文件的大纲同样要跟随），因此先写入再按预览条件早退。
  const shouldKeepExternallyDrivenLine = Date.now() < previewDrivingActiveLineUntil
    || Date.now() < navigationLockedActiveLineUntil;
  if (!shouldKeepExternallyDrivenLine) {
    writeActiveOutlineLine(state.topLine);
  }
  if (!isMarkdownTab.value || !settingsStore.markdownPreviewEnabled || markdownPreviewMode.value === 'edit') {
    return;
  }
  editorScrollState.value = {
    top: state.top,
    height: state.height,
    scrollHeight: state.scrollHeight,
  };
};

const handlePreviewActiveLine = (line: number) => {
  if (Date.now() < navigationLockedActiveLineUntil) {
    return;
  }
  writeActiveOutlineLine(line);
};

const handlePreviewScrollSync = (state: { top: number; height: number; scrollHeight: number }) => {
  if (!isMarkdownTab.value || !settingsStore.markdownPreviewEnabled || markdownPreviewMode.value === 'edit') {
    return;
  }
  previewDrivingActiveLineUntil = Date.now() + PREVIEW_DRIVING_WINDOW_MS;
  editorCoreRef.value?.setScrollTop(state.top);
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

const handleOpenCommandPalette = () => {
  paletteMode.value = 'commands';
  commandStore.openPalette();
};

const handleOpenQuickOpen = () => {
  paletteMode.value = 'quick-open';
  commandStore.openPalette();
};

const handleStartWindowDragging = async (event: MouseEvent) => {
  if (event.detail > 1) return;

  try {
    await getCurrentWindow().startDragging();
  } catch (error) {
    notificationStore.error(
      '无法拖动窗口',
      error instanceof Error ? error.message : String(error),
    );
  }
};

const handleToggleWindowMaximized = async () => {
  try {
    const currentWindow = getCurrentWindow();
    if (await currentWindow.isMaximized()) {
      await currentWindow.unmaximize();
    } else {
      await currentWindow.maximize();
    }
  } catch (error) {
    notificationStore.error(
      '无法调整窗口大小',
      error instanceof Error ? error.message : String(error),
    );
  }
};

const pushCurrentNavigation = () => {
  const tab = activeTab.value;
  if (!tab?.filePath) return;
  const position = editorCoreRef.value?.getPosition?.();
  pushNavigationHistory({
    filePath: tab.filePath,
    line: position?.line ?? editorStore.cursorPosition.line,
    column: position?.column ?? editorStore.cursorPosition.column,
  });
};

const navigateToHistoryLocation = async (location: NavigationLocation | null) => {
  if (!location) return;
  restoringNavigation.value = true;
  try {
    await openFileInEditor(location.filePath);
    if (await waitForEditorTarget(location.filePath)) {
      editorCoreRef.value?.revealLine(location.line, location.column);
    }
  } finally {
    restoringNavigation.value = false;
  }
};

const handleGoBack = async () => {
  const location = navigationHistory.back();
  navigationHistoryRevision.value += 1;
  await navigateToHistoryLocation(location);
};

const handleGoForward = async () => {
  const location = navigationHistory.forward();
  navigationHistoryRevision.value += 1;
  await navigateToHistoryLocation(location);
};

const handleTitlebarUpdateAvailability = (state: Omit<TitlebarUpdateState, 'releaseUrl'> & { releaseUrl?: string }) => {
  titlebarUpdate.value = {
    ...state,
    releaseUrl: state.releaseUrl ?? '',
  };
};

const clearTitlebarProgressTimer = () => {
  if (titlebarProgressTimer) {
    clearTimeout(titlebarProgressTimer);
    titlebarProgressTimer = null;
  }
};

const handleTitlebarUpgrade = async () => {
  const update = titlebarUpdate.value;
  if (!update) return;
  if (!update.canInstall) {
    if (update.releaseUrl) {
      try {
        await appCommands.openExternalLink(update.releaseUrl);
      } catch (error) {
        notificationStore.error(
          settingsStore.uiLanguage === 'en-US' ? 'Could not open release page' : '无法打开更新页面',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    return;
  }

  clearTitlebarProgressTimer();
  titlebarUpdateProgress.value = 0;
  titlebarUpdateProgressVisible.value = true;
  titlebarUpdateComplete.value = false;
  const result = await workspaceSettingsPanelRef.value?.installUpdate();
  if (!result?.success) {
    titlebarUpdateProgressVisible.value = false;
    titlebarUpdateProgress.value = null;
    notificationStore.error(
      settingsStore.uiLanguage === 'en-US' ? 'Update failed' : '更新失败',
      result?.error || (settingsStore.uiLanguage === 'en-US' ? 'Could not start the update.' : '无法启动更新。'),
    );
    return;
  }
  titlebarUpdateProgress.value = 100;
  titlebarUpdateComplete.value = true;
  titlebarProgressTimer = setTimeout(() => {
    titlebarUpdateProgressVisible.value = false;
    titlebarUpdateProgress.value = null;
    titlebarUpdateComplete.value = false;
    titlebarProgressTimer = null;
  }, 3000);
};

const buildWorkspaceSymbolCommands = (symbols: Array<{ name: string; containerName?: string; location: monaco.languages.Location }>) => {
  workspaceSymbolTargets.value = symbols.map((symbol) => {
    const path = uriToPath(symbol.location.uri.toString());
    return {
      filePath: path || symbol.location.uri.toString(),
      line: Math.max(1, symbol.location.range.startLineNumber),
      column: Math.max(1, symbol.location.range.startColumn),
    };
  });
  workspaceSymbolCommands.value = symbols.map((symbol, index) => ({
    id: `workspace-symbol:${index}`,
    title: symbol.containerName ? `${symbol.name} · ${symbol.containerName}` : symbol.name,
    category: 'workspace',
    keywords: [symbol.name, symbol.containerName || '', symbol.location.uri.toString()],
    run: async () => {
      const target = workspaceSymbolTargets.value[index];
      if (!target) return;
      pushCurrentNavigation();
      await navigateToHistoryLocation(target);
      pushNavigationHistory(target);
    },
  }));
};

const refreshWorkspaceSymbols = async (query = '') => {
  const active = activeTab.value;
  const modelUri = active?.filePath ? pathToUri(active.filePath) : active ? untitledUri(active.id) : null;
  const model = modelUri ? monaco.editor.getModel(monaco.Uri.parse(modelUri)) : null;
  const bridge = model ? getMonacoLspBridge() : null;
  if (!model || !bridge) {
    workspaceSymbolCommands.value = [];
    return;
  }
  const requestId = ++workspaceSymbolRequestId;
  try {
    const symbols = await bridge.provideWorkspaceSymbols(model, query);
    if (requestId !== workspaceSymbolRequestId) return;
    buildWorkspaceSymbolCommands(symbols || []);
  } catch (error) {
    if (requestId === workspaceSymbolRequestId) {
      workspaceSymbolCommands.value = [];
      console.debug('[WorkspaceSymbols] unavailable', error);
    }
  }
};

const handleSearchWorkspaceSymbols = async () => {
  paletteMode.value = 'workspace-symbol';
  commandStore.openPalette();
};

watch(
  () => [paletteMode.value, commandStore.paletteOpen, commandStore.query] as const,
  ([mode, open, query]) => {
    if (mode === 'workspace-symbol' && open) void refreshWorkspaceSymbols(query);
  },
);

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
  const root = workspaceStore.currentWorkspacePath;
  if (!root || !relativePath) return;
  const filePath = joinFsPath(root, relativePath);
  pushCurrentNavigation();
  await openWorkspaceFileAtLine(relativePath, line);
  if (await waitForEditorTarget(filePath)) {
    pushNavigationHistory({ filePath, line, column: 1 });
  }
};

const handleFindText = () => {
  editorCoreRef.value?.triggerFindWidget();
};

const handleGoToLine = () => {
  editorCoreRef.value?.triggerGoToLine();
};

const handleGoToDefinition = () => editorCoreRef.value?.goToDefinition();
const handleGoToDeclaration = () => editorCoreRef.value?.goToDeclaration();
const handleGoToTypeDefinition = () => editorCoreRef.value?.goToTypeDefinition();
const handleGoToImplementation = () => editorCoreRef.value?.goToImplementation();
const handlePeekDefinition = () => editorCoreRef.value?.peekDefinition();
const handlePeekReferences = () => editorCoreRef.value?.peekReferences();
const handleFindReferences = () => editorCoreRef.value?.findReferences();
const handleRenameSymbol = () => editorCoreRef.value?.renameSymbol();
const handleCancelReferences = () => {
  referenceRequestId += 1;
  editorCoreRef.value?.cancelReferences();
  referencePanelLoading.value = false;
};

const buildReferenceGroups = async (locations: monaco.languages.Location[]): Promise<ReferenceResultGroup[]> => {
  const contents = new Map<string, string>();
  const records: ReferenceResultItem[] = [];
  for (const [index, location] of locations.entries()) {
    const uri = location.uri.toString();
    const path = uriToPath(uri);
    if (!path) continue;
    let content = contents.get(path);
    if (content === undefined) {
      const openTab = tabsStore.tabs.find((tab) => tab.filePath && comparableFsPath(tab.filePath) === comparableFsPath(path));
      try {
        content = openTab?.content ?? await fileCommands.readFile(path);
      } catch {
        content = '';
      }
      contents.set(path, content);
    }
    const lines = content.split(/\r?\n/);
    const line = Math.max(1, location.range.startLineNumber);
    records.push({
      id: `reference-${index}-${encodeURIComponent(uri)}-${line}`,
      uri,
      path,
      line,
      column: Math.max(1, location.range.startColumn),
      preview: (lines[line - 1] ?? '').trim() || path,
    });
  }
  const grouped = new Map<string, ReferenceResultItem[]>();
  for (const record of records) {
    const list = grouped.get(record.path) ?? [];
    list.push(record);
    grouped.set(record.path, list);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, items]) => ({
      path,
      items: items.sort((a, b) => a.line - b.line || a.column - b.column),
    }));
};

const runFindReferences = async () => {
  const requestId = ++referenceRequestId;
  referencePanelVisible.value = true;
  referencePanelLoading.value = true;
  referencePanelError.value = null;
  referenceGroups.value = [];
  const locations = await editorCoreRef.value?.requestReferences();
  if (requestId !== referenceRequestId) return;
  if (locations === null || locations === undefined) {
    referencePanelVisible.value = false;
    referencePanelLoading.value = false;
    editorCoreRef.value?.triggerNativeReferences();
    return;
  }
  try {
    referenceGroups.value = await buildReferenceGroups(locations);
  } catch (error) {
    referencePanelError.value = error instanceof Error ? error.message : '引用结果加载失败';
  } finally {
    if (requestId === referenceRequestId) referencePanelLoading.value = false;
  }
};

const handleReferenceNavigate = async (item: ReferenceResultItem) => {
  const path = uriToPath(item.uri);
  if (!path) return;
  pushCurrentNavigation();
  await openFileInEditor(path);
  if (await waitForEditorTarget(path)) {
    editorCoreRef.value?.revealLine(item.line, item.column);
    pushNavigationHistory({ filePath: path, line: item.line, column: item.column });
  }
};

const hierarchyItemToRow = (item: MonacoHierarchyItem, index: number, direction: string): HierarchyRow => {
  const path = uriToPath(item.uri.toString()) || item.uri.toString();
  const directionLabel = hierarchyPanelMode.value === 'call'
    ? direction === 'incoming' ? '调用方' : '被调用'
    : direction === 'supertype' ? '父类型' : '子类型';
  return {
    id: `${direction}-${index}-${encodeURIComponent(item.uri.toString())}-${item.selectionRange.startLineNumber}`,
    name: item.name,
    detail: [directionLabel, item.detail].filter(Boolean).join(' · '),
    path,
    line: Math.max(1, item.selectionRange.startLineNumber),
    column: Math.max(1, item.selectionRange.startColumn),
    uri: item.uri.toString(),
  };
};

const runHierarchy = async (mode: HierarchyMode) => {
  const requestId = ++hierarchyRequestId;
  hierarchyPanelMode.value = mode;
  hierarchyPanelVisible.value = true;
  hierarchyPanelLoading.value = true;
  hierarchyPanelError.value = null;
  hierarchyRoot.value = null;
  hierarchyRows.value = [];

  try {
    const result = mode === 'call'
      ? await editorCoreRef.value?.requestCallHierarchy()
      : await editorCoreRef.value?.requestTypeHierarchy();
    if (requestId !== hierarchyRequestId) return;
    if (!result) {
      hierarchyPanelVisible.value = false;
      notificationStore.warning(
        mode === 'call' ? '调用层级不可用' : '类型层级不可用',
        '当前语言服务尚未准备完成，Tau Editor 会自动下载；请稍后重试或到设置中点击“自动准备”。',
      );
      return;
    }
    hierarchyRoot.value = result.root
      ? { name: result.root.name, detail: result.root.detail }
      : null;
    hierarchyRows.value = result.rows.map(({ direction, item }, index) => hierarchyItemToRow(item, index, direction));
  } catch (error) {
    if (requestId === hierarchyRequestId) {
      hierarchyPanelError.value = error instanceof Error ? error.message : '层级关系加载失败';
    }
  } finally {
    if (requestId === hierarchyRequestId) hierarchyPanelLoading.value = false;
  }
};

const handleCallHierarchy = () => { void runHierarchy('call'); };
const handleTypeHierarchy = () => { void runHierarchy('type'); };
const handleCancelHierarchy = () => {
  hierarchyRequestId += 1;
  editorCoreRef.value?.cancelHierarchy();
  hierarchyPanelLoading.value = false;
};
const handleHierarchyNavigate = async (row: HierarchyRow) => {
  const path = uriToPath(row.uri);
  if (!path) return;
  pushCurrentNavigation();
  await openFileInEditor(path);
  if (await waitForEditorTarget(path)) {
    editorCoreRef.value?.revealLine(row.line, row.column);
    pushNavigationHistory({ filePath: path, line: row.line, column: row.column });
  }
};

const handleToggleProblems = () => {
  problemsPanelVisible.value = !problemsPanelVisible.value;
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
  goToDefinition: handleGoToDefinition,
  goToDeclaration: handleGoToDeclaration,
  goToTypeDefinition: handleGoToTypeDefinition,
  goToImplementation: handleGoToImplementation,
  peekDefinition: handlePeekDefinition,
  peekReferences: handlePeekReferences,
  findReferences: handleFindReferences,
  renameSymbol: handleRenameSymbol,
  showCallHierarchy: handleCallHierarchy,
  showTypeHierarchy: handleTypeHierarchy,
  cloudLogin: handleCloudLoginCommand,
  cloudLogout: handleCloudLogoutCommand,
  cloudSyncNow: handleCloudSyncNowCommand,
  cloudBrowse: openCloudDocBrowser,
  toggleProblems: handleToggleProblems,
  toggleSidebar: handleToggleFileTree,
  toggleSettings: () => toggleSettingsContainer('workspace'),
  openCommandPalette: handleOpenCommandPalette,
  compareWithFile: handleCompareWithFile,
  openInNewWindow: handleOpenTabInNewWindow,
  moveToNewWindow: handleMoveTabToNewWindow,
  goBack: handleGoBack,
  goForward: handleGoForward,
  searchWorkspaceSymbols: handleSearchWorkspaceSymbols,
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
  if (id.startsWith('workspace-symbol:')) {
    paletteMode.value = 'commands';
    const index = Number(id.slice('workspace-symbol:'.length));
    const targetCommand = Number.isInteger(index) ? workspaceSymbolCommands.value[index] : undefined;
    if (targetCommand?.run) {
      await targetCommand.run();
    }
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
  'editor.goToDefinition': () => void executeCommand('editor.goToDefinition'),
  'editor.goToDeclaration': () => void executeCommand('editor.goToDeclaration'),
  'editor.goToTypeDefinition': () => void executeCommand('editor.goToTypeDefinition'),
  'editor.goToImplementation': () => void executeCommand('editor.goToImplementation'),
  'editor.peekDefinition': () => void executeCommand('editor.peekDefinition'),
  'editor.peekReferences': () => void executeCommand('editor.peekReferences'),
  'editor.callHierarchy': () => void executeCommand('editor.callHierarchy'),
  'editor.typeHierarchy': () => void executeCommand('editor.typeHierarchy'),
  'editor.findReferences': () => void executeCommand('editor.findReferences'),
  'editor.renameSymbol': () => void executeCommand('editor.renameSymbol'),
  'editor.toggleProblems': () => void executeCommand('editor.toggleProblems'),
  'editor.goBack': () => void executeCommand('editor.goBack'),
  'editor.goForward': () => void executeCommand('editor.goForward'),
  'workspace.search': handleOpenWorkspaceSearch,
  'workspace.quickOpen': handleOpenQuickOpen,
  'workspace.searchSymbols': () => void executeCommand('workspace.searchSymbols'),
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

Welcome to Tau Editor, a focused workspace for editing text, code, and Markdown.

## Files and Workspaces
- Create a blank document: toolbar "New File" or \`Ctrl/Cmd + N\`.
- Open a file: toolbar "Open File" or \`Ctrl/Cmd + O\`.
- Open a folder as a workspace: toolbar "Open Folder". The Explorer lets you browse files, create files and folders, rename, delete, refresh, and compare files.
- Save: \`Ctrl/Cmd + S\`. Save As: \`Ctrl/Cmd + Shift + S\` or toolbar "Save As".
- Work with multiple files in tabs. Right-click a tab for close and file actions.
- Use Quick Open (\`Ctrl/Cmd + P\`) to find a workspace file, or Search Workspace (\`Ctrl/Cmd + Shift + F\`) to search and preview replacements across files.

## Editing and Navigation
- Find text in the current file: \`Ctrl/Cmd + F\`; go to a line: \`Ctrl/Cmd + G\`.
- The editor supports syntax highlighting for many languages. The status bar lets you change the file's language mode, encoding, and editor theme.
- For supported code languages, use the command palette for symbol search, definition/reference navigation, rename, and problems.
- Zoom editor text with \`Ctrl/Cmd + =\` and \`Ctrl/Cmd + -\`; reset with \`Ctrl/Cmd + 0\`.
- Use the Explorer and Context panels to navigate files, document outlines, Markdown tasks and links, and available workspace or Git information.

## Markdown
- Markdown files have a formatting toolbar for headings, emphasis, lists, links, images, tables, code blocks, Mermaid diagrams, and other common snippets.
- Switch between editor, split, and preview modes with the preview button. The Context panel can show the outline, tasks, and links.
- Insert or paste images into a Markdown document to import them into its \`assets/\` folder. Export a Markdown document as standalone HTML from the Context panel.

## Personalize
- Open Settings from the toolbar or \`Ctrl/Cmd + ,\` to adjust appearance, editor preferences, auto-save, and keyboard shortcuts. The theme marketplace is available in Settings.
- Open the Command Palette with \`F1\` or \`Ctrl/Cmd + Shift + P\` to search for commands; use it whenever you are unsure where an action lives.
- You can open external files from the OS "Open With -> Tau Editor".
- This guide is an unsaved tab. Save it if you want to keep it.
`;
  }

  return `# Tau Editor 使用说明

欢迎使用 Tau Editor，一款用于编辑文本、代码与 Markdown 的轻量工作台。

## 文件与工作区
- 新建空白文档：工具栏「新建文件」或 \`Ctrl/Cmd + N\`。
- 打开文件：工具栏「打开文件」或 \`Ctrl/Cmd + O\`。
- 打开文件夹作为工作区：工具栏「打开文件夹」。资源管理器支持浏览文件、创建文件和文件夹、重命名、删除、刷新及文件对比。
- 保存：\`Ctrl/Cmd + S\`；另存为：\`Ctrl/Cmd + Shift + S\` 或点击工具栏「另存为」。
- 多个文件可同时在标签页中打开；右键标签页可使用关闭和文件操作。
- 使用快速打开（\`Ctrl/Cmd + P\`）查找工作区文件；使用工作区搜索（\`Ctrl/Cmd + Shift + F\`）跨文件搜索，并在预览替换结果后应用修改。

## 编辑与导航
- 在当前文件中查找：\`Ctrl/Cmd + F\`；跳转到指定行：\`Ctrl/Cmd + G\`。
- 编辑器支持多种语言的语法高亮；可在状态栏切换文件语言模式、编码和编辑器主题。
- 对支持的代码语言，可通过命令面板使用符号搜索、定义/引用导航、重命名和问题列表等功能。
- 使用 \`Ctrl/Cmd + =\` 放大文字、\`Ctrl/Cmd + -\` 缩小文字、\`Ctrl/Cmd + 0\` 重置字号。
- 资源管理器和右侧上下文面板可用于浏览文件、文档大纲、Markdown 任务与链接，以及可用的工作区或 Git 信息。

## Markdown
- 打开 Markdown 文件后，可使用工具栏快速插入标题、强调、列表、链接、图片、表格、代码块、Mermaid 图等常用语法。
- 点击预览按钮可在编辑、分栏和纯预览模式间切换；右侧上下文面板可查看大纲、任务和链接。
- 在 Markdown 文档中插入或粘贴图片，可将图片导入文档旁的 \`assets/\` 目录；也可在右侧上下文面板将文档导出为独立 HTML。

## 个性化设置
- 点击工具栏设置按钮或按 \`Ctrl/Cmd + ,\`，可调整外观、编辑器偏好、自动保存和快捷键；设置中还提供主题市场。
- 按 \`F1\` 或 \`Ctrl/Cmd + Shift + P\` 打开命令面板搜索操作，不确定入口时可先在这里查找。
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
  const lspChanges = changes.flatMap((change) => {
    if (change.kind === 'renamed' && change.oldPath) {
      return [
        { uri: pathToUri(change.oldPath), type: 3 },
        { uri: pathToUri(change.path), type: 1 },
      ];
    }
    return [{
      uri: pathToUri(change.path),
      type: change.kind === 'created' ? 1 : change.kind === 'removed' ? 3 : 2,
    }];
  });
  void applicationLspService.notifyWatchedFiles(lspChanges).catch((error) => {
    console.debug('[LSP] 工作区文件变更通知失败', error);
  });

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

    if (change.kind !== 'removed' && consumePendingLocalWrite(filePath)) {
      tabsStore.updateTab(tab.id, {
        lastKnownModified: change.modifiedMs ?? tab.lastKnownModified ?? Date.now(),
        externalModifiedAt: null,
      });
      fileConflictsStore.resolve(filePath);
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
    if (consumePendingLocalWrite(tab.filePath)) {
      tabsStore.updateTab(tab.id, { lastKnownModified: observedModified, externalModifiedAt: null });
      fileConflictsStore.resolve(tab.filePath);
      return;
    }
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

/**
 * 冷启动校验：上次的临时工作区（scratch）目录可能已被系统清理。
 *
 * 不清掉的话会同时出现三件事：资源管理器是空树、徽标仍写着"临时工作区"、
 * 外部文件轮询每 1.5s 刷一条 warn。只处理 scratch——用户自己的目录可能只是
 * 暂时不可用（网络盘掉线），静默清掉反而会让人丢掉想恢复的上下文。
 *
 * @returns 是否真的清掉了（用于阻止 restoreSession 再把这条失效路径复活）
 */
async function clearPersistedScratchWorkspaceIfMissing(): Promise<boolean> {
  const result = await guardPersistedScratchWorkspace(workspaceStore, {
    probeDirectoryExists: async (path) => {
      if (!isTauriApp()) {
        return null;
      }
      const [exists] = await cloudCommands.dirExists([path]);
      return typeof exists === 'boolean' ? exists : null;
    },
    notifyCleared: (path) => {
      notificationStore.warning(
        appText.value.scratchWorkspaceClearedTitle,
        appText.value.scratchWorkspaceClearedMessage(path),
      );
    },
  });

  return result === 'cleared';
}

async function restoreSession(options: { skipWorkspaceRestore?: boolean } = {}) {
  const shouldRestoreLastSession = settingsStore.restoreLastSession;
  const snapshot = shouldRestoreLastSession ? sessionService.load() : null;
  const allRecoveryDrafts = sessionService.loadRecoveryDrafts() ?? [];
  const recoveryDrafts = shouldRestoreLastSession
    ? allRecoveryDrafts
    : allRecoveryDrafts.filter((draft) => draft.isUntitled);
  if (!snapshot && recoveryDrafts.length === 0) return;

  const shouldRestoreDrafts = recoveryDrafts.length > 0 && (
    typeof window === 'undefined'
    || window.confirm(`检测到 ${recoveryDrafts.length} 个未保存草稿，是否恢复？`)
  );
  if (recoveryDrafts.length > 0 && !shouldRestoreDrafts) {
    if (shouldRestoreLastSession) {
      await sessionService.clearRecoveryDrafts();
    } else {
      await Promise.all(recoveryDrafts.map((draft) => sessionService.discardRecoveryDraft(draft.id)));
    }
  }

  const restoredSnapshotTabs = snapshot?.tabs.filter(
    (tab) => shouldRestoreDrafts || !recoveryDrafts.some((draft) => draft.id === tab.id),
  ) ?? [];
  const restoredTabs = shouldRestoreDrafts
    ? [
        ...restoredSnapshotTabs.filter((tab) => !recoveryDrafts.some((draft) => draft.id === tab.id)),
        ...recoveryDrafts,
      ]
    : restoredSnapshotTabs;
  const activeTabId = snapshot?.activeTabId ?? restoredTabs[0]?.id ?? null;

  tabsStore.restoreSession(restoredTabs, activeTabId);

  // 失效的临时工作区已在冷启动时清掉，别在这里把它复活
  const canRestoreWorkspace = !options.skipWorkspaceRestore
    && shouldRestoreLastSession
    && snapshot?.workspacePath
    && snapshot.mode === 'workspace';
  if (canRestoreWorkspace && snapshot?.workspacePath) {
    // 保留持久化的来源：scratch 被当成 user 会污染"最近项目"，徽标也会与实际不符
    const restoredOrigin = workspaceStore.currentWorkspacePath === snapshot.workspacePath
      ? workspaceStore.workspaceOrigin
      : 'user';
    workspaceStore.openWorkspace(snapshot.workspacePath, restoredOrigin);
    void fileSystemStore.syncFromWorkspace();
  } else if (restoredTabs.length > 0) {
    workspaceStore.setMode('single-file', true);
  } else {
    workspaceStore.setEmptyMode();
  }
}

async function saveSession() {
  if (!settingsStore.restoreLastSession) {
    await sessionService.clearSession();
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
    void sessionService.clearSession();
    return;
  }

  cancelScheduledSessionSave();
  sessionSaveTimer = setTimeout(() => {
    sessionSaveTimer = null;
    void saveSession();
  }, SESSION_SAVE_DEBOUNCE_MS);
}

async function runAutoSave() {
  if (autoSaveInFlight || !settingsStore.autoSaveEnabled) return;
  syncActiveEditorContent();
  const candidates = tabsStore.tabs.filter((tab) => tab.isDirty && !tab.isLoadingContent);
  if (candidates.length === 0) return;

  autoSaveInFlight = true;
  editorStore.setAutoSaveStatus('saving');
  let hasSaved = false;
  let hasFailure = false;

  try {
    const untitledSnapshots = new Map(
      candidates
        .filter((tab) => tab.isUntitled || !tab.filePath)
        .map((tab) => [tab.id, tab.content]),
    );
    if (untitledSnapshots.size > 0) {
      const savedDraftIds = await sessionService.saveRecoveryDrafts(tabsStore.tabs);
      for (const [tabId, content] of untitledSnapshots) {
        if (!savedDraftIds.has(tabId)) {
          hasFailure = true;
          continue;
        }
        const current = tabsStore.tabs.find((tab) => tab.id === tabId);
        if (!current) continue;
        const unchanged = current.content === content;
        tabsStore.updateTab(tabId, {
          isDirty: !unchanged,
          isRecoverySaved: true,
        });
        if (unchanged && tabsStore.activeTabId === tabId) editorStore.markAsSaved();
        hasSaved = true;
      }
    }

    for (const tab of candidates) {
      if (tab.isUntitled || !tab.filePath) continue;
      const saved = await tabService.saveTab(tab.id, { silent: true });
      if (saved) {
        await sessionService.discardRecoveryDraft(tab.id);
        hasSaved = true;
        // 自动同步：仅由 store 内部判断是否登录/开启，未开启时是空操作。
        cloudSyncStore.scheduleAutoSync(tab.id);
      } else {
        hasFailure = true;
      }
    }

    if (hasSaved) editorStore.updateLastAutoSaveTime();
    editorStore.setAutoSaveStatus(hasFailure ? 'error' : hasSaved ? 'saved' : 'error');
  } catch (error) {
    editorStore.setAutoSaveStatus('error');
    notificationStore.error(
      '自动保存失败',
      error instanceof Error ? error.message : '无法写入自动保存内容',
    );
  } finally {
    autoSaveInFlight = false;
  }
}

function configureAutoSaveTimer() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
  if (!settingsStore.autoSaveEnabled || settingsStore.autoSaveInterval <= 0) return;
  autoSaveTimer = setInterval(() => {
    void runAutoSave();
  }, settingsStore.autoSaveInterval * 1000);
}

watch(
  () => [settingsStore.autoSaveEnabled, settingsStore.autoSaveInterval] as const,
  configureAutoSaveTimer,
);

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
    void sessionService.clearSession();
    const nonUntitledDrafts = sessionService.loadRecoveryDrafts()
      .filter((draft) => !draft.isUntitled);
    void Promise.all(nonUntitledDrafts.map((draft) => sessionService.discardRecoveryDraft(draft.id)));
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

// 目录高亮的重置点：切换文档、关闭预览、退出预览模式，避免残留上一份文档的行号。
watch(
  () => activeTabId.value,
  () => {
    activeOutlineLine.value = 0;
  },
);

watch(
  () => [settingsStore.markdownPreviewEnabled, markdownPreviewMode.value],
  () => {
    if (!settingsStore.markdownPreviewEnabled || markdownPreviewMode.value === 'edit') {
      activeOutlineLine.value = 0;
    }
  },
);

// 文档内容变化后大纲可能收缩：当前行越界时回到首项，否则保留（避免打字时高亮闪烁）。
watch(documentOutline, (outline) => {
  if (!outline.length) {
    activeOutlineLine.value = 0;
    return;
  }
  const lastLine = outline.reduce((max, item) => Math.max(max, item.line), 0);
  if (activeOutlineLine.value > lastLine) {
    activeOutlineLine.value = 1;
  }
});

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
  if (hasDesktopWindowTitlebar.value) {
    const { listen } = await import('@tauri-apps/api/event');
    unlistenUpdateProgress = await listen<UpdateDownloadProgress>(
      'app:update-download-progress',
      ({ payload }) => {
        titlebarUpdateProgressVisible.value = true;
        titlebarUpdateComplete.value = false;
        titlebarUpdateProgress.value = payload.progress;
      },
    );
  }
  window.addEventListener('resize', syncViewportWidth);
  workspaceStore.loadFromStorage();
  const scratchContextCleared = await clearPersistedScratchWorkspaceIfMissing();
  await settingsStore.init();
  configureAutoSaveTimer();
  await bootstrapProviders();
  sidebarWidth.value = clampSidebarWidth(settingsStore.fileTreeWidth);
  contextRailWidth.value = clampContextRailWidth(settingsStore.contextRailWidth);
  await sessionService.initialize();
  // 桌面端在启动后异步恢复云同步会话（keyring 中的会话与配额），失败不阻塞启动。
  if (isTauriApp()) {
    void cloudSyncStore.initialize();
    // 恢复上次未完成的同步队列（断网/退出遗留项），并按退避自动重试。
    cloudSyncStore.initializeQueue();
  }
  // 新窗口优先消费一次性迁移 payload，避免再走一遍会话恢复覆盖标签。
  const pendingWindowTransfer = await consumePendingWindowTransfer();
  if (pendingWindowTransfer) {
    applyWindowTransferPayload(pendingWindowTransfer);
  } else {
    await restoreSession({ skipWorkspaceRestore: scratchContextCleared });
  }
  await refreshWorkspaceContext(workspaceStore.currentWorkspacePath);
  const monacoEditorOpener = registerMonacoEditorOpener({
    openCodeEditor: openMonacoCodeEditor,
  });
  disposeMonacoEditorOpener = () => monacoEditorOpener.dispose();
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
  if (disposeMonacoEditorOpener) {
    disposeMonacoEditorOpener();
    disposeMonacoEditorOpener = null;
  }
  cancelScheduledSessionSave();
  void saveSession();
  cancelScheduledMarkdownLinkStatusRefresh();
  windowService.detach();
  keyboardStore.removeGlobalHandler();
  if (unlistenExternalOpen) {
    unlistenExternalOpen();
    unlistenExternalOpen = null;
  }
  if (unlistenUpdateProgress) {
    unlistenUpdateProgress();
    unlistenUpdateProgress = null;
  }
  clearTitlebarProgressTimer();
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
  // 组件卸载后不再有任何云文档自动保存动作（未到期的 2.5s 窗口一并取消）
  cloudAutoSave.destroy();
  void stopExternalFileWatch();
  void applicationLspService.dispose();
  lspDiagnosticCounts.clear();
  diagnosticsStore.clearAll();
  configureMonacoLspBridge(null);
  window.removeEventListener('keydown', handleShellKeydown);
  window.removeEventListener('resize', syncViewportWidth);
});
</script>

<template>
  <div class="app-shell">
    <Notification />
    <ImageViewer
      :visible="Boolean(imageViewerState)"
      :src="imageViewerState?.src ?? ''"
      :alt="imageViewerState?.alt ?? '图片'"
      @close="closeImageViewer"
    />
    <div
      v-if="nameDialog.visible"
      class="name-dialog-backdrop"
      data-testid="name-dialog-backdrop"
      @click.self="closeNameDialog(false)"
    >
      <section
        class="name-dialog"
        role="dialog"
        aria-modal="true"
        data-testid="name-dialog"
        @keydown.esc="closeNameDialog(false)"
        @keydown.enter.prevent="closeNameDialog(true)"
      >
        <h2 class="name-dialog-title">{{ nameDialog.title }}</h2>
        <input
          ref="nameDialogInput"
          v-model="nameDialog.value"
          class="name-dialog-input"
          data-testid="name-dialog-input"
          type="text"
          autocomplete="off"
        />
        <div class="name-dialog-actions">
          <button type="button" class="name-dialog-button" data-testid="name-dialog-cancel" @click="closeNameDialog(false)">
            取消
          </button>
          <button type="button" class="name-dialog-button primary" data-testid="name-dialog-confirm" @click="closeNameDialog(true)">
            确定
          </button>
        </div>
      </section>
    </div>
    <div
      v-if="fileDetailsDialog.visible && fileDetailsDialog.entry"
      class="name-dialog-backdrop"
      data-testid="file-details-backdrop"
      @click.self="closeFileDetailsDialog"
    >
      <section class="name-dialog file-details-dialog" role="dialog" aria-modal="true" data-testid="file-details-dialog">
        <h2 class="name-dialog-title">文件详情</h2>
        <dl class="file-details-list">
          <div><dt>名称</dt><dd>{{ fileDetailsDialog.entry.name }}</dd></div>
          <div><dt>类型</dt><dd>{{ fileDetailsDialog.entry.type === 'folder' ? '文件夹' : '文件' }}</dd></div>
          <div><dt>路径</dt><dd class="file-details-path">{{ fileDetailsDialog.entry.path }}</dd></div>
          <div><dt>大小</dt><dd>{{ formatFileDetailsSize(fileDetailsDialog.entry.size) }}</dd></div>
          <div><dt>创建时间</dt><dd>{{ formatFileDetailsDate(fileDetailsDialog.entry.created) }}</dd></div>
          <div><dt>修改时间</dt><dd>{{ formatFileDetailsDate(fileDetailsDialog.entry.modified) }}</dd></div>
        </dl>
        <div class="name-dialog-actions">
          <button type="button" class="name-dialog-button primary" data-testid="file-details-close" @click="closeFileDetailsDialog">关闭</button>
        </div>
      </section>
    </div>
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

    <div
      v-if="hasDesktopWindowTitlebar"
      class="app-native-titlebar"
      :class="{ 'app-native-titlebar--mac': hasMacWindowTitlebar }"
      data-testid="app-native-titlebar"
    >
      <div class="native-titlebar-actions">
        <button
          type="button"
          class="native-titlebar-button"
          data-testid="btn-navigation-back"
          :disabled="!canGoBack"
          :aria-label="toolbarText.goBack"
          :title="toolbarText.goBack"
          @click="handleGoBack"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6M20 12H9" /></svg>
        </button>
        <button
          type="button"
          class="native-titlebar-button"
          data-testid="btn-navigation-forward"
          :disabled="!canGoForward"
          :aria-label="toolbarText.goForward"
          :title="toolbarText.goForward"
          @click="handleGoForward"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6M4 12h11" /></svg>
        </button>
        <span class="native-titlebar-divider" aria-hidden="true"></span>
        <button
          type="button"
          class="native-titlebar-button"
          data-testid="btn-quick-open"
          :aria-label="toolbarText.quickOpen"
          :title="toolbarText.quickOpen"
          @click="handleOpenQuickOpen"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5M8.5 10.8h4.6M10.8 8.5v4.6" /></svg>
        </button>
        <button
          type="button"
          class="native-titlebar-button"
          data-testid="btn-command-palette"
          :aria-label="toolbarText.commandPalette"
          :title="toolbarText.commandPalette"
          @click="handleOpenCommandPalette"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h8M5 17h14" /><circle cx="17" cy="12" r="2" /></svg>
        </button>
      </div>
      <div
        class="native-titlebar-drag-region"
        aria-hidden="true"
        @mousedown.left="handleStartWindowDragging"
        @dblclick.left.prevent="handleToggleWindowMaximized"
      ></div>
      <div class="native-titlebar-actions native-titlebar-actions-end">
        <div
          v-if="titlebarUpdateProgressVisible"
          class="native-titlebar-progress"
          role="status"
          aria-live="polite"
          data-testid="titlebar-update-progress"
        >
          <span class="native-titlebar-progress-label">
            {{ titlebarUpdateComplete
              ? (settingsStore.uiLanguage === 'en-US' ? 'Installer started' : '安装程序已启动')
              : (settingsStore.uiLanguage === 'en-US' ? 'Downloading update' : '正在下载更新') }}
          </span>
          <div
            class="native-titlebar-progress-track"
            role="progressbar"
            :aria-valuenow="titlebarUpdateProgress ?? undefined"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span
              class="native-titlebar-progress-fill"
              :class="{ 'is-indeterminate': titlebarUpdateProgress === null }"
              :style="titlebarUpdateProgress === null ? undefined : { width: `${titlebarUpdateProgress}%` }"
            ></span>
          </div>
          <span class="native-titlebar-progress-percent">
            {{ titlebarUpdateComplete ? '100%' : titlebarUpdateProgress === null ? '…' : `${titlebarUpdateProgress}%` }}
          </span>
        </div>
        <div
          v-else-if="titlebarUpdate?.available"
          class="native-titlebar-update-wrap"
          data-testid="titlebar-update-available"
        >
          <button
            type="button"
            class="native-titlebar-update"
            data-testid="btn-titlebar-upgrade"
            :aria-label="settingsStore.uiLanguage === 'en-US'
              ? `Upgrade to ${titlebarUpdate.latestVersion}`
              : `升级到 ${titlebarUpdate.latestVersion}`"
            :aria-describedby="'titlebar-update-tooltip'"
            @click="handleTitlebarUpgrade"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 16V4m0 0L7 9m5-5 5 5" />
              <path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
            </svg>
          </button>
          <div
            id="titlebar-update-tooltip"
            class="native-titlebar-update-tooltip"
            role="tooltip"
            data-testid="titlebar-update-tooltip"
          >
            <strong>
              {{ settingsStore.uiLanguage === 'en-US'
                ? `Version ${titlebarUpdate.latestVersion} is available`
                : `发现新版本 ${titlebarUpdate.latestVersion}` }}
            </strong>
            <span v-if="titlebarUpdate.releaseName">{{ titlebarUpdate.releaseName }}</span>
            <span class="native-titlebar-update-notes">{{ titlebarUpdateNotes }}</span>
            <span v-if="!titlebarUpdate.canInstall" class="native-titlebar-update-unavailable">
              {{ settingsStore.uiLanguage === 'en-US'
                ? 'No installer is available for this device'
                : '没有适用于此设备的安装包' }}
            </span>
          </div>
        </div>
        <span class="native-titlebar-divider" aria-hidden="true"></span>
        <button
          type="button"
          class="native-titlebar-button"
          data-testid="btn-titlebar-toggle-explorer"
          :aria-label="showFileTree ? toolbarText.collapseExplorer : toolbarText.expandExplorer"
          :aria-pressed="showFileTree"
          :title="showFileTree ? toolbarText.collapseExplorer : toolbarText.expandExplorer"
          @click="showFileTree = !showFileTree"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>
        </button>
        <button
          type="button"
          class="native-titlebar-button"
          data-testid="btn-titlebar-toggle-context"
          :aria-label="showContextRail ? toolbarText.collapseContext : toolbarText.expandContext"
          :aria-pressed="showContextRail"
          :title="showContextRail ? toolbarText.collapseContext : toolbarText.expandContext"
          @click="showContextRail = !showContextRail"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></svg>
        </button>
        <button
          v-if="isPreviewableTab && !isFullDocumentPreviewTab"
          type="button"
          class="native-titlebar-button"
          data-testid="btn-titlebar-toggle-markdown-preview"
          :aria-label="`${toolbarText.markdownViewPrefix}: ${toolbarText.previewModeLabels[markdownPreviewMode]}`"
          :title="`${toolbarText.markdownViewPrefix}: ${toolbarText.previewModeLabels[markdownPreviewMode]}`"
          @click="handleCycleMarkdownPreview"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /></svg>
        </button>
      </div>
    </div>

    <Toolbar
      :can-undo="canUndo"
      :can-redo="canRedo"
      :is-dirty="isDirty"
      :has-active-tab="Boolean(activeTab)"
      :can-reveal-current-file="canRevealCurrentFile"
      :locating-current-file="locatingCurrentFile"
      :app-label="appText.appLabel"
      :sidebar-visible="showFileTree"
      :context-rail-visible="showContextRail"
      :is-markdown="isMarkdownTab"
      :is-document-preview="isDocumentPreviewTab"
      :is-full-document-preview="isFullDocumentPreviewTab"
      :markdown-preview-mode="markdownPreviewMode"
      @new-file="handleNewFile"
      @open-file="() => executeCommand('file.open')"
      @open-folder="() => executeCommand('file.openFolder')"
      @save="() => executeCommand('file.save')"
      @save-as="() => executeCommand('file.saveAs')"
      @undo="handleUndo"
      @redo="handleRedo"
      @toggle-file-tree="() => executeCommand('view.toggleSidebar')"
      @locate-current-file="handleRevealCurrentFile"
      @toggle-context-rail="handleToggleContextRail"
      @toggle-settings="handleToolbarToggleSettings"
      @cycle-markdown-preview="handleCycleMarkdownPreview"
      @markdown-action="handleMarkdownAction"
      @markdown-heading="handleMarkdownHeading"
      @markdown-code="handleMarkdownCode"
      @markdown-image="handleInsertMarkdownImage"
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
            id="sidebar-panel"
            data-testid="sidebar-panel"
            :style="{ width: `${sidebarWidth}px` }"
          >
            <div class="sidebar-content animate__animated animate__fadeInLeft animate__faster">
              <div class="sidebar-tabs" role="tablist" data-testid="sidebar-tabs">
                <button
                  type="button"
                  role="tab"
                  class="sidebar-tab"
                  :class="{ 'sidebar-tab--active': sidebarPanel === 'workspace' }"
                  :aria-selected="sidebarPanel === 'workspace'"
                  data-testid="sidebar-tab-workspace"
                  @click="selectSidebarPanel('workspace')"
                >
                  {{ appText.sidebarTabWorkspace }}
                </button>
                <button
                  type="button"
                  role="tab"
                  class="sidebar-tab"
                  :class="{ 'sidebar-tab--active': sidebarPanel === 'cloud' }"
                  :aria-selected="sidebarPanel === 'cloud'"
                  data-testid="sidebar-tab-cloud"
                  @click="selectSidebarPanel('cloud')"
                >
                  {{ appText.sidebarTabCloud }}
                </button>
              </div>

              <div
                v-show="sidebarPanel === 'workspace'"
                class="sidebar-panel"
                data-testid="sidebar-panel-workspace"
              >
                <ScratchWorkspaceBanner @written="handleCloudFileSaved" />
                <FileTree
                  ref="fileTreeRef"
                  v-if="workspaceStore.currentWorkspacePath"
                  :file-tree="fileTree"
                  :loading="loading"
                  :selected-path="selectedPath"
                  :workspace-label="workspaceLabel"
                  :can-reveal-current-file="canRevealCurrentFile"
                  :locating-current-file="locatingCurrentFile"
                  :provider-actions="providersStore.fileActions.map((action) => ({ id: action.id, title: action.title }))"
                  @file-open="handleFileOpen"
                  @folder-toggle="handleFolderToggle"
                  @context-menu="handleFileTreeContextMenu"
                  @refresh="handleRefresh"
                  @new-file="handleFileTreeCreateFile"
                  @new-folder="handleFileTreeCreateFolder"
                  @rename="handleFileTreeRename"
                  @details="handleFileTreeDetails"
                  @delete="handleFileTreeDelete"
                  @compare-with-current="handleCompareWithCurrentFile"
                  @run-provider-action="handleProviderFileAction"
                  @reveal-current-file="handleRevealCurrentFile"
                  @copy-current-file-path="handleCopyCurrentFilePath"
                  @reveal-current-file-manager="handleRevealCurrentFileInManager"
                  @sync-to-cloud="handleFileTreeSyncToCloud"
                  @upload-folder="handleFileTreeUploadFolder"
                  @share="handleFileTreeShare"
                  :shared-paths="sharedFilePaths"
                  :synced-paths="syncedBinaryPaths"
                />
                <section v-else class="recent-workspaces" data-testid="recent-workspaces">
                  <h2 class="recent-workspaces-title">{{ appText.recentFolders }}</h2>
                  <p v-if="(workspaceStore.recentProjects ?? []).length === 0" class="recent-workspaces-empty">
                    {{ appText.noRecentFolders }}
                  </p>
                  <button
                    v-for="project in workspaceStore.recentProjects ?? []"
                    :key="project.path"
                    type="button"
                    class="recent-workspace-card"
                    :title="`${appText.openRecentFolder}: ${project.path}`"
                    @click="handleOpenRecentFolder(project.path)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1" />
                      <path d="M3 10h18l-2 8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    </svg>
                    <span class="recent-workspace-card-copy">
                      <strong>{{ project.name }}</strong>
                      <small>{{ project.path }}</small>
                    </span>
                  </button>
                </section>
              </div>

              <div
                v-show="sidebarPanel === 'cloud'"
                class="sidebar-panel"
                data-testid="sidebar-panel-cloud"
              >
                <CloudDocSidebar
                  :active="sidebarPanel === 'cloud'"
                  :refresh-token="cloudTreeRefreshToken"
                  @open-file="handleFileOpen"
                  @edit-cloud-doc="handleCloudDocEditOpen"
                  @login-request="openCloudSyncSettings"
                  @cloud-file-saved="handleCloudFileSaved"
                  @doc-action="handleCloudDocAction"
                />
              </div>
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
        class="floating-sidebar-controls"
        :class="{ 'is-open': showFileTree }"
        :style="{ '--sidebar-toggle-shift': showFileTree ? `${Math.min(Math.max(0, sidebarWidth - 8), Math.max(0, viewportWidth - 50))}px` : '0px' }"
        data-testid="left-bottom-controls"
      >
        <button
          type="button"
          class="floating-action-btn floating-sidebar-action-btn"
          :data-testid="showFileTree ? 'btn-sidebar-collapse' : 'btn-sidebar-expand'"
          :aria-label="showFileTree ? appText.collapseExplorer : appText.expandExplorer"
          aria-controls="sidebar-panel"
          :aria-expanded="showFileTree"
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

      <div
        v-if="settingsContainer !== 'workspace'"
        class="floating-context-controls"
        :class="{ 'is-open': showContextRail }"
        :style="{ '--context-rail-toggle-right': showContextRail ? `${Math.max(21, Math.min(contextRailWidth - 13, Math.max(0, viewportWidth - 30)))}px` : '8px' }"
        data-testid="context-rail-floating-controls"
      >
        <button
          type="button"
          class="floating-action-btn floating-context-action-btn"
          :data-testid="showContextRail ? 'floating-context-rail-collapse' : 'floating-context-rail-expand'"
          :aria-label="showContextRail ? toolbarText.collapseContext : toolbarText.expandContext"
          :title="showContextRail ? toolbarText.collapseContext : toolbarText.expandContext"
          aria-controls="context-rail-shell"
          :aria-expanded="showContextRail"
          @click="showContextRail = !showContextRail"
        >
          <svg v-if="showContextRail" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <polyline points="9,18 15,12 9,6" />
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <polyline points="15,18 9,12 15,6" />
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
          ref="workspaceSettingsPanelRef"
          mode="workspace"
          :active-category="activeSettingsCategory"
          @update:active-category="activeSettingsCategory = $event"
          @update-availability="handleTitlebarUpdateAvailability"
          @open-cloud-browser="openCloudDocBrowser"
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
          @tab-open-in-new-window="handleOpenTabInNewWindow"
          @tab-drop-import="handleImportTabFromAnotherWindow"
          @tab-transfer-complete="handleTransferredTabDropped"
          @rename-tab="handleRenameTab"
          @tabs-reorder="handleTabsReorder"
          @cancel-large-file-load="handleCancelLargeFileLoad"
            @retry-large-file-load="handleRetryLargeFileLoad"
        />

        <EditorBreadcrumbs
          v-if="activeTab && !diffStore.isOpen"
          :segments="editorBreadcrumbSegments"
          :label="settingsStore.uiLanguage === 'en-US' ? 'File path' : '文件路径'"
          :style="{ '--breadcrumb-editor-background': editorBreadcrumbBackground }"
          @navigate="handleBreadcrumbNavigate"
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
            'markdown-stage': isPreviewableTab,
            [`markdown-mode-${markdownPreviewMode}`]: isPreviewableTab,
          }"
        >
          <div v-if="!isImageTab" class="editor-pane">
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
              @editor-blur="handleEditorBlur"
              @cursor-change="handleCursorChange"
              @scroll-change="handleEditorScrollChange"
              @model-save="handleSave"
              @find-references="runFindReferences"
              @sync-to-cloud="handleActiveTabSyncToCloud"
              @share="handleActiveTabShare"
              @markdown-image-request="handleInsertMarkdownImage"
              @markdown-image-paste="handleMarkdownImagePaste"
            />
          </div>
          <ImagePreview
            v-else
            :file-path="activeTab.filePath!"
            :file-name="activeTab.fileName"
            @open="openImageViewer"
          />
          <div
            v-if="isPreviewableTab"
            class="preview-pane"
            data-testid="markdown-preview-pane"
          >
            <MarkdownPreview
              v-if="isMarkdownTab"
              ref="markdownPreviewRef"
              :content="activeTab.content"
              :theme="previewTheme"
              :preview-mode="markdownPreviewMode"
              :preview-font-size="markdownPreviewFontSize"
              :source-file-path="activeTab.filePath"
              :editor-scroll-state="editorScrollState"
              @request-preview-mode-change="setMarkdownPreviewMode"
              @preview-font-size-change="setMarkdownPreviewFontSize"
              @code-language-change="handleMarkdownCodeLanguageChange"
              @markdown-change="handleMarkdownPreviewChange"
              @scroll-sync="handlePreviewScrollSync"
              @active-line="handlePreviewActiveLine"
              @request-undo="handleUndo"
              @request-redo="handleRedo"
              @open-image="openImageViewer"
              @open-file="handleMarkdownOpenFile"
            />
            <DocumentPreview
              v-else
              :file-name="activeTab.fileName"
              :file-path="activeTab.filePath"
              :content="activeTab.content"
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

        <ProblemsPanel
          v-if="problemsPanelVisible"
          :locale="settingsStore.uiLanguage"
          @navigate="handleDiagnosticNavigate"
          @close="problemsPanelVisible = false"
        />

        <CloudDocBrowser
          v-if="cloudBrowserVisible"
          @close="closeCloudDocBrowser"
          @open-file="handleCloudDocBrowserOpenFile"
          @edit-cloud-doc="handleCloudDocEditOpen"
          @cloud-file-saved="handleCloudFileSaved"
          @doc-action="handleCloudDocAction"
        />

        <CenterToast />

        <CloudDocConflictDialog
          :visible="cloudConflict.visible"
          :file-name="cloudConflict.fileName"
          :message="cloudConflict.message"
          :remote-version="cloudConflict.remoteVersion"
          :busy="cloudConflict.busy"
          @close="closeCloudConflict"
          @keep-mine="resolveConflictKeepMine"
          @use-remote="resolveConflictUseRemote"
          @save-copy="resolveConflictSaveCopy"
        />

        <CloudDocSyncDialog
          :visible="cloudSyncDialog.visible"
          :file-path="cloudSyncDialog.filePath"
          :file-name="cloudSyncDialog.fileName"
          :cloud-file-id="cloudSyncDialog.cloudFileId"
          :cloud-path="cloudSyncDialog.cloudPath"
          :category="cloudSyncDialog.category"
          :category-id="cloudSyncDialog.categoryId"
          @close="cloudSyncDialog.visible = false"
          @synced="handleCloudDocSynced"
        />

        <CloudFolderUploadDialog
          :visible="folderUploadDialog.visible"
          :folder-name="folderUploadDialog.folderName"
          :folder-path="folderUploadDialog.folderPath"
          @close="folderUploadDialog.visible = false"
          @background="folderUploadDialog.visible = false"
          @started="handleFolderUploadStarted"
          @progress="handleFolderUploadProgress"
          @uploaded="handleFolderUploaded"
        />

        <ShareStatsDialog
          :visible="shareStatsTarget.visible"
          :file-id="shareStatsTarget.fileId"
          :file-name="shareStatsTarget.fileName"
          @close="shareStatsTarget.visible = false"
        />

        <ShareDialog
          :visible="shareDialog.visible"
          :file-path="shareDialog.filePath"
          :file-name="shareDialog.fileName"
          @close="shareDialog.visible = false"
          @shared="handleShareStateChanged"
          @open-stats="handleOpenShareStats"
        />

        <ReferenceResultsPanel
          v-if="referencePanelVisible"
          :locale="settingsStore.uiLanguage"
          :loading="referencePanelLoading"
          :groups="referenceGroups"
          :error="referencePanelError"
          @navigate="handleReferenceNavigate"
          @cancel="handleCancelReferences"
          @close="referencePanelVisible = false"
        />

        <HierarchyPanel
          v-if="hierarchyPanelVisible"
          :locale="settingsStore.uiLanguage"
          :mode="hierarchyPanelMode"
          :loading="hierarchyPanelLoading"
          :root="hierarchyRoot"
          :rows="hierarchyRows"
          :error="hierarchyPanelError"
          @navigate="handleHierarchyNavigate"
          @cancel="handleCancelHierarchy"
          @close="hierarchyPanelVisible = false"
        />
      </section>

      <transition name="context-rail-shell">
        <div
          v-if="showContextRail && settingsContainer !== 'workspace'"
          class="context-rail-shell"
          :class="{ resizing: isResizingContextRail }"
          :style="{ '--context-rail-width': `${contextRailWidth}px` }"
          id="context-rail-shell"
          data-testid="context-rail-shell"
        >
          <div
            class="context-rail-resizer"
            data-testid="context-rail-resizer"
            :class="{ dragging: isResizingContextRail }"
            @mousedown.prevent="startContextRailResize"
          ></div>
          <div class="context-rail-content animate__animated animate__fadeInRight animate__faster">
            <ContextRail
              :outline="documentOutline"
              :active-line="activeOutlineLine"
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
        </div>
      </transition>

      <transition name="settings-drawer">
        <aside
          v-if="settingsContainer === 'drawer'"
          class="settings-drawer"
          data-testid="settings-drawer"
        >
          <div class="settings-drawer-surface animate__animated animate__fadeInRight animate__faster">
            <SettingsPanel
              mode="drawer"
              :active-category="activeSettingsCategory"
              @update:active-category="activeSettingsCategory = $event"
              @open-workspace="toggleSettingsContainer('workspace')"
              @open-cloud-browser="openCloudDocBrowser"
              @close="closeTransientPanels"
            />
          </div>
        </aside>
      </transition>
    </div>

    <!-- 状态栏容器：上传在后台跑时，在状态栏左上方浮出一个可点回弹窗的进度徽标 -->
    <div class="app-status-bar">
      <button
        v-if="folderUploadRunning"
        type="button"
        class="app-status-bar__upload"
        data-testid="cloud-folder-upload-indicator"
        :title="fileTreeCopy.uploadBackgroundHint"
        @click="reopenFolderUploadDialog"
      >
        <span class="app-status-bar__upload-dot" aria-hidden="true"></span>
        {{ fileTreeCopy.uploadRunningBadge(folderUploadProgress.done, folderUploadProgress.total) }}
      </button>
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

  </div>
</template>

<style>
:root {
  --font-ui: 'Manrope Variable', 'Avenir Next', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Segoe UI', sans-serif;
  --font-code: 'JetBrains Mono Variable', 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
  --panel-radius: var(--radius-panel, var(--radius-ui, 0px));
  --panel-gap: 8px;
  /* Compatibility aliases shared by the older component styles. */
  --app-bg: var(--bg-app);
  --panel: var(--panel-base);
  --surface-raised: var(--panel-elevated);
  --accent-blue: var(--accent-brand);
  --accent-blue-strong: var(--accent-brand-strong);
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
    radial-gradient(circle at top left, color-mix(in srgb, var(--accent-brand) 18%, transparent), transparent 28%),
    radial-gradient(circle at top right, color-mix(in srgb, var(--accent-brand-strong) 12%, transparent), transparent 24%),
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

/* 状态栏容器：包一层只为在状态栏上浮出「云上传 24/460」徽标，不改 StatusBar 组件签名 */
.app-status-bar {
  position: relative;
  z-index: 20;
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
}

.app-status-bar__upload {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 12px;
  z-index: 21;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 0 10px;
  font-family: inherit;
  font-size: var(--font-size-ui-xs, 11px);
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
  background: var(--panel-elevated, #111827);
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.28));
  border-radius: var(--radius-sm, 6px);
  box-shadow: 0 6px 18px rgba(2, 6, 23, 0.32);
}

.app-status-bar__upload:hover {
  color: var(--text-primary, #f8fafc);
  border-color: var(--accent-blue, #7cc7ff);
}

.app-status-bar__upload:focus-visible {
  outline: 2px solid var(--accent-blue, #7cc7ff);
  outline-offset: 2px;
}

/* 呼吸点：暗示队列仍在跑 */
.app-status-bar__upload-dot {
  width: 6px;
  height: 6px;
  background: var(--accent-blue, #7cc7ff);
  border-radius: 50%;
  animation: app-upload-pulse 1.4s ease-in-out infinite;
}

@keyframes app-upload-pulse {
  0%,
  100% {
    opacity: 0.35;
  }

  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-status-bar__upload-dot {
    animation: none;
    opacity: 1;
  }
}

.app-native-titlebar {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 0 0 38px;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  padding: 0 12px;
  border-bottom: 1px solid var(--border-soft, rgba(148, 163, 184, .14));
  background: color-mix(in srgb, var(--panel-elevated, var(--panel-base)) 92%, transparent);
  user-select: none;
}

.app-native-titlebar--mac {
  padding-left: 82px;
}

.native-titlebar-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 3px;
  -webkit-app-region: no-drag;
}

.native-titlebar-drag-region {
  flex: 1 1 auto;
  min-width: 24px;
  height: 100%;
}

.native-titlebar-actions-end {
  margin-left: auto;
  justify-content: flex-end;
}

.native-titlebar-update-wrap {
  position: relative;
  display: flex;
  align-items: center;
  -webkit-app-region: no-drag;
}

.native-titlebar-update {
  display: grid;
  width: 32px;
  height: 28px;
  place-items: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-ui-sm, var(--radius-sm, 4px));
  background: transparent;
  color: var(--accent-brand-strong, var(--accent-brand, #4dabff));
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
  -webkit-app-region: no-drag;
}

.native-titlebar-update:hover {
  border-color: color-mix(in srgb, var(--accent-brand) 38%, transparent);
  background: color-mix(in srgb, var(--accent-brand) 16%, var(--panel-base));
  color: var(--accent-brand, #4dabff);
}

.native-titlebar-update:focus-visible,
.native-titlebar-update-wrap:focus-within .native-titlebar-update {
  outline: 1px solid var(--focus-ring, var(--accent-brand-strong, #4dabff));
  outline-offset: 1px;
}

.native-titlebar-update svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.native-titlebar-update-tooltip {
  position: absolute;
  top: calc(100% + 8px);
  right: -8px;
  z-index: 50;
  display: flex;
  width: min(320px, calc(100vw - 24px));
  max-height: 220px;
  flex-direction: column;
  gap: 5px;
  padding: 10px 12px;
  overflow: auto;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, .2));
  border-radius: var(--radius-ui-md, var(--radius-md, 8px));
  background: var(--panel-elevated, var(--panel-base));
  color: var(--text-secondary, #b6c2d9);
  box-shadow: var(--shadow-overlay, 0 8px 24px rgba(0, 0, 0, .24));
  font-size: 11px;
  line-height: 1.45;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-4px);
  transition: opacity 140ms ease, transform 140ms ease, visibility 140ms ease;
  visibility: hidden;
  -webkit-app-region: no-drag;
}

.native-titlebar-update-tooltip strong {
  color: var(--text-primary, #ecf2ff);
  font-size: 12px;
  font-weight: 650;
}

.native-titlebar-update-notes {
  display: -webkit-box;
  overflow: hidden;
  color: var(--text-secondary, #b6c2d9);
  white-space: pre-line;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
}

.native-titlebar-update-unavailable {
  color: var(--text-muted, #75829e);
}

.native-titlebar-update-wrap:hover .native-titlebar-update-tooltip,
.native-titlebar-update-wrap:focus-within .native-titlebar-update-tooltip {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
  visibility: visible;
}

.native-titlebar-progress {
  display: flex;
  width: 225px;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary, #b6c2d9);
  font-size: 10px;
  -webkit-app-region: no-drag;
}

.native-titlebar-progress-label {
  flex: 0 0 auto;
  max-width: 84px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.native-titlebar-progress-track {
  position: relative;
  flex: 1 1 auto;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-muted, #75829e) 26%, transparent);
}

.native-titlebar-progress-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent-brand, #4dabff);
  transition: width 140ms linear;
}

.native-titlebar-progress-fill.is-indeterminate {
  width: 38%;
  animation: titlebar-update-indeterminate 1.1s ease-in-out infinite alternate;
}

.native-titlebar-progress-percent {
  min-width: 30px;
  color: var(--text-primary, #ecf2ff);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

@keyframes titlebar-update-indeterminate {
  from { transform: translateX(-30%); }
  to { transform: translateX(190%); }
}

.native-titlebar-button {
  display: grid;
  width: 30px;
  height: 28px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-ui-sm, var(--radius-sm, 4px));
  background: transparent;
  color: var(--text-secondary, #b6c2d9);
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
  -webkit-app-region: no-drag;
}

.native-titlebar-button:hover:not(:disabled) {
  background: var(--surface-hover, rgba(255, 255, 255, .08));
  color: var(--text-primary, #ecf2ff);
}

.native-titlebar-button:disabled {
  color: var(--text-muted, #75829e);
  cursor: default;
  opacity: .48;
}

.native-titlebar-button:focus-visible {
  outline: 1px solid var(--focus-ring, var(--accent-brand-strong, #4dabff));
  outline-offset: -1px;
}

.native-titlebar-button svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.native-titlebar-divider {
  width: 1px;
  height: 16px;
  margin: 0 3px;
  background: var(--border-soft, rgba(148, 163, 184, .2));
}

.name-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(8, 8, 12, 0.58);
}

.name-dialog {
  width: min(420px, 100%);
  padding: 20px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg, 12px);
  background: var(--panel-elevated);
  box-shadow: var(--shadow-overlay);
}

.name-dialog-title {
  margin: 0 0 14px;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
}

.name-dialog-input {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm, 6px);
  outline: none;
  background: var(--panel-base);
  color: var(--text-primary);
}

.name-dialog-input:focus {
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-blue) 24%, transparent);
}

.name-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.name-dialog-button {
  padding: 7px 14px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm, 6px);
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}

.name-dialog-button.primary {
  border-color: var(--accent-blue);
  background: var(--accent-blue);
  color: #fff;
}

.file-details-dialog {
  width: min(620px, calc(100vw - 32px));
}

.file-details-list {
  display: grid;
  gap: 10px;
  margin: 0;
}

.file-details-list > div {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.file-details-list dt {
  color: var(--text-secondary, #a8b3bd);
  font-size: 12px;
}

.file-details-list dd {
  min-width: 0;
  margin: 0;
  color: var(--text-primary, #f8fafc);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.file-details-path {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
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
  flex-basis: calc(var(--sidebar-width) + 10px);
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
  border-radius: var(--radius-panel, var(--panel-radius));
  background: color-mix(in srgb, var(--panel-base) 58%, transparent);
  backdrop-filter: blur(16px) saturate(120%);
  box-shadow: var(--shadow-soft);
  transition: background-color .22s ease, border-color .22s ease, box-shadow .22s ease;
}

.context-rail-shell :deep(.context-rail) {
  background: color-mix(in srgb, var(--panel-base) 58%, transparent);
  backdrop-filter: blur(12px) saturate(115%);
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
  border-radius: var(--radius-panel, var(--panel-radius));
  background: color-mix(in srgb, var(--panel-base) 82%, transparent);
  backdrop-filter: blur(14px);
  min-height: 0;
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-soft);
  transition: background-color .22s ease, color .22s ease, border-color .22s ease, box-shadow .22s ease;
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
  border-radius: var(--radius-dialog, var(--panel-radius));
  background: var(--panel-overlay, var(--panel-base));
  box-shadow: var(--shadow-overlay);
  z-index: var(--z-drawer, 50);
}

.shell-overlay {
  position: absolute;
  inset: var(--panel-gap);
  border-radius: 0;
  background: color-mix(in srgb, var(--bg-app) 48%, transparent);
  backdrop-filter: blur(4px);
  z-index: calc(var(--z-drawer, 50) - 1);
}

.editor-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--panel-base) 88%, transparent);
}

.editor-panel :deep(.editor-tabs) {
  border-bottom: 0;
  background: var(--panel-base, var(--panel, #131b2c));
}

.settings-page {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-app);
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
    flex-basis 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

.sidebar-shell-enter-from,
.sidebar-shell-leave-to {
  width: 0;
  flex-basis: 0;
}

/* Keep the transition target authoritative inside responsive drawer overrides. */
.sidebar-shell.sidebar-shell-enter-from,
.sidebar-shell.sidebar-shell-leave-to {
  width: 0;
  flex-basis: 0;
}

.sidebar-content {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  opacity: 1;
  transform: translate3d(0, 0, 0);
  transform-origin: left center;
  transition:
    opacity 0.2s ease,
    transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: opacity, transform;
}

/* 侧栏顶部面板切换：工作区 / 云端文档（互斥占满整块高度） */
.sidebar-tabs {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  padding: 6px 8px 4px;
}

.sidebar-tab {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  overflow: hidden;
  font-size: 11.5px;
  color: var(--text-secondary, #a8b3c5);
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  border: 1px solid transparent;
  border-radius: var(--radius-control, 5px);
}

.sidebar-tab:hover {
  color: var(--text-primary, #e5e9f0);
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
}

.sidebar-tab--active {
  font-weight: 600;
  color: var(--text-primary, #e5e9f0);
  background: var(--surface-active, rgba(124, 199, 255, 0.14));
  border-color: var(--border-soft, rgba(148, 163, 184, 0.24));
}

.sidebar-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.recent-workspaces {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  overflow: auto;
  padding: 18px 12px;
  color: var(--text-primary);
}

.recent-workspaces-title {
  margin: 0 0 4px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.recent-workspaces-empty {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.recent-workspace-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.2));
  border-radius: 8px;
  background: var(--bg-secondary, transparent);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.recent-workspace-card:hover {
  background: var(--bg-hover, rgba(128, 128, 128, 0.12));
}

.recent-workspace-card > svg {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
}

.recent-workspace-card-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 3px;
}

.recent-workspace-card-copy strong,
.recent-workspace-card-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-workspace-card-copy strong {
  font-size: 12px;
  font-weight: 500;
}

.recent-workspace-card-copy small {
  color: var(--text-secondary);
  font-size: 10px;
}

.context-rail-content,
.settings-drawer-surface {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  --animate-duration: 280ms;
}

.settings-drawer-surface {
  display: flex;
  flex-direction: column;
}

.sidebar-shell-enter-active .sidebar-content,
.sidebar-shell-leave-active .sidebar-content {
  pointer-events: none;
}

.sidebar-shell-enter-from .sidebar-content,
.sidebar-shell-leave-to .sidebar-content {
  opacity: 0;
  transform: translate3d(-12px, 0, 0);
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

.floating-sidebar-controls {
  position: absolute;
  top: 50%;
  left: 7px;
  z-index: calc(var(--z-drawer, 50) + 2);
  transform: translate3d(var(--sidebar-toggle-shift, 0px), -50%, 0);
  display: flex;
  flex-direction: column;
  pointer-events: none;
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
}

.floating-action-btn {
  width: 30px;
  min-width: 30px;
  height: 58px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--border-soft) 76%, transparent);
  background: color-mix(in srgb, var(--panel-overlay) 76%, transparent);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 22px rgba(2, 8, 23, 0.2);
  transition: width .18s ease, background-color .18s ease, border-color .18s ease, box-shadow .18s ease;
}

.floating-action-btn:hover {
  border-color: color-mix(in srgb, var(--accent-blue) 68%, var(--border-soft));
  color: var(--text-primary);
  background: color-mix(in srgb, var(--accent-blue) 22%, var(--panel-overlay));
  box-shadow: 0 8px 24px rgba(56, 189, 248, 0.22);
}

.floating-action-btn:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--accent-blue) 68%, var(--border-soft));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-blue) 24%, transparent), 0 8px 24px rgba(56, 189, 248, 0.22);
}

.floating-sidebar-action-btn {
  pointer-events: auto;
}

.floating-sidebar-controls.is-open .floating-sidebar-action-btn {
  border-left-color: transparent;
  border-radius: 0 999px 999px 0;
}

.floating-context-controls {
  position: absolute;
  top: 50%;
  right: max(8px, min(var(--context-rail-toggle-right, 8px), calc(100vw - 30px)));
  z-index: calc(var(--z-drawer, 50) + 2);
  transform: translateY(-50%);
  pointer-events: none;
}

.floating-context-action-btn {
  width: 26px;
  min-width: 26px;
  height: 56px;
  padding: 0;
  pointer-events: auto;
  border-radius: 999px;
  border-color: color-mix(in srgb, var(--border-soft) 76%, transparent);
  background: color-mix(in srgb, var(--panel-overlay) 88%, transparent);
  box-shadow: 0 8px 22px rgba(2, 8, 23, 0.2);
  backdrop-filter: blur(10px);
  transition: width 0.18s ease, background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.floating-context-controls.is-open .floating-context-action-btn {
  border-right-color: transparent;
  border-radius: 999px 0 0 999px;
}

.floating-context-action-btn:hover,
.floating-context-action-btn:focus-visible {
  width: 30px;
  border-color: color-mix(in srgb, var(--accent-blue) 68%, var(--border-soft));
  background: color-mix(in srgb, var(--accent-blue) 22%, var(--panel-overlay));
  box-shadow: 0 8px 24px rgba(56, 189, 248, 0.22);
  outline: none;
}

@media (max-width: 799px) {
  .floating-context-controls {
    right: max(8px, min(var(--context-rail-toggle-right, 8px), calc(100vw - 34px)));
  }

  .floating-context-action-btn {
    width: 30px;
    min-width: 30px;
    height: 60px;
  }
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
  font-size: var(--font-size-ui-sm, 12px);
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
  font-size: var(--font-size-ui-lg, 15px);
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
  font-size: var(--font-size-ui-sm, 12px);
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

@media (max-width: 799px) {
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
    flex-basis: var(--sidebar-width);
  }

  .sidebar,
  .editor-panel,
  .settings-page,
  .context-rail-shell {
    border: 0;
    border-radius: 0;
    box-shadow: none;
    background: color-mix(in srgb, var(--panel-base) 62%, transparent);
    backdrop-filter: blur(16px) saturate(120%);
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

/* Desktop workbench: keep panels edge-to-edge once there is enough room for
   the persistent explorer. The intermediate 1024px layout previously kept
   the mobile card gutters, leaving visible strips around the editor and
   sidebar in normal desktop windows. */
@media (min-width: 800px) {
  .main-layout {
    --panel-gap: 0px;
    gap: 0;
    padding: 0;
  }

  .sidebar-shell {
    width: var(--sidebar-width);
    flex-basis: var(--sidebar-width);
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
    flex-basis: var(--sidebar-width);
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
    flex-basis: min(var(--sidebar-width), 100vw);
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

@media (prefers-reduced-motion: reduce) {
  .sidebar-shell-enter-active,
  .sidebar-shell-leave-active,
  .sidebar-shell .sidebar,
  .sidebar-content,
  .context-rail-content,
  .settings-drawer-surface,
  .floating-sidebar-controls {
    transition-duration: 0.01ms !important;
    animation: none !important;
  }

  .sidebar-content.animate__animated,
  .context-rail-content.animate__animated,
  .settings-drawer-surface.animate__animated {
    animation: none !important;
  }

  .sidebar-shell-enter-from .sidebar-content,
  .sidebar-shell-leave-to .sidebar-content {
    transform: none;
  }
}
</style>
