// Рядки бази ↔ документ заявки (shared/types). Числа документа — double, дати — ISO.
import type { KpDocument, Prisma, Request, RequestBlock, RequestEvent, RequestLine, RequestLock, RequestOffer } from '@prisma/client';
import { AVAILABILITY_STATUSES, CURRENCY_CODES, DISCOUNT_FORMULAS, PRODUCT_NAME_KINDS, RATE_POLICIES, REQUEST_STATUSES } from '@shared/enums';
import { formatRequestNumber } from '@shared/format';
import type { RequestDocState } from '@shared/requests';
import type {
  CopyReport,
  KpDocumentDto,
  KpSettings,
  KpSnapshot,
  LineMarkupOverride,
  LockInfo,
  MarkupSettings,
  Offer,
  OfferPriceChange,
  RequestEventDto,
  RequestHeader,
  RequestLine as LineDto,
  RequestTotalsSummary,
  SupplierBlock,
  UserRef,
  UUID,
} from '@shared/types';
import { dateOnly, isoDate, oneOf } from '../../lib/mapping';

export type RequestWithParts = Request & { lines: RequestLine[]; blocks: RequestBlock[]; offers: RequestOffer[] };

const json = <T>(value: Prisma.JsonValue): T => value as unknown as T;

// ── шапка ─────────────────────────────────────────────────────────
export function toHeader(r: Request): RequestHeader {
  return {
    number: r.number,
    requestDate: isoDate(r.requestDate)!,
    status: oneOf(REQUEST_STATUSES, r.status, 'in_progress'),
    title: r.title,
    clientId: r.clientId,
    counterpartyId: r.counterpartyId,
    contactId: r.contactId,
    ownCompanyId: r.ownCompanyId,
    managerId: r.managerId,
    notes: r.notes,
    purchaseNote: r.purchaseNote,
    rates: { USD: r.rateUsd, EUR: r.rateEur, date: isoDate(r.ratesDate) },
    vatRatePct: r.vatRatePct,
    discountFormula: oneOf(DISCOUNT_FORMULAS, r.discountFormula, 'percent_off'),
    kpSettings: json<KpSettings>(r.kpSettings),
    approvalKpId: r.approvalKpId,
    cancelReason: r.cancelReason,
  };
}

/** Поля шапки для запису (номер і статус пишуться окремо). */
export function headerData(h: RequestHeader) {
  return {
    requestDate: dateOnly(h.requestDate),
    title: h.title,
    clientId: h.clientId,
    counterpartyId: h.counterpartyId,
    contactId: h.contactId,
    ownCompanyId: h.ownCompanyId,
    managerId: h.managerId,
    notes: h.notes,
    purchaseNote: h.purchaseNote,
    rateUsd: h.rates.USD,
    rateEur: h.rates.EUR,
    ratesDate: h.rates.date ? dateOnly(h.rates.date) : null,
    vatRatePct: h.vatRatePct,
    discountFormula: h.discountFormula,
    kpSettings: h.kpSettings as unknown as Prisma.InputJsonValue,
    approvalKpId: h.approvalKpId ?? null,
    cancelReason: h.cancelReason,
  };
}

export function totalsData(t: RequestTotalsSummary) {
  return {
    linesCount: t.linesCount,
    suppliersCount: t.suppliersCount,
    totalPurchaseGross: t.totalPurchaseGross,
    totalSaleNet: t.totalSaleNet,
    totalSaleGross: t.totalSaleGross,
    profitNet: t.profitNet,
    approvedSaleGross: t.approvedSaleGross,
  };
}

export function toTotals(r: Request): RequestTotalsSummary {
  return {
    linesCount: r.linesCount,
    suppliersCount: r.suppliersCount,
    totalPurchaseGross: r.totalPurchaseGross,
    totalSaleNet: r.totalSaleNet,
    totalSaleGross: r.totalSaleGross,
    profitNet: r.profitNet,
    approvedSaleGross: r.approvedSaleGross,
  };
}

// ── рядки, блоки, пропозиції ──────────────────────────────────────
export function toLine(l: RequestLine): LineDto {
  return {
    id: l.id,
    position: l.position,
    clientName: l.clientName,
    clientUnit: l.clientUnit,
    qty: l.qty,
    clientNote: l.clientNote,
    selection: { blockId: l.selectionBlockId },
    markup: json<LineMarkupOverride>(l.markup),
    approval: { approved: l.approved, approvedQty: l.approvedQty },
    kpName: l.kpName,
  };
}

export function lineData(requestId: UUID, l: LineDto) {
  return {
    id: l.id,
    requestId,
    position: l.position,
    clientName: l.clientName,
    clientUnit: l.clientUnit,
    qty: l.qty,
    clientNote: l.clientNote,
    selectionBlockId: l.selection.blockId,
    markup: l.markup as unknown as Prisma.InputJsonValue,
    approved: l.approval.approved,
    approvedQty: l.approval.approvedQty,
    kpName: l.kpName,
  };
}

export function toBlock(b: RequestBlock): SupplierBlock {
  return {
    id: b.id,
    position: b.position,
    supplierId: b.supplierId,
    legalEntityId: b.legalEntityId,
    defaultCurrency: oneOf(CURRENCY_CODES, b.defaultCurrency, 'UAH'),
    rates: { USD: b.rateUsd, EUR: b.rateEur },
    rateSource: oneOf(RATE_POLICIES, b.rateSource, 'price_list'),
    ratesDate: isoDate(b.ratesDate),
    supplierMarkupPct: b.supplierMarkupPct,
    pricesIncludeVat: b.pricesIncludeVat,
    note: b.note,
  };
}

