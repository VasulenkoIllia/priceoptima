// Сід демо-БД: генератор shared/demo/catalog → DTO + вигадані клієнти/користувачі/юрособи; поверх — локальні оверрайди (за наявності).
import {
  DEFAULT_SEED,
  generateCatalog,
  type DemoCatalog,
  type DemoMarkupMethod,
  type DemoRequest,
  type DemoRequestStatus,
  type GenerateOptions,
  type SupplierKey,
} from '@shared/demo/catalog';
import { formatRequestNumber, toIsoDate } from '@shared/format';
import { buildSearchText, normalizeSku } from '@shared/parse';
import {
  DEFAULT_APP_SETTINGS,
  computeRequest,
  createOfferFromProduct,
  createRequestLine,
  createSupplierBlock,
  defaultKpSettings,
  pricingSettingsFrom,
} from '@shared/pricing';
import type { AvailabilityStatus, CurrencyCode, MarkupMethod, RequestStatus } from '@shared/enums';
import type {
  AppSettings,
  ClientDetail,
  ContactDto,
  CounterpartyDto,
  HeaderRates,
  ISODate,
  ISODateTime,
  Offer,
  OwnCompanyDto,
  PriceHistoryEntry,
  PriceUpdateDto,
  PricingContext,
  RequestHeader,
  RequestLine,
  SupplierRef,
  UserDto,
  UserRef,
  UUID,
} from '@shared/types';
import { toSupplierRef } from '@/lib/supplierRef';
import { BRAND_COLOR } from '@/theme';
import { DEMO_AUTH, type SeedAuth } from './auth';
import { DB_SCHEMA_VERSION, type MockDb, type StoredOffer, type StoredProduct, type StoredRequest, type StoredSupplier } from './db';
import { addEvent, statusEventSummary } from './events';
import { kpEventSummary, makeKpDocument } from './kp';
import { makeLogoDataUrl } from './logos';
import type { OverrideContact, OverrideCounterparty, OverrideOwnCompany, SeedOverrides } from './overrides';
import { effectiveRatesOn, generateNbuRates } from './rates';
import { approvedSaleGrossOf } from './totals';

/**
 * v2: TTL/heartbeat блокувань 180/20 с, 000004 зі знімком арт. 123, погоджена сума від КП-основи.
 * v3: збережені демо-КП (№ 2110–2113, перше нове — 2114), історія заявок, журнал оновлень прайсів.
 * v4: кілька товарів, доданих вручну (ціну змінюють вручну; прайс їх не оновлює).
 * v5: версії КП зберігають налаштування («Сформувати на основі цієї»).
 * v6: вхід одним обліковим записом (хеш пароля); кратність у демо — лише труби ППР (4 м).
 */
export const SEED_VERSION = 6;
/** Демо-КП наявних заявок — № 2110–2113, тож перше нове КП (заявки 000001) отримає № 2114 (ТЗ §6, AC-КП-1). */
const FIRST_DEMO_KP_NUMBER = 2110;
const DAY_MS = 86_400_000;
const HISTORY_DAYS = 60;

export const DEMO_USER_IDS = { koval: 'usr-koval', bondar: 'usr-bondar', admin: 'usr-admin' } as const;
export const OWN_COMPANY_IDS = { main: 'own-main', fop: 'own-fop' } as const;
export const supplierIdOf = (key: SupplierKey): UUID => `sup-${key}`;
export const clientIdOf = (key: string): UUID => `cli-${key}`;
export const requestIdOf = (n: number): UUID => `req-${formatRequestNumber(n)}`;

export interface SeedInput {
  now: Date;
  overrides: SeedOverrides | null;
  /** Ім'я файлу логотипа → URL. */
  logos: Record<string, string>;
  fingerprint: string;
  /** Обліковий запис для входу (адміністратор); за замовчуванням — демо admin / admin. */
  auth?: SeedAuth;
}

export function buildSeedDb(input: SeedInput): MockDb {
  const { now, overrides, logos } = input;
  const t = timeHelpers(now);
  // Фонові вкладки: TTL/heartbeat довші за дефолтні (30/10 с), щоб пережити гальмування таймерів Chrome у прихованій вкладці (до 1 разу/хв).
  const settings: AppSettings = { ...DEFAULT_APP_SETTINGS, lockTtlSeconds: 180, lockHeartbeatSeconds: 20 };
  const catalog = demoCatalog(overrides);

  const auth = input.auth ?? DEMO_AUTH;
  const users = seedUsers(t.iso(HISTORY_DAYS), auth.login);
  const ownCompanies = seedOwnCompanies(overrides?.ownCompany, logos);
  const suppliers = seedSuppliers(catalog, overrides, logos, t);
  const { products, priceHistory, nextPriceHistoryId: catalogHistoryId, byCanonical } = seedProducts(catalog, t);
  const nextPriceHistoryId = seedManualProducts(products, priceHistory, catalogHistoryId, t);
  const rates = generateNbuRates(now, HISTORY_DAYS, toIsoDate);
  const clients = seedClients(overrides, t.iso(HISTORY_DAYS));

  const db: MockDb = {
    schemaVersion: DB_SCHEMA_VERSION,
    seedVersion: SEED_VERSION,
    fingerprint: input.fingerprint,
    rev: 0,
    seededAt: now.toISOString(),
    settings,
    users,
    passwordHashes: { [DEMO_USER_IDS.admin]: auth.passwordSha256 },
    ownCompanies,
    clients,
    suppliers,
    products,
    priceHistory,
    nextPriceHistoryId,
    rates,
    requests: {},
    kps: {},
    events: {},
    nextEventId: 1,
    priceUpdates: seedPriceUpdates(suppliers, products, priceHistory),
  };
  seedRequests(db, catalog, byCanonical, t);
  return db;
}

