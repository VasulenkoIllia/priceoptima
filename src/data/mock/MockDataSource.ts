// MockDataSource: in-memory БД у браузері (IndexedDB, синхронізація вкладок), блокування через localStorage, затримка мережі 50–150 мс.
import { planName1cImport } from '@shared/catalog/name1c';
import { formatRequestNumber, toIsoDate } from '@shared/format';
import { matchesAllTokens, normalizeSku, searchTokens } from '@shared/parse';
import {
  catalogSnapshotOf,
  createSupplierBlock,
  DEFAULT_KP_TERMS,
  defaultKpSettings,
  defaultMarkupSettings,
  KP_TERMS_MAX,
  normalizeInputPrice,
  pricingSettingsFrom,
  refreshOfferFromCatalog,
  resolveRate,
  round4,
} from '@shared/pricing';
import { applyStatusChange, isEditableStatus, validateTransition } from '@shared/status';
import { REQUEST_STATUS_LABELS } from '@shared/enums';
import type {
  AppSettings,
  AppSettingsPatch,
  ClientDetail,
  ClientInput,
  ClientListItem,
  ClientLookupItem,
  CopyReport,
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
  PriceImportRow,
  PriceImportMapping,
  PriceUpdateDto,
  ProductDetail,
  ProductImageDto,
  ProductImagePatch,
  ProductImageUrlInput,
  Name1cImportBody,
  Name1cImportResult,
  ProductInput,
  ProductListQuery,
  ProductPatch,
  ProductPage,
  ProductPageQuery,
  ProductPickDto,
  ProductPriceUpdateInput,
  ProductPriceUpdateResult,
  ProductSearchQuery,
  RequestDocument,
  RequestHeader,
  RequestHistoryResponse,
  RequestLine,
  RequestListItem,
  RequestListQuery,
  SaveDocumentResponse,
  SkuLookupBody,
  SkuLookupResult,
  StatusChangeBody,
  StatusChangeResult,
  SupplierBlock,
  SupplierDetail,
  SupplierInput,
  SupplierListItem,
  SupplierPriceSource,
  SupplierPriceSourceInput,
  SupplierPriceSourceSettings,
  UserDto,
  AccessLinkCreated,
  AccessLinkDto,
  AccessLinkInfo,
  AuditPage,
  UserRef,
  UUID,
} from '@shared/types';
import { newId } from '@/lib/ids';
import { toSupplierRef } from '@/lib/supplierRef';
import { openBroadcastChannel, type ChannelFactory } from '../channel';
import type { CallOptions, DataSource, DataSourceEvent, LockAcquireResult } from '../DataSource';
import { DataSourceError } from '../errors';
import { LockRegistry, LOCKS_CHANNEL, type LockEvent, type LockRecord } from '../locks';
import { browserStorage, tabSessionId, type KeyValueStorage } from '../storage';
import { seedAuthOf, sha256Hex } from './auth';
import { DB_CHANNEL, DB_SCHEMA_VERSION, type MockDb, type StoredOffer, type StoredProduct, type StoredRequest, type StoredSupplier } from './db';
import { applyDocumentPatch, buildRequestDocument, computeStoredTotals, toRequestListItem } from './documents';
import { addEvent, documentEventsBefore, recordDocumentEvents, statusEventSummary } from './events';
import { kpEventSummary, makeKpDocument } from './kp';
import { localLogos, localOverrides, overridesFingerprint, type SeedOverrides } from './overrides';
import { clone, idbPersistence, memoryPersistence, MockDbStore, type DbPersistence } from './persistence';
import { lookupSkusIn, searchProductsIn, toProductDetail, type ProductDtoContext } from './products';
import { effectiveRatesOn } from './rates';
import { availabilityOf, buildSeedDb, headerRatesOn, productKeys, SEED_VERSION, stripCatalog, supplierRefsOf } from './seed';

/** Під цим ключем браузер пам'ятає користувача, що увійшов. */
export const AUTH_USER_KEY = 'po-user-id';

/** Налаштування з БД, збереженої до появи нових полів (умови КП), — із типовими значеннями. */
function withSettingsDefaults(settings: AppSettings): AppSettings {
  return clone({ ...settings, kpTerms: settings.kpTerms ?? DEFAULT_KP_TERMS.map((t) => ({ ...t })) });
}
/** Імітація оновлення прайсу: частка товарів, у яких змінюється ціна. */
const PRICE_CHANGE_SHARE = 0.06;
const COPY_INCLUDE_LABELS: Record<CopyRequestBody['include'], string> = {
  lines: 'лише позиції клієнта',
  sourcing: 'позиції і підбір',
  full: 'позиції, підбір і націнка',
};

export interface MockDataSourceOptions {
  /** За замовчуванням — IndexedDB (або пам'ять, якщо IndexedDB недоступна). */
  persistence?: DbPersistence;
  channelFactory?: ChannelFactory;
  localStorage?: KeyValueStorage;
  sessionStorage?: KeyValueStorage;
  /** Де браузер пам'ятає вхід; за замовчуванням — localStorage (спільний для вкладок, переживає перезавантаження). */
  authStorage?: KeyValueStorage;
  sessionId?: string;
  /** Імітація мережевої затримки, мс. */
  latencyMs?: readonly [number, number];
  now?: () => Date;
  overrides?: SeedOverrides | null;
  logos?: Record<string, string>;
  persistDebounceMs?: number;
  /** Скидати БД в IndexedDB при закритті сторінки. */
  bindPageLifecycle?: boolean;
}

export class MockDataSource implements DataSource {
  readonly sessionId: string;
  private readonly local: KeyValueStorage;
  private readonly session: KeyValueStorage;
  private readonly authStorage: KeyValueStorage;
  private readonly latency: readonly [number, number];
  private readonly now: () => Date;
  private readonly overrides: SeedOverrides | null;
  private readonly logos: Record<string, string>;
  private readonly fingerprint: string;
  private readonly listeners = new Set<(e: DataSourceEvent) => void>();
  private store: MockDbStore | null = null;
  private lockRegistry: LockRegistry | null = null;
  private readyPromise: Promise<void> | null = null;

  constructor(private readonly opts: MockDataSourceOptions = {}) {
    this.local = opts.localStorage ?? browserStorage('local');
    this.session = opts.sessionStorage ?? browserStorage('session');
    this.authStorage = opts.authStorage ?? this.local;
    this.sessionId = opts.sessionId ?? tabSessionId(this.session);
    this.latency = opts.latencyMs ?? [50, 150];
    this.now = opts.now ?? (() => new Date());
    this.overrides = opts.overrides !== undefined ? opts.overrides : localOverrides;
    this.logos = opts.logos ?? localLogos;
    this.fingerprint = `${DB_SCHEMA_VERSION}.${SEED_VERSION}.${overridesFingerprint(this.overrides)}`;
  }

  subscribe(listener: (event: DataSourceEvent) => void): () => void {
    this.listeners.add(listener);
    void this.ready();
    return () => this.listeners.delete(listener);
  }

  /** Записати неперсистовані зміни в сховище зараз (тести, закриття сторінки). */
  async flushPersistence(): Promise<void> {
    await this.ready();
    await this.store!.flush();
  }

  /** Закрити канали й таймери (тести). */
  dispose(): void {
    this.store?.dispose();
    this.lockRegistry?.dispose();
    this.listeners.clear();
  }

  // ── Сесія, користувачі, налаштування ─────────────────────────────
  me(): Promise<MeResponse | null> {
    return this.call(() => {
      const user = this.currentUser();
      return user ? this.meResponse(user) : null;
    });
  }

  async login(login: string, password: string): Promise<MeResponse> {
    const hash = await sha256Hex(password);
    return this.call(() => {
      const name = login.trim();
      // увійти можуть лише користувачі з паролем (у прототипі — адміністратор із сіду)
      const user = this.db.users.find((u) => u.isActive && u.login === name && this.db.passwordHashes[u.id] === hash);
      if (!user) throw new DataSourceError('UNAUTHORIZED', 'Невірний логін або пароль');
      const userId = user.id;
      const at = this.nowIso();
      this.mutate((db) => {
        const u = db.users.find((x) => x.id === userId);
        if (u) u.lastLoginAt = at;
      });
      this.authStorage.setItem(AUTH_USER_KEY, userId);
      return this.meResponse(user);
    });
  }

  async logout(): Promise<void> {
    await this.call(() => {
      this.locks.releaseSession(this.sessionId);
      this.authStorage.removeItem(AUTH_USER_KEY);
    });
  }

