// Спільна розкладка бланка КП для перегляду, PDF і Excel: заголовок, сторони, підсумки — з одного знімка.
// Вигляд — як у бланку замовника (зразок 29.09): шапка в рамці, сторони, таблиця, підсумки в клітинках, примітка.
import { formatDate, formatMoney, formatRequestNumber } from '@shared/format';
import type { KpSnapshot, KpTerm } from '@shared/types';

export interface KpTotalLine {
  label: string;
  value: number;
}

export interface KpPartyRow {
  /** party — «Постачальник:» / «Покупець:» (назва великими літерами й реквізити); detail — контакт покупця, дод. інф. */
  kind: 'party' | 'detail';
  label: string;
  title?: string;
  lines: string[];
  /** Відступ перед рядком («Дод. інф.:», як у бланку). */
  gap?: boolean;
}

export interface KpContact {
  kind: 'phone' | 'email' | 'site';
  text: string;
}

/** Підпис унизу КП; підпис і печатку ставлять на роздрукованому. */
export const KP_SIGN_LABEL = 'Виписав(ла):';

export function kpTitle(s: KpSnapshot): string {
  return `Комерційна пропозиція № ${s.numberLabel} від ${s.dateLabel}`;
}

/** Контакти в шапці бланка (телефон, e-mail, сайт) — з позначками в перегляді й PDF. */
export function kpContacts(s: KpSnapshot): KpContact[] {
  const all: Array<[KpContact['kind'], string | null]> = [
    ['phone', s.header.phone],
    ['email', s.header.email],
    ['site', s.header.website],
  ];
  return all.flatMap(([kind, raw]) => {
    // сайт у бланку без «https://» і кінцевої «/», як у бланку замовника (у картці він зберігається посиланням)
    const text = kind === 'site' ? raw?.trim().replace(/^https?:\/\//iu, '').replace(/\/$/u, '') : raw?.trim();
    return text ? [{ kind, text }] : [];
  });
}

/** Є що показати в шапці в рамці (гасло, контакти, логотип); немає — рамки теж немає. */
export function kpHasHead(s: KpSnapshot, hasLogo: boolean): boolean {
  return !!s.header.slogan?.trim() || kpContacts(s).length > 0 || hasLogo;
}

/** Контакти одним рядком (Excel): 'тел. 044 000 00 00 · sales@… · сайт'. */
export function kpContactsLine(s: KpSnapshot): string {
  return kpContacts(s)
    .map((c) => (c.kind === 'phone' ? `тел. ${c.text}` : c.text))
    .join(' · ');
}

/** Заголовки колонок таблиці; «Ціна, грн. без ПДВ» — у два рядки, як у бланку замовника. */
export function kpTableHead(s: KpSnapshot): string[] {
  const twoLines = (h: string) => h.replace(/\. (без|з) ПДВ$/u, '.\n$1 ПДВ');
  return [
    '№',
    'Код',
    ...(s.columns.showImages ? ['Фото'] : []),
    'Товари (роботи, послуги)',
    'Од. виміру',
    'Кількість',
    twoLines(s.columns.priceHeader),
    twoLines(s.columns.sumHeader),
  ];
}

/** Назва сторони в бланку — великими літерами, як у бланку замовника. */
export function kpPartyTitle(title: string): string {
  return title.toLocaleUpperCase('uk-UA');
}

/** Постачальник, покупець, контакт, e-mail, телефон, дод. інф. — порожні не друкуються (КП-1). */
export function kpPartyRows(s: KpSnapshot): KpPartyRow[] {
  const rows: KpPartyRow[] = [
    { kind: 'party', label: 'Постачальник:', title: s.seller.title, lines: s.seller.lines },
    { kind: 'party', label: 'Покупець:', title: s.buyer.title, lines: s.buyer.lines },
  ];
  if (s.buyer.contactName) rows.push({ kind: 'detail', label: 'Контактна особа:', lines: [s.buyer.contactName] });
  if (s.buyer.email) rows.push({ kind: 'detail', label: 'E-mail:', lines: [s.buyer.email] });
  if (s.buyer.phone) rows.push({ kind: 'detail', label: 'Тел.:', lines: [s.buyer.phone] });
  if (s.extraInfo) rows.push({ kind: 'detail', label: 'Дод. інф.:', lines: [s.extraInfo], gap: true });
  return rows;
}

/** Підсумки за режимом ПДВ (КП-2), підписи як у бланку: ТОВ без ПДВ / ТОВ з ПДВ («у т.ч.») / ФОП. */
export function kpTotalLines(s: KpSnapshot): KpTotalLine[] {
  const t = s.totals;
  if (t.vatMode === 'without_vat') {
    return [
      { label: 'Разом:', value: t.totalNet },
      { label: 'Сума ПДВ:', value: t.vat },
      { label: 'Всього із ПДВ:', value: t.totalGross },
    ];
  }
  if (t.vatMode === 'with_vat') {
    return [
      { label: 'Всього із ПДВ:', value: t.totalGross },
      { label: 'у т.ч. ПДВ:', value: t.vat },
    ];
  }
  return [{ label: 'Всього:', value: t.totalNet }];
}

/** 'Всього найменувань 2' */
export function kpCountLine(s: KpSnapshot): string {
  return `Всього найменувань ${s.rows.length}`;
}

/** 'На суму 2 808,48 грн (дві тисячі … 48 копійок), у т.ч. ПДВ 468,08 грн.' */
export function kpAmountLine(s: KpSnapshot): string {
  const t = s.totals;
  const vat = t.vatMode === 'no_vat' ? 'без ПДВ' : `у т.ч. ПДВ ${formatMoney(t.vat)} грн`;
  const words = s.amountInWords ? ` (${s.amountInWords.charAt(0).toLocaleLowerCase('uk-UA')}${s.amountInWords.slice(1)})` : '';
  return `На суму ${formatMoney(t.payable)} грн${words}, ${vat}.`;
}

/** Умови внизу КП (п.3 правок): «Умови поставки: …». У старих знімках їх немає. */
export function kpTermRows(s: KpSnapshot): KpTerm[] {
  return (s.terms ?? []).map((t) => ({ label: `${t.label}:`, value: t.value }));
}

export function kpValidLine(s: KpSnapshot): string | null {
  return s.validUntil ? `Пропозиція дійсна до ${formatDate(s.validUntil)}.` : null;
}

/** 'КП 2114-000001.pdf', друга версія — 'КП 2114-000001 (2).pdf'; фінальне — з позначкою (номер КП у всіх версій однаковий). */
export function kpFileName(s: KpSnapshot, ext: 'pdf' | 'xlsx', version?: number): string {
  const v = version && version > 1 ? ` (${version})` : '';
  return `КП ${s.kpNumber ?? 'чернетка'}-${formatRequestNumber(s.requestNumber)}${s.final ? ' фінальне' : ''}${v}.${ext}`;
}
