import { defineStore } from 'pinia';
import { uriToPath } from '@/services/lsp/pathUri';

/** 诊断级别与 Monaco/LSP 的严重程度保持一致：1 错误，2 警告，3 信息，4 提示。 */
export type DiagnosticSeverity = 1 | 2 | 3 | 4;

export interface DiagnosticRecord {
  id: string;
  uri: string;
  path: string;
  message: string;
  severity: DiagnosticSeverity;
  source?: string;
  code?: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  relatedInformation?: Array<{ message: string; uri?: string }>;
}

export interface DiagnosticInput {
  message: string;
  severity?: number;
  source?: string;
  code?: string | number;
  startLineNumber: number;
  startColumn: number;
  endLineNumber?: number;
  endColumn?: number;
  relatedInformation?: Array<{ message: string; uri?: string }>;
}

export interface DiagnosticFileRecord {
  uri: string;
  path: string;
  diagnostics: DiagnosticRecord[];
}

function normalizeSeverity(value: number | undefined): DiagnosticSeverity {
  if (value === 1 || value === 2 || value === 3 || value === 4) return value;
  return 3;
}

function displayPath(uri: string): string {
  return uriToPath(uri) ?? uri;
}

function diagnosticId(uri: string, input: DiagnosticInput, index: number): string {
  return [
    uri,
    input.startLineNumber,
    input.startColumn,
    input.endLineNumber ?? input.startLineNumber,
    input.endColumn ?? input.startColumn,
    input.severity ?? 3,
    input.message,
    index,
  ].join(':');
}

export const useDiagnosticsStore = defineStore('diagnostics', {
  state: () => ({
    files: {} as Record<string, DiagnosticFileRecord>,
    activeFilter: 'all' as 'all' | 'error' | 'warning',
  }),

  getters: {
    fileRecords: (state): DiagnosticFileRecord[] => Object.values(state.files)
      .filter((record) => record.diagnostics.length > 0)
      .sort((a, b) => a.path.localeCompare(b.path)),

    all: (state): DiagnosticRecord[] => Object.values(state.files)
      .flatMap((record) => record.diagnostics)
      .sort((a, b) => a.severity - b.severity || a.path.localeCompare(b.path) || a.startLineNumber - b.startLineNumber || a.startColumn - b.startColumn),

    filtered(state): DiagnosticRecord[] {
      const records = Object.values(state.files).flatMap((record) => record.diagnostics);
      return records
        .filter((record) => state.activeFilter === 'all'
          || (state.activeFilter === 'error' && record.severity === 1)
          || (state.activeFilter === 'warning' && record.severity === 2))
        .sort((a, b) => a.severity - b.severity || a.path.localeCompare(b.path) || a.startLineNumber - b.startLineNumber || a.startColumn - b.startColumn);
    },

    count: (state) => Object.values(state.files).reduce((total, record) => total + record.diagnostics.length, 0),
    errorCount: (state) => Object.values(state.files).reduce(
      (total, record) => total + record.diagnostics.filter((item) => item.severity === 1).length,
      0,
    ),
    warningCount: (state) => Object.values(state.files).reduce(
      (total, record) => total + record.diagnostics.filter((item) => item.severity === 2).length,
      0,
    ),
    infoCount: (state) => Object.values(state.files).reduce(
      (total, record) => total + record.diagnostics.filter((item) => item.severity === 3).length,
      0,
    ),
    hintCount: (state) => Object.values(state.files).reduce(
      (total, record) => total + record.diagnostics.filter((item) => item.severity === 4).length,
      0,
    ),
  },

  actions: {
    setFilter(filter: 'all' | 'error' | 'warning') {
      this.activeFilter = filter;
    },

    /** 用一次 publishDiagnostics 的完整快照替换对应文件，空数组表示清除该文件诊断。 */
    setDiagnostics(uri: string, diagnostics: DiagnosticInput[]) {
      if (!uri) return;
      if (diagnostics.length === 0) {
        delete this.files[uri];
        return;
      }

      const path = displayPath(uri);
      this.files[uri] = {
        uri,
        path,
        diagnostics: diagnostics.map((input, index) => ({
          id: diagnosticId(uri, input, index),
          uri,
          path,
          message: input.message,
          severity: normalizeSeverity(input.severity),
          source: input.source,
          code: input.code === undefined ? undefined : String(input.code),
          startLineNumber: Math.max(1, input.startLineNumber),
          startColumn: Math.max(1, input.startColumn),
          endLineNumber: Math.max(1, input.endLineNumber ?? input.startLineNumber),
          endColumn: Math.max(1, input.endColumn ?? input.startColumn),
          relatedInformation: input.relatedInformation,
        })),
      };
    },

    clearUri(uri: string) {
      delete this.files[uri];
    },

    clearAll() {
      this.files = {};
    },
  },
});