// ── час ─────────────────────────────────────────────────────────────
interface TimeHelpers {
  now: Date;
  /** ISODateTime n днів тому. */
  iso(daysAgo: number): ISODateTime;
  /** Календарна дата (Київ) n днів тому. */
  date(daysAgo: number): ISODate;
}

function timeHelpers(now: Date): TimeHelpers {
  return {
    now,
    iso: (d) => new Date(now.getTime() - d * DAY_MS).toISOString(),
    date: (d) => toIsoDate(new Date(now.getTime() - d * DAY_MS)),
  };
}

// ── каталог (детермінований; кешуємо останній результат) ─────────────
let catalogCache: { key: string; catalog: DemoCatalog } | null = null;

function demoCatalog(overrides: SeedOverrides | null): DemoCatalog {
  const supplierOverrides: NonNullable<GenerateOptions['supplierOverrides']> = {};
  for (const [key, o] of Object.entries(overrides?.suppliers ?? {}) as [SupplierKey, NonNullable<SeedOverrides['suppliers']>[SupplierKey]][]) {
    if (!o) continue;
    supplierOverrides[key] = {
      ...(o.name ? { name: o.name } : {}),
      ...(o.skuPrefix ? { skuPrefix: o.skuPrefix } : {}),
      ...(typeof o.rates?.USD === 'number' && typeof o.rates?.EUR === 'number' ? { rates: { USD: o.rates.USD, EUR: o.rates.EUR } } : {}),
    };
  }
  const key = JSON.stringify(supplierOverrides);
  if (catalogCache?.key !== key) catalogCache = { key, catalog: generateCatalog(DEFAULT_SEED, { supplierOverrides }) };
  return catalogCache.catalog;
}

// ── користувачі й наші юрособи ──────────────────────────────────────
/** Входить лише адміністратор (adminLogin — з облікових даних сіду); решта — довідник відповідальних. */
function seedUsers(createdAt: ISODateTime, adminLogin: string): UserDto[] {
  const base = { isActive: true, lastLoginAt: null, createdAt };
  return [
    { ...base, id: DEMO_USER_IDS.koval, login: 'koval', fullName: 'Коваль Олена Вікторівна', shortName: 'Коваль О.В.', email: 'koval@demo-trade.example', phone: '067 000 11 22', role: 'user' },
    { ...base, id: DEMO_USER_IDS.bondar, login: 'bondar', fullName: 'Бондар Ігор Сергійович', shortName: 'Бондар І.С.', email: 'bondar@demo-trade.example', phone: '050 000 33 44', role: 'user' },
    { ...base, id: DEMO_USER_IDS.admin, login: adminLogin, fullName: 'Адміністратор системи', shortName: 'Адміністратор', email: 'admin@demo-trade.example', phone: null, role: 'admin' },
  ];
}

function seedOwnCompanies(o: OverrideOwnCompany | undefined, logos: Record<string, string>): OwnCompanyDto[] {
  const main: OwnCompanyDto = {
    id: OWN_COMPANY_IDS.main,
    code: 'ТОВ',
    nameShort: 'ТОВ «ДЕМО ТРЕЙД»',
    nameFull: 'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ «ДЕМО ТРЕЙД»',
    edrpou: '40000001',
    ipn: '400000010001',
    isVatPayer: true,
    iban: 'UA213223130000026007233566001',
    bankName: 'АТ «ДЕМОБАНК»',
    addressLegal: 'Україна, 01001, м. Київ, вул. Прикладна, 1, оф. 10',
    phone: '044 000 00 00',
    email: 'sales@demo-trade.example',
    website: 'demo-trade.example',
    slogan: 'ВСЕ ДЛЯ КОМПЛЕКТАЦІЇ ІНЖЕНЕРНИХ СИСТЕМ',
    logoUrl: makeLogoDataUrl('ДЕМО ТРЕЙД', BRAND_COLOR),
    kpFooter: null,
    isDefault: true,
    isActive: true,
    brandName: 'ДЕМО ТРЕЙД',
  };
  if (o) {
    if (o.nameShort) main.nameShort = o.nameShort;
    if (o.nameFull) main.nameFull = o.nameFull;
    if (o.edrpou) main.edrpou = o.edrpou;
    if (o.ipn) main.ipn = o.ipn;
    if (o.iban) main.iban = o.iban;
    if (o.bankName) main.bankName = o.bankName;
    if (o.legalAddress) main.addressLegal = o.legalAddress;
    if (o.phone) main.phone = o.phone;
    if (o.email) main.email = o.email;
    if (o.website) main.website = o.website;
    if (o.slogan) main.slogan = o.slogan;
    if (typeof o.isVatPayer === 'boolean') main.isVatPayer = o.isVatPayer;
    if (o.brandName) main.brandName = o.brandName;
    if (o.logoFile && logos[o.logoFile]) main.logoUrl = logos[o.logoFile];
    else if (o.brandName) main.logoUrl = makeLogoDataUrl(o.brandName, BRAND_COLOR);
  }
  const fop: OwnCompanyDto = {
    id: OWN_COMPANY_IDS.fop,
    code: 'ФОП',
    nameShort: 'ФОП Демченко О.П.',
    nameFull: 'ФІЗИЧНА ОСОБА-ПІДПРИЄМЕЦЬ ДЕМЧЕНКО ОЛЕГ ПЕТРОВИЧ',
    edrpou: null,
    ipn: '3000000001',
    isVatPayer: false,
    iban: 'UA213223130000026007233566002',
    bankName: 'АТ «ДЕМОБАНК»',
    addressLegal: 'Україна, 01001, м. Київ, вул. Прикладна, 1',
    phone: main.phone,
    email: main.email,
    website: main.website,
    slogan: main.slogan,
    logoUrl: main.logoUrl,
    kpFooter: null,
    isDefault: false,
    isActive: true,
    brandName: main.brandName ?? null,
  };
  return [main, fop];
}

