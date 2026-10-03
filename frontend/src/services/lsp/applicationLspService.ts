/**
 * @description 编排工作区级 LSP 会话，为 Monaco Provider 提供按语言复用的客户端。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 10:25
 */

import { isTauriApp, lspCommands } from '@/lib/tauri';
import { createLspClientManager, type LspClientManager } from './lspClientManager';
import {
  findLanguageServer,
  getManagedRuntimeAsset,
  normalizeLspLanguageId,
  type LanguageServerDescriptor,
  type ManagedLspAsset,
} from './languageServerRegistry';
import type { MonacoLspClient, MonacoLspClientResolver, MonacoLspModelContext } from './monacoLspBridge';

export interface ApplicationLspWorkspace {
  workspaceId: string;
  rootPath: string;
}

export interface ApplicationLspServiceOptions {
  onUnavailable?: (descriptor: { id: string; displayName: string; command: string; languageIds: string[] }, error: unknown) => void;
  onProvisioning?: (descriptor: { id: string; displayName: string; command: string; languageIds: string[] }) => void;
}

export class ApplicationLspService {
  private readonly manager: LspClientManager;
  private workspace: ApplicationLspWorkspace | null = null;
  private readonly failedKeys = new Set<string>();
  private readonly managedLaunches = new Map<string, {
    command: string;
    args: string[];
    env: Record<string, string>;
    initializeParams?: Record<string, unknown>;
  }>();
  private managedPlatformKey: string | null = null;
  private workspaceDataDir: string | null = null;
  private readonly managedAttempts = new Set<string>();
  private readonly options: ApplicationLspServiceOptions;

  constructor(manager = createLspClientManager(), options: ApplicationLspServiceOptions = {}) {
    this.manager = manager;
    this.options = options;
  }

  get clientManager(): LspClientManager {
    return this.manager;
  }

  async setWorkspace(workspace: ApplicationLspWorkspace | null): Promise<void> {
    if (
      workspace
      && this.workspace?.workspaceId === workspace.workspaceId
      && this.workspace.rootPath === workspace.rootPath
    ) {
      return;
    }

    await this.manager.stopAll();
    this.failedKeys.clear();
    this.managedLaunches.clear();
    this.managedPlatformKey = null;
    this.workspaceDataDir = null;
    this.managedAttempts.clear();
    this.workspace = workspace;
  }

  async resolveClient(_model: unknown, context: MonacoLspModelContext): Promise<MonacoLspClient | null> {
    if (!this.workspace || !isTauriApp()) return null;

    const languageId = normalizeLspLanguageId(context.languageId ?? '');
    const descriptor = findLanguageServer(languageId);
    if (!descriptor) return null;

    const key = `${this.workspace.workspaceId}\u0000${descriptor.id}`;
    if (this.failedKeys.has(key)) return null;

    try {
      const managedLaunch = await this.resolveManagedLaunch(descriptor, key);
      return await this.manager.start({
        workspaceId: this.workspace.workspaceId,
        languageId: descriptor.id,
        rootPath: this.workspace.rootPath,
        command: managedLaunch?.command ?? descriptor.command,
        args: managedLaunch?.args ?? descriptor.args,
        env: managedLaunch?.env,
        initializeParams: managedLaunch?.initializeParams,
      });
    } catch (error) {
      // 服务器未安装或启动失败不应阻塞编辑器，当前工作区本次会话内直接降级。
      this.failedKeys.add(key);
      this.options.onUnavailable?.(descriptor, error);
      console.warn(`[LSP] ${descriptor.id} 不可用，已回退轻量导航：`, error);
      return null;
    }
  }

  async dispose(): Promise<void> {
    await this.manager.stopAll();
    this.workspace = null;
    this.failedKeys.clear();
    this.managedLaunches.clear();
    this.managedPlatformKey = null;
    this.workspaceDataDir = null;
    this.managedAttempts.clear();
  }

