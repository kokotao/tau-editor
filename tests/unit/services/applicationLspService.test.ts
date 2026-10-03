/**
 * @description 验证应用重启后仍通过私有 Node 启动 TypeScript/Pyright，而不是直接执行脚本文件。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 15:55
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriMocks = vi.hoisted(() => ({
  isTauriApp: vi.fn(() => true),
  probeManaged: vi.fn(),
  platformInfo: vi.fn(),
  workspaceDataDir: vi.fn(),
  installServer: vi.fn(),
}));

vi.mock('@/lib/tauri', () => ({
  isTauriApp: tauriMocks.isTauriApp,
  lspCommands: {
    probeManaged: tauriMocks.probeManaged,
    platformInfo: tauriMocks.platformInfo,
    workspaceDataDir: tauriMocks.workspaceDataDir,
    installServer: tauriMocks.installServer,
  },
}));

import { ApplicationLspService } from '@/services/lsp/applicationLspService';

describe('ApplicationLspService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauriMocks.isTauriApp.mockReturnValue(true);
    tauriMocks.platformInfo.mockResolvedValue({ platform: 'darwin', arch: 'arm64' });
    tauriMocks.workspaceDataDir.mockResolvedValue('/private/tau/lsp-workspaces/workspace-hash');
    tauriMocks.probeManaged.mockResolvedValue({
      servers: [
        {
          id: 'node-runtime',
          state: 'ready',
          executablePath: '/private/tau/lsp-servers/node-runtime/22.22.2/bin/node',
        },
        {
          id: 'typescript-sdk',
          state: 'ready',
          executablePath: '/private/tau/lsp-servers/typescript-sdk/6.0.3/package/lib/tsserver.js',
        },
        {
          id: 'typescript-language-server',
          state: 'ready',
          executablePath: '/private/tau/lsp-servers/typescript-language-server/6.0.1/package/lib/cli.mjs',
          // 旧 manifest 没有持久化 launchCommand/launchArgs，服务必须根据 descriptor 恢复复合启动。
          launchArgs: [],
        },
      ],
    });
  });

  it('缓存命中时用私有 Node 执行 TypeScript language server 脚本', async () => {
    const starts: Array<{ command: string; args: string[]; env?: Record<string, string> }> = [];
    const manager = {
      start: vi.fn(async (options: { command: string; args: string[]; env?: Record<string, string> }) => {
        starts.push(options);
        return { request: vi.fn() };
      }),
      stopAll: vi.fn(async () => undefined),
      notifyAll: vi.fn(async () => undefined),
    };
    const service = new ApplicationLspService(manager as never);
    await service.setWorkspace({ workspaceId: 'workspace-1', rootPath: '/workspace' });

    await service.resolveClient({}, { uri: 'file:///workspace/index.ts', languageId: 'typescript' });

    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({
      command: '/private/tau/lsp-servers/node-runtime/22.22.2/bin/node',
      args: [
        '/private/tau/lsp-servers/typescript-language-server/6.0.1/package/lib/cli.mjs',
        '--stdio',
      ],
    });
    expect((starts[0] as { initializeParams?: Record<string, unknown> }).initializeParams)
      .toEqual({
        tsserver: {
          fallbackPath: '/private/tau/lsp-servers/typescript-sdk/6.0.3/package/lib/tsserver.js',
        },
      });
  });

  it('语言服务器缓存存在但私有 Node 缺失时自动补装运行时再启动', async () => {
    const nodePath = '/private/tau/lsp-servers/node-runtime/22.22.2/bin/node';
    tauriMocks.probeManaged.mockResolvedValueOnce({
      servers: [{
        id: 'typescript-sdk',
        state: 'ready',
        executablePath: '/private/tau/lsp-servers/typescript-sdk/6.0.3/package/lib/tsserver.js',
      }, {
        id: 'typescript-language-server',
        state: 'ready',
        executablePath: '/private/tau/lsp-servers/typescript-language-server/6.0.1/package/lib/cli.mjs',
      }],
    });
    tauriMocks.installServer.mockResolvedValue({
      installed: true,
      executablePath: nodePath,
    });
    const manager = {
      start: vi.fn(async (options: { command: string; args: string[] }) => options),
      stopAll: vi.fn(async () => undefined),
      notifyAll: vi.fn(async () => undefined),
    };
    const service = new ApplicationLspService(manager as never);
    await service.setWorkspace({ workspaceId: 'workspace-1', rootPath: '/workspace' });

    await service.resolveClient({}, { uri: 'file:///workspace/index.ts', languageId: 'typescript' });

    expect(tauriMocks.installServer).toHaveBeenCalledWith(expect.objectContaining({ serverId: 'node-runtime' }));
    expect(manager.start).toHaveBeenCalledWith(expect.objectContaining({
      command: nodePath,
      args: [
        '/private/tau/lsp-servers/typescript-language-server/6.0.1/package/lib/cli.mjs',
        '--stdio',
      ],
    }));
  });

  it('缓存启动参数中的工作区模板会解析为隔离数据目录', async () => {
    tauriMocks.probeManaged.mockResolvedValue({
      servers: [{
        id: 'java-runtime',
        state: 'ready',
        installDir: '/private/tau/lsp-servers/java-runtime/21.0.12.1+1',
        executablePath: '/private/tau/lsp-servers/java-runtime/21.0.12.1+1/jdk-21.0.12.1+1-jre/Contents/Home/bin/java',
        launchCommand: '/private/tau/lsp-servers/java-runtime/21.0.12.1+1/jdk-21.0.12.1+1-jre/Contents/Home/bin/java',
      }, {
        id: 'jdtls',
        state: 'ready',
        installDir: '/private/tau/lsp-servers/jdtls/1.62.0',
        executablePath: '/private/tau/lsp-servers/jdtls/1.62.0/plugins/org.eclipse.equinox.launcher.jar',
      }],
    });
    const starts: Array<{ command: string; args: string[] }> = [];
    const manager = {
      start: vi.fn(async (options: { command: string; args: string[] }) => {
        starts.push(options);
        return { request: vi.fn() };
      }),
      stopAll: vi.fn(async () => undefined),
      notifyAll: vi.fn(async () => undefined),
    };
    const service = new ApplicationLspService(manager as never);
    await service.setWorkspace({ workspaceId: 'workspace-1', rootPath: '/workspace' });

    await service.resolveClient({}, { uri: 'file:///workspace/Main.java', languageId: 'java' });

    expect(starts[0]?.command).toContain('/java');
    expect(starts[0]?.args).toContain('-jar');
    expect(starts[0]?.args).toContain('/private/tau/lsp-servers/jdtls/1.62.0/plugins/org.eclipse.equinox.launcher.jar');
    expect(starts[0]?.args).toContain('/private/tau/lsp-workspaces/workspace-hash');
  });

  it('C# 使用私有 OmniSharp apphost，并注入私有 .NET SDK 根目录', async () => {
    tauriMocks.probeManaged.mockResolvedValue({
      servers: [{
        id: 'dotnet-sdk',
        state: 'ready',
        installDir: '/private/tau/lsp-servers/dotnet-sdk/10.0.100',
        executablePath: '/private/tau/lsp-servers/dotnet-sdk/10.0.100/dotnet',
      }, {
        id: 'omnisharp',
        state: 'ready',
        installDir: '/private/tau/lsp-servers/omnisharp/2.0.0',
        executablePath: '/private/tau/lsp-servers/omnisharp/2.0.0/OmniSharp',
        launchCommand: '/private/tau/lsp-servers/omnisharp/2.0.0/OmniSharp',
        launchArgs: ['--languageserver'],
      }],
    });
    const starts: Array<{ command: string; args: string[]; env?: Record<string, string> }> = [];
    const manager = {
      start: vi.fn(async (options: { command: string; args: string[]; env?: Record<string, string> }) => {
        starts.push(options);
        return { request: vi.fn() };
      }),
      stopAll: vi.fn(async () => undefined),
      notifyAll: vi.fn(async () => undefined),
    };
    const service = new ApplicationLspService(manager as never);
    await service.setWorkspace({ workspaceId: 'workspace-1', rootPath: '/workspace' });

    await service.resolveClient({}, { uri: 'file:///workspace/Program.cs', languageId: 'csharp' });

    expect(starts[0]).toMatchObject({
      command: '/private/tau/lsp-servers/omnisharp/2.0.0/OmniSharp',
      args: ['--languageserver'],
      env: {
        DOTNET_ROOT: '/private/tau/lsp-servers/dotnet-sdk/10.0.100',
        DOTNET_ROOT_ARM64: '/private/tau/lsp-servers/dotnet-sdk/10.0.100',
      },
    });
  });
});
