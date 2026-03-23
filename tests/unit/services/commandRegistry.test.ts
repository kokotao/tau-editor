import { describe, expect, it, vi } from 'vitest';
import { createCommandExecutor, createCommandRegistry } from '@/services/commandRegistry';

function createActions() {
  return {
    newFile: vi.fn(),
    openFile: vi.fn(),
    openFolder: vi.fn(),
    save: vi.fn(),
    saveAs: vi.fn(),
    findText: vi.fn(),
    goToLine: vi.fn(),
    toggleSidebar: vi.fn(),
    toggleSettings: vi.fn(),
    openCommandPalette: vi.fn(),
  };
}

describe('commandRegistry', () => {
  it('应根据当前语言返回本地化命令标题', () => {
    const actions = createActions();

    const zhCommands = createCommandRegistry(actions, 'zh-CN');
    const enCommands = createCommandRegistry(actions, 'en-US');

    expect(zhCommands.find((command) => command.id === 'commandPalette.open')?.title).toBe('打开命令面板');
    expect(zhCommands.find((command) => command.id === 'search.findText')?.title).toBe('搜索文本');
    expect(zhCommands.find((command) => command.id === 'search.goToLine')?.shortcut).toBe('Ctrl+G');

    expect(enCommands.find((command) => command.id === 'commandPalette.open')?.title).toBe('Open Command Palette');
    expect(enCommands.find((command) => command.id === 'search.findText')?.title).toBe('Find Text');
  });

  it('执行器找不到命令时应返回本地化错误', async () => {
    const actions = createActions();
    const commands = createCommandRegistry(actions, 'en-US');
    const runCommand = createCommandExecutor(commands, 'en-US');

    await expect(runCommand('missing-command')).rejects.toThrow('Unknown command: missing-command');
  });

  it('执行器应调用对应命令动作', async () => {
    const actions = createActions();
    const commands = createCommandRegistry(actions, 'zh-CN');
    const runCommand = createCommandExecutor(commands, 'zh-CN');

    await runCommand('search.findText');
    expect(actions.findText).toHaveBeenCalledTimes(1);
  });
});
