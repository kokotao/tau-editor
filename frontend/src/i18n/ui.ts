export type UiLanguage = 'zh-CN' | 'en-US';
export type CommandCategory = 'file' | 'view' | 'workspace' | 'search';
export type MonacoThemeValue = 'vs' | 'vs-dark' | 'hc-black';
export type EditorEncoding =
  | 'utf-8'
  | 'utf-16le'
  | 'utf-16be'
  | 'gbk'
  | 'gb18030'
  | 'big5'
  | 'shift_jis'
  | 'iso-8859-1';
export type EditorLanguageMode =
  | 'plaintext'
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'java'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'go'
  | 'rust'
  | 'html'
  | 'css'
  | 'scss'
  | 'json'
  | 'xml'
  | 'markdown'
  | 'yaml'
  | 'sql'
  | 'shell';
export type CommandId =
  | 'commandPalette.open'
  | 'file.new'
  | 'file.open'
  | 'file.openFolder'
  | 'file.save'
  | 'file.saveAs'
  | 'diff.compareWithFile'
  | 'window.openInNewWindow'
  | 'window.moveToNewWindow'
  | 'search.findText'
  | 'search.goToLine'
  | 'editor.goToDefinition'
  | 'editor.goToDeclaration'
  | 'editor.goToTypeDefinition'
  | 'editor.goToImplementation'
  | 'editor.peekDefinition'
  | 'editor.peekReferences'
  | 'editor.callHierarchy'
  | 'editor.typeHierarchy'
  | 'editor.findReferences'
  | 'editor.renameSymbol'
  | 'editor.toggleProblems'
  | 'editor.goBack'
  | 'editor.goForward'
  | 'workspace.searchSymbols'
  | 'view.toggleSidebar'
  | 'view.toggleSettings'
  | 'cloud.login'
  | 'cloud.logout'
  | 'cloud.syncNow'
  | 'cloud.browse';

interface CommandText {
  title: string;
  keywords: string[];
}

interface CommandPaletteText {
  placeholder: string;
  empty: string;
  categoryLabels: Record<CommandCategory, string>;
}

interface AuthorInfoText {
  entry: string;
  modalTitle: string;
  nameLabel: string;
  emailLabel: string;
  githubLabel: string;
  qqGroupLabel: string;
  donationTitle: string;
  donationDesc: string;
  wechatLabel: string;
  alipayLabel: string;
  donationTip: string;
}

interface SettingsPanelText {
  title: string;
  quickSettingsTitle: string;
  quickSettingsDesc: string;
  openFullSettings: string;
  settingsGeneral: string;
  themeMarketplace: string;
  settingsEditor: string;
  settingsUpdates: string;
  settingsAbout: string;
  fileAssociations: string;
  fileAssociationsLoading: string;
  fileAssociationsOn: string;
  fileAssociationsOff: string;
  fileAssociationsScriptHint: string;
  fileAssociationsPlatformHint: string;
  fileAssociationsGroupText: string;
  fileAssociationsGroupMarkdown: string;
  fileAssociationsGroupJson: string;
  fileAssociationsGroupYaml: string;
  fileAssociationsGroupToml: string;
  fileAssociationsGroupCode: string;
  fileAssociationsGroupScript: string;
  fileAssociationsApplyHint: string;
  close: string;
  appearance: string;
  language: string;
  languageZh: string;
  languageEn: string;
  themeMode: string;
  themeStyle: string;
  themeLight: string;
  themeDark: string;
  themeSystem: string;
  themeCurrent: string;
  themeStyleMore: string;
  themeJsonExamples: string;
  themeJsonExamplesDesc: string;
  themeJsonThemeExample: string;
  themeJsonPaletteExample: string;
  themeJsonCopy: string;
  themeJsonCopied: string;
  customTheme: string;
  customThemeDesc: string;
  customThemeImportPlaceholder: string;
  customThemeImport: string;
  customThemeExport: string;
  customThemeReset: string;
  customThemeExported: string;
  customThemeImported: (count: number) => string;
  customThemeImportFailed: string;
  themePackages: string;
  themePackagesDesc: string;
  themePackageImport: string;
  themePackageExport: string;
  themePackageExportCurrent: string;
  themePackageApply: string;
  themePackageActive: string;
  themePackageDelete: string;
  themePackageEmpty: string;
  themePackageImportPlaceholder: string;
  themePackagePasteImport: string;
  themePackageImported: (name: string) => string;
  themePackageImportFailed: (reason: string) => string;
  themePackageExported: string;
  themePackageDeleted: string;
  themePackageReverted: string;
  themeUiAppearance: string;
  themeUiAppearanceDesc: string;
  themeUiSidebarBg: string;
  themeUiSidebarText: string;
  themeUiSidebarActiveBg: string;
  themeUiSidebarActiveText: string;
  themeUiSidebarIndicator: string;
  themeUiPanelBg: string;
  themeUiPanelRaised: string;
  themeUiPanelBorder: string;
  themeUiTabsActiveBg: string;
  themeUiTabsActiveText: string;
  themeUiTabsIndicator: string;
  themeUiTabsHover: string;
  cornerRadius: string;
  cornerRadiusSharp: string;
  cornerRadiusCompact: string;
  cornerRadiusStandard: string;
  cornerRadiusSoft: string;
  cornerRadiusRound: string;
  themeSourceTitle: string;
  themeSourceLoading: string;
  themeSourceRetry: string;
  themeSourceCopy: string;
  keybindings: string;
  keybindingsDesc: string;
  keybindingRecording: string;
  keybindingUnbound: string;
  keybindingsResetAll: string;
  keybindingConflict: string;
  keybindingCancelled: string;
  providers: string;
  providersDesc: string;
  providerThemes: string;
  providerCommands: string;
  providerFileActions: string;
  customColorBgApp: string;
  customColorPanelBase: string;
  customColorTextPrimary: string;
  customColorTextSecondary: string;
  customColorAccentBrand: string;
  customColorAccentBrandStrong: string;
  customColorSuccess: string;
  customColorDanger: string;
  editorTheme: string;
  recommended: string;
  font: string;
  fontSize: string;
  reset: string;
  fontFamily: string;
  uiFont: string;
  uiFontSize: string;
  uiFontFamily: string;
  systemUiFont: string;
  systemMonospace: string;
  preview: string;
  fontPreviewLine1: string;
  fontPreviewLine2: string;
  editor: string;
  markdownPreviewTheme: string;
  markdownPreviewThemeDocsClean: string;
  markdownPreviewThemePaperSoft: string;
  markdownPreviewThemeEditorialWarm: string;
  markdownPreviewThemeGraphiteNight: string;
  markdownPreviewThemeMintGrove: string;
  markdownPreviewThemeLavenderLetter: string;
  markdownPreviewThemeDeepOcean: string;
  markdownMermaidTheme: string;
  markdownMermaidThemeAuto: string;
  markdownMermaidThemeDefault: string;
  markdownMermaidThemeDark: string;
  markdownMermaidThemeForest: string;
  markdownMermaidThemeNeutral: string;
  markdownMermaidThemeAurora: string;
  markdownMermaidThemeSunset: string;
  markdownMermaidThemeLavender: string;
  markdownMermaidThemeMono: string;
  markdownMermaidNodeColor: string;
  markdownMermaidNodeColorHint: string;
  markdownMermaidNodeColorReset: string;
  autoSave: string;
  autoSaveEnabled: string;
  autoSaveStatusEnabled: string;
  autoSaveStatusDisabled: string;
  autoSaveInterval: string;
  seconds10: string;
  seconds30: string;
  minute1: string;
  minutes5: string;
  maxOpenTabs: string;
  maxOpenTabsHint: string;
  memoryLimitMB: string;
  memoryLimitHint: string;
  indent: string;
  spaces2: string;
  spaces4: string;
  spaces8: string;
  minimap: string;
  minimapEnabled: string;
  wordWrap: string;
  wordWrapEnabled: string;
  softwareUpdate: string;
  currentVersion: string;
  latestVersion: string;
  deviceInfo: string;
  releaseDate: string;
  packageName: string;
  releaseNotes: string;
  checkForUpdates: string;
  checkingForUpdates: string;
  installUpdate: string;
  installingUpdate: string;
  openReleasePage: string;
  statusIdle: string;
  statusChecking: string;
  statusUpToDate: string;
  statusUpdateAvailable: (version: string) => string;
  statusNoMatchedAsset: string;
  statusInstalling: string;
  statusInstallTriggered: string;
  statusErrorPrefix: string;
  settingsCloudSync: string;
  cloudSyncDesc: string;
  cloudSyncServerUrl: string;
  cloudSyncUsername: string;
  cloudSyncPassword: string;
  cloudSyncLogin: string;
  cloudSyncLoggingIn: string;
  cloudSyncLogout: string;
  cloudSyncSignedOut: string;
  cloudSyncSignedInAs: (username: string) => string;
  cloudSyncLoginRequired: string;
  cloudSyncRegisterHint: string;
  cloudSyncRegisterAction: string;
  cloudSyncQuotaLabel: string;
  cloudSyncQuotaReading: string;
  cloudSyncQuotaFailed: (kind: string, message: string) => string;
  cloudSyncSyncNow: string;
  cloudSyncSyncing: string;
  cloudSyncResultSynced: (version?: number) => string;
  cloudSyncResultConflict: string;
  /** 云文档在线编辑：409 冲突通知（标题） */
  cloudDocSaveConflictTitle: string;
  /** 云文档在线编辑：409 冲突通知（正文，附服务端原因） */
  cloudDocSaveConflictBody: (message: string) => string;
  cloudSyncResultFailed: (message: string) => string;
  cloudSyncResultSkipped: (reason: string) => string;
  cloudSyncAutoLabel: string;
  cloudSyncAutoUnavailable: string;
  cloudSyncDebounceLabel: string;
  cloudSyncQueueEmpty: string;
  cloudSyncQueueStatus: (pending: number, failed: number) => string;
  cloudSyncRetryQueue: string;
  cloudSyncVersions: string;
  cloudSyncVersionsLoading: string;
  cloudSyncVersionsEmpty: string;
  cloudSyncVersionLabel: (version: number) => string;
  cloudSyncVersionRestore: string;
  cloudSyncVersionRestored: (version: number) => string;
  cloudSyncVersionHint: string;
  cloudSyncConflictTitle: string;
  cloudSyncConflictHint: string;
  cloudSyncKeepLocal: string;
  cloudSyncKeepRemote: string;
  cloudSyncKeepLocalDone: (version?: number) => string;
  cloudSyncKeepRemoteDone: (version?: number) => string;
  cloudSyncPull: string;
  cloudSyncBrowse: string;
  cloudSyncImagesLabel: string;
  cloudSyncImagesHint: string;
  cloudSyncPulling: string;
  cloudSyncPullConfirmTitle: string;
  cloudSyncPullConfirmHint: string;
  cloudSyncPullConfirmOk: string;
  cloudSyncPullConfirmCancel: string;
  cloudSyncPullCancelled: string;
  cloudSyncMetaTitle: string;
  cloudSyncMetaHint: string;
  cloudSyncMetaFirstSyncHint: string;
  cloudSyncMetaLoading: string;
  cloudSyncMetaCategory: string;
  cloudSyncMetaCategoryNone: string;
  cloudSyncMetaCategoryPlaceholder: string;
  cloudSyncMetaCategoriesFailed: string;
  cloudSyncMetaTags: string;
  cloudSyncMetaTagsPlaceholder: string;
  cloudSyncMetaVisibilityPublic: string;
  cloudSyncMetaVisibilityPrivate: string;
  cloudSyncMetaSave: string;
  cloudSyncMetaSaving: string;
  cloudSyncMetaSaved: (version?: number) => string;
}

interface AppText {
  appLabel: string;
  workspaceNotOpen: string;
  fileNotOpen: string;
  undoTitle: string;
  undoHint: string;
  redoTitle: string;
  redoHint: string;
  commandExecFail: string;
  unknownCommand: string;
  collapseExplorer: string;
  expandExplorer: string;
  openFolder: string;
  openFile: string;
  newFile: string;
  recentFolders: string;
  sidebarTabWorkspace: string;
  sidebarTabCloud: string;
  noRecentFolders: string;
  openRecentFolder: string;
  /** 冷启动发现上次的临时工作区已被系统清理 */
  scratchWorkspaceClearedTitle: string;
  scratchWorkspaceClearedMessage: (path: string) => string;
}

interface ToolbarText {
  newFile: string;
  openFile: string;
  openFolder: string;
  save: string;
  saveAs: string;
  goBack: string;
  goForward: string;
  quickOpen: string;
  commandPalette: string;
  collapseExplorer: string;
  expandExplorer: string;
  collapseContext: string;
  expandContext: string;
  undo: string;
  redo: string;
  locateCurrentFile: string;
  markdownViewPrefix: string;
  dirtyTip: string;
  dirtyShort: string;
  savedTip: string;
  savedShort: string;
  settings: string;
  previewModeLabels: Record<'edit' | 'split' | 'preview', string>;
}

interface EditorTabsText {
  tabsLabel: string;
  unsaved: string;
  saved: string;
  close: string;
  closeOthers: string;
  closeAll: string;
  openInNewWindow: string;
  openInNewWindowFailed: string;
  renameTab: string;
  copyFilePath: string;
  revealInFolder: string;
  noFilePath: string;
  copyPathDone: string;
  copyPathFailed: string;
  revealFailed: string;
  renameHint: string;
  moreActionsHint: string;
  loadingProgress: (progress: number) => string;
  loadingFailed: string;
  loadingCancelled: string;
  cancelLoad: string;
  retryLoad: string;
}

interface FileTreeText {
  workspace: string;
  searchPlaceholder: string;
  searchAriaLabel: string;
  refresh: string;
  quickOps: string;
  quickCreate: string;
  quickOpen: string;
  emptyTitle: string;
  emptyHint: string;
  loading: string;
  newFile: string;
  newFolder: string;
  rename: string;
  delete: string;
  compareWithCurrent: string;
  syncToCloud: string;
  syncToCloudHint: string;
  share: string;
  shareAlready: string;
  shareHint: string;
  alreadySynced: string;
  fileDetails: string;
  locateCurrentFile: string;
  copyCurrentFilePath: string;
  revealCurrentFile: string;
  currentFileUnavailable: string;
}

interface StatusBarText {
  rowCol: (line: number, column: number) => string;
  lineCount: (lineCount: number) => string;
  autoSave: string;
  encoding: string;
  encodingTitle: string;
  encodingOptions: Record<EditorEncoding, string>;
  theme: string;
  editorThemeTitle: string;
  themeOptions: Record<MonacoThemeValue, string>;
  language: string;
  languageModeTitle: string;
  languageOptions: Record<EditorLanguageMode, string>;
  justNow: string;
  minutesAgo: (minutes: number) => string;
  hoursAgo: (hours: number) => string;
}

interface MarkdownPreviewText {
  copySelection: string;
  copyMarkdown: string;
  codeLanguage: string;
  codeLanguagePlainText: string;
  codeLanguageChanged: (language: string) => string;
  codeLanguageUpdateFailed: string;
  codeHighlightFailed: string;
  copyCode: string;
  copyCodeDone: string;
  copyCodeFailed: string;
  diagramView: string;
  diagramCodeView: string;
  diagramZoomOut: string;
  diagramZoomIn: string;
  diagramZoomLevel: (percent: number) => string;
  diagramDownloadPng: string;
  diagramDownloadPngDone: string;
  diagramDownloadSvg: string;
  diagramDownloadSvgDone: string;
  diagramDownloadFailed: string;
  diagramExportMenu: string;
  diagramCopyImage: string;
  diagramCopyImageDone: string;
  diagramCopySvgTextDone: string;
  diagramCopyImageFailed: string;
  diagramFullscreen: string;
  diagramExitFullscreen: string;
  diagramFullscreenUnavailable: string;
  diagramFullscreenFailed: string;
  refreshPreview: string;
  previewThemeDocsClean: string;
  previewThemePaperSoft: string;
  previewThemeEditorialWarm: string;
  previewThemeGraphiteNight: string;
  previewThemeMintGrove: string;
  previewThemeLavenderLetter: string;
  previewThemeDeepOcean: string;
  setPreviewModeEdit: string;
  setPreviewModeSplit: string;
  setPreviewModePreview: string;
  openLink: string;
  openLinkNewWindow: string;
  copyLink: string;
  openImage: string;
  openImageNewWindow: string;
  copyImageSource: string;
}

interface EditorCoreText {
  contextUndo: string;
  contextRedo: string;
  contextCut: string;
  contextCopy: string;
  contextPaste: string;
  contextFind: string;
  contextReplace: string;
  contextSelectAll: string;
  contextCopyFilePath: string;
  contextRevealInFolder: string;
  contextNoFilePath: string;
  contextCopyPathDone: string;
  contextCopyPathFailed: string;
  contextRevealFailed: string;
  searchPlaceholder: string;
  replacePlaceholder: string;
  searchPrevious: string;
  searchNext: string;
  replaceOne: string;
  replaceAll: string;
  closeSearch: string;
  searchResult: (current: number, total: number) => string;
  searchNoResult: string;
}