// ── постачальники ───────────────────────────────────────────────────
const SUPPLIER_COLORS: Record<SupplierKey, string> = { s1: '#00838F', s2: '#6A1B9A', s3: '#C2185B', s4: '#455A64' };

const FICTIONAL_SUPPLIER_EXTRA: Record<SupplierKey, { legal: string; contact: OverrideContact }> = {
  s1: { legal: 'ТОВ «САНТЕХ-ІМПОРТ»', contact: { fullName: 'Олег', position: 'Менеджер', phone: '050-000-10-01', email: 'oleg@santeh-import.example.com' } },
  s2: { legal: 'ТОВ «АКВА-ТРЕЙД ГРУП»', contact: { fullName: 'Відділ продажу', phone: '067-000-20-02', email: 'sales@aqua-trade.example.com' } },
  s3: { legal: 'ТОВ «ТЕРМО-ПЛАСТ»', contact: { fullName: 'Андрій', position: 'Супервайзер', phone: '097-000-30-03' } },
  s4: { legal: 'ТОВ «ГІДРО-ОПТ»', contact: { fullName: 'Ірина', position: 'Менеджер з продажу', phone: '063-000-40-04', email: 'iryna@gidro-opt.example.com' } },
};

function originOf(url: string): string | null {
  try {
    return new URL(url.replace('{query}', '')).origin;
  } catch {
    return null;
  }
}

function seedSuppliers(catalog: DemoCatalog, overrides: SeedOverrides | null, logos: Record<string, string>, t: TimeHelpers): StoredSupplier[] {
  return catalog.suppliers.map((s, i): StoredSupplier => {
    const o = overrides?.suppliers?.[s.seedKey];
    const id = supplierIdOf(s.seedKey);
    const extra = FICTIONAL_SUPPLIER_EXTRA[s.seedKey];
    const website = originOf(s.websiteSearchUrlTemplate);
    const legalNames = o?.legalEntities?.length ? o.legalEntities.map((l) => l.name) : [extra.legal];
    const contacts = o?.contacts?.length ? o.contacts : [extra.contact];
    return {
      id,
      name: s.name,
      logoUrl: (o?.logoFile && logos[o.logoFile]) || makeLogoDataUrl(s.name, SUPPLIER_COLORS[s.seedKey]),
      color: SUPPLIER_COLORS[s.seedKey],
      defaultCurrency: s.defaultCurrency,
      pricesIncludeVat: s.priceListIncludesVat,
      supplierMarkupPct: s.supplierMarkupPercent,
      ratePolicy: 'price_list',
      rateAdjustPct: 0,
      manualRateUsd: null,
      manualRateEur: null,
      priceListRates: { USD: s.rates.USD, EUR: s.rates.EUR, date: t.date(s.priceListAgeDays) },
      minOrderAmount: s.minOrderUah,
      priceStaleDays: null,
      searchUrlTemplate: s.websiteSearchUrlTemplate,
      website,
      b2bUrl: s.seedKey === 's3' ? website : null,
      lastImportAt: t.iso(s.priceListAgeDays),
      isActive: true,
      sortOrder: i + 1,
      notes: o?.notes ?? s.profile,
      deliveryInfo: s.deliveryNote,
      rrpIncludesVat: true,
      manualRatesDate: null,
      legalEntities: legalNames.map((name, j) => ({
        id: `${id}-le${j + 1}`,
        supplierId: id,
        nameShort: name,
        nameFull: null,
        edrpou: null,
        ipn: null,
        isVatPayer: !name.startsWith('ФОП'),
        iban: null,
        bankName: null,
        address: null,
        note: null,
        isDefault: j === 0,
        isActive: true,
      })),
      contacts: contacts.map((c, j) => ({
        id: `${id}-ct${j + 1}`,
        supplierId: id,
        fullName: c.fullName,
        position: c.position ?? null,
        phone: c.phone ?? null,
        email: c.email ?? null,
        note: null,
      })),
      importProfiles: [],
    };
  });
}

// ── товари та історія цін ───────────────────────────────────────────
export function availabilityOf(stockQty: number | null): AvailabilityStatus {
  if (stockQty == null) return 'unknown';
  return stockQty > 0 ? 'in_stock' : 'out_of_stock';
}

