// Що оновлюється в постачальника: вибір «Ціна у вигрузці» у формі джерела (13.10), рядки картки й таблиця
// «Що оновлюється» в «Детальніше» (16.10). Ролі приходять із сервера (rolesFor + ціни вигрузки).
import { describe, expect, it } from 'vitest';
import type { PriceSourceRoles, SupplierPriceSource, SupplierPriceSourceSettings } from '@shared/types';
import { buildPriceSourceInput, linkPriceHint, toFormValues } from '../PriceSourceDialog';
import { lacksPurchasePrice, lastRunLabel, priceSourceLabel, sourceFieldRows, sourceLines } from '../supplierView';

const FULL: PriceSourceRoles = { purchasePrice: true, rrp: 'set', stock: true, assortment: true };
const HYBRID_LINK: PriceSourceRoles = { purchasePrice: false, rrp: 'set', stock: true, assortment: true };
const HYBRID_FILE: PriceSourceRoles = { purchasePrice: true, rrp: 'fill', stock: true, assortment: false };

const source = (patch: Partial<SupplierPriceSource>): SupplierPriceSource => ({
  kind: 'auto',
  connector: 'yml',
  host: 'feed.example',
  scheduleHour: 6,
  hasPurchasePrice: true,
  note: null,
  lastError: null,
  lastErrorAt: null,
  failCount: 0,
  linkRoles: FULL,
  fileRoles: FULL,
  lastLinkAt: null,
  lastFileAt: null,
  ...patch,
});

const hybrid = (patch: Partial<SupplierPriceSource> = {}) =>
  source({ kind: 'hybrid', connector: 'sanwell', linkRoles: HYBRID_LINK, fileRoles: HYBRID_FILE, ...patch });
const manual = (patch: Partial<SupplierPriceSource> = {}) =>
  source({ kind: 'manual', connector: null, scheduleHour: null, linkRoles: null, ...patch });

const current = (patch: Partial<SupplierPriceSource>): SupplierPriceSourceSettings => ({
  ...source(patch),
  auth: 'none',
  hasUrl: true,
  hasSecret: false,
});

type FormValues = Parameters<typeof buildPriceSourceInput>[0];
const form = (patch: Partial<FormValues>): FormValues => ({
  kind: 'auto',
  connector: 'yml',
  url: '',
  auth: 'none',
  login: '',
  secret: '',
  scheduleHour: 6,
  hasPurchasePrice: undefined,
  note: '',
  ...patch,
});

describe('картка: що оновлює посилання і що файл', () => {
  it('«Гібрид»: посилання — РРЦ, наявність, асортимент; файл — лише вхідні; дати окремо', () => {
    const lines = sourceLines(hybrid({ lastLinkAt: '2026-10-16T03:00:00.000Z' }));
    expect(lines.map((l) => [l.label, l.what])).toEqual([
      ['За посиланням', 'РРЦ, наявність, нові й зниклі товари'],
      ['Файлом', 'вхідні ціни'],
    ]);
    expect(lines[0].at).toBe('2026-10-16T03:00:00.000Z');
    expect(lastRunLabel(lines[1])).toBe('ще не завантажували');
  });

  it('«За посиланням» — лише рядок посилання; «Файлом» — лише рядок файлу', () => {
    expect(sourceLines(source({})).map((l) => [l.label, l.what])).toEqual([['За посиланням', 'вхідні ціни, РРЦ, наявність, нові й зниклі товари']]);
    expect(sourceLines(manual()).map((l) => [l.label, l.what])).toEqual([['Файлом', 'вхідні ціни, РРЦ, наявність, нові товари']]);
    expect(lastRunLabel(sourceLines(source({}))[0])).toBe('ще не оновлювалось');
  });

  it('«вхідних цін немає» — лише за посиланням без вхідних у вигрузці', () => {
    expect(lacksPurchasePrice(source({ linkRoles: HYBRID_LINK }))).toBe(true);
    expect(lacksPurchasePrice(source({}))).toBe(false);
    expect(lacksPurchasePrice(hybrid())).toBe(false);
    expect(lacksPurchasePrice(manual())).toBe(false);
  });

  it('у назві джерела — режим, підключення й година', () => {
    expect(priceSourceLabel(source({ kind: 'hybrid' }))).toBe('Гібрид · Стандартний YML (Prom / Rozetka) · щодня о 06:00');
    expect(priceSourceLabel(manual())).toBe('Вручну');
  });
});