export function blockData(requestId: UUID, b: SupplierBlock) {
  return {
    id: b.id,
    requestId,
    position: b.position,
    supplierId: b.supplierId,
    legalEntityId: b.legalEntityId,
    defaultCurrency: b.defaultCurrency,
    rateUsd: b.rates.USD,
    rateEur: b.rates.EUR,
    rateSource: b.rateSource,
    ratesDate: b.ratesDate ? dateOnly(b.ratesDate) : null,
    supplierMarkupPct: b.supplierMarkupPct,
    pricesIncludeVat: b.pricesIncludeVat,
    note: b.note,
  };
}

export function toOffer(o: RequestOffer): Offer {
  return {
    id: o.id,
    lineId: o.lineId,
    blockId: o.blockId,
    productId: o.productId,
    sku: o.sku,
    nameWork: o.nameWork,
    name1c: o.name1c,
    nameKind: oneOf(PRODUCT_NAME_KINDS, o.nameKind, 'work'),
    unitCode: o.unitCode,
    currency: oneOf(CURRENCY_CODES, o.currency, 'UAH'),
    purchasePriceCur: o.purchasePriceCur,
    rrpCur: o.rrpCur,
    qty: o.qty,
    multiplicity: o.multiplicity,
    ...(o.noRounding ? { noRounding: true } : {}),
    stockQty: o.stockQty,
    availability: oneOf(AVAILABILITY_STATUSES, o.availability, 'unknown'),
    priceDate: o.priceDate ? o.priceDate.toISOString() : null,
    excluded: o.excluded,
    excludeReason: o.excludeReason,
    note: o.note,
    priceChange: o.priceChange ? json<OfferPriceChange>(o.priceChange) : null,
  };
}

export function offerData(requestId: UUID, o: Offer) {
  return {
    id: o.id,
    requestId,
    lineId: o.lineId,
    blockId: o.blockId,
    productId: o.productId,
    sku: o.sku,
    nameWork: o.nameWork,
    name1c: o.name1c,
    nameKind: o.nameKind,
    unitCode: o.unitCode,
    currency: o.currency,
    purchasePriceCur: o.purchasePriceCur,
    rrpCur: o.rrpCur,
    qty: o.qty,
    multiplicity: o.multiplicity,
    noRounding: !!o.noRounding,
    stockQty: o.stockQty,
    availability: o.availability,
    priceDate: o.priceDate ? new Date(o.priceDate) : null,
    excluded: o.excluded,
    excludeReason: o.excludeReason,
    note: o.note,
    priceChange: (o.priceChange ?? undefined) as Prisma.InputJsonValue | undefined,
  };
}

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

export function toDocState(r: RequestWithParts): RequestDocState {
  return {
    header: toHeader(r),
    markup: json<MarkupSettings>(r.markup),
    lines: r.lines.map(toLine).sort(byPosition),
    blocks: r.blocks.map(toBlock).sort(byPosition),
    offers: r.offers.map(toOffer),
  };
}

// ── КП, історія, блокування ───────────────────────────────────────
export function toKpDto(k: KpDocument, users: Map<string, UserRef>): KpDocumentDto {
  const snapshot = json<KpSnapshot>(k.snapshot);
  return {
    id: k.id,
    requestId: k.requestId,
    kpNumber: k.kpNumber,
    numberLabel: snapshot.numberLabel,
    version: k.version,
    vatMode: snapshot.totals.vatMode,
    ownCompanyId: k.ownCompanyId,
    onlyApproved: k.onlyApproved,
    settings: json<KpSettings>(k.settings),
    totalNet: k.totalNet,
    totalVat: k.totalVat,
    totalGross: k.totalGross,
    snapshot,
    sentAt: k.sentAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
    createdBy: k.createdById ? (users.get(k.createdById) ?? null) : null,
  };
}

export function toEventDto(e: RequestEvent, users: Map<string, UserRef>): RequestEventDto {
  return {
    id: e.id,
    at: e.at.toISOString(),
    user: e.userId ? (users.get(e.userId) ?? { id: e.userId, shortName: '—' }) : null,
    kind: e.kind as RequestEventDto['kind'],
    summary: e.summary,
    ...(e.group ? { group: e.group } : {}),
    ...(e.counts ? { counts: json<Record<string, number>>(e.counts) } : {}),
  };
}

export function toLockInfo(lock: RequestLock | null, users: Map<string, UserRef>, actorId: string, sessionId: string | null): LockInfo | null {
  if (!lock) return null;
  return {
    userId: lock.userId,
    userShortName: users.get(lock.userId)?.shortName ?? '—',
    sessionId: lock.sessionId,
    lockedAt: lock.lockedAt.toISOString(),
    expiresAt: lock.expiresAt.toISOString(),
    isMine: lock.userId === actorId,
    isMySession: lock.userId === actorId && sessionId != null && lock.sessionId === sessionId,
  };
}

export function toCopyReport(value: Prisma.JsonValue | null): CopyReport | null {
  return value ? json<CopyReport>(value) : null;
}

export const numberLabel = formatRequestNumber;
