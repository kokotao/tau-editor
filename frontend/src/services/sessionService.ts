import type { AppMode } from '@/stores/workspace';
import type { Tab } from '@/stores/tabs';
import {
  isTauriApp,
  recoveryCommands,
  type RecoveryDeleteResponse,
  type RecoveryDraftRecord,
  type RecoveryLimits,
  type RecoveryRecordsResponse,
  type RecoverySessionDocument,
  type RecoveryWriteResponse,
} from '@/lib/tauri';

/** 旧版会话与草稿键，仅用于一次性迁移到恢复库 v2 */
const LEGACY_SESSION_STORAGE_KEY = 'text-editor-session-v1';
const LEGACY_DRAFTS_STORAGE_KEY = 'text-editor-recovery-drafts-v1';
/** Web 构建下没有 app-data，使用同构的 localStorage 后端 */
const BROWSER_RECOVERY_STORAGE_KEY = 'text-editor-recovery-v2';

export const RECOVERY_DOCUMENT_VERSION = 2;

export const DEFAULT_RECOVERY_LIMITS: RecoveryLimits = {
  maxDrafts: 40,
  maxTotalBytes: 32 * 1024 * 1024,
  maxAgeDays: 30,
};

const DEFAULT_MAX_AGE_MS = DEFAULT_RECOVERY_LIMITS.maxAgeDays * 24 * 60 * 60 * 1000;

export interface SessionSnapshot {
  version: number;
  savedAt: number;
  mode: AppMode;
  workspacePath: string | null;
  workspaceName: string | null;
  activeTabId: string | null;
  tabs: Tab[];
}

export interface RecoveryDraft extends Tab {
  recoveredAt: number;
}

interface RecoveryBackend {
  list(): Promise<RecoveryRecordsResponse>;
  write(
    session: RecoverySessionDocument | null,
    drafts: RecoveryDraftRecord[] | null,
  ): Promise<RecoveryWriteResponse>;
  remove(options: {
    id?: string;
    path?: string;
    all?: boolean;
    session?: boolean;
  }): Promise<RecoveryDeleteResponse>;
}

function createTauriBackend(): RecoveryBackend {
  return {
    list: () => recoveryCommands.list(),
    write: (session, drafts) => recoveryCommands.write(session, drafts),
    remove: (options) => recoveryCommands.remove(options),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStorage(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn('[Session] 读取本地存储失败:', error);
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value === null) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn('[Session] 写入本地存储失败:', error);
  }
}

function pruneDraftRecords(
  records: RecoveryDraftRecord[],
  limits: RecoveryLimits = DEFAULT_RECOVERY_LIMITS,
): RecoveryDraftRecord[] {
  const now = Date.now();
  const maxAgeMs = limits.maxAgeDays > 0
    ? limits.maxAgeDays * 24 * 60 * 60 * 1000
    : DEFAULT_MAX_AGE_MS;
  const sorted = [...records].sort((left, right) => right.updatedAt - left.updatedAt);
  const retained: RecoveryDraftRecord[] = [];
  let totalBytes = 0;

  for (const record of sorted) {
    if (record.updatedAt + maxAgeMs < now) {
      continue;
    }
    if (retained.length >= limits.maxDrafts) {
      continue;
    }
    const recordBytes = record.content.length;
    if (totalBytes + recordBytes > limits.maxTotalBytes) {
      continue;
    }
    totalBytes += recordBytes;
    retained.push(record);
  }

  return retained;
}

/**
 * Web 构建的恢复后端：与 Rust app-data 恢复库保持一致的 JSON 结构和限额。
 */
class BrowserRecoveryBackend implements RecoveryBackend {
  async list(): Promise<RecoveryRecordsResponse> {
    const records = this.read();
    return {
      session: records.session,
      drafts: pruneDraftRecords(records.drafts),
      limits: DEFAULT_RECOVERY_LIMITS,
    };
  }

