// Заявки на сервері: реєстр, створення, документ, збереження дельти (під блокуванням і з перевіркою версії),
// статус, копія, історія. Розрахунки, дельта й історія — спільний код (shared/pricing, shared/requests).
import { randomUUID } from 'node:crypto';
import { Prisma, type RequestEvent, type User } from '@prisma/client';
import { REQUEST_STATUS_LABELS } from '@shared/enums';
import { formatRequestNumber, toIsoDate } from '@shared/format';
import { catalogSnapshotOf, defaultKpSettings, defaultMarkupSettings, MAX_DISCOUNT_PCT, pricingSettingsFrom } from '@shared/pricing';
import {
  applyDocumentPatch,
  contactRef,
  copyRequestDoc,
  counterpartyRef,
  createEventLog,
  diffById,
  documentEventsBefore,
  recordDocumentEvents,
  requestTotals,
  stableJson,
  statusEventSummary,
  type RequestDocState,
  type RequestEventDraft,
} from '@shared/requests';
import { applyStatusChange, isEditableStatus, validateTransition } from '@shared/status';
import type {
  ClientDetail,
  CopyRequestBody,
  CopyRequestResult,
  CreateRequestResult,
  DocumentPatch,
  KpDocumentDto,
  RequestDocument,
  RequestHistoryResponse,
  RequestListItem,
  RequestPage,
  RequestTotalsSummary,
  SaveDocumentResponse,
  StatusChangeBody,
  StatusChangeResult,
  UserRef,
  UUID,
} from '@shared/types';
import { prisma } from '../../db';
import { ApiError, notFound, validationError } from '../../http/errors';
import { audit, userRefs } from '../audit/audit.service';
import { getClient } from '../clients/clients.service';
import { listOwnCompanies } from '../own-companies/ownCompanies.service';
import { activeLock, assertLockHolder } from './locks.service';
import { headerRatesOn, pricingEnv, productsByIds, type PricingEnv } from './requests.context';
import {
  blockData,
  headerData,
  lineData,
  offerData,
  toCopyReport,
  toDocState,
  toEventDto,
  toKpDto,
  toLockInfo,
  totalsData,
  type RequestWithParts,
} from './requests.mapper';
import type { CreateRequestInput, RequestListQueryInput, RequestPageQueryInput } from './requests.schemas';

type Tx = Prisma.TransactionClient;
const TX = { timeout: 30_000, maxWait: 10_000 };
const PARTS = { lines: true, blocks: true, offers: true } as const;

const userRef = (u: User): UserRef => ({ id: u.id, shortName: u.shortName });

async function loadRequest(id: UUID, db: Tx | typeof prisma = prisma): Promise<RequestWithParts> {
  const r = await db.request.findUnique({ where: { id }, include: PARTS });
  if (!r) throw notFound('Заявку не знайдено');
  return r;
}

async function clientOrNull(id: UUID | null): Promise<ClientDetail | null> {
  if (!id) return null;
  try {
    return await getClient(id);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'NOT_FOUND') return null;
    throw e;
  }
}

/**
 * Текст пошуку реєстру (РЕЄ-1): номер, клієнт, контрагент, ЄДРПОУ, назва й відповідальний.
 * Складаємо при збереженні заявки; якщо людина згодом змінить ПІБ, текст оновиться при наступному збереженні.
 */
function searchTextOf(
  number: number,
  title: string | null,
  client: ClientDetail | null,
  counterpartyId: UUID | null,
  manager: { shortName: string; fullName: string } | null,
): string {
  const cp = client?.counterparties.find((c) => c.id === counterpartyId);
  return [formatRequestNumber(number), String(number), client?.name, cp?.nameShort, cp?.nameFull, cp?.edrpou, title, manager?.shortName, manager?.fullName]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('uk');
}

const managerNames = (db: Tx | typeof prisma, id: UUID) => db.user.findUnique({ where: { id }, select: { shortName: true, fullName: true } });

async function kpsOf(requestId: UUID, db: Tx | typeof prisma = prisma): Promise<KpDocumentDto[]> {
  const rows = await db.kpDocument.findMany({ where: { requestId }, orderBy: { version: 'asc' } });
  const users = await userRefs(rows.map((k) => k.createdById));
  return rows.map((k) => toKpDto(k, users));
}

