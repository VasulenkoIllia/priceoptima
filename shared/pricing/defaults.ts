import type {
  AppSettings,
  KpSettings,
  MarkupSettings,
  PricingSettings,
  RequestLine,
  UUID,
} from '../types';
import { defaultKpVatMode } from './kp-totals';

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
  fopPriceBasis: 'net',
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