  async write(
    session: RecoverySessionDocument | null,
    drafts: RecoveryDraftRecord[] | null,
  ): Promise<RecoveryWriteResponse> {
    const current = this.read();
    const nextSession = session ?? current.session;
    const nextDrafts = drafts === null ? current.drafts : pruneDraftRecords(drafts);
    this.persist(nextSession, nextDrafts);

    const retainedIds = new Set(nextDrafts.map((draft) => draft.id));
    const deletedDrafts = drafts === null
      ? 0
      : current.drafts.filter((draft) => !retainedIds.has(draft.id)).length;

    return { writtenDrafts: drafts?.length ?? 0, deletedDrafts };
  }

  async remove(options: {
    id?: string;
    path?: string;
    all?: boolean;
    session?: boolean;
  }): Promise<RecoveryDeleteResponse> {
    const current = this.read();
    const nextSession = options.session ? null : current.session;
    let nextDrafts = options.all ? [] : current.drafts;
    let deleted = options.session && current.session ? 1 : 0;

    if (!options.all && (options.path || options.id)) {
      const key = options.path || options.id;
      const before = nextDrafts.length;
      nextDrafts = nextDrafts.filter((draft) => {
        const draftKey = draft.path && draft.path.length > 0 ? draft.path : draft.id;
        return draftKey !== key;
      });
      deleted += before - nextDrafts.length;
    }

    this.persist(nextSession, nextDrafts);
    return { deleted };
  }

  private read(): {
    session: RecoverySessionDocument | null;
    drafts: RecoveryDraftRecord[];
  } {
    const raw = readStorage(BROWSER_RECOVERY_STORAGE_KEY);
    if (!raw) return { session: null, drafts: [] };

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!isRecord(parsed)) return { session: null, drafts: [] };
      const session = isRecord(parsed.session)
        ? (parsed.session as unknown as RecoverySessionDocument)
        : null;
      const drafts = Array.isArray(parsed.drafts)
        ? parsed.drafts.filter(isRecoveryDraftRecord)
        : [];
      return { session, drafts };
    } catch (error) {
      console.warn('[Session] 恢复库损坏，已忽略:', error);
      return { session: null, drafts: [] };
    }
  }

  private persist(
    session: RecoverySessionDocument | null,
    drafts: RecoveryDraftRecord[],
  ): void {
    if (!session && drafts.length === 0) {
      writeStorage(BROWSER_RECOVERY_STORAGE_KEY, null);
      return;
    }
    writeStorage(
      BROWSER_RECOVERY_STORAGE_KEY,
      JSON.stringify({ version: RECOVERY_DOCUMENT_VERSION, session, drafts }),
    );
  }
}

function isRecoveryDraftRecord(value: unknown): value is RecoveryDraftRecord {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.content === 'string'
    && typeof value.updatedAt === 'number';
}

function isTabLike(value: unknown): value is Record<string, unknown> & Tab {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.fileName === 'string'
    && typeof value.content === 'string';
}

function snapshotToSessionDocument(snapshot: SessionSnapshot): RecoverySessionDocument {
  const tabs = Array.isArray(snapshot.tabs) ? snapshot.tabs : [];
  const activeTab = tabs.find((tab) => tab.id === snapshot.activeTabId) ?? null;

  return {
    version: RECOVERY_DOCUMENT_VERSION,
    savedAt: snapshot.savedAt,
    workspacePath: snapshot.workspacePath,
    activeTabPath: activeTab?.filePath ?? null,
    openTabs: tabs.map((tab) => ({
      path: tab.filePath,
      viewState: null,
      pinned: false,
    })),
    layout: {
      mode: snapshot.mode,
      workspaceName: snapshot.workspaceName,
      activeTabId: snapshot.activeTabId,
    },
    recentWorkspaces: snapshot.workspacePath ? [snapshot.workspacePath] : [],
    tabs: tabs as unknown[],
  };
}

