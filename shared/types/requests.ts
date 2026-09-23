import type {
  AttachmentKind,
  AvailabilityStatus,
  CurrencyCode,
  DiscountFormula,
  FopPriceBasis,
  MarkupMethod,
  PriceRounding,
  ProductNameKind,
  RatePolicy,
  RequestStatus,
} from '../enums';
import type { ClientRef, ContactRef, CounterpartyRef } from './clients';
import type { ISODate, ISODateTime, ListQuery, UUID, UserRef } from './common';
import type { KpSettings } from './kp';
import type { CatalogSnapshot } from './products';
import type { RatesPair, SupplierRef } from './suppliers';
import type { OwnCompanyDto } from './users';

// ── Блокування ────────────────────────────────────────────────────
export interface LockInfo {
  userId: UUID;
  userShortName: string;
  sessionId: UUID;
  lockedAt: ISODateTime;
  expiresAt: ISODateTime;
  /** Той самий користувач. */
  isMine: boolean;
  /** Ця вкладка (sessionId збігся). */
  isMySession: boolean;
}

// ── Реєстр ────────────────────────────────────────────────────────
export interface RequestListItem {
  id: UUID;
  number: number;
  /** '000001' */
  numberLabel: string;
  requestDate: ISODate;
  status: RequestStatus;
  title: string | null;
  client: ClientRef | null;
  counterparty: Pick<CounterpartyRef, 'id' | 'nameShort' | 'edrpou'> | null;
  manager: UserRef;
  /** «Сума» — продаж з ПДВ після націнки. */
  totalSaleGross: number;
  /** «Погоджена сума»; null — погодження ще не було (індикатор «Погоджено»). */
  approvedSaleGross: number | null;
  linesCount: number;
  suppliersCount: number;
  /** > 0 — індикатор «КП сформовано». */
  kpCount: number;
  /** Номер останнього КП і чи воно фінальне (колонка «КП» реєстру). */
  lastKp: { kpNumber: number; final: boolean } | null;
  attachmentsCount: number;
  lock: LockInfo | null;
  updatedAt: ISODateTime;
}

export interface RequestListQuery extends ListQuery {
  status?: RequestStatus[];
  clientId?: UUID;
  managerId?: UUID;
  dateFrom?: ISODate;
  dateTo?: ISODate;
  mine?: boolean;
}

/** Порція реєстру: заявок з роками стає тисячі — читаємо шматками. */
export interface RequestPageQuery extends RequestListQuery {
  offset: number;
  limit: number;
}

export interface RequestPage {
  items: RequestListItem[];
  /** Скільки всього під фільтрами; null — не рахували (не перша порція). */
  total: number | null;
}

export interface CreateRequestBody {
  clientId?: UUID | null;
  counterpartyId?: UUID | null;
  contactId?: UUID | null;
  ownCompanyId?: UUID;
  managerId?: UUID;
  requestDate?: ISODate;
  title?: string | null;
}

export interface CreateRequestResult {
  id: UUID;
  number: number;
}

// ── Документ заявки ───────────────────────────────────────────────
export interface RequestDocument {
  id: UUID;
  version: number;
  header: RequestHeader;
  markup: MarkupSettings;
  /** Відсортовані за position. */
  lines: RequestLine[];
  /** Відсортовані за position. */
  blocks: SupplierBlock[];
  /** ≤ 1 на пару (lineId, blockId). */
  offers: Offer[];
  lock: LockInfo | null;
  /** Лише читання (для показу й розрахунку). */
  refs: DocumentRefs;
  meta: RequestDocumentMeta;
}

export interface RequestDocumentMeta {
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  updatedBy: UserRef | null;
  sourceRequestId: UUID | null;
  copyInfo: CopyReport | null;
  kpCount: number;
  attachmentsCount: number;
  readOnlyReason: 'status' | 'lock' | null;
}

/** Курси НБУ на дату заявки (довідково + fallback для блоків). */
export interface HeaderRates extends RatesPair {
  date: ISODate | null;
}

