// Наш шаблон прайсу для постачальників, які надсилають файл вручну: xlsx з аркушами «Прайс» і «Інструкція».
import { loadExcelJs, saveBlob, XLSX_MIME } from '@/lib/files';

interface TemplateColumn {
  header: string;
  width: number;
  /** Пояснення на аркуші «Інструкція». */
  note: string;
  required?: boolean;
}

export const TEMPLATE_COLUMNS: readonly TemplateColumn[] = [
  { header: 'Код постачальника', width: 18, required: true, note: 'Код товару у вашій системі (1С). Унікальний, не змінюється між прайсами — за ним ми звіряємо каталог.' },
  { header: 'Артикул', width: 20, note: 'Артикул виробника, якщо є.' },
  { header: 'Назва', width: 52, required: true, note: 'Повна назва номенклатури.' },
  { header: 'Бренд', width: 16, note: 'Торгова марка або виробник.' },
  { header: 'Одиниця', width: 10, note: 'шт, м, м2, кг, л, компл, уп. Якщо порожньо — вважаємо «шт».' },
  { header: 'Ціна закупівлі з ПДВ', width: 22, required: true, note: 'Ваша відпускна ціна з ПДВ, у валюті прайсу. Якщо даєте ціни без ПДВ — перейменуйте заголовок на «Ціна закупівлі без ПДВ», ми врахуємо це при завантаженні.' },
  { header: 'Валюта', width: 10, note: 'UAH, USD або EUR. Якщо колонки немає — валюта береться з картки постачальника.' },
  { header: 'РРЦ з ПДВ', width: 14, note: 'Рекомендована роздрібна ціна з ПДВ. Порожньо — якщо РРЦ не встановлюєте.' },
  { header: 'Наявність', width: 14, note: 'Кількість («12», «100+») або словом: «є», «мало», «немає», «під замовлення».' },
  { header: 'Кратність', width: 12, note: 'Мінімальний крок замовлення в одиницях (напр., 6 — продається упаковками по 6).' },
  { header: 'Мін. замовлення', width: 16, note: 'Мінімальна кількість в одному замовленні.' },
  { header: 'Термін поставки, дн.', width: 20, note: 'Довідково, у каталог не потрапляє.' },
];

const EXAMPLE_ROWS: (string | number)[][] = [
  ['ТА-100234', 'VT.214.N.05', 'Кран кульовий 1/2" в-в, ручка-метелик', 'VALTEC', 'шт', 219, 'UAH', 329, '100+', 1, 1, 2],
  ['ТА-100987', '', 'Труба ППР PN20 D20, 4 м', 'Blue Ocean', 'м', 29.88, 'UAH', 45, '30+', 4, 20, 3],
];

const INSTRUCTIONS_INTRO: [string, string][] = [
  ['Як заповнювати прайс', ''],
  ['', ''],
  ['Аркуш «Прайс»', 'Перший рядок — заголовки, не змінюйте їх і не додавайте рядків над ними. Дані — з другого рядка, по одному товару в рядку.'],
  ['Обов’язкові колонки', 'Код постачальника, Назва, Ціна закупівлі з ПДВ. Рядки без коду або без ціни ми пропускаємо.'],
  ['Числа', 'Крапка або кома — обидва варіанти читаються («182.5» і «182,5»). Без пробілів-роздільників тисяч і без позначки валюти в клітинці.'],
  ['Наявність', 'Читаємо число («12», «100+» — це 100 і більше) або слово: «є», «мало», «немає», «під замовлення». Порожня клітинка — наявність невідома.'],
  ['Зайві колонки', 'Можна лишати свої додаткові колонки — ми зіставляємо їх за назвою заголовка й непотрібні пропускаємо.'],
  ['Формат файлу', 'xlsx або csv. Старий .xls не читається — збережіть як .xlsx.'],
  ['', ''],
  ['Колонки', ''],
];

/** «Шаблон Excel» — xlsx для постачальника, який надсилає прайс файлом. */
export async function downloadPriceTemplate(fileName = 'Шаблон прайсу PriceOptima.xlsx'): Promise<void> {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();

  const ws = wb.addWorksheet('Прайс');
  ws.columns = TEMPLATE_COLUMNS.map((c) => ({ header: c.required ? `${c.header}*` : c.header, width: c.width }));
  ws.addRows(EXAMPLE_ROWS);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle', wrapText: true };
  ws.getRow(1).height = 30;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: TEMPLATE_COLUMNS.length } };

  const info = wb.addWorksheet('Інструкція');
  info.columns = [{ width: 28 }, { width: 96 }];
  for (const [title, body] of INSTRUCTIONS_INTRO) info.addRow([title, body]);
  for (const c of TEMPLATE_COLUMNS) info.addRow([c.required ? `${c.header}*` : c.header, c.note]);
  info.getRow(1).font = { bold: true, size: 14 };
  info.getRow(INSTRUCTIONS_INTRO.length).font = { bold: true, size: 12 };
  info.eachRow((row) => {
    row.getCell(1).font = { bold: true, ...row.getCell(1).font };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  });

  const data = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([data], { type: XLSX_MIME }), fileName);
}