  /**
   * Перехідний режим: вхід уже на сервері, а частина сторінок ще на демо-даних —
   * беремо демо-користувача з таким логіном (або адміністратора), щоб вони працювали.
   */
  adoptDemoSession(login: string): void {
    const user = this.db.users.find((u) => u.isActive && u.login === login) ?? this.db.users.find((u) => u.role === 'admin');
    if (user) this.authStorage.setItem(AUTH_USER_KEY, user.id);
  }

  listUsers(): Promise<UserDto[]> {
    return this.call(() => clone(this.db.users));
  }

  // Користувачі, запрошення, профіль і журнал — лише з сервером (демо-джерело прибирається разом із переносом заявок).
  private serverOnly(): never {
    throw new DataSourceError('INVALID_STATE', 'Доступно лише з сервером');
  }
  updateUser(): Promise<UserDto> {
    return this.call(() => this.serverOnly());
  }
  setUserRole(): Promise<UserDto> {
    return this.call(() => this.serverOnly());
  }
  blockUser(): Promise<UserDto> {
    return this.call(() => this.serverOnly());
  }
  unblockUser(): Promise<UserDto> {
    return this.call(() => this.serverOnly());
  }
  listAccessLinks(): Promise<AccessLinkDto[]> {
    return this.call(() => this.serverOnly());
  }
  createInvite(): Promise<AccessLinkCreated> {
    return this.call(() => this.serverOnly());
  }
  createResetLink(): Promise<AccessLinkCreated> {
    return this.call(() => this.serverOnly());
  }
  revokeAccessLink(): Promise<void> {
    return this.call(() => this.serverOnly());
  }
  getAccessLink(): Promise<AccessLinkInfo> {
    return this.call(() => this.serverOnly());
  }
  registerByInvite(): Promise<MeResponse> {
    return this.call(() => this.serverOnly());
  }
  resetPasswordByLink(): Promise<MeResponse> {
    return this.call(() => this.serverOnly());
  }
  updateProfile(): Promise<UserDto> {
    return this.call(() => this.serverOnly());
  }
  changePassword(): Promise<UserDto> {
    return this.call(() => this.serverOnly());
  }
  listAudit(): Promise<AuditPage> {
    return this.call(() => this.serverOnly());
  }

  getSettings(): Promise<AppSettings> {
    return this.call(() => {
      this.requireUser();
      return withSettingsDefaults(this.db.settings);
    });
  }

  updateSettings(patch: AppSettingsPatch): Promise<AppSettings> {
    return this.call(() => {
      this.requireAdmin();
      // лічильники номерів можна лише збільшити (ДОВ-4)
      const cur = this.db.settings;
      if (patch.nextRequestNumber != null && patch.nextRequestNumber < cur.nextRequestNumber) {
        throw new DataSourceError('VALIDATION_ERROR', `Наступний номер заявки — не менше ${cur.nextRequestNumber}`);
      }
      // номер КП — стала частина «2114 / номер заявки»: змінюється будь-коли, лише додатний
      if (patch.nextKpNumber != null && patch.nextKpNumber < 1) {
        throw new DataSourceError('VALIDATION_ERROR', 'Номер КП — ціле число, більше нуля');
      }
      const p = clone(patch);
      if (p.kpTerms) {
        // умова без назви не зберігається; значення може бути порожнім (тоді в КП не друкується)
        p.kpTerms = p.kpTerms.map((t) => ({ label: t.label.trim(), value: t.value.trim() })).filter((t) => t.label);
        if (p.kpTerms.length > KP_TERMS_MAX) throw new DataSourceError('VALIDATION_ERROR', `Умов у КП — не більше ${KP_TERMS_MAX}`);
      }
      this.mutate((db) => Object.assign(db.settings, p));
      this.locks.setTtl(this.db.settings.lockTtlSeconds * 1000);
      return withSettingsDefaults(this.db.settings);
    });
  }

  listOwnCompanies(): Promise<OwnCompanyDto[]> {
    return this.call(() => {
      this.requireUser();
      return clone(this.db.ownCompanies.filter((c) => c.isActive));
    });
  }

  saveOwnCompany(id: UUID, input: OwnCompanyInput): Promise<OwnCompanyDto> {
    return this.call(() => {
      this.requireAdmin();
      if (!this.db.ownCompanies.some((c) => c.id === id)) throw new DataSourceError('NOT_FOUND', 'Юрособу не знайдено');
      if (!input.nameShort?.trim()) throw new DataSourceError('VALIDATION_ERROR', 'Вкажіть коротку назву');
      const data = clone(input);
      this.mutate((db) => {
        const i = db.ownCompanies.findIndex((c) => c.id === id);
        if (i < 0) return;
        if (data.isDefault) for (const c of db.ownCompanies) c.isDefault = false;
        db.ownCompanies[i] = { ...data, id };
      });
      // сформовані КП не змінюються — у них знімок реквізитів
      return clone(this.db.ownCompanies.find((c) => c.id === id)!);
    });
  }

  // ── Клієнти ─────────────────────────────────────────────────────
  listClients(query: ListQuery = {}): Promise<ClientListItem[]> {
    return this.call(() => {
      this.requireUser();
      const tokens = (query.search ?? '').toLocaleLowerCase('uk').split(/\s+/u).filter(Boolean);
      const stats = new Map<UUID, { count: number; last: ISODate | null }>();
      for (const r of Object.values(this.db.requests)) {
        if (!r.header.clientId) continue;
        const s = stats.get(r.header.clientId) ?? { count: 0, last: null };
        s.count++;
        if (!s.last || r.header.requestDate > s.last) s.last = r.header.requestDate;
        stats.set(r.header.clientId, s);
      }
      return Object.values(this.db.clients)
        .filter((c) => {
          if (!tokens.length) return true;
          const text = [c.name, ...c.counterparties.flatMap((cp) => [cp.nameShort, cp.edrpou ?? ''])].join(' ').toLocaleLowerCase('uk');
          return tokens.every((t) => text.includes(t));
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'uk'))
        .map((c): ClientListItem => ({
          id: c.id,
          name: c.name,
          counterparties: c.counterparties.map((cp) => ({ id: cp.id, nameShort: cp.nameShort, edrpou: cp.edrpou })),
          contactsCount: c.contacts.length,
          responsible: this.userRef(c.responsibleUserId),
          requestsCount: stats.get(c.id)?.count ?? 0,
          lastRequestDate: stats.get(c.id)?.last ?? null,
          isActive: c.isActive,
        }));
    });
  }

  getClient(id: UUID): Promise<ClientDetail> {
    return this.call(() => {
      this.requireUser();
      return clone(this.requireClient(id));
    });
  }

  searchClients(q: string): Promise<ClientLookupItem[]> {
    return this.call(() => {
      this.requireUser();
      const tokens = q.toLocaleLowerCase('uk').split(/\s+/u).filter(Boolean);
      const out: ClientLookupItem[] = [];
      for (const c of Object.values(this.db.clients)) {
        const rows = c.counterparties.length ? c.counterparties : [null];
        for (const cp of rows) {
          const label = cp ? `${c.name} / ${cp.nameShort}${cp.edrpou ? ` (${cp.edrpou})` : ''}` : c.name;
          if (tokens.length && !tokens.every((t) => label.toLocaleLowerCase('uk').includes(t))) continue;
          out.push({
            clientId: c.id,
            clientName: c.name,
            counterpartyId: cp?.id ?? null,
            counterpartyName: cp?.nameShort ?? null,
            edrpou: cp?.edrpou ?? null,
            label,
          });
        }
      }
      return out.sort((a, b) => a.label.localeCompare(b.label, 'uk')).slice(0, 50);
    });
  }

  saveClient(id: UUID | null, input: ClientInput): Promise<ClientDetail> {
    return this.call(() => {
      this.requireUser();
      if (!input.name?.trim()) throw new DataSourceError('VALIDATION_ERROR', 'Вкажіть назву клієнта');
      if (id) this.requireClient(id);
      const clientId = id ?? newId();
      const at = this.nowIso();
      const data = clone(input);
      const cpIds = (data.counterparties ?? []).map((cp) => cp.id ?? newId());
      const ctIds = (data.contacts ?? []).map((ct) => ct.id ?? newId());
      this.mutate((db) => {
        const prev = db.clients[clientId];
        db.clients[clientId] = {
          id: clientId,
          name: data.name.trim(),
          note: data.note ?? prev?.note ?? null,
          responsibleUserId: data.responsibleUserId !== undefined ? data.responsibleUserId : (prev?.responsibleUserId ?? null),
          isActive: data.isActive ?? prev?.isActive ?? true,
          counterparties: data.counterparties
            ? data.counterparties.map((cp, i) => ({ ...cp, id: cpIds[i], clientId }))
            : (prev?.counterparties ?? []),
          contacts: data.contacts ? data.contacts.map((ct, i) => ({ ...ct, id: ctIds[i], clientId })) : (prev?.contacts ?? []),
          createdAt: prev?.createdAt ?? at,
          updatedAt: at,
        };
      });
      return clone(this.db.clients[clientId]);
    });
  }

