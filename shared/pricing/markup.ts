import type { DiscountFormula, MarkupMethod, PriceRounding } from '../enums';
import type {
  MarkupRowComputed,
  MarkupSettings,
  MarkupTotals,
  Offer,
  OfferComputed,
  RequestHeader,
  RequestLine,
  Warning,
  WarningCode,
} from '../types';
import { computeKpTotals, kpRowAmounts, type TotalsMode } from './kp-totals';
import { pct, round2, roundSale, sumMoney } from './money';
import { vatFactor } from './vat';

export interface MarkupRule {
  method: MarkupMethod;
  value: number | null;
  manualPriceNet: number | null;
  manualPriceGross: number | null;
  isOverride: boolean;
}

/** F24: правило націнки рядка (override рядка → налаштування заявки); ручна N має пріоритет над ручною G. */
export function resolveMarkupRule(line: Pick<RequestLine, 'markup'>, defaults: MarkupSettings): MarkupRule {
  const o = line.markup;
  const manualGross = o.manualPriceNet == null ? (o.manualPriceGross ?? null) : null;
  const isOverride = o.method != null || o.value != null || o.manualPriceNet != null || manualGross != null;
  if (o.manualPriceNet != null || manualGross != null) {
    return { method: 'manual', value: null, manualPriceNet: o.manualPriceNet, manualPriceGross: manualGross, isOverride };
  }
  return {
    method: o.method ?? defaults.method,
    value: o.value ?? defaults.value,
    manualPriceNet: null,
    manualPriceGross: null,
    isOverride,
  };
}

/** Найбільше значення % для способу: знижка від РРЦ — до 99 % (100 % і більше дає ціну 0 або відʼємну). */
export const MAX_DISCOUNT_PCT = 99;
export function markupValueMax(method: MarkupMethod): number {
  return method === 'discount_from_rrp' ? MAX_DISCOUNT_PCT : 1000;
}

export interface SalePriceInput {
  costNet: number | null;
  rrpGross: number | null;
  method: MarkupMethod;
  value: number | null;
  manualPriceNet: number | null;
  manualPriceGross?: number | null;
  vatRatePct: number;
  rounding: PriceRounding;
  discountFormula: DiscountFormula;
}

export interface SalePriceResult {
  saleNet: number | null;
  saleGross: number | null;
  priceBasis: 'net' | 'gross';
  warnings: WarningCode[];
}

/** Ф14: ціна продажу за од. (якір — первинна ціна методу, roundSale; похідна — round2). */
export function computeSalePrice(input: SalePriceInput): SalePriceResult {
  const k = vatFactor(input.vatRatePct);
  const v = input.value ?? 0;
  const none = (basis: 'net' | 'gross', warnings: WarningCode[] = []): SalePriceResult => ({
    saleNet: null,
    saleGross: null,
    priceBasis: basis,
    warnings,
  });
  const fromGross = (gross: number): SalePriceResult => {
    // «як в Excel» при знижці −100 % ділить на нуль
    if (!Number.isFinite(gross)) return none('gross');
    const saleGross = roundSale(gross, input.rounding);
    return { saleGross, saleNet: round2(saleGross / k), priceBasis: 'gross', warnings: [] };
  };
  const fromNet = (net: number): SalePriceResult => {
    if (!Number.isFinite(net)) return none('net');
    const saleNet = roundSale(net, input.rounding);
    return { saleNet, saleGross: round2(saleNet * k), priceBasis: 'net', warnings: [] };
  };

  switch (input.method) {
    case 'rrp':
      return input.rrpGross == null ? none('gross', ['NO_RRP']) : fromGross(input.rrpGross);
    case 'discount_from_rrp':
      if (input.rrpGross == null) return none('gross', ['NO_RRP']);
      return fromGross(input.discountFormula === 'excel_divisor' ? input.rrpGross / (1 + v / 100) : input.rrpGross * (1 - v / 100));
    case 'markup_on_cost':
      return input.costNet == null ? none('net') : fromNet(input.costNet * (1 + v / 100));
    case 'manual':
      if (input.manualPriceNet != null) return fromNet(input.manualPriceNet);
      return input.manualPriceGross != null ? fromGross(input.manualPriceGross) : none('net');
  }
}

/** F27: націнка і маржа на однаковій базі (без ПДВ). */
export function markupIndicators(costNet: number | null, saleNet: number | null): { markupPct: number | null; marginPct: number | null } {
  if (costNet == null || saleNet == null) return { markupPct: null, marginPct: null };
  return { markupPct: pct(saleNet - costNet, costNet), marginPct: pct(saleNet - costNet, saleNet) };
}

