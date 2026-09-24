// Тестовий «сервер» у пам'яті для стора заявки: та сама спільна логіка, що й на справжньому сервері
// (дельта документа, історія, статуси), блокування з TTL. Кожна «вкладка» — свій ідентифікатор сесії.
import { DEFAULT_APP_SETTINGS, catalogSnapshotOf, defaultMarkupSettings, pricingSettingsFrom } from '@shared/pricing';
import { makeSupplier } from '@shared/pricing/__tests__/fixtures';
import {
  applyDocumentPatch,
  createEventLog,
  documentEventsBefore,
  recordDocumentEvents,
  requestTotals,
  statusEventSummary,
  toSupplierRef,
  type RequestDocState,
  type RequestEventDraft,
} from '@shared/requests';
import { applyStatusChange, isEditableStatus, validateTransition } from '@shared/status';
import type {
  AppSettings,
  CreateRequestBody,
  CreateRequestResult,
  DocumentPatch,
  EffectiveRates,
  ISODate,
  LockInfo,
  LockStatusResponse,
  ProductDetail,
  ProductInput,
  ProductPickDto,
  RequestDocument,
  RequestEventDto,
  RequestHistoryResponse,
  SaveDocumentResponse,
  SkuLookupBody,
  SkuLookupResult,
  StatusChangeBody,
  StatusChangeResult,
  SupplierListItem,
  UserRef,
  UUID,
} from '@shared/types';
import type { UserRole } from '@shared/enums';
import type { DataSource, LockAcquireResult } from '@/data/DataSource';
import { DataSourceError } from '@/data/errors';

export const TEST_NOW = Date.parse('2026-09-11T09:00:00.000Z');

export interface FakeUser extends UserRef {
  role: UserRole;
}

export const USERS = {
  koval: { id: 'u-koval', shortName: 'Коваль О.В.', role: 'user' },
  bondar: { id: 'u-bondar', shortName: 'Бондар І.П.', role: 'user' },
  admin: { id: 'u-admin', shortName: 'Адміністратор', role: 'admin' },
} satisfies Record<string, FakeUser>;

interface StoredRequest {
  state: RequestDocState;
  version: number;
  events: RequestEventDto[];
  createdAt: string;
  updatedAt: string;
}

interface StoredLock {
  userId: UUID;
  sessionId: UUID;
  lockedAt: number;
  expiresAt: number;
}

export function supplierItem(id: string, patch: Partial<SupplierListItem> = {}): SupplierListItem {
  return {
    ...makeSupplier(id),
    productsCount: 0,
    lastImportAt: null,
    priceSource: 'file',
    isActive: true,
    sortOrder: 0,
    ...patch,
  } as SupplierListItem;
}

export function pickProduct(id: string, supplierId: string, patch: Partial<ProductPickDto> = {}): ProductPickDto {
  return {
    id,
    supplierId,
    supplierName: `Постачальник ${supplierId}`,
    sku: `SKU-${id}`,
    nameWork: `Товар ${id}`,
    name1c: null,
    brand: null,
    unitCode: 'шт',
    currency: 'UAH',
    purchasePrice: 100,
    rrp: null,
    purchasePriceUah: null,
    multiplicity: 1,
    stockQty: null,
    availability: 'in_stock',
    priceUpdatedAt: '2026-09-10T09:00:00Z',
    isStale: false,
    missingSince: null,
    imageUrl: null,
    productUrl: null,
    isArchived: false,
    matchKind: 'text',
    score: 0,
    ...patch,
  };
}

const normSku = (s: string) => s.toLowerCase().replace(/[\s._/-]+/gu, '');

export class FakeServer {
  readonly clock = { t: TEST_NOW };
  settings: AppSettings = { ...DEFAULT_APP_SETTINGS, nextRequestNumber: 1 };
  suppliers: SupplierListItem[] = [];
  /** Загальний курс на сьогодні («Курси валют»); null — getRates падає, і стор бере курс із шапки заявки. */
  ratesToday: EffectiveRates | null = null;
  products = new Map<UUID, ProductPickDto>();
  readonly requests = new Map<UUID, StoredRequest>();
  readonly locks = new Map<UUID, StoredLock>();
  private seq = 0;

  now(): Date {
    return new Date(this.clock.t);
  }

  addProducts(...list: ProductPickDto[]): void {
    for (const p of list) this.products.set(p.id, p);
  }