  // ── Постачальники ───────────────────────────────────────────────
  listSuppliers(): Promise<SupplierListItem[]> {
    return this.call(() => {
      this.requireUser();
      const counts = this.productCounts();
      return this.db.suppliers.map((s) => ({
        ...toSupplierRef(s),
        priceSource: s.priceSource,
        productsCount: counts.get(s.id) ?? 0,
        lastImportAt: s.lastImportAt,
        isActive: s.isActive,
        sortOrder: s.sortOrder,
      }));
    });
  }

  getSupplier(id: UUID): Promise<SupplierDetail> {
    return this.call(() => {
      this.requireUser();
      const s = this.requireSupplier(id);
      return clone({ ...s, productsCount: this.productCounts().get(id) ?? 0 });
    });
  }

  saveSupplier(id: UUID | null, input: SupplierInput): Promise<SupplierDetail> {
    return this.call(() => {
      this.requireUser();
      if (!input.name?.trim()) throw new DataSourceError('VALIDATION_ERROR', 'Вкажіть назву постачальника');
      if (id) this.requireSupplier(id);
      const supplierId = id ?? newId();
      const data = clone(input);
      const leIds = (data.legalEntities ?? []).map((x) => x.id ?? newId());
      const ctIds = (data.contacts ?? []).map((x) => x.id ?? newId());
      this.mutate((db) => {
        const prev = db.suppliers.find((s) => s.id === supplierId);
        const next: StoredSupplier = {
          ...data,
          id: supplierId,
          priceListRates: data.priceListRates ?? prev?.priceListRates ?? { USD: null, EUR: null, date: null },
          lastImportAt: prev?.lastImportAt ?? null,
          // джерело прайсу налаштовується окремо від картки постачальника
          priceSource: prev?.priceSource ?? { kind: 'manual', format: 'xlsx', host: null, scheduleHour: null, hasPurchasePrice: true, note: null },
          legalEntities: data.legalEntities
            ? data.legalEntities.map((x, i) => ({ ...x, id: leIds[i], supplierId }))
            : (prev?.legalEntities ?? []),
          contacts: data.contacts ? data.contacts.map((x, i) => ({ ...x, id: ctIds[i], supplierId })) : (prev?.contacts ?? []),
          importProfiles: prev?.importProfiles ?? [],
          priceImportMapping: prev?.priceImportMapping ?? null,
        };
        if (prev) db.suppliers[db.suppliers.indexOf(prev)] = next;
        else db.suppliers.push(next);
        db.suppliers.sort((a, b) => a.sortOrder - b.sortOrder);
      });
      const saved = this.requireSupplier(supplierId);
      return clone({ ...saved, productsCount: this.productCounts().get(supplierId) ?? 0 });
    });
  }

  getSupplierPriceSource(supplierId: UUID): Promise<SupplierPriceSourceSettings> {
    return this.call(() => {
      this.requireUser();
      return demoPriceSourceSettings(this.requireSupplier(supplierId).priceSource);
    });
  }

  /** У демо посилання й токен не зберігаються — лише хост і розклад, щоб картки показували стан. */
  saveSupplierPriceSource(supplierId: UUID, input: SupplierPriceSourceInput): Promise<SupplierPriceSourceSettings> {
    return this.call(() => {
      this.requireUser();
      const prev = this.requireSupplier(supplierId).priceSource;
      const host = input.url === undefined ? prev.host : input.url ? urlHost(input.url) : null;
      if (input.url && !host) throw new DataSourceError('VALIDATION_ERROR', 'Посилання має починатися з http:// або https://');
      if (input.kind !== 'manual' && !input.format) throw new DataSourceError('VALIDATION_ERROR', 'Вкажіть формат вигрузки');
      if (input.kind !== 'manual' && !host) throw new DataSourceError('VALIDATION_ERROR', 'Вкажіть посилання на вигрузку');
      const next: SupplierPriceSource = {
        kind: input.kind,
        format: input.format,
        host,
        scheduleHour: input.scheduleHour,
        hasPurchasePrice: input.hasPurchasePrice,
        note: input.note,
      };
      this.mutate((db) => {
        const s = db.suppliers.find((x) => x.id === supplierId);
        if (s) s.priceSource = next;
      });
      return { ...demoPriceSourceSettings(next), auth: input.auth };
    });
  }

  refreshSupplierPrices(supplierId: UUID, options?: { dryRun?: boolean }): Promise<PriceUpdateDto> {
    return this.call(() => {
      const user = this.requireUser();
      if (options?.dryRun) throw new DataSourceError('NOT_IMPLEMENTED', 'Перевірка вигрузки без запису доступна лише на сервері');
      this.requireSupplier(supplierId);
      const now = this.now();
      const at = now.toISOString();
      const userRef: UserRef = { id: user.id, shortName: user.shortName };
      return this.mutate((db) => {
        const supplier = db.suppliers.find((s) => s.id === supplierId)!;
        const stats = { total: 0, up: 0, down: 0 };
        for (const p of Object.values(db.products)) {
          // товари, додані вручну, прайс не чіпає — їх оновлюють вручну
          if (p.supplierId !== supplierId || p.isArchived || p.priceSource === 'manual') continue;
          stats.total++;
          p.priceUpdatedAt = at;
          if (p.purchasePrice == null || Math.random() >= PRICE_CHANGE_SHARE) continue;
          const k = 1 + (Math.random() < 0.7 ? 1 : -1) * (0.01 + Math.random() * 0.04);
          const purchasePrice = round4(p.purchasePrice * k);
          const rrp = p.rrp != null ? round4(p.rrp * k) : null;
          if (k > 1) stats.up++;
          else stats.down++;
          Object.assign(p, { purchasePrice, rrp, updatedAt: at, priceSource: 'import' as const });
          (db.priceHistory[p.id] ??= []).push({
            id: db.nextPriceHistoryId++,
            productId: p.id,
            effectiveAt: at,
            currency: p.currency,
            purchasePrice,
            rrp,
            stockQty: p.stockQty,
            availability: p.availability,
            source: 'import',
            importId: null,
            requestId: null,
            requestNumber: null,
            user: null,
            note: 'Оновлення прайсу постачальника',
          });
        }
        supplier.lastImportAt = at;
        supplier.priceListRates = { ...supplier.priceListRates, date: toIsoDate(now) };
        const entry: PriceUpdateDto = {
          id: (db.priceUpdates[db.priceUpdates.length - 1]?.id ?? 0) + 1,
          supplierId,
          at,
          productsTotal: stats.total,
          changed: stats.up + stats.down,
          priceUp: stats.up,
          priceDown: stats.down,
          added: 0,
          missing: 0,
          stockChanged: 0,
          source: 'auto',
          fileName: null,
          rates: { USD: supplier.priceListRates.USD, EUR: supplier.priceListRates.EUR },
          user: userRef,
        };
        db.priceUpdates.push(entry);
        return clone(entry);
      });
    });
  }

  listPriceUpdates(supplierId?: UUID): Promise<PriceUpdateDto[]> {
    return this.call(() => {
      this.requireUser();
      return clone(this.db.priceUpdates.filter((u) => !supplierId || u.supplierId === supplierId).reverse());
    });
  }

  getPriceUpdate(id: number): Promise<PriceUpdateDto> {
    return this.call(() => {
      this.requireUser();
      const entry = this.db.priceUpdates.find((u) => u.id === id);
      if (!entry) throw new DataSourceError('NOT_FOUND', 'Запис журналу не знайдено');
      return clone(entry);
    });
  }

  getPriceImportMapping(supplierId: UUID): Promise<PriceImportMapping | null> {
    return this.call(() => {
      this.requireUser();
      return clone(this.requireSupplier(supplierId).priceImportMapping ?? null);
    });
  }

  savePriceImportMapping(supplierId: UUID, mapping: PriceImportMapping): Promise<PriceImportMapping> {
    return this.call(() => {
      this.requireUser();
      this.requireSupplier(supplierId);
      this.mutate((db) => {
        const s = db.suppliers.find((x) => x.id === supplierId);
        if (s) s.priceImportMapping = clone(mapping);
      });
      return clone(mapping);
    });
  }

