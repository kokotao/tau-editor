/**
 * Tau 原生 .taumap 适配器（阶段 0）
 *
 * 职责：
 * 1. .taumap 无损读写：与 mindmapService 的 parse/serialize 一致；
 * 2. 声明能力报告：lossless read/write、可逆字段；
 * 3. 导入错误分类统一交给 mindmapService 的 MindMapError。
 *
 * @author Albert_Luo
 * @date 2026-10-29
 */

import {
  MindMapError,
  isMindMapError,
  parseMindMapDocument,
  serializeMindMapDocument,
} from '@/services/mindmapService';
import { getMindMapFormatEntry } from '@/services/mindmap/formatRegistry';
import type {
  MindMapAdapter,
  MindMapExportResult,
  MindMapImportResult,
} from '@/services/mindmap/mindmapAdapter';

function taumapCapabilities() {
  const entry = getMindMapFormatEntry('taumap');
  return entry?.capabilities;
}

export const taumapAdapter: MindMapAdapter = {
  formatId: 'taumap',
  displayName: 'Tau 思维导图',
  capabilities: taumapCapabilities() ?? {
    formatId: 'taumap',
    displayName: 'Tau 思维导图',
    extensions: ['taumap'],
    read: 'lossless',
    write: 'lossless',
    knownVersions: ['1'],
    reversibleFields: ['title', 'topics', 'layoutMode', 'themeId', 'relations', 'viewport'],
    lossyFields: [],
    unsupportedFeatures: [],
    securityNotes: [],
  },

  importFromString(content: string): MindMapImportResult {
    try {
      const document = parseMindMapDocument(content);
      return { ok: true, document, lossy: [] };
    } catch (error) {
      if (isMindMapError(error)) {
        return {
          ok: false,
          document: null,
          error: {
            category: error.category,
            message: error.message,
            code: error.code,
          },
        };
      }
      return {
        ok: false,
        document: null,
        error: {
          category: 'corrupt-content',
          message: error instanceof Error ? error.message : '未知解析错误',
        },
      };
    }
  },

  exportToString(document): MindMapExportResult {
    try {
      return {
        ok: true,
        output: serializeMindMapDocument(document),
        lossy: [],
      };
    } catch (error) {
      return {
        ok: false,
        output: '',
        error: {
          category: 'invalid-structure',
          message: error instanceof MindMapError ? error.message : '序列化失败',
        },
      };
    }
  },
};