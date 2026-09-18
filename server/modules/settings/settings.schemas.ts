// Перевірка змін налаштувань. Невідомі поля відкидаємо мовчки, решту звіряємо з межами.
import { z } from 'zod';
import {
  DISCOUNT_FORMULAS,
  FOP_PRICE_BASES,
  IMPORT_MISSING_POLICIES,
  KP_NAME_SOURCES,
  KP_VAT_MODES,
  MARKUP_METHODS,
  PRICE_ROUNDINGS,
} from '@shared/enums';

function enumOf<T extends readonly [string, ...string[]]>(values: T, label: string) {
  return z.enum(values, { message: `Невідоме значення: ${label}` });
}

const int = (min: number, max: number, label: string) =>
  z.number({ message: `${label}: вкажіть число` }).int(`${label}: вкажіть ціле число`).min(min, `${label}: не менше ${min}`).max(max, `${label}: не більше ${max}`);

export const settingsPatchSchema = z
  .object({
    vatRatePct: z.number({ message: 'Ставка ПДВ: вкажіть число' }).min(0, 'Ставка ПДВ: не менше 0').max(100, 'Ставка ПДВ: не більше 100'),
    priceStaleDays: int(1, 365, 'Актуальність ціни, днів'),
    lockTtlSeconds: int(10, 3600, 'Строк блокування, с'),
    lockHeartbeatSeconds: int(1, 600, 'Період підтвердження блокування, с'),
    autosaveDebounceMs: int(100, 60_000, 'Затримка автозбереження, мс'),
    defaultMarkupMethod: enumOf(MARKUP_METHODS, 'спосіб націнки'),
    defaultMarkupValue: z.number({ message: 'Націнка: вкажіть число' }).min(-100, 'Націнка: не менше −100').max(1000, 'Націнка: не більше 1000'),
    priceRounding: enumOf(PRICE_ROUNDINGS, 'округлення ціни'),
    discountFormula: enumOf(DISCOUNT_FORMULAS, 'формула знижки'),
    autoRoundMultiplicity: z.boolean(),
    excludeUnavailableByDefault: z.boolean(),
    kpDefaultVatMode: enumOf(KP_VAT_MODES, 'режим ПДВ у КП'),
    kpNameSource: enumOf(KP_NAME_SOURCES, 'назва в КП'),
    kpShowImages: z.boolean(),
    kpValidityDays: int(1, 365, 'Строк дії КП, днів'),
    fopPriceBasis: enumOf(FOP_PRICE_BASES, 'база ціни ФОП'),
    importMissingPolicy: enumOf(IMPORT_MISSING_POLICIES, 'позиції, яких немає у прайсі'),
    nextRequestNumber: int(1, 9_999_999, 'Наступний номер заявки'),
    /** Стала частина номера КП: «2114 / номер заявки». */
    nextKpNumber: int(1, 9_999_999, 'Номер КП'),
  })
  .partial();

export type SettingsPatchInput = z.infer<typeof settingsPatchSchema>;
