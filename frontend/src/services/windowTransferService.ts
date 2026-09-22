/**
 * 多窗口标签迁移服务（v0.4.0）
 *
 * 前端侧负责：
 * 1. 组装迁移 payload 并做与 Rust 侧一致的上限校验；
 * 2. 调用 Tauri 打开新窗口；
 * 3. 新窗口启动时消费一次性 payload。
 */

import { isTauriApp, windowCommands, type WindowTransferPayload, type WindowTransferTab } from '@/lib/tauri';
import type { Tab } from '@/stores/tabs';

export const WINDOW_TRANSFER_MAX_TABS = 8;
export const WINDOW_TRANSFER_MAX_BYTES = 8 * 1024 * 1024;

export type WindowTransferErrorCode =
  | 'WINDOW_TRANSFER_EMPTY'
  | 'WINDOW_TRANSFER_TOO_LARGE'
  | 'WINDOW_TRANSFER_INVALID'
  | 'WINDOW_UNSUPPORTED'
  | 'WINDOW_TRANSFER_FAILED';

export interface WindowTransferError {
  code: WindowTransferErrorCode;
  message: string;
}

export type WindowTransferPayloadResult =
  | { ok: true; payload: WindowTransferPayload }
  | { ok: false; error: WindowTransferError };

export type WindowTransferOpenResult =
  | { ok: true; label: string }
  | { ok: false; error: WindowTransferError };

function textByteLength(content: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(content).length;
  }
  return content.length * 2;
}

export function tabToTransferTab(tab: Tab): WindowTransferTab {
  return {
    filePath: tab.filePath,
    fileName: tab.fileName,
    content: tab.content,
    isDirty: tab.isDirty,
    isUntitled: tab.isUntitled,
    language: tab.language ?? null,
  };
}

/**
 * 组装迁移负载；与 Rust 侧 `validate_window_transfer` 保持同一套上限。
 */
export function buildWindowTransferPayload(
  tabs: Tab[],
  activeTabId: string | null,
  sourceWorkspacePath: string | null,
): WindowTransferPayloadResult {
  if (tabs.length === 0) {
    return { ok: false, error: { code: 'WINDOW_TRANSFER_EMPTY', message: '没有可迁移的标签' } };
  }
  if (tabs.length > WINDOW_TRANSFER_MAX_TABS) {
    return {
      ok: false,
      error: {
        code: 'WINDOW_TRANSFER_TOO_LARGE',
        message: `一次最多迁移 ${WINDOW_TRANSFER_MAX_TABS} 个标签，请拆分迁移`,
      },
    };
  }

  const totalBytes = tabs.reduce((total, tab) => total + textByteLength(tab.content), 0);
  if (totalBytes > WINDOW_TRANSFER_MAX_BYTES) {
    return {
      ok: false,
      error: {
        code: 'WINDOW_TRANSFER_TOO_LARGE',
        message: `迁移内容超过 ${WINDOW_TRANSFER_MAX_BYTES / 1024 / 1024} MB 上限`,
      },
    };
  }

  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === activeTabId),
  );

  return {
    ok: true,
    payload: {
      tabs: tabs.map(tabToTransferTab),
      activeIndex,
      sourceWorkspacePath,
    },
  };
}

/**
 * 在新窗口打开给定标签（源窗口保留标签）。
 */
export async function openTabsInNewWindow(
  tabs: Tab[],
  activeTabId: string | null,
  sourceWorkspacePath: string | null,
): Promise<WindowTransferOpenResult> {
  if (!isTauriApp()) {
    return {
      ok: false,
      error: { code: 'WINDOW_UNSUPPORTED', message: '仅桌面端支持多窗口标签迁移' },
    };
  }

  const built = buildWindowTransferPayload(tabs, activeTabId, sourceWorkspacePath);
  if (!built.ok) {
    return built;
  }

  try {
    const label = await windowCommands.openEditorWindow(built.payload);
    return { ok: true, label };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'WINDOW_TRANSFER_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * 新窗口启动时消费一次性 payload；主窗口或非桌面端返回 null。
 */
export async function consumePendingWindowTransfer(): Promise<WindowTransferPayload | null> {
  if (!isTauriApp()) {
    return null;
  }

  try {
    return await windowCommands.consumeWindowTransfer();
  } catch (error) {
    console.warn('[WindowTransfer] 消费迁移负载失败', error);
    return null;
  }
}

/**
 * 把 payload 还原为可写入 tabs store 的标签数据。
 */
export function payloadToTabs(
  payload: WindowTransferPayload,
): Array<Omit<Tab, 'id' | 'createdAt'>> {
  return payload.tabs.map((tab) => ({
    filePath: tab.filePath,
    fileName: tab.fileName,
    language: tab.language ?? 'plaintext',
    isDirty: tab.isDirty,
    isUntitled: tab.isUntitled,
    content: tab.content,
  }));
}