export interface RequestHeader {
  number: number;
  requestDate: ISODate;
  status: RequestStatus;
  title: string | null;
  clientId: UUID | null;
  counterpartyId: UUID | null;
  contactId: UUID | null;
  ownCompanyId: UUID;
  managerId: UUID;
  notes: string | null;
  purchaseNote: string | null;
  rates: HeaderRates;
  vatRatePct: number;
  /** Формула знижки від РРЦ — зафіксована в заявці (глобальна лишається пресетом для нових). */
  discountFormula: DiscountFormula;
  kpSettings: KpSettings;
  /** КП, яку погоджує клієнт; null/немає — остання звичайна версія. */
  approvalKpId?: UUID | null;
  /** Заповнюється при переході в 'cancelled'. */
  cancelReason: string | null;
}
export type RequestHeaderEditable = Omit<RequestHeader, 'number' | 'status' | 'cancelReason'>;

export interface MarkupSettings {
  method: MarkupMethod;
  value: number;
  rounding: PriceRounding;
  excludeUnavailable: boolean;
}

/** Ручне затвердження галочкою (одна на рядок). */
export interface LineSelection {
  blockId: UUID | null;
}

/** Перевизначення націнки по рядку; усі null → діє MarkupSettings заявки. */
export interface LineMarkupOverride {
  method: MarkupMethod | null;
  value: number | null;
  manualPriceNet: number | null;
  /** Ф14 «Вручну»: введена G (N = round2(G ÷ 1,2)); діє, якщо manualPriceNet = null. */
  manualPriceGross?: number | null;
}

/** Погодження клієнтом. */
export interface LineApproval {
  approved: boolean;
  approvedQty: number | null;
}

export interface RequestLine {
  id: UUID;
  position: number;
  clientName: string;
  clientUnit: string | null;
  qty: number;
  clientNote: string | null;
  selection: LineSelection;
  markup: LineMarkupOverride;
  approval: LineApproval;
  /** Власна назва для КП (перекриває джерело назви). */
  kpName: string | null;
}

export interface SupplierBlock {
  id: UUID;
  position: number;
  supplierId: UUID | null;
  legalEntityId: UUID | null;
  defaultCurrency: CurrencyCode;
  /** Знімок курсів блоку (F33 при створенні, далі — редагується). */
  rates: RatesPair;
  /** Звідки курси: політика постачальника при створенні або 'manual' після ручної зміни. */
  rateSource: RatePolicy;
  /** Дата курсів (дата прайсу / НБУ). */
  ratesDate: ISODate | null;
  supplierMarkupPct: number;
  pricesIncludeVat: boolean;
  note: string | null;
}

export interface Offer {
  id: UUID;
  lineId: UUID;
  blockId: UUID;
  productId: UUID | null;
  sku: string | null;
  nameWork: string | null;
  name1c: string | null;
  nameKind: ProductNameKind;
  unitCode: string | null;
  currency: CurrencyCode;
  /** Без ПДВ, у валюті. */
  purchasePriceCur: number | null;
  /** З ПДВ, у валюті. */
  rrpCur: number | null;
  /** null → line.qty */
  qty: number | null;
  multiplicity: number | null;
  /** Кратність для цієї пропозиції вимкнено: кількість не округлюється (кратність товару в каталозі лишається). */
  noRounding?: boolean;
  stockQty: number | null;
  availability: AvailabilityStatus;
  priceDate: ISODateTime | null;
  excluded: boolean;
  excludeReason: string | null;
  note: string | null;
  priceChange: OfferPriceChange | null;
  /** Поточний стан у каталозі (лише читання). */
  catalog?: CatalogSnapshot | null;
}

export interface OfferPriceChange {
  prevCurrency: CurrencyCode;
  prevPurchasePriceCur: number | null;
  prevRrpCur: number | null;
  prevRate: number | null;
  prevUnitNetUah: number | null;
  reason: 'copy_refresh' | 'catalog_refresh' | 'manual_edit';
  changedAt: ISODateTime;
}

export interface PricingSettings {
  vatRatePct: number;
  priceStaleDays: number;
  /** Курс із прайсу діє стільки днів від дати прайсу (див. supplierDefaultRatesInfo). */
  priceListRateMaxAgeDays: number;
  discountFormula: DiscountFormula;
  autoRoundMultiplicity: boolean;
  fopPriceBasis: FopPriceBasis;
}

export interface DocumentRefs {
  suppliers: Record<UUID, SupplierRef>;
  client: ClientRef | null;
  counterparty: CounterpartyRef | null;
  contact: ContactRef | null;
  ownCompany: Pick<OwnCompanyDto, 'id' | 'nameShort' | 'isVatPayer'>;
  manager: UserRef;
  pricing: PricingSettings;
}

// ── Збереження (дельта) ───────────────────────────────────────────
export type RequestLineInput = RequestLine;
export type SupplierBlockInput = SupplierBlock;
export type OfferInput = Omit<Offer, 'catalog'>;

