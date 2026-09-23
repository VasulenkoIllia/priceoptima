// Знімок КП (КП-1…КП-3, ПОГ-3): з нього будуються попередній перегляд, PDF і Excel — числа збігаються до копійки.
import type { KpVatMode } from '../enums';
import { amountInWordsUah } from '../format/amount-words';
import { formatDateLong } from '../format/date';
import { formatKpNumber, formatRequestNumber } from '../format/numbering';
import type {
  ISODate,
  KpDocumentDto,
  KpPartyBlock,
  KpRow,
  KpSettings,
  KpSnapshot,
  KpTerm,
  OwnCompanyDto,
  RequestComputed,
  RequestLine,
  UUID,
} from '../types';
import { cleanKpTerms } from './defaults';
import { approvedKpRows, computeKpTotals } from './kp-totals';
import { isActiveLine } from './lines';

/** Реквізити нашої юрособи для бланка. */
export type KpSeller = Pick<
  OwnCompanyDto,
  'nameShort' | 'nameFull' | 'edrpou' | 'ipn' | 'isVatPayer' | 'iban' | 'bankName' | 'addressLegal' | 'phone' | 'email' | 'website' | 'slogan' | 'logoUrl' | 'kpFooter'
>;

export interface KpBuyer {
  /** Повна (або коротка) назва контрагента; без контрагента — назва клієнта. */
  name: string | null;
  edrpou: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
}

export interface KpSnapshotInput {
  /** null — попередній перегляд. */
  kpNumber: number | null;
  requestNumber: number;
  date: ISODate;
  settings: Pick<KpSettings, 'vatMode' | 'showImages' | 'validityDays' | 'extraInfo'>;
  vatRatePct: number;
  /** Рядки КП (buildKpRows). */
  rows: KpRow[];
  seller: KpSeller;
  buyer: KpBuyer;
  managerName: string;
  /** Умови внизу КП (resolveKpTerms: свої в заявці або типові). */
  terms: readonly KpTerm[];
}

const PRICE_HEADERS: Record<KpVatMode, { priceHeader: string; sumHeader: string }> = {
  without_vat: { priceHeader: 'Ціна без ПДВ, грн', sumHeader: 'Сума без ПДВ, грн' },
  with_vat: { priceHeader: 'Ціна з ПДВ, грн', sumHeader: 'Сума з ПДВ, грн' },
  no_vat: { priceHeader: 'Ціна, грн', sumHeader: 'Сума, грн' },
};

/** Рядок «Менеджер» бланка: 'Коваль О.В., тел. 067 000 11 22'. */
export function kpManagerName(u: { shortName: string; phone?: string | null } | null | undefined): string {
  return u ? `${u.shortName}${u.phone ? `, тел. ${u.phone}` : ''}` : '';
}

/** Покупець бланка з контрагента (коротка назва), клієнта й контакту заявки. */
export function kpBuyerOf(
  counterparty: { nameShort: string; edrpou: string | null } | null | undefined,
  clientName: string | null | undefined,
  contact: { fullName: string; email: string | null; phone: string | null } | null | undefined,
): KpBuyer {
  return {
    name: counterparty?.nameShort ?? clientName ?? null,
    edrpou: counterparty?.edrpou ?? null,
    contactName: contact?.fullName ?? null,
    email: contact?.email ?? null,
    phone: contact?.phone ?? null,
  };
}

/** '2114 / 000001'; без номера (попередній перегляд) — 'чернетка / 000001'. */
export function kpNumberLabel(kpNumber: number | null, requestNumber: number): string {
  return kpNumber == null ? `чернетка / ${formatRequestNumber(requestNumber)}` : formatKpNumber(kpNumber, requestNumber);
}

