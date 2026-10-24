/**
 * @description 云文档同步 Store：登录会话、配额展示、同步状态与本地文档映射。
 * 持久化白名单仅 baseUrl + docMap（键 `tau-cloud-sync`），绝不落盘 token/密码。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 10:35
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { CloudDocSpace, CloudSessionInfo } from '@/lib/tauri';
import {
  DEFAULT_CLOUD_BASE_URL,
  loginToLizi,
  logoutFromLizi,
  restoreCloudSession,
  type CloudLoginInput,
} from '@/services/cloudAuthService';
import { getCloudSpace, type CloudOutcome } from '@/services/cloudDocService';
import {
  resolveCloudDocPathForFile,
  syncCurrentDocument as runCloudSync,
  type CloudSyncResult,
} from '@/services/cloudSyncService';
import { useTabsStore } from '@/stores/tabs';
import { useWorkspaceStore } from '@/stores/workspace';

/** localStorage 键：只存 baseUrl 与 docMap，不存任何凭据。 */
export const CLOUD_SYNC_STORAGE_KEY = 'tau-cloud-sync';

export type CloudSyncStatus = 'idle' | 'signing-in' | 'syncing' | 'error';

export interface CloudDocSyncMeta {
  fileId: number;
  version: number;
  contentHash: string | null;
  updatedAt: string | null;
}

