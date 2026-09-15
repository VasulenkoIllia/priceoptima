// Погоджена сума (Ф18, ПОГ-1): за цінами КП-основи (останнє звичайне КП), а не живим переліком націнки;
// поки КП немає — за поточними цінами (buildKpRows у режимі заявки).
import { approvalBaseKp, approvedKpRows, approvedTotalsFromKp, buildKpRows, computeKpTotals } from '@shared/pricing';
import type { KpDocumentDto, PricingContext, RequestComputed, RequestDocument } from '@shared/types';

export function approvedSaleGrossOf(
  doc: Pick<RequestDocument, 'header' | 'lines' | 'offers'>,
  computed: Pick<RequestComputed, 'markup'>,
  ctx: Pick<PricingContext, 'settings'>,
  kps?: readonly KpDocumentDto[] | null,
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
