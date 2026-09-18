// Документ заявки в mock: збирання DTO (refs, знімки каталогу, блокування), застосування дельти, рядок реєстру.
import { formatRequestNumber } from '@shared/format';
import { catalogSnapshotOf, computeRequest, pricingSettingsFrom } from '@shared/pricing';
import { isEditableStatus } from '@shared/status';
import type {
  DocumentPatch,
  KpDocumentDto as StoredKp,
  LockInfo,
  Offer,
  RequestDocument,
  RequestHeaderEditable,
  RequestListItem,
  RequestTotalsSummary,
  UUID,
} from '@shared/types';
import { contactRef, counterpartyRef } from '@/lib/refs';
import { toSupplierRef } from '@/lib/supplierRef';
import type { MockDb, StoredRequest } from './db';
import { clone } from './persistence';
import { stripCatalog, supplierRefsOf } from './seed';
import { approvedSaleGrossOf } from './totals';

export const EDITABLE_HEADER_KEYS: readonly (keyof RequestHeaderEditable)[] = [
  'requestDate',
  'title',
  'clientId',
  'counterpartyId',
  'contactId',
  'ownCompanyId',
  'managerId',
  'notes',
  'purchaseNote',
  'rates',
  'vatRatePct',
  'kpSettings',
  'approvalKpId',
];

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

/** Повний документ для редактора (глибока копія — дані БД не діляться з UI). */
export function buildRequestDocument(db: MockDb, r: StoredRequest, lock: LockInfo | null): RequestDocument {
  const suppliers: RequestDocument['refs']['suppliers'] = {};
  for (const b of r.blocks) {
    const s = b.supplierId ? db.suppliers.find((x) => x.id === b.supplierId) : undefined;
    if (s) suppliers[s.id] = toSupplierRef(s);
  }
  const client = r.header.clientId ? db.clients[r.header.clientId] : undefined;
  const cp = client?.counterparties.find((c) => c.id === r.header.counterpartyId);
  const contact = client?.contacts.find((c) => c.id === r.header.contactId);
  const own = db.ownCompanies.find((c) => c.id === r.header.ownCompanyId) ?? db.ownCompanies[0];
  const manager = db.users.find((u) => u.id === r.header.managerId);
  const offers: Offer[] = r.offers.map((o) => {
    const p = o.productId ? db.products[o.productId] : undefined;
    return { ...o, catalog: p ? catalogSnapshotOf(p) : null };
  });
  const readOnlyReason = !isEditableStatus(r.header.status) ? 'status' : lock && !lock.isMySession ? 'lock' : null;
  return clone({
    id: r.id,
    version: r.version,
    header: r.header,
    markup: r.markup,
    lines: [...r.lines].sort(byPosition),
    blocks: [...r.blocks].sort(byPosition),
    offers,
    lock,
    refs: {
      suppliers,
      client: client ? { id: client.id, name: client.name } : null,
      counterparty: cp ? counterpartyRef(cp) : null,
      contact: contact ? contactRef(contact) : null,
      ownCompany: { id: own.id, nameShort: own.nameShort, isVatPayer: own.isVatPayer },
      manager: manager ? { id: manager.id, shortName: manager.shortName } : { id: r.header.managerId, shortName: '—' },
      pricing: pricingSettingsFrom(db.settings),
    },
    meta: { ...r.meta, readOnlyReason },
  });
}