  /** Заявка з готового документа (номер — з лічильника). */
  addRequest(state: Omit<RequestDocState, 'header'> & { header?: Partial<RequestDocState['header']> }, id = `req-${++this.seq}`): UUID {
    const at = this.now().toISOString();
    const number = this.settings.nextRequestNumber++;
    const header = { ...emptyHeader(number, this.settings), ...state.header, number };
    this.requests.set(id, { state: { ...state, header } as RequestDocState, version: 1, events: [], createdAt: at, updatedAt: at });
    return id;
  }

  /** «Вкладка» користувача: окремий ідентифікатор сесії, як у браузері. */
  tab(user: FakeUser, label: string): DataSource {
    const api = new FakeTab(this, user, `session-${label}`);
    // решта методів у стора не використовується — явна помилка, якщо знадобляться
    return new Proxy(api, {
      get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver) as unknown;
        if (prop === 'then') return undefined;
        return () => Promise.reject(new Error(`FakeServer: ${String(prop)} не реалізовано`));
      },
    }) as unknown as DataSource;
  }

  request(id: UUID): StoredRequest {
    const r = this.requests.get(id);
    if (!r) throw new DataSourceError('NOT_FOUND', 'Заявку не знайдено');
    return r;
  }

  activeLock(id: UUID): StoredLock | null {
    const l = this.locks.get(id);
    return l && l.expiresAt > this.clock.t ? l : null;
  }

  lockInfo(l: StoredLock | null, user: FakeUser, sessionId: string): LockInfo | null {
    if (!l) return null;
    const holder = Object.values(USERS).find((u) => u.id === l.userId);
    return {
      userId: l.userId,
      userShortName: holder?.shortName ?? '',
      sessionId: l.sessionId,
      lockedAt: new Date(l.lockedAt).toISOString(),
      expiresAt: new Date(l.expiresAt).toISOString(),
      isMine: l.userId === user.id,
      isMySession: l.userId === user.id && l.sessionId === sessionId,
    };
  }

  lockLost(id: UUID, user: FakeUser, sessionId: string): DataSourceError {
    const info = this.lockInfo(this.activeLock(id), user, sessionId);
    return new DataSourceError('LOCK_LOST', info ? `Заявку зараз редагує ${info.userShortName}` : 'Редагування заявки втрачено', { lock: info });
  }

  /** Як на сервері: запис блокування за вкладкою (строк міг минути, якщо ніхто не взяв). */
  assertLock(id: UUID, user: FakeUser, sessionId: string): void {
    const l = this.locks.get(id);
    if (!l || l.userId !== user.id || l.sessionId !== sessionId) throw this.lockLost(id, user, sessionId);
  }

  ttl(): number {
    return this.settings.lockTtlSeconds * 1000;
  }

  addEvents(r: StoredRequest, changes: { update: RequestEventDraft | null; insert: RequestEventDraft[] }): void {
    if (changes.update) {
      const i = r.events.findIndex((e) => e.id === changes.update!.id);
      if (i >= 0) r.events[i] = { ...(changes.update as RequestEventDto) };
    }
    for (const e of changes.insert) r.events.push({ ...e, id: r.events.length + 1 } as RequestEventDto);
  }
}

function emptyHeader(number: number, s: AppSettings): RequestDocState['header'] {
  return {
    number,
    requestDate: '2026-09-11',
    status: 'in_progress',
    title: null,
    clientId: null,
    counterpartyId: null,
    contactId: null,
    ownCompanyId: 'own-1',
    managerId: USERS.koval.id,
    notes: null,
    purchaseNote: null,
    rates: { USD: 45, EUR: 52.1, date: '2026-09-11' },
    vatRatePct: s.vatRatePct,
    discountFormula: s.discountFormula,
    kpSettings: { vatMode: 'without_vat', nameSource: 'work', showSku: true, showImages: false, validityDays: 3, extraInfo: null, onlyApproved: false },
    approvalKpId: null,
    cancelReason: null,
  };
}

class FakeTab {
  constructor(
    private readonly srv: FakeServer,
    private readonly user: FakeUser,
    readonly sessionId: string,
  ) {}

  private get ref(): UserRef {
    return { id: this.user.id, shortName: this.user.shortName };
  }

  async getSettings(): Promise<AppSettings> {
    return structuredClone(this.srv.settings);
  }

  async listSuppliers(): Promise<SupplierListItem[]> {
    return structuredClone(this.srv.suppliers);
  }

  async getRates(date: ISODate): Promise<EffectiveRates> {
    if (!this.srv.ratesToday) throw new Error('FakeServer: курсу немає');
    return { ...structuredClone(this.srv.ratesToday), date };
  }

