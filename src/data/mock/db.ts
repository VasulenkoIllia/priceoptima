// Структура in-memory БД прототипу (зберігається цілком під одним ключем IndexedDB).
import type {
  AppSettings,
  ClientDetail,
  CurrencyRateDto,
  ISODateTime,
  KpDocumentDto,
  Offer,
  OwnCompanyDto,
  PriceHistoryEntry,
  PriceImportMapping,
  PriceUpdateDto,
  ProductDetail,
  RequestDocument,
  RequestDocumentMeta,
  RequestEventDto,
  RequestTotalsSummary,
  SupplierDetail,
  UserDto,
  UUID,
} from '@shared/types';

export const DB_KEY = 'po-db-v1';
export const DB_CHANNEL = 'priceoptima-db';
/** Змінюється при зміні структури/сіду — стара БД у браузері пересіюється. v2: КП, історія заявок, журнал оновлень прайсів. */
export const DB_SCHEMA_VERSION = 2;

/** Товар без похідних полів (рахуються при читанні) + ключі пошуку. */
export type StoredProduct = Omit<ProductDetail, 'supplierName' | 'purchasePriceUah' | 'isStale'> & {
  /** normalizeSku(sku) */
  skuKey: string;
  /** buildSearchText(sku, назви, бренд) */
  searchText: string;
};

export type StoredSupplier = Omit<SupplierDetail, 'productsCount'> & { priceImportMapping?: PriceImportMapping | null };

/** Пропозиція без знімка каталогу (додається при читанні з поточного товару). */
export type StoredOffer = Omit<Offer, 'catalog'>;

export interface StoredRequest
  extends Pick<RequestDocument, 'id' | 'version' | 'header' | 'markup' | 'lines' | 'blocks'> {
  offers: StoredOffer[];
  meta: Omit<RequestDocumentMeta, 'readOnlyReason'>;
  /** Підсумки для реєстру (перераховуються при кожному збереженні). */
  totals: RequestTotalsSummary;
}

export interface MockDb {
  schemaVersion: number;
  /** Версія вмісту сіду (демо-дані/лічильники) — змінилась → пересіяти навіть при незмінному schemaVersion. */
  seedVersion: number;
  /** Відбиток сіду (версія + локальні оверрайди): змінився — пересіяти. */
  fingerprint: string;
  /** Номер ревізії в IndexedDB (для злиття змін з інших вкладок). */
  rev: number;
  seededAt: ISODateTime;
  settings: AppSettings;
  users: UserDto[];
  /** userId → hex SHA-256 пароля. Увійти можуть лише користувачі з паролем (у прототипі — адміністратор із сіду). */
  passwordHashes: Record<UUID, string>;
  ownCompanies: OwnCompanyDto[];
  clients: Record<UUID, ClientDetail>;
  /** За sortOrder. */
  suppliers: StoredSupplier[];
  products: Record<UUID, StoredProduct>;
  /** productId → записи від найстарішого. */
  priceHistory: Record<UUID, PriceHistoryEntry[]>;
  nextPriceHistoryId: number;
  /** Курси НБУ за датами (від найстарішої). */
  rates: CurrencyRateDto[];
  requests: Record<UUID, StoredRequest>;
  /** requestId → версії КП (від найстарішої). */
  kps: Record<UUID, KpDocumentDto[]>;
  /** requestId → події історії (від найстарішої). */
  events: Record<UUID, RequestEventDto[]>;
  nextEventId: number;
  /** Журнал оновлень прайсів (від найстарішого). */
  priceUpdates: PriceUpdateDto[];
}
