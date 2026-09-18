// Документ заявки: застосування дельти збереження (однаково для сервера й тестів). Чисті функції, вхід не мутується.
import type { DocumentPatch, MarkupSettings, Offer, RequestHeader, RequestHeaderEditable, RequestLine, SupplierBlock, UUID } from '../types';
import { stableJson } from './stable';

/** Стан документа, який зберігається (без refs, lock і meta). */
export interface RequestDocState {
  header: RequestHeader;
  markup: MarkupSettings;
  lines: RequestLine[];
  blocks: SupplierBlock[];
  /** Знімки без поля catalog. */
  offers: Offer[];
}

export const EDITABLE_HEADER_KEYS: readonly (keyof RequestHeaderEditable)[] = [
  'requestDate',
  'title',
  'clientId',
  'counterpartyId',
  'contactId',
  'ownCompanyId',
  'managerId',
  'notes',
  'purchaseNote',
  'rates',
  'vatRatePct',
  'kpSettings',
  'approvalKpId',
];

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

/** Знімок пропозиції без поточного стану каталогу (catalog лише для показу). */
export function stripCatalog(offer: Offer): Offer {
  const { catalog: _catalog, ...rest } = offer;
  return rest;
}

function upsertById<T extends { id: UUID }>(list: readonly T[], items: readonly T[] | undefined): T[] {
  const out = [...list];
  if (!items?.length) return out;
  const index = new Map(out.map((x, i) => [x.id, i]));
  for (const item of items) {
    const i = index.get(item.id);
    if (i === undefined) {
      index.set(item.id, out.length);
      out.push(item);
    } else {
      out[i] = item;
    }
  }
  return out;
}

/**
 * Новий стан після дельти. Каскад: видалений рядок чи блок забирає свої пропозиції; пропозиції — лише для наявних рядків
 * і блоків, не більше однієї на пару (перемагає остання); ✔ на видалений блок знімається.
 */
export function applyDocumentPatch(state: RequestDocState, patch: DocumentPatch): RequestDocState {
  const p = structuredClone(patch);
  const header = { ...state.header };
  if (p.header) {
    const target = header as unknown as Record<string, unknown>;
    const src = p.header as Record<string, unknown>;
    for (const key of EDITABLE_HEADER_KEYS) if (key in src && src[key] !== undefined) target[key] = src[key];
  }
  const markup = p.markup ? { ...state.markup, ...p.markup } : { ...state.markup };

  let lines = [...state.lines];
  let blocks = [...state.blocks];
  let offers = [...state.offers];
  const del = p.delete ?? {};
  if (del.lineIds?.length) {
    const ids = new Set(del.lineIds);
    lines = lines.filter((l) => !ids.has(l.id));
    offers = offers.filter((o) => !ids.has(o.lineId));
  }
  if (del.blockIds?.length) {
    const ids = new Set(del.blockIds);
    blocks = blocks.filter((b) => !ids.has(b.id));
    offers = offers.filter((o) => !ids.has(o.blockId));
  }
  if (del.offerIds?.length) {
    const ids = new Set(del.offerIds);
    offers = offers.filter((o) => !ids.has(o.id));
  }

  const up = p.upsert ?? {};
  lines = upsertById(lines, up.lines);
  blocks = upsertById(blocks, up.blocks);
  offers = upsertById(offers, up.offers?.map((o) => stripCatalog(o as Offer)));

  const lineIds = new Set(lines.map((l) => l.id));
  const blockIds = new Set(blocks.map((b) => b.id));
  const byPair = new Map<string, Offer>();
  for (const o of offers) if (lineIds.has(o.lineId) && blockIds.has(o.blockId)) byPair.set(`${o.lineId}|${o.blockId}`, o);
  lines = lines.map((l) => (l.selection.blockId && !blockIds.has(l.selection.blockId) ? { ...l, selection: { blockId: null } } : l));
  return { header, markup, lines: lines.sort(byPosition), blocks: blocks.sort(byPosition), offers: [...byPair.values()] };
}

export interface EntityDiff<T> {
  upsert: T[];
  deleteIds: UUID[];
}

/** Що записати в базу: нові й змінені записи, видалені id (порівняння за вмістом). */
export function diffById<T extends { id: UUID }>(before: readonly T[], after: readonly T[]): EntityDiff<T> {
  const prev = new Map(before.map((x) => [x.id, stableJson(x)]));
  const next = new Set(after.map((x) => x.id));
  return {
    upsert: after.filter((x) => prev.get(x.id) !== stableJson(x)),
    deleteIds: before.filter((x) => !next.has(x.id)).map((x) => x.id),
  };
}