/** '2026-09-15' + 3 → '2026-09-18'. */
export function addDaysIso(date: ISODate, days: number): ISODate {
  const t = Date.parse(`${date}T12:00:00Z`);
  if (Number.isNaN(t)) return date;
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

/** Блок «Постачальник»: повна назва + рахунок, адреса, коди (ФОП — РНОКПП і «не є платником ПДВ»). */
export function kpSellerBlock(s: KpSeller): KpPartyBlock {
  const lines: string[] = [];
  if (s.iban) lines.push(`р/р ${s.iban}${s.bankName ? ` в ${s.bankName}` : ''}`);
  if (s.addressLegal) lines.push(s.addressLegal);
  const codes = s.isVatPayer
    ? [s.edrpou ? `код ЄДРПОУ ${s.edrpou}` : null, s.ipn ? `ІПН ${s.ipn}` : null]
    : [s.ipn ? `РНОКПП ${s.ipn}` : null, 'не є платником ПДВ'];
  const codeLine = codes.filter(Boolean).join(', ');
  if (codeLine) lines.push(codeLine);
  return { title: s.nameFull || s.nameShort, lines };
}

/** Знімок звичайного КП з рядків і реквізитів (номер — з лічильника при формуванні; у перегляді — null). */
export function buildKpSnapshot(input: KpSnapshotInput): KpSnapshot {
  const { settings, seller, buyer } = input;
  const rows = input.rows.map((r, i) => ({ ...r, n: i + 1 }));
  const totals = computeKpTotals(
    rows.map((r) => r.sum),
    settings.vatMode,
    input.vatRatePct,
  );
  return {
    kpNumber: input.kpNumber,
    requestNumber: input.requestNumber,
    numberLabel: kpNumberLabel(input.kpNumber, input.requestNumber),
    final: false,
    date: input.date,
    dateLabel: formatDateLong(input.date),
    header: { slogan: seller.slogan, phone: seller.phone, email: seller.email, website: seller.website, logoPath: seller.logoUrl },
    seller: kpSellerBlock(seller),
    buyer: {
      title: buyer.name ?? '',
      lines: buyer.edrpou ? [`код ЄДРПОУ ${buyer.edrpou}`] : [],
      contactName: buyer.contactName,
      email: buyer.email,
      phone: buyer.phone,
    },
    extraInfo: settings.extraInfo?.trim() || null,
    columns: { showSku: true, showImages: settings.showImages, ...PRICE_HEADERS[settings.vatMode] },
    rows,
    totals,
    amountInWords: amountInWordsUah(totals.payable),
    managerName: input.managerName,
    validUntil: settings.validityDays > 0 ? addDaysIso(input.date, settings.validityDays) : null,
    footer: seller.kpFooter,
    terms: cleanKpTerms(input.terms),
  };
}

/**
 * ПОГ-3: фінальне КП з КП-основи — лише погоджені рядки з погодженими к-стями;
 * ціни, реквізити й режим ПДВ — з основи (зміни націнки на них не впливають).
 */
export function buildFinalKpSnapshot(
  base: KpSnapshot,
  lines: readonly Pick<RequestLine, 'id' | 'approval'>[],
  init: { kpNumber: number | null; date: ISODate; validityDays: number },
): KpSnapshot {
  const rows = approvedKpRows(base.rows, lines);
  const totals = computeKpTotals(
    rows.map((r) => r.sum),
    base.totals.vatMode,
    base.totals.vatRatePct,
  );
  return {
    ...base,
    kpNumber: init.kpNumber,
    numberLabel: kpNumberLabel(init.kpNumber, base.requestNumber),
    final: true,
    date: init.date,
    dateLabel: formatDateLong(init.date),
    rows,
    totals,
    amountInWords: amountInWordsUah(totals.payable),
    validUntil: init.validityDays > 0 ? addDaysIso(init.date, init.validityDays) : null,
  };
}

/** КП-основа для погодження — останнє звичайне (не фінальне) КП. */
export function latestBaseKp<T extends Pick<KpDocumentDto, 'onlyApproved' | 'version'>>(kps: readonly T[] | null | undefined): T | null {
  // номер КП у всіх версій заявки однаковий («2114 / 000008») — найновішу визначає номер версії
  let best: T | null = null;
  for (const k of kps ?? []) if (!k.onlyApproved && (!best || k.version > best.version)) best = k;
  return best;
}

/** Перевірка перед формуванням КП (активні рядки заявки). */
export interface KpChecks {
  /** Рядків, що підуть у КП. */
  inKp: number;
  /** Не підібрано — у КП не увійдуть. */
  notPicked: number;
  /** Товар підібрано, а кількість 0 — КП не формується (ТЗ: к-сть більше 0). */
  zeroQty: number;
  /** Ідуть з мінімальною ціною без ✔. */
  notApproved: number;
  /** Пропозиція є, а ціни продажу немає (напр., «по РРЦ» без РРЦ) — КП не формується (НАЦ-4). */
  noPrice: number;
  /** Ціна продажу 0 або менше (напр., знижка 100 %) — КП не формується. */
  nonPositive: number;
  /** Продаж нижче входу. */
  belowCost: number;
}

export function kpChecks(lines: readonly RequestLine[], computed: Pick<RequestComputed, 'markup'>): KpChecks {
  const c: KpChecks = { inKp: 0, notPicked: 0, zeroQty: 0, notApproved: 0, noPrice: 0, nonPositive: 0, belowCost: 0 };
  for (const line of lines) {
    if (!isActiveLine(line)) continue;
    const mr = computed.markup.rows[line.id];
    if (!mr?.effectiveOfferId) c.notPicked++;
    else if (line.qty <= 0) c.zeroQty++;
    else if (mr.saleNet == null) c.noPrice++;
    else if (mr.saleNet <= 0) c.nonPositive++;
    else {
      c.inKp++;
      if (mr.notApproved) c.notApproved++;
      if (mr.warnings.some((w) => w.code === 'BELOW_COST')) c.belowCost++;
    }
  }
  return c;
}

/** Чому КП не можна сформувати; null — можна. Рядки без підбору лише попереджають (у КП не увійдуть). */
export function kpBlockReason(c: KpChecks): string | null {
  if (c.zeroQty) return `Кількість 0: ${c.zeroQty} поз. Вкажіть кількість або видаліть рядок`;
  if (c.noPrice) return `Без ціни продажу: ${c.noPrice} поз. Задайте спосіб націнки або ціну вручну на вкладці «Націнка»`;
  if (c.nonPositive) return `Ціна продажу 0 або менше: ${c.nonPositive} поз. Змініть націнку чи знижку на вкладці «Націнка»`;
  if (!c.inKp) return 'Немає позицій з ціною продажу: підберіть товари й задайте націнку';
  return null;
}

/** КП-основа для погодження: обрана в заявці (звичайна версія) або остання звичайна. */
export function approvalBaseKp<T extends Pick<KpDocumentDto, 'id' | 'onlyApproved' | 'version'>>(
  kps: readonly T[] | null | undefined,
  approvalKpId: UUID | null | undefined,
): T | null {
  const chosen = approvalKpId ? kps?.find((k) => k.id === approvalKpId && !k.onlyApproved) : undefined;
  return chosen ?? latestBaseKp(kps);
}

/** Погоджена сума (Ф18) за цінами КП-основи; null — нічого не погоджено. */
export function approvedTotalsFromKp(
  base: Pick<KpSnapshot, 'rows' | 'totals'>,
  lines: readonly Pick<RequestLine, 'id' | 'approval'>[],
): { rows: KpRow[]; totalGross: number; totalNet: number; vat: number } | null {
  const rows = approvedKpRows(base.rows, lines);
  if (!rows.length) return null;
  const t = computeKpTotals(
    rows.map((r) => r.sum),
    base.totals.vatMode,
    base.totals.vatRatePct,
  );
  return { rows, totalGross: t.totalGross, totalNet: t.totalNet, vat: t.vat };
}
