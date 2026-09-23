import { normalizeUnit } from '../parse/unit';
import type {
  Offer,
  OfferComputedBase,
  PricingContext,
  RequestHeader,
  RequestLine,
  SupplierBlock,
  Warning,
} from '../types';
import { round2 } from './money';
import { checkMultiplicity, offerMultiplicity } from './multiplicity';
import { resolveRate } from './rates';
import { isPriceStale, priceAgeDays } from './staleness';
import { checkStock } from './stock';
import { vatFactor } from './vat';

/** F22: знімок у пропозиції розходиться з каталогом. */
export function isCatalogChanged(offer: Offer): boolean {
  const c = offer.catalog;
  if (!c) return false;
  return c.currency !== offer.currency || c.purchasePrice !== offer.purchasePriceCur || c.rrp !== offer.rrpCur;
}

/** Порівняння одиниць після нормалізації (невідомі — за текстом). */
function unitsDiffer(offerUnit: string | null, clientUnit: string | null): boolean {
  if (!offerUnit || !clientUnit || clientUnit.trim() === '') return false;
  const a = normalizeUnit(offerUnit) ?? offerUnit.trim().toLocaleLowerCase('uk');
  const b = normalizeUnit(clientUnit) ?? clientUnit.trim().toLocaleLowerCase('uk');
  return a !== b;
}

/** F1–F8, F19–F23: розрахунок однієї пропозиції без порівняння з іншими блоками. */
export function computeOfferBase(
  offer: Offer,
  line: RequestLine,
  block: SupplierBlock,
  header: RequestHeader,
  ctx: PricingContext,
): OfferComputedBase {
  const k = vatFactor(header.vatRatePct);
  const ref = { offerId: offer.id, lineId: line.id, blockId: block.id };
  const warnings: Warning[] = [];

  const rate = resolveRate(offer.currency, block.rates, header.rates); // F1
  const qtyEffective = offer.qty ?? line.qty; // F5

  let unitNetUah: number | null = null;
  let unitGrossUah: number | null = null;
  let sumNetUah: number | null = null;
  let sumGrossUah: number | null = null;
  let rrpGrossUah: number | null = null;
  let rrpNetUah: number | null = null;

  if (rate == null) {
    if (offer.purchasePriceCur != null || offer.rrpCur != null) {
      warnings.push({ ...ref, code: 'RATE_MISSING', severity: 'error', params: { currency: offer.currency } });
    }
  } else {
    // ТЗ §5.1: ціна в грн — до копійок одразу після перерахунку з валюти; суми — від округлених цін
    if (offer.purchasePriceCur != null) {
      const netExact = offer.purchasePriceCur * rate * (1 + block.supplierMarkupPct / 100);
      unitNetUah = round2(netExact); // Ф3
      // Ф4: з ПДВ — від точної ціни, а не від уже округленої: так вона збігається з ціною з ПДВ у каталозі
      // (у каталозі 100,05 з ПДВ зберігається як 83,375 без ПДВ; від округлених 83,38 вийшло б 100,06)
      unitGrossUah = round2(netExact * k);
      sumNetUah = round2(unitNetUah * qtyEffective);
      sumGrossUah = round2(unitGrossUah * qtyEffective); // Ф6
    }
    if (offer.rrpCur != null) {
      rrpGrossUah = round2(offer.rrpCur * rate); // Ф7: націнка постачальника на РРЦ не діє
      rrpNetUah = round2(rrpGrossUah / k);
    }
  }

  const isFilled = unitNetUah != null && unitNetUah > 0; // F8
  if (!isFilled && rate != null && (offer.productId != null || offer.sku != null)) {
    warnings.push({ ...ref, code: 'PRICE_MISSING', severity: 'warning' });
  }

  // F19: кратність (у пропозиції її можна вимкнути — тоді к-сть не округлюється і не попереджає)
  const mult = offerMultiplicity(offer);
  const multiplicity = checkMultiplicity(qtyEffective, mult);
  if (!multiplicity.isMultiple) {
    warnings.push({
      ...ref,
      code: 'MULTIPLICITY_MISMATCH',
      severity: 'warning',
      params: { qty: qtyEffective, multiplicity: mult ?? 1, suggestedQty: multiplicity.suggestedQty },
    });
  }
  if (offer.qty != null && offer.qty > line.qty) {
    const lineCheck = checkMultiplicity(line.qty, mult);
    if (!lineCheck.isMultiple && multiplicity.isMultiple) {
      warnings.push({
        ...ref,
        code: 'QTY_ROUNDED',
        severity: 'info',
        params: { from: line.qty, to: offer.qty, multiplicity: mult ?? 1 },
      });
    }
  }

  // F20: наявність
  const stock = checkStock(qtyEffective, offer.stockQty, offer.availability);
  if (isFilled && stock.outOfStock) {
    warnings.push({ ...ref, code: 'OUT_OF_STOCK', severity: 'warning' });
  } else if (isFilled && stock.insufficient) {
    warnings.push({ ...ref, code: 'INSUFFICIENT_STOCK', severity: 'warning', params: { qty: qtyEffective, stock: offer.stockQty } });
  }

  // F21: застарілість
  const supplier = block.supplierId ? ctx.suppliers[block.supplierId] : undefined;
  const staleDays = supplier?.priceStaleDays ?? ctx.settings.priceStaleDays;
  const ageDays = priceAgeDays(offer.priceDate, ctx.now);
  const isStale = isPriceStale(ageDays, staleDays);
  if (isFilled && isStale) {
    warnings.push({ ...ref, code: 'PRICE_STALE', severity: 'warning', params: { ageDays, staleDays } });
  }

  // F22: зміна в каталозі
  const catalogChanged = isCatalogChanged(offer);
  if (catalogChanged && offer.catalog) {
    warnings.push({
      ...ref,
      code: 'CATALOG_PRICE_CHANGED',
      severity: 'info',
      params: {
        catalogPrice: offer.catalog.purchasePrice,
        snapshotPrice: offer.purchasePriceCur,
        catalogCurrency: offer.catalog.currency,
      },
    });
  }

  // F23: вхід вище РРЦ
  if (unitNetUah != null && rrpNetUah != null && unitNetUah > rrpNetUah) {
    warnings.push({ ...ref, code: 'INPUT_ABOVE_RRP', severity: 'warning', params: { unitNetUah, rrpNetUah } });
  }

  if (unitsDiffer(offer.unitCode, line.clientUnit)) {
    warnings.push({
      ...ref,
      code: 'UNIT_MISMATCH',
      severity: 'warning',
      params: { offerUnit: offer.unitCode, clientUnit: line.clientUnit },
    });
  }

  return {
    ...ref,
    rate,
    qtyEffective,
    unitNetUah,
    unitGrossUah,
    sumNetUah,
    sumGrossUah,
    rrpGrossUah,
    rrpNetUah,
    isFilled,
    isExcluded: offer.excluded,
    multiplicity,
    stock,
    stale: { isStale, ageDays },
    catalogChanged,
    warnings,
  };
}