const SUPPORTED_LANGUAGES: UiLanguage[] = ['zh-CN', 'en-US'];

const COMMAND_TEXTS: Record<UiLanguage, Record<CommandId, CommandText>> = {
  'zh-CN': {
    'commandPalette.open': {
      title: '打开命令面板',
      keywords: ['命令面板', '命令', '搜索命令', 'palette', 'search'],
    },
    'file.new': {
      title: '新建文件',
      keywords: ['新建', '新文件', '空白文件', 'new', 'untitled'],
    },
    'file.open': {
      title: '打开文件',
      keywords: ['打开', '文件', '选择文件', 'open', 'file'],
    },
    'file.openFolder': {
      title: '打开文件夹',
      keywords: ['打开', '文件夹', '工作区', '目录', 'open', 'folder', 'workspace'],
    },
    'file.save': {
      title: '保存',
      keywords: ['保存', '写入', '存盘', 'save', 'write'],
    },
    'file.saveAs': {
      title: '另存为',
      keywords: ['另存为', '导出', '保存副本', 'save as', 'export'],
    },
    'diff.compareWithFile': {
      title: '比较当前文件与…',
      keywords: ['对比', '比较', 'diff', 'compare', '差异'],
    },
    'window.openInNewWindow': {
      title: '在新窗口打开当前标签',
      keywords: ['新窗口', '多窗口', 'window', 'new window'],
    },
    'window.moveToNewWindow': {
      title: '把当前标签移动到新窗口',
      keywords: ['移动标签', '新窗口', 'move tab', 'window'],
    },
    'search.findText': {
      title: '搜索文本',
      keywords: ['搜索', '查找', '文本', 'find', 'search', 'text'],
    },
    'search.goToLine': {
      title: '跳转到行',
      keywords: ['跳转', '行号', '定位', 'go to line', 'line'],
    },
    'editor.goToDefinition': {
      title: '跳转到定义',
      keywords: ['定义', '声明', '跳转', 'go to definition', 'definition', 'declaration'],
    },
    'editor.goToDeclaration': {
      title: '跳转到声明',
      keywords: ['声明', '跳转', 'go to declaration', 'declaration'],
    },
    'editor.goToTypeDefinition': {
      title: '跳转到类型定义',
      keywords: ['类型定义', '类型', '跳转', 'go to type definition', 'type definition'],
    },
    'editor.goToImplementation': {
      title: '跳转到实现',
      keywords: ['实现', '跳转', 'go to implementation', 'implementation'],
    },
      'editor.peekDefinition': {
      title: '查看定义',
      keywords: ['查看定义', '预览定义', 'peek definition', 'definition'],
      },
      'editor.peekReferences': {
        title: '查看引用',
        keywords: ['查看引用', 'Peek References', 'references', 'usages'],
      },
    'editor.callHierarchy': {
      title: '查看调用层级',
      keywords: ['调用层级', '谁调用', '调用方', 'call hierarchy', 'incoming calls', 'outgoing calls'],
    },
    'editor.typeHierarchy': {
      title: '查看类型层级',
      keywords: ['类型层级', '父类', '子类', 'type hierarchy', 'supertypes', 'subtypes'],
    },
    'editor.findReferences': {
      title: '查找所有引用',
      keywords: ['引用', '查找引用', 'references', 'find references', 'usages'],
    },
    'editor.renameSymbol': {
      title: '重命名符号',
      keywords: ['重命名', '符号', 'rename', 'symbol'],
    },
    'editor.toggleProblems': {
      title: '切换问题面板',
      keywords: ['问题', '诊断', '错误', '警告', 'problems', 'diagnostics'],
    },
    'editor.goBack': {
      title: '返回上一个导航位置',
      keywords: ['返回', '后退', '导航历史', 'go back', 'back'],
    },
    'editor.goForward': {
      title: '前进到下一个导航位置',
      keywords: ['前进', '导航历史', 'go forward', 'forward'],
    },
    'workspace.searchSymbols': {
      title: '搜索工作区符号',
      keywords: ['工作区符号', '全局符号', '类', '方法', 'symbol', 'workspace symbol'],
    },
    'view.toggleSidebar': {
      title: '切换资源管理器',
      keywords: ['资源管理器', '侧边栏', '文件树', '面板', 'sidebar', 'explorer', 'drawer', 'split', 'panel'],
    },
    'view.toggleSettings': {
      title: '切换设置工作区',
      keywords: ['设置', '偏好', '配置', '工作区', 'settings', 'preferences', 'workspace'],
    },
    'cloud.login': {
      title: '登录 lizi 云账号',
      keywords: ['登录', '账号', '云同步', '云文档', 'lizi', 'cloud', 'login', 'sign in'],
    },
    'cloud.logout': {
      title: '退出 lizi 云账号',
      keywords: ['退出', '登出', '注销', '云同步', 'lizi', 'cloud', 'logout', 'sign out'],
    },
    'cloud.syncNow': {
      title: '同步当前文档到云端',
      keywords: ['同步', '上传', '云文档', 'sync', 'upload', 'cloud'],
    },
    'cloud.browse': {
      title: '浏览云端文档',
      keywords: ['云文档', '浏览', '打开', '云端', 'cloud', 'browse', 'open'],
    },
  },
  'en-US': {
    'commandPalette.open': {
      title: 'Open Command Palette',
      keywords: ['command', 'palette', 'search', '命令面板', '命令'],
    },
    'file.new': {
      title: 'New File',
      keywords: ['new', 'untitled', '新建', '新文件'],
    },
    'file.open': {
      title: 'Open File',
      keywords: ['open', 'file', '打开', '文件'],
    },
    'file.openFolder': {
      title: 'Open Folder',
      keywords: ['open', 'folder', 'workspace', '打开', '文件夹', '工作区'],
    },
    'file.save': {
      title: 'Save',
      keywords: ['save', 'write', '保存', '写入'],
    },
    'file.saveAs': {
      title: 'Save As',
      keywords: ['save as', 'export', '另存为', '导出'],
    },
    'diff.compareWithFile': {
      title: 'Compare Current File With…',
      keywords: ['diff', 'compare', 'difference', '对比', '比较'],
    },
    'window.openInNewWindow': {
      title: 'Open Current Tab in New Window',
      keywords: ['new window', 'window', '新窗口'],
    },
    'window.moveToNewWindow': {
      title: 'Move Current Tab to New Window',
      keywords: ['move tab', 'new window', '移动标签'],
    },
    'search.findText': {
      title: 'Find Text',
      keywords: ['find', 'search', 'text', '搜索', '查找'],
    },
    'search.goToLine': {
      title: 'Go To Line',
      keywords: ['go to line', 'line', 'jump', '跳转', '行号'],
    },
    'editor.goToDefinition': {
      title: 'Go to Definition',
      keywords: ['go to definition', 'definition', 'declaration', '跳转', '定义'],
    },
    'editor.goToDeclaration': {
      title: 'Go to Declaration',
      keywords: ['go to declaration', 'declaration', '跳转到声明'],
    },
    'editor.goToTypeDefinition': {
      title: 'Go to Type Definition',
      keywords: ['go to type definition', 'type definition', '类型定义'],
    },
    'editor.goToImplementation': {
      title: 'Go to Implementation',
      keywords: ['go to implementation', 'implementation', '跳转到实现'],
    },
      'editor.peekDefinition': {
      title: 'Peek Definition',
      keywords: ['peek definition', 'definition', '预览定义'],
      },
      'editor.peekReferences': {
        title: 'Peek References',
        keywords: ['Peek References', 'references', 'usages', '查看引用'],
      },
    'editor.callHierarchy': {
      title: 'Show Call Hierarchy',
      keywords: ['call hierarchy', 'incoming calls', 'outgoing calls', '调用层级'],
    },
    'editor.typeHierarchy': {
      title: 'Show Type Hierarchy',
      keywords: ['type hierarchy', 'supertypes', 'subtypes', '类型层级'],
    },
    'editor.findReferences': {
      title: 'Find All References',
      keywords: ['find references', 'references', 'usages', '查找引用'],
    },
    'editor.renameSymbol': {
      title: 'Rename Symbol',
      keywords: ['rename', 'symbol', '重命名'],
    },
    'editor.toggleProblems': {
      title: 'Toggle Problems',
      keywords: ['problems', 'diagnostics', 'errors', 'warnings', '问题', '诊断'],
    },
    'editor.goBack': {
      title: 'Go Back',
      keywords: ['go back', 'back', 'navigation history', '返回', '后退'],
    },
    'editor.goForward': {
      title: 'Go Forward',
      keywords: ['go forward', 'forward', 'navigation history', '前进'],
    },
    'workspace.searchSymbols': {
      title: 'Search Workspace Symbols',
      keywords: ['workspace symbol', 'global symbol', 'class', 'method', '符号', '工作区'],
    },
    'view.toggleSidebar': {
      title: 'Toggle Explorer',
      keywords: ['sidebar', 'explorer', 'panel', '资源管理器', '侧边栏'],
    },
    'view.toggleSettings': {
      title: 'Toggle Settings Workspace',
      keywords: ['settings', 'preferences', 'workspace', '配置', '设置'],
    },
    'cloud.login': {
      title: 'Sign In to lizi Cloud',
      keywords: ['login', 'sign in', 'account', 'cloud', 'sync', '登录', '账号'],
    },
    'cloud.logout': {
      title: 'Sign Out of lizi Cloud',
      keywords: ['logout', 'sign out', 'account', 'cloud', '退出', '登出'],
    },
    'cloud.syncNow': {
      title: 'Sync Current Document to Cloud',
      keywords: ['sync', 'upload', 'cloud document', '同步', '上传'],
    },
    'cloud.browse': {
      title: 'Browse Cloud Documents',
      keywords: ['cloud', 'browse', 'open', 'document', '云文档', '浏览'],
    },
  },
};

const COMMAND_PALETTE_TEXTS: Record<UiLanguage, CommandPaletteText> = {
  'zh-CN': {
    placeholder: '输入命令、分类或快捷键',
    empty: '没有找到匹配命令',
    categoryLabels: {
      file: '文件',
      view: '视图',
      workspace: '工作区',
      search: '搜索',
    },
  },
  'en-US': {
    placeholder: 'Type a command, category, or shortcut',
    empty: 'No matching commands',
    categoryLabels: {
      file: 'File',
      view: 'View',
      workspace: 'Workspace',
      search: 'Search',
    },
  },
};

const AUTHOR_INFO_TEXTS: Record<UiLanguage, AuthorInfoText> = {
  'zh-CN': {
    entry: '作者信息',
    modalTitle: '作者信息',
    nameLabel: '作者：',
    emailLabel: '邮箱：',
    githubLabel: '开源地址：',
    qqGroupLabel: 'QQ 交流群：',
    donationTitle: '公益捐赠',
    donationDesc: '如果 Tau 编辑器帮你节省了时间，欢迎随缘捐赠。每一份支持都会用于持续维护与功能改进。',
    wechatLabel: '微信捐赠',
    alipayLabel: '支付宝捐赠',
    donationTip: '感谢你的支持与善意。',
  },
  'en-US': {
    entry: 'Author',
    modalTitle: 'Author Info',
    nameLabel: 'Author: ',
    emailLabel: 'Email: ',
    githubLabel: 'Open Source: ',
    qqGroupLabel: 'QQ Group: ',
    donationTitle: 'Public Good Donation',
    donationDesc: 'If Tau Editor saves your time, optional donations are welcome and will support ongoing maintenance.',
    wechatLabel: 'WeChat',
    alipayLabel: 'Alipay',
    donationTip: 'Thank you for your support.',
  },
};

