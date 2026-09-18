// Історія заявки: створення, статус, позиції, підбір (постачальники, курси, ✔, виключення), націнка, ціни з прайсу,
// КП, погодження, копія, передача редагування. Дрібні сусідні зміни одного користувача (до 10 хв) зливаються в одну подію.
import { CURRENCY_LABELS, MARKUP_METHOD_LABELS, REQUEST_STATUS_LABELS, type RequestStatus } from '../enums';
import { formatPct, formatRate } from '../format';
import { approvalBaseKp, isActiveLine } from '../pricing';
import type { DocumentPatch, ISODateTime, KpDocumentDto, MarkupSettings, RequestEventDto, RequestLine, UserRef, UUID } from '../types';
import type { RequestDocState } from './document';
import { stableJson } from './stable';

type Counts = Record<string, number>;

/** Подія до запису (id є лише в уже збереженої). */
export type RequestEventDraft = Omit<RequestEventDto, 'id'> & { id?: number };

/** Куди пишуться події: остання подія заявки (для злиття) і нові. */
export interface EventLog {
  last(): RequestEventDraft | null;
  add(e: RequestEventDraft): void;
}

/** Журнал у пам'яті поверх останньої збереженої події: після роботи — що оновити й що додати. */
export function createEventLog(lastSaved: RequestEventDraft | null): EventLog & { changes(): { update: RequestEventDraft | null; insert: RequestEventDraft[] } } {
  const initial = lastSaved ? JSON.stringify(lastSaved) : null;
  const saved = lastSaved ? structuredClone(lastSaved) : null;
  const added: RequestEventDraft[] = [];
  return {
    last: () => added[added.length - 1] ?? saved,
    add: (e) => {
      added.push(e);
    },
    changes: () => ({ update: saved && JSON.stringify(saved) !== initial ? saved : null, insert: added }),
  };
}

const COALESCE_MS = 10 * 60_000;

/** Остання подія тієї самої групи й користувача, не старша за 10 хв, — щоб злити з нею. */
function mergeable(log: EventLog, group: string, user: UserRef | null, at: ISODateTime): RequestEventDraft | null {
  const last = log.last();
  return last?.group === group && last.user?.id === user?.id && Date.parse(at) - Date.parse(last.at) < COALESCE_MS ? last : null;
}

function addCounted(
  log: EventLog,
  e: { kind: RequestEventDto['kind']; group: string; add: Counts; summary: (c: Counts) => string; user: UserRef | null; at: ISODateTime },
): void {
  const last = mergeable(log, e.group, e.user, e.at);
  if (last) {
    const counts = { ...(last.counts ?? {}) };
    for (const [k, v] of Object.entries(e.add)) counts[k] = (counts[k] ?? 0) + v;
    last.counts = counts;
    last.summary = e.summary(counts);
    last.at = e.at;
    return;
  }
  log.add({ at: e.at, user: e.user, kind: e.kind, group: e.group, counts: e.add, summary: e.summary(e.add) });
}

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

const approvalKeyOf = (r: Pick<RequestDocState, 'lines'>) =>
  r.lines
    .filter((l) => l.approval.approved)
    .map((l) => `${l.id}:${l.approval.approvedQty ?? ''}`)
    .join('|');

export function documentEventsBefore(r: RequestDocState): DocumentEventsBefore {
  return {
    approvalKey: approvalKeyOf(r),
    priceChangedAt: new Map(r.offers.map((o) => [o.id, o.priceChange?.changedAt ?? null])),
    lines: new Map(r.lines.map((l) => [l.id, lineKey(l)])),
    lineMarkup: new Map(r.lines.map((l) => [l.id, stableJson(l.markup)])),
    selection: new Map(r.lines.map((l) => [l.id, l.selection.blockId])),
    excluded: new Map(r.offers.map((o) => [o.id, o.excluded])),
    blocks: new Map(r.blocks.map((b) => [b.id, { supplierId: b.supplierId, USD: b.rates.USD, EUR: b.rates.EUR }])),
    markup: { method: r.markup.method, value: r.markup.value },
  };
}

export interface DocumentEventsContext {
  supplierName(id: UUID | null): string;
  kps: readonly Pick<KpDocumentDto, 'id' | 'onlyApproved' | 'version' | 'numberLabel' | 'snapshot'>[];
  user: UserRef;
  at: ISODateTime;
}