function sessionDocumentToSnapshot(document: RecoverySessionDocument): SessionSnapshot | null {
  const layout = isRecord(document.layout) ? document.layout : {};
  const tabs = Array.isArray(document.tabs)
    ? (document.tabs.filter(isTabLike) as Tab[]).map(normalizeRestoredTab)
    : [];
  if (tabs.length === 0 && !document.workspacePath) {
    return null;
  }

  const activeTabId = typeof layout.activeTabId === 'string'
    ? layout.activeTabId
    : tabs.find((tab) => tab.filePath && tab.filePath === document.activeTabPath)?.id
      ?? tabs[0]?.id
      ?? null;
  const mode: AppMode = layout.mode === 'workspace' || document.workspacePath
    ? 'workspace'
    : tabs.length > 0
      ? 'single-file'
      : 'empty';

  return {
    version: RECOVERY_DOCUMENT_VERSION,
    savedAt: document.savedAt,
    mode,
    workspacePath: document.workspacePath,
    workspaceName: typeof layout.workspaceName === 'string' ? layout.workspaceName : null,
    activeTabId,
    tabs,
  };
}

function tabToDraftRecord(tab: Tab, recoveredAt: number): RecoveryDraftRecord {
  const { content, ...metadata } = tab;
  return {
    version: RECOVERY_DOCUMENT_VERSION,
    id: tab.id,
    path: tab.filePath,
    baseFingerprint: {
      mtimeMs: tab.lastKnownModified ?? null,
      size: null,
    },
    content,
    updatedAt: recoveredAt,
    cursor: null,
    scrollTop: null,
    tab: metadata,
  };
}

function draftRecordToTab(record: RecoveryDraftRecord): RecoveryDraft | null {
  if (typeof record.content !== 'string') return null;

  const restored = buildDraftTab(record);
  return restored ? normalizeRestoredTab(restored) : null;
}

/** 从恢复草稿记录重建标签；大文件加载状态由 normalizeRestoredTab 统一降级。 */
function buildDraftTab(record: RecoveryDraftRecord): RecoveryDraft | null {
  const metadata = isRecord(record.tab) ? record.tab : {};
  const id = typeof metadata.id === 'string' ? metadata.id : record.id;
  if (!id) return null;

  const filePath = typeof metadata.filePath === 'string'
    ? metadata.filePath
    : record.path;
  const fileName = typeof metadata.fileName === 'string' && metadata.fileName.length > 0
    ? metadata.fileName
    : filePath?.split(/[\\/]/).filter(Boolean).pop() ?? '未命名';

  return {
    id,
    filePath,
    fileName,
    language: typeof metadata.language === 'string' ? metadata.language : 'plaintext',
    isDirty: true,
    isUntitled: typeof metadata.isUntitled === 'boolean' ? metadata.isUntitled : !filePath,
    content: record.content,
    createdAt: typeof metadata.createdAt === 'number' ? metadata.createdAt : record.updatedAt,
    isLargeFile: metadata.isLargeFile === true,
    largeFileSize: typeof metadata.largeFileSize === 'number' ? metadata.largeFileSize : undefined,
    largeFileChunkSize: typeof metadata.largeFileChunkSize === 'number'
      ? metadata.largeFileChunkSize
      : undefined,
    largeFileLoadedBytes: typeof metadata.largeFileLoadedBytes === 'number'
      ? metadata.largeFileLoadedBytes
      : undefined,
    largeFileLoadProgress: typeof metadata.largeFileLoadProgress === 'number'
      ? metadata.largeFileLoadProgress
      : undefined,
    isLoadingContent: metadata.isLoadingContent === true,
    largeFileLoadState: readLargeFileLoadState(metadata.largeFileLoadState),
    fileRevision: typeof metadata.fileRevision === 'string' ? metadata.fileRevision : null,
    lastKnownModified: typeof metadata.lastKnownModified === 'number'
      ? metadata.lastKnownModified
      : record.baseFingerprint?.mtimeMs ?? null,
    externalModifiedAt: null,
    recoveredAt: record.updatedAt,
  };
}

