// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeSku } from '@shared/parse';
import { emptyRow, type PriceRow } from '../modules/price-updates/connectors/types';
import {
  FULL_ROLES,
  isRejected,
  planApply,
  REPORT_SAMPLE,
  SKIP_REASONS,
  type ApplyPlan,
  type ExistingProduct,
  type PlanInput,
  type PlanRejection,
  type SourceRoles,
} from '../modules/price-updates/plan';
import { searchTextOf } from '../modules/products/products.rules';

const TODAY = '2026-09-16';
const HYBRID_LINK: SourceRoles = { purchasePrice: false, rrp: 'set', stock: true, assortment: true };
const HYBRID_FILE: SourceRoles = { purchasePrice: true, rrp: 'fill', stock: true, assortment: false };

let seq = 0;
/** Товар каталогу з узгодженим ключем і пошуковим текстом. */
function product(overrides: Partial<ExistingProduct> = {}): ExistingProduct {
  seq++;
  const base: ExistingProduct = {
    id: `p-${seq}`,
    sku: `SKU-${seq}`,
    skuKey: '',
    nameWork: `Товар ${seq}`,
    name1c: null,
    brand: null,
    unitCode: 'шт',
    currency: 'UAH',
    purchasePrice: 100,
    rrp: 150,
    stockQty: 10,
    availability: 'in_stock',
    multiplicity: 1,
    minOrderQty: null,
    barcode: null,
    categoryPath: null,
    searchText: '',
    priceOrigin: 'import',
    missingSince: null,
    isArchived: false,
    autoArchived: false,
    hasImages: false,
    ...overrides,
  };
  return {
    ...base,
    skuKey: overrides.skuKey ?? normalizeSku(base.sku),
    searchText: overrides.searchText ?? searchTextOf(base),
  };
}

/** Рядок прайсу, що повторює товар як є. */
function rowOf(p: ExistingProduct, overrides: Partial<PriceRow> = {}): PriceRow {
  return {
    ...emptyRow(p.sku),
    name: p.nameWork,
    purchasePrice: p.purchasePrice,
    rrp: p.rrp,
    currency: p.currency,
    stockQty: p.stockQty,
    availability: p.availability,
    ...overrides,
  };
}

function run(input: Partial<PlanInput> & Pick<PlanInput, 'existing' | 'rows'>) {
  let ids = 0;
  return planApply({ markMissing: false, today: TODAY, newId: () => `new-${++ids}`, ...input });
}

function plan(input: Partial<PlanInput> & Pick<PlanInput, 'existing' | 'rows'>): ApplyPlan {
  const result = run(input);
  if (isRejected(result)) throw new Error(`план відхилено: ${result.rejected}`);
  return result;
}

function rejection(input: Partial<PlanInput> & Pick<PlanInput, 'existing' | 'rows'>): PlanRejection {
  const result = run(input);
  if (!isRejected(result)) throw new Error('очікували відмову');
  return result;
}

