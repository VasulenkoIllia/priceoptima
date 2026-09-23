import type {
  LineComparison,
  OfferComputed,
  PurchaseScenario,
  RequestComputed,
  RequestLine,
  SupplierBlock,
  SupplierRef,
  UUID,
} from '../types';
import { isActiveLine } from './lines';
import { pct, round2, sumMoney } from './money';

type Picks = Map<UUID, OfferComputed>; // lineId → обрана пропозиція сценарію

/** Ф13: сценарії закупівлі [optimal_mix, current_selection, ...single_supplier]. */
export function computeScenarios(
  lines: readonly RequestLine[],
  blocks: readonly SupplierBlock[],
  offers: Record<UUID, OfferComputed>,
  offerIndex: RequestComputed['offerIndex'],
  comparisons: Record<UUID, LineComparison>,
  suppliers: Record<UUID, SupplierRef>,
): PurchaseScenario[] {
  const active = lines.filter(isActiveLine);
  const blockOrder = new Map(blocks.map((b, i) => [b.id, i]));
  const minOrderOf = (blockId: UUID): number | null => {
    const block = blocks.find((b) => b.id === blockId);
    const supplier = block?.supplierId ? suppliers[block.supplierId] : undefined;
    return supplier?.minOrderAmount ?? null;
  };

  const pick = (offerId: UUID | null | undefined): OfferComputed | undefined => (offerId ? offers[offerId] : undefined);

  // F16: мікс — рекомендовані
  const mix: Picks = new Map();
  for (const line of active) {
    const rec = pick(comparisons[line.id]?.recommendedOfferId);
    if (rec) mix.set(line.id, rec);
  }

  // F17: поточний вибір — ефективні
  const current: Picks = new Map();
  for (const line of active) {
    const eff = pick(comparisons[line.id]?.effectiveOfferId);
    if (eff) current.set(line.id, eff);
  }

  const build = (kind: PurchaseScenario['kind'], blockId: UUID | null, picks: Picks, vsMix: Picks | null): PurchaseScenario => {
    const chosen = [...picks.values()];
    const byBlock = new Map<UUID, number[]>();
    for (const oc of chosen) {
      const arr = byBlock.get(oc.blockId) ?? [];
      arr.push(oc.sumGrossUah ?? 0);
      byBlock.set(oc.blockId, arr);
    }
    const blockIds = [...byBlock.keys()].sort((a, b) => (blockOrder.get(a) ?? 0) - (blockOrder.get(b) ?? 0));
    const belowMinOrderBlockIds = blockIds.filter((id) => {
      const min = minOrderOf(id);
      const sum = sumMoney(byBlock.get(id) ?? []);
      return min != null && sum > 0 && sum < min;
    });

    let diffVsMixGross: number | null = null;
    let diffVsMixPct: number | null = null;
    let diffVsMixNet: number | null = null;
    if (vsMix) {
      const diffs: number[] = [];
      const diffsNet: number[] = [];
      const bases: number[] = [];
      for (const [lineId, oc] of picks) {
        const m = vsMix.get(lineId);
        if (!m) continue;
        diffs.push((oc.sumGrossUah ?? 0) - (m.sumGrossUah ?? 0));
        diffsNet.push((oc.sumNetUah ?? 0) - (m.sumNetUah ?? 0));
        bases.push(m.sumGrossUah ?? 0);
      }
      diffVsMixGross = round2(diffs.reduce((a, b) => a + b, 0));
      diffVsMixPct = pct(diffVsMixGross, sumMoney(bases));
      diffVsMixNet = round2(diffsNet.reduce((a, b) => a + b, 0));
    }

    const missingLineIds = active.filter((l) => !picks.has(l.id)).map((l) => l.id);
    return {
      kind,
      blockId,
      totalNet: sumMoney(chosen.map((oc) => oc.sumNetUah)),
      totalGross: sumMoney(chosen.map((oc) => oc.sumGrossUah)),
      coveredLines: picks.size,
      missingLines: missingLineIds.length,
      missingLineIds,
      suppliersUsed: blockIds.length,
      blockIds,
      diffVsMixGross,
      diffVsMixPct,
      diffVsMixNet,
      belowMinOrderBlockIds,
    };
  };

  const scenarios: PurchaseScenario[] = [build('optimal_mix', null, mix, null), build('current_selection', null, current, mix)];

  // Ф13: «все в X» — рядки, які блок покриває (Ф10: заповнена невиключена пропозиція)
  for (const block of blocks) {
    const single: Picks = new Map();
    for (const line of active) {
      const oc = pick(offerIndex[line.id]?.[block.id]);
      if (oc?.isFilled && !oc.isExcluded) single.set(line.id, oc);
    }
    scenarios.push(build('single_supplier', block.id, single, mix));
  }
  return scenarios;
}