export function productKeys(p: Pick<StoredProduct, 'sku' | 'nameWork' | 'name1c' | 'brand'>): Pick<StoredProduct, 'skuKey' | 'searchText'> {
  return { skuKey: normalizeSku(p.sku), searchText: buildSearchText(p.sku, p.nameWork, p.name1c, p.brand) };
}

function seedProducts(catalog: DemoCatalog, t: TimeHelpers) {
  const products: Record<UUID, StoredProduct> = {};
  const priceHistory: Record<UUID, PriceHistoryEntry[]> = {};
  const byCanonical = new Map<string, Map<SupplierKey, StoredProduct>>();
  let historyId = 1;

  for (const p of catalog.products) {
    const id = `prd-${p.supplierKey}-${p.sku.slice(-7)}`;
    const priceUpdatedAt = t.iso(p.priceCheckedDaysAgo);
    const base = {
      id,
      supplierId: supplierIdOf(p.supplierKey),
      sku: p.sku,
      nameWork: p.nameWork,
      name1c: p.name1c,
      brand: p.brand,
      unitCode: p.unit,
      currency: p.currency,
      purchasePrice: p.purchasePrice,
      rrp: p.rrp,
      multiplicity: p.multiplicity,
      stockQty: p.stockQty,
      availability: availabilityOf(p.stockQty),
      priceUpdatedAt,
      imageUrl: null,
      productUrl: null,
      isArchived: false,
      minOrderQty: p.minOrderQty,
      notes: null,
      priceSource: 'import' as const,
      lastImportId: null,
      createdAt: t.iso(HISTORY_DAYS),
      updatedAt: priceUpdatedAt,
    };
    const stored: StoredProduct = { ...base, ...productKeys(base) };
    products[id] = stored;
    priceHistory[id] = p.priceHistory.map((pt, i) => ({
      id: historyId++,
      productId: id,
      effectiveAt: t.iso(pt.daysAgo),
      currency: p.currency,
      purchasePrice: pt.purchasePrice,
      rrp: pt.rrp,
      stockQty: pt.stockQty,
      availability: availabilityOf(pt.stockQty),
      source: i === 0 ? 'seed' : 'import',
      importId: null,
      requestId: null,
      requestNumber: null,
      user: null,
      note: i === 0 ? 'Початкове завантаження прайсу' : 'Імпорт прайсу',
    }));
    const bySupplier = byCanonical.get(p.canonicalKey) ?? new Map<SupplierKey, StoredProduct>();
    bySupplier.set(p.supplierKey, stored);
    byCanonical.set(p.canonicalKey, bySupplier);
  }
  return { products, priceHistory, nextPriceHistoryId: historyId, byCanonical };
}

/** Товари, додані вручну (немає в прайсі постачальника): прайс їх не оновлює — ціну змінюють вручну в картці товару. */
const MANUAL_PRODUCTS: {
  supplierKey: SupplierKey;
  sku: string;
  nameWork: string;
  currency: CurrencyCode;
  purchasePrice: number;
  rrp: number | null;
  stockQty: number | null;
  addedDaysAgo: number;
  /** Ціну оновлювали вручну: коли й з якої. */
  repriced?: { daysAgo: number; from: number };
}[] = [
  {
    supplierKey: 's2',
    sku: 'АТ-Р-0101',
    nameWork: 'Насос циркуляційний 25/60-180 (під замовлення)',
    currency: 'EUR',
    purchasePrice: 61.5,
    rrp: 94.9,
    stockQty: null,
    addedDaysAgo: 24,
    repriced: { daysAgo: 9, from: 58.9 },
  },
  { supplierKey: 's4', sku: 'ГО-Р-0102', nameWork: 'Бак розширювальний 24 л для опалення', currency: 'UAH', purchasePrice: 1180, rrp: 1790, stockQty: 4, addedDaysAgo: 3 },
  {
    supplierKey: 's1',
    sku: 'СІ-Р-0103',
    nameWork: 'Інсталяція для підвісного унітазу з кнопкою, хром',
    currency: 'USD',
    purchasePrice: 88.4,
    rrp: 139,
    stockQty: null,
    addedDaysAgo: 16,
  },
];

