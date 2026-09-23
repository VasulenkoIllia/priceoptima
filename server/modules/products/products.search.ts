// Ранжування каталогу (§6.7): точний артикул > префікс артикулу > усі токени назви >
// частина токенів (≥ половини) > наявність > ціна. Правила тут чисті — база лише відбирає кандидатів
// тими самими умовами, а остаточний порядок рахує цей файл (і його ж перевіряють тести).
import { normalizeSku, searchTokens } from '@shared/parse';
import type { AvailabilityStatus } from '@shared/enums';
import type { ProductMatchKind, ProductPickDto } from '@shared/types';

/** Ваги збігів. Ті самі числа використовує чорновий порядок у SQL. */
export const SEARCH_SCORE = {
  skuExact: 1000,
  skuPrefix: 500,
  allTokens: 100,
  perToken: 10,
} as const;

/** Коротший запит не вважаємо артикулом — інакше «5» збігається з половиною каталогу. */
export const MIN_SKU_EXACT = 2;
export const MIN_SKU_PREFIX = 3;
/** Скільки позицій за артикулом показуємо, коли точного збігу немає. */
export const LOOKUP_PREFIX_LIMIT = 5;

const AVAILABILITY_BONUS: Record<AvailabilityStatus, number> = {
  in_stock: 3,
  low_stock: 2,
  on_order: 1,
  unknown: 1,
  out_of_stock: 0,
};

/** Токени пошуку; «д/раковини» → «раковини» (скорочення через «/» розбиваємо, розміри на кшталт 1/2 лишаємо). */
export function queryTokens(q: string): string[] {
  const out: string[] = [];
  for (const t of searchTokens(q)) {
    if (/\p{L}\/\p{L}/u.test(t)) out.push(...t.split('/'));
    else out.push(t);
  }
  // «%» і «_» — шаблони LIKE: Prisma (contains) їх не екранує, тож прибираємо, щоб список і лічильник збігалися
  return out.map((t) => t.replace(/[%_\\]/gu, '')).filter((t) => t.length >= 2);
}

export interface SearchPlan {
  /** Порожній — запит не схожий на артикул. */
  skuKey: string;
  tokens: string[];
  /** Скільки токенів має збігтися, щоб позиція взагалі потрапила у видачу. */
  minMatched: number;
  matchExact: boolean;
  matchPrefix: boolean;
}

export function searchPlan(q: string): SearchPlan {
  const raw = (q ?? '').trim();
  // «%» і «_» у пошуку — не шаблони: Prisma (contains) їх не екранує, тож прибираємо й з ключа артикула
  const skuKey = normalizeSku(raw).replace(/[%_\\]/gu, '');
  const tokens = queryTokens(raw);
  return {
    skuKey,
    tokens,
    minMatched: tokens.length ? Math.max(1, Math.ceil(tokens.length / 2)) : Number.POSITIVE_INFINITY,
    matchExact: skuKey.length >= MIN_SKU_EXACT,
    matchPrefix: skuKey.length >= MIN_SKU_PREFIX,
  };
}

/** Запит, за яким нічого шукати (порожній або надто короткий). */
export function isEmptyPlan(plan: SearchPlan): boolean {
  return !plan.matchExact && !plan.matchPrefix && plan.tokens.length === 0;
}

export interface RankCandidate {
  skuKey: string;
  searchText: string;
  availability: AvailabilityStatus;
}

export interface RankResult {
  kind: ProductMatchKind;
  score: number;
}

/** Вид збігу й вага позиції; null — позиція не підходить під запит. */
export function rankProduct(p: RankCandidate, plan: SearchPlan): RankResult | null {
  let kind: ProductMatchKind | null = null;
  let score = 0;
  if (plan.matchExact && p.skuKey === plan.skuKey) {
    kind = 'sku_exact';
    score = SEARCH_SCORE.skuExact;
  } else if (plan.matchPrefix && p.skuKey.startsWith(plan.skuKey)) {
    kind = 'sku_prefix';
    score = SEARCH_SCORE.skuPrefix;
  } else if (plan.tokens.length) {
    let matched = 0;
    for (const t of plan.tokens) if (p.searchText.includes(t)) matched++;
    if (matched === plan.tokens.length) {
      kind = 'text';
      score = SEARCH_SCORE.allTokens + matched * SEARCH_SCORE.perToken;
    } else if (matched >= plan.minMatched) {
      kind = 'fuzzy';
      score = matched * SEARCH_SCORE.perToken;
    }
  }
  if (!kind) return null;
  return { kind, score: score + AVAILABILITY_BONUS[p.availability] };
}

/** Порядок видачі: вага → дешевша позиція → назва. */
export function compareHits(a: ProductPickDto, b: ProductPickDto): number {
  return (
    b.score - a.score ||
    (a.purchasePriceUah ?? Number.POSITIVE_INFINITY) - (b.purchasePriceUah ?? Number.POSITIVE_INFINITY) ||
    a.nameWork.localeCompare(b.nameWork, 'uk')
  );
}

export interface SkuMatch<T> {
  row: T;
  kind: ProductMatchKind;
  score: number;
}

/**
 * Пошук за списком артикулів: точні збіги; якщо їх немає — до 5 за префіксом.
 * Ключ результату — вхідний артикул як є (фронт зіставляє його з рядком заявки).
 */
export function lookupSkuMatches<T extends { skuKey: string }>(
  rows: readonly T[],
  skus: readonly string[],
): Record<string, SkuMatch<T>[]> {
  const byKey = new Map<string, T[]>();
  for (const row of rows) {
    const list = byKey.get(row.skuKey);
    if (list) list.push(row);
    else byKey.set(row.skuKey, [row]);
  }
  const results: Record<string, SkuMatch<T>[]> = {};
  for (const raw of skus) {
    const key = normalizeSku(raw ?? '');
    if (!key) {
      results[raw] = [];
      continue;
    }
    const exact = byKey.get(key);
    if (exact?.length) {
      results[raw] = exact.map((row) => ({ row, kind: 'sku_exact' as const, score: SEARCH_SCORE.skuExact }));
      continue;
    }
    results[raw] =
      key.length >= MIN_SKU_PREFIX
        ? rows
            .filter((row) => row.skuKey.startsWith(key))
            .slice(0, LOOKUP_PREFIX_LIMIT)
            .map((row) => ({ row, kind: 'sku_prefix' as const, score: SEARCH_SCORE.skuPrefix }))
        : [];
  }
  return results;
}

/** Нормалізовані ключі артикулів запиту (для відбору кандидатів у базі). */
export function lookupKeys(skus: readonly string[]): string[] {
  return [...new Set(skus.map((s) => normalizeSku(s ?? '')).filter((s) => s.length > 0))];
}
