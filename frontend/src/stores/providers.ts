/**
 * Provider 状态（v0.4.0）
 *
 * 把 provider 注册表的装配结果暴露给设置面板与命令面板。
 */

import { defineStore } from 'pinia';
import type { AppCommand } from '@/services/commandRegistry';
import type {
  FileAction,
  FileActionContext,
  ProviderError,
  ProviderRegistration,
} from '@/services/providerRegistry';

interface ProvidersState {
  registered: ProviderRegistration[];
  errors: ProviderError[];
  warnings: string[];
  commands: AppCommand[];
  fileActions: FileAction[];
}

export const useProvidersStore = defineStore('providers', {
  state: (): ProvidersState => ({
    registered: [],
    errors: [],
    warnings: [],
    commands: [],
    fileActions: [],
  }),

  getters: {
    total: (state) => state.registered.length,
    errorCount: (state) => state.errors.length,
    themeProviderCount: (state) => state.registered.filter((item) => item.kind === 'theme').length,
    commandProviderCount: (state) => state.registered.filter((item) => item.kind === 'command').length,
    fileActionProviderCount: (state) =>
      state.registered.filter((item) => item.kind === 'fileAction').length,
  },

  actions: {
    refresh(snapshot: {
      registered: ProviderRegistration[];
      errors: ProviderError[];
      warnings: string[];
    }) {
      this.registered = snapshot.registered;
      this.errors = snapshot.errors;
      this.warnings = snapshot.warnings;
    },

    setCommands(commands: AppCommand[]) {
      this.commands = commands;
    },

    setFileActions(actions: FileAction[]) {
      this.fileActions = actions;
    },

    async runFileAction(actionId: string, context: FileActionContext) {
      const action = this.fileActions.find((item) => item.id === actionId);
      if (!action) {
        throw new Error(`未注册的文件动作：${actionId}`);
      }
      await action.run(context);
    },
  },
});
