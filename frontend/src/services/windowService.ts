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
  private closeRequestInFlight = false;
  private beforeCloseHandler: (() => Promise<void> | void) | null = null;

  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly tabsStore: TabsStore,
  ) {}

  async attach() {
    this.detach();
    if (!isTauriApp()) {
      this.attachBeforeUnload();
    }
    await this.attachTauriCloseHandler();
  }

  /**
   * 注册窗口销毁前的最后一道落盘钩子，例如异步写入 app-data 恢复库。
   */
  onBeforeClose(handler: () => Promise<void> | void) {
    this.beforeCloseHandler = handler;
  }

  detach() {
    this.detachBeforeUnload?.();
    this.detachBeforeUnload = null;
    this.detachTauriClose?.();
    this.detachTauriClose = null;
  }

  private shouldBlockClose() {
    // Once user has explicitly confirmed exit, we must bypass all close guards
    // (including beforeunload), otherwise the window can never actually close.
    return !this.forceClosing
      && this.settingsStore.confirmBeforeClose
      && this.tabsStore.hasDirtyTabs;
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

    try {
      const currentWindow = getCurrentWindow();
      this.detachTauriClose = await currentWindow.onCloseRequested(async (event) => {
        if (this.closeRequestInFlight) {
          event.preventDefault();
          return;
        }

        this.closeRequestInFlight = true;
        event.preventDefault();

        if (this.forceClosing) {
          return;
        }

        let confirmed = true;
        if (this.shouldBlockClose()) {
          // Keep the confirmation path synchronous and local to avoid
          // deadlocks with native dialog plugins while the close request is active.
          confirmed = window.confirm(CLOSE_CONFIRM_MESSAGE);
        }

        if (!confirmed) {
          this.closeRequestInFlight = false;
          return;
        }

        this.forceClosing = true;
        try {
          await this.flushBeforeClose();
          // Tauri desktop closes more reliably when we fully take over the
          // close request and destroy the window after detaching listeners.
          this.detach();
          await currentWindow.destroy();
        } catch (error) {
          this.forceClosing = false;
          this.closeRequestInFlight = false;
          throw error;
        }
      });
    } catch (error) {
      console.error('Failed to attach Tauri close handler:', error);
    }
  }

  private async flushBeforeClose() {
    if (!this.beforeCloseHandler) return;
    try {
      await this.beforeCloseHandler();
    } catch (error) {
      console.error('关闭前保存恢复库失败:', error);
    }
  }
}

export function createWindowService(
  settingsStore: SettingsStore,
  tabsStore: TabsStore,
) {
  return new WindowService(settingsStore, tabsStore);
}