/** Записати рядки, блоки й пропозиції: лише змінене, нове — одним запитом. */
async function writeParts(tx: Tx, requestId: UUID, before: RequestDocState | null, after: RequestDocState): Promise<void> {
  const lines = diffById(before?.lines ?? [], after.lines);
  const blocks = diffById(before?.blocks ?? [], after.blocks);
  const offers = diffById(before?.offers ?? [], after.offers);
  if (offers.deleteIds.length) await tx.requestOffer.deleteMany({ where: { requestId, id: { in: offers.deleteIds } } });
  if (lines.deleteIds.length) await tx.requestLine.deleteMany({ where: { requestId, id: { in: lines.deleteIds } } });
  if (blocks.deleteIds.length) await tx.requestBlock.deleteMany({ where: { requestId, id: { in: blocks.deleteIds } } });

  const existing = {
    lines: new Set((before?.lines ?? []).map((x) => x.id)),
    blocks: new Set((before?.blocks ?? []).map((x) => x.id)),
    offers: new Set((before?.offers ?? []).map((x) => x.id)),
  };
  const fresh = <T extends { id: UUID }>(list: T[], ids: Set<UUID>) => list.filter((x) => !ids.has(x.id));
  const changed = <T extends { id: UUID }>(list: T[], ids: Set<UUID>) => list.filter((x) => ids.has(x.id));

  const newLines = fresh(lines.upsert, existing.lines).map((l) => lineData(requestId, l));
  const newBlocks = fresh(blocks.upsert, existing.blocks).map((b) => blockData(requestId, b));
  const newOffers = fresh(offers.upsert, existing.offers).map((o) => offerData(requestId, o));
  if (newLines.length) await tx.requestLine.createMany({ data: newLines });
  if (newBlocks.length) await tx.requestBlock.createMany({ data: newBlocks });
  if (newOffers.length) await tx.requestOffer.createMany({ data: newOffers });
  for (const l of changed(lines.upsert, existing.lines)) await tx.requestLine.update({ where: { id: l.id }, data: lineData(requestId, l) });
  for (const b of changed(blocks.upsert, existing.blocks)) await tx.requestBlock.update({ where: { id: b.id }, data: blockData(requestId, b) });
  for (const o of changed(offers.upsert, existing.offers)) await tx.requestOffer.update({ where: { id: o.id }, data: offerData(requestId, o) });
}