  importSupplierPrices(supplierId: UUID, body: PriceImportBody): Promise<PriceUpdateDto> {
    return this.call(() => {
      const user = this.requireUser();
      const supplier = this.requireSupplier(supplierId);
      const rows = new Map<string, PriceImportRow>();
      for (const r of body.rows) {
        const code = r.code?.trim();
        if (code) rows.set(normalizeSku(code), { ...r, code });
      }
      if (!rows.size) throw new DataSourceError('VALIDATION_ERROR', 'У файлі немає рядків з кодом товару');
      const now = this.now();
      const at = now.toISOString();
      const today = toIsoDate(now);
      const userRef: UserRef = { id: user.id, shortName: user.shortName };

      /** Звірка прайсу з каталогом; write=false — лише порахувати (dryRun). */
      const run = (db: MockDb, write: boolean): PriceUpdateDto => {
        const stats = { matched: 0, changed: 0, up: 0, down: 0, added: 0, missing: 0, stockChanged: 0 };
        // товари, додані вручну, прайс не чіпає
        const own = Object.values(db.products).filter((p) => p.supplierId === supplierId && p.priceSource !== 'manual');
        const byKey = new Map(own.map((p) => [p.skuKey, p]));
        for (const [key, row] of rows) {
          const p = byKey.get(key);
          if (!p) {
            stats.added++;
            if (!write) continue;
            const id = newId();
            const stockQty = row.stockQty ?? null;
            const base = {
              id,
              supplierId,
              sku: row.code,
              nameWork: row.name?.trim() || row.code,
              name1c: null,
              brand: row.brand?.trim() || null,
              unitCode: row.unitCode?.trim() || 'шт',
              currency: row.currency ?? supplier.defaultCurrency,
              purchasePrice: row.purchasePrice ?? null,
              rrp: row.rrp ?? null,
              multiplicity: row.multiplicity && row.multiplicity > 0 ? row.multiplicity : 1,
              stockQty,
              availability: row.availability ?? availabilityOf(stockQty),
              priceUpdatedAt: at,
              missingSince: null,
              imageUrl: null,
              productUrl: null,
              isArchived: false,
              minOrderQty: row.minOrderQty ?? null,
              notes: null,
              priceSource: 'import' as const,
              lastImportId: null,
              createdAt: at,
              updatedAt: at,
            };
            db.products[id] = { ...base, ...productKeys(base) };
            continue;
          }
          stats.matched++;
          const purchasePrice = row.purchasePrice ?? p.purchasePrice;
          const rrp = row.rrp ?? p.rrp;
          const stockQty = row.stockQty ?? null;
          const availability = row.availability ?? availabilityOf(stockQty);
          const priceChanged = purchasePrice !== p.purchasePrice || rrp !== p.rrp;
          if (priceChanged) {
            stats.changed++;
            if ((purchasePrice ?? 0) > (p.purchasePrice ?? 0)) stats.up++;
            else stats.down++;
          }
          if (stockQty !== p.stockQty || availability !== p.availability) stats.stockChanged++;
          if (!write) continue;
          Object.assign(p, {
            purchasePrice,
            rrp,
            stockQty,
            availability,
            priceUpdatedAt: at,
            updatedAt: at,
            priceSource: 'import' as const,
            missingSince: null,
          });
          if (row.name?.trim()) p.nameWork = row.name.trim();
          if (row.brand?.trim()) p.brand = row.brand.trim();
          if (row.unitCode?.trim()) p.unitCode = row.unitCode.trim();
          if (row.multiplicity && row.multiplicity > 0) p.multiplicity = row.multiplicity;
          if (row.minOrderQty != null) p.minOrderQty = row.minOrderQty;
          Object.assign(p, productKeys(p));
          if (priceChanged) {
            (db.priceHistory[p.id] ??= []).push({
              id: db.nextPriceHistoryId++,
              productId: p.id,
              effectiveAt: at,
              currency: p.currency,
              purchasePrice,
              rrp,
              stockQty,
              availability,
              source: 'import',
              importId: null,
              requestId: null,
              requestNumber: null,
              user: userRef,
              note: `Прайс ${body.fileName}`,
            });
          }
        }
        // позиції, яких немає у файлі: не видаляємо, лише позначаємо
        if (body.markMissing) {
          for (const p of own) {
            if (rows.has(p.skuKey)) continue;
            stats.missing++;
            if (write && !p.missingSince) Object.assign(p, { missingSince: today, updatedAt: at });
          }
        }
        const entry: PriceUpdateDto = {
          id: (db.priceUpdates[db.priceUpdates.length - 1]?.id ?? 0) + 1,
          supplierId,
          at,
          productsTotal: stats.matched + stats.added,
          changed: stats.changed,
          priceUp: stats.up,
          priceDown: stats.down,
          added: stats.added,
          missing: stats.missing,
          stockChanged: stats.stockChanged,
          source: 'file',
          fileName: body.fileName,
          rates: { USD: supplier.priceListRates.USD, EUR: supplier.priceListRates.EUR },
          user: userRef,
        };
        if (write) {
          db.suppliers.find((s) => s.id === supplierId)!.lastImportAt = at;
          db.priceUpdates.push(entry);
        }
        return entry;
      };

      if (body.dryRun) return clone(run(this.db, false));
      return this.mutate((db) => clone(run(db, true)));
    });
  }

  // ── Каталог ─────────────────────────────────────────────────────
  listProducts(query: ProductListQuery = {}): Promise<ProductDetail[]> {
    return this.call(() => {
      this.requireUser();
      return clone(this.filterProducts(query));
    });
  }

