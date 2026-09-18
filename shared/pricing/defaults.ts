import type {
  AppSettings,
  KpSettings,
  KpTerm,
  MarkupSettings,
  PricingSettings,
  RequestLine,
  UUID,
} from '../types';
import { defaultKpVatMode } from './kp-totals';

/** Типові умови КП (п.3 правок) — значення задаються в Налаштуваннях під свою компанію. */
export const DEFAULT_KP_TERMS: readonly KpTerm[] = [
  { label: 'Умови поставки', value: 'За домовленістю' },
  { label: 'Термін поставки', value: 'За домовленістю' },
  { label: 'Умови оплати', value: 'За домовленістю' },
  { label: 'Гарантійний термін', value: 'Згідно з гарантією виробника' },
];

/** Скільки умов можна задати (у Налаштуваннях і в КП). */
export const KP_TERMS_MAX = 12;

/** Умови без порожніх (без назви або значення — не друкуються). */
export function cleanKpTerms(terms: readonly KpTerm[] | null | undefined): KpTerm[] {
  return (terms ?? []).map((t) => ({ label: t.label.trim(), value: t.value.trim() })).filter((t) => t.label && t.value);
}

/** Умови для КП: свої в заявці, інакше типові з Налаштувань (у старих налаштуваннях їх немає — вбудовані). */
export function resolveKpTerms(own: readonly KpTerm[] | null | undefined, defaults: readonly KpTerm[] | null | undefined): KpTerm[] {
  return cleanKpTerms(own ?? defaults ?? DEFAULT_KP_TERMS);
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  vatRatePct: 20,
  priceStaleDays: 7,
  lockTtlSeconds: 30,
  lockHeartbeatSeconds: 10,
  autosaveDebounceMs: 800,
  defaultMarkupMethod: 'rrp',
  defaultMarkupValue: 0,
  priceRounding: 'kopecks',
  discountFormula: 'percent_off',
  autoRoundMultiplicity: true,
  excludeUnavailableByDefault: false,
  kpDefaultVatMode: 'without_vat',
  kpNameSource: 'work',
  kpShowImages: false,
  kpValidityDays: 3,
  kpTerms: DEFAULT_KP_TERMS.map((t) => ({ ...t })),
  // КП від ФОП — на рівні цін з ПДВ (як у ТОВ), без виділення ПДВ (п.6 правок клієнта)
  fopPriceBasis: 'gross',
  importMissingPolicy: 'keep',
  nextRequestNumber: 1,
  nextKpNumber: 2114,
};

export function pricingSettingsFrom(s: AppSettings): PricingSettings {
  return {
    vatRatePct: s.vatRatePct,
    priceStaleDays: s.priceStaleDays,
    discountFormula: s.discountFormula,
    autoRoundMultiplicity: s.autoRoundMultiplicity,
    fopPriceBasis: s.fopPriceBasis,
  };
}

export function defaultMarkupSettings(s: AppSettings): MarkupSettings {
  return {
    method: s.defaultMarkupMethod,
    value: s.defaultMarkupValue,
    rounding: s.priceRounding,
    excludeUnavailable: s.excludeUnavailableByDefault,
  };
}

export function defaultKpSettings(s: AppSettings, ownCompany: { id: UUID; isVatPayer: boolean }): KpSettings {
  return {
    ownCompanyId: ownCompany.id,
    vatMode: defaultKpVatMode(ownCompany.isVatPayer, s.kpDefaultVatMode),
    nameSource: s.kpNameSource,
    showSku: true,
    showImages: s.kpShowImages,
    validityDays: s.kpValidityDays,
    extraInfo: null,
    onlyApproved: false,
  };
}

/** Новий рядок заявки без вибору, націнки й погодження. */
export function createRequestLine(init: {
  id: UUID;
  position: number;
  clientName?: string;
  clientUnit?: string | null;
  qty?: number;
  clientNote?: string | null;
}): RequestLine {
  return {
    id: init.id,
    position: init.position,
    clientName: init.clientName ?? '',
    clientUnit: init.clientUnit ?? null,
    qty: init.qty ?? 0,
    clientNote: init.clientNote ?? null,
    selection: { blockId: null },
    markup: { method: null, value: null, manualPriceNet: null },
    approval: { approved: false, approvedQty: null },
    kpName: null,
  };
}
