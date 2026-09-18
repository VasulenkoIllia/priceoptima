// Короткі довідки для документа заявки (refs) і дефолтний вибір контрагента й контакту — однаково для сервера й форм.
import type { ClientDetail, ContactDto, ContactRef, CounterpartyDto, CounterpartyRef, SupplierRef, UUID } from '../types';

/** Лише поля SupplierRef (для refs документа й розрахунку) з ширшого DTO постачальника. */
export function toSupplierRef(s: SupplierRef): SupplierRef {
  return {
    id: s.id,
    name: s.name,
    logoUrl: s.logoUrl,
    color: s.color,
    defaultCurrency: s.defaultCurrency,
    pricesIncludeVat: s.pricesIncludeVat,
    supplierMarkupPct: s.supplierMarkupPct,
    ratePolicy: s.ratePolicy,
    rateAdjustPct: s.rateAdjustPct,
    manualRateUsd: s.manualRateUsd,
    manualRateEur: s.manualRateEur,
    priceListRates: { ...s.priceListRates },
    minOrderAmount: s.minOrderAmount,
    priceStaleDays: s.priceStaleDays,
    searchUrlTemplate: s.searchUrlTemplate,
    website: s.website,
    b2bUrl: s.b2bUrl,
  };
}

export function counterpartyRef(cp: CounterpartyDto): CounterpartyRef {
  return { id: cp.id, nameShort: cp.nameShort, nameFull: cp.nameFull, edrpou: cp.edrpou, isVatPayer: cp.isVatPayer };
}

export function contactRef(c: ContactDto): ContactRef {
  return { id: c.id, fullName: c.fullName, phone: c.phone, email: c.email, position: c.position };
}

/** Контрагент за замовчуванням: позначений основним або перший. */
export function defaultCounterparty(c: ClientDetail | undefined): CounterpartyDto | undefined {
  return c?.counterparties.find((x) => x.isDefault && x.isActive) ?? c?.counterparties.find((x) => x.isActive);
}

/** Контакти контрагента (і загальні контакти клієнта без контрагента). */
export function contactsFor(c: ClientDetail | undefined, counterpartyId: UUID | null | undefined): ContactDto[] {
  return c?.contacts.filter((x) => x.isActive && (!counterpartyId || x.counterpartyId === counterpartyId || x.counterpartyId == null)) ?? [];
}

export function defaultContact(c: ClientDetail | undefined, counterpartyId: UUID | null | undefined): ContactDto | undefined {
  const list = contactsFor(c, counterpartyId);
  return list.find((x) => x.isPrimary) ?? list[0];
}
