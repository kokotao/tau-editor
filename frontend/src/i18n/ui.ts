export type UiLanguage = 'zh-CN' | 'en-US';
export type CommandCategory = 'file' | 'view' | 'workspace' | 'search';
export type MonacoThemeValue = 'vs' | 'vs-dark' | 'hc-black';
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
}

interface SettingsPanelText {
  title: string;
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
  previewModeLabels: Record<'edit' | 'split' | 'preview', string>;
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
    'view.toggleSidebar': {
      title: '切换资源管理器',
      keywords: ['资源管理器', '侧边栏', '文件树', '面板', 'sidebar', 'explorer', 'drawer', 'split', 'panel'],
    },
    'view.toggleSettings': {
      title: '切换设置面板',
      keywords: ['设置', '偏好', '配置', 'settings', 'preferences'],
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
    'view.toggleSidebar': {
      title: 'Toggle Explorer',
      keywords: ['sidebar', 'explorer', 'panel', '资源管理器', '侧边栏'],
    },
    'view.toggleSettings': {
      title: 'Toggle Settings Panel',
      keywords: ['settings', 'preferences', '配置', '设置'],
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
    githubLabel: '开源地址：GitHub',
  },
  'en-US': {
    entry: 'Author',
    modalTitle: 'Author Info',
    nameLabel: 'Author: ',
    emailLabel: 'Email: ',
    githubLabel: 'Open Source: GitHub',
  },
};

const SETTINGS_PANEL_TEXTS: Record<UiLanguage, SettingsPanelText> = {
  'zh-CN': {
    title: '设置',
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
  },
  'en-US': {
    title: 'Settings',
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
  },
};

const APP_TEXTS: Record<UiLanguage, AppText> = {
  'zh-CN': {
    appLabel: '文本编辑器',
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
    appLabel: 'Text Editor',
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
    previewModeLabels: {
      edit: 'Edit Only',
      split: 'Split',
      preview: 'Preview Only',
    },
  },
};

const FILE_TREE_TEXTS: Record<UiLanguage, FileTreeText> = {
  'zh-CN': {
    workspace: '工作区',
    searchPlaceholder: '在工作区中搜索（仅视觉）',
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
    searchPlaceholder: 'Search in workspace (visual only)',
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
