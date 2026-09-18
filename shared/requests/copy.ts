// Копія заявки (КОП-1, КОП-2): новий номер, сьогоднішня дата, «В роботі», відповідальний — хто копіює;
// позиції завжди, блоки й підбір — за вибором; ціни — з оригіналу або перераховані за каталогом (▲▼ у клітинках).
import { formatRequestNumber } from '../format';
import { catalogSnapshotOf, createSupplierBlock, refreshOfferFromCatalog, resolveRate, type ProductForOffer } from '../pricing';
import type {
  CopyReport,
  CopyRequestBody,
  HeaderRates,
  ISODate,
  ISODateTime,
  KpSettings,
  MarkupSettings,
  Offer,
  RequestLine,
  SupplierBlock,
  SupplierRef,
  UserRef,
  UUID,
} from '../types';
import { stripCatalog, type RequestDocState } from './document';

export const COPY_INCLUDE_LABELS: Record<CopyRequestBody['include'], string> = {
  lines: 'лише позиції клієнта',
  sourcing: 'позиції і підбір',
  full: 'позиції, підбір і націнка',
};

/** Клієнт, на якого копіюють (для контрагента й контакту за замовчуванням). */
export interface CopyClient {
  id: UUID;
  counterparties: readonly { id: UUID; isDefault: boolean }[];
  contacts: readonly { id: UUID; counterpartyId: UUID | null }[];
}

export interface CopyInputs {
  source: RequestDocState & { id: UUID };
  body: CopyRequestBody;
  number: number;
  today: ISODate;
  now: Date;
  at: ISODateTime;
  user: UserRef;
  /** Курси на сьогодні (для шапки й перерахованих блоків). */
  rates: HeaderRates;
  /** Клієнт копії, якщо його змінили. */
  client: CopyClient | null;
  /** Налаштування бланка КП за замовчуванням для юрособи оригіналу. */
  kpSettings: KpSettings;
  /** Спосіб націнки нової заявки (якщо націнку не копіюють). */
  markupDefaults: MarkupSettings;
  suppliers: Readonly<Record<UUID, SupplierRef>>;
  /** Поточний стан товарів каталогу (для «перерахувати ціни»). */
  products: ReadonlyMap<UUID, ProductForOffer>;
  newId(): UUID;
}

export interface CopyResult {
  state: RequestDocState;
  report: CopyReport;
  /** Рядок історії нової заявки. */
  eventSummary: string;
}

export function copyRequestDoc(i: CopyInputs): CopyResult {
  const src = i.source;
  const { body } = i;
  const clientId = body.clientId !== undefined ? body.clientId : src.header.clientId;
  const sameClient = clientId === src.header.clientId;
  const counterpartyId =
    body.counterpartyId !== undefined
      ? body.counterpartyId
      : sameClient
        ? src.header.counterpartyId
        : (i.client?.counterparties.find((c) => c.isDefault)?.id ?? i.client?.counterparties[0]?.id ?? null);
  const contactId =
    body.contactId !== undefined
      ? body.contactId
      : sameClient
        ? src.header.contactId
        : (i.client?.contacts.find((c) => c.counterpartyId === counterpartyId)?.id ?? null);

  const header = {
    ...structuredClone(src.header),
    number: i.number,
    requestDate: i.today,
    status: 'in_progress' as const,
    clientId: clientId ?? null,
    counterpartyId,
    contactId,
    managerId: i.user.id,
    rates: i.rates,
    kpSettings: i.kpSettings,
    approvalKpId: null,
    cancelReason: null,
  };

  const withSourcing = body.include !== 'lines';
  const full = body.include === 'full';
  const lineIds = new Map<UUID, UUID>();
  const blockIds = new Map<UUID, UUID>();

  const blocks: SupplierBlock[] = withSourcing
    ? src.blocks.map((b) => {
        const id = i.newId();
        blockIds.set(b.id, id);
        const supplier = b.supplierId ? i.suppliers[b.supplierId] : undefined;
        if (body.priceMode === 'refresh' && supplier) return createSupplierBlock(supplier, i.rates, { id, position: b.position });
        return { ...structuredClone(b), id };
      })
    : [];
  const lines: RequestLine[] = src.lines.map((l) => {
    const id = i.newId();
    lineIds.set(l.id, id);
    return {
      ...structuredClone(l),
      id,
      selection: { blockId: withSourcing && l.selection.blockId ? (blockIds.get(l.selection.blockId) ?? null) : null },
      markup: full ? structuredClone(l.markup) : { method: null, value: null, manualPriceNet: null },
      approval: { approved: false, approvedQty: null },
      kpName: full ? l.kpName : null,
    };
  });

  const report: CopyReport = {
    sourceRequestId: src.id,
    sourceNumber: src.header.number,
    include: body.include,
    priceMode: body.priceMode,
    offersTotal: 0,
    offersRefreshed: 0,
    offersUnchanged: 0,
    offersNotInCatalog: 0,
    priceUp: 0,
    priceDown: 0,
    ratesChanged: blocks.some((b, idx) => b.rates.USD !== src.blocks[idx]?.rates.USD || b.rates.EUR !== src.blocks[idx]?.rates.EUR),
    createdAt: i.at,
  };
  const offers: Offer[] = [];
  if (withSourcing) {
    for (const o of src.offers) {
      const lineId = lineIds.get(o.lineId);
      const blockId = blockIds.get(o.blockId);
      if (!lineId || !blockId) continue;
      report.offersTotal++;
      let next: Offer = { ...stripCatalog(structuredClone(o)), id: i.newId(), lineId, blockId, priceChange: null };
      const product = o.productId ? i.products.get(o.productId) : undefined;
      if (body.priceMode === 'refresh') {
        if (!product) {
          report.offersNotInCatalog++;
        } else {
          const oldBlock = src.blocks.find((b) => b.id === o.blockId);
          const prevRate = oldBlock ? resolveRate(o.currency, oldBlock.rates, src.header.rates) : null;
          next = stripCatalog(refreshOfferFromCatalog(next, catalogSnapshotOf(product), prevRate, i.now, 'copy_refresh', oldBlock?.supplierMarkupPct ?? 0));
          if (next.priceChange) {
            report.offersRefreshed++;
            if (next.currency === o.currency && next.purchasePriceCur != null && o.purchasePriceCur != null) {
              if (next.purchasePriceCur > o.purchasePriceCur) report.priceUp++;
              else if (next.purchasePriceCur < o.purchasePriceCur) report.priceDown++;
            }
          } else {
            report.offersUnchanged++;
          }
        }
      } else {
        report.offersUnchanged++;
      }
      offers.push(next);
    }
  }

  const prices = body.priceMode === 'refresh' ? `ціни перераховано за каталогом (змінилось: ${report.offersRefreshed})` : 'ціни з оригіналу';
  return {
    state: { header, markup: full ? structuredClone(src.markup) : structuredClone(i.markupDefaults), lines, blocks, offers },
    report,
    eventSummary: `Створено копією заявки № ${formatRequestNumber(src.header.number)}: ${COPY_INCLUDE_LABELS[body.include]}, ${prices}`,
  };
}
