// Назви 1С з Excel (п.9.2 правок): пошук колонок «Артикул» і «Назва 1С» у файлі. Чисті функції — покриті тестами.
import type { Name1cImportResult } from '@shared/types';

export interface Name1cColumns {
  headerRow: number | null;
  sku: number | null;
  name1c: number | null;
}

const key = (cell: string) => cell.toLocaleLowerCase('uk').replace(/[\s.,\-_/\\'’ʼ"()«»:;*№#]+/gu, '');
const IS_1C = /1[сc]/u;
const NAME = /(назва|найменуван|наименован|номенклатур|name)/u;

function roleOf(cell: string): { role: 'sku' | 'name1c'; rank: number } | null {
  const k = key(cell);
  if (!k) return null;
  if (NAME.test(k)) return { role: 'name1c', rank: IS_1C.test(k) || k.startsWith('номенклатур') ? 0 : 1 };
  if (/^(артикул|sku)/u.test(k)) return { role: 'sku', rank: 0 };
  if (/^код/u.test(k) && !IS_1C.test(k)) return { role: 'sku', rank: 1 };
  return null;
}

/** Рядок заголовка з артикулом і назвою в перших 20; немає — дві перші колонки без заголовка. */
export function detectName1cColumns(rows: readonly string[][]): Name1cColumns {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const best: Record<'sku' | 'name1c', { col: number; rank: number } | null> = { sku: null, name1c: null };
    rows[i].forEach((cell, col) => {
      const m = roleOf(cell);
      if (m && (!best[m.role] || m.rank < best[m.role]!.rank)) best[m.role] = { col, rank: m.rank };
    });
    if (best.sku && best.name1c) return { headerRow: i, sku: best.sku.col, name1c: best.name1c.col };
  }
  const wide = rows.some((r) => r.length >= 2);
  return { headerRow: null, sku: wide ? 0 : null, name1c: wide ? 1 : null };
}

/** Пари «артикул → назва» з даних під заголовком. */
export function name1cRowsOf(rows: readonly string[][], cols: Name1cColumns): { sku: string; name1c: string }[] {
  if (cols.sku == null || cols.name1c == null) return [];
  const start = cols.headerRow == null ? 0 : cols.headerRow + 1;
  return rows.slice(start).map((r) => ({ sku: (r[cols.sku!] ?? '').trim(), name1c: (r[cols.name1c!] ?? '').trim() }));
}

/** Підсумок кількох частин (клієнт шле файл частинами до 1 МБ; повтори артикулів прибрано заздалегідь). */
export function sumName1cResults(parts: readonly Name1cImportResult[], skipped: number, duplicates: number): Name1cImportResult {
  const notFound = parts.flatMap((p) => p.notFound).slice(0, 500);
  return {
    matched: parts.reduce((n, p) => n + p.matched, 0),
    updated: parts.reduce((n, p) => n + p.updated, 0),
    unchanged: parts.reduce((n, p) => n + p.unchanged, 0),
    notFound,
    notFoundCount: parts.reduce((n, p) => n + p.notFoundCount, 0),
    skipped,
    duplicates,
  };
}
