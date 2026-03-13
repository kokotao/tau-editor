export interface AppCommand {
  id: string;
  title: string;
  category: 'file' | 'view' | 'workspace' | 'search';
  shortcut?: string;
  keywords?: string[];
  run: () => Promise<void> | void;
}

export interface CommandActions {
  newFile: () => Promise<void> | void;
  openFile: () => Promise<void> | void;
  openFolder: () => Promise<void> | void;
  save: () => Promise<void> | void;
  saveAs: () => Promise<void> | void;
  toggleSidebar: () => Promise<void> | void;
  toggleSettings: () => Promise<void> | void;
  openCommandPalette: () => Promise<void> | void;
}

export function createCommandRegistry(actions: CommandActions): AppCommand[] {
  return [
    {
      id: 'commandPalette.open',
      title: '打开命令面板',
      category: 'search',
      shortcut: 'Ctrl+Shift+P',
      keywords: ['命令面板', 'palette', 'search'],
      run: actions.openCommandPalette,
    },
    {
      id: 'file.new',
      title: '新建文件',
      category: 'file',
      shortcut: 'Ctrl+N',
      keywords: ['new', 'untitled'],
      run: actions.newFile,
    },
    {
      id: 'file.open',
      title: '打开文件',
      category: 'file',
      shortcut: 'Ctrl+O',
      keywords: ['open', 'file'],
      run: actions.openFile,
    },
    {
      id: 'file.openFolder',
      title: '打开文件夹',
      category: 'workspace',
      keywords: ['open', 'folder', 'workspace'],
      run: actions.openFolder,
    },
    {
      id: 'file.save',
      title: '保存',
      category: 'file',
      shortcut: 'Ctrl+S',
      keywords: ['save', 'write'],
      run: actions.save,
    },
    {
      id: 'file.saveAs',
      title: '另存为',
      category: 'file',
      keywords: ['save as', 'export'],
      run: actions.saveAs,
    },
    {
      id: 'view.toggleSidebar',
      title: '切换资源管理器',
      category: 'view',
      keywords: ['sidebar', 'explorer'],
      run: actions.toggleSidebar,
    },
    {
      id: 'view.toggleSettings',
      title: '切换设置面板',
      category: 'view',
      keywords: ['settings', 'preferences'],
      run: actions.toggleSettings,
    },
  ];
}

export function createCommandExecutor(commands: AppCommand[]) {
  const commandMap = new Map(commands.map((command) => [command.id, command]));

  return async (id: string) => {
    const command = commandMap.get(id);
    if (!command) {
      throw new Error(`未找到命令: ${id}`);
    }

    await command.run();
  };
}
