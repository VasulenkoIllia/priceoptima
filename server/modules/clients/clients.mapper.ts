// Клієнт із бази → типи фронта. Клієнт — це «дах» (наприклад, «АВТОСТРАДА»),
// під яким лежать юрособи-контрагенти й контакти.
import type { Client, ClientContact, Counterparty, User } from '@prisma/client';
import type { ClientDetail, ClientListItem, ClientLookupItem, ContactDto, CounterpartyDto } from '@shared/types';
import { toIsoDate } from '@shared/format';

export type ClientRow = Client & {
  counterparties: Counterparty[];
  contacts: ClientContact[];
  responsibleUser: User | null;
};

export function toCounterpartyDto(row: Counterparty): CounterpartyDto {
  return {
    id: row.id,
    clientId: row.clientId,
    nameShort: row.nameShort,
    nameFull: row.nameFull,
    edrpou: row.edrpou,
    ipn: row.ipn,
    isVatPayer: row.isVatPayer,
    addressLegal: row.legalAddress,
    addressActual: row.actualAddress,
    note: row.note,
    isDefault: row.isDefault,
    isActive: row.isActive,
  };
}

export function toContactDto(row: ClientContact): ContactDto {
  return {
    id: row.id,
    clientId: row.clientId,
    counterpartyId: row.counterpartyId,
    fullName: row.fullName,
    position: row.position,
    phone: row.phone,
    email: row.email,
    note: row.note,
    isPrimary: row.isDefault,
    isActive: row.isActive,
  };
}

export function toClientDetail(row: ClientRow): ClientDetail {
  return {
    id: row.id,
    version: row.version,
    name: row.name,
    note: row.notes,
    responsibleUserId: row.responsibleUserId,
    isActive: row.isActive,
    counterparties: row.counterparties.map(toCounterpartyDto),
    contacts: row.contacts.map(toContactDto),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Скільки заявок у клієнта й коли остання — рахуємо одним запитом на весь список. */
export interface ClientRequestStats {
  count: number;
  lastDate: Date | null;
}

export function toClientListItem(row: ClientRow, stats?: ClientRequestStats): ClientListItem {
  return {
    id: row.id,
    name: row.name,
    // архівні (прибрані з картки) лишаються лише в старих заявках — у списку їх не показуємо
    counterparties: row.counterparties.filter((cp) => cp.isActive).map((cp) => ({ id: cp.id, nameShort: cp.nameShort, edrpou: cp.edrpou })),
    contactsCount: row.contacts.filter((c) => c.isActive).length,
    responsible: row.responsibleUser ? { id: row.responsibleUser.id, shortName: row.responsibleUser.shortName } : null,
    requestsCount: stats?.count ?? 0,
    lastRequestDate: stats?.lastDate ? toIsoDate(stats.lastDate) : null,
    isActive: row.isActive,
  };
}

/** 'АВТОСТРАДА / ТОВ «ВК АВТОСТРАДА» (44305608)' */
export function lookupLabel(clientName: string, counterparty: Pick<Counterparty, 'nameShort' | 'edrpou'> | null): string {
  if (!counterparty) return clientName;
  return `${clientName} / ${counterparty.nameShort}${counterparty.edrpou ? ` (${counterparty.edrpou})` : ''}`;
}

/** Слова запиту; порожній запит — порожній список (шукати нічого не треба). */
export function lookupTokens(query: string): string[] {
  return query.toLocaleLowerCase('uk').split(/\s+/u).filter(Boolean);
}

/** Рядки підказки для клієнта: по одному на чинного контрагента (без контрагентів — сам клієнт). */
export function toLookupItems(row: ClientRow, tokens: readonly string[]): ClientLookupItem[] {
  const active = row.counterparties.filter((cp) => cp.isActive);
  const rows: (Counterparty | null)[] = active.length ? active : [null];
  const out: ClientLookupItem[] = [];
  for (const cp of rows) {
    const label = lookupLabel(row.name, cp);
    const text = label.toLocaleLowerCase('uk');
    if (!tokens.every((t) => text.includes(t))) continue;
    out.push({
      clientId: row.id,
      clientName: row.name,
      counterpartyId: cp?.id ?? null,
      counterpartyName: cp?.nameShort ?? null,
      edrpou: cp?.edrpou ?? null,
      label,
    });
  }
  return out;
}
