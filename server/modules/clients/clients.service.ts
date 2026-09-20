// Клієнти: довідник із вкладеними контрагентами й контактами.
// Вкладені списки зберігаються цілком: старі рядки замінюються новими в одній транзакції,
// а передані ідентифікатори зберігаються — посилання із заявок лишаються дійсними.
import { randomUUID } from 'node:crypto';
import type { Prisma, User } from '@prisma/client';
import type { ClientDetail, ClientListItem, ClientLookupItem } from '@shared/types';
import { prisma } from '../../db';
import { ApiError, notFound } from '../../http/errors';
import { withSingleDefault } from '../../lib/defaults';
import { expectedVersion, staleCardError } from '../../lib/cardVersion';
import { audit } from '../audit/audit.service';
import { toClientDetail, toClientListItem, toLookupItems, lookupTokens } from './clients.mapper';
import type { ClientRow } from './clients.mapper';
import { withSingleDefaultPerCounterparty } from './clients.rules';
import type { ClientInputBody, ContactInputBody, CounterpartyInputBody } from './clients.schemas';

/** Скільки підказок віддаємо в пошуку клієнта. */
const LOOKUP_LIMIT = 50;

const INCLUDE = {
  counterparties: { orderBy: [{ isDefault: 'desc' as const }, { nameShort: 'asc' as const }] },
  contacts: { orderBy: [{ isDefault: 'desc' as const }, { fullName: 'asc' as const }] },
  responsibleUser: true,
} satisfies Prisma.ClientInclude;