const SETTINGS_PANEL_TEXTS: Record<UiLanguage, SettingsPanelText> = {
  'zh-CN': {
    title: '设置',
    quickSettingsTitle: '快速设置',
    quickSettingsDesc: '这里保留高频选项，可随时进入完整设置查看更多配置。',
    openFullSettings: '进入完整设置',
    settingsGeneral: '通用',
    themeMarketplace: '主题市场',
    settingsEditor: '编辑器',
    settingsUpdates: '更新与版本',
    settingsAbout: '关于',
    fileAssociations: '文件关联',
    fileAssociationsLoading: '正在读取系统文件关联…',
    fileAssociationsOn: '已关联',
    fileAssociationsOff: '未关联',
    fileAssociationsScriptHint: '脚本（双击会执行）',
    fileAssociationsPlatformHint: '此设置仅在 Windows 系统上生效。',
    fileAssociationsGroupText: '纯文本',
    fileAssociationsGroupMarkdown: 'Markdown',
    fileAssociationsGroupJson: 'JSON',
    fileAssociationsGroupYaml: 'YAML',
    fileAssociationsGroupToml: 'TOML',
    fileAssociationsGroupCode: '源码',
    fileAssociationsGroupScript: '脚本',
    fileAssociationsApplyHint: '勾选后，双击该类型文件将使用 Tau Editor 打开；脚本类型默认不关联，避免阻止系统执行。',
    close: '关闭',
    appearance: '外观',
    language: '界面语言',
    languageZh: '简体中文',
    languageEn: 'English',
    themeMode: '主题模式',
    themeStyle: '主题风格',
    themeLight: '浅色',
    themeDark: '深色',
    themeSystem: '系统',
    themeCurrent: '当前生效',
    themeStyleMore: '更多风格',
    themeJsonExamples: 'JSON 配置示例',
    themeJsonExamplesDesc: '完整主题包可配置浅色与深色背景；快速配色包只调整文字、强调色和状态色，不会锁死明暗模式。',
    themeJsonThemeExample: '完整主题包示例',
    themeJsonPaletteExample: '快速配色包示例',
    themeJsonCopy: '复制示例',
    themeJsonCopied: 'JSON 示例已复制。',
    customTheme: '自定义配色',
    customThemeDesc: '在当前主题风格基础上继续微调关键颜色，可导入/导出复用。',
    customThemeImportPlaceholder: '粘贴 JSON（支持 { "customThemeColors": { ... } } 或直接颜色对象）',
    customThemeImport: '导入',
    customThemeExport: '导出',
    customThemeReset: '重置自定义',
    customThemeExported: '已复制当前自定义配色 JSON。',
    customThemeImported: (count) => `已导入 ${count} 个自定义颜色。`,
    customThemeImportFailed: '导入失败，请检查 JSON 格式。',
    themePackages: '主题包',
    themePackagesDesc: '导入 JSON 主题包后 UI 与 Monaco 编辑器同步切换，也可以导出当前主题分享。',
    themePackageImport: '从文件导入',
    themePackageExport: '导出',
    themePackageExportCurrent: '导出当前主题',
    themePackageApply: '应用',
    themePackageActive: '使用中',
    themePackageDelete: '删除',
    themePackageEmpty: '还没有导入主题包。',
    themePackageImportPlaceholder: '粘贴主题包 JSON（需包含 id、name、colors.bgApp、colors.textPrimary）',
    themePackagePasteImport: '粘贴导入',
    themePackageImported: (name) => `已导入并应用主题包：${name}`,
    themePackageImportFailed: (reason) => `主题包导入失败：${reason}`,
    themePackageExported: '主题包已导出。',
    themePackageDeleted: '主题包已删除。',
    themePackageReverted: '已回到内置主题。',
    themeUiAppearance: '界面外观',
    themeUiAppearanceDesc: '调整侧栏、面板和标签的语义颜色，实时作用于当前主题。',
    themeUiSidebarBg: '侧栏背景', themeUiSidebarText: '侧栏文字', themeUiSidebarActiveBg: '侧栏选中背景', themeUiSidebarActiveText: '侧栏选中文字', themeUiSidebarIndicator: '侧栏选中指示',
    themeUiPanelBg: '面板背景', themeUiPanelRaised: '浮层背景', themeUiPanelBorder: '面板边框',
    themeUiTabsActiveBg: '标签选中背景', themeUiTabsActiveText: '标签选中文字', themeUiTabsIndicator: '标签选中指示', themeUiTabsHover: '标签悬浮背景',
    cornerRadius: '界面圆角', cornerRadiusSharp: '直角 0', cornerRadiusCompact: '紧凑 4', cornerRadiusStandard: '标准 6', cornerRadiusSoft: '柔和 8', cornerRadiusRound: '圆润 12',
    themeSourceTitle: '主题源码 JSON', themeSourceLoading: '正在加载主题源码…', themeSourceRetry: '重试', themeSourceCopy: '复制 JSON',
    keybindings: '快捷键',
    keybindingsDesc: '点击按键后直接按下新的组合键，ESC 取消；冲突时会询问是否覆盖。',
    keybindingRecording: '请按下新的组合…',
    keybindingUnbound: '未绑定',
    keybindingsResetAll: '全部恢复默认',
    keybindingConflict: '该组合已被占用',
    keybindingCancelled: '已取消改键。',
    providers: '扩展点',
    providersDesc: '主题 / 命令 / 文件动作 Provider 的装配状态，单个 Provider 报错不会影响启动。',
    providerThemes: '主题',
    providerCommands: '命令',
    providerFileActions: '文件动作',
    customColorBgApp: '应用背景',
    customColorPanelBase: '面板背景',
    customColorTextPrimary: '主文本',
    customColorTextSecondary: '次文本',
    customColorAccentBrand: '品牌主色',
    customColorAccentBrandStrong: '品牌强调色',
    customColorSuccess: '成功态颜色',
    customColorDanger: '危险态颜色',
    editorTheme: '编辑器主题',
    recommended: '推荐',
    font: '字体',
    fontSize: '字体大小',
    reset: '重置',
    fontFamily: '字体家族',
    uiFont: '界面字体',
    uiFontSize: '界面字体大小',
    uiFontFamily: '界面字体家族',
    systemUiFont: '系统界面字体',
    systemMonospace: '系统等宽字体',
    preview: '预览',
    fontPreviewLine1: 'const hello = "你好，世界";',
    fontPreviewLine2: 'console.log(hello);',
    editor: '编辑器',
    markdownPreviewTheme: 'Markdown 预览主题',
    markdownPreviewThemeDocsClean: '文档站清朗',
    markdownPreviewThemePaperSoft: '护眼纸张',
    markdownPreviewThemeEditorialWarm: '出版暖页',
    markdownPreviewThemeGraphiteNight: '夜读石墨',
    markdownPreviewThemeMintGrove: '林间薄荷',
    markdownPreviewThemeLavenderLetter: '雾紫信笺',
    markdownPreviewThemeDeepOcean: '深海蓝调',
    markdownMermaidTheme: '流程图渲染主题',
    markdownMermaidThemeAuto: '跟随预览主题',
    markdownMermaidThemeDefault: '默认',
    markdownMermaidThemeDark: '深色',
    markdownMermaidThemeForest: '森林',
    markdownMermaidThemeNeutral: '中性',
    markdownMermaidThemeAurora: '极光青绿',
    markdownMermaidThemeSunset: '落日暖橙',
    markdownMermaidThemeLavender: '薰衣草紫',
    markdownMermaidThemeMono: '极简黑白',
    markdownMermaidNodeColor: '流程图节点背景色',
    markdownMermaidNodeColorHint: '未设置时由流程图主题决定节点颜色。',
    markdownMermaidNodeColorReset: '恢复主题默认',
    autoSave: '自动保存',
    autoSaveEnabled: '启用自动保存',
    autoSaveStatusEnabled: '自动保存已启用',
    autoSaveStatusDisabled: '自动保存已关闭',
    autoSaveInterval: '自动保存间隔',
    seconds10: '10 秒',
    seconds30: '30 秒',
    minute1: '1 分钟',
    minutes5: '5 分钟',
    maxOpenTabs: '最大标签页数量',
    maxOpenTabsHint: '已打开标签达到该数量后，将拒绝继续打开新标签。',
    memoryLimitMB: '标签内存上限 (MB)',
    memoryLimitHint: '按“字符数 x 2 字节”估算内存，超出后将拒绝打开新标签。',
    indent: '缩进',
    spaces2: '2 空格',
    spaces4: '4 空格',
    spaces8: '8 空格',
    minimap: '显示缩略图',
    minimapEnabled: '显示代码缩略图',
    wordWrap: '自动换行',
    wordWrapEnabled: '启用自动换行',
    softwareUpdate: '软件更新',
    currentVersion: '当前版本',
    latestVersion: '最新版本',
    deviceInfo: '当前设备',
    releaseDate: '发布时间',
    packageName: '安装包',
    releaseNotes: '更新说明',
    checkForUpdates: '检查更新',
    checkingForUpdates: '检查中...',
    installUpdate: '下载并安装',
    installingUpdate: '安装中...',
    openReleasePage: '查看 Release 页面',
    statusIdle: '点击“检查更新”查看最新版本。',
    statusChecking: '正在检查 GitHub Release...',
    statusUpToDate: '当前已经是最新版本。',
    statusUpdateAvailable: (version) => `发现新版本 ${version}，可立即下载安装。`,
    statusNoMatchedAsset: '发现新版本，但未匹配到当前设备的安装包，请手动前往 Release 页面下载。',
    statusInstalling: '正在下载并启动安装程序，请稍候...',
    statusInstallTriggered: '安装程序已启动，请按系统提示完成安装。',
    statusErrorPrefix: '更新失败',
    settingsCloudSync: '云同步',
    cloudSyncDesc: '登录 lizi 账号后，可把当前 Markdown 文档手动同步到云端；凭据只保存在本机。',
    cloudSyncServerUrl: '服务器地址',
    cloudSyncUsername: '用户名',
    cloudSyncPassword: '密码',
    cloudSyncLogin: '登录',
    cloudSyncLoggingIn: '登录中…',
    cloudSyncLogout: '退出登录',
    cloudSyncSignedOut: '已退出 lizi 云账号。',
    cloudSyncSignedInAs: (username) => `已登录：${username}`,
    cloudSyncLoginRequired: '请先在设置页登录 lizi 云账号。',
    cloudSyncRegisterHint: '还没有账号？',
    cloudSyncRegisterAction: '去注册',
    cloudSyncQuotaLabel: '云端配额',
    cloudSyncQuotaReading: '正在读取云端配额…',
    cloudSyncQuotaFailed: (kind, message) => `配额不可用（${kind}）：${message}`,
    cloudSyncSyncNow: '同步当前文档',
    cloudSyncSyncing: '同步中…',
    cloudSyncResultSynced: (version) => (version ? `同步成功，云端版本 v${version}。` : '同步成功。'),
    cloudSyncResultConflict: '云端与本地都已修改，请先手动比对后再同步。',
    cloudDocSaveConflictTitle: '云端保存冲突',
    cloudDocSaveConflictBody: (message) =>
      `云端已有更新的版本，自动保存已暂停${message ? `：${message}` : '。'}`,
    cloudSyncResultFailed: (message) => `同步失败：${message}`,
    cloudSyncResultSkipped: (reason) => `当前文档未同步：${reason}`,
    cloudSyncAutoLabel: '自动同步',
    cloudSyncAutoUnavailable: '自动同步仅在 Tau 桌面端且已登录时可用。',
    cloudSyncDebounceLabel: '保存后延迟（秒）',
    cloudSyncQueueEmpty: '同步队列为空。',
    cloudSyncQueueStatus: (pending, failed) => `队列：待同步 ${pending} · 失败 ${failed}`,
    cloudSyncRetryQueue: '重试失败项',
    cloudSyncVersions: '版本历史',
    cloudSyncVersionsLoading: '正在读取版本历史…',
    cloudSyncVersionsEmpty: '暂无历史版本',
    cloudSyncVersionLabel: (version) => `版本 v${version}`,
    cloudSyncVersionRestore: '恢复',
    cloudSyncVersionRestored: (version) => `已恢复到 v${version}，云端生成了新版本。`,
    cloudSyncVersionHint: '恢复只会新增版本，不会删除任何历史。',
    cloudSyncConflictTitle: '冲突处理',
    cloudSyncConflictHint: '本地与云端都修改过该文档，请选择保留哪一份。',
    cloudSyncKeepLocal: '用本地覆盖云端',
    cloudSyncKeepRemote: '用云端覆盖本地',
    cloudSyncKeepLocalDone: (version) => (version ? `已用本地内容覆盖云端（v${version}）。` : '已用本地内容覆盖云端。'),
    cloudSyncKeepRemoteDone: (version) => (version ? `已用云端内容覆盖本地（v${version}）。` : '已用云端内容覆盖本地。'),
    cloudSyncPull: '从云端拉取',
    cloudSyncBrowse: '浏览云端文档',
    cloudSyncImagesLabel: '同步文档内图片',
    cloudSyncImagesHint: '同步/分享时自动上传 md 引用的相对图片（png/jpg/jpeg/gif/webp，单张 ≤20MB，计入云端配额）',
    cloudSyncPulling: '拉取中…',
    cloudSyncPullConfirmTitle: '确认覆盖未保存的修改',
    cloudSyncPullConfirmHint: '当前文档有未保存的修改，用云端内容覆盖会丢弃这些修改。',
    cloudSyncPullConfirmOk: '丢弃修改并覆盖',
    cloudSyncPullConfirmCancel: '取消',
    cloudSyncPullCancelled: '已取消覆盖，本地内容保持不变。',
    cloudSyncMetaTitle: '文档属性',
    cloudSyncMetaHint: '随保存同步上传',
    cloudSyncMetaFirstSyncHint: 'No cloud version yet',
    cloudSyncMetaLoading: '正在读取云端属性…',
    cloudSyncMetaCategory: '分类',
    cloudSyncMetaCategoryNone: '不分类',
    cloudSyncMetaCategoryPlaceholder: '输入分类名称',
    cloudSyncMetaCategoriesFailed: '分类列表加载失败，可手动输入分类名称。',
    cloudSyncMetaTags: '标签',
    cloudSyncMetaTagsPlaceholder: '用英文逗号分隔，例如：笔记, 云同步',
    cloudSyncMetaVisibilityPublic: '公开（可在博客与小程序浏览）',
    cloudSyncMetaVisibilityPrivate: '私有（仅自己可见）',
    cloudSyncMetaSave: '保存并同步',
    cloudSyncMetaSaving: '保存中…',
    cloudSyncMetaSaved: (version) => (version ? `属性已保存并同步到云端（v${version}）。` : '属性已保存并同步到云端。'),
  },
  'en-US': {
    title: 'Settings',
    quickSettingsTitle: 'Quick Settings',
    quickSettingsDesc: 'High-frequency options only. Open full settings for all categories.',
    openFullSettings: 'Open Full Settings',
    settingsGeneral: 'General',
    themeMarketplace: 'Theme Market',
    settingsEditor: 'Editor',
    settingsUpdates: 'Updates & Version',
    settingsAbout: 'About',
    fileAssociations: 'File Associations',
    fileAssociationsLoading: 'Reading system file associations…',
    fileAssociationsOn: 'Registered',
    fileAssociationsOff: 'Not registered',
    fileAssociationsScriptHint: 'script (double-click runs)',
    fileAssociationsPlatformHint: 'This setting only applies on Windows.',
    fileAssociationsGroupText: 'Plain Text',
    fileAssociationsGroupMarkdown: 'Markdown',
    fileAssociationsGroupJson: 'JSON',
    fileAssociationsGroupYaml: 'YAML',
    fileAssociationsGroupToml: 'TOML',
    fileAssociationsGroupCode: 'Source Code',
    fileAssociationsGroupScript: 'Scripts',
    fileAssociationsApplyHint: 'Checked extensions open in Tau Editor on double-click. Script types stay unchecked by default so Windows can run them.',
    close: 'Close',
    appearance: 'Appearance',
    language: 'UI Language',
    languageZh: '简体中文',
    languageEn: 'English',
    themeMode: 'Theme Mode',
    themeStyle: 'Theme Palette',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    themeCurrent: 'Current',
    themeStyleMore: 'More styles',
    themeJsonExamples: 'JSON examples',
    themeJsonExamplesDesc: 'A full theme package configures both light and dark backgrounds. A palette package only changes text, accent, and state colors.',
    themeJsonThemeExample: 'Full theme package',
    themeJsonPaletteExample: 'Quick palette package',
    themeJsonCopy: 'Copy example',
    themeJsonCopied: 'JSON example copied.',
    customTheme: 'Custom Palette',
    customThemeDesc: 'Fine-tune key colors on top of the selected palette. Supports JSON import/export.',
    customThemeImportPlaceholder: 'Paste JSON ({ "customThemeColors": { ... } } or plain color map)',
    customThemeImport: 'Import',
    customThemeExport: 'Export',
    customThemeReset: 'Reset Custom',
    customThemeExported: 'Custom palette JSON copied to clipboard.',
    customThemeImported: (count) => `Imported ${count} custom colors.`,
    customThemeImportFailed: 'Import failed. Please check JSON format.',
    themePackages: 'Theme Packages',
    themePackagesDesc: 'Import a JSON theme package to switch the UI and Monaco editor together, or export the active theme to share it.',
    themePackageImport: 'Import File',
    themePackageExport: 'Export',
    themePackageExportCurrent: 'Export Current Theme',
    themePackageApply: 'Apply',
    themePackageActive: 'Active',
    themePackageDelete: 'Delete',
    themePackageEmpty: 'No theme packages imported yet.',
    themePackageImportPlaceholder: 'Paste theme package JSON (requires id, name, colors.bgApp, colors.textPrimary)',
    themePackagePasteImport: 'Import Pasted JSON',
    themePackageImported: (name) => `Theme package imported and applied: ${name}`,
    themePackageImportFailed: (reason) => `Theme package import failed: ${reason}`,
    themePackageExported: 'Theme package exported.',
    themePackageDeleted: 'Theme package deleted.',
    themePackageReverted: 'Reverted to the built-in theme.',
    themeUiAppearance: 'Interface Appearance',
    themeUiAppearanceDesc: 'Tune sidebar, panel and tab semantic colors for the active theme.',
    themeUiSidebarBg: 'Sidebar Background', themeUiSidebarText: 'Sidebar Text', themeUiSidebarActiveBg: 'Sidebar Active Background', themeUiSidebarActiveText: 'Sidebar Active Text', themeUiSidebarIndicator: 'Sidebar Active Indicator',
    themeUiPanelBg: 'Panel Background', themeUiPanelRaised: 'Raised Surface', themeUiPanelBorder: 'Panel Border',
    themeUiTabsActiveBg: 'Tab Active Background', themeUiTabsActiveText: 'Tab Active Text', themeUiTabsIndicator: 'Tab Active Indicator', themeUiTabsHover: 'Tab Hover Background',
    cornerRadius: 'Corner Radius', cornerRadiusSharp: 'Sharp 0', cornerRadiusCompact: 'Compact 4', cornerRadiusStandard: 'Standard 6', cornerRadiusSoft: 'Soft 8', cornerRadiusRound: 'Round 12',
    themeSourceTitle: 'Theme Source JSON', themeSourceLoading: 'Loading theme source…', themeSourceRetry: 'Retry', themeSourceCopy: 'Copy JSON',
    keybindings: 'Keybindings',
    keybindingsDesc: 'Click a key, then press the new combination. Press ESC to cancel; conflicts ask before overriding.',
    keybindingRecording: 'Press new keys…',
    keybindingUnbound: 'Unbound',
    keybindingsResetAll: 'Reset All',
    keybindingConflict: 'This combination is already used',
    keybindingCancelled: 'Key change cancelled.',
    providers: 'Extension Points',
    providersDesc: 'Provider status for themes, commands and file actions. A failing provider never blocks startup.',
    providerThemes: 'Themes',
    providerCommands: 'Commands',
    providerFileActions: 'File Actions',
    customColorBgApp: 'App Background',
    customColorPanelBase: 'Panel Background',
    customColorTextPrimary: 'Primary Text',
    customColorTextSecondary: 'Secondary Text',
    customColorAccentBrand: 'Brand Color',
    customColorAccentBrandStrong: 'Brand Strong',
    customColorSuccess: 'Success Color',
    customColorDanger: 'Danger Color',
    editorTheme: 'Editor Theme',
    recommended: 'Recommended',
    font: 'Font',
    fontSize: 'Font Size',
    reset: 'Reset',
    fontFamily: 'Font Family',
    uiFont: 'Interface Font',
    uiFontSize: 'Interface Font Size',
    uiFontFamily: 'Interface Font Family',
    systemUiFont: 'System Interface Font',
    systemMonospace: 'System Monospace',
    preview: 'Preview',
    fontPreviewLine1: 'const hello = "Hello, world";',
    fontPreviewLine2: 'console.log(hello);',
    editor: 'Editor',
    markdownPreviewTheme: 'Markdown Preview Theme',
    markdownPreviewThemeDocsClean: 'Docs Clean',
    markdownPreviewThemePaperSoft: 'Paper Soft',
    markdownPreviewThemeEditorialWarm: 'Editorial Warm',
    markdownPreviewThemeGraphiteNight: 'Graphite Night',
    markdownPreviewThemeMintGrove: 'Mint Grove',
    markdownPreviewThemeLavenderLetter: 'Lavender Letter',
    markdownPreviewThemeDeepOcean: 'Deep Ocean',
    markdownMermaidTheme: 'Diagram Rendering Theme',
    markdownMermaidThemeAuto: 'Follow Preview Theme',
    markdownMermaidThemeDefault: 'Default',
    markdownMermaidThemeDark: 'Dark',
    markdownMermaidThemeForest: 'Forest',
    markdownMermaidThemeNeutral: 'Neutral',
    markdownMermaidThemeAurora: 'Aurora',
    markdownMermaidThemeSunset: 'Sunset',
    markdownMermaidThemeLavender: 'Lavender',
    markdownMermaidThemeMono: 'Monochrome',
    markdownMermaidNodeColor: 'Diagram Node Background',
    markdownMermaidNodeColorHint: 'When unset, node colors are determined by the diagram theme.',
    markdownMermaidNodeColorReset: 'Use Theme Default',
    autoSave: 'Auto Save',
    autoSaveEnabled: 'Enable Auto Save',
    autoSaveStatusEnabled: 'Auto Save Enabled',
    autoSaveStatusDisabled: 'Auto Save Disabled',
    autoSaveInterval: 'Auto Save Interval',
    seconds10: '10 sec',
    seconds30: '30 sec',
    minute1: '1 min',
    minutes5: '5 min',
    maxOpenTabs: 'Max Open Tabs',
    maxOpenTabsHint: 'Opening new tabs will be blocked after reaching this count.',
    memoryLimitMB: 'Tab Memory Limit (MB)',
    memoryLimitHint: 'Estimated as character count x 2 bytes. New tabs are blocked when exceeded.',
    indent: 'Indentation',
    spaces2: '2 spaces',
    spaces4: '4 spaces',
    spaces8: '8 spaces',
    minimap: 'Minimap',
    minimapEnabled: 'Show code minimap',
    wordWrap: 'Word Wrap',
    wordWrapEnabled: 'Enable word wrap',
    softwareUpdate: 'Software Update',
    currentVersion: 'Current Version',
    latestVersion: 'Latest Version',
    deviceInfo: 'Device',
    releaseDate: 'Published At',
    packageName: 'Installer Package',
    releaseNotes: 'Release Notes',
    checkForUpdates: 'Check for Updates',
    checkingForUpdates: 'Checking...',
    installUpdate: 'Download & Install',
    installingUpdate: 'Installing...',
    openReleasePage: 'Open Release Page',
    statusIdle: 'Click "Check for Updates" to fetch latest release.',
    statusChecking: 'Checking latest release from GitHub...',
    statusUpToDate: 'You are already on the latest version.',
    statusUpdateAvailable: (version) => `Update ${version} is available and ready to install.`,
    statusNoMatchedAsset: 'An update is available, but no installer matches this device. Please download it manually from Releases.',
    statusInstalling: 'Downloading installer and starting setup...',
    statusInstallTriggered: 'Installer launched. Please follow system prompts to finish installation.',
    statusErrorPrefix: 'Update failed',
    settingsCloudSync: 'Cloud Sync',
    cloudSyncDesc: 'Sign in to your lizi account to push the current Markdown document to the cloud. Credentials stay on this device.',
    cloudSyncServerUrl: 'Server URL',
    cloudSyncUsername: 'Username',
    cloudSyncPassword: 'Password',
    cloudSyncLogin: 'Sign In',
    cloudSyncLoggingIn: 'Signing in…',
    cloudSyncLogout: 'Sign Out',
    cloudSyncSignedOut: 'Signed out of lizi Cloud.',
    cloudSyncSignedInAs: (username) => `Signed in as ${username}`,
    cloudSyncLoginRequired: 'Sign in to your lizi account in Settings first.',
    cloudSyncRegisterHint: 'No account yet?',
    cloudSyncRegisterAction: 'Sign up',
    cloudSyncQuotaLabel: 'Cloud quota',
    cloudSyncQuotaReading: 'Reading cloud quota…',
    cloudSyncQuotaFailed: (kind, message) => `Quota unavailable (${kind}): ${message}`,
    cloudSyncSyncNow: 'Sync Current Document',
    cloudSyncSyncing: 'Syncing…',
    cloudSyncResultSynced: (version) => (version ? `Synced. Cloud version v${version}.` : 'Synced to the cloud.'),
    cloudSyncResultConflict: 'Both the cloud copy and the local file changed. Compare them before syncing again.',
    cloudDocSaveConflictTitle: 'Cloud save conflict',
    cloudDocSaveConflictBody: (message) =>
      `A newer version exists in the cloud, so auto-save is paused${message ? `: ${message}` : '.'}`,
    cloudSyncResultFailed: (message) => `Sync failed: ${message}`,
    cloudSyncResultSkipped: (reason) => `Document not synced: ${reason}`,
    cloudSyncAutoLabel: 'Auto sync',
    cloudSyncAutoUnavailable: 'Auto sync is available in the Tau desktop app after signing in.',
    cloudSyncDebounceLabel: 'Delay after save (seconds)',
    cloudSyncQueueEmpty: 'Sync queue is empty.',
    cloudSyncQueueStatus: (pending, failed) => `Queue: ${pending} pending · ${failed} failed`,
    cloudSyncRetryQueue: 'Retry failed',
    cloudSyncVersions: 'Version History',
    cloudSyncVersionsLoading: 'Loading version history…',
    cloudSyncVersionsEmpty: 'No version history yet',
    cloudSyncVersionLabel: (version) => `Version v${version}`,
    cloudSyncVersionRestore: 'Restore',
    cloudSyncVersionRestored: (version) => `Restored v${version}. The cloud now has a new version.`,
    cloudSyncVersionHint: 'Restoring only adds a new version; no history is removed.',
    cloudSyncConflictTitle: 'Resolve Conflict',
    cloudSyncConflictHint: 'Both the cloud copy and the local file changed. Choose which one to keep.',
    cloudSyncKeepLocal: 'Overwrite Cloud with Local',
    cloudSyncKeepRemote: 'Overwrite Local with Cloud',
    cloudSyncKeepLocalDone: (version) => (version ? `Cloud overwritten with local content (v${version}).` : 'Cloud overwritten with local content.'),
    cloudSyncKeepRemoteDone: (version) => (version ? `Local overwritten with cloud content (v${version}).` : 'Local overwritten with cloud content.'),
    cloudSyncPull: 'Pull from Cloud',
    cloudSyncBrowse: 'Browse Cloud Documents',
    cloudSyncImagesLabel: 'Sync images in documents',
    cloudSyncImagesHint: 'Upload relative images referenced by Markdown on sync/share (png/jpg/jpeg/gif/webp, 20MB each, counts toward quota)',
    cloudSyncPulling: 'Pulling…',
    cloudSyncPullConfirmTitle: 'Unsaved changes will be discarded',
    cloudSyncPullConfirmHint: 'This document has unsaved changes. Overwriting it with the cloud copy discards them.',
    cloudSyncPullConfirmOk: 'Discard and Overwrite',
    cloudSyncPullConfirmCancel: 'Cancel',
    cloudSyncPullCancelled: 'Overwrite cancelled. Local content kept.',
    cloudSyncMetaTitle: 'Document Properties',
    cloudSyncMetaHint: 'Uploaded on every save & sync',
    cloudSyncMetaFirstSyncHint: 'No cloud version yet',
    cloudSyncMetaLoading: 'Loading cloud properties…',
    cloudSyncMetaCategory: 'Category',
    cloudSyncMetaCategoryNone: 'No category',
    cloudSyncMetaCategoryPlaceholder: 'Enter a category name',
    cloudSyncMetaCategoriesFailed: 'Failed to load categories. You can type a category name instead.',
    cloudSyncMetaTags: 'Tags',
    cloudSyncMetaTagsPlaceholder: 'Separate with commas, e.g. notes, cloud-sync',
    cloudSyncMetaVisibilityPublic: 'Public (visible on the blog and mini program)',
    cloudSyncMetaVisibilityPrivate: 'Private (only visible to you)',
    cloudSyncMetaSave: 'Save & Sync',
    cloudSyncMetaSaving: 'Saving…',
    cloudSyncMetaSaved: (version) => (version ? `Properties saved and synced to the cloud (v${version}).` : 'Properties saved and synced to the cloud.'),
  },
};