interface PersistedCloudSyncState {
  baseUrl?: string;
  docMap?: Record<string, CloudDocSyncMeta>;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const digits = unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex] ?? 'B'}`;
}

function normalizeDocSyncMeta(value: unknown): CloudDocSyncMeta | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as {
    fileId?: unknown;
    version?: unknown;
    contentHash?: unknown;
    updatedAt?: unknown;
  };
  if (typeof record.fileId !== 'number' || typeof record.version !== 'number') {
    return null;
  }

  return {
    fileId: record.fileId,
    version: record.version,
    contentHash: typeof record.contentHash === 'string' ? record.contentHash : null,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
  };
}

function readPersistedState(): PersistedCloudSyncState {
  if (typeof localStorage === 'undefined') {
    return {};
  }

  try {
    const raw = localStorage.getItem(CLOUD_SYNC_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }

    const record = parsed as { baseUrl?: unknown; docMap?: unknown };
    const state: PersistedCloudSyncState = {};

    if (typeof record.baseUrl === 'string' && record.baseUrl.trim()) {
      state.baseUrl = record.baseUrl.trim();
    }

    if (typeof record.docMap === 'object' && record.docMap !== null) {
      const docMap: Record<string, CloudDocSyncMeta> = {};
      for (const [path, meta] of Object.entries(record.docMap)) {
        const normalized = normalizeDocSyncMeta(meta);
        if (normalized) {
          docMap[path] = normalized;
        }
      }
      state.docMap = docMap;
    }

    return state;
  } catch (error) {
    console.warn('[CloudSync] 读取本地云同步记录失败:', error);
    return {};
  }
}

export const useCloudSyncStore = defineStore('cloudSync', () => {
  const baseUrl = ref(DEFAULT_CLOUD_BASE_URL);
  const signedIn = ref(false);
  const username = ref<string | null>(null);
  const userId = ref<string | null>(null);
  const space = ref<CloudDocSpace | null>(null);
  const status = ref<CloudSyncStatus>('idle');
  const lastError = ref<string | null>(null);
  const lastSyncAt = ref<number | null>(null);
  const docMap = ref<Record<string, CloudDocSyncMeta>>({});

  const usedRatio = computed(() => {
    const current = space.value;
    if (!current || current.quotaBytes <= 0) {
      return 0;
    }
    return Math.min(1, Math.max(0, current.usedBytes / current.quotaBytes));
  });

  const quotaLabel = computed(() => {
    const current = space.value;
    if (!current) {
      return '';
    }
    return `${formatBytes(current.usedBytes)} / ${formatBytes(current.quotaBytes)}`;
  });

  const isBusy = computed(
    () => status.value === 'signing-in' || status.value === 'syncing',
  );

  function persistState(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      // 白名单持久化：只有 baseUrl 与 docMap 会离开内存。
      const payload: PersistedCloudSyncState = {
        baseUrl: baseUrl.value,
        docMap: docMap.value,
      };
      localStorage.setItem(CLOUD_SYNC_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('[CloudSync] 保存云同步记录失败:', error);
    }
  }

  function applySession(session: CloudSessionInfo): void {
    signedIn.value = session.signedIn;
    username.value = session.username;
    userId.value = session.userId;
    if (session.baseUrl && session.baseUrl.trim()) {
      baseUrl.value = session.baseUrl.trim();
    }
  }

  function resetSession(): void {
    signedIn.value = false;
    username.value = null;
    userId.value = null;
    space.value = null;
    lastSyncAt.value = null;
  }

  async function initialize(): Promise<void> {
    const persisted = readPersistedState();
    if (persisted.baseUrl) {
      baseUrl.value = persisted.baseUrl;
    }
    docMap.value = persisted.docMap ?? {};

    const restored = await restoreCloudSession();
    if (!restored.ok) {
      lastError.value = restored.message;
      resetSession();
      status.value = 'idle';
      return;
    }

    lastError.value = null;
    if (!restored.data) {
      resetSession();
      status.value = 'idle';
      return;
    }

    applySession(restored.data);
    status.value = 'idle';
    await refreshSpace();
  }

  async function login(input: CloudLoginInput): Promise<CloudOutcome<CloudSessionInfo>> {
    status.value = 'signing-in';
    lastError.value = null;

    const outcome = await loginToLizi({
      ...input,
      baseUrl: input.baseUrl ?? baseUrl.value,
    });

    if (!outcome.ok) {
      lastError.value = outcome.message;
      status.value = 'error';
      return outcome;
    }

    applySession(outcome.data);
    status.value = 'idle';
    persistState();
    await refreshSpace();
    return outcome;
  }

  async function logout(): Promise<void> {
    const outcome = await logoutFromLizi();
    resetSession();
    if (outcome.ok) {
      status.value = 'idle';
      lastError.value = null;
    } else {
      lastError.value = outcome.message;
      status.value = 'error';
    }
    // baseUrl 与 docMap 不是凭据，登出后保留，避免重复配置服务器。
    persistState();
  }

  async function refreshSpace(): Promise<void> {
    if (!signedIn.value) {
      space.value = null;
      return;
    }

    const outcome = await getCloudSpace();
    if (outcome.ok) {
      space.value = outcome.data;
      return;
    }

    lastError.value = outcome.message;
    if (outcome.kind === 'unauthorized') {
      resetSession();
    }
  }

  async function syncCurrentDocument(tabId?: string): Promise<CloudSyncResult> {
    status.value = 'syncing';
    lastError.value = null;

    const result = await runCloudSync(tabId);
    lastSyncAt.value = Date.now();

    if (result.status === 'failed') {
      lastError.value = result.message ?? '云同步失败';
    }

    if (result.status === 'synced') {
      rememberSyncedTab(tabId);
      await refreshSpace();
    }

    status.value = lastError.value ? 'error' : 'idle';
    return result;
  }

  /** 同步成功后按标签的云端字段回填 docMap，供下次三方决策使用。 */
  function rememberSyncedTab(tabId?: string): void {
    const tabsStore = useTabsStore();
    const tab = tabId
      ? tabsStore.tabs.find((item) => item.id === tabId) ?? null
      : tabsStore.activeTab;
    if (!tab?.filePath || tab.cloudFileId == null || tab.cloudVersion == null) {
      return;
    }

    const workspaceStore = useWorkspaceStore();
    const cloudPath = resolveCloudDocPathForFile(
      tab.filePath,
      workspaceStore.currentWorkspaceName,
      workspaceStore.currentWorkspacePath,
    );
    rememberDoc(cloudPath, {
      fileId: tab.cloudFileId,
      version: tab.cloudVersion,
      contentHash: tab.cloudContentHash ?? null,
      updatedAt: null,
    });
  }

  function rememberDoc(path: string, meta: CloudDocSyncMeta): void {
    if (!path) {
      return;
    }
    docMap.value = { ...docMap.value, [path]: meta };
    persistState();
  }

  function forgetDoc(path: string): void {
    if (!path || !(path in docMap.value)) {
      return;
    }
    const next = { ...docMap.value };
    delete next[path];
    docMap.value = next;
    persistState();
  }

  return {
    // state
    baseUrl,
    signedIn,
    username,
    userId,
    space,
    status,
    lastError,
    lastSyncAt,
    docMap,
    // getters
    usedRatio,
    quotaLabel,
    isBusy,
    // actions
    initialize,
    login,
    logout,
    refreshSpace,
    syncCurrentDocument,
    rememberDoc,
    forgetDoc,
  };
});