describe('звірка: нові позиції', () => {
  it('позиція, якої немає в каталозі, створюється з усіма полями рядка', () => {
    const row: PriceRow = {
      ...emptyRow('ab-100'),
      name: 'Змішувач Grohe',
      brand: 'Grohe',
      unitCode: 'шт.',
      purchasePrice: 1234.56789,
      rrp: 1999,
      stockQty: 3,
      multiplicity: 2,
      minOrderQty: 4,
      barcode: '4820000000001',
      categoryPath: 'Змішувачі / Кухня',
      imageUrls: ['https://img/1.jpg', 'https://img/1.jpg', 'ftp://bad', 'https://img/2.jpg'],
    };
    const result = plan({ existing: [], rows: [row], defaultCurrency: 'EUR' });
    expect(result.counters).toMatchObject({ added: 1, productsTotal: 1, changed: 0, missing: 0, skipped: 0 });
    expect(result.creates).toEqual([
      {
        id: 'new-1',
        sku: 'ab-100',
        skuKey: 'AB100',
        nameWork: 'Змішувач Grohe',
        brand: 'Grohe',
        unitCode: 'шт',
        currency: 'EUR',
        purchasePrice: 1234.5679,
        rrp: 1999,
        stockQty: 3,
        availability: 'low_stock',
        multiplicity: 2,
        minOrderQty: 4,
        barcode: '4820000000001',
        categoryPath: 'Змішувачі / Кухня',
        searchText: searchTextOf({ sku: 'ab-100', nameWork: 'Змішувач Grohe', brand: 'Grohe' }),
        imageUrls: ['https://img/1.jpg', 'https://img/2.jpg'],
      },
    ]);
    expect(result.historyEntries).toEqual([
      { productId: 'new-1', currency: 'EUR', purchasePrice: 1234.5679, rrp: 1999, stockQty: 3, availability: 'low_stock' },
    ]);
  });

  it('без назви назвою стає код; невідома одиниця лишається текстом; без цін історії немає', () => {
    const result = plan({ existing: [], rows: [{ ...emptyRow('X-1'), unitCode: 'бухта' }] });
    expect(result.creates[0]).toMatchObject({ nameWork: 'X-1', unitCode: 'бухта', availability: 'unknown', currency: 'UAH' });
    expect(result.historyEntries).toEqual([]);
  });
});

