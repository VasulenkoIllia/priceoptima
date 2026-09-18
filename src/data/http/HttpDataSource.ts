// Реалізація джерела даних поверх REST: вхід, користувачі, налаштування, довідники, номенклатура, заявки, КП, файли, блокування.
import type {
  AppSettings,
  AppSettingsPatch,
  ClientDetail,
  ClientInput,
  ClientListItem,
  ClientLookupItem,
  CurrencyRateDto,
  EffectiveRates,
  ISODate,
  ListQuery,
  ManualRateInput,
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
  SkuLookupBody,
  SkuLookupResult,
  SupplierDetail,
  SupplierInput,
  SupplierListItem,
  SupplierPriceSourceInput,
  SupplierPriceSourceSettings,
  UserDto,
  UserUpdateInput,
  UUID,
  AttachmentDto,
  CopyRequestBody,
  CopyRequestResult,
  CreateRequestBody,
  CreateRequestResult,
  DocumentPatch,
  KpCreateBody,
  KpDocumentDto,
  LockInfo,
  LockStatusResponse,
  RequestDocument,
  RequestHistoryResponse,
  RequestListItem,
  RequestListQuery,
  SaveDocumentResponse,
  StatusChangeBody,
  StatusChangeResult,
  AccessLinkCreated,
  AccessLinkDto,
  AccessLinkInfo,
  AuditPage,
  AuditQuery,
  InviteCreateInput,
  PasswordChangeInput,
  ProfileInput,
  RegisterInput,
} from '@shared/types';
import type { UserRole } from '@shared/enums';
import type { CallOptions, DataSource, LockAcquireResult } from '../DataSource';
import { isDataSourceError } from '../errors';
import { api, SESSION_ID } from './client';

export class HttpDataSource implements DataSource {
  /** Ідентифікатор вкладки — той самий, що в заголовку X-Session-Id. */
  readonly sessionId = SESSION_ID;

  async me(): Promise<MeResponse | null> {
    try {
      const me = await api<MeResponse>('/auth/me');
      return me;
    } catch (e) {
      if (isDataSourceError(e, 'UNAUTHORIZED')) return null;
      throw e;
    }
  }

  async login(login: string, password: string): Promise<MeResponse> {
    const me = await api<MeResponse>('/auth/login', { body: { login: login.trim(), password } });
    return me;
  }

  async logout(): Promise<void> {
    await api<void>('/auth/logout', { method: 'POST' });
  }

  listUsers(): Promise<UserDto[]> {
    return api<UserDto[]>('/users');
  }

  updateUser(id: UUID, input: UserUpdateInput): Promise<UserDto> {
    return api<UserDto>(`/users/${id}`, { method: 'PUT', body: input });
  }

  setUserRole(id: UUID, role: UserRole): Promise<UserDto> {
    return api<UserDto>(`/users/${id}/role`, { method: 'PUT', body: { role } });
  }

  blockUser(id: UUID): Promise<UserDto> {
    return api<UserDto>(`/users/${id}/block`, { method: 'POST' });
  }

  unblockUser(id: UUID): Promise<UserDto> {
    return api<UserDto>(`/users/${id}/unblock`, { method: 'POST' });
  }

  listAccessLinks(): Promise<AccessLinkDto[]> {
    return api<AccessLinkDto[]>('/users/links');
  }

  createInvite(input: InviteCreateInput): Promise<AccessLinkCreated> {
    return api<AccessLinkCreated>('/users/invites', { body: input });
  }

  createResetLink(userId: UUID): Promise<AccessLinkCreated> {
    return api<AccessLinkCreated>(`/users/${userId}/reset-link`, { method: 'POST' });
  }

  async revokeAccessLink(id: UUID): Promise<void> {
    await api<void>(`/users/links/${id}`, { method: 'DELETE' });
  }

  getAccessLink(token: string): Promise<AccessLinkInfo> {
    return api<AccessLinkInfo>(`/auth/links/${encodeURIComponent(token)}`);
  }