  private async resolveManagedLaunch(
    descriptor: LanguageServerDescriptor,
    key: string,
  ): Promise<{ command: string; args: string[]; env: Record<string, string>; initializeParams?: Record<string, unknown> } | null> {
    const existing = this.managedLaunches.get(descriptor.id);
    if (existing) return existing;
    if (this.managedAttempts.has(key)) return null;
    this.managedAttempts.add(key);

    try {
      const managed = await lspCommands.probeManaged();
      const platform = await lspCommands.platformInfo();
      this.managedPlatformKey = `${platform.platform}-${platform.arch}`;
      const probe = managed.servers.find((item) => item.id === (descriptor.managedId ?? descriptor.id));
      const managedAsset = this.resolveManagedAsset(descriptor);
      const dependencies = await this.prepareManagedDependencies(descriptor, managed.servers);
      // 复合运行时（例如 Node + .mjs）必须在缓存命中和首次安装两条路径使用同一启动契约。
      // 旧 manifest 可能只保存了脚本 executablePath，没有保存 launchCommand/launchArgs，
      // 因此不能把脚本文件直接交给 tokio::process::Command 执行。
      if (probe?.state === 'ready' && probe.executablePath) {
        let runtimeLaunch: { command: string; env: Record<string, string>; installDir?: string | null } | null = null;
        if (descriptor.managedRuntimeId) {
          const runtimeProbe = managed.servers.find((item) => item.id === descriptor.managedRuntimeId);
          if (runtimeProbe?.state === 'ready' && runtimeProbe.executablePath) {
            runtimeLaunch = {
              command: runtimeProbe.launchCommand ?? runtimeProbe.executablePath,
              env: runtimeProbe.launchEnv ?? {},
              installDir: runtimeProbe.installDir,
            };
          }
          if (!runtimeLaunch) {
            const runtimeAsset = getManagedRuntimeAsset(descriptor.managedRuntimeId, this.managedPlatformKey);
            if (!runtimeAsset) return null;
            const preparedRuntime = await lspCommands.installServer({
              serverId: descriptor.managedRuntimeId,
              ...runtimeAsset,
            });
            if (!preparedRuntime.installed || !preparedRuntime.executablePath) return null;
            runtimeLaunch = {
              command: preparedRuntime.launchCommand ?? preparedRuntime.executablePath,
              env: preparedRuntime.launchEnv ?? {},
              installDir: preparedRuntime.installDir,
            };
          }
        }
        const argsTemplate = managedAsset?.launchArgs ?? (probe.launchArgs?.length ? probe.launchArgs : ['--stdio']);
        const launch = {
          command: runtimeLaunch?.command ?? probe.launchCommand ?? probe.executablePath,
          args: await this.resolveLaunchArgs(
            runtimeLaunch && !argsTemplate.some((arg) => arg.includes('${executablePath}'))
              ? [probe.executablePath, ...argsTemplate]
              : argsTemplate,
            probe.installDir,
            probe.executablePath,
          ),
          env: {
            ...(runtimeLaunch?.env ?? {}),
            ...(descriptor.id === 'omnisharp' && dependencies.get('dotnet-sdk')?.installDir
              ? {
                DOTNET_ROOT: dependencies.get('dotnet-sdk')?.installDir as string,
                ...(this.managedPlatformKey?.endsWith('-arm64')
                  ? { DOTNET_ROOT_ARM64: dependencies.get('dotnet-sdk')?.installDir as string }
                  : { DOTNET_ROOT_X64: dependencies.get('dotnet-sdk')?.installDir as string }),
              }
              : {}),
            ...((descriptor.managedRuntimeId === 'dotnet-runtime' || descriptor.managedRuntimeId === 'dotnet-sdk') && runtimeLaunch?.installDir
              ? { DOTNET_ROOT: runtimeLaunch.installDir }
              : {}),
            ...(probe.launchEnv ?? {}),
          },
          initializeParams: this.buildInitializeParams(descriptor, dependencies),
        };
        this.managedLaunches.set(descriptor.id, launch);
        return launch;
      }
      if (!managedAsset) return null;
      this.options.onProvisioning?.(descriptor);
      let runtimeLaunch: { command: string; env: Record<string, string>; installDir?: string | null } | null = null;
      if (descriptor.managedRuntimeId) {
        const runtimeId = descriptor.managedRuntimeId;
        const runtimeProbe = managed.servers.find((item) => item.id === runtimeId);
        if (runtimeProbe?.state === 'ready' && runtimeProbe.executablePath) {
          runtimeLaunch = {
            command: runtimeProbe.launchCommand ?? runtimeProbe.executablePath,
            env: runtimeProbe.launchEnv ?? {},
            installDir: runtimeProbe.installDir,
          };
        } else {
          const runtimeAsset = getManagedRuntimeAsset(runtimeId, this.managedPlatformKey);
          if (!runtimeAsset) return null;
          const preparedRuntime = await lspCommands.installServer({
            serverId: runtimeId,
            ...runtimeAsset,
          });
          if (!preparedRuntime.installed || !preparedRuntime.executablePath) return null;
          runtimeLaunch = {
            command: preparedRuntime.launchCommand ?? preparedRuntime.executablePath,
            env: preparedRuntime.launchEnv ?? {},
            installDir: preparedRuntime.installDir,
          };
        }
      }
      const prepared = await lspCommands.installServer({
        serverId: descriptor.managedId ?? descriptor.id,
        ...managedAsset,
      });
      if (prepared.installed && prepared.executablePath) {
        const packagePath = prepared.executablePath;
        const argsTemplate = managedAsset.launchArgs ?? prepared.launchArgs ?? descriptor.args;
        const launch = {
          command: runtimeLaunch?.command ?? prepared.launchCommand ?? packagePath,
          args: await this.resolveLaunchArgs(
            runtimeLaunch && !argsTemplate.some((arg) => arg.includes('${executablePath}'))
              ? [packagePath, ...argsTemplate]
              : argsTemplate,
            prepared.installDir,
            packagePath,
          ),
          env: {
            ...(runtimeLaunch?.env ?? {}),
            ...(descriptor.id === 'omnisharp' && dependencies.get('dotnet-sdk')?.installDir
              ? {
                DOTNET_ROOT: dependencies.get('dotnet-sdk')?.installDir as string,
                ...(this.managedPlatformKey?.endsWith('-arm64')
                  ? { DOTNET_ROOT_ARM64: dependencies.get('dotnet-sdk')?.installDir as string }
                  : { DOTNET_ROOT_X64: dependencies.get('dotnet-sdk')?.installDir as string }),
              }
              : {}),
            ...((descriptor.managedRuntimeId === 'dotnet-runtime' || descriptor.managedRuntimeId === 'dotnet-sdk') && runtimeLaunch?.installDir
              ? { DOTNET_ROOT: runtimeLaunch.installDir }
              : {}),
            ...(prepared.launchEnv ?? {}),
          },
          initializeParams: this.buildInitializeParams(descriptor, dependencies),
        };
        this.managedLaunches.set(descriptor.id, launch);
        return launch;
      }
    } catch {
      // Managed provisioning is optional for old backends; preserve PATH fallback.
    }
    return null;
  }

