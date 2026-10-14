<template>
  <section
    class="document-preview"
    data-testid="document-preview"
    :aria-label="`${fileName || '文档'}预览`"
  >
    <iframe
      v-if="kind === 'html'"
      class="document-preview__html"
      data-testid="document-preview-html"
      :srcdoc="htmlPreviewContent"
      title="HTML 预览"
      sandbox=""
    ></iframe>

    <object
      v-else-if="kind === 'pdf' && sourceUrl"
      class="document-preview__pdf"
      data-testid="document-preview-pdf"
      :data="pdfPreviewUrl"
      type="application/pdf"
    >
      <p class="document-preview__fallback">当前浏览器无法直接渲染 PDF，请使用系统预览打开。</p>
    </object>

    <div v-else-if="kind === 'spreadsheet' && tableRows.length > 0" class="document-preview__sheet-wrap">
      <table class="document-preview__sheet" data-testid="document-preview-spreadsheet">
        <thead>
          <tr>
            <th v-for="(cell, index) in tableRows[0] || []" :key="`head-${index}`">{{ cell }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in tableRows.slice(1)" :key="`row-${rowIndex}`">
            <td v-for="(cell, cellIndex) in row" :key="`cell-${rowIndex}-${cellIndex}`">{{ cell }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="kind === 'spreadsheet' && spreadsheetLoading" class="document-preview__fallback" data-testid="document-preview-loading">
      <span>正在解析工作表…</span>
    </div>

    <div v-else class="document-preview__fallback" data-testid="document-preview-fallback">
      <strong>{{ fileName || '该文件' }}</strong>
      <span>{{ spreadsheetError || '无法读取工作表内容，仍可在左侧编辑区查看文件内容。' }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * @description 为 HTML、PDF 与轻量表格文件提供编辑器分栏预览。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-14 22:05
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { fileCommands, isTauriApp } from '@/lib/tauri';
import {
  buildHtmlPreviewDocument,
  documentPreviewExtension,
  isHtmlFilePath,
  isPdfFilePath,
  isSpreadsheetFilePath,
} from '@/utils/documentPreview';
import { parseSpreadsheetBytes, type SpreadsheetPreviewRow } from '@/utils/spreadsheetPreview';

const props = withDefaults(defineProps<{
  fileName?: string;
  filePath?: string | null;
  content: string;
  binaryContent?: Uint8Array | ArrayBuffer | null;
}>(), {
  fileName: '',
  filePath: null,
  binaryContent: null,
});

const browserSourceUrl = (filePath?: string | null) => {
  if (!filePath) return '';
  return filePath.startsWith('file://') ? filePath : `file://${encodeURI(filePath)}`;
};
const sourceUrl = ref(isTauriApp() ? '' : browserSourceUrl(props.filePath));
const pdfPreviewUrl = computed(() => {
  if (!sourceUrl.value) return '';
  const separator = sourceUrl.value.includes('#') ? '&' : '#';
  return `${sourceUrl.value}${separator}view=FitH`;
});
const htmlPreviewContent = computed(() => buildHtmlPreviewDocument(props.content, props.filePath));
const kind = computed<'html' | 'pdf' | 'spreadsheet' | 'unknown'>(() => {
  if (isHtmlFilePath(props.filePath || props.fileName)) return 'html';
  if (isPdfFilePath(props.filePath || props.fileName)) return 'pdf';
  if (isSpreadsheetFilePath(props.filePath || props.fileName)) return 'spreadsheet';
  return 'unknown';
});

const extension = computed(() => documentPreviewExtension(props.filePath || props.fileName));
const isDelimitedText = computed(() => extension.value === 'csv' || extension.value === 'tsv');
const isBinarySpreadsheet = computed(() => extension.value === 'xlsx' || extension.value === 'xls');

const parseDelimitedText = (value: string, delimiter: string): string[][] => {
  const result: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }
    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((item) => item.length > 0)) result.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((item) => item.length > 0)) result.push(row);
  }
  return result;
};

const delimitedRows = computed(() => {
  if (!isDelimitedText.value) return [];
  const delimiter = extension.value === 'tsv' ? '\t' : ',';
  return parseDelimitedText(props.content, delimiter);
});
const spreadsheetRows = ref<SpreadsheetPreviewRow[]>([]);
const spreadsheetLoading = ref(false);
const spreadsheetError = ref('');
const tableRows = computed(() => isDelimitedText.value ? delimitedRows.value : spreadsheetRows.value);
let spreadsheetRequestId = 0;
let sourceRequestId = 0;
let objectUrl = '';
let isDisposed = false;

