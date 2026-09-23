import type {
  BlockTotals,
  LineComparison,
  OfferComputed,
  RequestComputed,
  RequestLine,
  SupplierBlock,
  SupplierRef,
  UUID,
  Warning,
} from '../types';
import { isActiveLine } from './lines';
import { round2, sumMoney } from './money';

/** Найменша сума серед кандидатів рядка (без ПДВ і з ПДВ — з однієї пропозиції). */
function minSums(
  lineId: UUID,
  offers: Record<UUID, OfferComputed>,
  offerIndex: RequestComputed['offerIndex'],
): { net: number; gross: number } | null {
  let best: OfferComputed | null = null;
  for (const id of Object.values(offerIndex[lineId] ?? {})) {
    const oc = offers[id];
    if (!oc?.isCandidate) continue;
    if (!best || (oc.sumNetUah ?? 0) < (best.sumNetUah ?? 0)) best = oc;
  }
  return best ? { net: best.sumNetUah ?? 0, gross: best.sumGrossUah ?? 0 } : null;
}

/**
 * «Найдешевший» — лише один блок: без переплати на своїх рядках, де його пропозиція бере участь у порівнянні;
 * якщо таких кілька — той, що покриває більше рядків
 * (нічия — вищий у списку).
 */
export function markCheapestBlock(totals: Record<UUID, BlockTotals>, blocks: readonly SupplierBlock[]): void {
  let best: BlockTotals | null = null;
  for (const block of [...blocks].sort((a, b) => a.position - b.position)) {
    const t = totals[block.id];
    if (!t?.comparedCount || t.deltaNet > 0) continue;
    if (!best || t.comparedCount > best.comparedCount) best = t;
  }
  if (best) best.cheapest = true;
}

/** Ф10–Ф11: підсумки блоку, покриття, дельта; мін. сума замовлення. Виключені пропозиції не враховуються (РЕД-13). */
export function computeBlockTotals(
  block: SupplierBlock,
  lines: readonly RequestLine[],
  offers: Record<UUID, OfferComputed>,
  offerIndex: RequestComputed['offerIndex'],
  comparisons: Record<UUID, LineComparison>,
  supplier: SupplierRef | null,
): BlockTotals {
  const active = lines.filter(isActiveLine);
  let filledCount = 0;
  let selectedCount = 0;
  let comparedCount = 0;
  const all: number[] = [];
  const included: number[] = [];
  const includedNet: number[] = [];
  const deltasNet: number[] = [];
  const selNet: number[] = [];
  const selGross: number[] = [];
  const deltas: number[] = [];
  const recSums: number[] = [];

  for (const line of active) {
    const offerId = offerIndex[line.id]?.[block.id];
    const oc = offerId ? offers[offerId] : undefined;
    if (!oc || !oc.isFilled) continue;
    all.push(oc.sumGrossUah ?? 0);
    if (oc.isExcluded) continue;
    const cmp = comparisons[line.id];
    filledCount++;
    included.push(oc.sumGrossUah ?? 0);
    includedNet.push(oc.sumNetUah ?? 0);

    if (cmp?.effectiveOfferId === oc.offerId) {
      selectedCount++;
      selNet.push(oc.sumNetUah ?? 0);
      selGross.push(oc.sumGrossUah ?? 0);
    }

    // Ф11: дельта — vs найменша сума по тих самих рядках (сума, а не ціна за од.: кратність у різних постачальників різна);
    // пропозиція, що не бере участі в порівнянні (немає в наявності при «не враховувати відсутні»), у дельту не йде
    const min = oc.isCandidate ? minSums(line.id, offers, offerIndex) : null;
    if (min) {
      comparedCount++;
      deltas.push((oc.sumGrossUah ?? 0) - min.gross);
      deltasNet.push((oc.sumNetUah ?? 0) - min.net);
      recSums.push(min.gross);
    }
  }

  const totalLines = active.length;
  const totalGross = sumMoney(included);
  const selectedGross = sumMoney(selGross);
  const deltaGross = round2(deltas.reduce((a, b) => a + b, 0));
  const recTotal = sumMoney(recSums);
  const minOrderAmount = supplier?.minOrderAmount ?? null;
  const belowMinOrder = minOrderAmount != null && selectedGross > 0 && selectedGross < minOrderAmount;

  const warnings: Warning[] = [];
  if (belowMinOrder) {
    warnings.push({
      code: 'BELOW_MIN_ORDER',
      severity: 'warning',
      blockId: block.id,
      params: { selectedGross, minOrderAmount },
    });
  }

  return {
    blockId: block.id,
    totalLines,
    filledCount,
    coveragePct: totalLines ? round2((filledCount / totalLines) * 100) : 0,
    totalGross,
    totalGrossIncluded: totalGross,
    totalGrossWithExcluded: sumMoney(all),
    totalNet: sumMoney(includedNet),
    selectedCount,
    selectedNet: sumMoney(selNet),
    selectedGross,
    deltaGross,
    deltaPct: recTotal ? round2((deltaGross / recTotal) * 100) : null,
    deltaNet: round2(deltasNet.reduce((a, b) => a + b, 0)),
    comparedCount,
    cheapest: false,
    minOrderAmount,
    belowMinOrder,
    warnings,
  };
}