  async registerByInvite(token: string, input: RegisterInput): Promise<MeResponse> {
    const me = await api<MeResponse>(`/auth/links/${encodeURIComponent(token)}/register`, { body: input });
    return me;
  }

  async resetPasswordByLink(token: string, password: string): Promise<MeResponse> {
    const me = await api<MeResponse>(`/auth/links/${encodeURIComponent(token)}/reset`, { body: { password } });
    return me;
  }

  updateProfile(input: ProfileInput): Promise<UserDto> {
    return api<UserDto>('/auth/profile', { method: 'PUT', body: input });
  }

  changePassword(input: PasswordChangeInput): Promise<UserDto> {
    return api<UserDto>('/auth/password', { body: input });
  }

  listAudit(query: AuditQuery = {}): Promise<AuditPage> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v != null && v !== '') params.set(k, String(v));
    const qs = params.toString();
    return api<AuditPage>(`/audit${qs ? `?${qs}` : ''}`);
  }

  getSettings(): Promise<AppSettings> {
    return api<AppSettings>('/settings');
  }

  updateSettings(patch: AppSettingsPatch): Promise<AppSettings> {
    return api<AppSettings>('/settings', { method: 'PUT', body: patch });
  }

  // ── довідники ─────────────────────────────────────────────────────

  listOwnCompanies(): Promise<OwnCompanyDto[]> {
    return api<OwnCompanyDto[]>('/own-companies');
  }

  saveOwnCompany(id: UUID, input: OwnCompanyInput): Promise<OwnCompanyDto> {
    return api<OwnCompanyDto>(`/own-companies/${id}`, { method: 'PUT', body: input });
  }

  listSuppliers(): Promise<SupplierListItem[]> {
    return api<SupplierListItem[]>('/suppliers');
  }

  getSupplier(id: UUID): Promise<SupplierDetail> {
    return api<SupplierDetail>(`/suppliers/${id}`);
  }

  saveSupplier(id: UUID | null, input: SupplierInput): Promise<SupplierDetail> {
    return id ? api<SupplierDetail>(`/suppliers/${id}`, { method: 'PUT', body: input }) : api<SupplierDetail>('/suppliers', { body: input });
  }

  getSupplierPriceSource(supplierId: UUID): Promise<SupplierPriceSourceSettings> {
    return api<SupplierPriceSourceSettings>(`/suppliers/${supplierId}/price-source`);
  }

  saveSupplierPriceSource(supplierId: UUID, input: SupplierPriceSourceInput): Promise<SupplierPriceSourceSettings> {
    return api<SupplierPriceSourceSettings>(`/suppliers/${supplierId}/price-source`, { method: 'PUT', body: input });
  }

  listClients(query?: ListQuery): Promise<ClientListItem[]> {
    return api<ClientListItem[]>('/clients', { query: { search: query?.search } });
  }

  getClient(id: UUID): Promise<ClientDetail> {
    return api<ClientDetail>(`/clients/${id}`);
  }

  searchClients(q: string): Promise<ClientLookupItem[]> {
    return api<ClientLookupItem[]>('/clients/search', { query: { q } });
  }

  saveClient(id: UUID | null, input: ClientInput): Promise<ClientDetail> {
    return id ? api<ClientDetail>(`/clients/${id}`, { method: 'PUT', body: input }) : api<ClientDetail>('/clients', { body: input });
  }

  getRates(date: ISODate): Promise<EffectiveRates> {
    return api<EffectiveRates>('/rates/effective', { query: { date } });
  }

  listRates(): Promise<CurrencyRateDto[]> {
    return api<CurrencyRateDto[]>('/rates');
  }

  addManualRate(input: ManualRateInput): Promise<CurrencyRateDto> {
    return api<CurrencyRateDto>('/rates', { body: input });
  }

  // ── прайси постачальників ─────────────────────────────────────────

  /** Завантажити вигрузку постачальника зараз (за розкладом це робиться щоранку). */
  refreshSupplierPrices(supplierId: UUID, options?: { dryRun?: boolean }): Promise<PriceUpdateDto> {
    return api<PriceUpdateDto>('/price-updates/run', { body: { supplierId, dryRun: options?.dryRun ?? false } });
  }

  listPriceUpdates(supplierId?: UUID): Promise<PriceUpdateDto[]> {
    return api<PriceUpdateDto[]>('/price-updates', { query: { supplierId } });
  }

  getPriceUpdate(id: number): Promise<PriceUpdateDto> {
    return api<PriceUpdateDto>(`/price-updates/${id}`);
  }

  getPriceImportMapping(supplierId: UUID): Promise<PriceImportMapping | null> {
    return api<PriceImportMapping | null>(`/suppliers/${supplierId}/price-mapping`);
  }

  savePriceImportMapping(supplierId: UUID, mapping: PriceImportMapping): Promise<PriceImportMapping> {
    return api<PriceImportMapping>(`/suppliers/${supplierId}/price-mapping`, { method: 'PUT', body: mapping });
  }

  importSupplierPrices(supplierId: UUID, body: PriceImportBody): Promise<PriceUpdateDto> {
    return api<PriceUpdateDto>('/price-updates/import', { body: { supplierId, ...body } });
  }

  // ── каталог ───────────────────────────────────────────────────────

  listProductsPage(query: ProductPageQuery): Promise<ProductPage> {
    return api<ProductPage>('/products/page', {
      query: {
        supplierId: query.supplierId,
        availability: query.availability?.join(','),
        stale: query.stale,
        manual: query.manual,
        missing: query.missing,
        archived: query.archived,
        currency: query.currency,
        q: query.search,
        offset: query.offset,
        limit: query.limit,
        sortField: query.sortField,
        sortDir: query.sortDir,
      },
    });
  }

  searchProducts(query: ProductSearchQuery): Promise<ProductPickDto[]> {
    return api<ProductPickDto[]>('/products/search', {
      query: { q: query.q, supplierId: query.supplierId, limit: query.limit, includeArchived: query.includeArchived },
    });
  }

  lookupSkus(body: SkuLookupBody): Promise<SkuLookupResult> {
    return api<SkuLookupResult>('/products/lookup', { body });
  }

  getProduct(id: UUID): Promise<ProductDetail> {
    return api<ProductDetail>(`/products/${id}`);
  }

  createProduct(input: ProductInput): Promise<ProductDetail> {
    return api<ProductDetail>('/products', { body: input });
  }

  importName1c(body: Name1cImportBody): Promise<Name1cImportResult> {
    return api<Name1cImportResult>('/products/name1c', { body });
  }

  updateProduct(id: UUID, patch: ProductPatch): Promise<ProductDetail> {
    return api<ProductDetail>(`/products/${id}`, { method: 'PUT', body: patch });
  }

  updateProductPrice(id: UUID, input: ProductPriceUpdateInput): Promise<ProductPriceUpdateResult> {
    return api<ProductPriceUpdateResult>(`/products/${id}/price`, { body: input });
  }

  getPriceHistory(id: UUID): Promise<PriceHistoryEntry[]> {
    return api<PriceHistoryEntry[]>(`/products/${id}/price-history`);
  }

  // ── фото товару ───────────────────────────────────────────────────

  listProductImages(productId: UUID): Promise<ProductImageDto[]> {
    return api<ProductImageDto[]>(`/products/${productId}/images`);
  }

  uploadProductImage(productId: UUID, file: File): Promise<ProductImageDto> {
    const form = new FormData();
    form.append('file', file);
    return api<ProductImageDto>(`/products/${productId}/images`, { form });
  }

  addProductImageUrl(productId: UUID, input: ProductImageUrlInput): Promise<ProductImageDto> {
    return api<ProductImageDto>(`/products/${productId}/images/from-url`, { body: input });
  }

  updateProductImage(productId: UUID, imageId: UUID, patch: ProductImagePatch): Promise<ProductImageDto> {
    return api<ProductImageDto>(`/products/${productId}/images/${imageId}`, { method: 'PUT', body: patch });
  }

  deleteProductImage(productId: UUID, imageId: UUID): Promise<void> {
    return api<void>(`/products/${productId}/images/${imageId}`, { method: 'DELETE' });
  }

  // ── заявки ────────────────────────────────────────────────────────

  listRequests(query: RequestListQuery = {}): Promise<RequestListItem[]> {
    return api<RequestListItem[]>('/requests', {
      query: {
        search: query.search,
        status: query.status?.length ? query.status.join(',') : undefined,
        clientId: query.clientId,
        managerId: query.managerId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        mine: query.mine || undefined,
        sort: query.sort,
      },
    });
  }

  createRequest(body: CreateRequestBody): Promise<CreateRequestResult> {
    return api<CreateRequestResult>('/requests', { body });
  }

  getRequestDocument(id: UUID): Promise<RequestDocument> {
    return api<RequestDocument>(`/requests/${id}`);
  }

  saveRequestDocument(id: UUID, patch: DocumentPatch, options?: CallOptions): Promise<SaveDocumentResponse> {
    return api<SaveDocumentResponse>(`/requests/${id}`, { method: 'PATCH', body: patch, keepalive: options?.keepalive });
  }

  changeStatus(id: UUID, body: StatusChangeBody): Promise<StatusChangeResult> {
    return api<StatusChangeResult>(`/requests/${id}/status`, { body });
  }

  copyRequest(id: UUID, body: CopyRequestBody): Promise<CopyRequestResult> {
    return api<CopyRequestResult>(`/requests/${id}/copy`, { body });
  }

  listKps(requestId: UUID): Promise<KpDocumentDto[]> {
    return api<KpDocumentDto[]>(`/requests/${requestId}/kps`);
  }

  createKp(requestId: UUID, body: KpCreateBody): Promise<KpDocumentDto> {
    return api<KpDocumentDto>(`/requests/${requestId}/kps`, { body });
  }

  getRequestHistory(requestId: UUID): Promise<RequestHistoryResponse> {
    return api<RequestHistoryResponse>(`/requests/${requestId}/history`);
  }

  listAttachments(requestId: UUID): Promise<AttachmentDto[]> {
    return api<AttachmentDto[]>(`/requests/${requestId}/files`);
  }

  uploadAttachment(requestId: UUID, file: File): Promise<AttachmentDto> {
    const form = new FormData();
    form.append('file', file);
    return api<AttachmentDto>(`/requests/${requestId}/files`, { form });
  }

  deleteAttachment(requestId: UUID, fileId: UUID): Promise<void> {
    return api<void>(`/requests/${requestId}/files/${fileId}`, { method: 'DELETE' });
  }

  // ── блокування ────────────────────────────────────────────────────

  acquireLock(id: UUID): Promise<LockAcquireResult> {
    return api<LockAcquireResult>(`/requests/${id}/lock`, { method: 'POST' });
  }

  heartbeat(id: UUID): Promise<LockInfo> {
    return api<LockInfo>(`/requests/${id}/lock/heartbeat`, { method: 'POST' });
  }

  releaseLock(id: UUID, options?: CallOptions): Promise<void> {
    return api<void>(`/requests/${id}/lock`, { method: 'DELETE', keepalive: options?.keepalive });
  }

  forceLock(id: UUID): Promise<LockInfo> {
    return api<LockInfo>(`/requests/${id}/lock/force`, { method: 'POST' });
  }

  getLockStatus(id: UUID): Promise<LockStatusResponse> {
    return api<LockStatusResponse>(`/requests/${id}/lock`);
  }
}
