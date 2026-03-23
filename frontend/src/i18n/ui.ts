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
export type SystemMenuAction =
  | 'file-new'
  | 'file-open'
  | 'file-open-folder'
  | 'file-save'
  | 'file-save-as'
  | 'open-command-palette'
  | 'find-text'
  | 'go-to-line'
  | 'toggle-explorer'
  | 'toggle-settings'
  | 'refresh-workspace'
  | 'toggle-theme'
  | 'theme-light'
  | 'theme-dark'
  | 'theme-system'
  | 'cycle-language-mode'
  | 'language-plaintext'
  | 'language-markdown'
  | 'language-typescript'
  | 'language-python'
  | 'language-json';
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
  | 'search.findText'
  | 'search.goToLine'
  | 'view.toggleSidebar'
  | 'view.toggleSettings';

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
  settingsEditor: string;
  settingsUpdates: string;
  settingsAbout: string;
  close: string;
  appearance: string;
  language: string;
  languageZh: string;
  languageEn: string;
  themeMode: string;
  themeLight: string;
  themeDark: string;
  themeSystem: string;
  editorTheme: string;
  recommended: string;
  font: string;
  fontSize: string;
  reset: string;
  fontFamily: string;
  systemMonospace: string;
  preview: string;
  fontPreviewLine1: string;
  fontPreviewLine2: string;
  editor: string;
  autoSave: string;
  autoSaveEnabled: string;
  autoSaveInterval: string;
  seconds10: string;
  seconds30: string;
  minute1: string;
  minutes5: string;
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
  sidebarEmptyTitle: string;
  singleFileMode: string;
  emptyMode: string;
  sidebarEmptyDesc: string;
  selectFolder: string;
  collapseExplorer: string;
  expandExplorer: string;
  openFolder: string;
  openFile: string;
  newFile: string;
}

interface ToolbarText {
  newFile: string;
  openFile: string;
  openFolder: string;
  save: string;
  saveAs: string;
  undo: string;
  redo: string;
  collapseExplorer: string;
  expandExplorer: string;
  markdownViewPrefix: string;
  dirtyTip: string;
  settings: string;
  systemMenu: string;
  systemMenuTitle: string;
  systemMenuPlaceholder: string;
  systemMenuSearchPlaceholder: string;
  systemMenuNoResult: string;
  systemMenuGroups: Record<'file' | 'view' | 'theme' | 'language', string>;
  systemMenuOptions: Record<SystemMenuAction, string>;
  previewModeLabels: Record<'edit' | 'split' | 'preview', string>;
}

