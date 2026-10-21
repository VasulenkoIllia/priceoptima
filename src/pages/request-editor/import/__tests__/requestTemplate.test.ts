import { describe, expect, it } from 'vitest';
import { readSpreadsheetFile } from '@/lib/spreadsheet';
import { detectRequestColumns, isRequestTemplate, REQUEST_TEMPLATE_HEADERS } from '../requestRows';
import { buildRequestTemplate } from '../requestTemplate';

describe('шаблон заявки Excel (правки замовника 21.10)', () => {
  it('аркуш «Заявка» лише із заголовками, без прикладів; при імпорті береться «Заявка»', async () => {
    const wb = await buildRequestTemplate();
    const buf = await wb.xlsx.writeBuffer();
    const sheets = await readSpreadsheetFile(new File([buf], 'Шаблон заявки PriceOptima.xlsx'));

    expect(sheets.map((s) => s.name)).toEqual(['Заявка', 'Інструкція']);
    const [request] = sheets;
    expect(request.rows).toEqual([[...REQUEST_TEMPLATE_HEADERS]]);
    expect(isRequestTemplate(request.rows)).toBe(true);
    // як у RequestImportDialog: перший аркуш, де знайшлися колонки заявки
    expect(sheets.findIndex((s) => detectRequestColumns(s.rows).headerRow != null)).toBe(0);
  });
});