const APP_TEXTS: Record<UiLanguage, AppText> = {
  'zh-CN': {
    appLabel: 'Tau 编辑器',
    workspaceNotOpen: '未打开工作区',
    fileNotOpen: '未打开文件',
    undoTitle: '撤销',
    undoHint: '请使用编辑器内置撤销，快捷键为 Ctrl/Cmd + Z',
    redoTitle: '重做',
    redoHint: '请使用编辑器内置重做，快捷键为 Ctrl/Cmd + Shift + Z',
    commandExecFail: '命令执行失败',
    unknownCommand: '未知命令',
    collapseExplorer: '折叠资源管理器',
    expandExplorer: '展开资源管理器',
    openFolder: '打开文件夹',
    openFile: '打开文件',
    newFile: '新建文件',
    recentFolders: '最近打开的文件夹',
    sidebarTabWorkspace: '工作区',
    sidebarTabCloud: '云端文档',
    noRecentFolders: '暂无最近打开的文件夹',
    openRecentFolder: '打开此文件夹',
    scratchWorkspaceClearedTitle: '临时工作区已被清理',
    scratchWorkspaceClearedMessage: (path) => `上次的临时工作区（${path}）已不存在，可能是系统清理了临时目录。已回到未打开工作区状态，云文档可重新打开。`,
  },
  'en-US': {
    appLabel: 'Tau Editor',
    workspaceNotOpen: 'No Workspace Opened',
    fileNotOpen: 'No File Opened',
    undoTitle: 'Undo',
    undoHint: 'Use editor built-in undo, shortcut: Ctrl/Cmd + Z',
    redoTitle: 'Redo',
    redoHint: 'Use editor built-in redo, shortcut: Ctrl/Cmd + Shift + Z',
    commandExecFail: 'Command Execution Failed',
    unknownCommand: 'Unknown command',
    collapseExplorer: 'Collapse Explorer',
    expandExplorer: 'Expand Explorer',
    openFolder: 'Open Folder',
    openFile: 'Open File',
    newFile: 'New File',
    recentFolders: 'Recently opened folders',
    sidebarTabWorkspace: 'Workspace',
    sidebarTabCloud: 'Cloud Docs',
    noRecentFolders: 'No recently opened folders',
    openRecentFolder: 'Open this folder',
    scratchWorkspaceClearedTitle: 'Temporary workspace was cleaned up',
    scratchWorkspaceClearedMessage: (path) => `The temporary workspace (${path}) no longer exists — the system may have cleared the temp folder. You are back to "no workspace opened"; open the cloud document again to continue.`,
  },
};

const TOOLBAR_TEXTS: Record<UiLanguage, ToolbarText> = {
  'zh-CN': {
    newFile: '新建文件 (Ctrl+N)',
    openFile: '打开文件 (Ctrl+O)',
    openFolder: '打开文件夹',
    save: '保存 (Ctrl+S)',
    saveAs: '另存为',
    goBack: '返回上一个位置',
    goForward: '前进到下一个位置',
    quickOpen: '快速打开文件 (Ctrl+P)',
    commandPalette: '命令面板 (F1)',
    collapseExplorer: '折叠资源管理器',
    expandExplorer: '展开资源管理器',
    collapseContext: '折叠上下文栏',
    expandContext: '展开上下文栏',
    undo: '撤销',
    redo: '重做',
    locateCurrentFile: '定位当前文件',
    markdownViewPrefix: 'Markdown 视图',
    dirtyTip: '当前标签未保存',
    dirtyShort: '未保存',
    savedTip: '当前标签已保存',
    savedShort: '已保存',
    settings: '设置',
    previewModeLabels: {
      edit: '仅编辑',
      split: '分栏',
      preview: '仅预览',
    },
  },
  'en-US': {
    newFile: 'New File (Ctrl+N)',
    openFile: 'Open File (Ctrl+O)',
    openFolder: 'Open Folder',
    save: 'Save (Ctrl+S)',
    saveAs: 'Save As',
    goBack: 'Go Back',
    goForward: 'Go Forward',
    quickOpen: 'Quick Open File (Ctrl+P)',
    commandPalette: 'Command Palette (F1)',
    collapseExplorer: 'Collapse Explorer',
    expandExplorer: 'Expand Explorer',
    collapseContext: 'Collapse Context Rail',
    expandContext: 'Expand Context Rail',
    undo: 'Undo',
    redo: 'Redo',
    locateCurrentFile: 'Locate Current File',
    markdownViewPrefix: 'Markdown View',
    dirtyTip: 'Current tab has unsaved changes',
    dirtyShort: 'Unsaved',
    savedTip: 'Current tab is saved',
    savedShort: 'Saved',
    settings: 'Settings',
    previewModeLabels: {
      edit: 'Edit Only',
      split: 'Split',
      preview: 'Preview Only',
    },
  },
};

const EDITOR_TABS_TEXTS: Record<UiLanguage, EditorTabsText> = {
  'zh-CN': {
    tabsLabel: '编辑器标签',
    unsaved: '未保存',
    saved: '已保存',
    close: '关闭',
    closeOthers: '关闭其他标签',
    closeAll: '关闭所有标签',
    openInNewWindow: '在新窗口打开',
    openInNewWindowFailed: '跨窗口拖动标签失败',
    renameTab: '重命名标签',
    copyFilePath: '复制文件路径',
    revealInFolder: '打开文件所在位置',
    noFilePath: '当前标签没有文件路径',
    copyPathDone: '文件路径已复制',
    copyPathFailed: '复制文件路径失败',
    revealFailed: '打开文件所在位置失败',
    renameHint: '双击重命名',
    moreActionsHint: '右键查看更多操作',
    loadingProgress: (progress) => `加载中 ${progress}%`,
    loadingFailed: '加载失败',
    loadingCancelled: '已取消加载',
    cancelLoad: '取消',
    retryLoad: '重试',
  },
  'en-US': {
    tabsLabel: 'Editor tabs',
    unsaved: 'Unsaved',
    saved: 'Saved',
    close: 'Close',
    closeOthers: 'Close Others',
    closeAll: 'Close All',
    openInNewWindow: 'Open in New Window',
    openInNewWindowFailed: 'Failed to transfer tab between windows',
    renameTab: 'Rename Tab',
    copyFilePath: 'Copy File Path',
    revealInFolder: 'Reveal in Folder',
    noFilePath: 'Current tab has no file path',
    copyPathDone: 'File path copied',
    copyPathFailed: 'Failed to copy file path',
    revealFailed: 'Failed to reveal file location',
    renameHint: 'Double-click to rename',
    moreActionsHint: 'Right-click for more actions',
    loadingProgress: (progress) => `Loading ${progress}%`,
    loadingFailed: 'Load failed',
    loadingCancelled: 'Load cancelled',
    cancelLoad: 'Cancel',
    retryLoad: 'Retry',
  },
};

const FILE_TREE_TEXTS: Record<UiLanguage, FileTreeText> = {
  'zh-CN': {
    workspace: '工作区',
    searchPlaceholder: '在工作区中搜索',
    searchAriaLabel: '搜索文件',
    refresh: '刷新',
    quickOps: '轻操作',
    quickCreate: '右键创建 · 快捷展开',
    quickOpen: 'Enter / 空格 打开',
    emptyTitle: '当前工作区暂无文件',
    emptyHint: '右键创建文件/文件夹，或点击右上角刷新',
    loading: '加载文件树...',
    newFile: '新建文件',
    newFolder: '新建文件夹',
    rename: '重命名',
    delete: '删除',
    compareWithCurrent: '与当前文件对比',
    syncToCloud: '同步至云端',
    syncToCloudHint: '把该文档上传/更新到 lizi 云端',
    share: '一键分享',
    shareAlready: '分享（已分享）',
    shareHint: '同步到云端并生成分享链接',
    alreadySynced: '已同步',
    fileDetails: '文件详情',
    locateCurrentFile: '定位当前文件',
    copyCurrentFilePath: '复制当前文件路径',
    revealCurrentFile: '在文件管理器中显示',
    currentFileUnavailable: '当前文件不在工作区',
  },
  'en-US': {
    workspace: 'Workspace',
    searchPlaceholder: 'Search in workspace',
    searchAriaLabel: 'Search files',
    refresh: 'Refresh',
    quickOps: 'Quick Actions',
    quickCreate: 'Right-click create · Quick expand',
    quickOpen: 'Enter / Space to open',
    emptyTitle: 'No files in current workspace',
    emptyHint: 'Right-click to create files/folders, or click refresh above',
    loading: 'Loading file tree...',
    newFile: 'New File',
    newFolder: 'New Folder',
    rename: 'Rename',
    delete: 'Delete',
    compareWithCurrent: 'Compare with Current File',
    syncToCloud: 'Sync to Cloud',
    syncToCloudHint: 'Upload or update this document in lizi cloud',
    share: 'Share',
    shareAlready: 'Share (already shared)',
    shareHint: 'Sync to cloud and create a share link',
    alreadySynced: 'Synced',
    fileDetails: 'File Details',
    locateCurrentFile: 'Locate Current File',
    copyCurrentFilePath: 'Copy Current File Path',
    revealCurrentFile: 'Reveal in File Manager',
    currentFileUnavailable: 'Current file is not in the workspace',
  },
};