  listProductsPage(query: ProductPageQuery): Promise<ProductPage> {
    return this.call(() => {
      this.requireUser();
      const all = this.filterProducts(query);
      if (query.sortField) {
        const key = query.sortField;
        const dir = query.sortDir === 'desc' ? -1 : 1;
        const valueOf = (p: ProductDetail): string | number | null =>
          key === 'supplier' ? p.supplierName : key === 'priceSource' ? (p.priceSource ?? '') : (p[key] ?? null);
        all.sort((a, b) => {
          const va = valueOf(a);
          const vb = valueOf(b);
          // порожні — завжди в кінці
          if (va == null || vb == null) return va == null ? (vb == null ? 0 : 1) : -1;
          const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'uk');
          return cmp * dir || a.nameWork.localeCompare(b.nameWork, 'uk');
        });
      }
      return clone({ items: all.slice(query.offset, query.offset + query.limit), total: all.length });
    });
  }

  /** Фільтри номенклатури (спільні для списку й сторінки). */
  private filterProducts(query: ProductListQuery): ProductDetail[] {
    const ctx = this.productCtx();
    const tokens = searchTokens(query.search ?? '');
    const skuKey = normalizeSku(query.search ?? '');
    const order = new Map(this.db.suppliers.map((s) => [s.id, s.sortOrder]));
    const items = Object.values(this.db.products)
      .filter((p) => {
        if (!query.archived && p.isArchived) return false;
        if (query.supplierId && p.supplierId !== query.supplierId) return false;
        if (query.currency && p.currency !== query.currency) return false;
        if (query.availability?.length && !query.availability.includes(p.availability)) return false;
        if (query.manual && p.priceSource !== 'manual') return false;
        if (query.missing && !p.missingSince) return false;
        if (tokens.length && !(skuKey.length >= 2 && p.skuKey.includes(skuKey)) && !matchesAllTokens(p.searchText, tokens)) return false;
        return true;
      })
      .map((p) => toProductDetail(p, ctx))
      .filter((p) => !query.stale || p.isStale)
      .sort((a, b) => (order.get(a.supplierId) ?? 0) - (order.get(b.supplierId) ?? 0) || a.nameWork.localeCompare(b.nameWork, 'uk'));
    return items;
  }

  searchProducts(query: ProductSearchQuery): Promise<ProductPickDto[]> {
    return this.call(() => {
      this.requireUser();
      return clone(searchProductsIn(Object.values(this.db.products), query, this.productCtx()));
    });
  }

  lookupSkus(body: SkuLookupBody): Promise<SkuLookupResult> {
    return this.call(() => {
      this.requireUser();
      return clone(lookupSkusIn(Object.values(this.db.products), body, this.productCtx()));
    });
  }

  getProduct(id: UUID): Promise<ProductDetail> {
    return this.call(() => {
      this.requireUser();
      return clone(toProductDetail(this.requireProduct(id), this.productCtx()));
    });
  }

  updateProduct(id: UUID, patch: ProductPatch): Promise<ProductDetail> {
    return this.call(() => {
      this.requireUser();
      const cur = this.requireProduct(id);
      const nameWork = patch.nameWork !== undefined ? patch.nameWork.trim() : cur.nameWork;
      if (!nameWork) throw new DataSourceError('VALIDATION_ERROR', 'Вкажіть робочу назву');
      if (patch.multiplicity !== undefined && !(patch.multiplicity > 0)) throw new DataSourceError('VALIDATION_ERROR', 'Кратність: більше нуля');
      const text = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
      this.mutate((db) => {
        const p = db.products[id];
        p.nameWork = nameWork;
        if (patch.name1c !== undefined) p.name1c = text(patch.name1c) ?? null;
        if (patch.brand !== undefined) p.brand = text(patch.brand) ?? null;
        if (patch.unitCode !== undefined) p.unitCode = patch.unitCode.trim() || p.unitCode;
        if (patch.multiplicity !== undefined) p.multiplicity = patch.multiplicity;
        if (patch.minOrderQty !== undefined) p.minOrderQty = patch.minOrderQty ?? null;
        if (patch.productUrl !== undefined) p.productUrl = text(patch.productUrl) ?? null;
        if (patch.notes !== undefined) p.notes = text(patch.notes) ?? null;
        if (patch.isArchived !== undefined) p.isArchived = patch.isArchived;
        p.updatedAt = this.nowIso();
        Object.assign(p, productKeys(p));
      });
      return clone(toProductDetail(this.db.products[id], this.productCtx()));
    });
  }

  importName1c(body: Name1cImportBody): Promise<Name1cImportResult> {
    return this.call(() => {
      this.requireUser();
      if (!this.db.suppliers.some((x) => x.id === body.supplierId)) throw new DataSourceError('NOT_FOUND', 'Постачальника не знайдено');
      const products = Object.values(this.db.products).filter((p) => p.supplierId === body.supplierId);
      const plan = planName1cImport(body.rows, products);
      if (!body.dryRun && plan.updates.length) {
        const at = this.nowIso();
        this.mutate((db) => {
          for (const u of plan.updates) {
            const p = db.products[u.id];
            p.name1c = u.name1c;
            p.updatedAt = at;
            Object.assign(p, productKeys(p));
          }
        });
      }
      return {
        matched: plan.matched,
        updated: plan.updates.length,
        unchanged: plan.unchanged,
        notFound: plan.notFound.slice(0, 500),
        notFoundCount: plan.notFound.length,
        skipped: plan.skipped,
        duplicates: plan.duplicates,
      };
    });
  }

  createProduct(input: ProductInput): Promise<ProductDetail> {
    return this.call(() => {
      const user = this.requireUser();
      this.requireSupplier(input.supplierId);
      const sku = input.sku?.trim() ?? '';
      const nameWork = input.nameWork?.trim() ?? '';
      if (!sku) throw new DataSourceError('VALIDATION_ERROR', 'Вкажіть артикул');
      if (!nameWork) throw new DataSourceError('VALIDATION_ERROR', 'Вкажіть робочу назву');
      const skuKey = normalizeSku(sku);
      const duplicate = Object.values(this.db.products).find((p) => p.supplierId === input.supplierId && p.skuKey === skuKey);
      if (duplicate) throw new DataSourceError('DUPLICATE', `Артикул ${sku} вже є в каталозі цього постачальника`);

      const id = newId();
      const at = this.nowIso();
      const vatRate = this.db.settings.vatRatePct;
      const purchasePrice = input.purchasePrice != null ? normalizeInputPrice(input.purchasePrice, !!input.priceIncludesVat, vatRate) : null;
      const stockQty = input.stockQty ?? null;
      const base = {
        id,
        supplierId: input.supplierId,
        sku,
        nameWork,
        name1c: input.name1c?.trim() || null,
        brand: input.brand?.trim() || null,
        unitCode: input.unitCode || 'шт',
        currency: input.currency,
        purchasePrice,
        rrp: input.rrp ?? null,
        multiplicity: input.multiplicity && input.multiplicity > 0 ? input.multiplicity : 1,
        stockQty,
        availability: input.availability ?? availabilityOf(stockQty),
        priceUpdatedAt: at,
        missingSince: null,
        imageUrl: null,
        productUrl: input.productUrl ?? null,
        isArchived: false,
        minOrderQty: input.minOrderQty ?? null,
        notes: input.notes ?? null,
        priceSource: 'manual' as const,
        lastImportId: null,
        createdAt: at,
        updatedAt: at,
      };
      const product: StoredProduct = { ...base, ...productKeys(base) };
      const userRef: UserRef = { id: user.id, shortName: user.shortName };
      this.mutate((db) => {
        db.products[id] = clone(product);
        db.priceHistory[id] = [
          {
            id: db.nextPriceHistoryId++,
            productId: id,
            effectiveAt: at,
            currency: product.currency,
            purchasePrice: product.purchasePrice,
            rrp: product.rrp,
            stockQty: product.stockQty,
            availability: product.availability,
            source: 'manual',
            importId: null,
            requestId: null,
            requestNumber: null,
            user: userRef,
            note: 'Товар створено вручну',
          },
        ];
      });
      return clone(toProductDetail(this.requireProduct(id), this.productCtx()));
    });
  }

  updateProductPrice(id: UUID, input: ProductPriceUpdateInput): Promise<ProductPriceUpdateResult> {
    return this.call(() => {
      const user = this.requireUser();
      if (this.requireProduct(id).priceSource !== 'manual') {
        throw new DataSourceError('INVALID_STATE', 'Ціну цього товару оновлює прайс постачальника. Скоригувати ціну для клієнта можна в заявці');
      }
      const at = this.nowIso();
      const { priceIncludesVat, ...data } = clone(input);
      // вхід, введений з ПДВ, зберігається без ПДВ (Ф1)
      if (priceIncludesVat && data.purchasePrice != null) data.purchasePrice = normalizeInputPrice(data.purchasePrice, true, this.db.settings.vatRatePct);
      const userRef: UserRef = { id: user.id, shortName: user.shortName };
      const entry = this.mutate((db): PriceHistoryEntry | null => {
        const p = db.products[id];
        if (!p) return null;
        const stockQty = data.stockQty !== undefined ? data.stockQty : p.stockQty;
        const availability = data.availability ?? (data.stockQty !== undefined ? availabilityOf(data.stockQty) : p.availability);
        const changed =
          p.currency !== data.currency ||
          p.purchasePrice !== data.purchasePrice ||
          p.rrp !== data.rrp ||
          p.stockQty !== stockQty ||
          p.availability !== availability;
        Object.assign(p, {
          currency: data.currency,
          purchasePrice: data.purchasePrice,
          rrp: data.rrp,
          stockQty,
          availability,
          priceUpdatedAt: at,
          updatedAt: at,
          priceSource: data.source,
        });
        if (!changed) return null;
        const e: PriceHistoryEntry = {
          id: db.nextPriceHistoryId++,
          productId: id,
          effectiveAt: at,
          currency: data.currency,
          purchasePrice: data.purchasePrice,
          rrp: data.rrp,
          stockQty,
          availability,
          source: data.source,
          importId: null,
          requestId: null,
          requestNumber: null,
          user: userRef,
          note: data.note ?? null,
        };
        (db.priceHistory[id] ??= []).push(e);
        return e;
      });
      return {
        product: clone(toProductDetail(this.requireProduct(id), this.productCtx())),
        historyEntry: entry ? clone(entry) : null,
      };
    });
  }

  getPriceHistory(id: UUID): Promise<PriceHistoryEntry[]> {
    return this.call(() => {
      this.requireUser();
      this.requireProduct(id);
      return clone([...(this.db.priceHistory[id] ?? [])].reverse());
    });
  }

  // ── Фото товару ─────────────────────────────────────────────────
  // Фото живуть на сервері (файли й посилання з прайсів). У демо-даних є лише головне фото з каталогу.

  listProductImages(productId: UUID): Promise<ProductImageDto[]> {
    return this.call(() => {
      const p = this.requireProduct(productId);
      if (!p.imageUrl) return [];
      return [
        {
          id: `${productId}:main`,
          productId,
          source: 'feed' as const,
          url: p.imageUrl,
          isMain: true,
          sortOrder: 0,
          fileName: null,
          sizeBytes: null,
          createdAt: p.updatedAt,
        },
      ];
    });
  }

  uploadProductImage(_productId: UUID, _file: File): Promise<ProductImageDto> {
    return this.notOnDemoData();
  }

  addProductImageUrl(_productId: UUID, _input: ProductImageUrlInput): Promise<ProductImageDto> {
    return this.notOnDemoData();
  }

  updateProductImage(_productId: UUID, _imageId: UUID, _patch: ProductImagePatch): Promise<ProductImageDto> {
    return this.notOnDemoData();
  }

  deleteProductImage(_productId: UUID, _imageId: UUID): Promise<void> {
    return this.notOnDemoData();
  }

  private notOnDemoData<T>(): Promise<T> {
    return Promise.reject(new DataSourceError('NOT_IMPLEMENTED', 'Фото зберігаються на сервері — у демо-режимі недоступні'));
  }

  // ── Заявки ──────────────────────────────────────────────────────
  listRequests(query: RequestListQuery = {}): Promise<RequestListItem[]> {
    return this.call(() => {
      const user = this.requireUser();
      const locks = this.locks.all();
      const tokens = (query.search ?? '').toLocaleLowerCase('uk').split(/\s+/u).filter(Boolean);
      const items = Object.values(this.db.requests)
        .map((r) => toRequestListItem(this.db, r, this.lockInfoOrNull(locks.get(r.id), user)))
        .filter((it) => {
          if (query.status?.length && !query.status.includes(it.status)) return false;
          if (query.clientId && it.client?.id !== query.clientId) return false;
          if (query.managerId && it.manager.id !== query.managerId) return false;
          if (query.mine && it.manager.id !== user.id) return false;
          if (query.dateFrom && it.requestDate < query.dateFrom) return false;
          if (query.dateTo && it.requestDate > query.dateTo) return false;
          if (tokens.length) {
            const text = [it.numberLabel, it.client?.name, it.counterparty?.nameShort, it.counterparty?.edrpou, it.title]
              .filter(Boolean)
              .join(' ')
              .toLocaleLowerCase('uk');
            if (!tokens.every((t) => text.includes(t))) return false;
          }
          return true;
        });
      const sort = query.sort ?? '-number';
      const desc = sort.startsWith('-');
      const field = desc ? sort.slice(1) : sort;
      items.sort((a, b) => {
        const va = field === 'requestDate' ? a.requestDate : field === 'totalSaleGross' ? a.totalSaleGross : a.number;
        const vb = field === 'requestDate' ? b.requestDate : field === 'totalSaleGross' ? b.totalSaleGross : b.number;
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return desc ? -cmp : cmp;
      });
      return clone(items);
    });
  }

  createRequest(body: CreateRequestBody): Promise<CreateRequestResult> {
    return this.call(() => {
      const user = this.requireUser();
      const data = clone(body);
      if (data.clientId) this.requireClient(data.clientId);
      if (data.ownCompanyId && !this.db.ownCompanies.some((c) => c.id === data.ownCompanyId)) {
        throw new DataSourceError('VALIDATION_ERROR', 'Невідома юрособа');
      }
      const id = newId();
      const now = this.now();
      const at = now.toISOString();
      const requestDate = data.requestDate ?? toIsoDate(now);
      const userRef: UserRef = { id: user.id, shortName: user.shortName };
      const number = this.mutate((db) => {
        const n = db.settings.nextRequestNumber++;
        const client = data.clientId ? db.clients[data.clientId] : undefined;
        const counterparty =
          client?.counterparties.find((c) => c.id === data.counterpartyId) ??
          client?.counterparties.find((c) => c.isDefault) ??
          client?.counterparties[0];
        const contact =
          client?.contacts.find((c) => c.id === data.contactId) ??
          client?.contacts.find((c) => c.counterpartyId === counterparty?.id && c.isPrimary) ??
          client?.contacts.find((c) => c.counterpartyId === counterparty?.id);
        const own = db.ownCompanies.find((c) => c.id === data.ownCompanyId) ?? db.ownCompanies.find((c) => c.isDefault) ?? db.ownCompanies[0];
        const header: RequestHeader = {
          number: n,
          requestDate,
          status: 'in_progress',
          title: data.title?.trim() || null,
          clientId: client?.id ?? null,
          counterpartyId: counterparty?.id ?? null,
          contactId: contact?.id ?? null,
          ownCompanyId: own.id,
          managerId: data.managerId ?? user.id,
          notes: null,
          purchaseNote: null,
          rates: headerRatesOn(db, requestDate),
          vatRatePct: db.settings.vatRatePct,
          kpSettings: defaultKpSettings(db.settings, own),
          cancelReason: null,
        };
        const req: StoredRequest = {
          id,
          version: 1,
          header,
          markup: defaultMarkupSettings(db.settings),
          lines: [],
          blocks: [],
          offers: [],
          meta: { createdAt: at, updatedAt: at, updatedBy: userRef, sourceRequestId: null, copyInfo: null, kpCount: 0, attachmentsCount: 0 },
          totals: { linesCount: 0, suppliersCount: 0, totalPurchaseGross: 0, totalSaleNet: 0, totalSaleGross: 0, profitNet: 0, approvedSaleGross: null },
        };
        db.requests[id] = req;
        addEvent(db, id, { at, user: userRef, kind: 'created', summary: 'Заявку створено' });
        return n;
      });
      return { id, number };
    });
  }

  getRequestDocument(id: UUID): Promise<RequestDocument> {
    return this.call(() => {
      const user = this.requireUser();
      const r = this.requireRequest(id);
      return buildRequestDocument(this.db, r, this.lockInfoOrNull(this.locks.get(id), user));
    });
  }

  saveRequestDocument(id: UUID, patch: DocumentPatch, options?: CallOptions): Promise<SaveDocumentResponse> {
    return this.call(() => {
      const user = this.requireUser();
      const r = this.requireRequest(id);
      if (!isEditableStatus(r.header.status)) {
        throw new DataSourceError('READ_ONLY', `Заявка в статусі «${REQUEST_STATUS_LABELS[r.header.status]}» — лише перегляд`);
      }
      this.assertLock(id, patch.sessionId);
      if (patch.baseVersion !== r.version) {
        throw new DataSourceError('VERSION_CONFLICT', 'Заявку змінено в іншій вкладці — дані перезавантажено');
      }
      const now = this.now();
      const at = now.toISOString();
      const data = clone(patch);
      const userRef: UserRef = { id: user.id, shortName: user.shortName };
      const saved = this.mutate((db) => {
        const req = db.requests[id];
        if (!req) return null;
        const before = documentEventsBefore(req);
        applyDocumentPatch(req, data);
        recordDocumentEvents(db, req, before, data, userRef, at);
        req.version += 1;
        req.meta.updatedAt = at;
        req.meta.updatedBy = userRef;
        req.totals = computeStoredTotals(db, req, now);
        return { version: req.version, status: req.header.status, totals: clone(req.totals) };
      });
      if (!saved) throw new DataSourceError('NOT_FOUND', 'Заявку не знайдено');
      const lock = this.locks.heartbeat(id, patch.sessionId);
      if (options?.keepalive) void this.store?.flush();
      return { ...saved, updatedAt: at, lockExpiresAt: lock?.expiresAt ?? at };
    }, options);
  }

  changeStatus(id: UUID, body: StatusChangeBody): Promise<StatusChangeResult> {
    return this.call(() => {
      const user = this.requireUser();
      const r = this.requireRequest(id);
      this.assertLock(id, body.sessionId);
      if (body.baseVersion !== r.version) {
        throw new DataSourceError('VERSION_CONFLICT', 'Заявку змінено в іншій вкладці — дані перезавантажено');
      }
      const check = validateTransition(r.header.status, body.to, user.role, body.reason);
      if (!check.ok) throw new DataSourceError(check.code, check.message);
      const change = applyStatusChange(body.to, body.reason);
      const at = this.nowIso();
      const userRef: UserRef = { id: user.id, shortName: user.shortName };
      return this.mutate((db) => {
        const req = db.requests[id];
        const from = req.header.status;
        Object.assign(req.header, change);
        addEvent(db, id, { at, user: userRef, kind: 'status_change', summary: statusEventSummary(from, req.header.status, req.header.cancelReason) });
        req.version += 1;
        req.meta.updatedAt = at;
        req.meta.updatedBy = userRef;
        return { status: req.header.status, version: req.version };
      });
    });
  }

  copyRequest(id: UUID, body: CopyRequestBody): Promise<CopyRequestResult> {
    return this.call(() => {
      const user = this.requireUser();
      this.requireRequest(id);
      const newReqId = newId();
      const now = this.now();
      const at = now.toISOString();
      const today = toIsoDate(now);
      const data = clone(body);
      const userRef: UserRef = { id: user.id, shortName: user.shortName };
      return this.mutate((db) => copyStoredRequest(db, id, newReqId, data, { now, at, today, user: userRef }));
    });
  }

  listKps(requestId: UUID): Promise<KpDocumentDto[]> {
    return this.call(() => {
      this.requireUser();
      this.requireRequest(requestId);
      return clone([...(this.db.kps[requestId] ?? [])].reverse());
    });
  }

  createKp(requestId: UUID, body: KpCreateBody): Promise<KpDocumentDto> {
    return this.call(() => {
      const user = this.requireUser();
      const r = this.requireRequest(requestId);
      if (!isEditableStatus(r.header.status)) {
        throw new DataSourceError('READ_ONLY', `Заявка в статусі «${REQUEST_STATUS_LABELS[r.header.status]}» — КП не формується`);
      }
      this.assertLock(requestId, body.sessionId);
      const now = this.now();
      const input = {
        date: toIsoDate(now),
        at: now.toISOString(),
        user: { id: user.id, shortName: user.shortName },
        settings: clone(body.settings),
        final: !!body.final,
        ctx: { now, settings: pricingSettingsFrom(this.db.settings), suppliers: supplierRefsOf(this.db) },
        defaultTerms: this.db.settings.kpTerms,
      };
      // перевірка до зміни БД: помилка не витрачає номер КП
      makeKpDocument(this.db, r, { ...input, id: 'check', kpNumber: this.db.settings.nextKpNumber });
      return this.mutate((db) => {
        const req = db.requests[requestId];
        // номер КП сталий: «2114 / номер заявки»; версії розрізняються датою й позначкою «фінальне»
        const kp = makeKpDocument(db, req, { ...input, id: newId(), kpNumber: db.settings.nextKpNumber });
        (db.kps[requestId] ??= []).push(kp);
        req.meta.kpCount = db.kps[requestId].length;
        req.meta.attachmentsCount += 1; // КП (PDF / Excel) — на вкладці «Файли»
        req.totals = computeStoredTotals(db, req, now);
        const own = db.ownCompanies.find((c) => c.id === kp.ownCompanyId);
        addEvent(db, requestId, { at: input.at, user: input.user, kind: 'kp_created', summary: kpEventSummary(kp, own?.nameShort ?? '') });
        return clone(kp);
      });
    });
  }

  getRequestHistory(requestId: UUID): Promise<RequestHistoryResponse> {
    return this.call(() => {
      this.requireUser();
      this.requireRequest(requestId);
      return { events: clone([...(this.db.events[requestId] ?? [])].reverse()) };
    });
  }

  // ── Блокування ──────────────────────────────────────────────────
  acquireLock(id: UUID): Promise<LockAcquireResult> {
    return this.call(() => {
      const user = this.requireUser();
      this.requireRequest(id);
      const res = this.locks.acquire(id, { userId: user.id, userShortName: user.shortName, sessionId: this.sessionId });
      return { acquired: res.ok, lock: this.lockInfo(res.lock, user) };
    });
  }

  heartbeat(id: UUID): Promise<LockInfo> {
    return this.call(() => {
      const user = this.requireUser();
      const rec = this.locks.heartbeat(id, this.sessionId);
      if (!rec) throw new DataSourceError('LOCK_LOST', 'Редагування заявки перейшло до іншого користувача');
      return this.lockInfo(rec, user);
    });
  }

  async releaseLock(id: UUID, options?: CallOptions): Promise<void> {
    // звільняємо одразу (синхронно) — важливо при закритті сторінки
    this.lockRegistry?.release(id, this.sessionId);
    await this.call(() => {
      this.locks.release(id, this.sessionId);
    }, options);
  }

  forceLock(id: UUID): Promise<LockInfo> {
    return this.call(() => {
      const user = this.requireAdmin();
      this.requireRequest(id);
      const prev = this.locks.get(id);
      const rec = this.locks.force(id, { userId: user.id, userShortName: user.shortName, sessionId: this.sessionId });
      if (prev && prev.sessionId !== this.sessionId) {
        const at = this.nowIso();
        const summary = `Редагування передано адміністратору: ${prev.userShortName} → ${user.shortName}`;
        this.mutate((db) => addEvent(db, id, { at, user: { id: user.id, shortName: user.shortName }, kind: 'lock_force', summary }));
      }
      return this.lockInfo(rec, user);
    });
  }

  getLockStatus(id: UUID): Promise<LockStatusResponse> {
    return this.call(() => {
      const user = this.requireUser();
      const r = this.requireRequest(id);
      return { lock: this.lockInfoOrNull(this.locks.get(id), user), version: r.version, status: r.header.status, updatedAt: r.meta.updatedAt };
    });
  }

  // ── Курси, демо ─────────────────────────────────────────────────
  getRates(date: ISODate): Promise<EffectiveRates> {
    return this.call(() => {
      this.requireUser();
      return clone(effectiveRatesOn(this.db.rates, date));
    });
  }

  listRates(): Promise<CurrencyRateDto[]> {
    return this.call(() => {
      this.requireUser();
      return clone(this.db.rates);
    });
  }

  addManualRate(input: ManualRateInput): Promise<CurrencyRateDto> {
    return this.call(() => {
      this.requireUser();
      if (!(input.rate > 0)) throw new DataSourceError('VALIDATION_ERROR', 'Курс має бути більшим за нуль');
      const at = this.nowIso();
      const entry: CurrencyRateDto = {
        id: Math.max(0, ...this.db.rates.map((r) => r.id)) + 1,
        currency: input.currency,
        rateDate: input.rateDate,
        rate: round4(input.rate),
        source: 'manual',
        fetchedAt: at,
        note: input.note?.trim() || null,
      };
      this.mutate((db) => {
        // один ручний курс валюти на дату: новий замінює попередній
        db.rates = db.rates.filter((r) => !(r.source === 'manual' && r.currency === entry.currency && r.rateDate === entry.rateDate));
        db.rates.push(entry);
      });
      return clone(entry);
    });
  }

  async resetDemoData(): Promise<void> {
    await this.call(() => this.requireAdmin());
    this.locks.clearAll();
    await this.store!.reset();
    this.locks.setTtl(this.db.settings.lockTtlSeconds * 1000);
    this.emit({ kind: 'reset' });
  }

  // ── внутрішнє ───────────────────────────────────────────────────
  private ready(): Promise<void> {
    return (this.readyPromise ??= this.init());
  }

  private async init(): Promise<void> {
    const channelFactory = this.opts.channelFactory ?? openBroadcastChannel;
    const persistence = this.opts.persistence ?? (typeof indexedDB !== 'undefined' ? idbPersistence : memoryPersistence());
    const auth = await seedAuthOf(this.overrides?.auth);
    const store = new MockDbStore({
      persistence,
      channel: channelFactory(DB_CHANNEL),
      seed: () => buildSeedDb({ now: this.now(), overrides: this.overrides, logos: this.logos, fingerprint: this.fingerprint, auth }),
      isCompatible: (db) => db.schemaVersion === DB_SCHEMA_VERSION && db.seedVersion === SEED_VERSION && db.fingerprint === this.fingerprint,
      debounceMs: this.opts.persistDebounceMs ?? 500,
    });
    await store.init();
    this.store = store;
    const locks = new LockRegistry({
      storage: this.local,
      channel: channelFactory(LOCKS_CHANNEL),
      ttlMs: store.db.settings.lockTtlSeconds * 1000,
      now: () => this.now().getTime(),
    });
    this.lockRegistry = locks;
    store.subscribe((e) => {
      locks.setTtl(store.db.settings.lockTtlSeconds * 1000);
      this.emit(e === 'reset' ? { kind: 'reset' } : { kind: 'db' });
    });
    locks.subscribe((e) => this.onLockEvent(e));
    const bind = this.opts.bindPageLifecycle ?? typeof window !== 'undefined';
    if (bind && typeof window !== 'undefined') window.addEventListener('pagehide', () => void store.flush());
  }

  private async call<T>(fn: () => T, options?: CallOptions): Promise<T> {
    await this.ready();
    if (!options?.keepalive) await this.delay();
    return fn();
  }

  private delay(): Promise<void> {
    // Фонові вкладки: Chrome гальмує таймери до 1 разу/хв — не тримаємо запит на штучній затримці, коли вкладка прихована.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return Promise.resolve();
    const [min, max] = this.latency;
    if (max <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, min + Math.random() * Math.max(0, max - min)));
  }

  private get db(): MockDb {
    if (!this.store) throw new Error('MockDataSource is not ready');
    return this.store.db;
  }

  private get locks(): LockRegistry {
    if (!this.lockRegistry) throw new Error('MockDataSource is not ready');
    return this.lockRegistry;
  }

  private mutate<T>(op: (db: MockDb) => T): T {
    return this.store!.mutate(op);
  }

  private emit(event: DataSourceEvent): void {
    for (const l of this.listeners) l(event);
  }

  private nowIso(): string {
    return this.now().toISOString();
  }

  private meResponse(user: UserDto): MeResponse {
    return { user: clone(user), settings: clone(this.db.settings), serverTime: this.nowIso() };
  }

  private currentUser(): UserDto | null {
    const id = this.authStorage.getItem(AUTH_USER_KEY);
    return id ? (this.db.users.find((u) => u.id === id && u.isActive) ?? null) : null;
  }

  private requireUser(): UserDto {
    const user = this.currentUser();
    if (!user) throw new DataSourceError('UNAUTHORIZED', 'Увійдіть, щоб продовжити');
    return user;
  }

  private requireAdmin(): UserDto {
    const user = this.requireUser();
    if (user.role !== 'admin') throw new DataSourceError('FORBIDDEN', 'Дія доступна лише адміністратору');
    return user;
  }

  private userRef(id: UUID | null): UserRef | null {
    const u = id ? this.db.users.find((x) => x.id === id) : undefined;
    return u ? { id: u.id, shortName: u.shortName } : null;
  }

  private requireRequest(id: UUID): StoredRequest {
    const r = this.db.requests[id];
    if (!r) throw new DataSourceError('NOT_FOUND', 'Заявку не знайдено');
    return r;
  }

  private requireClient(id: UUID): ClientDetail {
    const c = this.db.clients[id];
    if (!c) throw new DataSourceError('NOT_FOUND', 'Клієнта не знайдено');
    return c;
  }

  private requireSupplier(id: UUID): StoredSupplier {
    const s = this.db.suppliers.find((x) => x.id === id);
    if (!s) throw new DataSourceError('NOT_FOUND', 'Постачальника не знайдено');
    return s;
  }

  private requireProduct(id: UUID): StoredProduct {
    const p = this.db.products[id];
    if (!p) throw new DataSourceError('NOT_FOUND', 'Товар не знайдено');
    return p;
  }

  private productCounts(): Map<UUID, number> {
    const counts = new Map<UUID, number>();
    for (const p of Object.values(this.db.products)) if (!p.isArchived) counts.set(p.supplierId, (counts.get(p.supplierId) ?? 0) + 1);
    return counts;
  }

  private productCtx(): ProductDtoContext {
    const now = this.now();
    const nbu = headerRatesOn(this.db, toIsoDate(now));
    return {
      now,
      staleDays: this.db.settings.priceStaleDays,
      nbu: { USD: nbu.USD, EUR: nbu.EUR },
      suppliers: new Map(this.db.suppliers.map((s) => [s.id, s])),
    };
  }

  private assertLock(id: UUID, sessionId: UUID): void {
    if (!this.locks.holds(id, sessionId)) {
      const holder = this.locks.get(id);
      throw new DataSourceError(
        'LOCK_LOST',
        holder ? `Заявку зараз редагує ${holder.userShortName} — зміни не збережено` : 'Редагування заявки втрачено — відкрийте її знову',
        { lock: holder },
      );
    }
  }

  private lockInfo(rec: LockRecord, user: UserDto | null): LockInfo {
    return { ...rec, isMine: rec.userId === user?.id, isMySession: rec.sessionId === this.sessionId };
  }

  private lockInfoOrNull(rec: LockRecord | null | undefined, user: UserDto | null): LockInfo | null {
    return rec ? this.lockInfo(rec, user) : null;
  }

  private onLockEvent(e: LockEvent): void {
    if (!this.store) return;
    const user = this.currentUser();
    if (e.type === 'changed') {
      this.emit({ kind: 'lock', requestId: e.requestId, lock: this.lockInfoOrNull(e.lock, user) });
    } else {
      this.emit({ kind: 'lock-forced', requestId: e.requestId, lock: this.lockInfo(e.lock, user), fromSessionId: e.fromSessionId });
    }
  }
}

