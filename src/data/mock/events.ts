// Історія заявки в mock: створення, статус, позиції, підбір (постачальники, курси, ✔, виключення), націнка, ціни в заявці,
// КП, погодження, копія, передача редагування. Дрібні сусідні зміни одного користувача (до 10 хв) зливаються в одну подію.
import { CURRENCY_LABELS, MARKUP_METHOD_LABELS, REQUEST_STATUS_LABELS, type RequestStatus } from '@shared/enums';
import { formatPct, formatRate } from '@shared/format';
import { approvalBaseKp, isActiveLine } from '@shared/pricing';
import type { DocumentPatch, ISODateTime, MarkupSettings, RequestEventDto, RequestLine, UserRef, UUID } from '@shared/types';
import type { MockDb, StoredRequest } from './db';

type Counts = Record<string, number>;

const COALESCE_MS = 10 * 60_000;

export function addEvent(db: MockDb, requestId: UUID, event: Omit<RequestEventDto, 'id'>): void {
  (db.events[requestId] ??= []).push({ id: db.nextEventId++, ...event });
}

/** Остання подія заявки тієї самої групи й користувача, не старша за 10 хв, — щоб злити з нею. */
function mergeable(db: MockDb, requestId: UUID, group: string, user: UserRef | null, at: ISODateTime): RequestEventDto | null {
  const list = db.events[requestId] ?? [];
  const last = list[list.length - 1];
  return last?.group === group && last.user?.id === user?.id && Date.parse(at) - Date.parse(last.at) < COALESCE_MS ? last : null;
}

/** Подія з лічильниками: зливається з попередньою тієї самої групи, лічильники додаються. */
function addCountedEvent(
  db: MockDb,
  requestId: UUID,
  e: { kind: RequestEventDto['kind']; group: string; add: Counts; summary: (c: Counts) => string; user: UserRef | null; at: ISODateTime },
): void {
  const last = mergeable(db, requestId, e.group, e.user, e.at);
  if (last) {
    const counts = { ...(last.counts ?? {}) };
    for (const [k, v] of Object.entries(e.add)) counts[k] = (counts[k] ?? 0) + v;
    last.counts = counts;
    last.summary = e.summary(counts);
    last.at = e.at;
    return;
  }
  addEvent(db, requestId, { at: e.at, user: e.user, kind: e.kind, group: e.group, counts: e.add, summary: e.summary(e.add) });
}

/** '… 3, … 1' без нульових частин. */
const joinCounts = (c: Counts, labels: Record<string, string>) =>
  Object.entries(labels)
    .filter(([k]) => (c[k] ?? 0) > 0)
    .map(([k, label]) => `${label} ${c[k]}`)
    .join(', ');

const linesSummary = (c: Counts) => `Позиції: ${joinCounts(c, { added: 'додано', removed: 'видалено', edited: 'змінено' })}`;
const picksSummary = (c: Counts) =>
  `Підбір: ${joinCounts(c, { approved: '✔ затверджено', unapproved: '✔ знято', excluded: '«не підходить»', restored: 'повернуто' })}`;
const markupLinesSummary = (c: Counts) => `Націнка змінена в рядках: ${c.lines ?? 0}`;

export function statusEventSummary(from: RequestStatus, to: RequestStatus, reason: string | null): string {
  const base = `Статус: «${REQUEST_STATUS_LABELS[from]}» → «${REQUEST_STATUS_LABELS[to]}»`;
  return to === 'cancelled' && reason ? `${base}. Причина: ${reason}` : base;
}

const markupLabel = (m: Pick<MarkupSettings, 'method' | 'value'>) =>
  m.method === 'markup_on_cost' || m.method === 'discount_from_rrp'
    ? `${MARKUP_METHOD_LABELS[m.method]} ${formatPct(m.value, Number.isInteger(m.value) ? 0 : 2)}`
    : MARKUP_METHOD_LABELS[m.method];

const lineKey = (l: Pick<RequestLine, 'clientName' | 'qty' | 'clientUnit'>) => `${l.clientName}|${l.qty}|${l.clientUnit ?? ''}`;

/** Стан заявки до збереження — щоб знайти, що змінилось. */
export interface DocumentEventsBefore {
  approvalKey: string;
  priceChangedAt: Map<UUID, string | null>;
  lines: Map<UUID, string>;
  lineMarkup: Map<UUID, string>;
  selection: Map<UUID, UUID | null>;
  excluded: Map<UUID, boolean>;
  blocks: Map<UUID, { supplierId: UUID | null; USD: number | null; EUR: number | null }>;
  markup: Pick<MarkupSettings, 'method' | 'value'>;
}

const approvalKeyOf = (r: StoredRequest) =>
  r.lines
    .filter((l) => l.approval.approved)
    .map((l) => `${l.id}:${l.approval.approvedQty ?? ''}`)
    .join('|');

export function documentEventsBefore(r: StoredRequest): DocumentEventsBefore {
  return {
    approvalKey: approvalKeyOf(r),
    priceChangedAt: new Map(r.offers.map((o) => [o.id, o.priceChange?.changedAt ?? null])),
    lines: new Map(r.lines.map((l) => [l.id, lineKey(l)])),
    lineMarkup: new Map(r.lines.map((l) => [l.id, JSON.stringify(l.markup)])),
    selection: new Map(r.lines.map((l) => [l.id, l.selection.blockId])),
    excluded: new Map(r.offers.map((o) => [o.id, o.excluded])),
    blocks: new Map(r.blocks.map((b) => [b.id, { supplierId: b.supplierId, USD: b.rates.USD, EUR: b.rates.EUR }])),
    markup: { method: r.markup.method, value: r.markup.value },
  };
}