const STATUS_BAR_TEXTS: Record<UiLanguage, StatusBarText> = {
  'zh-CN': {
    rowCol: (line, column) => `行 ${line}, 列 ${column}`,
    lineCount: (lineCount) => `Ln ${lineCount}`,
    autoSave: '自动保存',
    encoding: '编码',
    encodingTitle: '文件编码',
    encodingOptions: {
      'utf-8': 'UTF-8',
      'utf-16le': 'UTF-16 LE',
      'utf-16be': 'UTF-16 BE',
      gbk: 'GBK',
      gb18030: 'GB18030',
      big5: 'Big5',
      shift_jis: 'Shift JIS',
      'iso-8859-1': 'ISO-8859-1',
    },
    theme: '主题',
    editorThemeTitle: '编辑器主题',
    themeOptions: {
      vs: '明亮',
      'vs-dark': '暗夜',
      'hc-black': '高对比',
    },
    language: '语言',
    languageModeTitle: '语言模式',
    languageOptions: {
      plaintext: '纯文本',
      javascript: 'JavaScript',
      typescript: 'TypeScript',
      python: 'Python',
      java: 'Java',
      c: 'C',
      cpp: 'C++',
      csharp: 'C#',
      go: 'Go',
      rust: 'Rust',
      html: 'HTML',
      css: 'CSS',
      scss: 'SCSS',
      json: 'JSON',
      xml: 'XML',
      markdown: 'Markdown',
      yaml: 'YAML',
      sql: 'SQL',
      shell: 'Shell',
    },
    justNow: '刚刚',
    minutesAgo: (minutes) => `${minutes} 分钟前`,
    hoursAgo: (hours) => `${hours} 小时前`,
  },
  'en-US': {
    rowCol: (line, column) => `Ln ${line}, Col ${column}`,
    lineCount: (lineCount) => `Lines ${lineCount}`,
    autoSave: 'Auto Save',
    encoding: 'Encoding',
    encodingTitle: 'File Encoding',
    encodingOptions: {
      'utf-8': 'UTF-8',
      'utf-16le': 'UTF-16 LE',
      'utf-16be': 'UTF-16 BE',
      gbk: 'GBK',
      gb18030: 'GB18030',
      big5: 'Big5',
      shift_jis: 'Shift JIS',
      'iso-8859-1': 'ISO-8859-1',
    },
    theme: 'Theme',
    editorThemeTitle: 'Editor Theme',
    themeOptions: {
      vs: 'Light',
      'vs-dark': 'Dark',
      'hc-black': 'High Contrast',
    },
    language: 'Language',
    languageModeTitle: 'Language Mode',
    languageOptions: {
      plaintext: 'Plain Text',
      javascript: 'JavaScript',
      typescript: 'TypeScript',
      python: 'Python',
      java: 'Java',
      c: 'C',
      cpp: 'C++',
      csharp: 'C#',
      go: 'Go',
      rust: 'Rust',
      html: 'HTML',
      css: 'CSS',
      scss: 'SCSS',
      json: 'JSON',
      xml: 'XML',
      markdown: 'Markdown',
      yaml: 'YAML',
      sql: 'SQL',
      shell: 'Shell',
    },
    justNow: 'Just now',
    minutesAgo: (minutes) => `${minutes} min ago`,
    hoursAgo: (hours) => `${hours} h ago`,
  },
};

const MARKDOWN_PREVIEW_TEXTS: Record<UiLanguage, MarkdownPreviewText> = {
  'zh-CN': {
    copySelection: '复制选中文本',
    copyMarkdown: '复制全文 Markdown',
    codeLanguage: '代码块语言',
    codeLanguagePlainText: '纯文本',
    codeLanguageChanged: (language) => `代码块语言已切换为 ${language}，Markdown 原文已更新`,
    codeLanguageUpdateFailed: '无法更新 Markdown 原文中的代码块语言',
    codeHighlightFailed: '代码语法高亮失败',
    copyCode: '复制代码',
    copyCodeDone: '代码已复制',
    copyCodeFailed: '复制代码失败',
    diagramView: '图表',
    diagramCodeView: '代码',
    diagramZoomOut: '缩小图表',
    diagramZoomIn: '放大图表',
    diagramZoomLevel: (percent) => `${percent}%`,
    diagramDownloadPng: '下载 PNG',
    diagramDownloadPngDone: 'PNG 已下载',
    diagramDownloadSvg: '下载 SVG',
    diagramDownloadSvgDone: 'SVG 已下载',
    diagramDownloadFailed: '下载流程图失败',
    diagramExportMenu: '导出或复制流程图',
    diagramCopyImage: '复制为图片',
    diagramCopyImageDone: '流程图图片已复制',
    diagramCopySvgTextDone: '当前环境不支持图片剪贴板，已复制 SVG 源码',
    diagramCopyImageFailed: '复制流程图图片失败',
    diagramFullscreen: '全屏查看',
    diagramExitFullscreen: '退出全屏',
    diagramFullscreenUnavailable: '当前环境不支持全屏查看',
    diagramFullscreenFailed: '无法进入全屏查看',
    refreshPreview: '刷新预览',
    previewThemeDocsClean: '切换到文档站清朗',
    previewThemePaperSoft: '切换到护眼纸张',
    previewThemeEditorialWarm: '切换到出版暖页',
    previewThemeGraphiteNight: '切换到夜读石墨',
    previewThemeMintGrove: '切换到林间薄荷',
    previewThemeLavenderLetter: '切换到雾紫信笺',
    previewThemeDeepOcean: '切换到深海蓝调',
    setPreviewModeEdit: '切换为仅编辑',
    setPreviewModeSplit: '切换为分栏',
    setPreviewModePreview: '切换为仅预览',
    openLink: '打开链接',
    openLinkNewWindow: '在新窗口打开链接',
    copyLink: '复制链接地址',
    openImage: '打开图片',
    openImageNewWindow: '在新窗口查看图片',
    copyImageSource: '复制图片地址',
  },
  'en-US': {
    copySelection: 'Copy Selected Text',
    copyMarkdown: 'Copy Full Markdown',
    codeLanguage: 'Code block language',
    codeLanguagePlainText: 'Plain Text',
    codeLanguageChanged: (language) => `Code block language changed to ${language}; Markdown source updated`,
    codeLanguageUpdateFailed: 'Unable to update the code block language in the Markdown source',
    codeHighlightFailed: 'Failed to highlight code syntax',
    copyCode: 'Copy Code',
    copyCodeDone: 'Code copied',
    copyCodeFailed: 'Failed to copy code',
    diagramView: 'Diagram',
    diagramCodeView: 'Code',
    diagramZoomOut: 'Zoom out diagram',
    diagramZoomIn: 'Zoom in diagram',
    diagramZoomLevel: (percent) => `${percent}%`,
    diagramDownloadPng: 'Download PNG',
    diagramDownloadPngDone: 'PNG downloaded',
    diagramDownloadSvg: 'Download SVG',
    diagramDownloadSvgDone: 'SVG downloaded',
    diagramDownloadFailed: 'Failed to download diagram',
    diagramExportMenu: 'Export or copy diagram',
    diagramCopyImage: 'Copy as image',
    diagramCopyImageDone: 'Diagram image copied',
    diagramCopySvgTextDone: 'Image clipboard is unavailable; SVG source copied',
    diagramCopyImageFailed: 'Failed to copy diagram image',
    diagramFullscreen: 'View fullscreen',
    diagramExitFullscreen: 'Exit fullscreen',
    diagramFullscreenUnavailable: 'Fullscreen is not supported in this environment',
    diagramFullscreenFailed: 'Unable to enter fullscreen',
    refreshPreview: 'Refresh Preview',
    previewThemeDocsClean: 'Switch to Docs Clean',
    previewThemePaperSoft: 'Switch to Paper Soft',
    previewThemeEditorialWarm: 'Switch to Editorial Warm',
    previewThemeGraphiteNight: 'Switch to Graphite Night',
    previewThemeMintGrove: 'Switch to Mint Grove',
    previewThemeLavenderLetter: 'Switch to Lavender Letter',
    previewThemeDeepOcean: 'Switch to Deep Ocean',
    setPreviewModeEdit: 'Switch to Edit Only',
    setPreviewModeSplit: 'Switch to Split',
    setPreviewModePreview: 'Switch to Preview Only',
    openLink: 'Open Link',
    openLinkNewWindow: 'Open Link in New Window',
    copyLink: 'Copy Link Address',
    openImage: 'Open Image',
    openImageNewWindow: 'View Image in New Window',
    copyImageSource: 'Copy Image Address',
  },
};

const EDITOR_CORE_TEXTS: Record<UiLanguage, EditorCoreText> = {
  'zh-CN': {
    contextUndo: '撤销',
    contextRedo: '重做',
    contextCut: '剪切',
    contextCopy: '复制',
    contextPaste: '粘贴',
    contextFind: '查找',
    contextReplace: '替换',
    contextSelectAll: '全选',
    contextCopyFilePath: '复制文件路径',
    contextRevealInFolder: '打开文件所在位置',
    contextNoFilePath: '当前标签没有文件路径',
    contextCopyPathDone: '文件路径已复制',
    contextCopyPathFailed: '复制文件路径失败',
    contextRevealFailed: '打开文件所在位置失败',
    searchPlaceholder: '查找',
    replacePlaceholder: '替换为',
    searchPrevious: '上一个',
    searchNext: '下一个',
    replaceOne: '替换',
    replaceAll: '全部替换',
    closeSearch: '关闭',
    searchResult: (current, total) => `${current}/${total}`,
    searchNoResult: '无匹配',
  },
  'en-US': {
    contextUndo: 'Undo',
    contextRedo: 'Redo',
    contextCut: 'Cut',
    contextCopy: 'Copy',
    contextPaste: 'Paste',
    contextFind: 'Find',
    contextReplace: 'Replace',
    contextSelectAll: 'Select All',
    contextCopyFilePath: 'Copy File Path',
    contextRevealInFolder: 'Reveal in Folder',
    contextNoFilePath: 'Current tab has no file path',
    contextCopyPathDone: 'File path copied',
    contextCopyPathFailed: 'Failed to copy file path',
    contextRevealFailed: 'Failed to open file location',
    searchPlaceholder: 'Find',
    replacePlaceholder: 'Replace with',
    searchPrevious: 'Previous',
    searchNext: 'Next',
    replaceOne: 'Replace',
    replaceAll: 'Replace All',
    closeSearch: 'Close',
    searchResult: (current, total) => `${current}/${total}`,
    searchNoResult: 'No matches',
  },
};

export function normalizeUiLanguage(value?: string | null): UiLanguage {
  if (!value) {
    return 'zh-CN';
  }

  if (SUPPORTED_LANGUAGES.includes(value as UiLanguage)) {
    return value as UiLanguage;
  }

  const lower = value.toLowerCase();
  if (lower.startsWith('en')) {
    return 'en-US';
  }

  return 'zh-CN';
}

export function getCommandText(locale: UiLanguage, id: CommandId): CommandText {
  return COMMAND_TEXTS[normalizeUiLanguage(locale)][id];
}

export function getCommandPaletteI18n(locale: UiLanguage): CommandPaletteText {
  return COMMAND_PALETTE_TEXTS[normalizeUiLanguage(locale)];
}

export function getAuthorInfoI18n(locale: UiLanguage): AuthorInfoText {
  return AUTHOR_INFO_TEXTS[normalizeUiLanguage(locale)];
}

export function getSettingsPanelI18n(locale: UiLanguage): SettingsPanelText {
  return SETTINGS_PANEL_TEXTS[normalizeUiLanguage(locale)];
}

export function getAppI18n(locale: UiLanguage): AppText {
  return APP_TEXTS[normalizeUiLanguage(locale)];
}

export function getToolbarI18n(locale: UiLanguage): ToolbarText {
  return TOOLBAR_TEXTS[normalizeUiLanguage(locale)];
}

export function getFileTreeI18n(locale: UiLanguage): FileTreeText {
  return FILE_TREE_TEXTS[normalizeUiLanguage(locale)];
}

export function getStatusBarI18n(locale: UiLanguage): StatusBarText {
  return STATUS_BAR_TEXTS[normalizeUiLanguage(locale)];
}

export function getEditorTabsI18n(locale: UiLanguage): EditorTabsText {
  return EDITOR_TABS_TEXTS[normalizeUiLanguage(locale)];
}

export function getMarkdownPreviewI18n(locale: UiLanguage): MarkdownPreviewText {
  return MARKDOWN_PREVIEW_TEXTS[normalizeUiLanguage(locale)];
}

export function getEditorCoreI18n(locale: UiLanguage): EditorCoreText {
  return EDITOR_CORE_TEXTS[normalizeUiLanguage(locale)];
}

// ---------------------------------------------------------------------------
// 云端文档浏览器
// ---------------------------------------------------------------------------
interface CloudDocBrowserText {
  title: string;
  close: string;
  searchPlaceholder: string;
  search: string;
  refresh: string;
  loading: string;
  retry: string;
  empty: string;
  emptySearch: string;
  open: string;
  count: (files: number, total: number) => string;
  truncated: (shown: number, total: number) => string;
  updatedAt: (value: string) => string;
  version: (version: number) => string;
  noContent: string;
  openFailed: (message: string) => string;
  workspaceRequired: string;
  /** 云文档落位：静默打开已有工作区后的提示 */
  landingSilentOpen: (workspaceName: string) => string;
  /** 云文档落位：落到临时工作区后的提示 */
  landingScratch: string;
  /** 云文档落位：原工作区已不存在时的提示 */
  landingStaleBinding: (path: string) => string;
  loginHint: string;
  loginAction: string;
  emptyDetail: (total: number, received: number, pages: number) => string;
  groupUncategorized: string;
  groupCustom: string;
  meError: (kind: string, message: string) => string;
  confirmTitle: string;
  confirmHint: (cloudPath: string) => string;
  overwrite: string;
  saveAs: string;
  cancel: string;
  cancelled: string;
  saveAsDone: (path: string) => string;
  /** 设计稿一「三栏工作台」外壳文案 */
  shell: CloudDocBrowserShellText;
}

/**
 * 云文档浏览弹窗「三栏工作台」外壳文案（设计稿一，SPEC §1.3）。
 * 独立成组，避免与树/侧栏共用的 CloudDocBrowserText 顶层字段混淆。
 */
interface CloudDocBrowserShellText {
  /** 左栏：工作空间（数据驱动：由云端路径 `tau/<workspace>/…` 派生，无后端空间实体） */
  workspaceSection: string;
  /** 首项固定「全部云端文档」 */
  workspaceAll: string;
  /** 一份文档都反查不出工作空间时的提示 */
  workspaceNone: string;
  /** 计数胶囊里的作用域提示 */
  workspaceScope: (workspace: string) => string;
  /** 左栏：目录树 */
  treeSection: string;
  collapseAll: string;
  /** 左栏：标签 */
  tagsSection: string;
  noTags: string;
  /** 左栏底栏 */
  syncEngine: string;
  syncReady: string;
  storageSettings: string;
  quotaUnknown: string;
  capacity: (label: string) => string;
  /** 标题栏 */
  searchFull: string;
  shortcut: string;
  closeWindow: string;
  refreshHint: string;
  /** 中间栏 */
  rootCrumb: string;
  formatAll: (count: number) => string;
  formatMarkdown: (count: number) => string;
  formatWord: (count: number) => string;
  formatCode: (count: number) => string;
  viewList: string;
  viewGrid: string;
  currentDir: (path: string) => string;
  selectedCount: (count: number) => string;
  allSynced: string;
  filterEmpty: string;
  clearFilters: string;
  /** 右栏检查器 */
  badgeMarkdown: string;
  badgeWord: string;
  badgeCode: string;
  badgeJson: string;
  badgeImage: string;
  badgeFile: string;
  syncing: string;
  creatorHash: (creator: string, hash: string) => string;
  creatorSelf: string;
  /** 检查器主按钮：与树的选择弹窗同一文案（「在编辑器中打开」） */
  editInEditor: string;
  downloadCopy: string;
  shareLink: string;
  desktopOnly: string;
  snapshotTitle: string;
  versionTitle: string;
  versionCurrent: (version: number) => string;
  versionInitial: string;
  versionInitialHint: string;
  versionSyncedHint: (version: number) => string;
  historyAction: string;
  noSelection: string;
  noSelectionHint: string;
}

