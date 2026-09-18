// КП у mock: реквізити сторін для бланка і нова версія КП (звичайне — з поточних цін націнки; фінальне — з КП-основи).
import { KP_VAT_MODE_LABELS } from '@shared/enums';
import { formatMoney } from '@shared/format';
import {
  approvalBaseKp,
  buildFinalKpSnapshot,
  buildKpRows,
  buildKpSnapshot,
  catalogSnapshotOf,
  computeRequest,
  kpBuyerOf,
  kpManagerName,
  resolveKpTerms,
  type KpBuyer,
  type KpSeller,
} from '@shared/pricing';
import type { ISODate, ISODateTime, KpDocumentDto, KpSettings, KpSnapshot, KpTerm, PricingContext, RequestHeader, UserRef, UUID } from '@shared/types';
import { DataSourceError } from '../errors';
import type { MockDb, StoredRequest } from './db';

export interface KpParties {
  ownCompanyId: UUID;
  seller: KpSeller;
  buyer: KpBuyer;
  managerName: string;
}

/** Хто продає (наша юрособа заявки), кому (контрагент і контакт заявки) і менеджер. */
export function kpPartiesOf(db: Pick<MockDb, 'ownCompanies' | 'clients' | 'users'>, header: RequestHeader): KpParties {
  const own = db.ownCompanies.find((c) => c.id === header.ownCompanyId) ?? db.ownCompanies[0];
  const client = header.clientId ? db.clients[header.clientId] : undefined;
  const cp = client?.counterparties.find((c) => c.id === header.counterpartyId);
  const contact = client?.contacts.find((c) => c.id === header.contactId);
  const manager = db.users.find((u) => u.id === header.managerId);
  return {
    ownCompanyId: own.id,
    seller: own,
    buyer: kpBuyerOf(cp, client?.name, contact),
    managerName: kpManagerName(manager),
  };
}

export interface MakeKpInput {
  id: UUID;
  kpNumber: number;
  date: ISODate;
  at: ISODateTime;
  user: UserRef | null;
  settings: KpSettings;
  final: boolean;
  ctx: PricingContext;
  /** Типові умови з Налаштувань (якщо в заявці своїх немає). */
  defaultTerms?: readonly KpTerm[] | null;
}

/** Нова версія КП (знімок); помилка — якщо КП сформувати не можна. */
export function makeKpDocument(
  db: Pick<MockDb, 'ownCompanies' | 'clients' | 'users' | 'kps' | 'products'>,
  r: StoredRequest,
  input: MakeKpInput,
): KpDocumentDto {
  const prev = db.kps[r.id] ?? [];
  let snapshot: KpSnapshot;
  let ownCompanyId: UUID;
  let settings = input.settings;
  if (input.final) {
    // КП-основа — та, яку погоджує клієнт (обрана на вкладці «Погодження»), інакше остання звичайна
    const base = approvalBaseKp(prev, r.header.approvalKpId);
    if (!base) throw new DataSourceError('INVALID_STATE', 'Спершу сформуйте КП для клієнта — фінальне КП будується з нього');
    snapshot = buildFinalKpSnapshot(base.snapshot, r.lines, { kpNumber: input.kpNumber, date: input.date, validityDays: input.settings.validityDays });
    if (!snapshot.rows.length) throw new DataSourceError('VALIDATION_ERROR', 'Немає погоджених позицій — відмітьте їх на вкладці «Погодження»');
    ownCompanyId = base.ownCompanyId;
    settings = { ...base.settings, onlyApproved: true };
  } else {
    // рядки без ціни продажу в КП не входять (інтерфейс попереджає перед формуванням)
    const computed = computeRequest(r, input.ctx);
    // стан каталогу — для «Назва 1С», завантаженої вже після підбору товару
    const offers = r.offers.map((o) => {
      const p = o.productId ? db.products[o.productId] : undefined;
      return p ? { ...o, catalog: catalogSnapshotOf(p) } : o;
    });
    const rows = buildKpRows({ lines: r.lines, offers }, computed, { ...input.settings, onlyApproved: false }, input.ctx);
    if (!rows.length) throw new DataSourceError('VALIDATION_ERROR', 'Немає позицій з ціною продажу — підберіть товари й задайте націнку');
    const parties = kpPartiesOf(db, r.header);
    snapshot = buildKpSnapshot({
      kpNumber: input.kpNumber,
      requestNumber: r.header.number,
      date: input.date,
      settings: input.settings,
      vatRatePct: r.header.vatRatePct,
      rows,
      seller: parties.seller,
      buyer: parties.buyer,
      managerName: parties.managerName,
      terms: resolveKpTerms(input.settings.terms, input.defaultTerms),
    });
    ownCompanyId = parties.ownCompanyId;
  }
  return {
    id: input.id,
    requestId: r.id,
    kpNumber: input.kpNumber,
    numberLabel: snapshot.numberLabel,
    version: prev.length + 1,
    vatMode: snapshot.totals.vatMode,
    ownCompanyId,
    onlyApproved: input.final,
    settings,
    totalNet: snapshot.totals.totalNet,
    totalVat: snapshot.totals.vat,
    totalGross: snapshot.totals.totalGross,
    snapshot,
    sentAt: null,
    createdAt: input.at,
    createdBy: input.user,
  };
}

/** «Сформовано КП № 2114 / 000001 · ТОВ «ДЕМО ТРЕЙД», ціни без ПДВ · 30 936,02 грн». */
export function kpEventSummary(kp: KpDocumentDto, ownName: string): string {
  const total = `${formatMoney(kp.snapshot.totals.payable)} грн`;
  if (kp.onlyApproved) return `Сформовано фінальне КП № ${kp.numberLabel} · позицій: ${kp.snapshot.rows.length} · ${total}`;
  return `Сформовано КП № ${kp.numberLabel} · ${ownName}, ${KP_VAT_MODE_LABELS[kp.vatMode].toLowerCase()} · ${total}`;
}
