/**
 * providerRegistry 单元测试（v0.4.0）
 */

import { describe, expect, it, vi } from 'vitest';
import { createProviderRegistry } from '@/services/providerRegistry';
import type { AppCommand } from '@/services/commandRegistry';
import type { ThemePackage } from '@/utils/themePackage';

const theme = (id: string): ThemePackage => ({
  id,
  name: id,
  version: '1.0.0',
  mode: 'dark',
  colors: { bgApp: '#000000', textPrimary: '#ffffff' },
  monaco: { base: 'vs-dark', rules: [], colors: {} },
});

const command = (id: string): AppCommand => ({
  id,
  title: id,
  category: 'view',
  run: vi.fn(),
});

describe('providerRegistry', () => {
  it('registers providers by kind and reports a snapshot', () => {
    const registry = createProviderRegistry();
    registry.registerTheme({ id: 'theme.a', load: () => [theme('a')] });
    registry.registerCommand({ id: 'command.a', commands: () => [command('a')] });
    registry.registerFileAction({ id: 'file.a', actions: () => [] });

    const snapshot = registry.snapshot();
    expect(snapshot.registered).toEqual([
      { id: 'theme.a', kind: 'theme' },
      { id: 'command.a', kind: 'command' },
      { id: 'file.a', kind: 'fileAction' },
    ]);
    expect(snapshot.errors).toEqual([]);
  });

  it('overrides duplicate ids and records a warning', async () => {
    const registry = createProviderRegistry();
    registry.registerTheme({ id: 'theme.a', load: () => [theme('first')] });
    registry.registerTheme({ id: 'theme.a', load: () => [theme('second')] });

    const loaded = await registry.loadThemes();
    expect(loaded.map((item) => item.id)).toEqual(['second']);
    expect(registry.snapshot().warnings[0]).toContain('重复注册');
  });

  it('isolates provider failures without dropping healthy providers', async () => {
    const registry = createProviderRegistry();
    registry.registerTheme({
      id: 'theme.bad',
      load: () => {
        throw new Error('boom');
      },
    });
    registry.registerTheme({ id: 'theme.good', load: () => [theme('good')] });

    const themes = await registry.loadThemes();
    expect(themes.map((item) => item.id)).toEqual(['good']);
    expect(registry.snapshot().errors).toEqual([
      { providerId: 'theme.bad', kind: 'theme', code: 'PROVIDER_FAILED', message: 'boom' },
    ]);
  });

  it('rejects malformed provider output and empty ids', () => {
    const registry = createProviderRegistry();
    registry.registerTheme({ id: '', load: () => [] });
    registry.registerCommand({
      id: 'command.bad',
      commands: () => [command('ok'), { id: '' } as unknown as AppCommand],
    });
    registry.registerFileAction({
      id: 'file.bad',
      actions: () => [{ id: 'action.ok', title: 'ok', run: vi.fn() }, {} as never],
    });

    expect(registry.loadCommands().map((item) => item.id)).toEqual(['ok']);
    expect(registry.loadFileActions().map((item) => item.id)).toEqual(['action.ok']);
    expect(registry.snapshot().errors[0]?.message).toContain('provider id');

    registry.clearDiagnostics();
    expect(registry.snapshot().errors).toEqual([]);
  });

  it('records async theme provider failures', async () => {
    const registry = createProviderRegistry();
    registry.registerTheme({
      id: 'theme.async',
      load: async () => {
        throw new Error('async boom');
      },
    });

    expect(await registry.loadThemes()).toEqual([]);
    expect(registry.snapshot().errors[0]?.message).toBe('async boom');
  });
});
