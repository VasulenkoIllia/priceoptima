// Рядок налаштувань у базі ↔ тип AppSettings. Перелічення в базі — рядки,
// тож при читанні звіряємо їх зі списками з shared і, якщо в базі щось стороннє, беремо значення за замовчуванням.
import type { AppSettings as AppSettingsRow, Prisma } from '@prisma/client';
import {
  DISCOUNT_FORMULAS,
  FOP_PRICE_BASES,
  KP_NAME_SOURCES,
  KP_VAT_MODES,
  MARKUP_METHODS,
  PRICE_ROUNDINGS,
} from '@shared/enums';
import { DEFAULT_APP_SETTINGS, DEFAULT_KP_TERMS } from '@shared/pricing';
import type { AppSettings, KpTerm } from '@shared/types';

/** Єдиний рядок налаштувань. */
export const SETTINGS_ID = 1;

function oneOf<T extends string>(allowed: readonly T[], value: string, fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function num(value: Prisma.Decimal): number {
  return value.toNumber();
}

/** Умови КП з JSON у базі; не список — вбудовані типові, сторонні елементи пропускаємо. */
function kpTermsOf(value: Prisma.JsonValue | null): KpTerm[] {
  if (!Array.isArray(value)) return DEFAULT_KP_TERMS.map((t) => ({ ...t }));
  return value.flatMap((t) =>
    t && typeof t === 'object' && !Array.isArray(t) && typeof t.label === 'string' && typeof t.value === 'string'
      ? [{ label: t.label, value: t.value }]
      : [],
  );
}

export function toAppSettings(row: AppSettingsRow): AppSettings {
  return {
    vatRatePct: num(row.vatRatePct),
    priceStaleDays: row.priceStaleDays,
    lockTtlSeconds: row.lockTtlSeconds,
    lockHeartbeatSeconds: row.lockHeartbeatSeconds,
    autosaveDebounceMs: row.autosaveDebounceMs,
    defaultMarkupMethod: oneOf(MARKUP_METHODS, row.defaultMarkupMethod, DEFAULT_APP_SETTINGS.defaultMarkupMethod),
    defaultMarkupValue: num(row.defaultMarkupValue),
    priceRounding: oneOf(PRICE_ROUNDINGS, row.priceRounding, DEFAULT_APP_SETTINGS.priceRounding),
    discountFormula: oneOf(DISCOUNT_FORMULAS, row.discountFormula, DEFAULT_APP_SETTINGS.discountFormula),
    autoRoundMultiplicity: row.autoRoundMultiplicity,
    excludeUnavailableByDefault: row.excludeUnavailableByDefault,
    kpDefaultVatMode: oneOf(KP_VAT_MODES, row.kpDefaultVatMode, DEFAULT_APP_SETTINGS.kpDefaultVatMode),
    kpNameSource: oneOf(KP_NAME_SOURCES, row.kpNameSource, DEFAULT_APP_SETTINGS.kpNameSource),
    kpShowImages: row.kpShowImages,
    kpValidityDays: row.kpValidityDays,
    kpTerms: kpTermsOf(row.kpTerms),
    fopPriceBasis: oneOf(FOP_PRICE_BASES, row.fopPriceBasis, DEFAULT_APP_SETTINGS.fopPriceBasis),
    nextRequestNumber: row.nextRequestNumber,
    nextKpNumber: row.nextKpNumber,
  };
}

/** Значення для запису в базу (використовує й сід, і оновлення налаштувань). */
export function toSettingsRow(settings: AppSettings) {
  return {
    vatRatePct: settings.vatRatePct,
    priceStaleDays: settings.priceStaleDays,
    lockTtlSeconds: settings.lockTtlSeconds,
    lockHeartbeatSeconds: settings.lockHeartbeatSeconds,
    autosaveDebounceMs: settings.autosaveDebounceMs,
    defaultMarkupMethod: settings.defaultMarkupMethod,
    defaultMarkupValue: settings.defaultMarkupValue,
    priceRounding: settings.priceRounding,
    discountFormula: settings.discountFormula,
    autoRoundMultiplicity: settings.autoRoundMultiplicity,
    excludeUnavailableByDefault: settings.excludeUnavailableByDefault,
    kpDefaultVatMode: settings.kpDefaultVatMode,
    kpNameSource: settings.kpNameSource,
    kpShowImages: settings.kpShowImages,
    kpValidityDays: settings.kpValidityDays,
    kpTerms: settings.kpTerms.map((t) => ({ label: t.label, value: t.value })),
    fopPriceBasis: settings.fopPriceBasis,
    nextRequestNumber: settings.nextRequestNumber,
    nextKpNumber: settings.nextKpNumber,
  };
}
