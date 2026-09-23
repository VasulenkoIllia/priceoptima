// Стор документа заявки (§7): Zustand + immer. Живий розрахунок — computeRequest(doc, ctx) з мемоізацією за посиланням на doc.
// Редагування лише з блокуванням цієї вкладки і в статусі «В роботі»; автозбереження дельтою через debounce.
import { produce, type Draft } from 'immer';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { RequestStatus } from '@shared/enums';
import { formatRequestNumber, toIsoDate } from '@shared/format';
import {
  catalogSnapshotOf,
  computeRequest,
  createOfferFromProduct,
  createRequestLine,
  createSupplierBlock,
  initialOfferQty,
  isCatalogChanged,
  offerMultiplicity,
  offerWithManualPrice,
  refreshOfferFromCatalog,
  type ProductForOffer,
} from '@shared/pricing';
import { EDITABLE_HEADER_KEYS } from '@shared/requests';
import { isEditableStatus } from '@shared/status';
import type {
  AppSettings,
  DocumentRefs,
  ISODateTime,
  LineMarkupOverride,
  LockInfo,
  MarkupSettings,
  Offer,
  PricingContext,
  ProductDetail,
  ProductInput,
  ProductPickDto,
  RatesPair,
  RequestComputed,
  RequestDocument,
  RequestHeaderEditable,
  RequestLine,
  SupplierListItem,
  SupplierRef,
  UUID,
} from '@shared/types';
import { ds as defaultDs } from '@/data';
import type { CallOptions, DataSource } from '@/data/DataSource';
import { DataSourceError, errorMessage, isDataSourceError } from '@/data/errors';
import { newId } from '@/lib/ids';
import { toSupplierRef } from '@/lib/supplierRef';
import { diffDocuments } from './requestDocDiff';
import { describeUnsavedChanges } from './unsavedChanges';

// ── типи ────────────────────────────────────────────────────────────
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface NewLineInput {
  clientName: string;
  clientUnit?: string | null;
  qty?: number;
  clientNote?: string | null;
}

/** Куди додати рядки: у кінець, замість усіх, після рядка (null — на початок), перед рядком. */
export type AddLinesMode = 'append' | 'replace' | { afterId: UUID | null } | { beforeId: UUID };

export type LinePatch = Partial<Pick<RequestLine, 'clientName' | 'clientUnit' | 'qty' | 'clientNote' | 'kpName'>>;

/** Товар для пропозиції з вікна вибору (потрібен постачальник, щоб знайти/створити блок). */
export type ProductForLine = ProductForOffer & { supplierId: UUID };

export type HeaderRefsPatch = Partial<Pick<DocumentRefs, 'client' | 'counterparty' | 'contact' | 'ownCompany' | 'manager'>>;

export type SetOfferBySkuResult =
  | { status: 'ok'; product: ProductPickDto }
  | { status: 'ambiguous'; candidates: ProductPickDto[] }
  | { status: 'not_found' }
  /** Порожній артикул або лише перегляд. */
  | { status: 'skipped' };

export interface PasteSkusResult {
  /** Скільки пропозицій заповнено. */
  applied: number;
  notFound: string[];
  /** Кілька товарів з таким артикулом у постачальника. */
  ambiguous: string[];
  /** Артикули, для яких не вистачило рядків. */
  skipped: number;
}

/** Артикул для конкретного рядка (вставка в показані рядки сітки). */
export interface SkuTarget {
  lineId: UUID;
  sku: string;
}

export interface LinePatchEntry {
  id: UUID;
  patch: LinePatch;
}

export interface AddProductsResult {
  offerIds: UUID[];
  createdBlockIds: UUID[];
  /** Скільки наявних пропозицій замінено. */
  replaced: number;
}

export interface ApprovalEntry {
  lineId: UUID;
  approved: boolean;
  /** null/undefined — к-сть рядка (або попередня погоджена). */
  qty?: number | null;
}

export interface LockLostInfo {
  /** Хто забрав (якщо відомо). */
  byUserShortName: string | null;
  at: ISODateTime;
  reason: 'forced' | 'lost';
}

/** Зміни, які не збереглися (редагування втрачено або заявку змінили деінде) — щоб внести їх ще раз. */
export interface LostChanges {
  at: ISODateTime;
  items: string[];
}

