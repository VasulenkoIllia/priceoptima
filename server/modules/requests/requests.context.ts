// Що потрібно заявці з довідників: налаштування й постачальники для розрахунку, курси на дату, поточний стан товарів.
import type { Product } from '@prisma/client';
import { AVAILABILITY_STATUSES, CURRENCY_CODES } from '@shared/enums';
import { pricingSettingsFrom, type ProductForOffer } from '@shared/pricing';
import { toSupplierRef } from '@shared/requests';
import type { AppSettings, HeaderRates, ISODate, PricingContext, SupplierRef, UUID } from '@shared/types';
import { prisma } from '../../db';
import { numOrNull, num, oneOf } from '../../lib/mapping';
import { getEffectiveRates } from '../rates/rates.service';
import { getSettings } from '../settings/settings.service';
import { listSuppliers } from '../suppliers/suppliers.service';

export interface PricingEnv {
  settings: AppSettings;
  suppliers: Record<UUID, SupplierRef>;
  ctx: PricingContext;
}

export async function pricingEnv(now = new Date()): Promise<PricingEnv> {
  const [settings, list] = await Promise.all([getSettings(), listSuppliers()]);
  const suppliers = Object.fromEntries(list.map((s) => [s.id, toSupplierRef(s)]));
  return { settings, suppliers, ctx: { now, settings: pricingSettingsFrom(settings), suppliers } };
}

/** Курси шапки заявки на дату: ручний загальний курс, якщо задано, інакше НБУ (останній відомий). */
export async function headerRatesOn(date: ISODate): Promise<HeaderRates> {
  const eff = await getEffectiveRates(date);
  return { USD: eff.USD?.rate ?? null, EUR: eff.EUR?.rate ?? null, date };
}

export function toProductForOffer(p: Product): ProductForOffer {
  return {
    id: p.id,
    sku: p.sku,
    nameWork: p.nameWork,
    name1c: p.name1c,
    unitCode: p.unitCode,
    currency: oneOf(CURRENCY_CODES, p.currency, 'UAH'),
    purchasePrice: numOrNull(p.purchasePrice),
    rrp: numOrNull(p.rrp),
    multiplicity: num(p.multiplicity),
    stockQty: numOrNull(p.stockQty),
    availability: oneOf(AVAILABILITY_STATUSES, p.availability, 'unknown'),
    priceUpdatedAt: p.priceUpdatedAt ? p.priceUpdatedAt.toISOString() : null,
    isArchived: p.isArchived,
  };
}

/** Поточний стан товарів каталогу за id (для «ціна в каталозі змінилась», копії з перерахунком і назви 1С у КП). */
export async function productsByIds(ids: readonly (string | null | undefined)[]): Promise<Map<UUID, ProductForOffer>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map();
  const rows = await prisma.product.findMany({ where: { id: { in: unique } } });
  return new Map(rows.map((p) => [p.id, toProductForOffer(p)]));
}
