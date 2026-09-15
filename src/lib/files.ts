// Файли в браузері: ExcelJS окремим чанком і збереження Blob як файлу.
type ExcelModule = typeof import('exceljs');

let excel: Promise<ExcelModule> | null = null;

/** ExcelJS (~1 МБ) — окремим чанком, лише коли потрібен. */
export function loadExcelJs(): Promise<ExcelModule> {
  excel ??= import('exceljs').then((m) => (m as unknown as { default?: ExcelModule }).default ?? m);
  return excel;
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
