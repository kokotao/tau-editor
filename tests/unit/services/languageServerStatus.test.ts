/**
 * @description 验证应用托管语言服务器优先级和旧后端 PATH 降级行为。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 21:35
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriMocks = vi.hoisted(() => ({
  isTauriApp: vi.fn(() => true),
  probeServers: vi.fn(),
  probeManaged: vi.fn(),
  platformInfo: vi.fn(),
  installServer: vi.fn(),
  provision: vi.fn(),
}));

vi.mock('@/lib/tauri', () => ({
  isTauriApp: tauriMocks.isTauriApp,
  lspCommands: {
    probeServers: tauriMocks.probeServers,
    probeManaged: tauriMocks.probeManaged,
    platformInfo: tauriMocks.platformInfo,
    installServer: tauriMocks.installServer,
    provision: tauriMocks.provision,
  },
}));

import {
  buildManagedAssetMirrorUrl,
  mergeLanguageServerProbe,
  provisionLanguageServer,
  probeLanguageServers,
} from '@/services/lsp/languageServerStatus';
import { findLanguageServer } from '@/services/lsp/languageServerRegistry';

describe('languageServerStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauriMocks.isTauriApp.mockReturnValue(true);
    tauriMocks.probeServers.mockResolvedValue({
      servers: [{
        id: 'typescript-language-server',
        languageIds: ['typescript'],
        command: 'typescript-language-server',
        installed: true,
        available: true,
        path: '/usr/local/bin/typescript-language-server',
        version: 'PATH 4.0',
      }],
    });
    tauriMocks.probeManaged.mockResolvedValue({ servers: [] });
    tauriMocks.platformInfo.mockResolvedValue({ platform: 'darwin', arch: 'arm64' });
    tauriMocks.installServer.mockResolvedValue({
      serverId: 'rust-analyzer',
      version: '2026-09-21',
      installed: true,
      state: 'ready',
      executablePath: '/private/tau/rust-analyzer',
    });
  });

  it('托管语言服务器可用时优先使用应用私有路径', () => {
    const descriptor = findLanguageServer('typescript');
    expect(descriptor).not.toBeNull();
    const status = mergeLanguageServerProbe(descriptor!, {
      id: 'typescript-language-server',
      languageIds: ['typescript'],
      command: 'typescript-language-server',
      installed: true,
      available: true,
      path: '/usr/local/bin/typescript-language-server',
      version: 'PATH 4.0',
    }, {
      id: 'typescript-language-server',
      state: 'ready',
      executablePath: '/private/tau/lsp/typescript-language-server',
      version: 'managed 4.1',
      cached: true,
    });

    expect(status.available).toBe(true);
    expect(status.source).toBe('managed');
    expect(status.path).toBe('/private/tau/lsp/typescript-language-server');
    expect(status.version).toBe('managed 4.1');
  });

  it('托管接口未提供时保留 PATH 探测结果', async () => {
    const statuses = await probeLanguageServers();
    const typescript = statuses.find((server) => server.id === 'typescript-language-server');

    expect(typescript?.source).toBe('path');
    expect(typescript?.path).toBe('/usr/local/bin/typescript-language-server');
    expect(typescript?.managedState).toBe('unsupported');
  });

  it('当前平台没有托管包时应提示用户安装到 PATH', () => {
    const descriptor = findLanguageServer('typescript')!;
    const status = mergeLanguageServerProbe(descriptor, undefined, undefined, false);

    expect(status.managedConfigured).toBe(false);
    expect(status.reason).toContain('当前平台暂无应用托管包');
    expect(status.reason).toContain('PATH');
  });

  it('托管接口失败时不阻塞设置页状态刷新', async () => {
    tauriMocks.probeManaged.mockRejectedValue(new Error('unknown command'));
    await expect(probeLanguageServers()).resolves.toHaveLength(7);
    expect(tauriMocks.probeServers).toHaveBeenCalledTimes(1);
  });

  it('托管资产镜像路径按平台、服务、版本和文件名生成', () => {
    const rustAnalyzer = findLanguageServer('rust')!;
    const asset = rustAnalyzer.managedAssets?.['darwin-arm64'];
    expect(asset).toBeDefined();
    expect(buildManagedAssetMirrorUrl(rustAnalyzer.managedId!, 'darwin-arm64', asset!))
      .toBe('https://taueditor.lizipro.cn/tau-editor/lsp-assets/darwin-arm64/rust-analyzer/2026-09-21/rust-analyzer-aarch64-apple-darwin.gz');
  });

  it('托管安装先尝试镜像，镜像失败后回退官方源', async () => {
    tauriMocks.installServer
      .mockRejectedValueOnce(new Error('mirror unavailable'))
      .mockResolvedValueOnce({
        serverId: 'rust-analyzer',
        version: '2026-09-21',
        installed: true,
        state: 'ready',
        executablePath: '/private/tau/rust-analyzer',
      });

    await provisionLanguageServer('rust-analyzer');

    expect(tauriMocks.installServer).toHaveBeenNthCalledWith(1, expect.objectContaining({
      serverId: 'rust-analyzer',
      downloadUrl: 'https://taueditor.lizipro.cn/tau-editor/lsp-assets/darwin-arm64/rust-analyzer/2026-09-21/rust-analyzer-aarch64-apple-darwin.gz',
    }));
    expect(tauriMocks.installServer).toHaveBeenNthCalledWith(2, expect.objectContaining({
      serverId: 'rust-analyzer',
      downloadUrl: 'https://github.com/rust-lang/rust-analyzer/releases/download/2026-09-21/rust-analyzer-aarch64-apple-darwin.gz',
    }));
  });
});