function seedManualProducts(
  products: Record<UUID, StoredProduct>,
  history: Record<UUID, PriceHistoryEntry[]>,
  nextHistoryId: number,
  t: TimeHelpers,
): number {
  const user = { id: DEMO_USER_IDS.bondar, shortName: 'Бондар І.С.' };
  let historyId = nextHistoryId;
  MANUAL_PRODUCTS.forEach((m, i) => {
    const id = `prd-manual-${i + 1}`;
    const updatedDaysAgo = m.repriced?.daysAgo ?? m.addedDaysAgo;
    const availability: AvailabilityStatus = m.stockQty == null ? 'on_order' : availabilityOf(m.stockQty);
    const base = {
      id,
      supplierId: supplierIdOf(m.supplierKey),
      sku: m.sku,
      nameWork: m.nameWork,
      name1c: null,
      brand: null,
      unitCode: 'шт',
      currency: m.currency,
      purchasePrice: m.purchasePrice,
      rrp: m.rrp,
      multiplicity: 1,
      stockQty: m.stockQty,
      availability,
      priceUpdatedAt: t.iso(updatedDaysAgo),
      imageUrl: null,
      productUrl: null,
      isArchived: false,
      minOrderQty: null,
      notes: 'Додано вручну: товару немає в прайсі постачальника',
      priceSource: 'manual' as const,
      lastImportId: null,
      createdAt: t.iso(m.addedDaysAgo),
      updatedAt: t.iso(updatedDaysAgo),
    };
    products[id] = { ...base, ...productKeys(base) };
    const entry = (daysAgo: number, purchasePrice: number, note: string): PriceHistoryEntry => ({
      id: historyId++,
      productId: id,
      effectiveAt: t.iso(daysAgo),
      currency: m.currency,
      purchasePrice,
      rrp: m.rrp,
      stockQty: m.stockQty,
      availability,
      source: 'manual',
      importId: null,
      requestId: null,
      requestNumber: null,
      user,
      note,
    });
    history[id] = [entry(m.addedDaysAgo, m.repriced?.from ?? m.purchasePrice, 'Товар додано вручну')];
    if (m.repriced) history[id].push(entry(m.repriced.daysAgo, m.purchasePrice, 'Ціну оновлено за рахунком постачальника'));
  });
  return historyId;
}

/** Журнал: останнє автоматичне оновлення прайсу кожного постачальника (зміни — з історії цін того дня). */
function seedPriceUpdates(
  suppliers: StoredSupplier[],
  products: Record<UUID, StoredProduct>,
  history: Record<UUID, PriceHistoryEntry[]>,
): PriceUpdateDto[] {
  const out: PriceUpdateDto[] = [];
  for (const s of suppliers) {
    if (!s.lastImportAt) continue;
    const day = s.lastImportAt.slice(0, 10);
    const stats = { total: 0, up: 0, down: 0 };
    for (const p of Object.values(products)) {
      if (p.supplierId !== s.id || p.priceSource === 'manual') continue;
      stats.total++;
      const h = history[p.id] ?? [];
      const i = h.findIndex((e) => e.effectiveAt.slice(0, 10) === day);
      const cur = i > 0 ? h[i].purchasePrice : null;
      const prev = i > 0 ? h[i - 1].purchasePrice : null;
      if (cur == null || prev == null || cur === prev) continue;
      if (cur > prev) stats.up++;
      else stats.down++;
    }
    out.push({
      id: 0,
      supplierId: s.id,
      at: s.lastImportAt,
      productsTotal: stats.total,
      changed: stats.up + stats.down,
      priceUp: stats.up,
      priceDown: stats.down,
      rates: { USD: s.priceListRates.USD, EUR: s.priceListRates.EUR },
      user: null,
    });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at)).map((u, i) => ({ ...u, id: i + 1 }));
}

// ── клієнти ─────────────────────────────────────────────────────────
interface ClientSeed {
  key: string;
  name: string;
  responsibleUserId: UUID;
  counterparties: OverrideCounterparty[];
}