// ── копіювання заявки (спрощено: без історії змін цін по рядках) ────
function copyStoredRequest(
  db: MockDb,
  sourceId: UUID,
  newReqId: UUID,
  body: CopyRequestBody,
  t: { now: Date; at: string; today: ISODate; user: UserRef },
): CopyRequestResult {
  const src = db.requests[sourceId];
  const number = db.settings.nextRequestNumber++;
  const clientId = body.clientId !== undefined ? body.clientId : src.header.clientId;
  const client = clientId ? db.clients[clientId] : undefined;
  const sameClient = clientId === src.header.clientId;
  const counterpartyId =
    body.counterpartyId !== undefined
      ? body.counterpartyId
      : sameClient
        ? src.header.counterpartyId
        : (client?.counterparties.find((c) => c.isDefault)?.id ?? client?.counterparties[0]?.id ?? null);
  const contactId =
    body.contactId !== undefined
      ? body.contactId
      : sameClient
        ? src.header.contactId
        : (client?.contacts.find((c) => c.counterpartyId === counterpartyId)?.id ?? null);
  const own = db.ownCompanies.find((c) => c.id === src.header.ownCompanyId) ?? db.ownCompanies[0];
  const rates = headerRatesOn(db, t.today);
  const header: RequestHeader = {
    ...clone(src.header),
    number,
    requestDate: t.today,
    status: 'in_progress',
    clientId: clientId ?? null,
    counterpartyId,
    contactId,
    managerId: t.user.id,
    rates,
    kpSettings: defaultKpSettings(db.settings, own),
    cancelReason: null,
  };

  const withSourcing = body.include !== 'lines';
  const full = body.include === 'full';
  const lineIds = new Map<UUID, UUID>();
  const blockIds = new Map<UUID, UUID>();
  const supplierRefs = supplierRefsOf(db);

  const blocks: SupplierBlock[] = withSourcing
    ? src.blocks.map((b) => {
        const id = newId();
        blockIds.set(b.id, id);
        const supplier = b.supplierId ? supplierRefs[b.supplierId] : undefined;
        if (body.priceMode === 'refresh' && supplier) return createSupplierBlock(supplier, rates, { id, position: b.position });
        return { ...clone(b), id };
      })
    : [];
  const lines: RequestLine[] = src.lines.map((l) => {
    const id = newId();
    lineIds.set(l.id, id);
    return {
      ...clone(l),
      id,
      selection: { blockId: withSourcing && l.selection.blockId ? (blockIds.get(l.selection.blockId) ?? null) : null },
      markup: full ? clone(l.markup) : { method: null, value: null, manualPriceNet: null },
      approval: { approved: false, approvedQty: null },
      kpName: full ? l.kpName : null,
    };
  });

  const report: CopyReport = {
    sourceRequestId: sourceId,
    sourceNumber: src.header.number,
    include: body.include,
    priceMode: body.priceMode,
    offersTotal: 0,
    offersRefreshed: 0,
    offersUnchanged: 0,
    offersNotInCatalog: 0,
    priceUp: 0,
    priceDown: 0,
    ratesChanged: blocks.some((b, i) => b.rates.USD !== src.blocks[i]?.rates.USD || b.rates.EUR !== src.blocks[i]?.rates.EUR),
    createdAt: t.at,
  };
  const offers: StoredOffer[] = [];
  if (withSourcing) {
    for (const o of src.offers) {
      const lineId = lineIds.get(o.lineId);
      const blockId = blockIds.get(o.blockId);
      if (!lineId || !blockId) continue;
      report.offersTotal++;
      let next: StoredOffer = { ...clone(o), id: newId(), lineId, blockId, priceChange: null };
      const product = o.productId ? db.products[o.productId] : undefined;
      if (body.priceMode === 'refresh') {
        if (!product) {
          report.offersNotInCatalog++;
        } else {
          const oldBlock = src.blocks.find((b) => b.id === o.blockId);
          const prevRate = oldBlock ? resolveRate(o.currency, oldBlock.rates, src.header.rates) : null;
          next = stripCatalog(
            refreshOfferFromCatalog(next, catalogSnapshotOf(product), prevRate, t.now, 'copy_refresh', oldBlock?.supplierMarkupPct ?? 0),
          );
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

  const req: StoredRequest = {
    id: newReqId,
    version: 1,
    header,
    markup: full ? clone(src.markup) : defaultMarkupSettings(db.settings),
    lines,
    blocks,
    offers,
    meta: {
      createdAt: t.at,
      updatedAt: t.at,
      updatedBy: t.user,
      sourceRequestId: sourceId,
      copyInfo: report,
      kpCount: 0,
      attachmentsCount: 0,
    },
    totals: { linesCount: 0, suppliersCount: 0, totalPurchaseGross: 0, totalSaleNet: 0, totalSaleGross: 0, profitNet: 0, approvedSaleGross: null },
  };
  req.totals = computeStoredTotals(db, req, t.now);
  db.requests[newReqId] = req;
  const prices =
    body.priceMode === 'refresh' ? `ціни перераховано за каталогом (змінилось: ${report.offersRefreshed})` : 'ціни з оригіналу';
  addEvent(db, newReqId, {
    at: t.at,
    user: t.user,
    kind: 'copy',
    summary: `Створено копією заявки № ${formatRequestNumber(src.header.number)}: ${COPY_INCLUDE_LABELS[body.include]}, ${prices}`,
  });
  return { id: newReqId, number, report: clone(report) };
}

function demoPriceSourceSettings(source: SupplierPriceSource): SupplierPriceSourceSettings {
  return { ...clone(source), auth: 'none', hasUrl: source.host != null, hasSecret: false, lastError: null, lastErrorAt: null, failCount: 0 };
}

function urlHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.host || null : null;
  } catch {
    return null;
  }
}