  async createRequest(body: CreateRequestBody): Promise<CreateRequestResult> {
    const id = this.srv.addRequest({
      header: { clientId: body.clientId ?? null, managerId: this.user.id, title: body.title ?? null },
      markup: defaultMarkupSettings(this.srv.settings),
      lines: [],
      blocks: [],
      offers: [],
    });
    return { id, number: this.srv.request(id).state.header.number };
  }

  async getRequestDocument(id: UUID): Promise<RequestDocument> {
    const r = this.srv.request(id);
    const s = structuredClone(r.state);
    const suppliers = Object.fromEntries(
      this.srv.suppliers.filter((x) => s.blocks.some((b) => b.supplierId === x.id)).map((x) => [x.id, toSupplierRef(x)]),
    );
    const lock = this.srv.lockInfo(this.srv.activeLock(id), this.user, this.sessionId);
    return {
      id,
      version: r.version,
      header: s.header,
      markup: s.markup,
      lines: [...s.lines].sort((a, b) => a.position - b.position),
      blocks: [...s.blocks].sort((a, b) => a.position - b.position),
      offers: s.offers.map((o) => {
        const p = o.productId ? this.srv.products.get(o.productId) : undefined;
        return { ...o, catalog: p ? catalogSnapshotOf(p) : null };
      }),
      lock,
      refs: {
        suppliers,
        client: null,
        counterparty: null,
        contact: null,
        ownCompany: { id: 'own-1', nameShort: 'ТОВ «ТЕСТ»', isVatPayer: true },
        manager: Object.values(USERS).find((u) => u.id === s.header.managerId) ?? { id: s.header.managerId, shortName: '' },
        pricing: pricingSettingsFrom(this.srv.settings),
      },
      meta: {
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        updatedBy: null,
        sourceRequestId: null,
        copyInfo: null,
        kpCount: 0,
        attachmentsCount: 0,
        readOnlyReason: !isEditableStatus(s.header.status) ? 'status' : lock && !lock.isMySession ? 'lock' : null,
      },
    };
  }

  async saveRequestDocument(id: UUID, patch: DocumentPatch): Promise<SaveDocumentResponse> {
    const r = this.srv.request(id);
    if (!isEditableStatus(r.state.header.status)) throw new DataSourceError('READ_ONLY', 'Лише перегляд');
    this.srv.assertLock(id, this.user, patch.sessionId);
    if (patch.baseVersion !== r.version) throw new DataSourceError('VERSION_CONFLICT', 'Заявку змінено в іншій вкладці');
    const before = r.state;
    const after = applyDocumentPatch(before, structuredClone(patch));
    const at = this.srv.now().toISOString();
    const log = createEventLog(r.events[r.events.length - 1] ?? null);
    const ctx = { now: this.srv.now(), settings: pricingSettingsFrom(this.srv.settings), suppliers: Object.fromEntries(this.srv.suppliers.map((x) => [x.id, toSupplierRef(x)])) };
    recordDocumentEvents(log, after, documentEventsBefore(before), patch, { supplierName: () => 'постачальника', kps: [], user: this.ref, at });
    this.srv.addEvents(r, log.changes());
    r.state = after;
    r.version += 1;
    r.updatedAt = at;
    const totals = requestTotals(after, ctx, []);
    if (patch.release) {
      this.srv.locks.delete(id);
      return { version: r.version, status: after.header.status, totals, lockExpiresAt: null, updatedAt: at };
    }
    const lock = this.srv.locks.get(id)!;
    lock.expiresAt = this.srv.clock.t + this.srv.ttl();
    return { version: r.version, status: after.header.status, totals, lockExpiresAt: new Date(lock.expiresAt).toISOString(), updatedAt: at };
  }

  async changeStatus(id: UUID, body: StatusChangeBody): Promise<StatusChangeResult> {
    const r = this.srv.request(id);
    this.srv.assertLock(id, this.user, body.sessionId);
    if (body.baseVersion !== r.version) throw new DataSourceError('VERSION_CONFLICT', 'Заявку змінено в іншій вкладці');
    const check = validateTransition(r.state.header.status, body.to, this.user.role, body.reason);
    if (!check.ok) throw new DataSourceError(check.code, check.message);
    const from = r.state.header.status;
    r.state = { ...r.state, header: { ...r.state.header, ...applyStatusChange(body.to, body.reason) } };
    r.version += 1;
    r.updatedAt = this.srv.now().toISOString();
    r.events.push({ id: r.events.length + 1, at: r.updatedAt, user: this.ref, kind: 'status_change', summary: statusEventSummary(from, body.to, r.state.header.cancelReason) });
    // як сервер: виконану чи скасовану заявку не блокуємо
    if (!isEditableStatus(body.to)) this.srv.locks.delete(id);
    return { status: body.to, version: r.version };
  }

