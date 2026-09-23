// Модель рядків сітки підбору: рядок клієнта + пропозиції по блоках + живий розрахунок.
// Незмінені рядки зберігають посилання (AG Grid з getRowId перемальовує лише змінені).
import { searchTokens } from '@shared/parse';
import type {
  BlockTotals,
  LineComparison,
  Offer,
  OfferComputed,
  ProductPickDto,
  RequestComputed,
  RequestDocument,
  RequestLine,
  RequestComputedTotals,
  SupplierBlock,
  UUID,
  Warning,
  WarningCode,
} from '@shared/types';

/** Невдалий пошук артикула в клітинці (показується в клітинці до наступного введення). */
export interface SkuMiss {
  sku: string;
  kind: 'not_found' | 'ambiguous';
  candidates?: ProductPickDto[];
}

export interface BlockCell {
  offer: Offer | null;
  oc: OfferComputed | null;
  miss: SkuMiss | null;
}

export interface LineRow {
  kind: 'line';
  id: UUID;
  line: RequestLine;
  cmp: LineComparison | null;
  /** blockId → клітинка */
  cells: Record<UUID, BlockCell>;
  /** Ефективний вибір рядка (затверджений або рекомендований). */
  chosen: { blockId: UUID; offer: Offer; oc: OfferComputed } | null;
  /** Службовий підпис для порівняння з попередньою версією рядка. */
  sig: string;
}

export interface TotalsRow {
  kind: 'totals';
  id: typeof TOTALS_ROW_ID;
  blocks: Record<UUID, BlockTotals>;
  totals: RequestComputedTotals;
  /** Переплата поточного вибору vs оптимальний мікс (сценарій «Поточний вибір»). */
  /** Переплата без ПДВ поточного вибору проти міксу. */
  overpayNet: number;
  /** Рядків з ручним затвердженням / активних рядків. */
  approvedCount: number;
  activeCount: number;
}

/** Порожній рядок у кінці таблиці: введення в нього створює новий рядок заявки. */
export interface NewRow {
  kind: 'new';
  id: typeof NEW_ROW_ID;
}

export type SourcingRow = LineRow | TotalsRow | NewRow;

export const TOTALS_ROW_ID = '__totals' as const;
export const NEW_ROW_ID = '__new' as const;
export const NEW_ROW: NewRow = { kind: 'new', id: NEW_ROW_ID };

export const EMPTY_CELL: BlockCell = { offer: null, oc: null, miss: null };

export const missKey = (lineId: UUID, blockId: UUID) => `${lineId}:${blockId}`;

/** Фільтри рядків: базові (панель інструментів) і за видом попередження (лічильники панелі «Сценарії»). */
export type RowFilter = 'all' | 'unmatched' | 'unapproved' | 'warnings' | WarningFilter;
export type WarningFilter = 'stock' | 'stale';

export const BASE_FILTERS: readonly RowFilter[] = ['all', 'unmatched', 'unapproved', 'warnings'];
export const WARNING_FILTERS: readonly WarningFilter[] = ['stock', 'stale'];

export const ROW_FILTER_LABELS: Record<RowFilter, string> = {
  all: 'Усі',
  unmatched: 'Не підібрані',
  unapproved: 'Без затвердження',
  warnings: 'З попередженнями',
  stock: 'Наявність',
  stale: 'Застарілі ціни й немає у прайсі',
};

/** Коди попереджень пропозицій для фільтрів за видом. */
export const WARNING_FILTER_CODES: Record<WarningFilter, readonly WarningCode[]> = {
  stock: ['OUT_OF_STOCK', 'INSUFFICIENT_STOCK'],
  stale: ['PRICE_STALE', 'NOT_IN_PRICE_LIST'],
};

export interface BuildRowsInput {
  doc: Pick<RequestDocument, 'lines' | 'blocks' | 'offers'>;
  computed: RequestComputed;
  misses: Readonly<Record<string, SkuMiss>>;
  /** Попередні рядки (для збереження посилань). */
  prev?: ReadonlyMap<UUID, LineRow>;
}

/** Рядки сітки в порядку документа (без фільтра). */
export function buildLineRows({ doc, computed, misses, prev }: BuildRowsInput): LineRow[] {
  const offersById = new Map(doc.offers.map((o) => [o.id, o]));
  const blocks = [...doc.blocks].sort((a, b) => a.position - b.position);
  return [...doc.lines]
    .sort((a, b) => a.position - b.position)
    .map((line) => {
      const cells: Record<UUID, BlockCell> = {};
      const index = computed.offerIndex[line.id] ?? {};
      const refs: unknown[] = [line];
      const values: unknown[] = [];
      for (const b of blocks) {
        const offerId = index[b.id];
        const offer = offerId ? (offersById.get(offerId) ?? null) : null;
        const oc = offerId ? (computed.offers[offerId] ?? null) : null;
        const miss = offer ? null : (misses[missKey(line.id, b.id)] ?? null);
        cells[b.id] = offer || miss ? { offer, oc, miss } : EMPTY_CELL;
        refs.push(offer, miss);
        values.push(b.id, oc);
      }
      const cmp = computed.lines[line.id] ?? null;
      values.push(cmp);
      const sig = JSON.stringify(values);
      const old = prev?.get(line.id);
      if (old && old.sig === sig && sameRefs(old, refs, blocks)) return old;
      const effBlock = cmp?.effectiveBlockId ?? null;
      const eff = effBlock ? cells[effBlock] : null;
      return {
        kind: 'line',
        id: line.id,
        line,
        cmp,
        cells,
        chosen: effBlock && eff?.offer && eff.oc ? { blockId: effBlock, offer: eff.offer, oc: eff.oc } : null,
        sig,
      } satisfies LineRow;
    });
}

