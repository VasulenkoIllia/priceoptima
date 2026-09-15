// Дельта між збереженою й поточною версією документа. Завдяки immer незмінені об'єкти мають ті самі посилання,
// тож порівняння за посиланням точне й дешеве.
import type { DocumentPatch, MarkupSettings, Offer, OfferInput, RequestDocument, RequestHeaderEditable, UUID } from '@shared/types';

export type DocumentChanges = Omit<DocumentPatch, 'baseVersion' | 'sessionId'>;

const HEADER_KEYS: readonly (keyof RequestHeaderEditable)[] = [
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
];
const MARKUP_KEYS: readonly (keyof MarkupSettings)[] = ['method', 'value', 'rounding', 'excludeUnavailable'];

function changedKeys<T extends object, K extends keyof T>(prev: T, next: T, keys: readonly K[]): Partial<Pick<T, K>> | null {
  if (prev === next) return null;
  const out: Partial<Pick<T, K>> = {};
  let any = false;
  for (const k of keys) {
    if (!Object.is(prev[k], next[k])) {
      out[k] = next[k];
      any = true;
    }
  }
  return any ? out : null;
}

function diffList<T extends { id: UUID }>(prev: readonly T[], next: readonly T[]): { upsert: T[]; deleted: UUID[] } {
  const prevById = new Map(prev.map((x) => [x.id, x]));
  const nextIds = new Set<UUID>();
  const upsert: T[] = [];
  for (const item of next) {
    nextIds.add(item.id);
    if (prevById.get(item.id) !== item) upsert.push(item);
  }
  const deleted = prev.filter((x) => !nextIds.has(x.id)).map((x) => x.id);
  return { upsert, deleted };
}

export function toOfferInput(offer: Offer): OfferInput {
  const copy: Offer = { ...offer };
  delete copy.catalog;
  return copy;
}

/** null — змін немає. */
export function diffDocuments(prev: RequestDocument, next: RequestDocument): DocumentChanges | null {
  const changes: DocumentChanges = {};
  const header = changedKeys(prev.header, next.header, HEADER_KEYS);
  if (header) changes.header = header;
  const markup = changedKeys(prev.markup, next.markup, MARKUP_KEYS);
  if (markup) changes.markup = markup;

  const lines = diffList(prev.lines, next.lines);
  const blocks = diffList(prev.blocks, next.blocks);
  const offers = diffList(prev.offers, next.offers);
  const upsert: NonNullable<DocumentChanges['upsert']> = {};
  if (lines.upsert.length) upsert.lines = lines.upsert;
  if (blocks.upsert.length) upsert.blocks = blocks.upsert;
  if (offers.upsert.length) upsert.offers = offers.upsert.map(toOfferInput);
  const del: NonNullable<DocumentChanges['delete']> = {};
  if (lines.deleted.length) del.lineIds = lines.deleted;
  if (blocks.deleted.length) del.blockIds = blocks.deleted;
  if (offers.deleted.length) del.offerIds = offers.deleted;
  if (Object.keys(upsert).length) changes.upsert = upsert;
  if (Object.keys(del).length) changes.delete = del;
  return Object.keys(changes).length ? changes : null;
}
