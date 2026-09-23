// Файли в браузері: ExcelJS окремим чанком і збереження Blob як файлу.
type ExcelModule = typeof import('exceljs');
type XlsxModule = typeof import('@e965/xlsx');

let excel: Promise<ExcelModule> | null = null;
let xlsx: Promise<XlsxModule> | null = null;

/** ExcelJS (~1 МБ) — окремим чанком, лише коли потрібен. */
export function loadExcelJs(): Promise<ExcelModule> {
  excel ??= import('exceljs').then((m) => (m as unknown as { default?: ExcelModule }).default ?? m);
  return excel;
}

/**
 * SheetJS — лише для старого бінарного .xls (BIFF), який ExcelJS не читає.
 * Важкий (~8 МБ), тож окремим чанком і тільки коли такий файл справді трапився.
 */
export function loadXlsxReader(): Promise<XlsxModule> {
  xlsx ??= import('@e965/xlsx').then((m) => (m as unknown as { default?: XlsxModule }).default ?? m);
  return xlsx;
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
