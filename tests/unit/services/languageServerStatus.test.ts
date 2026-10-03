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
  provision: vi.fn(),
}));

vi.mock('@/lib/tauri', () => ({
  isTauriApp: tauriMocks.isTauriApp,
  lspCommands: {
    probeServers: tauriMocks.probeServers,
    probeManaged: tauriMocks.probeManaged,
    provision: tauriMocks.provision,
  },
}));

import {
  mergeLanguageServerProbe,
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

  it('托管接口失败时不阻塞设置页状态刷新', async () => {
    tauriMocks.probeManaged.mockRejectedValue(new Error('unknown command'));
    await expect(probeLanguageServers()).resolves.toHaveLength(7);
    expect(tauriMocks.probeServers).toHaveBeenCalledTimes(1);
  });
});