  async getRequestHistory(id: UUID): Promise<RequestHistoryResponse> {
    return { events: structuredClone([...this.srv.request(id).events].reverse()) };
  }

  async lookupSkus(body: SkuLookupBody): Promise<SkuLookupResult> {
    const results: SkuLookupResult['results'] = {};
    for (const sku of body.skus) {
      results[sku] = [...this.srv.products.values()]
        .filter((p) => (!body.supplierId || p.supplierId === body.supplierId) && normSku(p.sku) === normSku(sku))
        .map((p) => ({ ...p, matchKind: 'sku_exact' as const }));
    }
    return { results };
  }

  async updateProductPrice(
    id: UUID,
    input: { currency: string; purchasePrice: number | null; rrp?: number | null; purchaseOnly?: boolean },
  ): Promise<{ product: ProductDetail; historyEntry: null }> {
    const p = this.srv.products.get(id);
    if (!p) throw new DataSourceError('NOT_FOUND', 'Товар не знайдено');
    if (input.purchaseOnly && input.currency !== p.currency) throw new DataSourceError('INVALID_STATE', 'Валюта товару в каталозі змінилась');
    const rrp = input.purchaseOnly ? p.rrp : (input.rrp ?? null);
    const next = { ...p, purchasePrice: input.purchasePrice, rrp, priceUpdatedAt: this.srv.now().toISOString() };
    this.srv.addProducts(next);
    return { product: { ...next, version: 1, minOrderQty: null, notes: null, priceSource: 'manual', lastImportId: null, createdAt: next.priceUpdatedAt!, updatedAt: next.priceUpdatedAt! } as ProductDetail, historyEntry: null };
  }

  async createProduct(input: ProductInput): Promise<ProductDetail> {
    const at = this.srv.now().toISOString();
    const p = pickProduct(`p-new-${this.srv.products.size + 1}`, input.supplierId, { sku: input.sku, nameWork: input.nameWork, purchasePrice: input.purchasePrice ?? null });
    this.srv.addProducts(p);
    return { ...p, version: 1, minOrderQty: null, notes: null, priceSource: 'manual', lastImportId: null, createdAt: at, updatedAt: at } as ProductDetail;
  }

  // ── блокування ────────────────────────────────────────────────────
  async acquireLock(id: UUID): Promise<LockAcquireResult> {
    this.srv.request(id);
    const cur = this.srv.activeLock(id);
    const t = this.srv.clock.t;
    if (!cur || (cur.userId === this.user.id && cur.sessionId === this.sessionId)) {
      const lock = { userId: this.user.id, sessionId: this.sessionId, lockedAt: cur?.lockedAt ?? t, expiresAt: t + this.srv.ttl() };
      this.srv.locks.set(id, lock);
      return { acquired: true, lock: this.srv.lockInfo(lock, this.user, this.sessionId) };
    }
    return { acquired: false, lock: this.srv.lockInfo(cur, this.user, this.sessionId) };
  }

  async heartbeat(id: UUID): Promise<LockInfo> {
    this.srv.assertLock(id, this.user, this.sessionId);
    const lock = this.srv.locks.get(id)!;
    lock.expiresAt = this.srv.clock.t + this.srv.ttl();
    return this.srv.lockInfo(lock, this.user, this.sessionId)!;
  }

  async releaseLock(id: UUID): Promise<void> {
    const l = this.srv.locks.get(id);
    if (l && l.userId === this.user.id && l.sessionId === this.sessionId) this.srv.locks.delete(id);
  }

  async forceLock(id: UUID): Promise<LockInfo> {
    if (this.user.role !== 'admin') throw new DataSourceError('FORBIDDEN', 'Лише адміністратор');
    const t = this.srv.clock.t;
    const lock = { userId: this.user.id, sessionId: this.sessionId, lockedAt: t, expiresAt: t + this.srv.ttl() };
    this.srv.locks.set(id, lock);
    return this.srv.lockInfo(lock, this.user, this.sessionId)!;
  }

  async getLockStatus(id: UUID): Promise<LockStatusResponse> {
    const r = this.srv.request(id);
    return { lock: this.srv.lockInfo(this.srv.activeLock(id), this.user, this.sessionId), version: r.version, status: r.state.header.status, updatedAt: r.updatedAt };
  }
}