/** Події збереження: позиції, підбір, курси, націнка, оновлення ціни з прайсу, погодження. */
export function recordDocumentEvents(log: EventLog, r: RequestDocState, before: DocumentEventsBefore, patch: DocumentPatch, ctx: DocumentEventsContext): void {
  const { user, at } = ctx;
  const lines = new Map(r.lines.map((l) => [l.id, l]));
  const lc: Counts = { added: 0, removed: 0, edited: 0 };
  for (const [id, key] of before.lines) {
    const l = lines.get(id);
    if (!l) lc.removed++;
    else if (lineKey(l) !== key) lc.edited++;
  }
  for (const id of lines.keys()) if (!before.lines.has(id)) lc.added++;
  if (lc.added || lc.removed || lc.edited) addCounted(log, { kind: 'lines_change', group: 'lines', add: lc, summary: linesSummary, user, at });

  const blocks = new Map(r.blocks.map((b) => [b.id, b]));
  for (const [id, b] of before.blocks) {
    const now = blocks.get(id);
    if (!now) {
      log.add({ at, user, kind: 'sourcing_change', summary: `Прибрано постачальника ${ctx.supplierName(b.supplierId)}` });
      continue;
    }
    const changed = (['USD', 'EUR'] as const).filter((c) => now.rates[c] !== b[c]).map((c) => `${c} ${formatRate(b[c])} → ${formatRate(now.rates[c])}`);
    if (changed.length) log.add({ at, user, kind: 'sourcing_change', summary: `Курс ${ctx.supplierName(now.supplierId)}: ${changed.join(', ')}` });
  }
  for (const b of r.blocks) {
    if (!before.blocks.has(b.id)) log.add({ at, user, kind: 'sourcing_change', summary: `Додано постачальника ${ctx.supplierName(b.supplierId)}` });
  }

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
    addCounted(log, { kind: 'sourcing_change', group: 'picks', add: pc, summary: picksSummary, user, at });
  }

  if (before.markup.method !== r.markup.method || before.markup.value !== r.markup.value) {
    log.add({ at, user, kind: 'markup_change', summary: `Спосіб націнки заявки: ${markupLabel(before.markup)} → ${markupLabel(r.markup)}` });
  }
  let markupLines = 0;
  for (const l of r.lines) {
    const was = before.lineMarkup.get(l.id);
    if (was !== undefined && was !== stableJson(l.markup)) markupLines++;
  }
  if (markupLines) addCounted(log, { kind: 'markup_change', group: 'markupLines', add: { lines: markupLines }, summary: markupLinesSummary, user, at });

  for (const o of patch.upsert?.offers ?? []) {
    const ch = o.priceChange;
    if (!ch || ch.reason === 'copy_refresh' || before.priceChangedAt.get(o.id) === ch.changedAt) continue;
    const line = r.lines.find((l) => l.id === o.lineId);
    const prev = `${formatRate(ch.prevPurchasePriceCur)}${ch.prevCurrency !== o.currency ? ` ${CURRENCY_LABELS[ch.prevCurrency]}` : ''}`;
    const what = ch.reason === 'catalog_refresh' ? 'ціну оновлено з прайсу' : 'ціну змінено в заявці';
    log.add({
      at,
      user,
      kind: 'price_update',
      summary: `Рядок ${line?.position ?? '—'}${o.sku ? `, ${o.sku}` : ''}: ${what} ${prev} → ${formatRate(o.purchasePriceCur)} ${CURRENCY_LABELS[o.currency]}`,
    });
  }

  if (approvalKeyOf(r) !== before.approvalKey) {
    const approved = r.lines.filter((l) => l.approval.approved).length;
    const base = approvalBaseKp(ctx.kps, r.header.approvalKpId);
    const of = base ? `${base.snapshot.rows.length} (КП № ${base.numberLabel})` : String(r.lines.filter(isActiveLine).length);
    const summary = approved ? `Погоджено позицій: ${approved} з ${of}` : 'Погодження знято';
    const last = mergeable(log, 'approval', user, at);
    if (last) {
      last.summary = summary;
      last.at = at;
    } else {
      log.add({ at, user, kind: 'approval', group: 'approval', summary });
    }
  }
}
