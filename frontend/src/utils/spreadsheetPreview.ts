/**
 * @description 使用按需加载的 SheetJS 解析 xlsx/xls 首个工作表，转换为可渲染的二维表格。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-14 22:12
 */

export type SpreadsheetPreviewRow = string[];

export async function parseSpreadsheetBytes(
  bytes: Uint8Array | ArrayBuffer,
): Promise<SpreadsheetPreviewRow[]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(bytes, {
    type: 'array',
    cellDates: true,
  });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) {
    return [];
  }

  return XLSX.utils.sheet_to_json<SpreadsheetPreviewRow>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  }).map((row) => row.map((cell) => String(cell ?? '')));
}
