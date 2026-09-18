import type {
  BlockTotals,
  LineComparison,
  MarkupRowComputed,
  Offer,
  OfferComputed,
  PricingContext,
  RequestComputed,
  RequestDocument,
  RequestTotalsSummary,
  SupplierBlock,
  UUID,
  Warning,
} from '../types';
import { computeBlockTotals } from './blocks';
import { compareLine, type LineOfferEntry } from './comparison';
import { isActiveLine } from './lines';
import { computeMarkupRow, computeMarkupTotals } from './markup';
import { sumMoney } from './money';
import { computeOfferBase } from './offer';
import { computeScenarios } from './scenarios';
import { computeSupplierProfit } from './supplier-profit';

export type RequestDocInput = Pick<RequestDocument, 'header' | 'markup' | 'lines' | 'blocks' | 'offers'>;

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

/** Повний живий розрахунок заявки (чиста функція, O(рядки × блоки)). */
export function computeRequest(doc: RequestDocInput, ctx: PricingContext): RequestComputed {
  const lines = [...doc.lines].sort(byPosition);
  const blocks = [...doc.blocks].sort(byPosition);
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const blockById = new Map(blocks.map((b) => [b.id, b]));
  const blockPosition: Record<UUID, number> = {};
  blocks.forEach((b, i) => (blockPosition[b.id] = i));

  // пропозиції: база + індекс (≤ 1 на пару рядок × блок; сироти й дублікати ігноруються)
  const offerIndex: RequestComputed['offerIndex'] = {};
  const offerById = new Map<UUID, Offer>();
  const entriesByLine = new Map<UUID, LineOfferEntry[]>();
  for (const offer of doc.offers) {
    const line = lineById.get(offer.lineId);
    const block = blockById.get(offer.blockId);
    if (!line || !block) continue;
    const row = (offerIndex[line.id] ??= {});
    if (row[block.id]) continue;
    row[block.id] = offer.id;
    offerById.set(offer.id, offer);
    const base = computeOfferBase(offer, line, block, doc.header, ctx);
    const list = entriesByLine.get(line.id) ?? [];
    list.push({ offer, base });
    entriesByLine.set(line.id, list);
  }

  // порівняння по рядках
  const comparisons: Record<UUID, LineComparison> = {};
  const offers: Record<UUID, OfferComputed> = {};
  for (const line of lines) {
    const entries = (entriesByLine.get(line.id) ?? []).sort(
      (a, b) => (blockPosition[a.offer.blockId] ?? 0) - (blockPosition[b.offer.blockId] ?? 0),
    );
    const { comparison, flags } = compareLine(line, entries, blockPosition, {
      excludeUnavailable: doc.markup.excludeUnavailable,
    });
    comparisons[line.id] = comparison;
    for (const e of entries) offers[e.offer.id] = { ...e.base, ...flags[e.offer.id] };
  }

  // блоки і сценарії
  const blockTotals: Record<UUID, BlockTotals> = {};
  for (const block of blocks) {
    const supplier = block.supplierId ? (ctx.suppliers[block.supplierId] ?? null) : null;
    blockTotals[block.id] = computeBlockTotals(block, lines, offers, offerIndex, comparisons, supplier);
  }
  const scenarios = computeScenarios(lines, blocks, offers, offerIndex, comparisons, ctx.suppliers);

  // націнка
  const markupRows: Record<UUID, MarkupRowComputed> = {};
  const activeRows: MarkupRowComputed[] = [];
  for (const line of lines) {
    const effId = comparisons[line.id]?.effectiveOfferId ?? null;
    const eff = effId ? (offers[effId] ?? null) : null;
    const offer = effId ? (offerById.get(effId) ?? null) : null;
    const row = computeMarkupRow(line, eff, offer, doc.markup, doc.header, ctx);
    markupRows[line.id] = row;
    if (isActiveLine(line)) activeRows.push(row);
  }
  const mode = {
    vatMode: doc.header.kpSettings.vatMode,
    vatRatePct: doc.header.vatRatePct,
    fopPriceBasis: ctx.settings.fopPriceBasis,
  };
  const markup = { rows: markupRows, totals: computeMarkupTotals(activeRows, mode) };
  const supplierProfit = computeSupplierProfit(lines, blocks, offers, offerIndex, markupRows, doc.markup, doc.header, ctx);

  const partial: Omit<RequestComputed, 'totals'> = {
    offers,
    offerIndex,
    lines: comparisons,
    blocks: blockTotals,
    scenarios,
    markup,
    supplierProfit,
    warnings: [],
  };
  const totals = computeTotalsSummary({ lines, blocks }, partial);

  // плаский список попереджень: шапка → рядки (пропозиції за порядком блоків, рядок, націнка) → блоки
  const warnings: Warning[] = [];
  if (doc.header.clientId == null) warnings.push({ code: 'NO_CLIENT', severity: 'warning' });
  for (const line of lines) {
    for (const e of entriesByLine.get(line.id) ?? []) warnings.push(...(offers[e.offer.id]?.warnings ?? []));
    warnings.push(...(comparisons[line.id]?.warnings ?? []));
    warnings.push(...(markupRows[line.id]?.warnings ?? []));
  }
  for (const block of blocks) warnings.push(...(blockTotals[block.id]?.warnings ?? []));

  return { ...partial, totals, warnings };
}

/**
 * F32: підсумки заявки для реєстру. «Сума» (Ф17) і «Погоджена сума» (Ф18) — Разом з ПДВ за Ф16
 * у режимі цін заявки (з підсумків націнки), для ФОП — «Разом»; погоджена — за поточними цінами націнки
 * (за цінами КП-основи — approvedKpRows + computeKpTotals).
 */
export function computeTotalsSummary(
  doc: { lines: RequestDocument['lines']; blocks: readonly SupplierBlock[] },
  computed: Omit<RequestComputed, 'totals'>,
): RequestTotalsSummary {
  const active = doc.lines.filter(isActiveLine);
  const blockById = new Map(doc.blocks.map((b) => [b.id, b]));
  const usedBlocks = new Set<UUID>();
  const purchase: (number | null)[] = [];
  for (const line of active) {
    const cmp = computed.lines[line.id];
    if (!cmp?.effectiveOfferId) continue;
    const eff = computed.offers[cmp.effectiveOfferId];
    purchase.push(eff?.sumGrossUah ?? null);
    const block = cmp.effectiveBlockId ? blockById.get(cmp.effectiveBlockId) : undefined;
    if (block?.supplierId) usedBlocks.add(block.id);
  }
  const t = computed.markup.totals;
  const hasApproved = active.some((l) => l.approval.approved);
  return {
    linesCount: active.length,
    suppliersCount: usedBlocks.size,
    totalPurchaseGross: sumMoney(purchase),
    totalSaleNet: t.saleNet,
    totalSaleGross: t.saleGross,
    profitNet: t.profitNet,
    approvedSaleGross: hasApproved ? t.approvedSaleGross : null,
  };
}