  private resolveManagedAsset(descriptor: LanguageServerDescriptor): ManagedLspAsset | null {
    if (this.managedPlatformKey && descriptor.managedAssets) {
      return descriptor.managedAssets[this.managedPlatformKey] ?? null;
    }
    return descriptor.managedAsset ?? null;
  }

  private async prepareManagedDependencies(
    descriptor: LanguageServerDescriptor,
    servers: Array<{
      id: string;
      state: string;
      executablePath?: string | null;
      installDir?: string | null;
    }>,
  ): Promise<Map<string, { executablePath: string; installDir?: string | null }>> {
    const resolved = new Map<string, { executablePath: string; installDir?: string | null }>();
    for (const dependency of descriptor.managedDependencies ?? []) {
      const cached = servers.find((item) => item.id === dependency.id && item.state === 'ready' && item.executablePath);
      if (cached?.executablePath) {
        resolved.set(dependency.id, { executablePath: cached.executablePath, installDir: cached.installDir });
        continue;
      }
      if (!this.managedPlatformKey) continue;
      const asset = dependency.assets[this.managedPlatformKey];
      if (!asset) throw new Error(`语言服务器依赖 ${dependency.id} 没有匹配当前平台的托管资产`);
      const prepared = await lspCommands.installServer({ serverId: dependency.id, ...asset });
      if (!prepared.installed || !prepared.executablePath) {
        throw new Error(`语言服务器依赖 ${dependency.id} 安装后不可用`);
      }
      resolved.set(dependency.id, { executablePath: prepared.executablePath, installDir: prepared.installDir });
    }
    return resolved;
  }

  private buildInitializeParams(
    descriptor: LanguageServerDescriptor,
    dependencies: Map<string, { executablePath: string; installDir?: string | null }>,
  ): Record<string, unknown> | undefined {
    const tsserver = dependencies.get('typescript-sdk');
    if (descriptor.id === 'typescript-language-server' && tsserver) {
      return { tsserver: { fallbackPath: tsserver.executablePath } };
    }
    return undefined;
  }

  private async resolveLaunchArgs(
    args: string[],
    installDir?: string | null,
    executablePath?: string | null,
  ): Promise<string[]> {
    if (!args.some((arg) => arg.includes('${installDir}') || arg.includes('${workspaceData}') || arg.includes('${executablePath}'))) return args;
    if (!installDir || !this.workspace) throw new Error('语言服务器启动参数缺少托管安装目录或工作区');
    const normalizedInstallDir = installDir.replace(/[\\/]+$/, '');
    if (args.some((arg) => arg.includes('${executablePath}') && !executablePath)) {
      throw new Error('语言服务器启动参数缺少可执行文件路径');
    }
    const normalizedExecutablePath = executablePath?.replace(/[\\/]+$/, '') ?? '';
    if (!this.workspaceDataDir) {
      this.workspaceDataDir = await lspCommands.workspaceDataDir(this.workspace.rootPath);
    }
    const workspaceData = this.workspaceDataDir.replace(/[\\/]+$/, '');
    const replaceToken = (value: string, token: string, replacement: string): string =>
      value.split(token).join(replacement);
    return args.map((arg) => replaceToken(
      replaceToken(
        replaceToken(arg, '${installDir}', normalizedInstallDir),
        '${workspaceData}',
        workspaceData,
      ),
      '${executablePath}',
      normalizedExecutablePath,
    ));
  }

  async notifyWatchedFiles(changes: Array<{ uri: string; type: number }>): Promise<void> {
    if (changes.length === 0) return;
    await this.manager.notifyAll('workspace/didChangeWatchedFiles', { changes });
  }
}

export function createApplicationLspService(
  manager?: LspClientManager,
  options?: ApplicationLspServiceOptions,
): ApplicationLspService {
  return new ApplicationLspService(manager, options);
}

export type ApplicationLspResolver = MonacoLspClientResolver;
