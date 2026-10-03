import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDiagnosticsStore } from '@/stores/diagnostics';

describe('DiagnosticsStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('replaces a URI snapshot and exposes severity counts', () => {
    const store = useDiagnosticsStore();
    store.setDiagnostics('file:///workspace/src/main.ts', [
      { message: 'bad type', severity: 1, startLineNumber: 3, startColumn: 2 },
      { message: 'unused value', severity: 2, startLineNumber: 9, startColumn: 1 },
    ]);

    expect(store.count).toBe(2);
    expect(store.errorCount).toBe(1);
    expect(store.warningCount).toBe(1);
    expect(store.fileRecords[0]?.path).toContain('/workspace/src/main.ts');

    store.setDiagnostics('file:///workspace/src/main.ts', []);
    expect(store.count).toBe(0);
  });

  it('filters errors and warnings and clears all files', () => {
    const store = useDiagnosticsStore();
    store.setDiagnostics('file:///a.ts', [
      { message: 'error', severity: 1, startLineNumber: 1, startColumn: 1 },
      { message: 'warning', severity: 2, startLineNumber: 2, startColumn: 1 },
    ]);
    store.setFilter('error');
    expect(store.filtered.map((item) => item.message)).toEqual(['error']);
    store.setFilter('warning');
    expect(store.filtered.map((item) => item.message)).toEqual(['warning']);
    store.clearAll();
    expect(store.count).toBe(0);
  });
});