async function writeEvents(tx: Tx, requestId: UUID, changes: { update: RequestEventDraft | null; insert: RequestEventDraft[] }): Promise<void> {
  if (changes.update?.id != null) {
    await tx.requestEvent.update({
      where: { id: changes.update.id },
      data: { at: new Date(changes.update.at), summary: changes.update.summary, counts: (changes.update.counts ?? undefined) as Prisma.InputJsonValue | undefined },
    });
  }
  for (const e of changes.insert) {
    await tx.requestEvent.create({
      data: {
        requestId,
        at: new Date(e.at),
        userId: e.user?.id ?? null,
        kind: e.kind,
        summary: e.summary,
        group: e.group ?? null,
        counts: (e.counts ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}

function toDraft(e: RequestEvent, user: UserRef | null): RequestEventDraft {
  return {
    id: e.id,
    at: e.at.toISOString(),
    user,
    kind: e.kind as RequestEventDraft['kind'],
    summary: e.summary,
    ...(e.group ? { group: e.group } : {}),
    ...(e.counts ? { counts: e.counts as Record<string, number> } : {}),
  };
}

// ── реєстр ────────────────────────────────────────────────────────
const DEFAULT_LIST_LIMIT = 1000;

/** «2114 / 005001» чи «2114/5001» — номер КП: друга частина — номер заявки. */
const KP_NUMBER = /^\s*\d{1,7}\s*\/\s*(\d{1,7})\s*$/u;

/**
 * Умова реєстру. Пошук: номер КП → номер заявки; інакше кожне слово має бути в шапці (номер, клієнт, контрагент,
 * ЄДРПОУ, тема, відповідальний) — або всі слова в назві однієї позиції клієнта, або запит у артикулі підібраного товару.
 */
export function requestListWhere(query: RequestListQueryInput, actor: Pick<User, 'id'>): Prisma.RequestWhereInput {
  const search = (query.search ?? '').trim();
  const kp = KP_NUMBER.exec(search);
  const tokens = kp ? [] : search.toLocaleLowerCase('uk').split(/\s+/u).filter(Boolean);
  const bySearch: Prisma.RequestWhereInput = kp
    ? { number: Number(kp[1]) }
    : tokens.length
      ? {
          OR: [
            { AND: tokens.map((t) => ({ searchText: { contains: t } })) },
            { lines: { some: { AND: tokens.map((t) => ({ clientName: { contains: t, mode: 'insensitive' as const } })) } } },
            { offers: { some: { sku: { contains: search, mode: 'insensitive' as const } } } },
          ],
        }
      : {};
  return {
    ...(query.status?.length ? { status: { in: query.status } } : {}),
    ...(query.clientId ? { clientId: query.clientId } : {}),
    ...(query.mine ? { managerId: actor.id } : query.managerId ? { managerId: query.managerId } : {}),
    ...(query.dateFrom || query.dateTo
      ? { requestDate: { ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00Z`) } : {}), ...(query.dateTo ? { lte: new Date(`${query.dateTo}T00:00:00Z`) } : {}) } }
      : {}),
    ...bySearch,
  };
}

export function requestListOrderBy(sort: RequestListQueryInput['sort']): Prisma.RequestOrderByWithRelationInput[] {
  const s = sort ?? '-number';
  const dir = s.startsWith('-') ? 'desc' : 'asc';
  const field = s.replace(/^-/u, '') as 'number' | 'requestDate' | 'totalSaleGross' | 'approvedSaleGross';
  if (field === 'number') return [{ number: dir }];
  // погодженої суми може не бути — такі заявки завжди в кінці
  if (field === 'approvedSaleGross') return [{ approvedSaleGross: { sort: dir, nulls: 'last' } }, { number: 'desc' }];
  return [{ [field]: dir }, { number: 'desc' }];
}

type ListRow = Prisma.RequestGetPayload<{ include: { lock: true } }>;

async function toListItems(rows: ListRow[], actor: User, sessionId: string | null, now: Date): Promise<RequestListItem[]> {
  const clientIds = [...new Set(rows.map((r) => r.clientId).filter((x): x is string => !!x))];
  const [clients, counterparties, users] = await Promise.all([
    prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }),
    prisma.counterparty.findMany({
      where: { id: { in: rows.map((r) => r.counterpartyId).filter((x): x is string => !!x) } },
      select: { id: true, nameShort: true, edrpou: true },
    }),
    userRefs(rows.flatMap((r) => [r.managerId, r.lock?.userId])),
  ]);
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const cpById = new Map(counterparties.map((c) => [c.id, c]));
  return rows.map((r) => {
    const lock = r.lock && r.lock.expiresAt > now ? r.lock : null;
    return {
      id: r.id,
      number: r.number,
      numberLabel: formatRequestNumber(r.number),
      requestDate: toIsoDate(r.requestDate),
      status: r.status,
      title: r.title,
      client: r.clientId ? (clientById.get(r.clientId) ?? null) : null,
      counterparty: r.counterpartyId ? (cpById.get(r.counterpartyId) ?? null) : null,
      manager: users.get(r.managerId) ?? { id: r.managerId, shortName: '—' },
      totalSaleGross: r.totalSaleGross,
      approvedSaleGross: r.approvedSaleGross,
      linesCount: r.linesCount,
      suppliersCount: r.suppliersCount,
      kpCount: r.kpCount,
      lastKp: r.lastKpNumber != null ? { kpNumber: r.lastKpNumber, final: !!r.lastKpFinal } : null,
      attachmentsCount: r.filesCount + r.kpCount,
      lock: toLockInfo(lock, users, actor.id, sessionId),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

/** Заявки одного клієнта й інші короткі списки (до 1000 останніх). */
export async function listRequests(query: RequestListQueryInput, actor: User, sessionId: string | null, now = new Date()): Promise<RequestListItem[]> {
  const rows = await prisma.request.findMany({
    where: requestListWhere(query, actor),
    orderBy: requestListOrderBy(query.sort),
    take: query.limit ?? DEFAULT_LIST_LIMIT,
    include: { lock: true },
  });
  return toListItems(rows, actor, sessionId, now);
}

/** Реєстр порціями: сортування й фільтри — у базі, загальна кількість — лише для першої порції. */
export async function listRequestsPage(query: RequestPageQueryInput, actor: User, sessionId: string | null, now = new Date()): Promise<RequestPage> {
  const where = requestListWhere(query, actor);
  const [total, rows] = await Promise.all([
    query.offset === 0 ? prisma.request.count({ where }) : Promise.resolve(null),
    prisma.request.findMany({ where, orderBy: requestListOrderBy(query.sort), skip: query.offset, take: query.limit, include: { lock: true } }),
  ]);
  return { items: await toListItems(rows, actor, sessionId, now), total };
}

/** Наступний номер заявки з лічильника налаштувань (атомарно, номери не повторюються). */
async function nextRequestNumber(tx: Tx): Promise<number> {
  const [row] = await tx.$queryRaw<{ n: number }[]>`
    UPDATE "AppSettings" SET "nextRequestNumber" = "nextRequestNumber" + 1 WHERE id = 1 RETURNING "nextRequestNumber" - 1 AS n`;
  if (!row) throw new ApiError('INTERNAL', 'Налаштування системи не знайдено');
  return Number(row.n);
}

const EMPTY_TOTALS: RequestTotalsSummary = {
  linesCount: 0,
  suppliersCount: 0,
  totalPurchaseGross: 0,
  totalSaleNet: 0,
  totalSaleGross: 0,
  profitNet: 0,
  approvedSaleGross: null,
};

/** Контрагент і контакт у шапці — лише цього клієнта (ідентифікатори приходять із браузера). */
function assertPartiesOfClient(
  header: { clientId: string | null; counterpartyId: string | null; contactId: string | null },
  client: Awaited<ReturnType<typeof clientOrNull>>,
): void {
  if (header.clientId && !client) throw new ApiError('VALIDATION_ERROR', 'Клієнта не знайдено');
  if (header.counterpartyId && !client?.counterparties.some((c) => c.id === header.counterpartyId)) {
    throw new ApiError('VALIDATION_ERROR', 'Контрагент не належить обраному клієнту');
  }
  if (header.contactId && !client?.contacts.some((c) => c.id === header.contactId)) {
    throw new ApiError('VALIDATION_ERROR', 'Контакт не належить обраному клієнту');
  }
}

// ── створення ─────────────────────────────────────────────────────
export async function createRequest(body: CreateRequestInput, actor: User, now = new Date()): Promise<CreateRequestResult> {
  const env = await pricingEnv(now);
  const client = await clientOrNull(body.clientId ?? null);
  if (body.clientId && !client) throw new ApiError('VALIDATION_ERROR', 'Клієнта не знайдено');
  const owns = await listOwnCompanies();
  const own = (body.ownCompanyId ? owns.find((c) => c.id === body.ownCompanyId) : undefined) ?? owns.find((c) => c.isDefault && c.isActive) ?? owns[0];
  if (!own) throw new ApiError('VALIDATION_ERROR', 'Спершу додайте нашу юрособу в Налаштуваннях');
  if (body.managerId && body.managerId !== actor.id) {
    const manager = await prisma.user.findUnique({ where: { id: body.managerId }, select: { isActive: true } });
    if (!manager?.isActive) throw new ApiError('VALIDATION_ERROR', 'Відповідального не знайдено або його заблоковано');
  }
  // архівні (прибрані з картки) контрагенти й контакти в нову заявку не потрапляють
  const activeCps = client?.counterparties.filter((c) => c.isActive) ?? [];
  const activeContacts = client?.contacts.filter((c) => c.isActive) ?? [];
  const counterparty = activeCps.find((c) => c.id === body.counterpartyId) ?? activeCps.find((c) => c.isDefault) ?? activeCps[0];
  const contact =
    activeContacts.find((c) => c.id === body.contactId) ??
    activeContacts.find((c) => c.counterpartyId === counterparty?.id && c.isPrimary) ??
    activeContacts.find((c) => c.counterpartyId === counterparty?.id);
  const requestDate = body.requestDate ?? toIsoDate(now);
  const rates = await headerRatesOn(requestDate);

  const id = randomUUID();
  const number = await prisma.$transaction(async (tx) => {
    const n = await nextRequestNumber(tx);
    const header = {
      number: n,
      requestDate,
      status: 'in_progress' as const,
      title: body.title?.trim() || null,
      clientId: client?.id ?? null,
      counterpartyId: counterparty?.id ?? null,
      contactId: contact?.id ?? null,
      ownCompanyId: own.id,
      // відповідальний — той, хто створив (якщо не обрав іншого)
      managerId: body.managerId ?? actor.id,
      notes: null,
      purchaseNote: null,
      rates,
      vatRatePct: env.settings.vatRatePct,
      discountFormula: env.settings.discountFormula,
      kpSettings: defaultKpSettings(env.settings, own),
      cancelReason: null,
    };
    await tx.request.create({
      data: {
        id,
        number: n,
        status: 'in_progress',
        ...headerData(header),
        markup: defaultMarkupSettings(env.settings) as unknown as Prisma.InputJsonValue,
        ...totalsData(EMPTY_TOTALS),
        searchText: searchTextOf(n, header.title, client, header.counterpartyId, await managerNames(tx, header.managerId)),
        createdAt: now,
        createdById: actor.id,
        updatedAt: now,
        updatedById: actor.id,
      },
    });
    await tx.requestEvent.create({ data: { requestId: id, at: now, userId: actor.id, kind: 'created', summary: 'Заявку створено' } });
    return n;
  }, TX);
  await audit({ userId: actor.id, action: 'request.create', entityType: 'request', entityId: id, summary: `Створено заявку № ${formatRequestNumber(number)}` });
  return { id, number };
}

// ── документ ──────────────────────────────────────────────────────
export async function getRequestDocument(id: UUID, actor: User, sessionId: string | null, now = new Date()): Promise<RequestDocument> {
  const [r, env, owns] = await Promise.all([loadRequest(id), pricingEnv(now), listOwnCompanies()]);
  const state = toDocState(r);
  const [client, products, lock, users] = await Promise.all([
    clientOrNull(state.header.clientId),
    productsByIds(state.offers.map((o) => o.productId)),
    activeLock(id, now),
    userRefs([state.header.managerId, r.updatedById]),
  ]);
  const lockUsers = lock ? await userRefs([lock.userId]) : new Map<string, UserRef>();
  const lockInfo = toLockInfo(lock, lockUsers, actor.id, sessionId);
  const cp = client?.counterparties.find((c) => c.id === state.header.counterpartyId);
  const contact = client?.contacts.find((c) => c.id === state.header.contactId);
  const own = owns.find((c) => c.id === state.header.ownCompanyId) ?? owns[0];
  const suppliers: RequestDocument['refs']['suppliers'] = {};
  for (const b of state.blocks) if (b.supplierId && env.suppliers[b.supplierId]) suppliers[b.supplierId] = env.suppliers[b.supplierId];
  const readOnlyReason = !isEditableStatus(state.header.status) ? 'status' : lockInfo && !lockInfo.isMySession ? 'lock' : null;
  return {
    id: r.id,
    version: r.version,
    header: state.header,
    markup: state.markup,
    lines: state.lines,
    blocks: state.blocks,
    offers: state.offers.map((o) => {
      const p = o.productId ? products.get(o.productId) : undefined;
      return { ...o, catalog: p ? catalogSnapshotOf(p) : null };
    }),
    lock: lockInfo,
    refs: {
      suppliers,
      client: client ? { id: client.id, name: client.name } : null,
      counterparty: cp ? counterpartyRef(cp) : null,
      contact: contact ? contactRef(contact) : null,
      ownCompany: own ? { id: own.id, nameShort: own.nameShort, isVatPayer: own.isVatPayer } : { id: state.header.ownCompanyId, nameShort: '—', isVatPayer: true },
      manager: users.get(state.header.managerId) ?? { id: state.header.managerId, shortName: '—' },
      pricing: pricingSettingsFrom(env.settings),
    },
    meta: {
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      updatedBy: r.updatedById ? (users.get(r.updatedById) ?? null) : null,
      sourceRequestId: r.sourceRequestId,
      copyInfo: toCopyReport(r.copyInfo),
      kpCount: r.kpCount,
      attachmentsCount: r.filesCount + r.kpCount,
      readOnlyReason,
    },
  };
}

// ── збереження ────────────────────────────────────────────────────
export async function saveRequestDocument(id: UUID, patch: DocumentPatch, actor: User, now = new Date()): Promise<SaveDocumentResponse> {
  const env = await pricingEnv(now);
  const kps = await kpsOf(id);
  const at = now.toISOString();
  const result = await prisma.$transaction(async (tx) => {
    // одне збереження заявки за раз
    await tx.$queryRaw`SELECT id FROM "Request" WHERE id = ${id} FOR UPDATE`;
    const r = await loadRequest(id, tx);
    if (!isEditableStatus(r.status)) {
      throw new ApiError('READ_ONLY', `Заявка в статусі «${REQUEST_STATUS_LABELS[r.status]}» — лише перегляд`);
    }
    await assertLockHolder(tx, id, actor, patch.sessionId, now);
    if (patch.baseVersion !== r.version) throw new ApiError('VERSION_CONFLICT', 'Заявку змінено в іншій вкладці — дані перезавантажено');

    const before = toDocState(r);
    const after = applyDocumentPatch(before, patch);
    // спосіб і % можуть прийти окремими змінами, тож межу знижки перевіряємо на зібраному документі
    if (after.markup.method === 'discount_from_rrp' && (after.markup.value < 0 || after.markup.value > MAX_DISCOUNT_PCT)) {
      throw validationError(`Знижка від РРЦ: від 0 до ${MAX_DISCOUNT_PCT} %`);
    }
    const last = await tx.requestEvent.findFirst({ where: { requestId: id }, orderBy: { id: 'desc' } });
    const lastUser = last?.userId ? ((await userRefs([last.userId])).get(last.userId) ?? null) : null;
    const log = createEventLog(last ? toDraft(last, lastUser) : null);
    recordDocumentEvents(log, after, documentEventsBefore(before), patch, {
      supplierName: (sid) => (sid ? env.suppliers[sid]?.name : undefined) ?? 'постачальника',
      kps,
      user: userRef(actor),
      at,
    });
    await writeEvents(tx, id, log.changes());
    await writeParts(tx, id, before, after);

    const totals = requestTotals(after, env.ctx, kps);
    const headerChanged = stableJson(before.header) !== stableJson(after.header);
    const client = headerChanged ? await clientOrNull(after.header.clientId) : null;
    if (headerChanged) assertPartiesOfClient(after.header, client);
    const manager = headerChanged ? await managerNames(tx, after.header.managerId) : null;
    const updated = await tx.request.update({
      where: { id },
      data: {
        ...headerData(after.header),
        markup: after.markup as unknown as Prisma.InputJsonValue,
        ...totalsData(totals),
        ...(headerChanged ? { searchText: searchTextOf(after.header.number, after.header.title, client, after.header.counterpartyId, manager) } : {}),
        version: { increment: 1 },
        updatedAt: now,
        updatedById: actor.id,
      },
    });
    if (patch.release) {
      await tx.requestLock.deleteMany({ where: { requestId: id, userId: actor.id, sessionId: patch.sessionId } });
      return { version: updated.version, status: updated.status, totals, lockExpiresAt: null };
    }
    const ttl = (env.settings.lockTtlSeconds ?? 180) * 1000;
    const lock = await tx.requestLock.update({ where: { requestId: id }, data: { expiresAt: new Date(now.getTime() + ttl) } });
    return { version: updated.version, status: updated.status, totals, lockExpiresAt: lock.expiresAt.toISOString() };
  }, TX);
  return { ...result, updatedAt: at };
}

// ── статус ────────────────────────────────────────────────────────
export async function changeStatus(id: UUID, body: StatusChangeBody, actor: User, now = new Date()): Promise<StatusChangeResult> {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Request" WHERE id = ${id} FOR UPDATE`;
    const r = await tx.request.findUnique({ where: { id } });
    if (!r) throw notFound('Заявку не знайдено');
    await assertLockHolder(tx, id, actor, body.sessionId, now);
    if (body.baseVersion !== r.version) throw new ApiError('VERSION_CONFLICT', 'Заявку змінено в іншій вкладці — дані перезавантажено');
    const check = validateTransition(r.status, body.to, actor.role, body.reason);
    if (!check.ok) throw new ApiError(check.code, check.message);
    const change = applyStatusChange(body.to, body.reason);
    const updated = await tx.request.update({
      where: { id },
      data: { status: change.status, cancelReason: change.cancelReason, version: { increment: 1 }, updatedAt: now, updatedById: actor.id },
    });
    await tx.requestEvent.create({
      data: { requestId: id, at: now, userId: actor.id, kind: 'status_change', summary: statusEventSummary(r.status, updated.status, updated.cancelReason) },
    });
    // БЛК-2: виконану чи скасовану заявку не редагують — блокування знімаємо одразу
    if (!isEditableStatus(updated.status)) await tx.requestLock.deleteMany({ where: { requestId: id } });
    return { status: updated.status, version: updated.version, number: r.number, from: r.status };
  }, TX);
  await audit({
    userId: actor.id,
    action: 'request.status',
    entityType: 'request',
    entityId: id,
    summary: `Заявка № ${formatRequestNumber(result.number)}: ${statusEventSummary(result.from, result.status, null).toLowerCase()}`,
  });
  return { status: result.status, version: result.version };
}

// ── копія ─────────────────────────────────────────────────────────
export async function copyRequest(id: UUID, body: CopyRequestBody, actor: User, now = new Date()): Promise<CopyRequestResult> {
  const src = await loadRequest(id);
  const source = { ...toDocState(src), id: src.id };
  const env: PricingEnv = await pricingEnv(now);
  const today = toIsoDate(now);
  const targetClientId = body.clientId !== undefined ? body.clientId : source.header.clientId;
  const [client, owns, rates, products] = await Promise.all([
    targetClientId !== source.header.clientId ? clientOrNull(targetClientId ?? null) : Promise.resolve(null),
    listOwnCompanies(),
    headerRatesOn(today),
    body.priceMode === 'refresh' ? productsByIds(source.offers.map((o) => o.productId)) : Promise.resolve(new Map()),
  ]);
  const own = owns.find((c) => c.id === source.header.ownCompanyId) ?? owns[0];
  const newId = randomUUID();
  const created = await prisma.$transaction(async (tx) => {
    const number = await nextRequestNumber(tx);
    const copy = copyRequestDoc({
      source,
      body,
      number,
      today,
      now,
      at: now.toISOString(),
      user: userRef(actor),
      rates,
      client,
      kpSettings: defaultKpSettings(env.settings, own),
      markupDefaults: defaultMarkupSettings(env.settings),
      priceListRateMaxAgeDays: env.settings.priceListRateMaxAgeDays,
      suppliers: env.suppliers,
      products,
      newId: randomUUID,
    });
    const totals = requestTotals(copy.state, env.ctx, []);
    const searchClient = client ?? (await clientOrNull(copy.state.header.clientId));
    await tx.request.create({
      data: {
        id: newId,
        number,
        status: 'in_progress',
        ...headerData(copy.state.header),
        markup: copy.state.markup as unknown as Prisma.InputJsonValue,
        ...totalsData(totals),
        sourceRequestId: source.id,
        copyInfo: copy.report as unknown as Prisma.InputJsonValue,
        searchText: searchTextOf(number, copy.state.header.title, searchClient, copy.state.header.counterpartyId, await managerNames(tx, copy.state.header.managerId)),
        createdAt: now,
        createdById: actor.id,
        updatedAt: now,
        updatedById: actor.id,
      },
    });
    await writeParts(tx, newId, null, copy.state);
    await tx.requestEvent.create({ data: { requestId: newId, at: now, userId: actor.id, kind: 'copy', summary: copy.eventSummary } });
    return { number, report: copy.report };
  }, TX);
  await audit({
    userId: actor.id,
    action: 'request.copy',
    entityType: 'request',
    entityId: newId,
    summary: `Заявка № ${formatRequestNumber(created.number)} — копія № ${formatRequestNumber(src.number)}`,
  });
  return { id: newId, number: created.number, report: created.report };
}

// ── історія ───────────────────────────────────────────────────────
export async function getRequestHistory(id: UUID): Promise<RequestHistoryResponse> {
  const exists = await prisma.request.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw notFound('Заявку не знайдено');
  const rows = await prisma.requestEvent.findMany({ where: { requestId: id }, orderBy: { id: 'desc' } });
  const users = await userRefs(rows.map((e) => e.userId));
  return { events: rows.map((e) => toEventDto(e, users)) };
}

/** Подія «передача редагування» (адміністратор забрав блокування) — в історію заявки й журнал дій. */
export async function recordLockForce(requestId: UUID, admin: User, previousUserId: string, now = new Date()): Promise<void> {
  const [prev, r] = await Promise.all([
    userRefs([previousUserId]).then((m) => m.get(previousUserId)),
    prisma.request.findUnique({ where: { id: requestId }, select: { number: true } }),
  ]);
  const summary = `Редагування передано адміністратору: ${prev?.shortName ?? '—'} → ${admin.shortName}`;
  await prisma.requestEvent.create({ data: { requestId, at: now, userId: admin.id, kind: 'lock_force', summary } });
  await audit({
    userId: admin.id,
    action: 'request.lock_force',
    entityType: 'request',
    entityId: requestId,
    summary: `Заявка № ${r ? formatRequestNumber(r.number) : '—'}: ${summary.toLowerCase()}`,
  });
}

export { kpsOf, loadRequest, clientOrNull, searchTextOf };
