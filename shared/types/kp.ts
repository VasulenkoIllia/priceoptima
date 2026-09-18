import type { KpNameSource, KpVatMode } from '../enums';
import type { ISODate, ISODateTime, UUID, UserRef } from './common';

/** Умова в КП «назва: значення» (п.3 правок): Умови поставки, Термін поставки, Умови оплати, Гарантійний термін або своя. */
export interface KpTerm {
  label: string;
  value: string;
}

export interface KpSettings {
  /** d: requests.ownCompanyId */
  ownCompanyId?: UUID;
  /** d: наша юрособа платник ПДВ ? settings.kpDefaultVatMode : 'no_vat' */
  vatMode: KpVatMode;
  /** d: 'work' */
  nameSource: KpNameSource;
  /** Колонка «Код» = артикул постачальника — завжди показується. */
  showSku: true;
  /** Колонка «Зображення». */
  showImages: boolean;
  validityDays: number;
  /** «Дод. інф.» */
  extraInfo: string | null;
  /** КП лише з погоджених рядків і погоджених к-стей (фінальне КП). */
  onlyApproved: boolean;
  /** Умови для цього клієнта; null або немає — типові з Налаштувань. */
  terms?: KpTerm[] | null;
}

export interface KpPartyBlock {
  /** 'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "…"' */
  title: string;
  /** Реквізити. */
  lines: string[];
}

export interface KpRow {
  n: number;
  lineId: UUID;
  /** Артикул постачальника. */
  code: string | null;
  imagePath: string | null;
  name: string;
  /** Клієнтська назва дрібним під основною (nameSource 'work_with_client'). */
  nameSecondary: string | null;
  unit: string;
  qty: number;
  price: number;
  sum: number;
}

export interface KpTotals {
  vatMode: KpVatMode;
  vatRatePct: number;
  totalNet: number;
  vat: number;
  totalGross: number;
  payable: number;
}

export interface KpSnapshot {
  /** null — попередній перегляд (номер не витрачається). */
  kpNumber: number | null;
  requestNumber: number;
  /** '2114 / 000001' */
  numberLabel: string;
  /** Фінальне КП: лише погоджені позиції з погодженими к-стями. */
  final: boolean;
  date: ISODate;
  /** '18 серпня 2026 р.' */
  dateLabel: string;
  header: { slogan: string | null; phone: string | null; email: string | null; website: string | null; logoPath: string | null };
  seller: KpPartyBlock;
  buyer: KpPartyBlock & { contactName: string | null; email: string | null; phone: string | null };
  extraInfo: string | null;
  columns: { showSku: true; showImages: boolean; priceHeader: string; sumHeader: string };
  rows: KpRow[];
  totals: KpTotals;
  amountInWords: string;
  managerName: string;
  validUntil: ISODate | null;
  footer: string | null;
  /** Умови внизу КП (порожні не друкуються); у старих знімках немає. */
  terms?: KpTerm[];
}

export interface KpDocumentDto {
  id: UUID;
  requestId: UUID;
  kpNumber: number;
  numberLabel: string;
  version: number;
  vatMode: KpVatMode;
  ownCompanyId: UUID;
  onlyApproved: boolean;
  /** Налаштування, з якими сформовано (для «Сформувати на основі цієї»). */
  settings: KpSettings;
  totalNet: number;
  totalVat: number;
  totalGross: number;
  snapshot: KpSnapshot;
  sentAt: ISODateTime | null;
  createdAt: ISODateTime;
  createdBy: UserRef | null;
}

export interface KpCreateBody {
  settings: KpSettings;
  /** Фінальне КП: погоджені рядки останнього звичайного КП (ціни й режим — з нього). */
  final?: boolean;
  sessionId: UUID;
}
