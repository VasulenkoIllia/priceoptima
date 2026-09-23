// Вигаданий каталог для розробки й навантажувальних перевірок: постачальники, товари, історія цін, заявки.
// Лише для порожньої бази розробки — у робочу базу не запускати.
//
//   DATABASE_URL=… npx tsx --tsconfig tsconfig.server.json scripts/fake-catalog.ts --products 1000000 --suppliers 40 --requests 5000
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { toIsoDate } from '@shared/format';
import { normalizeSku } from '@shared/parse';
import { defaultKpSettings, defaultMarkupSettings } from '@shared/pricing';
import type { UUID } from '@shared/types';
import { searchTextOf } from '../server/modules/products/products.rules';
import { toAppSettings } from '../server/modules/settings/settings.mapper';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/u, ''), process.argv[i + 1]);
const PRODUCTS = Number(args.get('products') ?? 100_000);
const SUPPLIERS = Number(args.get('suppliers') ?? 20);
const REQUESTS = Number(args.get('requests') ?? 500);
const BATCH = 5000;

if (process.env.NODE_ENV === 'production') throw new Error('Не для робочої бази');
const prisma = new PrismaClient();

// ── детермінований генератор ────────────────────────────────────────
let seed = 20260918;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)];
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));

const KINDS = [
  ['Труба', 'м', 4],
  ['Муфта', 'шт', 1],
  ['Коліно 90°', 'шт', 1],
  ['Трійник', 'шт', 1],
  ['Кран кульовий', 'шт', 1],
  ['Зворотний клапан', 'шт', 1],
  ['Фільтр грубої очистки', 'шт', 1],
  ['Змішувач для умивальника', 'шт', 1],
  ['Змішувач для ванни', 'шт', 1],
  ['Радіатор сталевий', 'шт', 1],
  ['Насос циркуляційний', 'шт', 1],
  ['Кріплення', 'уп', 10],
  ['Ізоляція трубна', 'м', 2],
  ['Колектор', 'шт', 1],
  ['Сифон', 'шт', 1],
] as const;
const MATERIALS = ['ППР', 'PEX', 'латунь', 'нерж. сталь', 'мідь', 'ПВХ', 'чавун', 'поліетилен'];
const SIZES = ['16', '20', '25', '32', '40', '50', '63', '75', '90', '110', '1/2"', '3/4"', '1"', '1 1/4"'];
const COLORS = ['білий', 'сірий', 'хром', 'чорний', 'зелений'];
const BRANDS = ['Аквалінк', 'ТермоПро', 'ГідроТех', 'Вартекс', 'Полімакс', 'Сантерра', 'Флювія', 'Нордтерм', 'Ріверон', 'Кварцлайн'];
const CURRENCIES = ['UAH', 'UAH', 'UAH', 'USD', 'EUR'] as const;

