// Будівельники тестових документів (v = 20, rounding = 'kopecks', discountFormula = 'percent_off').
import type {
  MarkupSettings,
  Offer,
  PricingContext,
  PricingSettings,
  RequestHeader,
  RequestLine,
  SupplierBlock,
  SupplierRef,
} from '../../types';
import type { RequestDocInput } from '../request';

export const NOW = new Date('2026-09-11T09:00:00Z');

export const SETTINGS: PricingSettings = {
  vatRatePct: 20,
  priceStaleDays: 7,
  discountFormula: 'percent_off',
  autoRoundMultiplicity: true,
  fopPriceBasis: 'net',
};

export function makeSupplier(id: string, patch: Partial<SupplierRef> = {}): SupplierRef {
  return {
    id,
    name: `Постачальник ${id}`,
    logoUrl: null,
    color: null,
    defaultCurrency: 'UAH',
    pricesIncludeVat: false,
    supplierMarkupPct: 0,
    ratePolicy: 'price_list',
    rateAdjustPct: 0,
    manualRateUsd: null,
    manualRateEur: null,
    priceListRates: { USD: null, EUR: null, date: null },
    minOrderAmount: null,
    priceStaleDays: null,
    searchUrlTemplate: null,
    website: null,
    b2bUrl: null,
    ...patch,
  };
}

export function makeHeader(patch: Partial<RequestHeader> = {}): RequestHeader {
  return {
    number: 1,
    requestDate: '2026-09-11',
    status: 'in_progress',
    title: null,
    clientId: 'client-1',
    counterpartyId: null,
    contactId: null,
    ownCompanyId: 'own-1',
    managerId: 'user-1',
    notes: null,
    purchaseNote: null,
    rates: { USD: 45, EUR: 52.1, date: '2026-09-11' },
    vatRatePct: 20,
    discountFormula: 'percent_off',
    kpSettings: {
      vatMode: 'without_vat',
      nameSource: 'work',
      showSku: true,
      showImages: false,
      validityDays: 3,
      extraInfo: null,
      onlyApproved: false,
    },
    cancelReason: null,
    ...patch,
  };
}

export const MARKUP: MarkupSettings = { method: 'rrp', value: 0, rounding: 'kopecks', excludeUnavailable: false };

export function makeLine(id: string, qty: number, patch: Partial<RequestLine> = {}): RequestLine {
  return {
    id,
    position: 0,
    clientName: `Товар ${id}`,
    clientUnit: 'шт',
    qty,
    clientNote: null,
    selection: { blockId: null },
    markup: { method: null, value: null, manualPriceNet: null },
    approval: { approved: false, approvedQty: null },
    kpName: null,
    ...patch,
  };
}

export function makeBlock(id: string, position: number, patch: Partial<SupplierBlock> = {}): SupplierBlock {
  return {
    id,
    position,
    supplierId: id,
    legalEntityId: null,
    defaultCurrency: 'UAH',
    rates: { USD: null, EUR: null },
    rateSource: 'nbu',
    ratesDate: null,
    supplierMarkupPct: 0,
    pricesIncludeVat: false,
    note: null,
    ...patch,
  };
}

export function makeOffer(lineId: string, blockId: string, patch: Partial<Offer> = {}): Offer {
  return {
    id: `${lineId}:${blockId}`,
    lineId,
    blockId,
    productId: `p-${lineId}-${blockId}`,
    sku: `SKU-${lineId}-${blockId}`,
    nameWork: `Робоча ${lineId}`,
    name1c: `1С ${lineId}`,
    nameKind: 'work',
    unitCode: 'шт',
    currency: 'UAH',
    purchasePriceCur: null,
    rrpCur: null,
    qty: null,
    multiplicity: null,
    stockQty: null,
    availability: 'in_stock',
    priceDate: '2026-09-10T09:00:00Z',
    excluded: false,
    excludeReason: null,
    note: null,
    priceChange: null,
    ...patch,
  };
}

/** Пропозиція в грн з вхідною ціною без ПДВ. */
export function uah(lineId: string, blockId: string, price: number, patch: Partial<Offer> = {}): Offer {
  return makeOffer(lineId, blockId, { purchasePriceCur: price, ...patch });
}

export function makeDoc(parts: Partial<RequestDocInput> & Pick<RequestDocInput, 'lines' | 'blocks' | 'offers'>): RequestDocInput {
  return {
    header: parts.header ?? makeHeader(),
    markup: parts.markup ?? MARKUP,
    lines: parts.lines.map((l, i) => ({ ...l, position: l.position || i })),
    blocks: parts.blocks,
    offers: parts.offers,
  };
}

export function makeCtx(suppliers: SupplierRef[] = [], patch: Partial<PricingContext> = {}): PricingContext {
  return {
    now: NOW,
    settings: SETTINGS,
    suppliers: Object.fromEntries(suppliers.map((s) => [s.id, s])),
    ...patch,
  };
}
