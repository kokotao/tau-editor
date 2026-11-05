<template>
  <section
    v-if="isScratch"
    class="scratch-banner"
    data-testid="scratch-workspace-banner"
  >
    <div class="scratch-banner-row">
      <span class="scratch-badge" data-testid="scratch-workspace-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M12 3v6m0 0 3-3m-3 3L9 6" />
          <path d="M4 13a8 8 0 0 0 16 0" />
        </svg>
        {{ copy.badge }}
      </span>
      <button
        type="button"
        class="scratch-action"
        data-testid="btn-save-scratch-to-workspace"
        :disabled="busy"
        :title="copy.saveAs"
        @click="handleSaveAs"
      >
        {{ busy ? copy.saving : copy.saveAs }}
      </button>
    </div>
    <p class="scratch-hint">{{ copy.hint }}</p>
  </section>

  <p
    v-else-if="isSilent"
    class="scratch-silent-hint"
    data-testid="silent-workspace-hint"
  >
    {{ copy.silentHint }}
  </p>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { open as openDirectoryDialog } from '@tauri-apps/plugin-dialog';
import { fileCommands } from '@/lib/tauri';
import { useNotificationStore } from '@/stores/notification';
import { useSettingsStore } from '@/stores/settings';
import { useTabsStore } from '@/stores/tabs';
import { useWorkspaceStore } from '@/stores/workspace';
import { getScratchWorkspaceI18n } from '@/i18n/ui';

const emit = defineEmits<{
  /** 工作区已切换或文件已落盘，上层需要刷新资源管理器 */
  written: [];
}>();

const settingsStore = useSettingsStore();
const workspaceStore = useWorkspaceStore();
const tabsStore = useTabsStore();
const notificationStore = useNotificationStore();
const copy = computed(() => getScratchWorkspaceI18n(settingsStore.uiLanguage));

const busy = ref(false);
const isScratch = computed(
  () => workspaceStore.workspaceOrigin === 'scratch' && Boolean(workspaceStore.currentWorkspacePath),
);
const isSilent = computed(
  () => workspaceStore.workspaceOrigin === 'silent' && Boolean(workspaceStore.currentWorkspacePath),
);

interface CopyStats {
  copied: number;
  /** 目标已有同名文件，跳过不覆盖 */
  skipped: number;
  failed: number;
}

interface CopyResult {
  stats: CopyStats;
  /** 真正写到新根下的相对路径：只有这些文件才能把标签指过去 */
  copiedRelativePaths: string[];
}

const getBaseName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() || path;

/** 比较用规范化：分隔符统一、去尾斜杠，Windows 盘符路径大小写不敏感 */
const normalizePath = (path: string): string => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

const isSameOrInside = (child: string, parent: string): boolean =>
  child === parent || child.startsWith(`${parent}/`);

/**
 * 复制整棵目录树：每个文件统一走 copy_file（字节级复制，二进制不转码），
 * 目标已有同名文件时后端直接报错，这里按跳过处理，绝不覆盖。
 */
const copyTree = async (sourceDir: string, targetDir: string): Promise<CopyResult> => {
  const stats: CopyStats = { copied: 0, skipped: 0, failed: 0 };
  const copiedRelativePaths: string[] = [];

  const walk = async (dir: string, relativeDir: string): Promise<void> => {
    const entries = await fileCommands.listFiles(dir);
    for (const entry of entries) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.type === 'folder') {
        await walk(entry.path, relativePath);
        continue;
      }

      try {
        // 二进制经 copy_file 字节级复制，docx/pdf/xlsx 不会再被预览文本替换
        await fileCommands.copyFile(entry.path, `${targetDir}/${relativePath}`);
        copiedRelativePaths.push(relativePath);
        stats.copied += 1;
      } catch (error: any) {
        // 单个失败只计数，不中断整批；"目标文件已存在"算跳过，其余算失败
        const message = error?.message ?? String(error);
        if (message.includes('已存在')) {
          stats.skipped += 1;
        } else {
          stats.failed += 1;
        }
      }
    }
  };

  await walk(sourceDir, '');
  return { stats, copiedRelativePaths };
};