export async function listClients(search: string): Promise<ClientListItem[]> {
  const rows = await prisma.client.findMany({
    where: whereMatches(lookupTokens(search)),
    include: INCLUDE,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
  return rows.map(toClientListItem);
}

export async function getClient(id: string): Promise<ClientDetail> {
  return toClientDetail(await getClientOrFail(id));
}

/** Підказки для шапки заявки: клієнт + контрагент + ЄДРПОУ одним рядком. */
export async function searchClients(query: string): Promise<ClientLookupItem[]> {
  const tokens = lookupTokens(query);
  const rows = await prisma.client.findMany({
    where: { isActive: true, ...whereMatches(tokens) },
    include: INCLUDE,
    orderBy: [{ name: 'asc' }],
    take: LOOKUP_LIMIT,
  });
  return rows
    .flatMap((row) => toLookupItems(row, tokens))
    .sort((a, b) => a.label.localeCompare(b.label, 'uk'))
    .slice(0, LOOKUP_LIMIT);
}

export async function createClient(input: ClientInputBody, actor: User): Promise<ClientDetail> {
  await assertResponsibleExists(input.responsibleUserId);
  const id = randomUUID();
  const nested = prepareNested(input.counterparties ?? [], input.contacts ?? []);
  await prisma.$transaction(async (tx) => {
    await tx.client.create({ data: { id, ...toRow(input), createdById: actor.id, updatedById: actor.id } });
    await saveNested(tx, id, nested);
  });
  await audit({ userId: actor.id, action: 'client.create', entityType: 'client', entityId: id, summary: `Додано клієнта ${input.name}` });
  return getClient(id);
}

export async function updateClient(id: string, input: ClientInputBody, actor: User): Promise<ClientDetail> {
  const current = await getClientOrFail(id);
  await assertResponsibleExists(input.responsibleUserId);
  // список, якого не передали, лишається як був — але переписуємо обидва,
  // щоб зв'язок «контакт → контрагент» не загубився при заміні контрагентів
  const counterparties = input.counterparties ?? current.counterparties.map(toCounterpartyInput);
  const contacts = input.contacts ?? current.contacts.map(toContactInput);
  const nested = prepareNested(counterparties, contacts);
  await prisma.$transaction(async (tx) => {
    const saved = await tx.client.updateMany({
      where: { id, ...(expectedVersion(input) != null ? { version: expectedVersion(input)! } : {}) },
      data: { ...toRow(input), updatedById: actor.id, version: { increment: 1 } },
    });
    if (saved.count !== 1) throw await staleCardError('Клієнта', await tx.client.findUnique({ where: { id } }));
    await saveNested(tx, id, nested);
  });
  await audit({ userId: actor.id, action: 'client.update', entityType: 'client', entityId: id, summary: `Змінено картку клієнта ${input.name}` });
  return getClient(id);
}

async function getClientOrFail(id: string): Promise<ClientRow> {
  const row = await prisma.client.findUnique({ where: { id }, include: INCLUDE });
  if (!row) throw notFound('Клієнта не знайдено');
  return row;
}

function toRow(input: ClientInputBody) {
  return {
    name: input.name,
    notes: input.note,
    responsibleUserId: input.responsibleUserId,
    isActive: input.isActive,
  };
}

/** Клієнти, у яких збігається назва, назва контрагента або ЄДРПОУ (усі слова запиту). */
function whereMatches(tokens: readonly string[]): Prisma.ClientWhereInput {
  if (tokens.length === 0) return {};
  return {
    AND: tokens.map((token) => ({
      OR: [
        { name: { contains: token, mode: 'insensitive' as const } },
        { counterparties: { some: { nameShort: { contains: token, mode: 'insensitive' as const } } } },
        { counterparties: { some: { edrpou: { contains: token } } } },
      ],
    })),
  };
}

interface NestedRows {
  // id завжди відомий (див. prepareNested): за ним оновлюємо наявні рядки й лишаємо посилання заявок цілими
  counterparties: (Omit<Prisma.CounterpartyCreateManyInput, 'clientId'> & { id: string })[];
  contacts: (Omit<Prisma.ClientContactCreateManyInput, 'clientId'> & { id: string })[];
}

/** Готує вкладені рядки: нові ідентифікатори, позначки «основний» і зв'язок контактів із контрагентами. */
function prepareNested(counterparties: readonly CounterpartyInputBody[], contacts: readonly ContactInputBody[]): NestedRows {
  const withIds = counterparties.map((cp) => ({ ...cp, id: cp.id ?? randomUUID() }));
  const known = new Set(withIds.map((cp) => cp.id));
  const linked = contacts.map((ct) => ({
    ...ct,
    id: ct.id ?? randomUUID(),
    // контакт може бути спільним для клієнта; посилання на зниклого контрагента забуваємо
    counterpartyId: ct.counterpartyId && known.has(ct.counterpartyId) ? ct.counterpartyId : null,
    isDefault: ct.isPrimary,
  }));
  return {
    counterparties: withSingleDefault(withIds).map((cp) => ({
      id: cp.id,
      nameShort: cp.nameShort,
      nameFull: cp.nameFull,
      edrpou: cp.edrpou,
      ipn: cp.ipn,
      isVatPayer: cp.isVatPayer,
      legalAddress: cp.addressLegal,
      actualAddress: cp.addressActual,
      note: cp.note,
      isDefault: cp.isDefault,
      isActive: cp.isActive,
    })),
    contacts: withSingleDefaultPerCounterparty(linked).map((ct) => ({
      id: ct.id,
      counterpartyId: ct.counterpartyId,
      fullName: ct.fullName,
      position: ct.position,
      phone: ct.phone,
      email: ct.email,
      note: ct.note,
      isDefault: ct.isDefault,
      isActive: ct.isActive,
    })),
  };
}

/**
 * Контрагентів і контакти не видаляємо (ДОВ-6): на них посилаються збережені заявки й КП.
 * Прибрані з картки ховаємо в архів — у списках вибору їх немає, у старих заявках вони лишаються видимими.
 */
async function saveNested(tx: Prisma.TransactionClient, clientId: string, nested: NestedRows): Promise<void> {
  const keptCounterparties = nested.counterparties.map((cp) => cp.id);
  const keptContacts = nested.contacts.map((ct) => ct.id);
  await tx.clientContact.updateMany({ where: { clientId, id: { notIn: keptContacts } }, data: { isActive: false } });
  await tx.counterparty.updateMany({ where: { clientId, id: { notIn: keptCounterparties } }, data: { isActive: false } });
  for (const cp of nested.counterparties) {
    await tx.counterparty.upsert({ where: { id: cp.id }, create: { ...cp, clientId }, update: cp });
  }
  for (const ct of nested.contacts) {
    await tx.clientContact.upsert({ where: { id: ct.id }, create: { ...ct, clientId }, update: ct });
  }
}

function toCounterpartyInput(row: ClientRow['counterparties'][number]): CounterpartyInputBody {
  return {
    id: row.id,
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

function toContactInput(row: ClientRow['contacts'][number]): ContactInputBody {
  return {
    id: row.id,
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

async function assertResponsibleExists(userId: string | null): Promise<void> {
  if (!userId) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new ApiError('VALIDATION_ERROR', 'Відповідального користувача не знайдено');
}
