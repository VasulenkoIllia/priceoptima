// Реалізація джерела даних поверх REST. Покриває вхід, користувачів, налаштування й довідники —
// решта методів лишається на демо-даних (див. createDataSource), і переїжджає модулями.
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
  ProductInput,
  ProductListQuery,
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
  UserInput,
  UUID,
} from '@shared/types';
import { isDataSourceError } from '../errors';
import { api } from './client';

export interface HttpDataSourceOptions {
  /** Вхід удався — щоб демо-частина застосунку теж вважала користувача авторизованим. */
  onLogin?(me: MeResponse): void;
  onLogout?(): void | Promise<void>;
}

export class HttpDataSource {
  constructor(private readonly options: HttpDataSourceOptions = {}) {}

  async me(): Promise<MeResponse | null> {
    try {
      const me = await api<MeResponse>('/auth/me');
      this.options.onLogin?.(me);
      return me;
    } catch (e) {
      if (isDataSourceError(e, 'UNAUTHORIZED')) return null;
      throw e;
    }
  }

  async login(login: string, password: string): Promise<MeResponse> {
    const me = await api<MeResponse>('/auth/login', { body: { login: login.trim(), password } });
    this.options.onLogin?.(me);
    return me;
  }

  async logout(): Promise<void> {
    await api<void>('/auth/logout', { method: 'POST' });
    await this.options.onLogout?.();
  }

  listUsers(): Promise<UserDto[]> {
    return api<UserDto[]>('/users');
  }

  saveUser(id: UUID | null, input: UserInput): Promise<UserDto> {
    return id ? api<UserDto>(`/users/${id}`, { method: 'PUT', body: input }) : api<UserDto>('/users', { body: input });
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

  listProducts(query?: ProductListQuery): Promise<ProductDetail[]> {
    return api<ProductDetail[]>('/products', {
      query: {
        supplierId: query?.supplierId,
        availability: query?.availability?.join(','),
        stale: query?.stale,
        archived: query?.archived,
        currency: query?.currency,
        q: query?.search,
      },
    });
  }

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
}
