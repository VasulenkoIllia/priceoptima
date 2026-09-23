import type {
  MarkupRowComputed,
  MarkupSettings,
  OfferComputed,
  ProfitSummary,
  RequestComputed,
  RequestHeader,
  RequestLine,
  SupplierBlock,
  SupplierProfit,
  UUID,
} from '../types';
import { isActiveLine } from './lines';
import { computeSalePrice, profitAmounts, resolveMarkupRule, VAT_PAYER_PROFIT, type ProfitBasis } from './markup';
import { pct, round2, sumMoney } from './money';

interface ProfitRow {
  cost: number | null;
  sale: number | null;
  profit: number | null;
}

function summarize(rows: readonly ProfitRow[]): ProfitSummary {
  const priced = rows.filter((r) => r.sale != null && r.cost != null);
  const costNet = sumMoney(priced.map((r) => r.cost));
  const saleNet = sumMoney(priced.map((r) => r.sale));
  return {
    lines: priced.length,
    unpriced: rows.filter((r) => r.sale == null).length,
    costNet,
    saleNet,
    profitNet: sumMoney(priced.map((r) => r.profit)),
    markupPct: pct(saleNet - costNet, costNet),
  };
}

const fromMarkupRow = (r: MarkupRowComputed, basis: ProfitBasis): ProfitRow => profitAmounts(r, basis);

/** Рядок «якщо все в цього постачальника»: ціна продажу за правилом націнки рядка від пропозиції блоку (як F24–F27). */
function allInRow(line: RequestLine, oc: OfferComputed, markup: MarkupSettings, header: RequestHeader, basis: ProfitBasis): ProfitRow {
  const rule = resolveMarkupRule(line, markup);
  const sale = computeSalePrice({
    costNet: oc.unitNetUah,
    rrpGross: oc.rrpGrossUah,
    method: rule.method,
    value: rule.value,
    manualPriceNet: rule.manualPriceNet,
    manualPriceGross: rule.manualPriceGross,
    vatRatePct: header.vatRatePct,
    rounding: markup.rounding,
    discountFormula: header.discountFormula,
  });
  const qty = oc.qtyEffective;
  const sumNet = sale.saleNet != null ? round2(sale.saleNet * qty) : null;
  const sumGross = sale.saleGross != null ? round2(sale.saleGross * qty) : null;
  return profitAmounts({ sumNet, sumGross, costNet: oc.unitNetUah, costGross: oc.unitGrossUah, qty }, basis);
}

/**
 * Заробіток по постачальниках: за поточним вибором (з рядків націнки) і «якщо все в цього постачальника»
 * (рядки, які блок покриває за Ф13: заповнена невиключена пропозиція). Лише активні рядки.
 */
export function computeSupplierProfit(
  lines: readonly RequestLine[],
  blocks: readonly SupplierBlock[],
  offers: Record<UUID, OfferComputed>,
  offerIndex: RequestComputed['offerIndex'],
  markupRows: Record<UUID, MarkupRowComputed>,
  markup: MarkupSettings,
  header: RequestHeader,
  basis: ProfitBasis = VAT_PAYER_PROFIT,
): Record<UUID, SupplierProfit> {
  const active = lines.filter(isActiveLine);
  const result: Record<UUID, SupplierProfit> = {};
  for (const block of blocks) {
    const selected: ProfitRow[] = [];
    const allIn: ProfitRow[] = [];
    for (const line of active) {
      const row = markupRows[line.id];
      if (row?.blockId === block.id) selected.push(fromMarkupRow(row, basis));
      const offerId = offerIndex[line.id]?.[block.id];
      const oc = offerId ? offers[offerId] : undefined;
      if (!oc?.isFilled || oc.isExcluded) continue;
      allIn.push(row?.effectiveOfferId === oc.offerId ? fromMarkupRow(row, basis) : allInRow(line, oc, markup, header, basis));
    }
    result[block.id] = { blockId: block.id, selected: summarize(selected), allIn: summarize(allIn) };
  }
  return result;
}