export function toRequestListItem(db: MockDb, r: StoredRequest, lock: LockInfo | null): RequestListItem {
  const client = r.header.clientId ? db.clients[r.header.clientId] : undefined;
  const cp = client?.counterparties.find((c) => c.id === r.header.counterpartyId);
  const manager = db.users.find((u) => u.id === r.header.managerId);
  const lastKp = (db.kps[r.id] ?? []).reduce<StoredKp | null>((best, k) => (!best || k.version > best.version ? k : best), null);
  return {
    id: r.id,
    number: r.header.number,
    numberLabel: formatRequestNumber(r.header.number),
    requestDate: r.header.requestDate,
    status: r.header.status,
    title: r.header.title,
    client: client ? { id: client.id, name: client.name } : null,
    counterparty: cp ? { id: cp.id, nameShort: cp.nameShort, edrpou: cp.edrpou } : null,
    manager: manager ? { id: manager.id, shortName: manager.shortName } : { id: r.header.managerId, shortName: '—' },
    totalSaleGross: r.totals.totalSaleGross,
    approvedSaleGross: r.totals.approvedSaleGross,
    linesCount: r.totals.linesCount,
    suppliersCount: r.totals.suppliersCount,
    kpCount: r.meta.kpCount,
    lastKp: lastKp ? { kpNumber: lastKp.kpNumber, final: lastKp.onlyApproved } : null,
    attachmentsCount: r.meta.attachmentsCount,
    lock,
    updatedAt: r.meta.updatedAt,
  };
}

export function computeStoredTotals(db: MockDb, r: StoredRequest, now: Date): RequestTotalsSummary {
  const ctx = { now, settings: pricingSettingsFrom(db.settings), suppliers: supplierRefsOf(db) };
  const computed = computeRequest(r, ctx);
  // ПОГ-1: «Погоджена сума» — від КП-основи (останнє звичайне КП), не з живого computed.totals.approvedSaleGross.
  return { ...computed.totals, approvedSaleGross: approvedSaleGrossOf(r, computed, ctx, db.kps[r.id]) };
}

function upsertById<T extends { id: UUID }>(list: T[], items: readonly T[] | undefined): T[] {
  if (!items?.length) return list;
  const index = new Map(list.map((x, i) => [x.id, i]));
  const out = [...list];
  for (const item of items) {
    const i = index.get(item.id);
    if (i === undefined) {
      index.set(item.id, out.length);
      out.push(item);
    } else {
      out[i] = item;
    }
  }
  return out;
}

/** Застосувати дельту до збереженої заявки (мутує r). Каскад: видалення рядка/блоку прибирає його пропозиції. */
export function applyDocumentPatch(r: StoredRequest, patch: DocumentPatch): void {
  const p = clone(patch);
  if (p.header) {
    const header = r.header as unknown as Record<string, unknown>;
    const src = p.header as Record<string, unknown>;
    for (const key of EDITABLE_HEADER_KEYS) if (key in src && src[key] !== undefined) header[key] = src[key];
  }
  if (p.markup) Object.assign(r.markup, p.markup);

  const del = p.delete ?? {};
  if (del.lineIds?.length) {
    const ids = new Set(del.lineIds);
    r.lines = r.lines.filter((l) => !ids.has(l.id));
    r.offers = r.offers.filter((o) => !ids.has(o.lineId));
  }
  if (del.blockIds?.length) {
    const ids = new Set(del.blockIds);
    r.blocks = r.blocks.filter((b) => !ids.has(b.id));
    r.offers = r.offers.filter((o) => !ids.has(o.blockId));
  }
  if (del.offerIds?.length) {
    const ids = new Set(del.offerIds);
    r.offers = r.offers.filter((o) => !ids.has(o.id));
  }

  const up = p.upsert ?? {};
  r.lines = upsertById(r.lines, up.lines);
  r.blocks = upsertById(r.blocks, up.blocks);
  r.offers = upsertById(r.offers, up.offers?.map((o) => stripCatalog(o as Offer)));

  // цілісність: пропозиції лише для наявних рядків/блоків, ≤ 1 на пару (перемагає остання)
  const lineIds = new Set(r.lines.map((l) => l.id));
  const blockIds = new Set(r.blocks.map((b) => b.id));
  const byPair = new Map<string, (typeof r.offers)[number]>();
  for (const o of r.offers) if (lineIds.has(o.lineId) && blockIds.has(o.blockId)) byPair.set(`${o.lineId}|${o.blockId}`, o);
  r.offers = [...byPair.values()];
  for (const l of r.lines) if (l.selection.blockId && !blockIds.has(l.selection.blockId)) l.selection = { blockId: null };
  r.lines.sort(byPosition);
  r.blocks.sort(byPosition);
}
