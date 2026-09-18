// Масове завантаження назв 1С (п.9.2 правок): «артикул → назва 1С» у товари одного постачальника.
// Товар шукаємо за нормалізованим артикулом (як у каталозі); порожня назва не стирає наявну.
import { normalizeSku } from '../parse/sku';

export interface Name1cRow {
  sku: string;
  name1c: string;
}

export interface Name1cProduct {
  id: string;
  skuKey: string;
  name1c: string | null;
}

export interface Name1cPlan {
  updates: { id: string; name1c: string }[];
  /** Знайдено в каталозі. */
  matched: number;
  /** Назва вже така сама. */
  unchanged: number;
  /** Артикули з файлу, яких немає в каталозі постачальника. */
  notFound: string[];
  /** Рядки без артикула або без назви. */
  skipped: number;
  /** Той самий артикул у файлі кілька разів (береться останній). */
  duplicates: number;
}

/** Максимум рядків в одному завантаженні. */
export const NAME1C_MAX_ROWS = 50_000;

/** Чисті рядки: без порожніх, пробіли в назві схлопнуто, повтор артикула — останній (порядок першої появи). */
export function dedupeName1cRows(rows: readonly Name1cRow[]): { rows: Name1cRow[]; keys: string[]; skipped: number; duplicates: number } {
  const wanted = new Map<string, Name1cRow>();
  let skipped = 0;
  let duplicates = 0;
  for (const r of rows) {
    const sku = r.sku.trim();
    const name1c = r.name1c.replace(/\s+/gu, ' ').trim();
    const key = sku ? normalizeSku(sku) : '';
    if (!key || !name1c) {
      skipped++;
      continue;
    }
    if (wanted.has(key)) duplicates++;
    wanted.set(key, { sku, name1c });
  }
  return { rows: [...wanted.values()], keys: [...wanted.keys()], skipped, duplicates };
}

export function planName1cImport(rows: readonly Name1cRow[], products: readonly Name1cProduct[]): Name1cPlan {
  const byKey = new Map(products.map((p) => [p.skuKey, p]));
  const { rows: clean, keys, skipped, duplicates } = dedupeName1cRows(rows);
  const wanted = new Map(keys.map((k, i) => [k, clean[i]]));
  const updates: Name1cPlan['updates'] = [];
  const notFound: string[] = [];
  let matched = 0;
  let unchanged = 0;
  for (const [key, w] of wanted) {
    const p = byKey.get(key);
    if (!p) {
      notFound.push(w.sku);
      continue;
    }
    matched++;
    if (p.name1c === w.name1c) unchanged++;
    else updates.push({ id: p.id, name1c: w.name1c });
  }
  return { updates, matched, unchanged, notFound, skipped, duplicates };
}
