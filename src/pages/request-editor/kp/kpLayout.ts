// Спільна розкладка бланка КП для перегляду, PDF і Excel: заголовок, сторони, підсумки — з одного знімка.
import { formatDate, formatMoney, formatPct, formatRequestNumber } from '@shared/format';
import type { KpSnapshot, KpTerm } from '@shared/types';

export interface KpTotalLine {
  label: string;
  value: number;
  strong?: boolean;
}

export interface KpPartyRow {
  label: string;
  title?: string;
  lines: string[];
}

export function kpTitle(s: KpSnapshot): string {
  return `Комерційна пропозиція № ${s.numberLabel} від ${s.dateLabel}`;
}

/** Контакти в шапці бланка: 'тел. 044 000 00 00 · sales@… · сайт'. */
export function kpContactsLine(s: KpSnapshot): string {
  return [s.header.phone ? `тел. ${s.header.phone}` : null, s.header.email, s.header.website].filter(Boolean).join(' · ');
}

/** Постачальник, покупець, контакт, e-mail, телефон, дод. інф. — порожні не друкуються (КП-1). */
export function kpPartyRows(s: KpSnapshot): KpPartyRow[] {
  const rows: KpPartyRow[] = [
    { label: 'Постачальник:', title: s.seller.title, lines: s.seller.lines },
    { label: 'Покупець:', title: s.buyer.title, lines: s.buyer.lines },
  ];
  if (s.buyer.contactName) rows.push({ label: 'Контактна особа:', lines: [s.buyer.contactName] });
  if (s.buyer.email) rows.push({ label: 'E-mail:', lines: [s.buyer.email] });
  if (s.buyer.phone) rows.push({ label: 'Тел.:', lines: [s.buyer.phone] });
  if (s.extraInfo) rows.push({ label: 'Дод. інф.:', lines: [s.extraInfo] });
  return rows;
}

/** Підсумки за режимом ПДВ (КП-2): ТОВ без ПДВ / ТОВ з ПДВ («у т.ч.») / ФОП. */
export function kpTotalLines(s: KpSnapshot): KpTotalLine[] {
  const t = s.totals;
  const vat = `ПДВ ${formatPct(t.vatRatePct, 0)}`;
  if (t.vatMode === 'without_vat') {
    return [
      { label: 'Разом без ПДВ:', value: t.totalNet },
      { label: `${vat}:`, value: t.vat },
      { label: 'Всього з ПДВ:', value: t.totalGross, strong: true },
    ];
  }
  if (t.vatMode === 'with_vat') {
    return [
      { label: 'Разом з ПДВ:', value: t.totalGross, strong: true },
      { label: `у т.ч. ${vat}:`, value: t.vat },
    ];
  }
  return [{ label: 'Разом (без ПДВ):', value: t.totalNet, strong: true }];
}

/** 'Всього на суму: … гривень 00 копійок, у т.ч. ПДВ 5 156,00 грн.' */
export function kpAmountLine(s: KpSnapshot): string {
  const t = s.totals;
  const vat = t.vatMode === 'no_vat' ? 'без ПДВ' : `у т.ч. ПДВ ${formatMoney(t.vat)} грн`;
  return `Всього на суму: ${s.amountInWords}, ${vat}.`;
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