const CLOUD_DOC_BROWSER_TEXTS: Record<UiLanguage, CloudDocBrowserText> = {
  'zh-CN': {
    title: '云端文档',
    close: '关闭',
    searchPlaceholder: '搜索云端文档',
    search: '搜索',
    refresh: '刷新',
    loading: '正在加载云端文档…',
    retry: '重试',
    empty: '云端还没有文档。',
    emptySearch: '没有匹配的云端文档。',
    open: '打开',
    count: (files, total) => `共 ${files} 个文件 · 云端匹配 ${total} 条`,
    truncated: (shown, total) => `仅显示前 ${shown} 条（云端共 ${total} 条）`,
    updatedAt: (value) => `更新 ${value}`,
    version: (version) => `v${version}`,
    noContent: '云端文档没有可下载的文本内容',
    openFailed: (message) => `打开失败：${message}`,
    workspaceRequired: '请先打开一个工作区，云文档需要落到工作区里。',
    landingSilentOpen: (workspaceName) => `已自动打开工作区「${workspaceName}」。`,
    landingScratch: '未找到原工作区，已在临时工作区中打开，仍可正常保存回云端。',
    landingStaleBinding: (path) => `原工作区已不存在（${path}），已在临时工作区中打开。`,
    loginHint: '登录 lizi 账号后，可在左侧直接浏览云端文档。',
    loginAction: '去登录',
    emptyDetail: (total, received, pages) => `诊断：服务端 total=${total}，实际拉到 ${received} 条，共请求 ${pages} 页。`,
    groupUncategorized: '未分类',
    groupCustom: '自定义分类',
    meError: (kind, message) => `配额接口异常（${kind}）：${message}`,
    confirmTitle: '本地已有同名文件',
    confirmHint: (cloudPath) => `${cloudPath} 在本地已存在且内容与云端不同，请选择如何处理。`,
    overwrite: '覆盖本地',
    saveAs: '另存为…',
    cancel: '取消',
    cancelled: '已取消打开，本地文件未改动。',
    saveAsDone: (path) => `已另存为 ${path}`,
    shell: {
      workspaceSection: '工作空间',
      workspaceAll: '全部云端文档',
      workspaceNone: '暂无工作空间',
      workspaceScope: (workspace) => `工作空间 ${workspace}`,
      treeSection: '文件目录树',
      collapseAll: '全部折叠',
      tagsSection: '标签筛选',
      noTags: '暂无标签',
      syncEngine: 'Tau Sync Engine',
      syncReady: '双向同步就绪',
      storageSettings: '存储设置',
      quotaUnknown: '配额待同步',
      capacity: (label) => `已用容量 ${label}`,
      searchFull: '搜索云端文档与全文…',
      shortcut: '⌘K',
      closeWindow: '关闭窗口 (Esc)',
      refreshHint: '刷新云端数据',
      rootCrumb: '云端根目录',
      formatAll: (count) => `全部 (${count})`,
      formatMarkdown: (count) => `Markdown (${count})`,
      formatWord: (count) => `Word (${count})`,
      formatCode: (count) => `代码脚本 (${count})`,
      viewList: '详细列表视图',
      viewGrid: '磁贴卡片视图',
      currentDir: (path) => `当前目录: ${path}`,
      selectedCount: (count) => `已选定 ${count} 个项目`,
      allSynced: '所有变更均已安全同步至云端集群',
      filterEmpty: '当前筛选条件下没有文档。',
      clearFilters: '清除筛选',
      badgeMarkdown: 'Markdown 文档',
      badgeWord: 'Word 文档',
      badgeCode: '代码脚本',
      badgeJson: 'JSON 配置',
      badgeImage: '图片资源',
      badgeFile: '云端文件',
      syncing: '云端同步中',
      creatorHash: (creator, hash) => `创建者: ${creator} · SHA-256: ${hash}`,
      creatorSelf: '本地工作台',
      editInEditor: '在编辑器中打开',
      downloadCopy: '下载副本',
      shareLink: '分享链接',
      desktopOnly: '该操作需在 Tau 桌面端使用。',
      snapshotTitle: '实时快照摘要',
      versionTitle: '版本记录 (Version History)',
      versionCurrent: (version) => `v${version} · 当前生效`,
      versionInitial: 'v1 · 初始创建',
      versionInitialHint: '从本地工作台初始化同步至云端',
      versionSyncedHint: (version) => `云端最新版本 v${version}`,
      historyAction: '查看全部版本',
      noSelection: '未选择文档',
      noSelectionHint: '在左侧目录树或中间列表选择一份云端文档，这里会显示它的快照与版本记录。',
    },
  },
  'en-US': {
    title: 'Cloud Documents',
    close: 'Close',
    searchPlaceholder: 'Search cloud documents',
    search: 'Search',
    refresh: 'Refresh',
    loading: 'Loading cloud documents…',
    retry: 'Retry',
    empty: 'No cloud documents yet.',
    emptySearch: 'No cloud documents match the search.',
    open: 'Open',
    count: (files, total) => `${files} files · ${total} matched in cloud`,
    truncated: (shown, total) => `Showing the first ${shown} of ${total} documents`,
    updatedAt: (value) => `Updated ${value}`,
    version: (version) => `v${version}`,
    noContent: 'The cloud document has no downloadable text content',
    openFailed: (message) => `Failed to open: ${message}`,
    workspaceRequired: 'Open a workspace first — cloud documents are written into it.',
    landingSilentOpen: (workspaceName) => `Opened workspace "${workspaceName}" automatically.`,
    landingScratch: 'Original workspace not found — opened in a temporary workspace. Saving to the cloud still works.',
    landingStaleBinding: (path) => `The original workspace is gone (${path}) — opened in a temporary workspace.`,
    loginHint: 'Sign in to lizi to browse cloud documents in the sidebar.',
    loginAction: 'Sign in',
    emptyDetail: (total, received, pages) => `Diagnostics: server total=${total}, fetched ${received} records in ${pages} page(s).`,
    groupUncategorized: 'Uncategorized',
    groupCustom: 'Custom categories',
    meError: (kind, message) => `Space API error (${kind}): ${message}`,
    confirmTitle: 'A local file already exists',
    confirmHint: (cloudPath) => `${cloudPath} exists locally with different content. Choose how to proceed.`,
    overwrite: 'Overwrite local',
    saveAs: 'Save as…',
    cancel: 'Cancel',
    cancelled: 'Open cancelled. Local file untouched.',
    saveAsDone: (path) => `Saved as ${path}`,
    shell: {
      workspaceSection: 'Workspaces',
      workspaceAll: 'All cloud documents',
      workspaceNone: 'No workspaces yet',
      workspaceScope: (workspace) => `workspace ${workspace}`,
      treeSection: 'File tree',
      collapseAll: 'Collapse all',
      tagsSection: 'Filter by tag',
      noTags: 'No tags yet',
      syncEngine: 'Tau Sync Engine',
      syncReady: 'Two-way sync ready',
      storageSettings: 'Storage settings',
      quotaUnknown: 'Quota pending',
      capacity: (label) => `Used ${label}`,
      searchFull: 'Search cloud documents and full text…',
      shortcut: '⌘K',
      closeWindow: 'Close window (Esc)',
      refreshHint: 'Refresh cloud data',
      rootCrumb: 'Cloud root',
      formatAll: (count) => `All (${count})`,
      formatMarkdown: (count) => `Markdown (${count})`,
      formatWord: (count) => `Word (${count})`,
      formatCode: (count) => `Scripts (${count})`,
      viewList: 'Detailed list view',
      viewGrid: 'Tile card view',
      currentDir: (path) => `Current: ${path}`,
      selectedCount: (count) => `${count} selected`,
      allSynced: 'All changes safely synced to the cloud cluster',
      filterEmpty: 'No documents match the current filters.',
      clearFilters: 'Clear filters',
      badgeMarkdown: 'Markdown doc',
      badgeWord: 'Word doc',
      badgeCode: 'Script',
      badgeJson: 'JSON config',
      badgeImage: 'Image',
      badgeFile: 'Cloud file',
      syncing: 'Syncing to cloud',
      creatorHash: (creator, hash) => `Creator: ${creator} · SHA-256: ${hash}`,
      creatorSelf: 'Local workbench',
      editInEditor: 'Open for editing',
      downloadCopy: 'Download copy',
      shareLink: 'Share link',
      desktopOnly: 'This action is available in the Tau desktop app.',
      snapshotTitle: 'Live snapshot',
      versionTitle: 'Version History',
      versionCurrent: (version) => `v${version} · current`,
      versionInitial: 'v1 · initial',
      versionInitialHint: 'Initialized from the local workbench to the cloud',
      versionSyncedHint: (version) => `Latest cloud revision v${version}`,
      historyAction: 'View all versions',
      noSelection: 'No document selected',
      noSelectionHint: 'Pick a cloud document from the tree or the list to see its snapshot and version history here.',
    },
  },
};

export function getCloudDocBrowserI18n(locale: UiLanguage): CloudDocBrowserText {
  return CLOUD_DOC_BROWSER_TEXTS[normalizeUiLanguage(locale)];
}

// ---------------------------------------------------------------------------
// 右键「同步至云端」弹窗
// ---------------------------------------------------------------------------
interface CloudDocSyncText {
  title: string;
  categoryLabel: string;
  searchPlaceholder: string;
  categoriesLoading: string;
  categoriesFailed: string;
  noCategories: string;
  none: string;
  newCategoryLabel: string;
  newCategoryPlaceholder: string;
  newCategoryHint: string;
  conflictTitle: string;
  conflictHint: string;
  overwrite: string;
  confirm: string;
  cancel: string;
  syncing: string;
  alreadySynced: string;
  assetsFailed: (count: number) => string;
  assetsSummary: (total: number, uploaded: number, unchanged: number) => string;
  assetsSkipped: (count: number) => string;
  expandDetails: string;
  collapseDetails: string;
  failed: (message: string) => string;
}

const CLOUD_DOC_SYNC_TEXTS: Record<UiLanguage, CloudDocSyncText> = {
  'zh-CN': {
    title: '同步至云端',
    categoryLabel: '分类',
    searchPlaceholder: '搜索分类',
    categoriesLoading: '正在读取分类…',
    categoriesFailed: '分类列表加载失败，可直接输入新分类名称。',
    noCategories: '云端还没有分类，可直接输入新分类名称。',
    none: '不分类',
    newCategoryLabel: '新建分类',
    newCategoryPlaceholder: '输入新分类名称',
    newCategoryHint: '选已有分类会清空这里；填了名称则按新分类上传（只作用于本文档）。',
    conflictTitle: '云端已有该文档',
    conflictHint: '云端内容与本地不同，继续将用本地内容覆盖云端。',
    overwrite: '覆盖云端',
    confirm: '确定同步',
    cancel: '取消',
    syncing: '同步中…',
    alreadySynced: '已是同步状态，无需重复上传',
    failed: (message) => `同步失败：${message}`,
    assetsFailed: (count) => `${count} 张图片失败`,
    assetsSummary: (total, uploaded, unchanged) => `图片 ${total} 张：已上传 ${uploaded}，无变化 ${unchanged}`,
    assetsSkipped: (count) => `${count} 张图片被跳过`,
    expandDetails: '展开原因',
    collapseDetails: '收起',
  },
  'en-US': {
    title: 'Sync to Cloud',
    categoryLabel: 'Category',
    searchPlaceholder: 'Search categories',
    categoriesLoading: 'Loading categories…',
    categoriesFailed: 'Failed to load categories — type a new category name instead.',
    noCategories: 'No cloud categories yet — type a new category name.',
    none: 'No category',
    newCategoryLabel: 'New category',
    newCategoryPlaceholder: 'Type a new category name',
    newCategoryHint: 'Picking an existing category clears this field; a typed name is uploaded only for this document.',
    conflictTitle: 'The cloud copy already exists',
    conflictHint: 'Cloud content differs from local. Continuing overwrites the cloud copy with local content.',
    overwrite: 'Overwrite cloud',
    confirm: 'Sync',
    cancel: 'Cancel',
    syncing: 'Syncing…',
    alreadySynced: 'Already in sync — nothing to upload',
    failed: (message) => `Sync failed: ${message}`,
    assetsFailed: (count) => `${count} image(s) failed`,
    assetsSummary: (total, uploaded, unchanged) => `${total} images: uploaded ${uploaded}, unchanged ${unchanged}`,
    assetsSkipped: (count) => `${count} image(s) skipped`,
    expandDetails: 'Show reasons',
    collapseDetails: 'Hide',
  },
};

export function getCloudDocSyncI18n(locale: UiLanguage): CloudDocSyncText {
  return CLOUD_DOC_SYNC_TEXTS[normalizeUiLanguage(locale)];
}
// ---------------------------------------------------------------------------
// 一键分享
// ---------------------------------------------------------------------------
interface CloudShareText {
  title: string;
  linkLabel: string;
  copy: string;
  open: string;
  regenerate: string;
  revoke: string;
  revoked: string;
  copied: string;
  copyManually: string;
  visits: string;
  createdAt: string;
  expiresAt: string;
  permanent: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  passwordState: string;
  passwordOn: string;
  clearPasswordLabel: string;
  expiryLabel: string;
  expiryPermanent: string;
  expiryDays: (days: number) => string;
  customDaysHint: string;
  expiryCustom: string;
  generate: string;
  working: string;
  syncing: string;
  conflictTitle: string;
  conflictHint: string;
  overwrite: string;
  cancel: string;
  close: string;
  noCloudFile: string;
  baseUrlMissing: string;
  fileTypeLabel: string;
  kindMarkdown: string;
  kindCode: string;
  kindText: string;
  kindImage: string;
  kindPdf: string;
  kindOffice: string;
  kindOther: string;
  relativeImagesHint: string;
  autoSynced: (version?: number) => string;
  imagesStatus: (total: number, synced: number) => string;
  imagesUnsynced: (pending: number) => string;
  imagesSyncDisabled: string;
    expandDetails: '展开原因',
    collapseDetails: '收起',
  binaryPreviewOnly: string;
  binarySizeLabel: string;
  binaryAlreadySynced: string;
  defaultCategoryFallback: string;
  failed: (message: string) => string;
  syncFailed: (message: string) => string;
}

const CLOUD_SHARE_TEXTS: Record<UiLanguage, CloudShareText> = {
  'zh-CN': {
    title: '一键分享',
    linkLabel: '分享链接',
    copy: '复制',
    open: '打开',
    regenerate: '重新生成',
    revoke: '撤销分享',
    revoked: '已撤销分享，旧链接已失效。',
    copied: '链接已复制到剪贴板。',
    copyManually: '自动复制失败，请手动复制上面的链接。',
    visits: '访问次数',
    createdAt: '创建时间',
    expiresAt: '有效期至',
    permanent: '永久有效',
    passwordLabel: '访问密码',
    passwordPlaceholder: '留空表示无密码',
    passwordState: '访问密码',
    passwordOn: '已设置',
    clearPasswordLabel: '重新生成时移除访问密码',
    expiryLabel: '有效期',
    expiryPermanent: '永久',
    expiryDays: (days) => `${days} 天`,
    customDaysHint: '自定义天数',
    expiryCustom: '自定义',
    generate: '生成链接',
    working: '处理中…',
    syncing: '正在同步到云端…',
    conflictTitle: '云端已有该文档',
    conflictHint: '云端内容与本地不同，继续将用本地内容覆盖云端后再分享。',
    overwrite: '覆盖云端并继续',
    cancel: '取消',
    close: '关闭',
    noCloudFile: '还没有云端文档，无法生成分享链接。',
    baseUrlMissing: '分享域名未配置：请到后台配置 SHARE_BASE_URL（仍可生成，但不会复制出错误链接）。',
    fileTypeLabel: '文件类型',
    kindMarkdown: 'Markdown 文档',
    kindCode: '代码',
    kindText: '纯文本',
    kindImage: '图片',
    kindPdf: 'PDF',
    kindOffice: 'Office 文档',
    kindOther: '其他文件',
    relativeImagesHint: '文中含相对路径图片：图片暂不随文档同步，分享页会显示「图片未同步」占位。',
    autoSynced: (version) => (version ? `已自动同步到云端（v${version}）` : '已自动同步到云端'),
    imagesStatus: (total, synced) => `图片 ${total} 张，已同步 ${synced} 张`,
    imagesUnsynced: (pending) => `有 ${pending} 张图片未同步，分享页会显示占位`,
    imagesSyncDisabled: '「同步文档内图片」已关闭，文中图片不会同步',
    expandDetails: '展开原因',
    collapseDetails: '收起',
    binaryPreviewOnly: '仅在线预览，不提供下载',
    binarySizeLabel: '大小',
    binaryAlreadySynced: '云端已有该文件，直接复用（V1 不支持覆盖更新）',
    defaultCategoryFallback: '分享',
    failed: (message) => `操作失败：${message}`,
    syncFailed: (message) => `同步失败：${message}`,
  },
  'en-US': {
    title: 'Share',
    linkLabel: 'Share link',
    copy: 'Copy',
    open: 'Open',
    regenerate: 'Regenerate',
    revoke: 'Revoke',
    revoked: 'Share revoked — the old link no longer works.',
    copied: 'Link copied to clipboard.',
    copyManually: 'Auto-copy failed — please copy the link manually.',
    visits: 'Visits',
    createdAt: 'Created',
    expiresAt: 'Expires',
    permanent: 'Never expires',
    passwordLabel: 'Access password',
    passwordPlaceholder: 'Leave empty for no password',
    passwordState: 'Password',
    passwordOn: 'Enabled',
    clearPasswordLabel: 'Remove the access password when regenerating',
    expiryLabel: 'Expiry',
    expiryPermanent: 'Permanent',
    expiryDays: (days) => `${days} day${days === 1 ? '' : 's'}`,
    customDaysHint: 'custom days',
    expiryCustom: 'Custom',
    generate: 'Generate link',
    working: 'Working…',
    syncing: 'Syncing to cloud…',
    conflictTitle: 'The cloud copy already exists',
    conflictHint: 'Cloud content differs. Continuing overwrites the cloud copy before sharing.',
    overwrite: 'Overwrite and continue',
    cancel: 'Cancel',
    close: 'Close',
    noCloudFile: 'No cloud document yet — cannot create a share link.',
    baseUrlMissing: 'Share domain is not configured — set SHARE_BASE_URL in the admin backend (you can still generate, but no link will be copied).',
    fileTypeLabel: 'File type',
    kindMarkdown: 'Markdown',
    kindCode: 'Code',
    kindText: 'Plain text',
    kindImage: 'Image',
    kindPdf: 'PDF',
    kindOffice: 'Office document',
    kindOther: 'Other file',
    relativeImagesHint: 'This document references relative images: they are not synced yet, so the share page shows an “image not synced” placeholder.',
    autoSynced: (version) => (version ? `Synced to cloud automatically (v${version})` : 'Synced to cloud automatically'),
    imagesStatus: (total, synced) => `${synced} of ${total} images synced`,
    imagesUnsynced: (pending) => `${pending} image(s) not synced - the share page shows placeholders`,
    imagesSyncDisabled: 'Image sync is off - images in this document are not synced',
    expandDetails: '展开原因',
    collapseDetails: '收起',
    binaryPreviewOnly: 'Online preview only - download is not provided',
    binarySizeLabel: 'Size',
    binaryAlreadySynced: 'Already in cloud - reused (no overwrite in V1)',
    defaultCategoryFallback: 'Shared',
    failed: (message) => `Failed: ${message}`,
    syncFailed: (message) => `Sync failed: ${message}`,
  },
};

