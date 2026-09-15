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
  const all: number[] = [];
  const included: number[] = [];
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

    if (cmp?.effectiveOfferId === oc.offerId) {
      selectedCount++;
      selNet.push(oc.sumNetUah ?? 0);
      selGross.push(oc.sumGrossUah ?? 0);
    }

    // Ф11: дельта — vs мінімальна пропозиція по тих самих рядках
    const rec = cmp?.recommendedOfferId ? offers[cmp.recommendedOfferId] : undefined;
    if (rec) {
      deltas.push((oc.sumGrossUah ?? 0) - (rec.sumGrossUah ?? 0));
      recSums.push(rec.sumGrossUah ?? 0);
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
    selectedCount,
    selectedNet: sumMoney(selNet),
    selectedGross,
    deltaGross,
    deltaPct: recTotal ? round2((deltaGross / recTotal) * 100) : null,
    minOrderAmount,
    belowMinOrder,
    warnings,
  };
}