export interface DocumentPatch {
  baseVersion: number;
  sessionId: UUID;
  header?: Partial<RequestHeaderEditable>;
  markup?: Partial<MarkupSettings>;
  upsert?: { lines?: RequestLineInput[]; blocks?: SupplierBlockInput[]; offers?: OfferInput[] };
  delete?: { lineIds?: UUID[]; blockIds?: UUID[]; offerIds?: UUID[] };
  /** Закриття вкладки: після збереження одразу звільнити заявку (одним запитом — другий після закриття може не піти). */
  release?: boolean;
}

export interface RequestTotalsSummary {
  linesCount: number;
  suppliersCount: number;
  totalPurchaseGross: number;
  totalSaleNet: number;
  /** «Сума» (Ф17): Разом з ПДВ за Ф16 у режимі цін заявки; ФОП — «Разом». */
  totalSaleGross: number;
  profitNet: number;
  /** «Погоджена сума» (Ф18); null — погодження не було. */
  approvedSaleGross: number | null;
}

/** Підсумки, пораховані в редакторі: плюс те, що в реєстрі не зберігається. */
export interface RequestComputedTotals extends RequestTotalsSummary {
  /** Закупівля без ПДВ за ефективним вибором (підбір показує суми без ПДВ). */
  totalPurchaseNet: number;
}

export interface SaveDocumentResponse {
  version: number;
  updatedAt: ISODateTime;
  /** null — заявку звільнено (release). */
  lockExpiresAt: ISODateTime | null;
  status: RequestStatus;
  totals: RequestTotalsSummary;
}

// ── Статуси, копіювання, історія, вкладення ───────────────────────
export interface StatusChangeBody {
  to: RequestStatus;
  reason?: string | null;
  baseVersion: number;
  sessionId: UUID;
}

export interface StatusChangeResult {
  status: RequestStatus;
  version: number;
}

export interface AllowedTransition {
  to: RequestStatus;
  requiresReason: boolean;
  /** Запитати необов'язкову причину (скасування). */
  asksReason: boolean;
  /** Підпис дії українською. */
  label: string;
}

export interface CopyRequestBody {
  include: 'lines' | 'sourcing' | 'full';
  priceMode: 'keep' | 'refresh';
  clientId?: UUID | null;
  counterpartyId?: UUID | null;
  contactId?: UUID | null;
}

export interface CopyReport {
  sourceRequestId: UUID;
  sourceNumber: number;
  include: CopyRequestBody['include'];
  priceMode: CopyRequestBody['priceMode'];
  offersTotal: number;
  offersRefreshed: number;
  offersUnchanged: number;
  offersNotInCatalog: number;
  priceUp: number;
  priceDown: number;
  ratesChanged: boolean;
  createdAt: ISODateTime;
}

export interface CopyRequestResult {
  id: UUID;
  number: number;
  report: CopyReport;
}

export interface StatusHistoryEntry {
  id: number;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  reason: string | null;
  changedBy: UserRef | null;
  changedAt: ISODateTime;
}

/** Подія історії заявки (спрощений журнал для вкладки «Історія»). */
export interface RequestEventDto {
  id: number;
  at: ISODateTime;
  user: UserRef | null;
  kind:
    | 'created'
    | 'status_change'
    | 'lines_change'
    | 'sourcing_change'
    | 'markup_change'
    | 'price_update'
    | 'kp_created'
    | 'approval'
    | 'copy'
    | 'lock_force'
    | 'files';
  /** Короткий опис українською. */
  summary: string;
  /** Службове: сусідні зміни однієї групи (галочки, позиції) зливаються в одну подію з лічильниками. */
  group?: string;
  counts?: Record<string, number>;
}

export interface RequestHistoryResponse {
  /** Від найновішої. */
  events: RequestEventDto[];
}

export interface AttachmentDto {
  id: UUID;
  requestId: UUID;
  kind: AttachmentKind;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  note: string | null;
  kpDocumentId: UUID | null;
  uploadedBy: UserRef | null;
  createdAt: ISODateTime;
  downloadUrl: string;
}

export interface LockStatusResponse {
  lock: LockInfo | null;
  version: number;
  status: RequestStatus;
  updatedAt: ISODateTime;
}

export interface LockAcquireBody {
  sessionId: UUID;
}

export interface LockForceBody {
  sessionId: UUID;
  takeOver: boolean;
}