function readLargeFileLoadState(value: unknown): Tab['largeFileLoadState'] {
  return value === 'initial' || value === 'loading' || value === 'complete'
    || value === 'failed' || value === 'cancelled'
    ? value
    : undefined;
}

/**
 * 恢复大文件标签时不允许停留在 loading：分段加载会话只存在于当前进程。
 * 重启后将未完成的加载降级为 cancelled / failed，保留已加载部分并允许标签「重试」续传，
 * 同时清空旧的加载会话 id，避免与新加载会话串写。
 */
export function normalizeRestoredTab<T extends Tab>(tab: T): T {
  if (tab.isLargeFile !== true) {
    return tab.isLoadingContent ? { ...tab, isLoadingContent: false } : tab;
  }

  const loadedBytes = tab.largeFileLoadedBytes;
  const totalBytes = tab.largeFileSize;
  const isPartial = typeof loadedBytes === 'number'
    && typeof totalBytes === 'number'
    && totalBytes > 0
    && loadedBytes < totalBytes;
  const state = tab.largeFileLoadState;
  const isComplete = state === 'complete'
    || (state === undefined && tab.isLoadingContent !== true && !isPartial);

  if (isComplete) {
    return {
      ...tab,
      isLoadingContent: false,
      largeFileLoadState: 'complete',
      largeFileLoadSessionId: undefined,
    };
  }

  return {
    ...tab,
    isLoadingContent: true,
    largeFileLoadState: state === 'failed' ? 'failed' : 'cancelled',
    largeFileLoadSessionId: undefined,
  };
}

export class SessionService {
  private backend: RecoveryBackend | null = null;
  private session: SessionSnapshot | null = null;
  private drafts: RecoveryDraft[] = [];
  private limits: RecoveryLimits = DEFAULT_RECOVERY_LIMITS;
  private initialized = false;
  private queue: Promise<void> = Promise.resolve();

