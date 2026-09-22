/**
 * 内置 Provider 实现（v0.4.0）
 *
 * 这三组 provider 既是默认能力来源，也是扩展点示例：
 * - theme：提供一个可导入/导出的内置主题包；
 * - command：提供一个 Provider 状态查询命令；
 * - fileAction：提供复制路径 / 在文件管理器中显示两个文件动作。
 */

import { appCommands } from '@/lib/tauri';
import type { AppCommand } from '@/services/commandRegistry';
import type {
  CommandProvider,
  FileAction,
  FileActionProvider,
  ProviderRegistry,
  ThemeProvider,
} from '@/services/providerRegistry';
import { normalizeThemePackageRecord, type ThemePackage } from '@/utils/themePackage';
import { useNotificationStore } from '@/stores/notification';
import { providerRegistry } from '@/services/providerRegistry';

export const BUILTIN_THEME_PROVIDER_ID = 'builtin.themes';
export const BUILTIN_COMMAND_PROVIDER_ID = 'builtin.commands';
export const BUILTIN_FILE_ACTION_PROVIDER_ID = 'builtin.fileActions';

const BUILTIN_THEME_SOURCE = {
  id: 'tau-midnight',
  name: 'Tau Midnight',
  version: '1.0.0',
  mode: 'dark',
  colors: {
    bgApp: '#0b1020',
    panelBase: '#101726',
    textPrimary: '#ecf2ff',
    textSecondary: '#b6c2d9',
    accentBrand: '#7cc7ff',
    accentBrandStrong: '#4dabff',
    stateSuccess: '#4ade80',
    stateDanger: '#f87171',
  },
  monaco: {
    base: 'vs-dark',
    rules: [
      { token: 'comment', foreground: '75829e', fontStyle: 'italic' },
      { token: 'keyword', foreground: '7cc7ff' },
      { token: 'string', foreground: '86efac' },
    ],
    colors: {
      'editor.background': '#0b1020',
      'editor.foreground': '#ecf2ff',
      'editorLineNumber.foreground': '#3f4a63',
      'editorCursor.foreground': '#7cc7ff',
      'editor.selectionBackground': '#1e3a5f',
    },
  },
};

export function loadBuiltinThemePackages(): ThemePackage[] {
  const result = normalizeThemePackageRecord(BUILTIN_THEME_SOURCE);
  return result.ok ? [result.theme] : [];
}

export function createBuiltinThemeProvider(): ThemeProvider {
  return {
    id: BUILTIN_THEME_PROVIDER_ID,
    load: () => loadBuiltinThemePackages(),
  };
}

export function createBuiltinCommandProvider(): CommandProvider {
  const statusCommand: AppCommand = {
    id: 'provider.status',
    title: 'Provider 状态',
    category: 'view',
    keywords: ['provider', 'plugin', '扩展点', '扩展'],
    run: () => {
      const snapshot = providerRegistry.snapshot();
      const notificationStore = useNotificationStore();
      notificationStore.info(
        'Provider 状态',
        `${snapshot.registered.length} 个 provider，${snapshot.errors.length} 个错误`,
      );
    },
  };

  return {
    id: BUILTIN_COMMAND_PROVIDER_ID,
    commands: () => [statusCommand],
  };
}

export function createBuiltinFileActionProvider(): FileActionProvider {
  const actions: FileAction[] = [
    {
      id: 'file.copyPath',
      title: '复制文件路径',
      run: async ({ filePath }) => {
        const notificationStore = useNotificationStore();
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(filePath);
          notificationStore.info('已复制路径', filePath);
          return;
        }
        notificationStore.info('文件路径', filePath);
      },
    },
    {
      id: 'file.revealInFolder',
      title: '在文件管理器中显示',
      run: async ({ filePath, isTauri }) => {
        const notificationStore = useNotificationStore();
        if (!isTauri) {
          notificationStore.error('无法打开', '仅桌面端支持在文件管理器中显示');
          return;
        }
        try {
          await appCommands.revealInFileManager(filePath);
        } catch (error) {
          notificationStore.error(
            '打开文件管理器失败',
            error instanceof Error ? error.message : String(error),
          );
        }
      },
    },
  ];

  return {
    id: BUILTIN_FILE_ACTION_PROVIDER_ID,
    actions: () => actions,
  };
}

/** 注册全部内置 provider；重复调用会被注册表按 id 去重并记录告警。 */
export function registerBuiltinProviders(registry: ProviderRegistry = providerRegistry) {
  registry.registerTheme(createBuiltinThemeProvider());
  registry.registerCommand(createBuiltinCommandProvider());
  registry.registerFileAction(createBuiltinFileActionProvider());
}