export function getCloudShareI18n(locale: UiLanguage): CloudShareText {
  return CLOUD_SHARE_TEXTS[normalizeUiLanguage(locale)];
}

// ---------------------------------------------------------------------------
// 云端文档面板：版本历史 / 属性 / 右键菜单 / 分类管理
// ---------------------------------------------------------------------------
interface CloudDocPanelText {
  historyTitle: (fileName: string) => string;
  historyEmpty: string;
  historyLoading: string;
  versionLabel: (version: number) => string;
  currentVersion: string;
  restore: string;
  restoreDone: (version: number) => string;
  timeLabel: string;
  sizeLabel: string;
  remarkLabel: string;

  propsTitle: string;
  fileNameLabel: string;
  pathLabel: string;
  categoryLabel: string;
  tagsLabel: string;
  visibilityLabel: string;
  visibilityPrivate: string;
  visibilityPublic: string;
  currentVersionLabel: string;
  createdAtLabel: string;
  updatedAtLabel: string;
  sharedLabel: string;
  sharedYes: string;
  sharedNo: string;
  save: string;
  saving: string;
  saved: string;
  nothingChanged: string;
  loadFailed: (message: string) => string;

  menuOpen: string;
  menuSync: string;
  menuShare: string;
  menuProperties: string;
  menuHistory: string;
  menuMoveTo: string;
  menuDelete: string;
  /** 右键菜单头部标题（设计稿三：云端文档快捷操作） */
  menuHeader: string;
  /** 表格模式（设计稿一）列头 */
  colName: string;
  colSize: string;
  colVersion: string;
  colUpdatedAt: string;
  colActions: string;
  /** 表格模式行尾按钮：在编辑器中载入 */
  loadInEditor: string;
  /** 资源管理器「云端文档」分区头标题（设计稿三：云端文档库） */
  libraryTitle: string;
  /** 分区头文件计数胶囊：6 项文件 */
  fileCountPill: (count: number) => string;
  moveRoot: string;
  deleteConfirm: string;
  deleteDone: string;
  moveDone: string;
  moveFailed: (message: string) => string;
  deleteFailed: (message: string) => string;
  syncUnsupported: string;

  newCategory: string;
  newSubCategory: string;
  renameCategory: string;
  deleteCategory: string;
  deleteCategoryConfirm: string;
  deleteCategoryDone: string;
  categoryNamePlaceholder: string;
  maxDepthReached: string;
  createDone: string;
  renameDone: string;
  confirm: string;
  cancel: string;
  close: string;
  choiceTitle: string;
  choiceHint: string;
  choiceSaveAs: string;
  /** 选择题主按钮：在编辑器中打开（替代已移除的只读预览） */
  editInEditor: string;
  previewUnsupported: string;
  saveAsDone: (path: string) => string;
  saveAsFailed: (message: string) => string;
}

const CLOUD_DOC_PANEL_TEXTS: Record<UiLanguage, CloudDocPanelText> = {
  'zh-CN': {
    historyTitle: (fileName) => `《${fileName}》的历史版本`,
    historyEmpty: '暂无历史版本',
    historyLoading: '正在读取历史版本…',
    versionLabel: (version) => `版本 v${version}`,
    currentVersion: '当前版本',
    restore: '恢复到此版本',
    restoreDone: (version) => `已恢复到 v${version}`,
    timeLabel: '时间',
    sizeLabel: '大小',
    remarkLabel: '说明',

    propsTitle: '文档属性',
    fileNameLabel: '文件名',
    pathLabel: '路径',
    categoryLabel: '分类',
    tagsLabel: '标签',
    visibilityLabel: '可见性',
    visibilityPrivate: '私有（仅自己可见）',
    visibilityPublic: '公开（可被博客浏览）',
    currentVersionLabel: '当前版本',
    createdAtLabel: '创建时间',
    updatedAtLabel: '更新时间',
    sharedLabel: '分享状态',
    sharedYes: '已分享',
    sharedNo: '未分享',
    save: '保存',
    saving: '保存中…',
    saved: '已保存',
    nothingChanged: '没有改动',
    loadFailed: (message) => `读取失败：${message}`,

    menuOpen: '打开',
    menuSync: '同步至云端',
    menuShare: '一键分享',
    menuProperties: '属性',
    menuHistory: '历史版本',
    menuMoveTo: '移动到…',
    menuDelete: '删除云端文档',
    menuHeader: '云端文档快捷操作',
    colName: '文件名称',
    colSize: '大小',
    colVersion: '版本',
    colUpdatedAt: '云端更新时间',
    colActions: '操作',
    loadInEditor: '在编辑器中载入',
    libraryTitle: '云端文档库',
    fileCountPill: (count) => `${count} 项文件`,
    moveRoot: '未分类',
    deleteConfirm: '确定删除这个云端文档吗？删除后不可恢复。',
    deleteDone: '已删除云端文档',
    moveDone: '已移动分类',
    moveFailed: (message) => `移动失败：${message}`,
    deleteFailed: (message) => `删除失败：${message}`,
    syncUnsupported: '当前文档不支持云同步',

    newCategory: '新建分类',
    newSubCategory: '新建子分类',
    renameCategory: '重命名',
    deleteCategory: '删除分类',
    deleteCategoryConfirm: '删除后该分类下的文档会变为未分类，确定删除吗？',
    deleteCategoryDone: '已删除分类',
    categoryNamePlaceholder: '输入分类名称',
    maxDepthReached: '分类最多三级，不能继续新建子分类',
    createDone: '已新建分类',
    renameDone: '已重命名分类',
    confirm: '确定',
    cancel: '取消',
    close: '关闭',
    choiceTitle: '该云文档不在当前工作区',
    choiceHint: '可以直接在编辑器里打开并同步回云端，或另存到本地任意位置。',
    choiceSaveAs: '另存为…',
    editInEditor: '在编辑器中打开',
    previewUnsupported: '该类型暂不支持应用内预览，请使用「另存为…」或分享页在线预览',
    saveAsDone: (path) => `已另存为 ${path}`,
    saveAsFailed: (message) => `另存失败：${message}`,
  },
  'en-US': {
    historyTitle: (fileName) => `Version history - ${fileName}`,
    historyEmpty: 'No versions yet',
    historyLoading: 'Loading versions…',
    versionLabel: (version) => `Version v${version}`,
    currentVersion: 'Current',
    restore: 'Restore this version',
    restoreDone: (version) => `Restored to v${version}`,
    timeLabel: 'Time',
    sizeLabel: 'Size',
    remarkLabel: 'Note',

    propsTitle: 'Document properties',
    fileNameLabel: 'Name',
    pathLabel: 'Path',
    categoryLabel: 'Category',
    tagsLabel: 'Tags',
    visibilityLabel: 'Visibility',
    visibilityPrivate: 'Private (only you)',
    visibilityPublic: 'Public (visible on the blog)',
    currentVersionLabel: 'Version',
    createdAtLabel: 'Created',
    updatedAtLabel: 'Updated',
    sharedLabel: 'Share',
    sharedYes: 'Shared',
    sharedNo: 'Not shared',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved',
    nothingChanged: 'Nothing changed',
    loadFailed: (message) => `Failed to load: ${message}`,

    menuOpen: 'Open',
    menuSync: 'Sync to cloud',
    menuShare: 'Share',
    menuProperties: 'Properties',
    menuHistory: 'Version history',
    menuMoveTo: 'Move to…',
    menuDelete: 'Delete cloud document',
    menuHeader: 'Cloud document actions',
    colName: 'Name',
    colSize: 'Size',
    colVersion: 'Version',
    colUpdatedAt: 'Cloud updated',
    colActions: 'Actions',
    loadInEditor: 'Load in editor',
    libraryTitle: 'Cloud library',
    fileCountPill: (count) => `${count} files`,
    moveRoot: 'Uncategorized',
    deleteConfirm: 'Delete this cloud document? This cannot be undone.',
    deleteDone: 'Cloud document deleted',
    moveDone: 'Category updated',
    moveFailed: (message) => `Move failed: ${message}`,
    deleteFailed: (message) => `Delete failed: ${message}`,
    syncUnsupported: 'This document cannot be synced',

    newCategory: 'New category',
    newSubCategory: 'New subcategory',
    renameCategory: 'Rename',
    deleteCategory: 'Delete category',
    deleteCategoryConfirm: 'Documents in this category become uncategorized. Delete it?',
    deleteCategoryDone: 'Category deleted',
    categoryNamePlaceholder: 'Category name',
    maxDepthReached: 'Categories support up to three levels',
    createDone: 'Category created',
    renameDone: 'Category renamed',
    confirm: 'OK',
    cancel: 'Cancel',
    close: 'Close',
    choiceTitle: 'This cloud document is outside the current workspace',
    choiceHint: 'Open it in the editor and sync changes back, or save a copy anywhere on disk.',
    choiceSaveAs: 'Save as…',
    editInEditor: 'Open for editing',
    previewUnsupported: 'Preview is not available for this type - use Save as or the share page',
    saveAsDone: (path) => `Saved to ${path}`,
    saveAsFailed: (message) => `Save failed: ${message}`,
  },
};

export function getCloudDocPanelI18n(locale: UiLanguage): CloudDocPanelText {
  return CLOUD_DOC_PANEL_TEXTS[normalizeUiLanguage(locale)];
}

// ---------------------------------------------------------------------------
// 分享统计（查看次数 / 独立访客 / 近 N 天）
// ---------------------------------------------------------------------------
interface ShareStatsText {
  title: string;
  subtitle: (fileName: string) => string;
  loading: string;
  empty: string;
  error: (message: string) => string;
  noPermission: string;
  totalViews: string;
  uniqueVisitors: string;
  firstView: string;
  lastView: string;
  chartTitle: (days: number) => string;
  chartEmpty: string;
  recentTitle: string;
  recentEmpty: string;
  newVisitor: string;
  returningVisitor: string;
  unknownIp: string;
  unknownFingerprint: string;
  viewsUnit: (count: number) => string;
  refresh: string;
  close: string;
  statsLine: (views: number, visitors: number) => string;
  openStats: string;
}

const SHARE_STATS_TEXTS: Record<UiLanguage, ShareStatsText> = {
  'zh-CN': {
    title: '分享统计',
    subtitle: (fileName) => `《${fileName}》的分享访问`,
    loading: '正在读取统计…',
    empty: '还没有人访问这个分享链接',
    error: (message) => `读取统计失败：${message}`,
    noPermission: '只有文档所有者可以查看统计',
    totalViews: '总访问',
    uniqueVisitors: '独立访客',
    firstView: '首次访问',
    lastView: '最近访问',
    chartTitle: (days) => `近 ${days} 天访问趋势`,
    chartEmpty: '这段时间没有访问',
    recentTitle: '最近访问',
    recentEmpty: '暂无访问记录',
    newVisitor: '新访客',
    returningVisitor: '回访',
    unknownIp: 'IP 未知',
    unknownFingerprint: '无指纹',
    viewsUnit: (count) => `${count} 次`,
    refresh: '刷新',
    close: '关闭',
    statsLine: (views, visitors) => `查看 ${views} 次 · 独立访客 ${visitors}`,
    openStats: '查看统计',
  },
  'en-US': {
    title: 'Share statistics',
    subtitle: (fileName) => `Share visits - ${fileName}`,
    loading: 'Loading statistics…',
    empty: 'No one has visited this share link yet',
    error: (message) => `Failed to load statistics: ${message}`,
    noPermission: 'Only the document owner can view statistics',
    totalViews: 'Total views',
    uniqueVisitors: 'Unique visitors',
    firstView: 'First view',
    lastView: 'Last view',
    chartTitle: (days) => `Views in the last ${days} days`,
    chartEmpty: 'No visits in this period',
    recentTitle: 'Recent visits',
    recentEmpty: 'No visits yet',
    newVisitor: 'New',
    returningVisitor: 'Returning',
    unknownIp: 'Unknown IP',
    unknownFingerprint: 'No fingerprint',
    viewsUnit: (count) => `${count}`,
    refresh: 'Refresh',
    close: 'Close',
    statsLine: (views, visitors) => `${views} views · ${visitors} unique visitors`,
    openStats: 'View statistics',
  },
};

export function getShareStatsI18n(locale: UiLanguage): ShareStatsText {
  return SHARE_STATS_TEXTS[normalizeUiLanguage(locale)];
}

// ---------------------------------------------------------------------------
// 临时工作区（云文档零工作区落位）
// ---------------------------------------------------------------------------

interface ScratchWorkspaceText {
  badge: string;
  hint: string;
  saveAs: string;
  saving: string;
  saveAsDialogTitle: string;
  savedTitle: string;
  savedMessage: (
    workspaceName: string,
    copied: number,
    skipped: number,
    failed: number,
  ) => string;
  saveFailed: string;
  targetInvalid: string;
  silentHint: string;
  /** 另存后有个别标签没能跟着换目录（只提示一次） */
  relocateSkippedTitle: string;
  relocateSkippedMessage: (occupied: number, notCopied: number) => string;
}

const SCRATCH_WORKSPACE_TEXTS: Record<UiLanguage, ScratchWorkspaceText> = {
  'zh-CN': {
    badge: '临时工作区 · 来自云文档',
    hint: '文件暂存在本机临时目录，编辑后保存回云端不受影响。',
    saveAs: '另存到工作区…',
    saving: '正在复制…',
    saveAsDialogTitle: '选择要另存到的工作区目录',
    savedTitle: '已另存到工作区',
    savedMessage: (workspaceName, copied, skipped, failed) => [
      `已复制 ${copied} 个文件到「${workspaceName}」`,
      skipped > 0 ? `跳过 ${skipped} 个同名文件（不覆盖）` : '',
      failed > 0 ? `${failed} 个文件复制失败` : '',
    ].filter(Boolean).join('，') + '。',
    saveFailed: '另存到工作区失败',
    targetInvalid: '目标目录不能在临时工作区内部（含自身），请换一个目录。',
    silentHint: '为云文档自动打开了该工作区',
    relocateSkippedTitle: '部分标签仍在临时工作区',
    relocateSkippedMessage: (occupied, notCopied) => [
      occupied > 0 ? `${occupied} 个标签的目标文件已被其它标签打开` : '',
      notCopied > 0 ? `${notCopied} 个标签的目标已有同名文件（未覆盖）` : '',
    ].filter(Boolean).join('，') + '；这些标签保持原路径，未做迁移。',
  },
  'en-US': {
    badge: 'Temporary workspace · from cloud docs',
    hint: 'Files sit in a local temporary folder; saving back to the cloud is unaffected.',
    saveAs: 'Save to workspace…',
    saving: 'Copying…',
    saveAsDialogTitle: 'Choose the workspace folder to save into',
    savedTitle: 'Saved to workspace',
    savedMessage: (workspaceName, copied, skipped, failed) => [
      `Copied ${copied} file(s) to "${workspaceName}"`,
      skipped > 0 ? `skipped ${skipped} existing file(s) (no overwrite)` : '',
      failed > 0 ? `${failed} file(s) failed to copy` : '',
    ].filter(Boolean).join(', ') + '.',
    saveFailed: 'Failed to save to workspace',
    targetInvalid: 'The target folder cannot be inside the temporary workspace (or be itself).',
    silentHint: 'This workspace was opened automatically for a cloud document',
    relocateSkippedTitle: 'Some tabs still point at the temporary workspace',
    relocateSkippedMessage: (occupied, notCopied) => [
      occupied > 0 ? `${occupied} tab(s) whose target file is already open` : '',
      notCopied > 0 ? `${notCopied} tab(s) whose target already had a file with that name (not overwritten)` : '',
    ].filter(Boolean).join(', ') + '; those tabs keep their old path.',
  },
};