  getLimits(): RecoveryLimits {
    return this.limits;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 读取 app-data 恢复库并完成 v1 -> v2 迁移。启动路径不允许抛错。
   */
  async initialize(): Promise<void> {
    const backend = this.ensureBackend();

    try {
      await this.migrateLegacyStorage(backend);
      const records = await backend.list();
      this.limits = records.limits ?? DEFAULT_RECOVERY_LIMITS;
      this.session = records.session ? sessionDocumentToSnapshot(records.session) : null;
      this.drafts = records.drafts
        .map(draftRecordToTab)
        .filter((draft): draft is RecoveryDraft => draft !== null);
    } catch (error) {
      console.warn('[Session] 初始化恢复库失败，已降级为空会话:', error);
      this.session = null;
      this.drafts = [];
    } finally {
      this.initialized = true;
    }
  }

  load(): SessionSnapshot | null {
    return this.session;
  }

  loadRecoveryDrafts(): RecoveryDraft[] {
    return this.drafts;
  }

  async save(snapshot: Omit<SessionSnapshot, 'version' | 'savedAt'>): Promise<void> {
    const savedAt = Date.now();
    const record: SessionSnapshot = {
      ...snapshot,
      version: RECOVERY_DOCUMENT_VERSION,
      savedAt,
    };
    this.session = record;

    await this.enqueue(async () => {
      try {
        await this.ensureBackend().write(snapshotToSessionDocument(record), null);
      } catch (error) {
        console.warn('[Session] 保存会话快照失败:', error);
      }
    });
  }

  async saveRecoveryDrafts(tabs: Tab[]): Promise<void> {
    const recoveredAt = Date.now();
    const records = tabs
      .filter((tab) => tab.isDirty && !tab.isLoadingContent)
      .map((tab) => tabToDraftRecord(tab, recoveredAt))
      .filter((record) => {
        if (record.content.length <= this.limits.maxTotalBytes) return true;
        console.warn('[Session] 忽略超过恢复库单条上限的草稿:', record.id);
        return false;
      });

    const limited = pruneDraftRecords(records, this.limits);
    this.drafts = limited
      .map(draftRecordToTab)
      .filter((draft): draft is RecoveryDraft => draft !== null);

    await this.enqueue(async () => {
      try {
        await this.ensureBackend().write(null, limited);
      } catch (error) {
        console.warn('[Session] 保存恢复草稿失败:', error);
      }
    });
  }

  async discardRecoveryDraft(tabId: string): Promise<void> {
    const draft = this.drafts.find((item) => item.id === tabId);
    this.drafts = this.drafts.filter((item) => item.id !== tabId);

    await this.enqueue(async () => {
      try {
        await this.ensureBackend().remove({
          id: tabId,
          path: draft?.filePath ?? undefined,
        });
      } catch (error) {
        console.warn('[Session] 丢弃恢复草稿失败:', error);
      }
    });
  }

  async clearRecoveryDrafts(): Promise<void> {
    this.drafts = [];

    await this.enqueue(async () => {
      try {
        await this.ensureBackend().remove({ all: true });
      } catch (error) {
        console.warn('[Session] 清空恢复草稿失败:', error);
      }
    });
  }

  async clear(): Promise<void> {
    this.session = null;
    this.drafts = [];

    await this.enqueue(async () => {
      try {
        await this.ensureBackend().remove({ all: true, session: true });
      } catch (error) {
        console.warn('[Session] 清理恢复库失败:', error);
      }
    });
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private ensureBackend(): RecoveryBackend {
    if (!this.backend) {
      this.backend = isTauriApp() ? createTauriBackend() : new BrowserRecoveryBackend();
    }
    return this.backend;
  }

  private async migrateLegacyStorage(backend: RecoveryBackend): Promise<void> {
    const legacySession = readStorage(LEGACY_SESSION_STORAGE_KEY);
    const legacyDrafts = readStorage(LEGACY_DRAFTS_STORAGE_KEY);
    if (!legacySession && !legacyDrafts) return;

    let migratedSession: RecoverySessionDocument | null = null;
    let migratedDrafts: RecoveryDraftRecord[] = [];

    try {
      if (legacySession) {
        const parsed = JSON.parse(legacySession) as unknown;
        if (isRecord(parsed)) {
          migratedSession = snapshotToSessionDocument({
            version: RECOVERY_DOCUMENT_VERSION,
            savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
            mode: parsed.mode === 'workspace' || parsed.mode === 'single-file'
              ? parsed.mode
              : 'empty',
            workspacePath: typeof parsed.workspacePath === 'string' ? parsed.workspacePath : null,
            workspaceName: typeof parsed.workspaceName === 'string' ? parsed.workspaceName : null,
            activeTabId: typeof parsed.activeTabId === 'string' ? parsed.activeTabId : null,
            tabs: Array.isArray(parsed.tabs) ? (parsed.tabs.filter(isTabLike) as Tab[]) : [],
          });
        }
      }

      if (legacyDrafts) {
        const parsed = JSON.parse(legacyDrafts) as unknown;
        if (Array.isArray(parsed)) {
          migratedDrafts = parsed
            .filter(isTabLike)
            .map((tab) => {
              const recoveredAt = typeof tab.recoveredAt === 'number'
                ? tab.recoveredAt
                : Date.now();
              return tabToDraftRecord(tab as Tab, recoveredAt);
            });
        }
      }
    } catch (error) {
      console.warn('[Session] 旧版会话数据损坏，跳过迁移:', error);
      writeStorage(LEGACY_SESSION_STORAGE_KEY, null);
      writeStorage(LEGACY_DRAFTS_STORAGE_KEY, null);
      return;
    }

    try {
      await backend.write(migratedSession, pruneDraftRecords(migratedDrafts, this.limits));
      writeStorage(LEGACY_SESSION_STORAGE_KEY, null);
      writeStorage(LEGACY_DRAFTS_STORAGE_KEY, null);
    } catch (error) {
      console.warn('[Session] 旧版会话迁移失败，保留原数据以便下次重试:', error);
    }
  }
}

export const sessionService = new SessionService();
