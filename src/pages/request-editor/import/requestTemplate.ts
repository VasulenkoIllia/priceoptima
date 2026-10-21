// Наш шаблон заявки для клієнтів (xlsx з аркушами «Заявка» й «Інструкція») — при імпорті розпізнається одразу.
import type { Workbook } from 'exceljs';
import { loadExcelJs, saveBlob, XLSX_MIME } from '@/lib/files';
import { REQUEST_TEMPLATE_HEADERS } from './requestRows';

const WIDTHS = [6, 60, 8, 12, 36];

const INSTRUCTIONS: [string, string][] = [
  ['Як заповнити заявку', ''],
  ['', ''],
  ['Аркуш «Заявка»', 'Перший рядок містить заголовки, не змінюйте їх. Дані починаються з другого рядка, по одній позиції в рядку.'],
  ['Найменування*', 'Назва товару так, як вам зручно: ми самі підберемо відповідник у постачальників.'],
  ['Од.', 'шт, м, м2, кг, л, компл, уп. Якщо порожньо, вважаємо «шт».'],
  ['Кількість*', 'Число; кома або крапка: обидва варіанти читаються.'],
  ['Примітка', 'Побажання до позиції: колір, виробник, аналог тощо.'],
];

// «Заявка» лише із заголовками, без рядків-прикладів: клієнтові не треба їх стирати щоразу (правки замовника 21.10)
export async function buildRequestTemplate(): Promise<Workbook> {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Заявка');
  ws.columns = REQUEST_TEMPLATE_HEADERS.map((header, i) => ({ header, width: WIDTHS[i] }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const info = wb.addWorksheet('Інструкція');
  info.columns = [{ width: 22 }, { width: 90 }];
  for (const row of INSTRUCTIONS) info.addRow(row);
  info.getRow(1).font = { bold: true, size: 14 };
  info.eachRow((row) => {
    row.getCell(1).font = { bold: true, ...row.getCell(1).font };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  });
  return wb;
}

export async function downloadRequestTemplate(fileName = 'Шаблон заявки PriceOptima.xlsx'): Promise<void> {
  const wb = await buildRequestTemplate();
  const data = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([data], { type: XLSX_MIME }), fileName);
}
