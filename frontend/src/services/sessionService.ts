import type { AppMode } from '@/stores/workspace';
import type { Tab } from '@/stores/tabs';

const SESSION_STORAGE_KEY = 'text-editor-session-v1';
const RECOVERY_DRAFTS_STORAGE_KEY = 'text-editor-recovery-drafts-v1';
const SESSION_VERSION = 1;

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

export class SessionService {
  load(): SessionSnapshot | null {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;

      const snapshot = JSON.parse(raw) as SessionSnapshot;
      if (snapshot.version !== SESSION_VERSION) {
        return null;
      }

      return snapshot;
    } catch (error) {
      console.error('[Session] 读取会话快照失败:', error);
      return null;
    }
  }

  save(snapshot: Omit<SessionSnapshot, 'version' | 'savedAt'>) {
    try {
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          ...snapshot,
          version: SESSION_VERSION,
          savedAt: Date.now(),
        }),
      );
    } catch (error) {
      console.error('[Session] 保存会话快照失败:', error);
    }
  }

  clear() {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  saveRecoveryDrafts(tabs: Tab[]) {
    const drafts: RecoveryDraft[] = tabs
      .filter((tab) => tab.isDirty && !tab.isLoadingContent)
      .map((tab) => ({ ...tab, recoveredAt: Date.now() }));
    try {
      localStorage.setItem(RECOVERY_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    } catch (error) {
      console.error('[Session] 保存恢复草稿失败:', error);
    }
  }

  loadRecoveryDrafts(): RecoveryDraft[] {
    try {
      const raw = localStorage.getItem(RECOVERY_DRAFTS_STORAGE_KEY);
      if (!raw) return [];
      const drafts = JSON.parse(raw) as unknown;
      return Array.isArray(drafts) ? drafts as RecoveryDraft[] : [];
    } catch (error) {
      console.error('[Session] 读取恢复草稿失败:', error);
      return [];
    }
  }

  discardRecoveryDraft(tabId: string) {
    const drafts = this.loadRecoveryDrafts().filter((draft) => draft.id !== tabId);
    if (drafts.length === 0) {
      localStorage.removeItem(RECOVERY_DRAFTS_STORAGE_KEY);
      return;
    }
    localStorage.setItem(RECOVERY_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  }

  clearRecoveryDrafts() {
    localStorage.removeItem(RECOVERY_DRAFTS_STORAGE_KEY);
  }
}

export const sessionService = new SessionService();
