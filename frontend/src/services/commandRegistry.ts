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
  goToDefinition: () => Promise<void> | void;
  goToDeclaration: () => Promise<void> | void;
  goToTypeDefinition: () => Promise<void> | void;
  goToImplementation: () => Promise<void> | void;
  peekDefinition: () => Promise<void> | void;
  peekReferences: () => Promise<void> | void;
  findReferences: () => Promise<void> | void;
  renameSymbol: () => Promise<void> | void;
  toggleProblems: () => Promise<void> | void;
  toggleSidebar: () => Promise<void> | void;
  toggleSettings: () => Promise<void> | void;
  openCommandPalette: () => Promise<void> | void;
  compareWithFile: () => Promise<void> | void;
  openInNewWindow: () => Promise<void> | void;
  moveToNewWindow: () => Promise<void> | void;
  goBack: () => Promise<void> | void;
  goForward: () => Promise<void> | void;
  searchWorkspaceSymbols: () => Promise<void> | void;
  showCallHierarchy: () => Promise<void> | void;
  showTypeHierarchy: () => Promise<void> | void;
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
  const goToDefinition = resolveCommandText(uiLanguage, 'editor.goToDefinition');
  const goToDeclaration = resolveCommandText(uiLanguage, 'editor.goToDeclaration');
  const goToTypeDefinition = resolveCommandText(uiLanguage, 'editor.goToTypeDefinition');
  const goToImplementation = resolveCommandText(uiLanguage, 'editor.goToImplementation');
  const peekDefinition = resolveCommandText(uiLanguage, 'editor.peekDefinition');
  const peekReferences = resolveCommandText(uiLanguage, 'editor.peekReferences');
  const findReferences = resolveCommandText(uiLanguage, 'editor.findReferences');
  const renameSymbol = resolveCommandText(uiLanguage, 'editor.renameSymbol');
  const toggleProblems = resolveCommandText(uiLanguage, 'editor.toggleProblems');
  const toggleSidebar = resolveCommandText(uiLanguage, 'view.toggleSidebar');
  const toggleSettings = resolveCommandText(uiLanguage, 'view.toggleSettings');
  const compareWithFile = resolveCommandText(uiLanguage, 'diff.compareWithFile');
  const openInNewWindow = resolveCommandText(uiLanguage, 'window.openInNewWindow');
  const moveToNewWindow = resolveCommandText(uiLanguage, 'window.moveToNewWindow');
  const goBack = resolveCommandText(uiLanguage, 'editor.goBack');
  const goForward = resolveCommandText(uiLanguage, 'editor.goForward');
  const searchWorkspaceSymbols = resolveCommandText(uiLanguage, 'workspace.searchSymbols');
  const showCallHierarchy = resolveCommandText(uiLanguage, 'editor.callHierarchy');
  const showTypeHierarchy = resolveCommandText(uiLanguage, 'editor.typeHierarchy');

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
      id: 'diff.compareWithFile',
      title: compareWithFile.title,
      category: 'file',
      keywords: compareWithFile.keywords,
      run: actions.compareWithFile,
    },
    {
      id: 'window.openInNewWindow',
      title: openInNewWindow.title,
      category: 'view',
      keywords: openInNewWindow.keywords,
      run: actions.openInNewWindow,
    },
    {
      id: 'window.moveToNewWindow',
      title: moveToNewWindow.title,
      category: 'view',
      keywords: moveToNewWindow.keywords,
      run: actions.moveToNewWindow,
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
      id: 'editor.goToDefinition',
      title: goToDefinition.title,
      category: 'search',
      shortcut: 'F12',
      keywords: goToDefinition.keywords,
      run: actions.goToDefinition,
    },
    {
      id: 'editor.goToDeclaration',
      title: goToDeclaration.title,
      category: 'search',
      shortcut: 'Ctrl+U',
      keywords: goToDeclaration.keywords,
      run: actions.goToDeclaration,
    },
    {
      id: 'editor.goToTypeDefinition',
      title: goToTypeDefinition.title,
      category: 'search',
      shortcut: 'Ctrl+F12',
      keywords: goToTypeDefinition.keywords,
      run: actions.goToTypeDefinition,
    },
    {
      id: 'editor.goToImplementation',
      title: goToImplementation.title,
      category: 'search',
      shortcut: 'Ctrl+Alt+F12',
      keywords: goToImplementation.keywords,
      run: actions.goToImplementation,
    },
    {
      id: 'editor.peekDefinition',
      title: peekDefinition.title,
      category: 'search',
      shortcut: 'Ctrl+Shift+F12',
      keywords: peekDefinition.keywords,
      run: actions.peekDefinition,
    },
    {
      id: 'editor.peekReferences',
      title: peekReferences.title,
      category: 'search',
      shortcut: 'Ctrl+Alt+F7',
      keywords: peekReferences.keywords,
      run: actions.peekReferences,
    },
    {
      id: 'editor.findReferences',
      title: findReferences.title,
      category: 'search',
      shortcut: 'Shift+F12',
      keywords: findReferences.keywords,
      run: actions.findReferences,
    },
    {
      id: 'editor.renameSymbol',
      title: renameSymbol.title,
      category: 'search',
      shortcut: 'F2',
      keywords: renameSymbol.keywords,
      run: actions.renameSymbol,
    },
    {
      id: 'editor.toggleProblems',
      title: toggleProblems.title,
      category: 'view',
      shortcut: 'Ctrl+Shift+M',
      keywords: toggleProblems.keywords,
      run: actions.toggleProblems,
    },
    {
      id: 'editor.goBack',
      title: goBack.title,
      category: 'search',
      shortcut: 'Alt+Left',
      keywords: goBack.keywords,
      run: actions.goBack,
    },
    {
      id: 'editor.goForward',
      title: goForward.title,
      category: 'search',
      shortcut: 'Alt+Right',
      keywords: goForward.keywords,
      run: actions.goForward,
    },
    {
      id: 'workspace.searchSymbols',
      title: searchWorkspaceSymbols.title,
      category: 'workspace',
      shortcut: 'Ctrl+T',
      keywords: searchWorkspaceSymbols.keywords,
      run: actions.searchWorkspaceSymbols,
    },
    {
      id: 'editor.callHierarchy',
      title: showCallHierarchy.title,
      category: 'search',
      shortcut: 'Ctrl+Alt+H',
      keywords: showCallHierarchy.keywords,
      run: actions.showCallHierarchy,
    },
    {
      id: 'editor.typeHierarchy',
      title: showTypeHierarchy.title,
      category: 'search',
      shortcut: 'Ctrl+Alt+T',
      keywords: showTypeHierarchy.keywords,
      run: actions.showTypeHierarchy,
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
      shortcut: 'Ctrl+,',
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
