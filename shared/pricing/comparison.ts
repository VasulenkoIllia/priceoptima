import type {
  LineComparison,
  Offer,
  OfferComparisonFlags,
  OfferComputedBase,
  RequestLine,
  SelectionState,
  UUID,
  Warning,
} from '../types';
import { isActiveLine } from './lines';
import { round2 } from './money';

export interface LineOfferEntry {
  offer: Offer;
  base: OfferComputedBase;
}

export interface LineCompareResult {
  comparison: LineComparison;
  /** offerId → прапорці порівняння */
  flags: Record<UUID, OfferComparisonFlags>;
}

/** F9–F11: мінімум, рекомендація, ефективний вибір рядка. */
export function compareLine(
  line: RequestLine,
  entries: readonly LineOfferEntry[],
  blockPosition: Record<UUID, number>,
  opts: { excludeUnavailable: boolean },
): LineCompareResult {
  const isActive = isActiveLine(line);
  const warnings: Warning[] = [];

  const isCandidate = (e: LineOfferEntry) =>
    e.base.isFilled && !e.offer.excluded && !(opts.excludeUnavailable && e.base.stock.outOfStock);

  const filled = entries.filter((e) => e.base.isFilled);
  const candidates = entries.filter(isCandidate);
  const prices = candidates.map((e) => e.base.unitNetUah as number);
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const spreadPct = min != null && max != null && min > 0 ? round2(((max - min) / min) * 100) : null;

  // рекомендований: мінімум без ПДВ, нічия → блок з меншою позицією
  let rec: LineOfferEntry | null = null;
  for (const e of candidates) {
    if (e.base.unitNetUah !== min) continue;
    if (!rec || pos(blockPosition, e.offer.blockId) < pos(blockPosition, rec.offer.blockId)) rec = e;
  }

  // F10: ефективний вибір
  const selBlockId = line.selection.blockId;
  let eff: LineOfferEntry | null = rec;
  let state: SelectionState = rec ? 'recommended' : 'none';
  let overpayGross = 0;
  let overpayNet = 0;
  if (selBlockId != null) {
    const sel = entries.find((e) => e.offer.blockId === selBlockId);
    if (sel && sel.base.isFilled && !sel.offer.excluded) {
      eff = sel;
      const optimal = min == null || (sel.base.unitNetUah as number) <= min;
      state = optimal ? 'manual_optimal' : 'manual_non_optimal';
      if (rec && rec !== sel) {
        overpayGross = Math.max(0, round2((sel.base.sumGrossUah ?? 0) - (rec.base.sumGrossUah ?? 0)));
        overpayNet = Math.max(0, round2((sel.base.sumNetUah ?? 0) - (rec.base.sumNetUah ?? 0)));
      }
      if (!optimal) {
        warnings.push({
          code: 'SELECTION_NOT_OPTIMAL',
          severity: 'info',
          lineId: line.id,
          blockId: sel.offer.blockId,
          offerId: sel.offer.id,
          params: { overpayGross, overpayNet },
        });
      }
    } else {
      state = 'manual_invalid';
      warnings.push({
        code: 'SELECTED_EXCLUDED',
        severity: 'warning',
        lineId: line.id,
        blockId: selBlockId,
        ...(sel ? { offerId: sel.offer.id } : {}),
      });
    }
  }

  if (isActive && eff == null) warnings.push({ code: 'NO_OFFERS', severity: 'warning', lineId: line.id });
  if (isActive && !(line.qty > 0)) warnings.push({ code: 'QTY_ZERO', severity: 'warning', lineId: line.id });

  const flags: Record<UUID, OfferComparisonFlags> = {};
  for (const e of entries) {
    const cand = isCandidate(e);
    const unit = e.base.unitNetUah;
    flags[e.offer.id] = {
      isCandidate: cand,
      isMin: cand && unit === min,
      isRecommended: e === rec,
      isSelected: e === eff,
      diffVsMinPct: e.base.isFilled && unit != null && min != null && min > 0 ? round2(((unit - min) / min) * 100) : null,
    };
  }

  return {
    comparison: {
      lineId: line.id,
      isActive,
      filledCount: filled.length,
      candidateCount: candidates.length,
      minUnitNet: min,
      maxUnitNet: max,
      spreadPct,
      recommendedBlockId: rec?.offer.blockId ?? null,
      recommendedOfferId: rec?.offer.id ?? null,
      selectedBlockId: selBlockId,
      effectiveBlockId: eff?.offer.blockId ?? null,
      effectiveOfferId: eff?.offer.id ?? null,
      selectionState: state,
      overpayGross,
      overpayNet,
      warnings,
    },
    flags,
  };
}

function pos(blockPosition: Record<UUID, number>, blockId: UUID): number {
  return blockPosition[blockId] ?? Number.MAX_SAFE_INTEGER;
}