describe('звірка: ціни', () => {
  it('зростання й зниження рахуються окремо й пишуться в історію; дата ціни — усім знайденим', () => {
    const up = product();
    const down = product();
    const same = product();
    const result = plan({
      existing: [up, down, same],
      rows: [rowOf(up, { purchasePrice: 110 }), rowOf(down, { purchasePrice: 90, rrp: 140 }), rowOf(same)],
    });
    expect(result.counters).toMatchObject({ changed: 2, priceUp: 1, priceDown: 1, added: 0, productsTotal: 3, stockChanged: 0 });
    expect(result.historyEntries.map((h) => h.productId)).toEqual([up.id, down.id]);
    expect(result.updates.map((u) => u.id)).toEqual([up.id, down.id]);
    expect(result.updates[0]).toMatchObject({ purchasePrice: 110, rrp: 150 });
    expect(result.priceConfirmedIds).toEqual([up.id, down.id, same.id]);
  });

  it('звірка за нормалізованим кодом: регістр, пробіли, дефіси й кириличні двійники', () => {
    const p = product({ sku: 'CP-100' });
    const result = plan({ existing: [p], rows: [rowOf(p, { code: ' ср 100 ', purchasePrice: 120 })] });
    expect(result.creates).toEqual([]);
    expect(result.counters).toMatchObject({ changed: 1, priceUp: 1, relinked: 0 });
  });

  it('порожня ціна в рядку лишає збережену; напрям тоді — за РРЦ', () => {
    const p = product({ purchasePrice: 100, rrp: 150 });
    const result = plan({ existing: [p], rows: [rowOf(p, { purchasePrice: null, rrp: 160 })] });
    expect(result.updates[0]).toMatchObject({ purchasePrice: 100, rrp: 160 });
    expect(result.counters).toMatchObject({ changed: 1, priceUp: 1, priceDown: 0 });
    expect(result.historyEntries[0]).toMatchObject({ purchasePrice: 100, rrp: 160 });
  });

  it('обидві ціни порожні — нічого не змінилось', () => {
    const p = product();
    const result = plan({ existing: [p], rows: [rowOf(p, { purchasePrice: null, rrp: null })] });
    expect(result.counters.changed).toBe(0);
    expect(result.historyEntries).toEqual([]);
    expect(result.updates).toEqual([]);
  });

  it('округлення до 4 знаків: той самий прайс удруге не «змінює» ціну', () => {
    const p = product({ purchasePrice: 52.7654 });
    const result = plan({ existing: [p], rows: [rowOf(p, { purchasePrice: 52.76543 })] });
    expect(result.counters.changed).toBe(0);
    expect(result.updates).toEqual([]);
  });

  it('зміна валюти — зміна ціни без напряму', () => {
    const p = product({ currency: 'UAH', purchasePrice: 100 });
    const result = plan({ existing: [p], rows: [rowOf(p, { currency: 'USD', purchasePrice: 3 })] });
    expect(result.counters).toMatchObject({ changed: 1, priceUp: 0, priceDown: 0 });
    expect(result.historyEntries[0]).toMatchObject({ currency: 'USD', purchasePrice: 3 });
  });

  it('ручну ціну наступне завантаження прайсу замінює (ІМП-6)', () => {
    const manual = product({ priceOrigin: 'manual', purchasePrice: 500, stockQty: 1 });
    const result = plan({ existing: [manual], rows: [rowOf(manual, { purchasePrice: 400, rrp: 600, stockQty: 30 })] });
    expect(result.updates[0]).toMatchObject({ purchasePrice: 400, rrp: 600, stockQty: 30 });
    expect(result.priceConfirmedIds).toEqual([manual.id]);
    expect(result.historyEntries.length).toBe(1);
  });

  it('товар, доданий вручну, з\'явився в прайсі, що веде асортимент: далі його веде прайс', () => {
    const manual = product({ priceOrigin: 'manual', purchasePrice: 500 });
    const full = plan({ existing: [manual], rows: [rowOf(manual, { purchasePrice: 400 })] });
    expect(full.adoptedIds).toEqual([manual.id]);
    expect(full.counters.productsTotal).toBe(1);
    expect(full.notes).toEqual(['Товарів, доданих вручну, знайдено в прайсі: 1. Далі їх веде прайс']);
    // файл лише з цінами (гібрид) асортимент не веде: ціни оновлює, але товар лишається «вручну»
    const pricesOnly = plan({ existing: [manual], rows: [rowOf(manual, { purchasePrice: 400 })], roles: HYBRID_FILE });
    expect(pricesOnly.adoptedIds).toEqual([]);
    expect(pricesOnly.updates[0]).toMatchObject({ purchasePrice: 400 });
  });

  it('одна велика зміна застосовується, але потрапляє у звіт', () => {
    const big = product({ purchasePrice: 100 });
    const others = Array.from({ length: 5 }, () => product());
    const result = plan({
      existing: [big, ...others],
      rows: [rowOf(big, { purchasePrice: 180 }), ...others.map((p) => rowOf(p))],
    });
    expect(result.updates[0]).toMatchObject({ id: big.id, purchasePrice: 180 });
    expect(result.report.bigPriceChanges).toEqual({
      total: 1,
      sample: [{ code: big.sku, field: 'purchasePrice', old: 100, new: 180, pct: 80 }],
    });
  });
});

describe('звірка: наявність', () => {
  it('зміна залишку рахується, але в історію цін не пишеться', () => {
    const p = product({ stockQty: 10, availability: 'in_stock' });
    const result = plan({ existing: [p], rows: [rowOf(p, { stockQty: 0, availability: null })] });
    expect(result.counters).toMatchObject({ stockChanged: 1, changed: 0 });
    expect(result.updates[0]).toMatchObject({ stockQty: 0, availability: 'out_of_stock' });
    expect(result.historyEntries).toEqual([]);
  });

  it('статус без кількості (діапазон SANWELL) прибирає збережену кількість', () => {
    const p = product({ stockQty: 40, availability: 'in_stock' });
    const result = plan({ existing: [p], rows: [rowOf(p, { stockQty: null, availability: 'low_stock' })] });
    expect(result.updates[0]).toMatchObject({ stockQty: null, availability: 'low_stock' });
  });

  it('про наявність рядок мовчить (у файлі немає колонки) — лишається збережена', () => {
    const p = product({ stockQty: 7 });
    const result = plan({ existing: [p], rows: [rowOf(p, { stockQty: null, availability: null })] });
    expect(result.counters.stockChanged).toBe(0);
    expect(result.updates).toEqual([]);
  });

  it('джерело без ролі stock наявність не змінює', () => {
    const p = product({ stockQty: 7 });
    const result = plan({ existing: [p], rows: [rowOf(p, { stockQty: 0 })], roles: { ...FULL_ROLES, stock: false } });
    expect(result.counters.stockChanged).toBe(0);
    expect(result.updates).toEqual([]);
  });
});

