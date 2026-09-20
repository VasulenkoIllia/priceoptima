// Контракт джерела даних (§8 ui-prototype). Методи 1:1 з REST.
import type { UserRole } from '@shared/enums';
import type {
  AttachmentDto,
  ProductListQuery,
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
  ManualRateInput,
  LockInfo,
  LockStatusResponse,
  MeResponse,
  OwnCompanyDto,
  OwnCompanyInput,
  PriceHistoryEntry,
  PriceImportBody,
  PriceImportMapping,
  PriceUpdateDto,
  ProductDetail,
  ProductImageDto,
  ProductImagePatch,
  ProductImageUrlInput,
  Name1cImportBody,
  Name1cImportResult,
  ProductInput,
  ProductPatch,
  ProductPage,
  ProductPageQuery,
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
  UUID,
  AccessLinkCreated,
  AccessLinkDto,
  AccessLinkInfo,
  AuditPage,
  AuditQuery,
  InviteCreateInput,
  PasswordChangeInput,
  ProfileInput,
  RegisterInput,
  UserUpdateInput,
} from '@shared/types';

export interface LockAcquireResult {
  /** true — блокування належить цій вкладці. */
  acquired: boolean;
  /** Поточний власник (ця вкладка або інша); null — заявка вільна. */
  lock: LockInfo | null;
}

export interface CallOptions {
  /** Виклик під час закриття сторінки (fetch keepalive — браузер доставить запит і після закриття). */
  keepalive?: boolean;
}

export interface DataSource {
  /** Ідентифікатор вкладки (для блокувань і збережень). */
  readonly sessionId: UUID;

  // ── Сесія, користувачі, налаштування ─────────────────────────────
  /** null — ніхто не увійшов. */
  me(): Promise<MeResponse | null>;
  /** Вхід за логіном і паролем (UNAUTHORIZED — невірні). Вхід запам'ятовується в браузері — спільний для вкладок. */
  login(login: string, password: string): Promise<MeResponse>;
  logout(): Promise<void>;
  listUsers(): Promise<UserDto[]>;
  /** Лише адміністратор: дані користувача (роль і доступ — окремими діями). */
  updateUser(id: UUID, input: UserUpdateInput): Promise<UserDto>;
  setUserRole(id: UUID, role: UserRole): Promise<UserDto>;
  /** Блокування: вхід закрито, сесії й блокування заявок знімаються; заявки й історія лишаються. */
  blockUser(id: UUID): Promise<UserDto>;
  unblockUser(id: UUID): Promise<UserDto>;
  /** Запрошення й посилання для зміни пароля (лише адміністратор). Токен повертається один раз. */
  listAccessLinks(): Promise<AccessLinkDto[]>;
  createInvite(input: InviteCreateInput): Promise<AccessLinkCreated>;
  createResetLink(userId: UUID): Promise<AccessLinkCreated>;
  revokeAccessLink(id: UUID): Promise<void>;
  /** Посилання без входу: що це за посилання і чи діє. */
  getAccessLink(token: string): Promise<AccessLinkInfo>;
  /** Реєстрація за запрошенням — одразу вхід. */
  registerByInvite(token: string, input: RegisterInput): Promise<MeResponse>;
  /** Новий пароль за посиланням — одразу вхід. */
  resetPasswordByLink(token: string, password: string): Promise<MeResponse>;
  /** Мій профіль. */
  updateProfile(input: ProfileInput): Promise<UserDto>;
  changePassword(input: PasswordChangeInput): Promise<UserDto>;
  /** Журнал дій (лише адміністратор), від найновішого. */
  listAudit(query?: AuditQuery): Promise<AuditPage>;
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
  refreshSupplierPrices(supplierId: UUID, options?: { dryRun?: boolean }): Promise<PriceUpdateDto>;
  /** Журнал оновлень прайсів, від найновішого. */
  listPriceUpdates(supplierId?: UUID): Promise<PriceUpdateDto[]>;
  /** Запис журналу разом зі звітом звірки. */
  getPriceUpdate(id: number): Promise<PriceUpdateDto>;
  /** Останнє зіставлення колонок файлу прайсу постачальника (null — ще не завантажували). */
  getPriceImportMapping(supplierId: UUID): Promise<PriceImportMapping | null>;
  savePriceImportMapping(supplierId: UUID, mapping: PriceImportMapping): Promise<PriceImportMapping>;
  /** Прайс файлом (постачальники без вигрузки за посиланням): звірка за кодом; dryRun — лише порахувати зміни. */
  importSupplierPrices(supplierId: UUID, body: PriceImportBody): Promise<PriceUpdateDto>;

  // ── Каталог ─────────────────────────────────────────────────────
  /** Сторінка номенклатури з загальною кількістю: пошук, фільтри й сортування виконує сервер. */
  listProductsPage(query: ProductPageQuery): Promise<ProductPage>;
  /** Excel із номенклатурою за поточними фільтрами (до 100 000 позицій). */
  exportProducts(query: ProductListQuery): Promise<Blob>;
  searchProducts(query: ProductSearchQuery): Promise<ProductPickDto[]>;
  lookupSkus(body: SkuLookupBody): Promise<SkuLookupResult>;
  getProduct(id: UUID): Promise<ProductDetail>;
  /** Товар, доданий вручну (у номенклатурі або з заявки) — з'являється в каталозі з джерелом «вручну». DUPLICATE — артикул у постачальника вже є. */
  createProduct(input: ProductInput): Promise<ProductDetail>;
  /** Назви 1С з Excel: «артикул → назва 1С» у товари постачальника (dryRun — лише порахувати). */
  importName1c(body: Name1cImportBody): Promise<Name1cImportResult>;
  /** Картка товару: назви, бренд, одиниця, кратність тощо (ціни — окремо; прайс ці поля не перезаписує). */
  updateProduct(id: UUID, patch: ProductPatch): Promise<ProductDetail>;
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
  /** Файли заявки (від клієнта тощо), від найновішого. */
  listAttachments(requestId: UUID): Promise<AttachmentDto[]>;
  /** До 20 МБ; потрібне блокування цієї вкладки. */
  uploadAttachment(requestId: UUID, file: File): Promise<AttachmentDto>;
  deleteAttachment(requestId: UUID, fileId: UUID): Promise<void>;

  // ── Блокування (§6.11) ──────────────────────────────────────────
  acquireLock(id: UUID): Promise<LockAcquireResult>;
  /** Продовжує блокування; LOCK_LOST — його забрали. */
  heartbeat(id: UUID): Promise<LockInfo>;
  releaseLock(id: UUID, options?: CallOptions): Promise<void>;
  /** Лише адміністратор. */
  forceLock(id: UUID): Promise<LockInfo>;
  getLockStatus(id: UUID): Promise<LockStatusResponse>;

  // ── Курси ───────────────────────────────────────────────────────
  /** Курси НБУ на дату (останні відомі ≤ дати). */
  getRates(date: ISODate): Promise<EffectiveRates>;
  /** Уся історія курсів (від найстарішої дати). */
  listRates(): Promise<CurrencyRateDto[]>;
  /** Загальний ручний курс на дату: за ту саму дату переважає курс НБУ (діє для постачальників без курсу в прайсі й без ручного). */
  addManualRate(input: ManualRateInput): Promise<CurrencyRateDto>;
}