/** F24–F28: рядок блоку націнки від ефективної пропозиції. */
export function computeMarkupRow(
  line: RequestLine,
  eff: OfferComputed | null,
  offer: Offer | null,
  markup: MarkupSettings,
  header: RequestHeader,
): MarkupRowComputed {
  const rule = resolveMarkupRule(line, markup);
  const costNet = eff?.unitNetUah ?? null;
  const costGross = eff?.unitGrossUah ?? null;
  const rrpGross = eff?.rrpGrossUah ?? null;
  const rrpNet = eff?.rrpNetUah ?? null;
  // без обраної пропозиції рядок не продається навіть із ручною ціною: ціна рядка лишається й повернеться,
  // щойно рядок знову підберуть (у КП не йде рядок без коду й собівартості)
  const sale: SalePriceResult = eff
    ? computeSalePrice({
        costNet,
        rrpGross,
        method: rule.method,
        value: rule.value,
        manualPriceNet: rule.manualPriceNet,
        manualPriceGross: rule.manualPriceGross,
        vatRatePct: header.vatRatePct,
        rounding: markup.rounding,
        discountFormula: header.discountFormula,
      })
    : { saleNet: null, saleGross: null, priceBasis: 'net', warnings: [] };

  const qty = eff?.qtyEffective ?? line.qty; // F26
  const sumNet = sale.saleNet != null ? round2(sale.saleNet * qty) : null;
  const sumGross = sale.saleGross != null ? round2(sale.saleGross * qty) : null;
  const { markupPct, marginPct } = markupIndicators(costNet, sale.saleNet);
  const profitNet = costNet != null && sumNet != null ? round2(sumNet - round2(costNet * qty)) : null;
  const rrpVsCostPct = rrpNet != null && costNet ? pct(rrpNet - costNet, costNet) : null;

  const ref = { lineId: line.id, ...(eff ? { blockId: eff.blockId, offerId: eff.offerId } : {}) };
  const warnings: Warning[] = [];
  if (eff && sale.warnings.includes('NO_RRP')) warnings.push({ ...ref, code: 'NO_RRP', severity: 'warning' });
  if (sale.saleNet != null && costNet != null && sale.saleNet < costNet) {
    warnings.push({ ...ref, code: 'BELOW_COST', severity: 'warning', params: { saleNet: sale.saleNet, costNet } });
  }
  if (sale.saleGross != null && rrpGross != null && sale.saleGross > rrpGross + 0.005) {
    warnings.push({ ...ref, code: 'ABOVE_RRP', severity: 'warning', params: { saleGross: sale.saleGross, rrpGross } });
  }

  // F28: погодження
  const approvedQty = line.approval.approved ? (line.approval.approvedQty ?? qty) : null;
  const approvedSumNet = approvedQty != null && sale.saleNet != null ? round2(sale.saleNet * approvedQty) : null;
  const approvedSumGross = approvedQty != null && sale.saleGross != null ? round2(sale.saleGross * approvedQty) : null;

  return {
    lineId: line.id,
    effectiveOfferId: eff?.offerId ?? null,
    blockId: eff?.blockId ?? null,
    name: line.clientName,
    unit: offer?.unitCode ?? line.clientUnit,
    qty,
    costNet,
    costGross,
    rrpGross,
    rrpNet,
    rrpVsCostPct,
    method: rule.method,
    value: rule.value,
    isOverride: rule.isOverride,
    priceBasis: sale.priceBasis,
    saleNet: sale.saleNet,
    saleGross: sale.saleGross,
    sumNet,
    sumGross,
    markupPct,
    marginPct,
    profitNet,
    approvedQty,
    approvedSumNet,
    approvedSumGross,
    notApproved: eff != null && eff.blockId !== line.selection.blockId,
    warnings,
  };
}

const DEFAULT_TOTALS_MODE: TotalsMode = { vatMode: 'without_vat', vatRatePct: 20, fopPriceBasis: 'net' };

/**
 * F29: підсумки націнки (передавати лише активні рядки).
 * Разом / ПДВ — за Ф16 у режимі цін заявки, як у КП (тому «Сума» в реєстрі = КП до копійки); погоджені — Ф18.
 */
export function computeMarkupTotals(rows: readonly MarkupRowComputed[], mode: TotalsMode = DEFAULT_TOTALS_MODE): MarkupTotals {
  const priced = rows.filter((r) => r.saleNet != null);
  const withCost = priced.filter((r) => r.costNet != null);
  const costNet = sumMoney(withCost.map((r) => round2((r.costNet as number) * r.qty)));
  const costGross = sumMoney(withCost.map((r) => (r.costGross != null ? round2(r.costGross * r.qty) : null)));
  const saleNetOfCosted = sumMoney(withCost.map((r) => r.sumNet));
  const kpTotals = (approved: boolean) => {
    const sums: number[] = [];
    for (const r of priced) {
      const a = kpRowAmounts(r, mode.vatMode, mode.fopPriceBasis, approved);
      if (a) sums.push(a.sum);
    }
    return computeKpTotals(sums, mode.vatMode, mode.vatRatePct);
  };
  const sale = kpTotals(false);
  const approved = kpTotals(true);
  return {
    costNet,
    costGross,
    saleNet: sale.totalNet,
    vat: sale.vat,
    saleGross: sale.totalGross,
    profitNet: sumMoney(priced.map((r) => r.profitNet)),
    markupPct: pct(saleNetOfCosted - costNet, costNet),
    marginPct: pct(saleNetOfCosted - costNet, saleNetOfCosted),
    approvedSaleNet: approved.totalNet,
    approvedVat: approved.vat,
    approvedSaleGross: approved.totalGross,
    linesPriced: priced.length,
    linesUnpriced: rows.length - priced.length,
  };
}