describe('звірка: описи не перезаписуються', () => {
  it('заповнені назва, бренд і категорія лишаються; різниця йде у звіт', () => {
    const p = product({ nameWork: 'Кран кульовий 1/2', brand: 'Valtec', categoryPath: 'Крани' });
    const result = plan({
      existing: [p],
      rows: [rowOf(p, { name: 'Кран латунний', brand: 'Grohe', categoryPath: 'Арматура / Крани' })],
    });
    expect(result.updates).toEqual([]);
    expect(result.counters.detailsDiffer).toBe(1);
    expect(result.report.detailsDiffer.total).toBe(3);
    expect(result.report.detailsDiffer.sample).toEqual([
      { code: p.sku, field: 'nameWork', catalog: 'Кран кульовий 1/2', price: 'Кран латунний' },
      { code: p.sku, field: 'brand', catalog: 'Valtec', price: 'Grohe' },
      { code: p.sku, field: 'categoryPath', catalog: 'Крани', price: 'Арматура / Крани' },
    ]);
  });

  it('порожні поля заповнюються з прайсу, пошуковий текст — за новими значеннями', () => {
    const p = product({ brand: null, barcode: null, categoryPath: null, minOrderQty: null });
    const result = plan({
      existing: [p],
      rows: [rowOf(p, { brand: 'Grohe', barcode: '4820000000001', categoryPath: 'Змішувачі', minOrderQty: 5 })],
    });
    expect(result.updates[0]).toMatchObject({ brand: 'Grohe', barcode: '4820000000001', categoryPath: 'Змішувачі', minOrderQty: 5 });
    expect(result.updates[0].searchText).toContain('grohe');
    expect(result.counters.detailsDiffer).toBe(0);
  });

  it('назва-заглушка (дорівнює коду) заповнюється', () => {
    const p = product({ sku: 'X-1', nameWork: 'X-1' });
    const result = plan({ existing: [p], rows: [rowOf(p, { name: 'Труба PPR 20' })] });
    expect(result.updates[0].nameWork).toBe('Труба PPR 20');
  });

  it('різниця лише в регістрі чи пробілах — не різниця', () => {
    const p = product({ nameWork: 'Кран  кульовий', brand: 'GROHE' });
    const result = plan({ existing: [p], rows: [rowOf(p, { name: 'кран кульовий ', brand: 'Grohe' })] });
    expect(result.counters.detailsDiffer).toBe(0);
    expect(result.updates).toEqual([]);
  });

  it('одиниця, кратність і мінімальна партія: заповнене значення лишається, різниця у звіті', () => {
    const p = product({ unitCode: 'шт', multiplicity: 1, minOrderQty: 2 });
    const result = plan({ existing: [p], rows: [rowOf(p, { unitCode: 'м.п.', multiplicity: 6, minOrderQty: 12 })] });
    expect(result.updates).toEqual([]);
    expect(result.report.detailsDiffer.sample.map((d) => [d.field, d.catalog, d.price])).toEqual([
      ['unitCode', 'шт', 'м'],
      ['multiplicity', '1', '6'],
      ['minOrderQty', '2', '12'],
    ]);
  });

  it('звіт обмежено прикладами, але загальна кількість повна', () => {
    const items = Array.from({ length: REPORT_SAMPLE + 5 }, () => product({ brand: 'Valtec' }));
    const result = plan({ existing: items, rows: items.map((p) => rowOf(p, { brand: 'Grohe' })) });
    expect(result.counters.detailsDiffer).toBe(REPORT_SAMPLE + 5);
    expect(result.report.detailsDiffer.total).toBe(REPORT_SAMPLE + 5);
    expect(result.report.detailsDiffer.sample).toHaveLength(REPORT_SAMPLE);
  });
});