describe('«Детальніше»: таблиця «Що оновлюється»', () => {
  const how = (s: SupplierPriceSource) => Object.fromEntries(sourceFieldRows(s).map((r) => [r.field, r.how]));

  it('«Гібрид»: вхідні файлом, РРЦ за посиланням (файл лише заповнює порожню)', () => {
    const rows = how(hybrid());
    expect(rows['Вхідна ціна']).toBe('файлом («Завантажити прайс»)');
    expect(rows['РРЦ']).toBe('за посиланням щодня о 06:00; файл лише заповнює порожню');
    expect(rows['Наявність']).toBe('за посиланням щодня о 06:00; файл теж, якщо в ньому є залишки');
    expect(rows['Фото й описи']).toBe(
      'за посиланням, лише де порожньо; замінити: «Оновити вручну» → «Замінити з прайсу» або ті самі галочки при завантаженні файлу',
    );
  });

  it('«За посиланням» без вхідних у вигрузці: вхідні можна довантажити файлом', () => {
    expect(how(source({ linkRoles: HYBRID_LINK }))['Вхідна ціна']).toBe('у вигрузці немає, можна файлом');
    // «За посиланням» наявність веде посилання; файл тут — запасний шлях, у таблиці не згадується
    expect(how(source({}))['Наявність']).toBe('за посиланням щодня о 06:00');
    // одна ціна YML прочитана як вхідна — РРЦ у вигрузці немає
    expect(how(source({ linkRoles: { ...FULL, rrp: 'none' } }))['РРЦ']).toBe('у вигрузці немає, можна файлом');
  });

  it('«Файлом»: усе з файлу, зниклі — з галочкою', () => {
    const rows = how(manual());
    expect(rows['Вхідна ціна']).toBe('файлом («Завантажити прайс»)');
    expect(rows['Нові товари, «немає у прайсі»']).toBe('файлом: нові додаються, відсутні з галочкою «Позначити зниклі»');
    expect(rows['Назви, бренд, одиниці']).toBe(
      'самі не змінюються, порожні заповнюються з прайсу; замінити: галочки «Замінити з прайсу» при завантаженні',
    );
  });
});

describe('підказка під «Ціною у вигрузці» — за вибраним варіантом', () => {
  it('не вибрано — що означає кожен варіант; «РРЦ» — вхідні не оновлюються; «Вхідна» — що саме оновлюється', () => {
    expect(linkPriceHint('one', undefined)).toBe(
      '«Вхідна»: ціна у вигрузці закупівельна. «РРЦ»: ціна у вигрузці роздрібна, вхідні за посиланням не оновлюються.',
    );
    expect(linkPriceHint('both', false)).toBe('Посилання оновлює РРЦ, вхідні ціни ні. Якщо вхідні будуть файлом, оберіть «Гібрид».');
    expect(linkPriceHint('both', true)).toBe('Посилання щодня оновлює і вхідні ціни, і РРЦ.');
    expect(linkPriceHint('one', true)).toBe('Посилання щодня оновлює вхідні ціни. РРЦ у цій вигрузці немає, її можна завантажити файлом.');
  });
});

describe('«Ціна у вигрузці» при відкритті форми', () => {
  it('«За посиланням» — збережений вибір; «Гібрид» і «Файлом» — не вибрано (там поле не показувалось)', () => {
    expect(toFormValues(current({ hasPurchasePrice: false })).hasPurchasePrice).toBe(false);
    expect(toFormValues(current({ kind: 'hybrid', hasPurchasePrice: true })).hasPurchasePrice).toBeUndefined();
    expect(toFormValues(current({ kind: 'manual', connector: null, hasPurchasePrice: true })).hasPurchasePrice).toBeUndefined();
  });

  it('посилання: адміністратор бачить збережене, без нього поле порожнє («лишити як є»)', () => {
    expect(toFormValues({ ...current({}), url: 'https://feed.example/price.xml?key=k' }).url).toBe('https://feed.example/price.xml?key=k');
    expect(toFormValues(current({})).url).toBe('');
  });
});

describe('«Ціна у вигрузці» при збереженні джерела', () => {
  it('«За посиланням» — як вибрано', () => {
    expect(buildPriceSourceInput(form({ hasPurchasePrice: false }), current({})).hasPurchasePrice).toBe(false);
    expect(buildPriceSourceInput(form({ hasPurchasePrice: true }), current({ hasPurchasePrice: false })).hasPurchasePrice).toBe(true);
  });

  it('вигрузка лише з РРЦ — завжди без вхідних', () => {
    expect(buildPriceSourceInput(form({ connector: 'sanwell', hasPurchasePrice: undefined }), current({})).hasPurchasePrice).toBe(false);
  });

  it('«Гібрид» і «Файлом» збережене значення не змінюють', () => {
    expect(buildPriceSourceInput(form({ kind: 'hybrid', hasPurchasePrice: undefined }), current({ hasPurchasePrice: true })).hasPurchasePrice).toBe(true);
    expect(buildPriceSourceInput(form({ kind: 'manual', hasPurchasePrice: undefined }), current({ hasPurchasePrice: false })).hasPurchasePrice).toBe(false);
  });
});
