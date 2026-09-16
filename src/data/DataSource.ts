// Контракт джерела даних (§8 ui-prototype). Методи 1:1 з майбутнім REST; зараз — MockDataSource у браузері.
import type {
  AppSettings,
  AppSettingsPatch,
  ClientDetail,
  ClientInput,
  ClientListItem,
  ClientLookupItem,
  CopyRequestBody,
  CopyRequestResult,
  CreateRequestBody,
  CreateRequestResult,
  CurrencyRateDto,
  DocumentPatch,
  EffectiveRates,
  ISODate,
  KpCreateBody,
  KpDocumentDto,
  ListQuery,
  LockInfo,
  LockStatusResponse,
  MeResponse,
  OwnCompanyDto,
  OwnCompanyInput,
  PriceHistoryEntry,
  PriceImportBody,
  PriceUpdateDto,
  ProductDetail,
  ProductImageDto,
  ProductImagePatch,
  ProductImageUrlInput,
  ProductInput,
  ProductListQuery,
  ProductPickDto,
  ProductPriceUpdateInput,
  ProductPriceUpdateResult,
  ProductSearchQuery,
  RequestDocument,
  RequestHistoryResponse,
  RequestListItem,
  RequestListQuery,
  SaveDocumentResponse,
  SkuLookupBody,
  SkuLookupResult,
  StatusChangeBody,
  StatusChangeResult,
  SupplierDetail,
  SupplierInput,
  SupplierListItem,
  SupplierPriceSourceInput,
  SupplierPriceSourceSettings,
  UserDto,
  UserInput,
  UUID,
} from '@shared/types';

export interface LockAcquireResult {
  /** true — блокування належить цій вкладці. */
  acquired: boolean;
  /** Поточний власник (ця вкладка або інша); null — заявка вільна. */
  lock: LockInfo | null;
}

/** Зовнішні зміни, на які реагує UI. */
export type DataSourceEvent =
  /** Дані змінено в іншій вкладці — перечитати. */
  | { kind: 'db' }
  /** Демо-дані скинуто — перезавантажити сторінку. */
  | { kind: 'reset' }
  /** Змінився власник блокування заявки (будь-яка вкладка). */
  | { kind: 'lock'; requestId: UUID; lock: LockInfo | null }
  /** Адміністратор забрав редагування у вкладки fromSessionId. */
  | { kind: 'lock-forced'; requestId: UUID; lock: LockInfo; fromSessionId: UUID };

export interface CallOptions {
  /** Виклик під час закриття сторінки (REST — fetch keepalive; mock — без затримки й одразу в IndexedDB). */
  keepalive?: boolean;
}

export interface DataSource {
  /** Ідентифікатор вкладки (для блокувань і збережень). */
  readonly sessionId: UUID;
  subscribe(listener: (event: DataSourceEvent) => void): () => void;

  // ── Сесія, користувачі, налаштування ─────────────────────────────
  /** null — ніхто не увійшов. */
  me(): Promise<MeResponse | null>;
  /** Вхід за логіном і паролем (UNAUTHORIZED — невірні). Вхід запам'ятовується в браузері — спільний для вкладок. */
  login(login: string, password: string): Promise<MeResponse>;
  logout(): Promise<void>;
  listUsers(): Promise<UserDto[]>;
  /** Лише адміністратор. Паролів тут немає: у прототипі входить лише адміністратор із сіду, решта користувачів — довідник. */
  saveUser(id: UUID | null, input: UserInput): Promise<UserDto>;
  getSettings(): Promise<AppSettings>;
  updateSettings(patch: AppSettingsPatch): Promise<AppSettings>;
  listOwnCompanies(): Promise<OwnCompanyDto[]>;
  /** Лише адміністратор. */
  saveOwnCompany(id: UUID, input: OwnCompanyInput): Promise<OwnCompanyDto>;

  // ── Клієнти ─────────────────────────────────────────────────────
  listClients(query?: ListQuery): Promise<ClientListItem[]>;
  getClient(id: UUID): Promise<ClientDetail>;
  searchClients(q: string): Promise<ClientLookupItem[]>;
  saveClient(id: UUID | null, input: ClientInput): Promise<ClientDetail>;