/** Розмір прайсу постачальника: кілька великих і багато середніх (сума = PRODUCTS). */
function supplierSizes(): number[] {
  const weights = Array.from({ length: SUPPLIERS }, (_, i) => (i < 3 ? 12 : i < 10 ? 3 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const sizes = weights.map((w) => Math.floor((PRODUCTS * w) / total));
  sizes[0] += PRODUCTS - sizes.reduce((a, b) => a + b, 0);
  return sizes;
}

async function main(): Promise<void> {
  const existing = await prisma.product.count();
  if (existing > 0 && args.get('force') !== 'yes') throw new Error(`У базі вже ${existing} товарів — потрібна порожня база (або --force yes)`);
  const t0 = Date.now();
  const now = new Date();

  const suppliers = supplierSizes().map((size, i) => ({
    id: randomUUID(),
    name: `Постачальник ${String(i + 1).padStart(2, '0')}`,
    prefix: `P${String(i + 1).padStart(2, '0')}`,
    size,
    currency: i % 7 === 3 ? ('USD' as const) : i % 11 === 5 ? ('EUR' as const) : ('UAH' as const),
  }));
  await prisma.supplier.createMany({
    data: suppliers.map((s, i) => ({ id: s.id, name: s.name, defaultCurrency: s.currency, sortOrder: i, lastImportAt: now })),
  });

  let made = 0;
  type Sample = { id: string; supplierId: string; sku: string; nameWork: string; unitCode: string; currency: 'UAH' | 'USD' | 'EUR'; price: number; rrp: number | null };
  const sample: Sample[] = [];
  for (const s of suppliers) {
    for (let from = 0; from < s.size; from += BATCH) {
      const rows: Prisma.ProductCreateManyInput[] = [];
      for (let i = from; i < Math.min(s.size, from + BATCH); i++) {
        const [kind, unit, mult] = pick(KINDS);
        const nameWork = `${kind} ${pick(MATERIALS)} ${pick(SIZES)} ${pick(COLORS)}`;
        const brand = pick(BRANDS);
        const sku = `${s.prefix}-${String(i + 1).padStart(7, '0')}`;
        const price = Math.round((5 + rnd() * rnd() * 20000) * 100) / 100;
        const out = rnd() < 0.08;
        const daysAgo = rnd() < 0.15 ? int(8, 60) : int(0, 6);
        const id = randomUUID();
        const currency = s.currency === 'UAH' ? pick(CURRENCIES) : s.currency;
        const rrp = rnd() < 0.7 ? Math.round(price * 1.35 * 1.2 * 100) / 100 : null;
        rows.push({
          id,
          supplierId: s.id,
          sku,
          skuKey: normalizeSku(sku),
          nameWork,
          name1c: rnd() < 0.3 ? `${nameWork} (${brand})` : null,
          brand,
          unitCode: unit,
          currency,
          purchasePrice: price,
          rrp,
          multiplicity: mult,
          stockQty: out ? 0 : int(1, 500),
          availability: out ? 'out_of_stock' : 'in_stock',
          priceUpdatedAt: new Date(now.getTime() - daysAgo * 86_400_000),
          searchText: searchTextOf({ sku, nameWork, name1c: null, brand }),
        });
        if (rnd() < 0.002 && sample.length < 3000) sample.push({ id, supplierId: s.id, sku, nameWork, unitCode: unit, currency, price, rrp });
      }
      await prisma.product.createMany({ data: rows });
      made += rows.length;
      if (made % 100_000 < BATCH) console.log(`товарів: ${made} (${Math.round((Date.now() - t0) / 1000)} с)`);
    }
  }

  // історія цін — для частини товарів (як після кількох оновлень прайсу)
  const withHistory = await prisma.product.findMany({ select: { id: true, currency: true, purchasePrice: true }, take: Math.min(200_000, PRODUCTS), orderBy: { id: 'asc' } });
  for (let from = 0; from < withHistory.length; from += BATCH) {
    await prisma.priceHistory.createMany({
      data: withHistory.slice(from, from + BATCH).flatMap((p) => [
        { productId: p.id, effectiveAt: new Date(now.getTime() - 30 * 86_400_000), currency: p.currency, purchasePrice: p.purchasePrice, origin: 'import' as const },
        { productId: p.id, effectiveAt: new Date(now.getTime() - 5 * 86_400_000), currency: p.currency, purchasePrice: p.purchasePrice, origin: 'import' as const },
      ]),
    });
  }

  // курси НБУ на кожен день, за який будуть заявки (інакше пропозиції у валюті не перерахуються)
  const days = Math.ceil(REQUESTS / 24) + 2;
  await prisma.currencyRate.createMany({
    data: Array.from({ length: days }, (_, d) => {
      const rateDate = new Date(`${toIsoDate(new Date(now.getTime() - d * 86_400_000))}T00:00:00Z`);
      return [
        { currency: 'USD' as const, rateDate, rate: Math.round((41 + rnd() * 0.8) * 10_000) / 10_000, source: 'nbu' as const },
        { currency: 'EUR' as const, rateDate, rate: Math.round((47.5 + rnd() * 0.9) * 10_000) / 10_000, source: 'nbu' as const },
      ];
    }).flat(),
    skipDuplicates: true,
  });
  const rateOn = new Map<string, { USD: number; EUR: number }>();
  for (const r of await prisma.currencyRate.findMany({ where: { source: 'nbu' } })) {
    const key = r.rateDate.toISOString().slice(0, 10);
    const cur = rateOn.get(key) ?? { USD: 0, EUR: 0 };
    if (r.currency === 'USD' || r.currency === 'EUR') cur[r.currency] = r.rate.toNumber();
    rateOn.set(key, cur);
  }

  // заявки як справжні: 2–4 постачальники, 10–60 рядків, у рядку 1–3 пропозиції цих постачальників;
  // валюта й РРЦ пропозиції — як у каталозі, бланк КП — за налаштуваннями й нашою юрособою
  const settingsRow = await prisma.appSettings.findUnique({ where: { id: 1 } });
  const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
  const bySupplier = new Map<string, Sample[]>();
  for (const p of sample) bySupplier.set(p.supplierId, [...(bySupplier.get(p.supplierId) ?? []), p]);
  const supplierIds = [...bySupplier.keys()];
  const supplierById = new Map<string, (typeof suppliers)[number]>(suppliers.map((s) => [s.id, s]));
  if (REQUESTS > 0 && settingsRow && admin && supplierIds.length >= 2) {
    const settings = toAppSettings(settingsRow);
    const own = await prisma.ownCompany.create({
      data: { code: 'ТСТ', nameShort: 'ТОВ «ТЕСТ ТРЕЙД»', nameFull: 'ТОВ «ТЕСТ ТРЕЙД»', isVatPayer: true, isDefault: true },
    });
    const kpSettings = defaultKpSettings(settings, { id: own.id as UUID, isVatPayer: true });
    const markup = defaultMarkupSettings(settings);
    const client = await prisma.client.create({ data: { name: 'Клієнт для перевірки' } });
    for (let r = 0; r < REQUESTS; r++) {
      const id = randomUUID();
      const number = r + 1;
      const created = new Date(now.getTime() - (REQUESTS - r) * 3_600_000);
      const date = toIsoDate(created);
      const rates = rateOn.get(date) ?? { USD: 41, EUR: 47.5 };
      const chosen = [...supplierIds].sort(() => rnd() - 0.5).slice(0, int(2, Math.min(4, supplierIds.length)));
      const blockIds = new Map(chosen.map((sid) => [sid, randomUUID()]));
      const lines: Prisma.RequestLineCreateManyInput[] = [];
      const offers: Prisma.RequestOfferCreateManyInput[] = [];
      const n = int(10, 60);
      for (let l = 0; l < n; l++) {
        const lineId = randomUUID();
        const qty = int(1, 50);
        const inBlocks = [...chosen].sort(() => rnd() - 0.5).slice(0, int(1, Math.min(3, chosen.length)));
        const main = pick(bySupplier.get(inBlocks[0])!);
        lines.push({ id: lineId, requestId: id, position: l + 1, clientName: main.nameWork, clientUnit: main.unitCode, qty, markup: {}, approved: false });
        for (const sid of inBlocks) {
          const p = sid === main.supplierId ? main : pick(bySupplier.get(sid)!);
          offers.push({
            id: randomUUID(), requestId: id, lineId, blockId: blockIds.get(sid)!, productId: p.id, sku: p.sku, nameWork: p.nameWork, nameKind: 'work',
            unitCode: p.unitCode, currency: p.currency, purchasePriceCur: p.price, rrpCur: p.rrp, availability: 'in_stock', excluded: false,
          });
        }
      }
      await prisma.$transaction([
        prisma.request.create({
          data: {
            id, number, requestDate: new Date(`${date}T00:00:00Z`), status: r % 9 === 0 ? 'done' : 'in_progress', title: `Об'єкт ${number}`,
            clientId: client.id, ownCompanyId: own.id, managerId: admin.id, vatRatePct: settings.vatRatePct,
            rateUsd: rates.USD, rateEur: rates.EUR, ratesDate: new Date(`${date}T00:00:00Z`),
            discountFormula: settings.discountFormula, kpSettings: kpSettings as unknown as Prisma.InputJsonValue, markup: markup as unknown as Prisma.InputJsonValue,
            linesCount: n, suppliersCount: chosen.length, searchText: `${String(number).padStart(6, '0')} ${number} клієнт для перевірки об'єкт ${number}`,
            createdAt: created, createdById: admin.id, updatedAt: created, updatedById: admin.id,
          },
        }),
        prisma.requestBlock.createMany({
          data: chosen.map((sid, i) => ({
            id: blockIds.get(sid)!, requestId: id, position: i + 1, supplierId: sid, defaultCurrency: supplierById.get(sid)?.currency ?? 'UAH',
            rateUsd: rates.USD, rateEur: rates.EUR, ratesDate: new Date(`${date}T00:00:00Z`), rateSource: 'nbu', supplierMarkupPct: 0, pricesIncludeVat: false,
          })),
        }),
        prisma.requestLine.createMany({ data: lines }),
        prisma.requestOffer.createMany({ data: offers }),
      ]);
    }
    await prisma.appSettings.update({ where: { id: 1 }, data: { nextRequestNumber: REQUESTS + 1 } });
  }
  await prisma.$executeRawUnsafe('ANALYZE');
  console.log(`готово: товарів ${made}, постачальників ${suppliers.length}, заявок ${REQUESTS}, ${Math.round((Date.now() - t0) / 1000)} с`);
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