const FICTIONAL_CLIENTS: ClientSeed[] = [
  {
    key: 'c1',
    name: 'БУДІНВЕСТ',
    responsibleUserId: DEMO_USER_IDS.koval,
    counterparties: [
      {
        nameShort: 'ТОВ «БК БУДІНВЕСТ»',
        nameFull: 'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ «БУДІВЕЛЬНА КОМПАНІЯ БУДІНВЕСТ»',
        edrpou: '41000011',
        legalAddress: 'м. Київ, вул. Промислова, 12',
        actualAddress: 'м. Київ, вул. Промислова, 12, склад 3',
        contacts: [{ fullName: 'Петренко Андрій', position: 'Менеджер з постачання', phone: '067-000-12-34', email: 'a.petrenko@budinvest.example' }],
      },
      {
        nameShort: 'ТОВ «БУДІНВЕСТ-СЕРВІС»',
        nameFull: 'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ «БУДІНВЕСТ-СЕРВІС»',
        edrpou: '41000012',
        legalAddress: 'м. Вінниця, вул. Центральна, 7',
        actualAddress: 'м. Вінниця, вул. Центральна, 7',
        contacts: [{ fullName: 'Коваленко Юлія', position: 'Начальник відділу постачання', phone: '050-000-45-67', email: 'y.kovalenko@budinvest.example' }],
      },
    ],
  },
  {
    key: 'c2',
    name: 'АГРОПРОМ',
    responsibleUserId: DEMO_USER_IDS.bondar,
    counterparties: [
      {
        nameShort: 'ТОВ «АГРОПРОМ-ЗАХІД»',
        nameFull: 'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ «АГРОПРОМ-ЗАХІД»',
        edrpou: '41000021',
        legalAddress: 'м. Житомир, просп. Миру, 11',
        actualAddress: 'Житомирська обл., с. Зелене, вул. Польова, 1',
        contacts: [
          { fullName: 'Гнатюк Тетяна', position: 'Інженер з МТЗ', phone: '093-000-11-90', email: 't.hnatiuk@agroprom.example' },
          { fullName: 'Мороз Тарас', position: 'Начальник відділу закупівель', phone: '073-000-24-25', email: 't.moroz@agroprom.example' },
        ],
      },
    ],
  },
  {
    key: 'c3',
    name: 'ДЖЕРЕЛО',
    responsibleUserId: DEMO_USER_IDS.koval,
    counterparties: [
      {
        nameShort: 'ПП «ДЖЕРЕЛО-ЕКО»',
        nameFull: 'ПРИВАТНЕ ПІДПРИЄМСТВО «ДЖЕРЕЛО-ЕКО»',
        edrpou: '41000031',
        legalAddress: 'м. Моршин, вул. Курортна, 3',
        actualAddress: 'м. Моршин, вул. Курортна, 3',
        contacts: [{ fullName: 'Гаврилюк Олександр', position: 'Заступник директора', phone: '099-000-71-13', email: 'o.havryliuk@dzherelo.example' }],
      },
      {
        nameShort: 'ТОВ «ОК ДЖЕРЕЛО»',
        nameFull: 'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ «ОЗДОРОВЧИЙ КОМПЛЕКС ДЖЕРЕЛО»',
        edrpou: '41000032',
        legalAddress: 'м. Моршин, площа Свободи, 2',
        actualAddress: 'м. Моршин, вул. Курортна, 3',
      },
    ],
  },
  {
    key: 'c4',
    name: 'ДОМОБУД',
    responsibleUserId: DEMO_USER_IDS.bondar,
    counterparties: [
      {
        nameShort: 'ТОВ «ДОМОБУД ПЛЮС»',
        nameFull: 'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ «ДОМОБУД ПЛЮС»',
        edrpou: '41000041',
        legalAddress: 'м. Полтава, вул. Будівельників, 5',
        actualAddress: 'м. Полтава, вул. Будівельників, 5',
        contacts: [{ fullName: 'Савчук Микола', position: 'Виконроб', phone: '066-000-52-10' }],
      },
    ],
  },
  {
    key: 'c5',
    name: 'ГОТЕЛЬ «ЗОРЯ»',
    responsibleUserId: DEMO_USER_IDS.koval,
    counterparties: [
      {
        nameShort: 'ТОВ «ГК ЗОРЯ»',
        nameFull: 'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ «ГОТЕЛЬНИЙ КОМПЛЕКС ЗОРЯ»',
        edrpou: '41000051',
        legalAddress: 'м. Одеса, вул. Морська, 20',
        actualAddress: 'м. Одеса, вул. Морська, 20',
        contacts: [{ fullName: 'Литвиненко Ірина', position: 'Адміністратор господарської служби', phone: '048-000-33-44', email: 'i.lytvynenko@zorya-hotel.example' }],
      },
    ],
  },
  {
    key: 'c6',
    name: 'СКЛАД-ЛОГІСТИК',
    responsibleUserId: DEMO_USER_IDS.bondar,
    counterparties: [
      {
        nameShort: 'ТОВ «СКЛАД-ЛОГІСТИК»',
        nameFull: 'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ «СКЛАД-ЛОГІСТИК»',
        edrpou: '41000061',
        legalAddress: 'Київська обл., м. Бровари, вул. Логістична, 8',
        actualAddress: 'Київська обл., м. Бровари, вул. Логістична, 8',
        contacts: [{ fullName: 'Ткаченко Сергій', position: 'Головний інженер', phone: '067-000-81-81', email: 's.tkachenko@sklad-logistic.example' }],
      },
      {
        nameShort: 'ФОП Мельник С.В.',
        nameFull: 'ФІЗИЧНА ОСОБА-ПІДПРИЄМЕЦЬ МЕЛЬНИК СВІТЛАНА ВАСИЛІВНА',
        edrpou: '3100000061',
        legalAddress: 'Київська обл., м. Бровари, вул. Незалежності, 4',
      },
    ],
  },
];

function seedClients(overrides: SeedOverrides | null, createdAt: ISODateTime): Record<UUID, ClientDetail> {
  const out: Record<UUID, ClientDetail> = {};
  for (const seed of FICTIONAL_CLIENTS) {
    const o = overrides?.clients?.[seed.key];
    const id = clientIdOf(seed.key);
    const cps = o?.counterparties?.length ? o.counterparties : seed.counterparties;
    const counterparties: CounterpartyDto[] = [];
    const contacts: ContactDto[] = [];
    cps.forEach((cp, j) => {
      const cpId = `${id}-cp${j + 1}`;
      counterparties.push({
        id: cpId,
        clientId: id,
        nameShort: cp.nameShort,
        nameFull: cp.nameFull ?? null,
        edrpou: cp.edrpou ?? null,
        ipn: null,
        isVatPayer: !/^ФОП/u.test(cp.nameShort),
        addressLegal: cp.legalAddress ?? null,
        addressActual: cp.actualAddress ?? null,
        note: null,
        isDefault: j === 0,
        isActive: true,
      });
      (cp.contacts ?? []).forEach((c, k) => {
        contacts.push({
          id: `${cpId}-ct${k + 1}`,
          clientId: id,
          counterpartyId: cpId,
          fullName: c.fullName,
          position: c.position ?? null,
          phone: c.phone ?? null,
          email: c.email ?? null,
          note: null,
          isPrimary: contacts.length === 0,
          isActive: true,
        });
      });
    });
    out[id] = {
      id,
      name: o?.name ?? seed.name,
      note: null,
      responsibleUserId: seed.responsibleUserId,
      isActive: true,
      counterparties,
      contacts,
      createdAt,
      updatedAt: createdAt,
    };
  }
  return out;
}

