// Підсумки заявки для реєстру: «Сума» з живого розрахунку, «Погоджена сума» (Ф18, ПОГ-1) — за цінами КП-основи
// (КП, яку погоджує клієнт); поки КП немає — за поточними цінами.
import { approvalBaseKp, approvedKpRows, approvedTotalsFromKp, buildKpRows, computeKpTotals, computeRequest } from '../pricing';
import type { KpDocumentDto, PricingContext, RequestComputed, RequestDocument, RequestTotalsSummary } from '../types';
import type { RequestDocState } from './document';

export function approvedSaleGrossOf(
  doc: Pick<RequestDocument, 'header' | 'lines' | 'offers'>,
  computed: Pick<RequestComputed, 'markup'>,
  ctx: Pick<PricingContext, 'settings'>,
  kps?: readonly Pick<KpDocumentDto, 'id' | 'onlyApproved' | 'version' | 'snapshot'>[] | null,
): number | null {
  const base = approvalBaseKp(kps, doc.header.approvalKpId);
  if (base) return approvedTotalsFromKp(base.snapshot, doc.lines)?.totalGross ?? null;
  const { kpSettings, vatRatePct } = doc.header;
  const baseRows = buildKpRows(doc, computed, { ...kpSettings, onlyApproved: false }, ctx);
  const approved = approvedKpRows(baseRows, doc.lines);
  if (!approved.length) return null;
  return computeKpTotals(
    approved.map((row) => row.sum),
    kpSettings.vatMode,
    vatRatePct,
  ).totalGross;
}

export function requestTotals(
  doc: RequestDocState,
  ctx: PricingContext,
  kps?: readonly Pick<KpDocumentDto, 'id' | 'onlyApproved' | 'version' | 'snapshot'>[] | null,
): RequestTotalsSummary {
  const computed = computeRequest(doc, ctx);
  return { ...computed.totals, approvedSaleGross: approvedSaleGrossOf(doc, computed, ctx, kps) };
}
