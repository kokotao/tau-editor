import { getAppI18n, getCommandText, type CommandId, type UiLanguage } from '@/i18n/ui';

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
  findText: () => Promise<void> | void;
  goToLine: () => Promise<void> | void;
  toggleSidebar: () => Promise<void> | void;
  toggleSettings: () => Promise<void> | void;
  openCommandPalette: () => Promise<void> | void;
}

function resolveCommandText(language: UiLanguage, commandId: CommandId) {
  return getCommandText(language, commandId);
}

export function createCommandRegistry(actions: CommandActions, uiLanguage: UiLanguage): AppCommand[] {
  const commandPalette = resolveCommandText(uiLanguage, 'commandPalette.open');
  const newFile = resolveCommandText(uiLanguage, 'file.new');
  const openFile = resolveCommandText(uiLanguage, 'file.open');
  const openFolder = resolveCommandText(uiLanguage, 'file.openFolder');
  const save = resolveCommandText(uiLanguage, 'file.save');
  const saveAs = resolveCommandText(uiLanguage, 'file.saveAs');
  const findText = resolveCommandText(uiLanguage, 'search.findText');
  const goToLine = resolveCommandText(uiLanguage, 'search.goToLine');
  const toggleSidebar = resolveCommandText(uiLanguage, 'view.toggleSidebar');
  const toggleSettings = resolveCommandText(uiLanguage, 'view.toggleSettings');

  return [
    {
      id: 'commandPalette.open',
      title: commandPalette.title,
      category: 'search',
      shortcut: 'F1 / Ctrl+Shift+P',
      keywords: commandPalette.keywords,
      run: actions.openCommandPalette,
    },
    {
      id: 'file.new',
      title: newFile.title,
      category: 'file',
      shortcut: 'Ctrl+N',
      keywords: newFile.keywords,
      run: actions.newFile,
    },
    {
      id: 'file.open',
      title: openFile.title,
      category: 'file',
      shortcut: 'Ctrl+O',
      keywords: openFile.keywords,
      run: actions.openFile,
    },
    {
      id: 'file.openFolder',
      title: openFolder.title,
      category: 'workspace',
      keywords: openFolder.keywords,
      run: actions.openFolder,
    },
    {
      id: 'file.save',
      title: save.title,
      category: 'file',
      shortcut: 'Ctrl+S',
      keywords: save.keywords,
      run: actions.save,
    },
    {
      id: 'file.saveAs',
      title: saveAs.title,
      category: 'file',
      keywords: saveAs.keywords,
      run: actions.saveAs,
    },
    {
      id: 'search.findText',
      title: findText.title,
      category: 'search',
      shortcut: 'Ctrl+F',
      keywords: findText.keywords,
      run: actions.findText,
    },
    {
      id: 'search.goToLine',
      title: goToLine.title,
      category: 'search',
      shortcut: 'Ctrl+G',
      keywords: goToLine.keywords,
      run: actions.goToLine,
    },
    {
      id: 'view.toggleSidebar',
      title: toggleSidebar.title,
      category: 'view',
      keywords: toggleSidebar.keywords,
      run: actions.toggleSidebar,
    },
    {
      id: 'view.toggleSettings',
      title: toggleSettings.title,
      category: 'view',
      keywords: toggleSettings.keywords,
      run: actions.toggleSettings,
    },
  ];
}

export function createCommandExecutor(commands: AppCommand[], uiLanguage: UiLanguage) {
  const commandMap = new Map(commands.map((command) => [command.id, command]));
  const appText = getAppI18n(uiLanguage);

  return async (id: string) => {
    const command = commandMap.get(id);
    if (!command) {
      throw new Error(`${appText.unknownCommand}: ${id}`);
    }

    await command.run();
  };
}