  // ── Постачальники ───────────────────────────────────────────────
  listSuppliers(): Promise<SupplierListItem[]>;
  getSupplier(id: UUID): Promise<SupplierDetail>;
  saveSupplier(id: UUID | null, input: SupplierInput): Promise<SupplierDetail>;
  /** Налаштування вигрузки прайсу: посилання й токен назовні не віддаються — лише «збережено». */
  getSupplierPriceSource(supplierId: UUID): Promise<SupplierPriceSourceSettings>;
  saveSupplierPriceSource(supplierId: UUID, input: SupplierPriceSourceInput): Promise<SupplierPriceSourceSettings>;
  /** Оновити прайс постачальника зараз (у робочій системі прайси приходять автоматично; тут — імітація). */
  refreshSupplierPrices(supplierId: UUID): Promise<PriceUpdateDto>;
  /** Журнал оновлень прайсів, від найновішого. */
  listPriceUpdates(supplierId?: UUID): Promise<PriceUpdateDto[]>;
  /** Прайс файлом (постачальники без вигрузки за посиланням): звірка за кодом; dryRun — лише порахувати зміни. */
  importSupplierPrices(supplierId: UUID, body: PriceImportBody): Promise<PriceUpdateDto>;

  // ── Каталог ─────────────────────────────────────────────────────
  /** Товари каталогу (прототип — усі одразу, фільтрація на клієнті). */
  listProducts(query?: ProductListQuery): Promise<ProductDetail[]>;
  searchProducts(query: ProductSearchQuery): Promise<ProductPickDto[]>;
  lookupSkus(body: SkuLookupBody): Promise<SkuLookupResult>;
  getProduct(id: UUID): Promise<ProductDetail>;
  /** Товар, доданий вручну (у номенклатурі або з заявки) — з'являється в каталозі з джерелом «вручну». DUPLICATE — артикул у постачальника вже є. */
  createProduct(input: ProductInput): Promise<ProductDetail>;
  /** Ціну змінюють вручну лише в товарів, доданих вручну; решта оновлюється з прайсів постачальників. */
  updateProductPrice(id: UUID, input: ProductPriceUpdateInput): Promise<ProductPriceUpdateResult>;
  /** Від найновішого запису. */
  getPriceHistory(id: UUID): Promise<PriceHistoryEntry[]>;

  // ── Фото товару ─────────────────────────────────────────────────
  /** Фото товару: посилання з прайсу і завантажені файли; головне — перше. */
  listProductImages(productId: UUID): Promise<ProductImageDto[]>;
  /** Завантажити файл (jpeg/png/webp, до 10 МБ). */
  uploadProductImage(productId: UUID, file: File): Promise<ProductImageDto>;
  /** Додати фото за посиланням (зазвичай з прайсу постачальника). */
  addProductImageUrl(productId: UUID, input: ProductImageUrlInput): Promise<ProductImageDto>;
  /** Зробити головним або змінити порядок. */
  updateProductImage(productId: UUID, imageId: UUID, patch: ProductImagePatch): Promise<ProductImageDto>;
  deleteProductImage(productId: UUID, imageId: UUID): Promise<void>;

  // ── Заявки ──────────────────────────────────────────────────────
  listRequests(query?: RequestListQuery): Promise<RequestListItem[]>;
  createRequest(body: CreateRequestBody): Promise<CreateRequestResult>;
  getRequestDocument(id: UUID): Promise<RequestDocument>;
  /** Потрібне блокування цієї вкладки (LOCK_LOST) і збіг версії (VERSION_CONFLICT). */
  saveRequestDocument(id: UUID, patch: DocumentPatch, options?: CallOptions): Promise<SaveDocumentResponse>;
  changeStatus(id: UUID, body: StatusChangeBody): Promise<StatusChangeResult>;
  copyRequest(id: UUID, body: CopyRequestBody): Promise<CopyRequestResult>;
  /** Версії КП заявки, від найновішої. */
  listKps(requestId: UUID): Promise<KpDocumentDto[]>;
  /** Сформувати КП (номер — з лічильника). Потрібне блокування цієї вкладки; незбережені зміни зберегти заздалегідь. */
  createKp(requestId: UUID, body: KpCreateBody): Promise<KpDocumentDto>;
  getRequestHistory(requestId: UUID): Promise<RequestHistoryResponse>;

  // ── Блокування (§6.11) ──────────────────────────────────────────
  acquireLock(id: UUID): Promise<LockAcquireResult>;
  /** Продовжує блокування; LOCK_LOST — його забрали. */
  heartbeat(id: UUID): Promise<LockInfo>;
  releaseLock(id: UUID, options?: CallOptions): Promise<void>;
  /** Лише адміністратор. */
  forceLock(id: UUID): Promise<LockInfo>;
  getLockStatus(id: UUID): Promise<LockStatusResponse>;

  // ── Курси, демо ─────────────────────────────────────────────────
  /** Курси НБУ на дату (останні відомі ≤ дати). */
  getRates(date: ISODate): Promise<EffectiveRates>;
  /** Уся історія курсів (від найстарішої дати). */
  listRates(): Promise<CurrencyRateDto[]>;
  /** Лише адміністратор. */
  resetDemoData(): Promise<void>;
}