export interface RequestDocData {
  requestId: UUID | null;
  loadState: LoadState;
  loadError: string | null;
  doc: RequestDocument | null;
  /** Актуальна версія на сервері (doc.version — версія на момент завантаження). */
  version: number;
  ctx: PricingContext | null;
  settings: AppSettings | null;
  /** Усі постачальники (для «+ Постачальник» і створення блоків). */
  suppliers: SupplierListItem[];
  /** Поточний власник блокування (ця або інша вкладка). */
  lock: LockInfo | null;
  /** Ця вкладка тримає блокування. */
  hasLock: boolean;
  lockLost: LockLostInfo | null;
  lostChanges: LostChanges | null;
  readOnly: boolean;
  readOnlyReason: 'status' | 'lock' | null;
  save: { state: SaveState; savedAt: ISODateTime | null; error: string | null };
  /** Є незбережені зміни. */
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export interface RequestDocActions {
  load(id: UUID): Promise<void>;
  /** Закрити документ: зберегти, звільнити блокування (відкладено на такт — StrictMode/повторне відкриття тієї самої заявки). */
  unload(): Promise<void>;
  /** Перечитати документ з сервера (незбережені зміни відкидаються). */
  refresh(): Promise<void>;
  /** «Оновити» в LockBanner: перечитати й спробувати взяти блокування. */
  retryLock(): Promise<boolean>;
  /** «Забрати редагування» (адміністратор). */
  forceLock(): Promise<void>;
  /** Закрити вікно «Ці зміни не збереглися». */
  dismissLostChanges(): void;
  /** Зберегти незбережені зміни зараз; помилка — якщо зберегти не вдалося (зміни лишились незбереженими). */
  flush(): Promise<void>;

  setHeader(patch: Partial<RequestHeaderEditable>, refs?: HeaderRefsPatch): void;
  addLines(rows: NewLineInput[], mode?: AddLinesMode): UUID[];
  updateLine(id: UUID, patch: LinePatch): void;
  /** Кілька рядків одним кроком (вставка з буфера в колонки клієнта). */
  updateLines(patches: LinePatchEntry[]): void;
  removeLines(ids: UUID[]): void;
  moveLine(id: UUID, toIndex: number): void;

  addBlock(supplierId: UUID): UUID | null;
  removeBlock(blockId: UUID): void;
  moveBlock(blockId: UUID, toIndex: number): void;
  setBlockRates(blockId: UUID, rates: Partial<RatesPair>): void;
  setBlockSupplierMarkup(blockId: UUID, pct: number): void;

  setOfferFromProduct(lineId: UUID, blockId: UUID, product: ProductForOffer): UUID | null;
  setOfferBySku(lineId: UUID, blockId: UUID, sku: string): Promise<SetOfferBySkuResult>;
  pasteSkus(startLineId: UUID, blockId: UUID, skus: string[]): Promise<PasteSkusResult>;
  /** Масова вставка артикулів у задані рядки (порядок показу в сітці з урахуванням фільтра). */
  pasteSkusToLines(blockId: UUID, targets: SkuTarget[]): Promise<PasteSkusResult>;
  addProductsToLine(lineId: UUID, products: ProductForLine[]): AddProductsResult;
  clearOffer(offerId: UUID): void;
  setOfferQty(offerId: UUID, qty: number | null): void;
  /** Вимкнути / увімкнути округлення до кратності для цієї пропозиції (лише в цій заявці). */
  setOfferNoRounding(offerId: UUID, noRounding: boolean): void;
  setOfferNote(offerId: UUID, note: string | null): void;
  toggleExclude(offerId: UUID, reason?: string | null): void;
  selectOffer(lineId: UUID, blockId: UUID | null): void;
  /** Затвердити рекомендовані для рядків без ручного вибору. Повертає кількість змінених рядків. */
  acceptAllRecommendations(): number;
  /** Затвердити всі рядки, де цей блок має кандидата. */
  selectAllInBlock(blockId: UUID): number;
  /** Ціна змінилась у каталозі — оновити знімок з прайсу постачальника (вхідні ціни вручну не змінюються). */
  refreshOfferPrice(offerId: UUID): boolean;
  /**
   * Ручна ціна входу (РЕД-10): у цій заявці завжди, у каталозі — на вибір.
   * У каталозі ціну веде прайс, тож наступне завантаження прайсу її замінить.
   */
  setOfferPurchasePrice(offerId: UUID, purchasePriceCur: number | null, options?: { updateCatalog?: boolean }): Promise<boolean>;
  createProductAndOffer(lineId: UUID, blockId: UUID | null, input: ProductInput): Promise<ProductDetail>;

  setMarkupDefaults(patch: Partial<MarkupSettings>): void;
  setLineMarkup(lineId: UUID, patch: Partial<LineMarkupOverride>): void;
  /** «Як у заявці»: скинути власну націнку рядків (без аргументу — усіх). */
  resetLineMarkups(lineIds?: UUID[]): void;
  setApproval(lineId: UUID, approved: boolean, qty?: number | null): void;
  /** Погодження кількох рядків одним кроком (одна дія для undo). */
  setApprovals(entries: ApprovalEntry[]): void;
  setStatus(to: RequestStatus, reason?: string | null): Promise<void>;

  undo(): void;
  redo(): void;
  getComputed(): RequestComputed | null;
  findOffer(lineId: UUID, blockId: UUID): Offer | undefined;
}

export type RequestDocState = RequestDocData & RequestDocActions;
export type RequestDocStoreApi = StoreApi<RequestDocState>;

const UNDO_LIMIT = 100;

const INITIAL_DATA: RequestDocData = {
  requestId: null,
  loadState: 'idle',
  loadError: null,
  doc: null,
  version: 0,
  ctx: null,
  settings: null,
  suppliers: [],
  lock: null,
  hasLock: false,
  lockLost: null,
  lostChanges: null,
  readOnly: true,
  readOnlyReason: null,
  save: { state: 'idle', savedAt: null, error: null },
  dirty: false,
  canUndo: false,
  canRedo: false,
};

// ── похідні ─────────────────────────────────────────────────────────
const computedCache = new WeakMap<RequestDocument, { ctx: PricingContext; value: RequestComputed }>();

/** Живий розрахунок документа (мемоізація за посиланням на doc і ctx). */
export function selectComputed(s: Pick<RequestDocData, 'doc' | 'ctx'>): RequestComputed | null {
  if (!s.doc || !s.ctx) return null;
  const hit = computedCache.get(s.doc);
  if (hit && hit.ctx === s.ctx) return hit.value;
  const value = computeRequest(s.doc, s.ctx);
  computedCache.set(s.doc, { ctx: s.ctx, value });
  return value;
}

function readOnlyOf(doc: RequestDocument | null, hasLock: boolean): Pick<RequestDocData, 'readOnly' | 'readOnlyReason'> {
  if (!doc) return { readOnly: true, readOnlyReason: null };
  if (!isEditableStatus(doc.header.status)) return { readOnly: true, readOnlyReason: 'status' };
  if (!hasLock) return { readOnly: true, readOnlyReason: 'lock' };
  return { readOnly: false, readOnlyReason: null };
}

function ctxFor(doc: RequestDocument, prev: PricingContext | null): PricingContext {
  if (prev && prev.settings === doc.refs.pricing && prev.suppliers === doc.refs.suppliers) return prev;
  return { now: new Date(), settings: doc.refs.pricing, suppliers: doc.refs.suppliers };
}

function renumber<T extends { position: number }>(list: T[]): void {
  list.forEach((item, i) => {
    if (item.position !== i + 1) item.position = i + 1;
  });
}

function moveItem<T>(list: T[], from: number, to: number): void {
  const [item] = list.splice(from, 1);
  list.splice(Math.max(0, Math.min(to, list.length)), 0, item);
}

/** Перелік один на застосунок і сервер (shared/requests): інакше нове поле шапки мовчки не зберігалося б. */
const EDITABLE_HEADER_FIELDS = new Set<keyof RequestHeaderEditable>(EDITABLE_HEADER_KEYS);

// ── стор ────────────────────────────────────────────────────────────
export interface RequestDocStoreDeps {
  ds: DataSource;
  /** Слухати pagehide/pageshow/visibilitychange (за замовчуванням — у браузері). */
  bindPageLifecycle?: boolean;
  /** Як часто режим перегляду перевіряє, чи заявку змінили або звільнили (мс; 0 — не перевіряти). */
  watchIntervalMs?: number;
}

/** Режим перегляду: перевірка змін і блокування заявки. */
const WATCH_INTERVAL_MS = 5000;

export function createRequestDocStore(deps: RequestDocStoreDeps): RequestDocStoreApi {
  const { ds } = deps;

  return createStore<RequestDocState>()((set, get) => {
    // Стан поза React: остання збережена версія, історія undo, таймери.
    let lastSaved: RequestDocument | null = null;
    let past: RequestDocument[] = [];
    let future: RequestDocument[] = [];
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let watchTimer: ReturnType<typeof setInterval> | null = null;
    let saving: Promise<void> | null = null;
    let loadToken = 0;
    let pendingUnload: { timer: ReturnType<typeof setTimeout>; resolvers: (() => void)[] } | null = null;
    let unloading: Promise<void> | null = null;

    const autoRound = () => get().settings?.autoRoundMultiplicity ?? true;

    // ── збереження ────────────────────────────────────────────────
    function clearSaveTimer(): void {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
    }

    function scheduleSave(): void {
      const s = get();
      if (!s.hasLock || !s.requestId) return;
      clearSaveTimer();
      saveTimer = setTimeout(() => {
        saveTimer = null;
        void runSave();
      }, s.settings?.autosaveDebounceMs ?? 800);
    }

    async function runSave(options?: CallOptions): Promise<void> {
      while (saving) await saving;
      const s = get();
      if (!s.requestId || !s.doc || !s.hasLock || !lastSaved || !isEditableStatus(s.doc.header.status)) return;
      const changes = diffDocuments(lastSaved, s.doc);
      if (!changes) {
        if (s.dirty) set({ dirty: false });
        return;
      }
      const id = s.requestId;
      const sent = s.doc;
      set({ save: { ...s.save, state: 'saving', error: null } });
      const run = (async () => {
        try {
          const res = await ds.saveRequestDocument(id, { baseVersion: s.version, sessionId: ds.sessionId, ...changes }, options);
          if (get().requestId !== id) return;
          lastSaved = sent;
          set({ version: res.version, dirty: get().doc !== sent, save: { state: 'saved', savedAt: res.updatedAt, error: null } });
        } catch (e) {
          if (get().requestId === id) onSaveError(e);
        }
      })();
      saving = run;
      try {
        await run;
      } finally {
        if (saving === run) saving = null;
      }
      const after = get();
      if (after.dirty && after.hasLock && after.save.state === 'saved' && !saveTimer) scheduleSave();
    }

    /** Перед перечитуванням з сервера — запам'ятати, що саме не збереглося. */
    function captureLostChanges(): void {
      const { doc } = get();
      if (!doc || !lastSaved || doc === lastSaved) return;
      const items = describeUnsavedChanges(lastSaved, doc);
      if (items.length) set({ lostChanges: { at: new Date().toISOString(), items } });
    }

    function onSaveError(e: unknown): void {
      const prev = get().save;
      if (isDataSourceError(e, 'LOCK_LOST') || isDataSourceError(e, 'LOCKED')) {
        const holder = (e.details as { lock?: LockInfo | null } | undefined)?.lock ?? null;
        loseLock(holder && !holder.isMySession ? 'forced' : 'lost', holder?.userShortName ?? null);
        set({ save: { state: 'error', savedAt: prev.savedAt, error: `${e.message}` } });
        captureLostChanges();
        void refresh();
        return;
      }
      set({ save: { state: 'error', savedAt: prev.savedAt, error: errorMessage(e) } });
      if (isDataSourceError(e, 'VERSION_CONFLICT') || isDataSourceError(e, 'READ_ONLY')) {
        captureLostChanges();
        void refresh();
      }
    }

    // ── блокування ────────────────────────────────────────────────
    function stopHeartbeat(): void {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    }

    function startHeartbeat(): void {
      stopHeartbeat();
      const secs = get().settings?.lockHeartbeatSeconds ?? 10;
      heartbeatTimer = setInterval(() => void beat(), secs * 1000);
    }

    async function beat(): Promise<void> {
      const { requestId, hasLock } = get();
      if (!requestId || !hasLock) return;
      try {
        const lock = await ds.heartbeat(requestId);
        if (get().requestId === requestId) set({ lock });
      } catch (e) {
        if (isDataSourceError(e, 'LOCK_LOST') && get().requestId === requestId && get().hasLock) {
          // блокування тримає інший — його забрав адміністратор; нікого — вийшов строк (сон комп'ютера, зв'язок)
          const holder = (e.details as { lock?: LockInfo | null } | undefined)?.lock ?? null;
          loseLock(holder ? 'forced' : 'lost', holder?.userShortName ?? null);
          set({ lock: holder });
          captureLostChanges();
          void refresh();
        }
      }
    }

    // Режим перегляду: хтось зберіг зміни, змінив статус чи звільнив заявку — показуємо свіже.
    function stopWatch(): void {
      if (watchTimer) {
        clearInterval(watchTimer);
        watchTimer = null;
      }
    }

    function startWatch(): void {
      stopWatch();
      const ms = deps.watchIntervalMs ?? WATCH_INTERVAL_MS;
      if (ms > 0) watchTimer = setInterval(() => void watch(), ms);
    }

    async function watch(): Promise<void> {
      const s = get();
      if (!s.requestId || s.loadState !== 'ready' || s.hasLock || !s.doc) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const id = s.requestId;
      try {
        const st = await ds.getLockStatus(id);
        const cur = get();
        if (cur.requestId !== id || cur.hasLock || !cur.doc) return;
        if (JSON.stringify(st.lock) !== JSON.stringify(cur.lock)) set({ lock: st.lock });
        if (st.version !== cur.version || st.status !== cur.doc.header.status || st.updatedAt !== cur.doc.meta.updatedAt) await refresh();
      } catch {
        // мережа чи сервер — перевіримо наступного разу
      }
    }

    function loseLock(reason: LockLostInfo['reason'], by: string | null): void {
      stopHeartbeat();
      clearSaveTimer();
      set({
        hasLock: false,
        lockLost: { byUserShortName: by, at: new Date().toISOString(), reason },
        ...readOnlyOf(get().doc, false),
      });
    }

    // ── життєвий цикл ─────────────────────────────────────────────
    async function refresh(): Promise<void> {
      const id = get().requestId;
      if (!id) return;
      const token = loadToken;
      try {
        const doc = await ds.getRequestDocument(id);
        if (token !== loadToken || get().requestId !== id) return;
        lastSaved = doc;
        past = [];
        future = [];
        clearSaveTimer();
        const hasLock = get().hasLock && (doc.lock?.isMySession ?? false);
        set({
          doc,
          version: doc.version,
          ctx: ctxFor(doc, null),
          lock: doc.lock,
          hasLock,
          dirty: false,
          canUndo: false,
          canRedo: false,
          ...readOnlyOf(doc, hasLock),
        });
      } catch {
        // лишаємо поточні дані; помилку покаже наступна дія
      }
    }

    async function load(id: UUID): Promise<void> {
      if (pendingUnload) {
        const p = pendingUnload;
        pendingUnload = null;
        clearTimeout(p.timer);
        if (get().requestId !== id) await doUnload();
        p.resolvers.forEach((r) => r());
      }
      const cur = get();
      if (cur.requestId === id && (cur.loadState === 'loading' || cur.loadState === 'ready')) return;
      if (cur.requestId && cur.requestId !== id) await doUnload();

      const token = ++loadToken;
      lastSaved = null;
      past = [];
      future = [];
      set({ ...INITIAL_DATA, requestId: id, loadState: 'loading' });
      try {
        const [lockRes, settings, suppliers] = await Promise.all([ds.acquireLock(id), ds.getSettings(), ds.listSuppliers()]);
        const doc = token === loadToken ? await ds.getRequestDocument(id) : null;
        if (!doc || token !== loadToken) {
          if (lockRes.acquired) void ds.releaseLock(id);
          return;
        }
        lastSaved = doc;
        const hasLock = lockRes.acquired;
        set({
          loadState: 'ready',
          doc,
          version: doc.version,
          ctx: ctxFor(doc, null),
          settings,
          suppliers,
          lock: lockRes.lock,
          hasLock,
          ...readOnlyOf(doc, hasLock),
        });
        if (hasLock) startHeartbeat();
        startWatch();
      } catch (e) {
        if (token === loadToken) set({ loadState: 'error', loadError: errorMessage(e) });
      }
    }

    function doUnload(): Promise<void> {
      if (unloading) return unloading;
      const s = get();
      const id = s.requestId;
      if (!id) return Promise.resolve();
      const run = (async () => {
        loadToken++;
        stopHeartbeat();
        stopWatch();
        clearSaveTimer();
        if (s.hasLock) {
          await runSave().catch(() => undefined);
          await ds.releaseLock(id).catch(() => undefined);
        }
        if (get().requestId === id) {
          lastSaved = null;
          past = [];
          future = [];
          set({ ...INITIAL_DATA });
        }
      })();
      unloading = run;
      return run.finally(() => {
        unloading = null;
      });
    }

    function unload(): Promise<void> {
      if (!get().requestId) return Promise.resolve();
      return new Promise<void>((resolve) => {
        if (pendingUnload) {
          pendingUnload.resolvers.push(resolve);
          return;
        }
        const timer = setTimeout(() => {
          const p = pendingUnload;
          pendingUnload = null;
          void doUnload().finally(() => p?.resolvers.forEach((r) => r()));
        }, 0);
        pendingUnload = { timer, resolvers: [resolve] };
      });
    }

    async function retryLock(): Promise<boolean> {
      const id = get().requestId;
      if (!id) return false;
      const res = await ds.acquireLock(id);
      if (get().requestId !== id) return false;
      set({ lock: res.lock, hasLock: res.acquired, ...(res.acquired ? { lockLost: null } : {}), ...readOnlyOf(get().doc, res.acquired) });
      await refresh();
      if (res.acquired && get().hasLock) startHeartbeat();
      return get().hasLock;
    }

    async function forceLock(): Promise<void> {
      const id = get().requestId;
      if (!id) return;
      const lock = await ds.forceLock(id);
      if (get().requestId !== id) return;
      set({ lock, hasLock: true, lockLost: null, ...readOnlyOf(get().doc, true) });
      await refresh();
      startHeartbeat();
    }

    async function flush(): Promise<void> {
      clearSaveTimer();
      await runSave();
      // КП, копія й зміна статусу будуються зі збереженої заявки — невдале збереження не можна мовчки пропустити
      const s = get();
      if (s.dirty && s.save.state === 'error') {
        throw new DataSourceError('INVALID_STATE', s.save.error ?? 'Не вдалося зберегти зміни заявки');
      }
    }

    // Закриття вкладки: незбережена дельта й звільнення заявки — одним запитом з keepalive
    // (другий запит після закриття сторінки може вже не піти).
    function onPageHide(): void {
      const s = get();
      if (!s.requestId || !s.hasLock) return;
      const id = s.requestId;
      clearSaveTimer();
      stopHeartbeat();
      const changes = lastSaved && s.doc && isEditableStatus(s.doc.header.status) ? diffDocuments(lastSaved, s.doc) : null;
      if (changes) {
        const sent = s.doc;
        ds.saveRequestDocument(id, { baseVersion: s.version, sessionId: ds.sessionId, ...changes, release: true }, { keepalive: true })
          .then((res) => {
            lastSaved = sent;
            set({ version: res.version, dirty: false });
          })
          .catch(() => undefined);
      } else {
        void ds.releaseLock(id, { keepalive: true }).catch(() => undefined);
      }
      set({ hasLock: false, ...readOnlyOf(s.doc, false) });
    }

    // Незбережені зміни (автозбереження ще не встигло) — браузер перепитає, чи закривати вкладку.
    function onBeforeUnload(e: BeforeUnloadEvent): void {
      const s = get();
      if (s.hasLock && (s.dirty || saving)) {
        e.preventDefault();
        e.returnValue = '';
      }
    }

    const bind = deps.bindPageLifecycle ?? typeof window !== 'undefined';
    if (bind && typeof window !== 'undefined') {
      window.addEventListener('pagehide', onPageHide);
      window.addEventListener('beforeunload', onBeforeUnload);
      window.addEventListener('pageshow', (e) => {
        if (e.persisted && get().requestId) void retryLock();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void beat();
      });
    }

    // ── редагування ───────────────────────────────────────────────
    function commit(next: RequestDocument): void {
      const s = get();
      const prev = s.doc;
      if (!prev || next === prev) return;
      past.push(prev);
      if (past.length > UNDO_LIMIT) past.shift();
      future = [];
      set({ doc: next, ctx: ctxFor(next, s.ctx), dirty: true, canUndo: true, canRedo: false });
      scheduleSave();
    }

    /** Змінити документ (лише в режимі редагування). true — зміна відбулась. */
    function edit(recipe: (d: Draft<RequestDocument>) => void): boolean {
      const s = get();
      if (!s.doc || s.readOnly) return false;
      const next = produce(s.doc, recipe);
      if (next === s.doc) return false;
      commit(next);
      return true;
    }

    function supplierRefFor(supplierId: UUID): SupplierRef | null {
      const s = get();
      const src = s.suppliers.find((x) => x.id === supplierId) ?? s.doc?.refs.suppliers[supplierId];
      return src ? toSupplierRef(src) : null;
    }

    function ensureBlockDraft(d: Draft<RequestDocument>, supplierId: UUID): { blockId: UUID; created: boolean } | null {
      const existing = d.blocks.find((b) => b.supplierId === supplierId);
      if (existing) return { blockId: existing.id, created: false };
      const ref = supplierRefFor(supplierId);
      if (!ref) return null;
      const block = createSupplierBlock(
        ref,
        d.header.rates,
        { id: newId(), position: d.blocks.length + 1 },
        { maxAgeDays: get().ctx?.settings.priceListRateMaxAgeDays },
      );
      d.blocks.push(block);
      d.refs.suppliers[ref.id] = ref;
      return { blockId: block.id, created: true };
    }

    function upsertOfferDraft(
      d: Draft<RequestDocument>,
      lineId: UUID,
      blockId: UUID,
      product: ProductForOffer,
    ): { offerId: UUID; replaced: boolean } | null {
      const line = d.lines.find((l) => l.id === lineId);
      const block = d.blocks.find((b) => b.id === blockId);
      if (!line || !block) return null;
      const idx = d.offers.findIndex((o) => o.lineId === lineId && o.blockId === blockId);
      const prev = idx >= 0 ? d.offers[idx] : null;
      const offer = createOfferFromProduct(product, {
        id: prev?.id ?? newId(),
        lineId,
        blockId,
        lineQty: line.qty,
        autoRoundMultiplicity: autoRound(),
        note: prev?.note ?? null,
      });
      if (idx >= 0) d.offers[idx] = offer;
      else d.offers.push(offer);
      return { offerId: offer.id, replaced: idx >= 0 };
    }

    function editOffer(offerId: UUID, fn: (o: Draft<Offer>, d: Draft<RequestDocument>) => void): void {
      edit((d) => {
        const o = d.offers.find((x) => x.id === offerId);
        if (o) fn(o, d);
      });
    }

    function applyLinePatchDraft(d: Draft<RequestDocument>, id: UUID, patch: LinePatch): void {
      const line = d.lines.find((l) => l.id === id);
      if (!line) return;
      const oldQty = line.qty;
      if (patch.clientName !== undefined) line.clientName = patch.clientName;
      if (patch.clientUnit !== undefined) line.clientUnit = patch.clientUnit;
      if (patch.clientNote !== undefined) line.clientNote = patch.clientNote;
      if (patch.kpName !== undefined) line.kpName = patch.kpName;
      if (patch.qty !== undefined && Number.isFinite(patch.qty) && patch.qty >= 0) line.qty = patch.qty;
      if (line.qty !== oldQty) {
        // к-сть пропозицій, що йшла за рядком (або була автоокруглена), перераховується; ручна — лишається
        for (const o of d.offers) {
          if (o.lineId !== id) continue;
          if (o.qty === null || o.qty === initialOfferQty(oldQty, offerMultiplicity(o), autoRound())) {
            o.qty = initialOfferQty(line.qty, offerMultiplicity(o), autoRound());
          }
        }
      }
    }

    /** Lookup артикулів у постачальника блоку і заповнення пропозицій одним кроком. */
    async function applySkuTargets(blockId: UUID, targets: SkuTarget[], skipped: number): Promise<PasteSkusResult> {
      const s = get();
      const none: PasteSkusResult = { applied: 0, notFound: [], ambiguous: [], skipped: skipped + targets.length };
      const block = s.doc?.blocks.find((b) => b.id === blockId);
      if (!s.doc || s.readOnly || !block) return none;
      const clean = targets.map((t) => ({ lineId: t.lineId, sku: t.sku.trim() })).filter((t) => t.sku);
      const unique = [...new Set(clean.map((t) => t.sku))];
      if (!unique.length) return { ...none, skipped };
      const id = s.requestId;
      const res = await ds.lookupSkus({ supplierId: block.supplierId, skus: unique });
      if (get().requestId !== id) return none;
      const notFound = new Set<string>();
      const ambiguous = new Set<string>();
      let applied = 0;
      edit((d) => {
        for (const t of clean) {
          const exact = (res.results[t.sku] ?? []).filter((p) => p.matchKind === 'sku_exact');
          if (exact.length === 1) {
            if (upsertOfferDraft(d, t.lineId, blockId, exact[0])) applied++;
          } else if (exact.length > 1) {
            ambiguous.add(t.sku);
          } else {
            notFound.add(t.sku);
          }
        }
      });
      return { applied, notFound: [...notFound], ambiguous: [...ambiguous], skipped };
    }

    function removeOffersDraft(d: Draft<RequestDocument>, pred: (o: Draft<Offer>) => boolean): void {
      const removed = d.offers.filter(pred);
      if (!removed.length) return;
      d.offers = d.offers.filter((o) => !pred(o));
      for (const o of removed) {
        const line = d.lines.find((l) => l.id === o.lineId);
        if (line && line.selection.blockId === o.blockId) line.selection = { blockId: null };
      }
    }

    return {
      ...INITIAL_DATA,
      load,
      unload,
      refresh,
      retryLock,
      forceLock,
      flush,
      dismissLostChanges: () => set({ lostChanges: null }),

      setHeader(patch, refs) {
        edit((d) => {
          const header = d.header as unknown as Record<string, unknown>;
          for (const [k, v] of Object.entries(patch)) {
            if (EDITABLE_HEADER_FIELDS.has(k as keyof RequestHeaderEditable) && v !== undefined) header[k] = v;
          }
          if (refs) Object.assign(d.refs, refs);
        });
      },

      addLines(rows, mode = 'append') {
        if (!rows.length) return [];
        const ids = rows.map(() => newId());
        const ok = edit((d) => {
          const created = rows.map((r, i) =>
            createRequestLine({
              id: ids[i],
              position: 0,
              clientName: r.clientName ?? '',
              // одиницю не задали (ручний рядок або файл без колонки) — лишаємо «шт» з createRequestLine
              ...(r.clientUnit ? { clientUnit: r.clientUnit } : {}),
              qty: r.qty != null && Number.isFinite(r.qty) && r.qty >= 0 ? r.qty : 0,
              clientNote: r.clientNote ?? null,
            }),
          );
          if (mode === 'replace') {
            d.lines = created;
            d.offers = [];
          } else if (mode === 'append') {
            d.lines.push(...created);
          } else if ('afterId' in mode) {
            const at = mode.afterId === null ? 0 : d.lines.findIndex((l) => l.id === mode.afterId) + 1;
            d.lines.splice(at > 0 || mode.afterId === null ? at : d.lines.length, 0, ...created);
          } else {
            const at = d.lines.findIndex((l) => l.id === mode.beforeId);
            d.lines.splice(at >= 0 ? at : d.lines.length, 0, ...created);
          }
          renumber(d.lines);
        });
        return ok ? ids : [];
      },

      updateLine(id, patch) {
        edit((d) => applyLinePatchDraft(d, id, patch));
      },

      updateLines(patches) {
        if (!patches.length) return;
        edit((d) => {
          for (const p of patches) applyLinePatchDraft(d, p.id, p.patch);
        });
      },

      removeLines(ids) {
        const set_ = new Set(ids);
        edit((d) => {
          if (!d.lines.some((l) => set_.has(l.id))) return;
          d.lines = d.lines.filter((l) => !set_.has(l.id));
          d.offers = d.offers.filter((o) => !set_.has(o.lineId));
          renumber(d.lines);
        });
      },

      moveLine(id, toIndex) {
        edit((d) => {
          const from = d.lines.findIndex((l) => l.id === id);
          if (from < 0 || from === toIndex) return;
          moveItem(d.lines, from, toIndex);
          renumber(d.lines);
        });
      },

      addBlock(supplierId) {
        let blockId: UUID | null = null;
        edit((d) => {
          blockId = ensureBlockDraft(d, supplierId)?.blockId ?? null;
        });
        return blockId;
      },

      removeBlock(blockId) {
        edit((d) => {
          if (!d.blocks.some((b) => b.id === blockId)) return;
          d.blocks = d.blocks.filter((b) => b.id !== blockId);
          removeOffersDraft(d, (o) => o.blockId === blockId);
          for (const l of d.lines) if (l.selection.blockId === blockId) l.selection = { blockId: null };
          renumber(d.blocks);
        });
      },

      moveBlock(blockId, toIndex) {
        edit((d) => {
          const from = d.blocks.findIndex((b) => b.id === blockId);
          if (from < 0 || from === toIndex) return;
          moveItem(d.blocks, from, toIndex);
          renumber(d.blocks);
        });
      },

      setBlockRates(blockId, rates) {
        edit((d) => {
          const b = d.blocks.find((x) => x.id === blockId);
          if (!b) return;
          if (rates.USD !== undefined) b.rates.USD = rates.USD;
          if (rates.EUR !== undefined) b.rates.EUR = rates.EUR;
          b.rateSource = 'manual';
          b.ratesDate = toIsoDate(new Date());
        });
      },

      setBlockSupplierMarkup(blockId, pct) {
        if (!Number.isFinite(pct)) return;
        edit((d) => {
          const b = d.blocks.find((x) => x.id === blockId);
          if (b) b.supplierMarkupPct = pct;
        });
      },

      setOfferFromProduct(lineId, blockId, product) {
        let offerId: UUID | null = null;
        edit((d) => {
          offerId = upsertOfferDraft(d, lineId, blockId, product)?.offerId ?? null;
        });
        return offerId;
      },

      async setOfferBySku(lineId, blockId, sku) {
        const s = get();
        const trimmed = sku.trim();
        const block = s.doc?.blocks.find((b) => b.id === blockId);
        if (!s.doc || s.readOnly || !trimmed || !block) return { status: 'skipped' };
        const id = s.requestId;
        const res = await ds.lookupSkus({ supplierId: block.supplierId, skus: [trimmed] });
        if (get().requestId !== id) return { status: 'skipped' };
        const list = res.results[trimmed] ?? [];
        const exact = list.filter((p) => p.matchKind === 'sku_exact');
        if (exact.length === 1) {
          get().setOfferFromProduct(lineId, blockId, exact[0]);
          return { status: 'ok', product: exact[0] };
        }
        if (exact.length > 1 || list.length > 0) return { status: 'ambiguous', candidates: exact.length ? exact : list };
        return { status: 'not_found' };
      },

      async pasteSkus(startLineId, blockId, skus) {
        const s = get();
        const none: PasteSkusResult = { applied: 0, notFound: [], ambiguous: [], skipped: skus.length };
        if (!s.doc || s.readOnly || !s.doc.blocks.some((b) => b.id === blockId)) return none;
        const start = s.doc.lines.findIndex((l) => l.id === startLineId);
        if (start < 0) return none;
        const targets: SkuTarget[] = [];
        let skipped = 0;
        skus.forEach((raw, i) => {
          const line = s.doc!.lines[start + i];
          if (!line) {
            skipped++;
            return;
          }
          targets.push({ sku: raw, lineId: line.id });
        });
        return applySkuTargets(blockId, targets, skipped);
      },

      pasteSkusToLines(blockId, targets) {
        return applySkuTargets(blockId, targets, 0);
      },

      addProductsToLine(lineId, products) {
        const result: AddProductsResult = { offerIds: [], createdBlockIds: [], replaced: 0 };
        edit((d) => {
          for (const p of products) {
            const b = ensureBlockDraft(d, p.supplierId);
            if (!b) continue;
            if (b.created) result.createdBlockIds.push(b.blockId);
            const r = upsertOfferDraft(d, lineId, b.blockId, p);
            if (!r) continue;
            result.offerIds.push(r.offerId);
            if (r.replaced) result.replaced++;
          }
        });
        return result;
      },

      clearOffer(offerId) {
        edit((d) => removeOffersDraft(d, (o) => o.id === offerId));
      },

      setOfferQty(offerId, qty) {
        if (qty !== null && !(Number.isFinite(qty) && qty >= 0)) return;
        editOffer(offerId, (o) => {
          o.qty = qty;
        });
      },

      setOfferNoRounding(offerId, noRounding) {
        const s = get();
        const offer = s.doc?.offers.find((x) => x.id === offerId);
        const line = offer ? s.doc?.lines.find((l) => l.id === offer.lineId) : undefined;
        if (!offer || !line) return;
        editOffer(offerId, (o) => {
          if (noRounding) {
            o.noRounding = true;
            // к-сть як у клієнта, без округлення
            o.qty = null;
          } else {
            delete o.noRounding;
            o.qty = initialOfferQty(line.qty, o.multiplicity, autoRound());
          }
        });
      },

      setOfferNote(offerId, note) {
        editOffer(offerId, (o) => {
          o.note = note?.trim() ? note : null;
        });
      },

      toggleExclude(offerId, reason) {
        editOffer(offerId, (o, d) => {
          o.excluded = !o.excluded;
          o.excludeReason = o.excluded ? (reason?.trim() || null) : null;
          // виключена пропозиція не може бути затвердженою
          const line = d.lines.find((l) => l.id === o.lineId);
          if (o.excluded && line?.selection.blockId === o.blockId) line.selection = { blockId: null };
        });
      },

      selectOffer(lineId, blockId) {
        edit((d) => {
          const line = d.lines.find((l) => l.id === lineId);
          if (!line) return;
          if (blockId) {
            const offer = d.offers.find((o) => o.lineId === lineId && o.blockId === blockId);
            if (!offer || offer.excluded) return;
          }
          if (line.selection.blockId !== blockId) line.selection = { blockId };
        });
      },

      acceptAllRecommendations() {
        const comp = selectComputed(get());
        if (!comp) return 0;
        let n = 0;
        edit((d) => {
          for (const line of d.lines) {
            const c = comp.lines[line.id];
            if (!c?.isActive || !c.recommendedBlockId) continue;
            if (c.selectionState !== 'recommended' && c.selectionState !== 'manual_invalid') continue;
            if (line.selection.blockId === c.recommendedBlockId) continue;
            line.selection = { blockId: c.recommendedBlockId };
            n++;
          }
        });
        return n;
      },

      selectAllInBlock(blockId) {
        const comp = selectComputed(get());
        if (!comp) return 0;
        let n = 0;
        edit((d) => {
          for (const line of d.lines) {
            const offerId = comp.offerIndex[line.id]?.[blockId];
            if (!offerId || !comp.offers[offerId]?.isCandidate || line.selection.blockId === blockId) continue;
            line.selection = { blockId };
            n++;
          }
        });
        return n;
      },

      refreshOfferPrice(offerId) {
        const s = get();
        const offer = s.doc?.offers.find((o) => o.id === offerId);
        if (!s.doc || s.readOnly || !offer?.catalog || !isCatalogChanged(offer)) return false;
        const rate = selectComputed(s)?.offers[offerId]?.rate ?? null;
        const markup = s.doc.blocks.find((b) => b.id === offer.blockId)?.supplierMarkupPct ?? 0;
        const next = refreshOfferFromCatalog(offer, offer.catalog, rate, new Date(), 'catalog_refresh', markup);
        editOffer(offerId, (o) => {
          Object.assign(o, next);
        });
        return true;
      },

      async setOfferPurchasePrice(offerId, purchasePriceCur, options) {
        const s = get();
        const offer = s.doc?.offers.find((o) => o.id === offerId);
        if (!s.doc || s.readOnly || !offer) return false;
        const rate = selectComputed(s)?.offers[offerId]?.rate ?? null;
        const supplierMarkupPct = s.doc.blocks.find((b) => b.id === offer.blockId)?.supplierMarkupPct ?? 0;
        editOffer(offerId, (o) => {
          Object.assign(o, offerWithManualPrice(o, purchasePriceCur, rate, new Date(), supplierMarkupPct));
        });
        if (!options?.updateCatalog || !offer.productId) return true;
        // лише вхідна ціна: РРЦ і валюту в каталозі веде прайс, зі знімка заявки їх не переписуємо
        const { product } = await ds.updateProductPrice(offer.productId, {
          currency: offer.currency,
          purchasePrice: purchasePriceCur,
          purchaseOnly: true,
          source: 'manual',
          note: `Змінено з заявки № ${formatRequestNumber(s.doc.header.number)}`,
        });
        // знімок каталогу оновлюємо, щоб не світилось «ціна в каталозі змінилась»
        editOffer(offerId, (o) => {
          o.catalog = catalogSnapshotOf(product);
          o.priceDate = product.priceUpdatedAt;
        });
        return true;
      },

      async createProductAndOffer(lineId, blockId, input) {
        const s = get();
        if (!s.doc || s.readOnly) throw new DataSourceError('READ_ONLY', 'Заявка відкрита лише для перегляду');
        const id = s.requestId;
        const product = await ds.createProduct(input);
        if (get().requestId !== id) return product;
        edit((d) => {
          const target = blockId ? { blockId } : ensureBlockDraft(d, product.supplierId);
          if (target) upsertOfferDraft(d, lineId, target.blockId, product);
        });
        return product;
      },

      setMarkupDefaults(patch) {
        edit((d) => {
          Object.assign(d.markup, patch);
        });
      },

      setLineMarkup(lineId, patch) {
        edit((d) => {
          const line = d.lines.find((l) => l.id === lineId);
          if (line) Object.assign(line.markup, patch);
        });
      },

      resetLineMarkups(lineIds) {
        const ids = lineIds ? new Set(lineIds) : null;
        edit((d) => {
          for (const line of d.lines) {
            if (ids && !ids.has(line.id)) continue;
            const m = line.markup;
            if (m.method == null && m.value == null && m.manualPriceNet == null && m.manualPriceGross == null) continue;
            line.markup = { method: null, value: null, manualPriceNet: null, manualPriceGross: null };
          }
        });
      },

      setApproval(lineId, approved, qty) {
        edit((d) => {
          const line = d.lines.find((l) => l.id === lineId);
          if (!line) return;
          line.approval = { approved, approvedQty: approved ? (qty ?? line.approval.approvedQty ?? line.qty) : null };
        });
      },

      setApprovals(entries) {
        if (!entries.length) return;
        edit((d) => {
          for (const e of entries) {
            const line = d.lines.find((l) => l.id === e.lineId);
            if (!line) continue;
            const approvedQty = e.approved ? (e.qty ?? line.approval.approvedQty ?? line.qty) : null;
            if (line.approval.approved !== e.approved || line.approval.approvedQty !== approvedQty) {
              line.approval = { approved: e.approved, approvedQty };
            }
          }
        });
      },

      async setStatus(to, reason) {
        const s = get();
        if (!s.requestId || !s.doc) return;
        if (!s.hasLock) throw new DataSourceError('LOCK_REQUIRED', 'Заявку редагує інший користувач — змінити статус неможливо');
        await flush();
        const id = s.requestId;
        const res = await ds.changeStatus(id, { to, reason: reason ?? null, baseVersion: get().version, sessionId: ds.sessionId });
        const cur = get();
        if (cur.requestId !== id || !cur.doc) return;
        const doc = produce(cur.doc, (d) => {
          d.header.status = res.status;
          d.header.cancelReason = res.status === 'cancelled' ? (reason ?? '').trim() || null : null;
        });
        past = [];
        future = [];
        set({ doc, version: res.version, canUndo: false, canRedo: false, ...readOnlyOf(doc, cur.hasLock) });
      },

      undo() {
        const s = get();
        if (!s.doc || s.readOnly || !past.length) return;
        const prev = past.pop()!;
        future.push(s.doc);
        set({ doc: prev, ctx: ctxFor(prev, s.ctx), dirty: true, canUndo: past.length > 0, canRedo: true });
        scheduleSave();
      },

      redo() {
        const s = get();
        if (!s.doc || s.readOnly || !future.length) return;
        const next = future.pop()!;
        past.push(s.doc);
        set({ doc: next, ctx: ctxFor(next, s.ctx), dirty: true, canUndo: true, canRedo: future.length > 0 });
        scheduleSave();
      },

      getComputed() {
        return selectComputed(get());
      },

      findOffer(lineId, blockId) {
        return get().doc?.offers.find((o) => o.lineId === lineId && o.blockId === blockId);
      },
    };
  });
}

// ── екземпляр застосунку і хуки ─────────────────────────────────────
let appStore: RequestDocStoreApi | null = null;

// Два екземпляри стору в одній вкладці ділили б блокування (той самий sessionId) — при зміні модуля в dev повне перезавантаження.
import.meta.hot?.accept(() => window.location.reload());

export function getRequestDocStore(): RequestDocStoreApi {
  return (appStore ??= createRequestDocStore({ ds: defaultDs }));
}

export function useRequestDoc<T>(selector: (s: RequestDocState) => T): T {
  return useStore(getRequestDocStore(), selector);
}

export function useRequestComputed(): RequestComputed | null {
  return useStore(getRequestDocStore(), selectComputed);
}