describe('звірка: фото', () => {
  it('наявному товару без фото фото з прайсу додаються; з фото — ні', () => {
    const bare = product({ hasImages: false });
    const withImages = product({ hasImages: true });
    const urls = ['https://img/a.jpg', 'https://img/b.jpg'];
    const result = plan({ existing: [bare, withImages], rows: [rowOf(bare, { imageUrls: urls }), rowOf(withImages, { imageUrls: urls })] });
    expect(result.imageAttachments).toEqual([{ productId: bare.id, urls }]);
  });

  it('джерело без ролі assortment фото не додає', () => {
    const bare = product();
    const result = plan({ existing: [bare], rows: [rowOf(bare, { imageUrls: ['https://img/a.jpg'] })], roles: HYBRID_FILE });
    expect(result.imageAttachments).toEqual([]);
  });
});

describe('звірка: «немає у прайсі» й архів', () => {
  it('відсутні позиції позначаються сьогоднішньою датою, раніша дата лишається', () => {
    const present = product();
    const absent = product();
    const absentEarlier = product({ missingSince: '2026-09-01' });
    const archivedAbsent = product({ isArchived: true });
    const manualAbsent = product({ priceOrigin: 'manual' });
    const result = plan({
      existing: [present, absent, absentEarlier, archivedAbsent, manualAbsent],
      rows: [rowOf(present), rowOf(product())],
      markMissing: true,
    });
    expect(result.counters.missing).toBe(2);
    expect(result.missingMarks).toEqual([absent.id]);
  });

  it('без markMissing відсутні не позначаються', () => {
    const present = product();
    const absent = product();
    const result = plan({ existing: [present, absent], rows: [rowOf(present)] });
    expect(result.counters.missing).toBe(0);
    expect(result.missingMarks).toEqual([]);
  });

  it('позиція повернулась у прайс — позначку прибираємо', () => {
    const back = product({ missingSince: '2026-09-01' });
    const result = plan({ existing: [back], rows: [rowOf(back)], markMissing: true });
    expect(result.missingClears).toEqual([back.id]);
  });

  it('архівована автоматично повертається з архіву, архівована вручну — лишається', () => {
    const autoArchived = product({ isArchived: true, autoArchived: true, missingSince: '2026-08-01' });
    const manuallyArchived = product({ isArchived: true });
    const result = plan({ existing: [autoArchived, manuallyArchived], rows: [rowOf(autoArchived), rowOf(manuallyArchived, { purchasePrice: 101 })] });
    expect(result.counters.restored).toBe(1);
    expect(result.updates).toEqual([
      expect.objectContaining({ id: autoArchived.id, isArchived: false }),
      expect.objectContaining({ id: manuallyArchived.id, isArchived: true, purchasePrice: 101 }),
    ]);
    expect(result.missingClears).toEqual([autoArchived.id]);
  });
});