/** Події збереження: позиції, підбір, курси, націнка, оновлення ціни з прайсу, погодження. */
export function recordDocumentEvents(
  db: MockDb,
  r: StoredRequest,
  before: DocumentEventsBefore,
  patch: DocumentPatch,
  user: UserRef,
  at: ISODateTime,
): void {
  const supplierName = (id: UUID | null) => db.suppliers.find((s) => s.id === id)?.name ?? 'постачальника';

  // позиції клієнта
  const lines = new Map(r.lines.map((l) => [l.id, l]));
  const lc: Counts = { added: 0, removed: 0, edited: 0 };
  for (const [id, key] of before.lines) {
    const l = lines.get(id);
    if (!l) lc.removed++;
    else if (lineKey(l) !== key) lc.edited++;
  }
  for (const id of lines.keys()) if (!before.lines.has(id)) lc.added++;
  if (lc.added || lc.removed || lc.edited) addCountedEvent(db, r.id, { kind: 'lines_change', group: 'lines', add: lc, summary: linesSummary, user, at });

  // постачальники (блоки) і їхні курси
  const blocks = new Map(r.blocks.map((b) => [b.id, b]));
  for (const [id, b] of before.blocks) {
    const now = blocks.get(id);
    if (!now) {
      addEvent(db, r.id, { at, user, kind: 'sourcing_change', summary: `Прибрано постачальника ${supplierName(b.supplierId)}` });
      continue;
    }
    const changed = (['USD', 'EUR'] as const).filter((c) => now.rates[c] !== b[c]).map((c) => `${c} ${formatRate(b[c])} → ${formatRate(now.rates[c])}`);
    if (changed.length) addEvent(db, r.id, { at, user, kind: 'sourcing_change', summary: `Курс ${supplierName(now.supplierId)}: ${changed.join(', ')}` });
  }
  for (const b of r.blocks) {
    if (!before.blocks.has(b.id)) addEvent(db, r.id, { at, user, kind: 'sourcing_change', summary: `Додано постачальника ${supplierName(b.supplierId)}` });
  }

  // ✔ і виключення
  const pc: Counts = { approved: 0, unapproved: 0, excluded: 0, restored: 0 };
  for (const l of r.lines) {
    if (!before.selection.has(l.id) || before.selection.get(l.id) === l.selection.blockId) continue;
    if (l.selection.blockId) pc.approved++;
    else pc.unapproved++;
  }
  for (const o of r.offers) {
    const was = before.excluded.get(o.id);
    if (was === undefined || was === o.excluded) continue;
    if (o.excluded) pc.excluded++;
    else pc.restored++;
  }
  if (pc.approved || pc.unapproved || pc.excluded || pc.restored) {
    addCountedEvent(db, r.id, { kind: 'sourcing_change', group: 'picks', add: pc, summary: picksSummary, user, at });
  }

  // націнка: спосіб заявки і власні способи рядків
  if (before.markup.method !== r.markup.method || before.markup.value !== r.markup.value) {
    addEvent(db, r.id, { at, user, kind: 'markup_change', summary: `Спосіб націнки заявки: ${markupLabel(before.markup)} → ${markupLabel(r.markup)}` });
  }
  let markupLines = 0;
  for (const l of r.lines) {
    const was = before.lineMarkup.get(l.id);
    if (was !== undefined && was !== JSON.stringify(l.markup)) markupLines++;
  }
  if (markupLines) addCountedEvent(db, r.id, { kind: 'markup_change', group: 'markupLines', add: { lines: markupLines }, summary: markupLinesSummary, user, at });

  // ціну пропозиції оновлено з прайсу постачальника (копіювання пише власну подію)
  for (const o of patch.upsert?.offers ?? []) {
    const ch = o.priceChange;
    if (!ch || ch.reason === 'copy_refresh' || before.priceChangedAt.get(o.id) === ch.changedAt) continue;
    const line = r.lines.find((l) => l.id === o.lineId);
    const prev = `${formatRate(ch.prevPurchasePriceCur)}${ch.prevCurrency !== o.currency ? ` ${CURRENCY_LABELS[ch.prevCurrency]}` : ''}`;
    const what = ch.reason === 'catalog_refresh' ? 'ціну оновлено з прайсу' : 'ціну змінено в заявці';
    addEvent(db, r.id, {
      at,
      user,
      kind: 'price_update',
      summary: `Рядок ${line?.position ?? '—'}${o.sku ? `, ${o.sku}` : ''}: ${what} ${prev} → ${formatRate(o.purchasePriceCur)} ${CURRENCY_LABELS[o.currency]}`,
    });
  }

  // погодження: погоджують позиції КП-основи; без КП — від активних рядків
  if (approvalKeyOf(r) !== before.approvalKey) {
    const approved = r.lines.filter((l) => l.approval.approved).length;
    const base = approvalBaseKp(db.kps[r.id], r.header.approvalKpId);
    const of = base ? `${base.snapshot.rows.length} (КП № ${base.numberLabel})` : String(r.lines.filter(isActiveLine).length);
    const summary = approved ? `Погоджено позицій: ${approved} з ${of}` : 'Погодження знято';
    const last = mergeable(db, r.id, 'approval', user, at);
    if (last) {
      last.summary = summary;
      last.at = at;
    } else {
      addEvent(db, r.id, { at, user, kind: 'approval', group: 'approval', summary });
    }
  }
}