// ── заявки ──────────────────────────────────────────────────────────
const STATUS_MAP: Record<DemoRequestStatus, RequestStatus> = { IN_PROGRESS: 'in_progress', DONE: 'done', CANCELLED: 'cancelled' };
const MARKUP_MAP: Record<DemoMarkupMethod, MarkupMethod> = { RRP: 'rrp', MARKUP_PERCENT: 'markup_on_cost', DISCOUNT_FROM_RRP: 'discount_from_rrp' };

export function stripCatalog(offer: Offer): StoredOffer {
  const copy: Offer = { ...offer };
  delete copy.catalog;
  return copy;
}

export function headerRatesOn(db: Pick<MockDb, 'rates'>, date: ISODate): HeaderRates {
  const eff = effectiveRatesOn(db.rates, date);
  return { USD: eff.USD?.rate ?? null, EUR: eff.EUR?.rate ?? null, date };
}

export function supplierRefsOf(db: Pick<MockDb, 'suppliers'>): Record<UUID, SupplierRef> {
  return Object.fromEntries(db.suppliers.map((s) => [s.id, toSupplierRef(s)]));
}

function seedRequests(db: MockDb, catalog: DemoCatalog, byCanonical: Map<string, Map<SupplierKey, StoredProduct>>, t: TimeHelpers): void {
  const { settings } = db;
  const supplierRefs = supplierRefsOf(db);
  const ownMain = db.ownCompanies.find((c) => c.id === OWN_COMPANY_IDS.main)!;
  const ownFop = db.ownCompanies.find((c) => c.id === OWN_COMPANY_IDS.fop)!;
  const userRef = (id: UUID) => {
    const u = db.users.find((x) => x.id === id) ?? db.users[0];
    return { id: u.id, shortName: u.shortName };
  };

  let nextDemoKp = FIRST_DEMO_KP_NUMBER;

  catalog.requests.forEach((r, i) => {
    const number = i + 1;
    const nn = formatRequestNumber(number);
    const id = requestIdOf(number);
    const requestDate = t.date(r.daysAgo);
    const client = db.clients[clientIdOf(r.clientKey)] ?? null;
    const counterparty = client?.counterparties[0] ?? null;
    const contact = client?.contacts.find((c) => c.counterpartyId === counterparty?.id) ?? null;
    // 000003 — від ФОП (для демо обох юросіб)
    const ownCompany = number === 3 ? ownFop : ownMain;
    const managerId = client?.responsibleUserId ?? DEMO_USER_IDS.koval;
    const rates = headerRatesOn(db, requestDate);

    const header: RequestHeader = {
      number,
      requestDate,
      status: STATUS_MAP[r.status],
      title: r.title ?? null,
      clientId: client?.id ?? null,
      counterpartyId: counterparty?.id ?? null,
      contactId: contact?.id ?? null,
      ownCompanyId: ownCompany.id,
      managerId,
      notes: r.note ?? null,
      purchaseNote: null,
      rates,
      vatRatePct: settings.vatRatePct,
      kpSettings: defaultKpSettings(settings, ownCompany),
      cancelReason: r.cancelReason ?? null,
    };

    const blocks = r.supplierKeys.map((sk, bi) =>
      createSupplierBlock(supplierRefs[supplierIdOf(sk)], rates, { id: `bl-${nn}-${sk}`, position: bi + 1 }),
    );
    const blockBySupplier = new Map(r.supplierKeys.map((sk, bi) => [sk, blocks[bi]]));

    const lines: RequestLine[] = [];
    const offers: StoredOffer[] = [];
    const approved = new Set(r.approvedLineIdx ?? []);
    r.lines.forEach((dl, li) => {
      const lineId = `ln-${nn}-${String(li + 1).padStart(3, '0')}`;
      const excludedOffer = dl.offers.some((o) => o.excluded);
      const line = createRequestLine({
        id: lineId,
        position: li + 1,
        clientName: dl.clientName,
        clientUnit: dl.unit,
        qty: dl.qty,
        clientNote: excludedOffer ? null : (dl.note ?? null),
      });
      if (approved.has(li)) line.approval = { approved: true, approvedQty: dl.qty };
      for (const o of dl.offers) {
        const block = blockBySupplier.get(o.supplierKey);
        const product = dl.canonicalKey ? byCanonical.get(dl.canonicalKey)?.get(o.supplierKey) : undefined;
        if (!block || !product) continue;
        const offer = createOfferFromProduct(product, {
          id: `of-${nn}-${String(li + 1).padStart(3, '0')}-${o.supplierKey}`,
          lineId,
          blockId: block.id,
          lineQty: dl.qty,
          autoRoundMultiplicity: settings.autoRoundMultiplicity,
        });
        if (o.excluded) {
          offer.excluded = true;
          offer.excludeReason = dl.note ?? 'Нерентабельно везти окремо';
        }
        if (o.approved) line.selection = { blockId: block.id };
        offers.push(stripCatalog(offer));
      }
      lines.push(line);
    });

    // AC-НОМ-3 «ціна в каталозі змінилась»: заявка 000004 отримує одну «живу» пропозицію арт. 123 (СІ0000123/ЦР0000123)
    // зі знімком за старою ціною 8,45 USD — каталог від часу знімка вже показує 8,602 USD (AC-НОМ-1).
    if (number === 4) {
      const product = byCanonical.get('xl:mixer-basin-pr1')?.get('s1');
      if (product) {
        const block = createSupplierBlock(supplierRefs[supplierIdOf('s1')], rates, { id: `bl-${nn}-cat`, position: blocks.length + 1 });
        blocks.push(block);
        const lineId = `ln-${nn}-cat`;
        const line = createRequestLine({ id: lineId, position: lines.length + 1, clientName: product.nameWork, clientUnit: product.unitCode, qty: 1 });
        const offer = createOfferFromProduct(product, {
          id: `of-${nn}-cat-s1`,
          lineId,
          blockId: block.id,
          lineQty: 1,
          autoRoundMultiplicity: settings.autoRoundMultiplicity,
        });
        offer.purchasePriceCur = 8.45;
        line.selection = { blockId: block.id };
        lines.push(line);
        offers.push(stripCatalog(offer));
      }
    }

    const markup = {
      method: MARKUP_MAP[r.markup?.method ?? 'RRP'],
      value: r.markup?.value ?? 0,
      rounding: settings.priceRounding,
      excludeUnavailable: settings.excludeUnavailableByDefault,
    };
    const ctx = { now: t.now, settings: pricingSettingsFrom(settings), suppliers: supplierRefs };
    const computed = computeRequest({ header, markup, lines, blocks, offers }, ctx);
    const createdAt = t.iso(r.daysAgo);
    const manager = userRef(managerId);
    const stored: StoredRequest = {
      id,
      version: 1,
      header,
      markup,
      lines,
      blocks,
      offers,
      meta: {
        createdAt,
        updatedAt: createdAt,
        updatedBy: manager,
        sourceRequestId: null,
        copyInfo: null,
        kpCount: 0,
        attachmentsCount: 0,
      },
      totals: computed.totals,
    };
    db.requests[id] = stored;
    const updatedAt = seedRequestStory(db, stored, r, { t, ctx, manager, ownName: ownCompany.nameShort, nextKp: () => nextDemoKp++ });
    stored.meta.updatedAt = updatedAt;
    stored.meta.kpCount = db.kps[id]?.length ?? 0;
    stored.meta.attachmentsCount = stored.meta.kpCount + (number === 4 ? 1 : 0);
    // ПОГ-1: «Погоджена сума» — від КП-основи (останнє звичайне КП), не з живого computed.totals.approvedSaleGross.
    stored.totals = { ...computed.totals, approvedSaleGross: approvedSaleGrossOf(stored, computed, ctx, db.kps[id]) };
  });
  settings.nextRequestNumber = catalog.requests.length + 1;
  // наступне КП — одразу після демо-КП (з 2110 → перше нове 2114, ТЗ §6); лічильник не може повторити вже виданий номер
  settings.nextKpNumber = nextDemoKp;
}

