import { invoke } from '@tauri-apps/api/core';

export type FileEntryType = 'file' | 'folder';

export interface FileEntry {
  name: string;
  path: string;
  type: FileEntryType;
  size?: number;
  modified?: string | number | null;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  created?: string | number | null;
  modified?: string | number | null;
  accessed?: string | number | null;
  is_dir?: boolean;
}

export interface AppVersionInfo {
  version: string;
  os: string;
  arch: string;
  buildTarget: string;
  homepageUrl: string;
}

export interface DeviceInfo {
  os: string;
  arch: string;
}

export interface ReleaseAssetInfo {
  name: string;
  browserDownloadUrl: string;
  size: number;
  contentType?: string | null;
}

export interface GithubUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseName: string;
  releaseNotes: string;
  releaseUrl: string;
  publishedAt?: string | null;
  selectedAsset?: ReleaseAssetInfo | null;
  device: DeviceInfo;
  repositoryUrl: string;
}

export interface DownloadInstallResult {
  downloadedPath: string;
  launched: boolean;
  message: string;
}

const WEB_UNSUPPORTED =
  '当前是 Web 构建，文件系统命令仅在 Tauri 桌面端可用。';

function isTauriAvailable(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function isTauriApp(): boolean {
  return isTauriAvailable();
}

async function invokeCommand<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!isTauriAvailable()) {
    throw new TauriError(WEB_UNSUPPORTED, command);
  }

  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw TauriError.fromError(error, command);
  }
}

export class TauriError extends Error {
  command?: string;
  cause?: unknown;

  constructor(message: string, command?: string, cause?: unknown) {
    super(message);
    this.name = 'TauriError';
    this.command = command;
    this.cause = cause;
  }

  static fromError(error: unknown, command?: string): TauriError {
    if (error instanceof TauriError) {
      return error;
    }

    if (error instanceof Error) {
      return new TauriError(error.message, command, error);
    }

    return new TauriError(String(error), command, error);
  }
}

export const fileCommands = {
  async readFile(path: string): Promise<string> {
    return invokeCommand<string>('read_file', { path });
  },

  async writeFile(path: string, content: string): Promise<void> {
    await invokeCommand<void>('write_file', { path, content });
  },

  async listFiles(dir: string): Promise<FileEntry[]> {
    const entries = await invokeCommand<Array<Omit<FileEntry, 'type'> & { type?: FileEntryType; file_type?: FileEntryType }>>(
      'list_files',
      { dir },
    );

    return entries.map((entry) => ({
      ...entry,
      type: entry.type ?? entry.file_type ?? 'file',
    }));
  },

  async createFile(path: string): Promise<void> {
    await invokeCommand<void>('create_file', { path });
  },

  async createFolder(path: string): Promise<void> {
    await invokeCommand<void>('create_folder', { path });
  },

  async deleteFile(path: string): Promise<void> {
    await invokeCommand<void>('delete_file', { path });
  },

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    await invokeCommand<void>('rename_file', {
      oldPath,
      old_path: oldPath,
      newPath,
      new_path: newPath,
    });
  },

  async getFileInfo(path: string): Promise<FileInfo> {
    return invokeCommand<FileInfo>('get_file_info', { path });
  },
};

export const settingsCommands = {
  async getAutoSaveInterval(): Promise<number> {
    if (!isTauriAvailable()) {
      return 0;
    }

    return invokeCommand<number>('get_auto_save_interval');
  },

  async setAutoSaveInterval(interval: number): Promise<void> {
    if (!isTauriAvailable()) {
      return;
    }

    await invokeCommand<void>('auto_save_config', { interval });
  },

  async getAppVersionInfo(): Promise<AppVersionInfo> {
    if (!isTauriAvailable()) {
      const fallbackDevice = getBrowserDeviceInfo();
      return {
        version: 'web',
        os: fallbackDevice.os,
        arch: fallbackDevice.arch,
        buildTarget: `web-${fallbackDevice.os}`,
        homepageUrl: PROJECT_HOMEPAGE_URL,
      };
    }

    return invokeCommand<AppVersionInfo>('get_app_version_info');
  },

  async checkGithubUpdate(repoUrl?: string): Promise<GithubUpdateInfo> {
    if (!isTauriAvailable()) {
      const fallbackVersion = await settingsCommands.getAppVersionInfo();
      return {
        currentVersion: fallbackVersion.version,
        latestVersion: fallbackVersion.version,
        hasUpdate: false,
        releaseName: '',
        releaseNotes: '',
        releaseUrl: repoUrl ?? PROJECT_HOMEPAGE_URL,
        publishedAt: null,
        selectedAsset: null,
        device: {
          os: fallbackVersion.os,
          arch: fallbackVersion.arch,
        },
        repositoryUrl: repoUrl ?? PROJECT_HOMEPAGE_URL,
      };
    }

    return invokeCommand<GithubUpdateInfo>('check_github_update', {
      repoUrl,
      repo_url: repoUrl,
    });
  },

  async downloadAndInstallUpdate(downloadUrl: string, fileName: string): Promise<DownloadInstallResult> {
    if (!isTauriAvailable()) {
      if (typeof window !== 'undefined') {
        window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      }
      return {
        downloadedPath: '',
        launched: true,
        message: 'Web 模式下已在新窗口打开下载链接。',
      };
    }

    return invokeCommand<DownloadInstallResult>('download_and_install_update', {
      downloadUrl,
      download_url: downloadUrl,
      fileName,
      file_name: fileName,
    });
  },
};

const PROJECT_HOMEPAGE_URL = 'https://github.com/kokotao/tau-editor';

function getBrowserDeviceInfo(): DeviceInfo {
  if (typeof navigator === 'undefined') {
    return { os: 'web', arch: 'unknown' };
  }

  const lowerUA = navigator.userAgent.toLowerCase();
  const lowerPlatform = navigator.platform.toLowerCase();

  const os = lowerUA.includes('windows')
    ? 'windows'
    : lowerUA.includes('mac')
      ? 'macos'
      : lowerUA.includes('linux')
        ? 'linux'
        : 'web';

  const arch = lowerUA.includes('arm64') || lowerUA.includes('aarch64')
    ? 'aarch64'
    : lowerUA.includes('x86_64') || lowerUA.includes('win64') || lowerPlatform.includes('x86_64')
      ? 'x86_64'
      : 'unknown';

  return { os, arch };
}

export const appCommands = {
  async consumePendingOpenPaths(): Promise<string[]> {
    if (!isTauriAvailable()) {
      return [];
    }

    return invokeCommand<string[]>('consume_pending_open_paths');
  },

  async openProjectHomepage(): Promise<void> {
    if (!isTauriAvailable()) {
      if (typeof window !== 'undefined') {
        window.open(PROJECT_HOMEPAGE_URL, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    try {
      await invokeCommand<void>('open_project_homepage');
    } catch (error) {
      if (typeof window !== 'undefined') {
        window.open(PROJECT_HOMEPAGE_URL, '_blank', 'noopener,noreferrer');
        return;
      }
      throw TauriError.fromError(error, 'open_project_homepage');
    }
  },

  async openExternalLink(url: string): Promise<void> {
    if (!isTauriAvailable()) {
      if (typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    await invokeCommand<void>('open_external_link', {
      url,
    });
  },
};