const loadSpreadsheetPreview = async () => {
  const requestId = ++spreadsheetRequestId;
  const filePath = props.filePath;
  const binaryContent = props.binaryContent;
  const binarySpreadsheet = isBinarySpreadsheet.value;
  spreadsheetRows.value = [];
  spreadsheetError.value = '';
  if (!binarySpreadsheet) {
    spreadsheetLoading.value = false;
    return;
  }

  spreadsheetLoading.value = true;
  try {
    let bytes = binaryContent;
    if (!bytes && isTauriApp() && filePath) {
      bytes = await fileCommands.readFileBytes(filePath);
    }
    if (!bytes) {
      if (requestId === spreadsheetRequestId) {
        spreadsheetError.value = '当前环境无法读取二进制 Excel，请在桌面端打开或使用 CSV 导出。';
      }
      return;
    }
    const rows = await parseSpreadsheetBytes(bytes);
    if (requestId !== spreadsheetRequestId) return;
    spreadsheetRows.value = rows;
    if (rows.length === 0) {
      spreadsheetError.value = '工作簿中没有可预览的工作表内容。';
    }
  } catch (error) {
    if (requestId !== spreadsheetRequestId) return;
    spreadsheetError.value = `Excel 解析失败：${error instanceof Error ? error.message : '未知错误'}`;
  } finally {
    if (requestId === spreadsheetRequestId) {
      spreadsheetLoading.value = false;
    }
  }
};

const resolveSourceUrl = async () => {
  const requestId = ++sourceRequestId;
  const filePath = props.filePath;
  if (!filePath || !isPdfFilePath(filePath)) {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = '';
    }
    sourceUrl.value = '';
    return;
  }

  try {
    if (isTauriApp()) {
      const bytes = await fileCommands.readFileBytes(filePath);
      if (isDisposed || requestId !== sourceRequestId) return;
      const pdfBytes = new Uint8Array(bytes);
      const nextObjectUrl = URL.createObjectURL(new Blob([pdfBytes.buffer as ArrayBuffer], {
        type: 'application/pdf',
      }));
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = nextObjectUrl;
      sourceUrl.value = nextObjectUrl;
      return;
    }
    if (requestId === sourceRequestId) {
      sourceUrl.value = browserSourceUrl(filePath);
    }
  } catch {
    if (requestId === sourceRequestId) {
      sourceUrl.value = '';
    }
  }
};

onMounted(() => {
  void resolveSourceUrl();
  void loadSpreadsheetPreview();
});
watch(() => props.filePath, () => {
  void resolveSourceUrl();
  void loadSpreadsheetPreview();
});
watch(() => props.binaryContent, () => {
  void loadSpreadsheetPreview();
});
onUnmounted(() => {
  isDisposed = true;
  sourceRequestId += 1;
  spreadsheetRequestId += 1;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});
</script>

<style scoped>
.document-preview {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  background: var(--panel-base, #151b2b);
  color: var(--text-primary, #e5e7eb);
}

.document-preview__html,
.document-preview__pdf {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}

.document-preview__html {
  min-height: 240px;
}

.document-preview__pdf {
  flex: 1 1 0;
  width: 100%;
  height: auto;
  min-width: 0;
  min-height: 0;
  touch-action: pan-x pan-y pinch-zoom;
  overscroll-behavior: contain;
}

.document-preview__sheet-wrap {
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: 18px;
  box-sizing: border-box;
}

.document-preview__sheet {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font: 13px/1.5 var(--font-code, ui-monospace, monospace);
  background: var(--panel-overlay, rgba(255, 255, 255, 0.03));
}

.document-preview__sheet th,
.document-preview__sheet td {
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.28));
  padding: 8px 10px;
  text-align: left;
  white-space: pre-wrap;
}

.document-preview__sheet th {
  position: sticky;
  top: 0;
  background: var(--panel-base, #151b2b);
  color: var(--text-primary, #f8fafc);
}

.document-preview__fallback {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 240px;
  padding: 24px;
  box-sizing: border-box;
  color: var(--text-secondary, #94a3b8);
  text-align: center;
}

.document-preview__fallback strong {
  color: var(--text-primary, #e2e8f0);
}
</style>
