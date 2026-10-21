// Перевірка аркуша «Довідника» на вході в API (правки замовника 21.10, п.11).
import { describe, expect, it } from 'vitest';
import { REFERENCE_MAX_CELL, REFERENCE_MAX_COLUMNS, REFERENCE_MAX_ROWS, REFERENCE_MAX_SHEET_CHARS } from '@shared/reference/limits';
import { referenceSheetInputSchema } from '../modules/reference/reference.schemas';

const columns = [
  { id: 'c1', title: ' Назва бренду ' },
  { id: 'c2', title: 'Посилання', width: 320 },
];

describe('referenceSheetInputSchema', () => {
  it('назви обрізаються; клітинки невідомих колонок і порожні (самі пробіли теж) відкидаються', () => {
    const parsed = referenceSheetInputSchema.parse({
      version: 3,
      title: '  Сайти ТМ ',
      columns,
      rows: [{ id: 'r1', cells: { c1: 'Бренд А', c2: '   ', c7: 'залишок' } }],
    });
    expect(parsed).toEqual({
      version: 3,
      title: 'Сайти ТМ',
      columns: [
        { id: 'c1', title: 'Назва бренду' },
        { id: 'c2', title: 'Посилання', width: 320 },
      ],
      rows: [{ id: 'r1', cells: { c1: 'Бренд А' } }],
    });
  });

  it('відмова: без назви, невірні чи повторні id, не текст у клітинці', () => {
    const ok = { title: 'А', columns, rows: [] };
    expect(referenceSheetInputSchema.safeParse(ok).success).toBe(true);
    expect(referenceSheetInputSchema.safeParse({ ...ok, title: '  ' }).success).toBe(false);
    expect(referenceSheetInputSchema.safeParse({ ...ok, columns: [{ id: 'c 1', title: 'x' }] }).success).toBe(false);
    expect(referenceSheetInputSchema.safeParse({ ...ok, columns: [...columns, { id: 'c1', title: 'ще' }] }).success).toBe(false);
    expect(referenceSheetInputSchema.safeParse({ ...ok, rows: [{ id: 'r1', cells: {} }, { id: 'r1', cells: {} }] }).success).toBe(false);
    expect(referenceSheetInputSchema.safeParse({ ...ok, rows: [{ id: 'r1', cells: { c1: 5 } }] }).success).toBe(false);
    expect(referenceSheetInputSchema.safeParse({ ...ok, columns: [{ id: 'c1', title: 'x', width: 5 }] }).success).toBe(false);
  });

  it('межі: колонки, рядки, клітинка, весь текст аркуша', () => {
    const many = <T>(n: number, make: (i: number) => T) => Array.from({ length: n }, (_, i) => make(i));
    const check = (patch: object) => referenceSheetInputSchema.safeParse({ title: 'А', columns, rows: [], ...patch }).success;
    expect(check({ columns: many(REFERENCE_MAX_COLUMNS, (i) => ({ id: `c${i}`, title: '' })) })).toBe(true);
    expect(check({ columns: many(REFERENCE_MAX_COLUMNS + 1, (i) => ({ id: `c${i}`, title: '' })) })).toBe(false);
    expect(check({ rows: many(REFERENCE_MAX_ROWS + 1, (i) => ({ id: `r${i}`, cells: {} })) })).toBe(false);
    expect(check({ rows: [{ id: 'r1', cells: { c1: 'я'.repeat(REFERENCE_MAX_CELL) } }] })).toBe(true);
    expect(check({ rows: [{ id: 'r1', cells: { c1: 'я'.repeat(REFERENCE_MAX_CELL + 1) } }] })).toBe(false);
    const perRow = REFERENCE_MAX_CELL * 2;
    const rowsOverTotal = Math.ceil(REFERENCE_MAX_SHEET_CHARS / perRow) + 1;
    expect(check({ rows: many(rowsOverTotal, (i) => ({ id: `r${i}`, cells: { c1: 'я'.repeat(REFERENCE_MAX_CELL), c2: 'я'.repeat(REFERENCE_MAX_CELL) } })) })).toBe(false);
  });
});
