// «Довідник» (правки замовника 21.10, п.11): вставка з Excel, посилання в клітинках, рядки й колонки аркуша.
import { describe, expect, it } from 'vitest';
import {
  REFERENCE_COLUMN_MAX_WIDTH,
  REFERENCE_COLUMN_MIN_WIDTH,
  REFERENCE_MAX_CELL,
  REFERENCE_MAX_COLUMNS,
  REFERENCE_MAX_ROWS,
} from '@shared/reference/limits';
import { parseTsv } from '@shared/parse';
import {
  addColumn,
  addRow,
  applyColumnEdits,
  applyPaste,
  cellText,
  deleteRows,
  linkParts,
  newColumnFor,
  newSheet,
  newSheetTitle,
  removeColumn,
  renameColumn,
  reorderColumns,
  setCell,
  setColumnWidth,
  type SheetContent,
} from '../sheet';

const sheet = (): SheetContent => ({
  title: 'Сайти ТМ',
  columns: [
    { id: 'c1', title: 'Назва бренду' },
    { id: 'c2', title: 'Посилання' },
  ],
  rows: [
    { id: 'r1', cells: { c1: 'Бренд А' } },
    { id: 'r2', cells: { c1: 'Бренд Б', c2: 'brand-b.ua' } },
  ],
});

describe('newSheet / newSheetTitle', () => {
  it('новий аркуш: 3 колонки c1..c3 і 3 порожні рядки з різними id; назва — перший вільний номер', () => {
    const s = newSheet('Аркуш 1');
    expect(s.columns.map((c) => [c.id, c.title])).toEqual([
      ['c1', 'Колонка 1'],
      ['c2', 'Колонка 2'],
      ['c3', 'Колонка 3'],
    ]);
    expect(new Set(s.rows.map((r) => r.id)).size).toBe(3);
    expect(s.rows.every((r) => /^[a-f\d]{32}$/u.test(r.id) && !Object.keys(r.cells).length)).toBe(true);
    expect(newSheetTitle([])).toBe('Аркуш 1');
    expect(newSheetTitle(['Сайти ТМ', 'Аркуш 2'])).toBe('Аркуш 3');
  });
});

