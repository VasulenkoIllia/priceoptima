import { describe, expect, it } from 'vitest';
import {
  buildRequestRows,
  detectRequestColumns,
  headerSignature,
  isRequestTemplate,
  parseQtyCell,
  REQUEST_TEMPLATE_HEADERS,
} from '../requestRows';

describe('імпорт заявки з Excel (п.2.1 правок)', () => {
  it('довільний файл клієнта: заголовок не в першому рядку, колонки за назвами', () => {
    const rows = [
      ['ТОВ «Клієнт»', '', '', ''],
      ['Заявка на матеріали', '', '', ''],
      ['№ п/п', 'Найменування товару', 'Од. виміру', 'К-сть', 'Примітка'],
      ['1', 'Кран кульовий 1/2"', 'шт.', '4', ''],
    ];
    expect(detectRequestColumns(rows)).toEqual({ headerRow: 2, name: 1, unit: 2, qty: 3, note: 4 });
    expect(detectRequestColumns([['Кол-во', 'Наименование', 'Ед. изм.']])).toEqual({ headerRow: 0, name: 1, unit: 2, qty: 0, note: null });
    expect(detectRequestColumns([['Щось', 'Інше']]).headerRow).toBeNull();
  });

  it('наш шаблон розпізнається одразу', () => {
    expect(isRequestTemplate([[...REQUEST_TEMPLATE_HEADERS]])).toBe(true);
    expect(isRequestTemplate([['№', 'Найменування', 'Од.', 'Кількість', 'Примітка']])).toBe(true);
    expect(isRequestTemplate([['Назва', 'Кількість']])).toBe(false);
  });

  it('к-сть: число, «10 шт», кома; некоректна — рядок лишається з 0', () => {
    expect(parseQtyCell('12,5')).toEqual({ qty: 12.5, unit: null, valid: true });
    expect(parseQtyCell('10 шт')).toEqual({ qty: 10, unit: 'шт', valid: true });
    expect(parseQtyCell('')).toEqual({ qty: null, unit: null, valid: true });
    expect(parseQtyCell('багато').valid).toBe(false);
  });

  it('рядки: без назви й «Разом» пропускаються; одиниця з к-сті, якщо колонки немає; невідома лишається як у клієнта', () => {
    const data = [
      ['Назва', 'Кількість', 'Од.', 'Примітка'],
      ['Кран кульовий 1/2"', '4', 'шт.', 'латунь'],
      ['', '', '', ''],
      ['', '3', '', ''],
      ['Труба ППР 20', '118 м', '', ''],
      ['Муфта', 'кілька', 'бухта', ''],
      ['Разом', '125', '', ''],
    ];
    const res = buildRequestRows(data, detectRequestColumns(data));
    expect(res.lines).toEqual([
      { clientName: 'Кран кульовий 1/2"', clientUnit: 'шт', qty: 4, clientNote: 'латунь' },
      { clientName: 'Труба ППР 20', clientUnit: 'м', qty: 118, clientNote: null },
      { clientName: 'Муфта', clientUnit: 'бухта', qty: 0, clientNote: null },
    ]);
    expect(res.badQty).toBe(1);
    expect(res.skipped).toBe(2);
    expect(res.rows.map((r) => [r.rowNumber, r.status])).toEqual([
      [2, 'ok'],
      [4, 'no_name'],
      [5, 'ok'],
      [6, 'bad_qty'],
      [7, 'total'],
    ]);
  });

  it('підпис заголовка — щоб запам’ятати вибір колонок для таких самих файлів', () => {
    expect(headerSignature([['Назва', 'К-сть']], 0)).toBe('назва|ксть');
    expect(headerSignature([['Назва']], null)).toBeNull();
  });
});