describe('звірка: ролі змішаного джерела', () => {
  it('посилання hybrid: асортимент, наявність і РРЦ оновлюються, вхідна ціна — ні', () => {
    const p = product({ purchasePrice: 100, stockQty: 1 });
    const absent = product();
    const result = plan({
      existing: [p, absent],
      rows: [rowOf(p, { purchasePrice: 999, rrp: 180, stockQty: 50 }), { ...emptyRow('NEW-1'), rrp: 10 }],
      roles: HYBRID_LINK,
      markMissing: true,
    });
    expect(result.updates[0]).toMatchObject({ purchasePrice: 100, rrp: 180, stockQty: 50 });
    expect(result.counters).toMatchObject({ changed: 1, stockChanged: 1, added: 1, missing: 1 });
    // «ціну перевірено» ставить лише джерело вхідної ціни
    expect(result.priceConfirmedIds).toEqual([]);
    expect(result.missingMarks).toEqual([absent.id]);
  });

  it('посилання hybrid не змінює валюту й не пише РРЦ у чужій валюті', () => {
    const p = product({ currency: 'EUR', purchasePrice: 10, rrp: 20 });
    const result = plan({ existing: [p], rows: [rowOf(p, { currency: 'UAH', purchasePrice: null, rrp: 900 })], roles: HYBRID_LINK });
    expect(result.updates).toEqual([]);
    expect(result.counters.changed).toBe(0);
  });

  it('файл hybrid: РРЦ лише заповнює порожню, заповнену веде посилання', () => {
    const withRrp = product({ rrp: 150 });
    const noRrp = product({ rrp: null });
    const result = plan({
      existing: [withRrp, noRrp],
      rows: [rowOf(withRrp, { purchasePrice: 110, rrp: 999 }), rowOf(noRrp, { rrp: 175 })],
      roles: HYBRID_FILE,
    });
    expect(result.updates.find((u) => u.id === withRrp.id)).toMatchObject({ purchasePrice: 110, rrp: 150 });
    expect(result.updates.find((u) => u.id === noRrp.id)).toMatchObject({ rrp: 175 });
    expect(result.priceConfirmedIds).toEqual([withRrp.id, noRrp.id]);
  });

  it('файл hybrid: ціни й наявність оновлюються, нових не створює й зниклих не позначає', () => {
    const p = product({ purchasePrice: 100, brand: 'Valtec' });
    const absent = product();
    const back = product({ missingSince: '2026-09-01' });
    const result = plan({
      existing: [p, absent, back],
      rows: [rowOf(p, { purchasePrice: 120, brand: 'Grohe' }), rowOf(back), { ...emptyRow('NEW-1'), name: 'Новинка', purchasePrice: 5 }],
      roles: HYBRID_FILE,
      markMissing: true,
    });
    expect(result.creates).toEqual([]);
    expect(result.updates[0]).toMatchObject({ purchasePrice: 120, brand: 'Valtec' });
    expect(result.counters).toMatchObject({ changed: 1, added: 0, missing: 0, skipped: 1, detailsDiffer: 0 });
    expect(result.missingMarks).toEqual([]);
    expect(result.missingClears).toEqual([]);
    expect(result.report.notFound).toEqual({ total: 1, sample: [{ row: 3, code: 'NEW-1', name: 'Новинка' }] });
  });
});