describe('applyPaste', () => {
  it('від клітинки: пише у видимі рядки по черзі, бракує рядків і колонок — додає', () => {
    const { sheet: s, clipped } = applyPaste(sheet(), { rowIds: ['r2'], colId: 'c2' }, parseTsv('b.ua\tпримітка\nc.ua\t\n'));
    expect(clipped).toBe(false);
    expect(s.columns.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    expect(s.rows).toHaveLength(3);
    expect(s.rows[0]).toEqual({ id: 'r1', cells: { c1: 'Бренд А' } });
    expect(s.rows[1].cells).toEqual({ c1: 'Бренд Б', c2: 'b.ua', c3: 'примітка' });
    // порожня клітинка з Excel очищує, а не лишає старе
    expect(s.rows[2].cells).toEqual({ c2: 'c.ua' });
  });

  it('прихований фільтром рядок не перезаписується: пишемо лише в передані rowIds', () => {
    const { sheet: s } = applyPaste(sheet(), { rowIds: ['r2'], colId: 'c1' }, [['Х'], ['Y']]);
    expect(s.rows.map((r) => r.cells.c1)).toEqual(['Бренд А', 'Х', 'Y']);
  });

  it('межі: зайве відкидається з позначкою clipped; задовгий текст обрізається', () => {
    const wide = applyPaste(sheet(), { rowIds: ['r1'], colId: 'c1' }, [Array.from({ length: REFERENCE_MAX_COLUMNS + 3 }, (_, i) => `v${i}`)]);
    expect([wide.sheet.columns.length, wide.clipped]).toEqual([REFERENCE_MAX_COLUMNS, true]);

    const full: SheetContent = { ...sheet(), rows: Array.from({ length: REFERENCE_MAX_ROWS }, (_, i) => ({ id: `r${i}`, cells: {} })) };
    const tall = applyPaste(full, { rowIds: [`r${REFERENCE_MAX_ROWS - 1}`], colId: 'c1' }, [['a'], ['b']]);
    expect([tall.sheet.rows.length, tall.clipped, tall.sheet.rows[REFERENCE_MAX_ROWS - 1].cells.c1]).toEqual([REFERENCE_MAX_ROWS, true, 'a']);

    const long = applyPaste(sheet(), { rowIds: ['r1'], colId: 'c2' }, [['я'.repeat(REFERENCE_MAX_CELL + 5)]]);
    expect([long.sheet.rows[0].cells.c2.length, long.clipped]).toEqual([REFERENCE_MAX_CELL, true]);
  });

  it('невідома колонка або порожній буфер — аркуш без змін', () => {
    const s = sheet();
    expect(applyPaste(s, { rowIds: ['r1'], colId: 'c9' }, [['x']]).sheet).toBe(s);
    expect(applyPaste(s, { rowIds: ['r1'], colId: 'c1' }, []).sheet).toBe(s);
  });
});

describe('linkParts', () => {
  const links = (text: string) => linkParts(text).filter((p) => p.href).map((p) => [p.text, p.href]);

  it('http(s), www. і домен з поширеною зоною — посилання; розділові знаки в кінці не входять', () => {
    expect(links('Сайт: https://brand-a.ua/catalog?x=1, ще www.brand-b.com.')).toEqual([
      ['https://brand-a.ua/catalog?x=1', 'https://brand-a.ua/catalog?x=1'],
      ['www.brand-b.com', 'https://www.brand-b.com'],
    ]);
    expect(links('brand-c.com.ua (дилер)')).toEqual([['brand-c.com.ua', 'https://brand-c.com.ua']]);
    // дужка в самій адресі лишається, дужка навколо посилання — ні
    expect(links('(див. https://brand.ua/p_(x))')).toEqual([['https://brand.ua/p_(x)', 'https://brand.ua/p_(x)']]);
  });

  it('не посилання: назви файлів, числа, пошта, javascript:', () => {
    expect(links('прайс.xlsx, photo.jpg, 1.5 м, info@brand.ua, javascript:alert(1)')).toEqual([]);
  });

  it('текст навколо посилання зберігається повністю', () => {
    expect(linkParts('див. brand.ua\nпримітка').map((p) => p.text).join('')).toBe('див. brand.ua\nпримітка');
  });
});

describe('рядки й колонки', () => {
  it('setCell: порожнє чи пробіли прибирають клітинку; інше — замінює; без змін — той самий аркуш', () => {
    expect(setCell(sheet(), 'r2', 'c2', '  ').rows[1].cells).toEqual({ c1: 'Бренд Б' });
    expect(setCell(sheet(), 'r1', 'c2', 'a.ua').rows[0].cells).toEqual({ c1: 'Бренд А', c2: 'a.ua' });
    const s = sheet();
    expect(setCell(s, 'r1', 'c1', 'Бренд А')).toBe(s);
    expect(setCell(s, 'r1', 'c2', ' ')).toBe(s);
    expect(setCell(s, 'нема', 'c1', 'x')).toBe(s);
  });

  it('deleteRows без збігів і cellText для чужого ключа: без змін і без прототипу', () => {
    const s = sheet();
    expect(deleteRows(s, new Set(['нема']))).toBe(s);
    expect(deleteRows(s, new Set(['r1'])).rows.map((r) => r.id)).toEqual(['r2']);
    expect(cellText(s.rows[0], 'constructor')).toBe('');
    expect(cellText(s.rows[0], 'c1')).toBe('Бренд А');
  });

  it('addRow: під рядком з курсором, без нього — у кінці', () => {
    const row = { id: 'new', cells: {} };
    expect(addRow(sheet(), 'r1', row).rows.map((r) => r.id)).toEqual(['r1', 'new', 'r2']);
    expect(addRow(sheet(), null, row).rows.map((r) => r.id)).toEqual(['r1', 'r2', 'new']);
  });

  it('addColumn / newColumnFor: id не збігається з видаленою в діалозі колонкою, у якої ще є клітинки', () => {
    expect(addColumn(sheet()).columns.at(-1)).toEqual({ id: 'c3', title: 'Колонка 3' });
    expect(addColumn({ ...sheet(), columns: [{ id: 'c5', title: 'X' }] }).columns.at(-1)?.id).toBe('c6');
    const original = sheet().columns;
    expect(newColumnFor([original[0]], original)).toEqual({ id: 'c3', title: 'Колонка 2' });
  });

  it('applyColumnEdits: назви й порядок з діалогу, видалені — без клітинок, додану колегою колонку не губимо', () => {
    const original = sheet().columns;
    const edited = [{ id: 'c2', title: 'Сайт' }];
    const s = applyColumnEdits(sheet(), original, edited);
    expect(s.columns).toEqual([{ id: 'c2', title: 'Сайт' }]);
    expect(s.rows.map((r) => r.cells)).toEqual([{}, { c2: 'brand-b.ua' }]);

    // поки діалог був відкритий, колега додав c3 і змінив ширину c2
    const remote: SheetContent = { ...sheet(), columns: [original[0], { ...original[1], width: 300 }, { id: 'c3', title: 'Примітка' }] };
    expect(applyColumnEdits(remote, original, edited).columns).toEqual([
      { id: 'c2', title: 'Сайт', width: 300 },
      { id: 'c3', title: 'Примітка' },
    ]);
    const same = sheet();
    expect(applyColumnEdits(same, original, original)).toBe(same);
  });

  it('renameColumn / removeColumn з меню заголовка: без змін — той самий аркуш; остання колонка лишається', () => {
    const s = sheet();
    expect(renameColumn(s, 'c2', ' Сайт ').columns[1]).toEqual({ id: 'c2', title: 'Сайт' });
    expect(renameColumn(s, 'c2', 'Посилання')).toBe(s);
    expect(renameColumn(s, 'нема', 'x')).toBe(s);

    const removed = removeColumn(s, 'c2');
    expect(removed.columns.map((c) => c.id)).toEqual(['c1']);
    expect(removed.rows.map((r) => r.cells)).toEqual([{ c1: 'Бренд А' }, { c1: 'Бренд Б' }]);
    expect(removeColumn(removed, 'c1')).toBe(removed);
    expect(removeColumn(s, 'нема')).toBe(s);
  });

  it('reorderColumns / setColumnWidth: без змін — той самий аркуш (зайвого збереження немає)', () => {
    const s = sheet();
    expect(reorderColumns(s, ['ag-Grid-SelectionColumn', 'c1', 'c2'])).toBe(s);
    expect(reorderColumns(s, ['c2', 'c1']).columns.map((c) => c.id)).toEqual(['c2', 'c1']);
    expect(setColumnWidth(s, 'ag-Grid-SelectionColumn', 40)).toBe(s);
    // службові колонки таблиці («+» біля рядка, «+» колонки) в аркуш не потрапляють
    expect(reorderColumns(s, ['__insert', 'c1', 'c2', '__add-column'])).toBe(s);
    expect(setColumnWidth(s, '__insert', 34)).toBe(s);
    expect(setColumnWidth(s, '__add-column', 48)).toBe(s);
    const wide = setColumnWidth(s, 'c2', 320.4);
    expect(wide.columns[1].width).toBe(320);
    expect(setColumnWidth(wide, 'c2', 320)).toBe(wide);
    // межі сервера: вужча чи ширша колонка не робить аркуш незбережуваним
    expect(setColumnWidth(s, 'c1', 12).columns[0].width).toBe(REFERENCE_COLUMN_MIN_WIDTH);
    expect(setColumnWidth(s, 'c1', 99999).columns[0].width).toBe(REFERENCE_COLUMN_MAX_WIDTH);
  });
});