/** 「另存到工作区…」：把临时工作区的文件复制到用户选的目录，然后切到该目录作为正式工作区 */
const handleSaveAs = async () => {
  const sourcePath = workspaceStore.currentWorkspacePath;
  const cloudWorkspaceName = workspaceStore.currentWorkspaceName ?? '';
  if (!sourcePath || busy.value) {
    return;
  }

  let targetPath: string | null = null;
  try {
    const picked = await openDirectoryDialog({
      title: copy.value.saveAsDialogTitle,
      directory: true,
      multiple: false,
    });
    targetPath = Array.isArray(picked) ? picked[0] ?? null : picked;
  } catch (error: any) {
    notificationStore.error(copy.value.saveFailed, error?.message || String(error));
    return;
  }
  if (!targetPath) {
    return;
  }

  const sourceNormalized = normalizePath(sourcePath);
  const targetNormalized = normalizePath(targetPath);
  if (isSameOrInside(targetNormalized, sourceNormalized) || isSameOrInside(sourceNormalized, targetNormalized)) {
    notificationStore.error(copy.value.saveFailed, copy.value.targetInvalid);
    return;
  }

  // 选择器可能带回尾部分隔符，拼路径前先去掉，避免出现 "//"
  const targetRoot = targetPath.replace(/[\\/]+$/, '') || targetPath;

  busy.value = true;
  try {
    const { stats, copiedRelativePaths } = await copyTree(sourcePath, targetRoot);
    // 已打开标签跟着换目录：只改 filePath，内容与脏标记原样保留（不重读磁盘）
    const relocation = tabsStore.relocateTabsUnderWorkspace(sourcePath, targetRoot, copiedRelativePaths);
    workspaceStore.openWorkspace(targetRoot, 'user');
    // 下次从云文档打开同名工作区直接落在正式目录，不再新建临时区
    workspaceStore.rememberCloudWorkspace(cloudWorkspaceName, targetRoot, 'user');
    emit('written');
    notificationStore.success(
      copy.value.savedTitle,
      copy.value.savedMessage(
        getBaseName(targetRoot),
        stats.copied,
        stats.skipped,
        stats.failed,
      ),
    );
    if (relocation.skipped.length > 0) {
      const occupied = relocation.skipped.filter((item) => item.reason === 'occupied-by-tab').length;
      const notCopied = relocation.skipped.filter((item) => item.reason === 'not-copied').length;
      // 一次提示讲清楚哪些标签没迁、为什么没迁，不静默覆盖也不静默留在临时区
      notificationStore.warning(
        copy.value.relocateSkippedTitle,
        copy.value.relocateSkippedMessage(occupied, notCopied),
      );
    }
  } catch (error: any) {
    notificationStore.error(copy.value.saveFailed, error?.message || String(error));
  } finally {
    busy.value = false;
  }
};
</script>

<style scoped>
.scratch-banner {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--n-border-color, #333);
  background: color-mix(in srgb, var(--accent-blue, #4dabff) 9%, transparent);
}

.scratch-banner-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.scratch-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent-blue, #4dabff) 40%, transparent);
  color: var(--n-text-color, #d4d4d4);
  font-size: var(--font-size-ui-xs, 11px);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scratch-action {
  flex: 0 0 auto;
  margin-left: auto;
  padding: 2px 8px;
  border-radius: var(--radius-sm, 4px);
  border: 1px solid var(--n-border-color, #3a3a3a);
  background: var(--n-background-strong, #1e1e1e);
  color: var(--n-text-color, #ccc);
  font-size: var(--font-size-ui-xs, 11px);
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}

.scratch-action:hover {
  background: var(--n-hover-color, #2a2d2e);
}

.scratch-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.scratch-hint {
  margin: 0;
  color: var(--n-muted-text-color, #8b949e);
  font-size: var(--font-size-ui-xs, 10px);
  line-height: 1.5;
}

.scratch-silent-hint {
  margin: 0;
  padding: 6px 12px;
  border-bottom: 1px solid var(--n-border-color, #333);
  color: var(--n-muted-text-color, #8b949e);
  font-size: var(--font-size-ui-xs, 10px);
}
</style>