describe('звірка: запасна звірка за штрихкодом і артикулом', () => {
  it('код змінився, штрихкод збігся з одним товаром — перечіплюємо на новий код', () => {
    const p = product({ sku: 'OLD-1', barcode: '4820000000001' });
    const result = plan({ existing: [p], rows: [rowOf(p, { code: 'NEW-1', barcode: '4820 0000 00001', purchasePrice: 110 })] });
    expect(result.creates).toEqual([]);
    expect(result.counters).toMatchObject({ relinked: 1, changed: 1, added: 0 });
    expect(result.updates[0]).toMatchObject({ id: p.id, sku: 'NEW-1', skuKey: 'NEW1', purchasePrice: 110 });
    expect(result.updates[0].searchText).toContain('new-1');
    expect(result.report.relinked.sample).toEqual([{ code: 'NEW-1', previousSku: 'OLD-1', by: 'barcode' }]);
  });

  it('артикул у рядку збігся з кодом товару в каталозі — теж перечіплюємо', () => {
    const p = product({ sku: 'ART-77' });
    const result = plan({ existing: [p], rows: [rowOf(p, { code: '100500', sku: 'art 77' })] });
    expect(result.counters.relinked).toBe(1);
    expect(result.updates[0]).toMatchObject({ sku: '100500', skuKey: '100500' });
    expect(result.report.relinked.sample[0].by).toBe('article');
  });

  it('кілька товарів з тим самим штрихкодом — не вгадуємо, рядок пропускаємо', () => {
    const a = product({ barcode: '4820000000001' });
    const b = product({ barcode: '4820000000001' });
    const result = plan({ existing: [a, b], rows: [{ ...emptyRow('NEW-1'), barcode: '4820000000001' }] });
    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.counters).toMatchObject({ relinked: 0, skipped: 1, added: 0 });
    expect(result.report.skippedRows.sample).toEqual([{ row: 1, code: 'NEW-1', reason: SKIP_REASONS.ambiguous }]);
  });

  it('два рядки претендують на один товар — обидва пропускаємо', () => {
    const p = product({ barcode: '4820000000001' });
    const result = plan({
      existing: [p],
      rows: [
        { ...emptyRow('NEW-1'), barcode: '4820000000001' },
        { ...emptyRow('NEW-2'), barcode: '4820000000001' },
      ],
    });
    expect(result.counters).toMatchObject({ relinked: 0, skipped: 2, added: 0 });
    expect(result.creates).toEqual([]);
  });

  it('товар, якому вже знайшовся рядок за кодом, у запасну звірку не йде', () => {
    const p = product({ sku: 'A-1', barcode: '4820000000001' });
    const result = plan({ existing: [p], rows: [rowOf(p), { ...emptyRow('B-2'), barcode: '4820000000001' }] });
    expect(result.counters).toMatchObject({ relinked: 0, added: 1 });
    expect(result.creates[0].sku).toBe('B-2');
  });

  it('файл без ролі assortment знаходить товар за штрихкодом, але код не змінює', () => {
    const p = product({ sku: 'OLD-1', barcode: '4820000000001', purchasePrice: 100 });
    const result = plan({
      existing: [p],
      rows: [rowOf(p, { code: 'NEW-1', barcode: '4820000000001', purchasePrice: 105 })],
      roles: HYBRID_FILE,
    });
    expect(result.updates[0]).toMatchObject({ sku: 'OLD-1', skuKey: 'OLD1', purchasePrice: 105 });
    expect(result.counters.relinked).toBe(0);
  });
});

describe('звірка: рядки без коду й повтори', () => {
  it('рядок без коду пропускається, повтор коду — діє останній; усе у звіті', () => {
    const p = product();
    const result = plan({
      existing: [p],
      rows: [emptyRow('  '), rowOf(p, { purchasePrice: 120 }), rowOf(p, { purchasePrice: 130 })],
    });
    expect(result.counters).toMatchObject({ skipped: 2, changed: 1, productsTotal: 1 });
    expect(result.updates[0].purchasePrice).toBe(130);
    expect(result.report.skippedRows.sample).toEqual([
      { row: 1, code: '  ', reason: SKIP_REASONS.noCode },
      { row: 2, code: p.sku, reason: SKIP_REASONS.duplicate },
    ]);
  });
});