function sameRefs(old: LineRow, refs: unknown[], blocks: readonly SupplierBlock[]): boolean {
  if (old.line !== refs[0]) return false;
  for (let i = 0; i < blocks.length; i++) {
    const cell = old.cells[blocks[i].id] ?? EMPTY_CELL;
    if (cell.offer !== refs[1 + i * 2] || cell.miss !== refs[2 + i * 2]) return false;
  }
  return true;
}

/** Рядок підсумків (pinned bottom): усі суми — з computeRequest (підсумки блоків, закупівля, сценарій «Поточний вибір»). */
export function buildTotalsRow(doc: Pick<RequestDocument, 'lines'>, computed: RequestComputed): TotalsRow {
  const approved = doc.lines.filter((l) => {
    const c = computed.lines[l.id];
    return !!c?.isActive && (c.selectionState === 'manual_optimal' || c.selectionState === 'manual_non_optimal');
  }).length;
  const current = computed.scenarios.find((s) => s.kind === 'current_selection');
  return {
    kind: 'totals',
    id: TOTALS_ROW_ID,
    blocks: computed.blocks,
    totals: computed.totals,
    overpayNet: current?.diffVsMixNet ?? 0,
    approvedCount: approved,
    activeCount: computed.totals.linesCount,
  };
}

/** Є рекомендація, але немає чинного ручного затвердження — у націнку/КП піде мінімальна з позначкою «не затверджено». */
export function isNotApproved(cmp: LineComparison | null | undefined): boolean {
  return !!cmp?.effectiveOfferId && (cmp.selectionState === 'recommended' || cmp.selectionState === 'manual_invalid');
}

/** Точного збігу артикула немає — лише схожі (за префіксом). */
export function isSimilarMiss(miss: SkuMiss): boolean {
  return !!miss.candidates?.length && miss.candidates.every((c) => c.matchKind !== 'sku_exact');
}

// ── попередження ─────────────────────────────────────────────────────
/** Попередження рядка, що важливі для фільтра «з попередженнями» (без info і без «немає пропозицій»). */
export function rowWarnings(row: LineRow): Warning[] {
  const out: Warning[] = [];
  for (const cell of Object.values(row.cells)) {
    if (cell.oc && !cell.oc.isExcluded) out.push(...cell.oc.warnings.filter((w) => w.severity !== 'info'));
  }
  if (row.cmp) out.push(...row.cmp.warnings.filter((w) => w.severity !== 'info' && w.code !== 'NO_OFFERS'));
  return out;
}

// ── фільтр і пошук ───────────────────────────────────────────────────
export function rowMatchesFilter(row: LineRow, filter: RowFilter): boolean {
  const cmp = row.cmp;
  switch (filter) {
    case 'all':
      return true;
    case 'unmatched':
      return !!cmp?.isActive && !cmp.effectiveOfferId;
    case 'unapproved':
      return !!cmp?.isActive && isNotApproved(cmp);
    case 'warnings':
      return rowWarnings(row).length > 0;
    default:
      return hasOfferWarning(row, WARNING_FILTER_CODES[filter]);
  }
}

/** Є попередження з цими кодами в будь-якій невиключеній пропозиції рядка. */
function hasOfferWarning(row: LineRow, codes: readonly WarningCode[]): boolean {
  for (const cell of Object.values(row.cells)) {
    if (cell.oc && !cell.oc.isExcluded && cell.oc.warnings.some((w) => codes.includes(w.code))) return true;
  }
  return false;
}

/** Пошук рядка: назва/примітка клієнта, артикули й назви пропозицій, № рядка. */
export function rowMatchesSearch(row: LineRow, tokens: readonly string[]): boolean {
  if (!tokens.length) return true;
  const parts = [String(row.line.position), row.line.clientName, row.line.clientNote ?? ''];
  for (const cell of Object.values(row.cells)) {
    if (cell.offer) parts.push(cell.offer.sku ?? '', cell.offer.nameWork ?? '', cell.offer.name1c ?? '');
    if (cell.miss) parts.push(cell.miss.sku);
  }
  const hay = searchTokens(parts.join(' ')).join(' ');
  return tokens.every((t) => hay.includes(t));
}

export function filterRows(rows: readonly LineRow[], filter: RowFilter, search: string): LineRow[] {
  const tokens = searchTokens(search);
  if (filter === 'all' && !tokens.length) return rows as LineRow[];
  return rows.filter((r) => rowMatchesFilter(r, filter) && rowMatchesSearch(r, tokens));
}

/** Кількість рядків за кожним фільтром (для підписів у перемикачі). */
export function countByFilter(rows: readonly LineRow[]): Record<RowFilter, number> {
  const counts: Record<RowFilter, number> = { all: rows.length, unmatched: 0, unapproved: 0, warnings: 0, stock: 0, stale: 0 };
  const keys = [...BASE_FILTERS, ...WARNING_FILTERS].filter((f) => f !== 'all');
  for (const r of rows) {
    for (const f of keys) if (rowMatchesFilter(r, f)) counts[f]++;
  }
  return counts;
}

export function isLineRow(row: SourcingRow | undefined | null): row is LineRow {
  return row?.kind === 'line';
}

export function isNewRow(row: SourcingRow | undefined | null): row is NewRow {
  return row?.kind === 'new';
}
