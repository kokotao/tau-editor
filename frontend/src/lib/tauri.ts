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
};