/** Історія демо-заявки: створення → КП → погодження → фінальне КП → статус. Повертає час останньої події. */
function seedRequestStory(
  db: MockDb,
  stored: StoredRequest,
  r: DemoRequest,
  o: { t: TimeHelpers; ctx: PricingContext; manager: UserRef; ownName: string; nextKp: () => number },
): string {
  const id = stored.id;
  const nn = formatRequestNumber(stored.header.number);
  const when = (daysAgo: number) => {
    const d = Math.max(daysAgo, 0.02);
    return { at: o.t.iso(d), date: o.t.date(d) };
  };
  const created = stored.header.number === 4 ? 'Заявку створено, позиції імпортовано з Excel клієнта' : 'Заявку створено';
  addEvent(db, id, { at: stored.meta.createdAt, user: o.manager, kind: 'created', summary: created });
  let last = r.daysAgo;

  if (r.hasKp) {
    last = r.daysAgo - 0.8;
    const kp = makeKpDocument(db, stored, {
      ...when(last),
      id: `kp-${nn}-1`,
      kpNumber: o.nextKp(),
      user: o.manager,
      settings: stored.header.kpSettings,
      final: false,
      ctx: o.ctx,
    });
    (db.kps[id] ??= []).push(kp);
    addEvent(db, id, { at: kp.createdAt, user: o.manager, kind: 'kp_created', summary: kpEventSummary(kp, o.ownName) });

    const approved = stored.lines.filter((l) => l.approval.approved).length;
    if (approved) {
      last = r.daysAgo - 1.6;
      addEvent(db, id, { at: when(last).at, user: o.manager, kind: 'approval', summary: `Погоджено позицій: ${approved} з ${stored.lines.length}` });
      if (r.status === 'DONE') {
        last -= 0.05;
        const fin = makeKpDocument(db, stored, {
          ...when(last),
          id: `kp-${nn}-2`,
          kpNumber: o.nextKp(),
          user: o.manager,
          settings: stored.header.kpSettings,
          final: true,
          ctx: o.ctx,
        });
        db.kps[id].push(fin);
        addEvent(db, id, { at: fin.createdAt, user: o.manager, kind: 'kp_created', summary: kpEventSummary(fin, o.ownName) });
      }
    }
  }

  if (stored.header.status !== 'in_progress') {
    last -= 0.2;
    addEvent(db, id, {
      at: when(last).at,
      user: o.manager,
      kind: 'status_change',
      summary: statusEventSummary('in_progress', stored.header.status, stored.header.cancelReason),
    });
  }
  return when(Math.min(last, r.daysAgo)).at;
}
