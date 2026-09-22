/**
 * windowTransferService 单元测试（v0.4.0）
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isTauriApp, windowCommands } from '@/lib/tauri';
import type { Tab } from '@/stores/tabs';
import {
  buildWindowTransferPayload,
  consumePendingWindowTransfer,
  openTabsInNewWindow,
  payloadToTabs,
  WINDOW_TRANSFER_MAX_TABS,
} from '@/services/windowTransferService';

vi.mock('@/lib/tauri', () => ({
  isTauriApp: vi.fn(() => true),
  windowCommands: {
    openEditorWindow: vi.fn(),
    consumeWindowTransfer: vi.fn(),
  },
}));

const makeTab = (id: string, overrides: Partial<Tab> = {}): Tab => ({
  id,
  filePath: `/tmp/${id}.ts`,
  fileName: `${id}.ts`,
  language: 'typescript',
  isDirty: false,
  isUntitled: false,
  content: `content-${id}`,
  createdAt: 1,
  ...overrides,
});

describe('windowTransferService', () => {
  beforeEach(() => {
    vi.mocked(isTauriApp).mockReturnValue(true);
    vi.mocked(windowCommands.openEditorWindow).mockReset();
    vi.mocked(windowCommands.consumeWindowTransfer).mockReset();
  });

  it('builds a payload with resolved active index', () => {
    const tabs = [makeTab('a'), makeTab('b'), makeTab('c')];
    const result = buildWindowTransferPayload(tabs, 'b', '/repo');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.payload.activeIndex).toBe(1);
    expect(result.payload.sourceWorkspacePath).toBe('/repo');
    expect(result.payload.tabs).toHaveLength(3);
    expect(result.payload.tabs[1]?.fileName).toBe('b.ts');
    expect(result.payload.tabs[0]?.isUntitled).toBe(false);
  });

  it('falls back to the first tab when the active id is unknown', () => {
    const result = buildWindowTransferPayload([makeTab('a')], 'missing', null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.activeIndex).toBe(0);
    }
  });

  it('rejects empty, oversized tab counts and oversized content', () => {
    const empty = buildWindowTransferPayload([], null, null);
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.error.code).toBe('WINDOW_TRANSFER_EMPTY');
    }

    const tooMany = buildWindowTransferPayload(
      Array.from({ length: WINDOW_TRANSFER_MAX_TABS + 1 }, (_, index) => makeTab(`t${index}`)),
      null,
      null,
    );
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) {
      expect(tooMany.error.code).toBe('WINDOW_TRANSFER_TOO_LARGE');
    }

    const big = buildWindowTransferPayload([makeTab('big', { content: 'x'.repeat(8 * 1024 * 1024 + 1) })], null, null);
    expect(big.ok).toBe(false);
    if (!big.ok) {
      expect(big.error.code).toBe('WINDOW_TRANSFER_TOO_LARGE');
    }
  });

  it('reports unsupported on non-desktop runtimes', async () => {
    vi.mocked(isTauriApp).mockReturnValue(false);
    const result = await openTabsInNewWindow([makeTab('a')], 'a', null);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WINDOW_UNSUPPORTED');
    }
    expect(windowCommands.openEditorWindow).not.toHaveBeenCalled();
  });

  it('opens a window and surfaces backend failures', async () => {
    vi.mocked(windowCommands.openEditorWindow).mockResolvedValue('editor-42');
    const ok = await openTabsInNewWindow([makeTab('a')], 'a', '/repo');
    expect(ok).toEqual({ ok: true, label: 'editor-42' });

    vi.mocked(windowCommands.openEditorWindow).mockRejectedValue(new Error('WINDOW_CREATE_FAILED'));
    const failed = await openTabsInNewWindow([makeTab('a')], 'a', '/repo');
    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.error.code).toBe('WINDOW_TRANSFER_FAILED');
      expect(failed.error.message).toContain('WINDOW_CREATE_FAILED');
    }
  });

  it('consumes pending payloads only on desktop', async () => {
    vi.mocked(windowCommands.consumeWindowTransfer).mockResolvedValue({
      tabs: [],
      activeIndex: 0,
      sourceWorkspacePath: null,
    });
    expect(await consumePendingWindowTransfer()).not.toBeNull();

    vi.mocked(isTauriApp).mockReturnValue(false);
    expect(await consumePendingWindowTransfer()).toBeNull();
  });

  it('maps payload tabs back into tab store input', () => {
    const tabs = payloadToTabs({
      tabs: [
        {
          filePath: null,
          fileName: 'Untitled-1',
          content: 'draft',
          isDirty: true,
          isUntitled: true,
          language: null,
        },
      ],
      activeIndex: 0,
      sourceWorkspacePath: null,
    });

    expect(tabs).toEqual([
      {
        filePath: null,
        fileName: 'Untitled-1',
        language: 'plaintext',
        isDirty: true,
        isUntitled: true,
        content: 'draft',
      },
    ]);
  });
});
