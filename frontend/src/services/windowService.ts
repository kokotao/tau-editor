import { getCurrentWindow } from '@tauri-apps/api/window';
import type { useSettingsStore } from '@/stores/settings';
import type { useTabsStore } from '@/stores/tabs';
import { isTauriApp } from '@/lib/tauri';

type SettingsStore = ReturnType<typeof useSettingsStore>;
type TabsStore = ReturnType<typeof useTabsStore>;

const CLOSE_CONFIRM_MESSAGE = '你有未保存的更改，确认现在退出吗？';

export class WindowService {
  private detachBeforeUnload: (() => void) | null = null;
  private detachTauriClose: (() => void) | null = null;
  private forceClosing = false;

  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly tabsStore: TabsStore,
  ) {}

  async attach() {
    this.detach();
    this.attachBeforeUnload();
    await this.attachTauriCloseHandler();
  }

  detach() {
    this.detachBeforeUnload?.();
    this.detachBeforeUnload = null;
    this.detachTauriClose?.();
    this.detachTauriClose = null;
  }

  private shouldBlockClose() {
    return this.settingsStore.confirmBeforeClose && this.tabsStore.hasDirtyTabs;
  }

  private attachBeforeUnload() {
    const handler = (event: BeforeUnloadEvent) => {
      if (!this.shouldBlockClose()) return;
      event.preventDefault();
      event.returnValue = CLOSE_CONFIRM_MESSAGE;
    };

    window.addEventListener('beforeunload', handler);
    this.detachBeforeUnload = () => {
      window.removeEventListener('beforeunload', handler);
    };
  }

  private async attachTauriCloseHandler() {
    if (!isTauriApp()) {
      return;
    }

    const currentWindow = getCurrentWindow();
    this.detachTauriClose = await currentWindow.onCloseRequested(async (event) => {
      if (this.forceClosing || !this.shouldBlockClose()) {
        return;
      }

      event.preventDefault();

      const confirmed = window.confirm(CLOSE_CONFIRM_MESSAGE);
      if (!confirmed) {
        return;
      }

      this.forceClosing = true;
      try {
        await currentWindow.close();
      } finally {
        this.forceClosing = false;
      }
    });
  }
}

export function createWindowService(
  settingsStore: SettingsStore,
  tabsStore: TabsStore,
) {
  return new WindowService(settingsStore, tabsStore);
}