describe('звірка: захист від підозрілого прайсу', () => {
  it('порожній прайс не застосовується', () => {
    expect(rejection({ existing: [product()], rows: [], markMissing: true }).rejected).toMatch(/немає жодної позиції/u);
    expect(rejection({ existing: [], rows: [emptyRow('')] }).rejected).toMatch(/немає жодної позиції/u);
  });

  it('менше половини каталогу — відмова з поясненням; рівно половина — застосовується', () => {
    const existing = Array.from({ length: 10 }, () => product());
    expect(rejection({ existing, rows: existing.slice(0, 4).map((p) => rowOf(p)), markMissing: true }).rejected).toMatch(
      /4 поз\. проти 10/u,
    );
    expect(plan({ existing, rows: existing.slice(0, 5).map((p) => rowOf(p)), markMissing: true }).counters).toMatchObject({
      productsTotal: 5,
      missing: 5,
    });
  });

  it('короткий файл без позначення відсутніх (частина цін) застосовується', () => {
    const existing = Array.from({ length: 10 }, () => product());
    const result = plan({ existing, rows: existing.slice(0, 2).map((p) => rowOf(p)), markMissing: false });
    expect(result.counters).toMatchObject({ missing: 0 });
  });

  it('товари з ручною ціною й архівні в поріг не входять; новий постачальник приймає будь-який прайс', () => {
    const imported = [product(), product()];
    const others = [
      ...Array.from({ length: 5 }, () => product({ priceOrigin: 'manual' })),
      ...Array.from({ length: 5 }, () => product({ isArchived: true })),
    ];
    expect(isRejected(run({ existing: [...imported, ...others], rows: [rowOf(imported[0])], markMissing: true }))).toBe(false);
    expect(isRejected(run({ existing: [], rows: [emptyRow('A1')], markMissing: true }))).toBe(false);
  });

  it('понад 30% позицій змінили ціну більш ніж на 50% — прайс не застосовується, звіт лишається', () => {
    const items = Array.from({ length: 30 }, () => product({ purchasePrice: 100 }));
    const rows = items.map((p, i) => rowOf(p, { purchasePrice: i < 10 ? 1000 : 100 }));
    const result = rejection({ existing: items, rows });
    expect(result.rejected).toMatch(/Ціна змінилась більш ніж на 50% у 10 з 30 позицій \(33%\)/u);
    expect(result.rejected).toMatch(/змінився формат або валюта прайсу/u);
    expect(result.report?.bigPriceChanges.total).toBe(10);
    expect(result.counters?.changed).toBe(10);
  });

  it('рівно 30% великих змін — ще застосовується', () => {
    const items = Array.from({ length: 40 }, () => product({ purchasePrice: 100 }));
    const rows = items.map((p, i) => rowOf(p, { purchasePrice: i < 12 ? 40 : 100 }));
    const result = plan({ existing: items, rows });
    expect(result.counters).toMatchObject({ changed: 12, priceDown: 12 });
    expect(result.report.bigPriceChanges.sample[0]).toMatchObject({ old: 100, new: 40, pct: -60 });
  });

  it('у маленькому прайсі кілька великих змін не вважаються масовими', () => {
    const items = Array.from({ length: 6 }, () => product({ purchasePrice: 100 }));
    const result = plan({ existing: items, rows: items.map((p) => rowOf(p, { purchasePrice: 300 })) });
    expect(result.counters.changed).toBe(6);
  });

  it('масова зміна валюти — прайс не застосовується', () => {
    const items = Array.from({ length: 20 }, () => product({ currency: 'UAH' }));
    const rows = items.map((p, i) => rowOf(p, { currency: i < 10 ? 'USD' : 'UAH' }));
    expect(rejection({ existing: items, rows }).rejected).toMatch(/Валюта змінилась у 10 з 20 позицій \(50%\)/u);
  });

  it('посилання hybrid ціни не веде — масові зміни цін у ньому ні на що не впливають', () => {
    const items = Array.from({ length: 20 }, () => product({ purchasePrice: 100 }));
    const result = plan({ existing: items, rows: items.map((p) => rowOf(p, { purchasePrice: 900 })), roles: HYBRID_LINK });
    expect(result.counters.changed).toBe(0);
  });
});

describe('звірка: попередній розрахунок', () => {
  it('план — чиста функція: ті самі дані дають ті самі лічильники, вхід не змінюється', () => {
    const up = product();
    const existing = [up, product()];
    const snapshot = structuredClone(existing);
    const rows = [rowOf(up, { purchasePrice: 120, stockQty: 1 }), emptyRow('NEW-1')];
    const first = plan({ existing, rows, markMissing: true });
    const second = plan({ existing, rows, markMissing: true });
    expect(first.counters).toEqual({
      productsTotal: 2,
      added: 1,
      changed: 1,
      priceUp: 1,
      priceDown: 0,
      stockChanged: 1,
      missing: 1,
      skipped: 0,
      relinked: 0,
      restored: 0,
      detailsDiffer: 0,
    });
    expect(second.counters).toEqual(first.counters);
    expect(existing).toEqual(snapshot);
  });
});
