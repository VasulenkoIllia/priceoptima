// Перевірка аркуша «Довідника»: межі розміру (shared/reference/limits) і чисті клітинки.
import { z } from 'zod';
import {
  REFERENCE_COLUMN_MAX_WIDTH,
  REFERENCE_COLUMN_MIN_WIDTH,
  REFERENCE_MAX_CELL,
  REFERENCE_MAX_COLUMNS,
  REFERENCE_MAX_ROWS,
  REFERENCE_MAX_SHEET_CHARS,
  REFERENCE_TITLE_MAX,
  sheetTextLength,
} from '@shared/reference/limits';
import { trimmed } from '../../lib/fields';

const ID = /^[A-Za-z0-9_-]{1,40}$/u;

const columnSchema = z.object({
  id: z.string().regex(ID, 'Невірний ідентифікатор колонки'),
  title: z.string().trim().max(REFERENCE_TITLE_MAX, `Задовга назва колонки (до ${REFERENCE_TITLE_MAX} символів)`),
  width: z.number().int().min(REFERENCE_COLUMN_MIN_WIDTH).max(REFERENCE_COLUMN_MAX_WIDTH).optional(),
});

const rowSchema = z.object({
  id: z.string().regex(ID, 'Невірний ідентифікатор рядка'),
  cells: z.record(z.string(), z.string().max(REFERENCE_MAX_CELL, `Задовгий текст у клітинці (до ${REFERENCE_MAX_CELL} символів)`)),
});

const unique = (ids: string[]) => new Set(ids).size === ids.length;

export const referenceSheetInputSchema = z
  .object({
    version: z.number().int().positive().optional(),
    title: trimmed(REFERENCE_TITLE_MAX, 'Вкажіть назву аркуша'),
    columns: z.array(columnSchema).max(REFERENCE_MAX_COLUMNS, `Забагато колонок (до ${REFERENCE_MAX_COLUMNS})`),
    rows: z.array(rowSchema).max(REFERENCE_MAX_ROWS, `Забагато рядків (до ${REFERENCE_MAX_ROWS})`),
  })
  .refine((s) => unique(s.columns.map((c) => c.id)) && unique(s.rows.map((r) => r.id)), 'Колонки й рядки аркуша мають бути різними')
  // клітинки лише існуючих колонок і без порожніх (як у браузері: самі пробіли — порожня): аркуш у базі не обростає
  // залишками видалених колонок
  .transform((s) => {
    const known = new Set(s.columns.map((c) => c.id));
    const rows = s.rows.map((r) => ({
      id: r.id,
      cells: Object.fromEntries(Object.entries(r.cells).filter(([key, value]) => known.has(key) && value.trim() !== '')),
    }));
    return { ...s, rows };
  })
  .refine((s) => sheetTextLength(s) <= REFERENCE_MAX_SHEET_CHARS, `Забагато тексту в аркуші (до ${REFERENCE_MAX_SHEET_CHARS.toLocaleString('uk-UA')} символів)`);

export const referenceSheetIdSchema = z.object({ id: z.uuid('Невірний ідентифікатор аркуша') });

export type ReferenceSheetInputBody = z.infer<typeof referenceSheetInputSchema>;