interface EditorTabsText {
  unsaved: string;
  close: string;
  closeOthers: string;
  closeAll: string;
  renameTab: string;
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
  refreshPreview: string;
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
    'search.findText': {
      title: '搜索文本',
      keywords: ['搜索', '查找', '文本', 'find', 'search', 'text'],
    },
    'search.goToLine': {
      title: '跳转到行',
      keywords: ['跳转', '行号', '定位', 'go to line', 'line'],
    },
    'view.toggleSidebar': {
      title: '切换资源管理器',
      keywords: ['资源管理器', '侧边栏', '文件树', '面板', 'sidebar', 'explorer', 'drawer', 'split', 'panel'],
    },
    'view.toggleSettings': {
      title: '切换设置工作区',
      keywords: ['设置', '偏好', '配置', '工作区', 'settings', 'preferences', 'workspace'],
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
    'search.findText': {
      title: 'Find Text',
      keywords: ['find', 'search', 'text', '搜索', '查找'],
    },
    'search.goToLine': {
      title: 'Go To Line',
      keywords: ['go to line', 'line', 'jump', '跳转', '行号'],
    },
    'view.toggleSidebar': {
      title: 'Toggle Explorer',
      keywords: ['sidebar', 'explorer', 'panel', '资源管理器', '侧边栏'],
    },
    'view.toggleSettings': {
      title: 'Toggle Settings Workspace',
      keywords: ['settings', 'preferences', 'workspace', '配置', '设置'],
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
    settingsEditor: '编辑器',
    settingsUpdates: '更新与版本',
    settingsAbout: '关于',
    close: '关闭',
    appearance: '外观',
    language: '界面语言',
    languageZh: '简体中文',
    languageEn: 'English',
    themeMode: '主题模式',
    themeLight: '浅色',
    themeDark: '深色',
    themeSystem: '系统',
    editorTheme: '编辑器主题',
    recommended: '推荐',
    font: '字体',
    fontSize: '字体大小',
    reset: '重置',
    fontFamily: '字体家族',
    systemMonospace: '系统等宽字体',
    preview: '预览',
    fontPreviewLine1: 'const hello = "你好，世界";',
    fontPreviewLine2: 'console.log(hello);',
    editor: '编辑器',
    autoSave: '自动保存',
    autoSaveEnabled: '启用自动保存',
    autoSaveInterval: '自动保存间隔',
    seconds10: '10 秒',
    seconds30: '30 秒',
    minute1: '1 分钟',
    minutes5: '5 分钟',
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
  },
  'en-US': {
    title: 'Settings',
    quickSettingsTitle: 'Quick Settings',
    quickSettingsDesc: 'High-frequency options only. Open full settings for all categories.',
    openFullSettings: 'Open Full Settings',
    settingsGeneral: 'General',
    settingsEditor: 'Editor',
    settingsUpdates: 'Updates & Version',
    settingsAbout: 'About',
    close: 'Close',
    appearance: 'Appearance',
    language: 'UI Language',
    languageZh: '简体中文',
    languageEn: 'English',
    themeMode: 'Theme Mode',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    editorTheme: 'Editor Theme',
    recommended: 'Recommended',
    font: 'Font',
    fontSize: 'Font Size',
    reset: 'Reset',
    fontFamily: 'Font Family',
    systemMonospace: 'System Monospace',
    preview: 'Preview',
    fontPreviewLine1: 'const hello = "Hello, world";',
    fontPreviewLine2: 'console.log(hello);',
    editor: 'Editor',
    autoSave: 'Auto Save',
    autoSaveEnabled: 'Enable Auto Save',
    autoSaveInterval: 'Auto Save Interval',
    seconds10: '10 sec',
    seconds30: '30 sec',
    minute1: '1 min',
    minutes5: '5 min',
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
    sidebarEmptyTitle: '资源管理器目前为空',
    singleFileMode: '单文件编辑',
    emptyMode: '空启动',
    sidebarEmptyDesc: '当前模式是 {mode}，只有在你主动打开工作区后这里才会展示真实文件树。',
    selectFolder: '选择文件夹',
    collapseExplorer: '折叠资源管理器',
    expandExplorer: '展开资源管理器',
    openFolder: '打开文件夹',
    openFile: '打开文件',
    newFile: '新建文件',
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
    sidebarEmptyTitle: 'Explorer is currently empty',
    singleFileMode: 'Single-file mode',
    emptyMode: 'Empty startup',
    sidebarEmptyDesc: 'Current mode is {mode}. The real file tree will appear after you open a workspace.',
    selectFolder: 'Select Folder',
    collapseExplorer: 'Collapse Explorer',
    expandExplorer: 'Expand Explorer',
    openFolder: 'Open Folder',
    openFile: 'Open File',
    newFile: 'New File',
  },
};

const TOOLBAR_TEXTS: Record<UiLanguage, ToolbarText> = {
  'zh-CN': {
    newFile: '新建文件 (Ctrl+N)',
    openFile: '打开文件 (Ctrl+O)',
    openFolder: '打开文件夹',
    save: '保存 (Ctrl+S)',
    saveAs: '另存为',
    undo: '撤销',
    redo: '重做',
    collapseExplorer: '折叠资源管理器',
    expandExplorer: '展开资源管理器',
    markdownViewPrefix: 'Markdown 视图',
    dirtyTip: '当前标签未保存',
    settings: '设置',
    systemMenu: '系统',
    systemMenuTitle: '系统菜单',
    systemMenuPlaceholder: '系统',
    systemMenuSearchPlaceholder: '输入关键词过滤...',
    systemMenuNoResult: '没有匹配的系统命令',
    systemMenuGroups: {
      file: '文件',
      view: '视图',
      theme: '主题',
      language: '语言',
    },
    systemMenuOptions: {
      'file-new': '新建文件',
      'file-open': '打开文件',
      'file-open-folder': '打开文件夹',
      'file-save': '保存',
      'file-save-as': '另存为',
      'open-command-palette': '命令面板 (F1)',
      'find-text': '查找文本 (Ctrl+F)',
      'go-to-line': '跳转到行 (Ctrl+G)',
      'toggle-explorer': '切换资源管理器',
      'toggle-settings': '打开设置工作区',
      'refresh-workspace': '刷新工作区',
      'toggle-theme': '切换主题',
      'theme-light': '主题: 浅色',
      'theme-dark': '主题: 深色',
      'theme-system': '主题: 跟随系统',
      'cycle-language-mode': '切换语言模式',
      'language-plaintext': '语言: 纯文本',
      'language-markdown': '语言: Markdown',
      'language-typescript': '语言: TypeScript',
      'language-python': '语言: Python',
      'language-json': '语言: JSON',
    },
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
    undo: 'Undo',
    redo: 'Redo',
    collapseExplorer: 'Collapse Explorer',
    expandExplorer: 'Expand Explorer',
    markdownViewPrefix: 'Markdown View',
    dirtyTip: 'Current tab has unsaved changes',
    settings: 'Settings',
    systemMenu: 'System',
    systemMenuTitle: 'System Menu',
    systemMenuPlaceholder: 'System',
    systemMenuSearchPlaceholder: 'Type to filter...',
    systemMenuNoResult: 'No matching system actions',
    systemMenuGroups: {
      file: 'File',
      view: 'View',
      theme: 'Theme',
      language: 'Language',
    },
    systemMenuOptions: {
      'file-new': 'New File',
      'file-open': 'Open File',
      'file-open-folder': 'Open Folder',
      'file-save': 'Save',
      'file-save-as': 'Save As',
      'open-command-palette': 'Command Palette (F1)',
      'find-text': 'Find Text (Ctrl+F)',
      'go-to-line': 'Go To Line (Ctrl+G)',
      'toggle-explorer': 'Toggle Explorer',
      'toggle-settings': 'Open Settings Workspace',
      'refresh-workspace': 'Refresh Workspace',
      'toggle-theme': 'Toggle Theme',
      'theme-light': 'Theme: Light',
      'theme-dark': 'Theme: Dark',
      'theme-system': 'Theme: System',
      'cycle-language-mode': 'Cycle Language Mode',
      'language-plaintext': 'Language: Plain Text',
      'language-markdown': 'Language: Markdown',
      'language-typescript': 'Language: TypeScript',
      'language-python': 'Language: Python',
      'language-json': 'Language: JSON',
    },
    previewModeLabels: {
      edit: 'Edit Only',
      split: 'Split',
      preview: 'Preview Only',
    },
  },
};

const EDITOR_TABS_TEXTS: Record<UiLanguage, EditorTabsText> = {
  'zh-CN': {
    unsaved: '未保存',
    close: '关闭',
    closeOthers: '关闭其他标签',
    closeAll: '关闭所有标签',
    renameTab: '重命名标签',
  },
  'en-US': {
    unsaved: 'Unsaved',
    close: 'Close',
    closeOthers: 'Close Others',
    closeAll: 'Close All',
    renameTab: 'Rename Tab',
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
    refreshPreview: '刷新预览',
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
    refreshPreview: 'Refresh Preview',
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
