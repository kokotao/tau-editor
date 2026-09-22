/**
 * Provider 注册表（v0.4.0）
 *
 * 为后续插件体系预留进程内扩展点：主题 / 命令 / 文件动作。
 * 约束：
 * - 同 id 重复注册时覆盖并记录告警；
 * - provider 抛错被隔离到 `errors`，不影响启动；
 * - 所有 load 结果做形状过滤，脏数据不会流入 UI。
 */

import type { AppCommand } from '@/services/commandRegistry';
import type { ThemePackage } from '@/utils/themePackage';

export type ProviderKind = 'theme' | 'command' | 'fileAction';

export interface ThemeProvider {
  id: string;
  load: () => ThemePackage[] | Promise<ThemePackage[]>;
}

export interface CommandProvider {
  id: string;
  commands: () => AppCommand[];
}

export interface FileActionContext {
  filePath: string;
  workspacePath: string | null;
  isTauri: boolean;
}

export interface FileAction {
  id: string;
  title: string;
  run: (context: FileActionContext) => Promise<void> | void;
}

export interface FileActionProvider {
  id: string;
  actions: () => FileAction[];
}

export interface ProviderRegistration {
  id: string;
  kind: ProviderKind;
}

export interface ProviderError {
  providerId: string;
  kind: ProviderKind;
  code: 'PROVIDER_FAILED';
  message: string;
}

export interface ProviderSnapshot {
  registered: ProviderRegistration[];
  errors: ProviderError[];
  warnings: string[];
}

export class ProviderRegistry {
  private readonly themeProviders = new Map<string, ThemeProvider>();
  private readonly commandProviders = new Map<string, CommandProvider>();
  private readonly fileActionProviders = new Map<string, FileActionProvider>();
  private readonly errorList: ProviderError[] = [];
  private readonly warningList: string[] = [];

  registerTheme(provider: ThemeProvider) {
    this.register('theme', provider.id, this.themeProviders, provider);
  }

  registerCommand(provider: CommandProvider) {
    this.register('command', provider.id, this.commandProviders, provider);
  }

  registerFileAction(provider: FileActionProvider) {
    this.register('fileAction', provider.id, this.fileActionProviders, provider);
  }

  private register<T>(
    kind: ProviderKind,
    id: string,
    target: Map<string, T>,
    provider: T,
  ) {
    if (!id) {
      this.errorList.push({
        providerId: '<unknown>',
        kind,
        code: 'PROVIDER_FAILED',
        message: 'provider id 不能为空',
      });
      return;
    }
    if (target.has(id)) {
      this.warningList.push(`provider ${kind}:${id} 重复注册，已覆盖旧实现`);
    }
    target.set(id, provider);
  }

  async loadThemes(): Promise<ThemePackage[]> {
    const themes: ThemePackage[] = [];
    for (const provider of this.themeProviders.values()) {
      try {
        const loaded = await provider.load();
        if (!Array.isArray(loaded)) {
          throw new Error('load() 必须返回主题数组');
        }
        themes.push(...loaded);
      } catch (error) {
        this.recordError(provider.id, 'theme', error);
      }
    }
    return themes;
  }

  loadCommands(): AppCommand[] {
    const commands: AppCommand[] = [];
    for (const provider of this.commandProviders.values()) {
      try {
        const loaded = provider.commands();
        if (!Array.isArray(loaded)) {
          throw new Error('commands() 必须返回命令数组');
        }
        commands.push(...loaded.filter((command) => Boolean(command?.id && command?.run)));
      } catch (error) {
        this.recordError(provider.id, 'command', error);
      }
    }
    return commands;
  }

  loadFileActions(): FileAction[] {
    const actions: FileAction[] = [];
    for (const provider of this.fileActionProviders.values()) {
      try {
        const loaded = provider.actions();
        if (!Array.isArray(loaded)) {
          throw new Error('actions() 必须返回动作数组');
        }
        actions.push(...loaded.filter((action) => Boolean(action?.id && action?.run)));
      } catch (error) {
        this.recordError(provider.id, 'fileAction', error);
      }
    }
    return actions;
  }

  private recordError(providerId: string, kind: ProviderKind, error: unknown) {
    this.errorList.push({
      providerId,
      kind,
      code: 'PROVIDER_FAILED',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  snapshot(): ProviderSnapshot {
    const registered: ProviderRegistration[] = [
      ...Array.from(this.themeProviders.keys()).map((id) => ({ id, kind: 'theme' as const })),
      ...Array.from(this.commandProviders.keys()).map((id) => ({ id, kind: 'command' as const })),
      ...Array.from(this.fileActionProviders.keys()).map((id) => ({ id, kind: 'fileAction' as const })),
    ];
    return {
      registered,
      errors: [...this.errorList],
      warnings: [...this.warningList],
    };
  }

  clearDiagnostics() {
    this.errorList.length = 0;
    this.warningList.length = 0;
  }
}

export function createProviderRegistry(): ProviderRegistry {
  return new ProviderRegistry();
}

/** 应用级单例，设置面板与启动装配共享同一份注册表。 */
export const providerRegistry = createProviderRegistry();
