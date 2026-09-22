import { defineStore } from 'pinia';
import type { WorkspaceChangeKind } from '@/lib/tauri';
import { normalizeWorkspacePath } from '@/services/workspaceWatcherService';

export interface FileConflictRecord {
  /** 磁盘上的绝对路径（保留原始大小写） */
  path: string;
  kind: WorkspaceChangeKind;
  detectedAt: number;
  diskModifiedMs: number | null;
  diskSize: number | null;
  /** 最后一次与磁盘一致的修改时间，用于三方对照 */
  baselineModifiedMs: number | null;
}

export interface FileConflictInput {
  path: string;
  kind: WorkspaceChangeKind;
  diskModifiedMs?: number | null;
  diskSize?: number | null;
  baselineModifiedMs?: number | null;
  detectedAt?: number;
}

export const useFileConflictsStore = defineStore('fileConflicts', {
  state: () => ({
    records: {} as Record<string, FileConflictRecord>,
  }),

  getters: {
    count: (state) => Object.keys(state.records).length,
    paths: (state) => Object.keys(state.records).sort(),
    hasConflicts: (state) => Object.keys(state.records).length > 0,
  },

  actions: {
    /**
     * 记录或刷新一条外部变更冲突。
     * @returns 首次记录时返回 true，用于避免重复提示。
     */
    flag(input: FileConflictInput): boolean {
      const key = normalizeWorkspacePath(input.path);
      const existed = key in this.records;

      this.records[key] = {
        path: input.path,
        kind: input.kind,
        detectedAt: input.detectedAt ?? Date.now(),
        diskModifiedMs: input.diskModifiedMs ?? null,
        diskSize: input.diskSize ?? null,
        baselineModifiedMs: input.baselineModifiedMs ?? null,
      };

      return !existed;
    },

    find(path: string | null | undefined): FileConflictRecord | null {
      if (!path) return null;
      return this.records[normalizeWorkspacePath(path)] ?? null;
    },

    resolve(path: string | null | undefined): void {
      if (!path) return;
      delete this.records[normalizeWorkspacePath(path)];
    },

    /** 关闭标签或文件被移除后，丢弃不再需要的冲突记录 */
    retainOnly(paths: string[]): void {
      const keep = new Set(paths.map(normalizeWorkspacePath));
      for (const key of Object.keys(this.records)) {
        if (!keep.has(key)) {
          delete this.records[key];
        }
      }
    },

    clear(): void {
      this.records = {};
    },
  },
});