export function getScratchWorkspaceI18n(locale: UiLanguage): ScratchWorkspaceText {
  return SCRATCH_WORKSPACE_TEXTS[normalizeUiLanguage(locale)];
}

/**
 * 设计稿二（设置-云同步）重排后新增的「展示层」文案：
 * Bento 遥测四卡、调度中心、队列遥测、自动化策略、媒体资产、安全徽标。
 * 旧的 SettingsPanelText.cloudSync* 仍承载账号/表单/冲突等既有交互，这里只补设计稿新增词，
 * 两边都必须是中英文齐全。
 */
export interface CloudSyncSettingsText {
  h1: string;
  subtitle: string;
  corePill: string;
  diagnose: string;
  diagnosing: string;
  diagnoseOk: (ms: number) => string;
  diagnoseFailed: string;
  tlsPill: string;
  telemetryLiveVersion: string;
  telemetryStable: string;
  telemetryBuild: string;
  telemetryNoPendingPatch: string;
  telemetryClusterVersion: string;
  telemetrySynced: string;
  telemetryChannel: string;
  telemetryPlatform: string;
  telemetryRuntime: string;
  telemetryLatency: string;
  telemetryPacketLoss: string;
  telemetryTunnel: string;
  telemetryUnknown: string;
  telemetryMockNote: string;
  accountUid: string;
  accountCredential: string;
  accountSwitch: string;
  planKnown: string;
  planUnknown: string;
  quotaPermanent: string;
  quotaDocData: string;
  quotaAttachments: string;
  quotaSplitUnknown: string;
  quotaUpgrade: string;
  schedulerTitle: string;
  /** 调度中心说明：设计稿原文（与 cloudSyncDesc 的登录口吻不同，已登录也成立） */
  schedulerHint: string;
  schedulerIdle: string;
  schedulerSyncing: string;
  schedulerError: string;
  schedulerTask: (id: string) => string;
  feedbackSyncing: string;
  queueTitle: string;
  queueCounts: (pending: number, failed: number) => string;
  queueEmptyTitle: string;
  queueEmptyHint: string;
  queueBlockedHint: (failed: number) => string;
  queuePendingHint: (pending: number) => string;
  queueRefresh: string;
  queueRefreshing: string;
  automationTitle: string;
  automationActive: string;
  automationAutoHint: string;
  automationDebounceLabel: string;
  automationDebounceHint: string;
  automationSec: string;
  automationConflictTitle: string;
  automationConflictBranch: string;
  automationConflictBranchHint: string;
  automationConflictLocal: string;
  automationConflictLocalHint: string;
  mediaTitle: string;
  mediaCacheLabel: string;
  mediaCacheUnknown: string;
  mediaTranscodeLabel: string;
  mediaEnabled: string;
  mediaDisabled: string;
  mediaClearCache: string;
  mediaClearing: string;
  mediaCacheCleared: string;
  mediaAutoTidy: string;
  securityText: string;
  signedOutTitle: string;
  signedOutHint: string;
  errorTitle: string;
  errorHint: string;
}

const CLOUD_SYNC_SETTINGS_TEXTS: Record<UiLanguage, CloudSyncSettingsText> = {
  'zh-CN': {
    h1: '云同步服务',
    subtitle: '基于端到端零知识加密协议（E2EE），实时守护并同步 Markdown 笔记与代码资产',
    corePill: 'Lizi Sync Core v3',
    diagnose: '诊断节点链路',
    diagnosing: '探测链路中…',
    diagnoseOk: (ms) => `节点延时 ${ms}ms (极佳)`,
    diagnoseFailed: '链路探测失败',
    tlsPill: 'TLS 1.3 · AES-GCM-256',
    telemetryLiveVersion: '当前运行版本',
    telemetryStable: 'Stable',
    telemetryBuild: '构建目标',
    telemetryNoPendingPatch: '无未结补丁',
    telemetryClusterVersion: '云端集群版本',
    telemetrySynced: '已同步',
    telemetryChannel: '通道',
    telemetryPlatform: '本地环境架构',
    telemetryRuntime: '运行环境',
    telemetryLatency: '集群往返时延',
    telemetryPacketLoss: '/ 0% 丢包',
    telemetryTunnel: '加密隧道',
    telemetryUnknown: '—',
    telemetryMockNote: '设计稿示例值（暂无后端接口）',
    accountUid: 'UID',
    accountCredential: '凭据安全托管于 Windows Credential Manager',
    accountSwitch: '切换账号',
    planKnown: '永久容量',
    planUnknown: '未读取配额',
    quotaPermanent: '永久容量',
    quotaDocData: '文档数据',
    quotaAttachments: '嵌入式附件',
    quotaSplitUnknown: '云端未细分',
    quotaUpgrade: '扩容方案',
    schedulerTitle: '文档调度中心',
    schedulerHint: '登录已绑定的统一开发者通行证后，可对当前 Markdown 知识库一键双向合并。远端增量树与本地冲突引擎已就绪。',
    schedulerIdle: 'Idle / 就绪状态',
    schedulerSyncing: 'Syncing / 同步中',
    schedulerError: 'Error / 异常',
    schedulerTask: (id) => `Task #${id}`,
    feedbackSyncing: '正在向集群同步当前索引分支…',
    queueTitle: '同步队列遥测',
    queueCounts: (pending, failed) => `${pending} 项挂起 · ${failed} 项阻塞`,
    queueEmptyTitle: '同步队列为空 (Queue Cleared)',
    queueEmptyHint: '本地文档快照与分布式持久化节点完全对齐。',
    queueBlockedHint: (failed) => `有 ${failed} 项同步失败已阻塞队列，重试后才会继续。`,
    queuePendingHint: (pending) => `有 ${pending} 项正在后台增量提交，完成后队列自动清空。`,
    queueRefresh: '刷新状态',
    queueRefreshing: '刷新中…',
    automationTitle: '自动化触发策略',
    automationActive: 'Active',
    automationAutoHint: '文档产生修改后自动在后台触发增量 Diff 提交。',
    automationDebounceLabel: '保存后延迟防抖 (秒)',
    automationDebounceHint: '保存后等待静默期再触发远端增量推送，避免快速连击保存产生多余版本快照。',
    automationSec: 'sec',
    automationConflictTitle: '多端冲突解决机制',
    automationConflictBranch: '冲突时自动创建分支副本 (推荐)',
    automationConflictBranchHint: '保留两端版本，文件名附带设备标识与时间戳',
    automationConflictLocal: '以本地修改为准覆盖 (Keep Local)',
    automationConflictLocalHint: '强制覆盖云端冲突文件，适合单人高频写作',
    mediaTitle: '媒体资产与附件同步',
    mediaCacheLabel: '本地离线图片缓存池',
    mediaCacheUnknown: '未统计',
    mediaTranscodeLabel: '智能 WebP 矢量转码加速',
    mediaEnabled: '已启用',
    mediaDisabled: '未启用',
    mediaClearCache: '清理本地媒体缓存',
    mediaClearing: '清理中…',
    mediaCacheCleared: '已清理本地媒体缓存。',
    mediaAutoTidy: '自动定期整理',
    securityText: '所有通讯均通过 TLS 1.3 双向认证管道。Tau 绝不会明文存储您的未加密写作草稿与访问密钥。',
    signedOutTitle: '登录统一开发者通行证',
    signedOutHint: '登录后即可查看账号、云端配额与同步队列。凭据只保存在本机。',
    errorTitle: '云同步服务异常',
    errorHint: '最近一次同步失败，可重试失败项或重新诊断节点链路。',
  },
  'en-US': {
    h1: 'Cloud Sync Service',
    subtitle: 'End-to-end zero-knowledge encrypted (E2EE); keeps Markdown notes and code assets in sync in real time.',
    corePill: 'Lizi Sync Core v3',
    diagnose: 'Diagnose node link',
    diagnosing: 'Probing link…',
    diagnoseOk: (ms) => `Node latency ${ms}ms (excellent)`,
    diagnoseFailed: 'Link probe failed',
    tlsPill: 'TLS 1.3 · AES-GCM-256',
    telemetryLiveVersion: 'Running version',
    telemetryStable: 'Stable',
    telemetryBuild: 'Build target',
    telemetryNoPendingPatch: 'No open patches',
    telemetryClusterVersion: 'Cloud cluster version',
    telemetrySynced: 'Synced',
    telemetryChannel: 'Channel',
    telemetryPlatform: 'Local architecture',
    telemetryRuntime: 'Runtime',
    telemetryLatency: 'Cluster round-trip',
    telemetryPacketLoss: '/ 0% loss',
    telemetryTunnel: 'Encrypted tunnel',
    telemetryUnknown: '—',
    telemetryMockNote: 'Design mock value (no backend endpoint yet)',
    accountUid: 'UID',
    accountCredential: 'Credentials are kept in Windows Credential Manager',
    accountSwitch: 'Switch account',
    planKnown: 'Lifetime capacity',
    planUnknown: 'Quota not read',
    quotaPermanent: 'lifetime capacity',
    quotaDocData: 'Documents',
    quotaAttachments: 'Embedded media',
    quotaSplitUnknown: 'not split by cloud',
    quotaUpgrade: 'Upgrade plan',
    schedulerTitle: 'Document Scheduler',
    schedulerHint: 'Once your unified developer pass is signed in, the current Markdown knowledge base can be merged in both directions in one click. The remote incremental tree and local conflict engine are ready.',
    schedulerIdle: 'Idle / ready',
    schedulerSyncing: 'Syncing / in progress',
    schedulerError: 'Error / attention needed',
    schedulerTask: (id) => `Task #${id}`,
    feedbackSyncing: 'Pushing the current index branch to the cluster…',
    queueTitle: 'Sync Queue Telemetry',
    queueCounts: (pending, failed) => `${pending} pending · ${failed} blocked`,
    queueEmptyTitle: 'Sync queue is empty (Queue Cleared)',
    queueEmptyHint: 'Local snapshots are fully aligned with the distributed persistence nodes.',
    queueBlockedHint: (failed) => `${failed} item(s) failed and are blocking the queue. Retry to continue.`,
    queuePendingHint: (pending) => `${pending} item(s) are being pushed incrementally in the background; the queue clears itself when done.`,
    queueRefresh: 'Refresh status',
    queueRefreshing: 'Refreshing…',
    automationTitle: 'Automation Policy',
    automationActive: 'Active',
    automationAutoHint: 'Triggers an incremental diff commit in the background after the document changes.',
    automationDebounceLabel: 'Debounce after save (seconds)',
    automationDebounceHint: 'Waits for a quiet window after saving before pushing an incremental update, so rapid saves do not create extra version snapshots.',
    automationSec: 'sec',
    automationConflictTitle: 'Multi-device conflict policy',
    automationConflictBranch: 'Create a branch copy on conflict (recommended)',
    automationConflictBranchHint: 'Keeps both sides; the file name carries the device id and timestamp',
    automationConflictLocal: 'Overwrite with local changes (Keep Local)',
    automationConflictLocalHint: 'Force-overwrites the conflicting cloud file. Suits fast single-author writing.',
    mediaTitle: 'Media Assets & Attachments',
    mediaCacheLabel: 'Local offline image cache',
    mediaCacheUnknown: 'not measured',
    mediaTranscodeLabel: 'Smart WebP transcoding',
    mediaEnabled: 'Enabled',
    mediaDisabled: 'Disabled',
    mediaClearCache: 'Clear local media cache',
    mediaClearing: 'Clearing…',
    mediaCacheCleared: 'Local media cache cleared.',
    mediaAutoTidy: 'Auto tidy-up',
    securityText: 'All traffic goes through the TLS 1.3 mutual-authentication pipe. Tau never stores your unencrypted drafts or access keys in plain text.',
    signedOutTitle: 'Sign in with your developer pass',
    signedOutHint: 'Sign in to see your account, cloud quota and sync queue. Credentials stay on this device.',
    errorTitle: 'Cloud sync service error',
    errorHint: 'The last sync failed. Retry the failed items or diagnose the node link again.',
  },
};

export function getCloudSyncSettingsI18n(locale: UiLanguage): CloudSyncSettingsText {
  return CLOUD_SYNC_SETTINGS_TEXTS[normalizeUiLanguage(locale)];
}

// ---------------------------------------------------------------------------
// 云文档在线编辑：409 冲突三选一 + 「在编辑器中打开」提示
// ---------------------------------------------------------------------------

/** 云端保存冲突（409）对话框文案。 */
export interface CloudDocConflictText {
  title: string;
  close: string;
  intro: string;
  localLabel: string;
  localValue: string;
  remoteLabel: string;
  remoteUnknown: string;
  saveCopy: string;
  saveCopyHint: string;
  keepMine: string;
  keepMineHint: string;
  useRemote: string;
  useRemoteHint: string;
  later: string;
  busy: string;
}

const CLOUD_DOC_CONFLICT_TEXTS: Record<UiLanguage, CloudDocConflictText> = {
  'zh-CN': {
    title: '云端版本冲突',
    close: '关闭',
    intro: '云端已存在更新的版本，你的这次保存没有覆盖它。请选择怎么处理这两份内容。',
    localLabel: '你的版本（本地）',
    localValue: '尚未保存到云端',
    remoteLabel: '云端版本',
    remoteUnknown: '未知',
    saveCopy: '另存为副本',
    saveCopyHint: '两端都保留：本地内容作为新文档上传，云端原文档不动（推荐）',
    keepMine: '保留我的修改',
    keepMineHint: '以云端最新版本为基线重试一次，用你的内容覆盖云端',
    useRemote: '用云端版本',
    useRemoteHint: '丢弃本地这份修改，编辑器内容替换为云端最新版本',
    later: '稍后处理',
    busy: '处理中…',
  },
  'en-US': {
    title: 'Cloud version conflict',
    close: 'Close',
    intro: 'A newer version already exists in the cloud, so this save did not overwrite it. Choose what to do with both versions.',
    localLabel: 'Your version (local)',
    localValue: 'Not saved to cloud yet',
    remoteLabel: 'Cloud version',
    remoteUnknown: 'unknown',
    saveCopy: 'Save as a copy',
    saveCopyHint: 'Keep both: upload the local content as a new document and leave the cloud one untouched (recommended)',
    keepMine: 'Keep my changes',
    keepMineHint: 'Retry once on top of the latest cloud version and overwrite it with your content',
    useRemote: 'Use the cloud version',
    useRemoteHint: 'Discard the local changes and replace the editor content with the latest cloud version',
    later: 'Later',
    busy: 'Working…',
  },
};

export function getCloudDocConflictI18n(locale: UiLanguage): CloudDocConflictText {
  return CLOUD_DOC_CONFLICT_TEXTS[normalizeUiLanguage(locale)];
}

/** 「在编辑器中打开云文档」相关提示文案。 */
export interface CloudDocEditOpenText {
  opened: (fileName: string) => string;
  openedHint: string;
  alreadyOpen: (fileName: string) => string;
  openFailed: (message: string) => string;
  conflictSavedCopy: (path: string) => string;
  conflictKeepMineDone: string;
  conflictUseRemoteDone: string;
  conflictRetryExhausted: string;
  conflictFailed: (message: string) => string;
}

const CLOUD_DOC_EDIT_OPEN_TEXTS: Record<UiLanguage, CloudDocEditOpenText> = {
  'zh-CN': {
    opened: (fileName) => `已在编辑器中打开 ${fileName}`,
    openedHint: '保存即同步：编辑后 2.5 秒自动上传，Ctrl/Cmd + S 立即同步。',
    alreadyOpen: (fileName) => `${fileName} 已在编辑器中打开`,
    openFailed: (message) => `无法在编辑器中打开：${message}`,
    conflictSavedCopy: (path) => `冲突内容已另存为副本：${path}`,
    conflictKeepMineDone: '已用你的内容覆盖云端（基线已推进到最新版本）',
    conflictUseRemoteDone: '已用云端版本替换编辑器内容',
    conflictRetryExhausted: '云端在你重试期间又更新了，请重新选择处理方式',
    conflictFailed: (message) => `冲突处理失败：${message}`,
  },
  'en-US': {
    opened: (fileName) => `Opened ${fileName} in the editor`,
    openedHint: 'Saving syncs: edits upload after 2.5s idle, Ctrl/Cmd + S syncs immediately.',
    alreadyOpen: (fileName) => `${fileName} is already open in the editor`,
    openFailed: (message) => `Could not open in the editor: ${message}`,
    conflictSavedCopy: (path) => `Conflicting content saved as a copy: ${path}`,
    conflictKeepMineDone: 'Your content overwrote the cloud version (baseline advanced)',
    conflictUseRemoteDone: 'Editor content replaced with the cloud version',
    conflictRetryExhausted: 'The cloud changed again during the retry, please choose again',
    conflictFailed: (message) => `Failed to resolve the conflict: ${message}`,
  },
};

export function getCloudDocEditOpenI18n(locale: UiLanguage): CloudDocEditOpenText {
  return CLOUD_DOC_EDIT_OPEN_TEXTS[normalizeUiLanguage(locale)];
}
