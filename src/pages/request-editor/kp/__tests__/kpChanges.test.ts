// Попередження «після КП … змінились: …» (правки замовника 28.09 п.5): ціни й усе, що видно в бланку.
import { describe, expect, it } from 'vitest';
import { buildKpSnapshot, kpBuyerOf } from '@shared/pricing';
import type { KpRow, KpSettings } from '@shared/types';
import { kpChangesSince } from '../kpChanges';

const rows: KpRow[] = [
  { n: 1, lineId: 'L1', code: 'A1', imagePath: null, name: 'Змішувач', nameSecondary: null, unit: 'шт', qty: 2, price: 100, sum: 200 },
  { n: 2, lineId: 'L2', code: 'B2', imagePath: null, name: 'Труба', nameSecondary: null, unit: 'м', qty: 120, price: 10.5, sum: 1260 },
];
const seller = {
  nameShort: 'ТОВ «ДЕМО»',
  nameFull: 'ТОВ «ДЕМО ТРЕЙД»',
  edrpou: '40000001',
  ipn: '400000010001',
  isVatPayer: true,
  iban: 'UA21',
  bankName: 'АТ «БАНК»',
  addressLegal: 'м. Київ',
  phone: '044',
  email: 'sales@demo.example',
  website: 'demo.example',
  slogan: null,
  logoUrl: null,
  kpFooter: null,
};
const input: Parameters<typeof buildKpSnapshot>[0] = {
  kpNumber: 2114,
  requestNumber: 7,
  date: '2026-09-28',
  settings: { vatMode: 'without_vat', showImages: false, showManager: true, validityDays: 3, extraInfo: null },
  vatRatePct: 20,
  rows,
  seller,
  buyer: kpBuyerOf({ nameShort: 'ТОВ «КЛІЄНТ»', edrpou: '41000011' }, 'Клієнт', null),
  managerName: 'Адмін.',
  terms: [{ label: 'Умови оплати', value: '100 % передоплата' }],
};
const settings = { validityDays: 3 } as KpSettings;
const base = { snapshot: buildKpSnapshot(input), settings };

describe('зміни після сформованої версії КП', () => {
  it('нічого не змінилось — попередження немає (дата «дійсна до» від сьогодні не рахується)', () => {
    expect(kpChangesSince(base, buildKpSnapshot({ ...input, date: '2026-09-30' }), 3)).toEqual([]);
  });

  it('збережена версія з бази — поля в іншому порядку (JSONB), це не зміна', () => {
    const sortKeys = (o: object) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
    const fromDb = { ...base.snapshot, seller: sortKeys(base.snapshot.seller) as typeof base.snapshot.seller, buyer: sortKeys(base.snapshot.buyer) as typeof base.snapshot.buyer };
    expect(kpChangesSince({ snapshot: fromDb, settings }, buildKpSnapshot(input), 3)).toEqual([]);
  });

  it('зняли галочку «менеджер» після формування — видно, що змінилось', () => {
    const preview = buildKpSnapshot({ ...input, settings: { ...input.settings, showManager: false } });
    expect(kpChangesSince(base, preview, 3)).toEqual(['менеджер']);
  });

  it('ціни, фото, умови, строк, дод. інформація — усе в порядку бланка', () => {
    const preview = buildKpSnapshot({
      ...input,
      settings: { ...input.settings, showImages: true, extraInfo: 'Доставка безкоштовна' },
      rows: [rows[0]!, { ...rows[1]!, price: 11, sum: 1320 }],
      terms: [{ label: 'Умови оплати', value: '50 % передоплата' }],
    });
    expect(kpChangesSince(base, preview, 5)).toEqual(['ціни чи кількості', 'фото', 'строк дії', 'умови', 'дод. інформація']);
  });

  it('шапка чи підпис нашої юрособи змінились у картці — «наша юрособа»; у старому знімку немає поля — це не зміна', () => {
    expect(kpChangesSince(base, buildKpSnapshot({ ...input, seller: { ...seller, phone: '067 111 22 33' } }), 3)).toEqual(['наша юрособа']);
    expect(kpChangesSince(base, buildKpSnapshot({ ...input, seller: { ...seller, kpFooter: 'Дякуємо!' } }), 3)).toEqual(['примітка']);
    // печатку додали в картку юрособи після КП
    expect(kpChangesSince(base, buildKpSnapshot({ ...input, seller: { ...seller, stampUrl: 'data:image/png;base64,ST' } }), 3)).toEqual(['печатка']);
    // спільний логотип з Налаштувань — окремим словом, не «наша юрособа»
    expect(kpChangesSince(base, buildKpSnapshot({ ...input, logoUrl: 'data:image/png;base64,AAA' }), 3)).toEqual(['логотип']);
    // КП до 29.09 без примітки, у новому бланку типова примітка — не зміна
    expect(kpChangesSince({ snapshot: { ...base.snapshot, footer: null }, settings }, buildKpSnapshot(input), 3)).toEqual([]);
    const { slogan: _omit, ...oldHeader } = base.snapshot.header;
    expect(kpChangesSince({ snapshot: { ...base.snapshot, header: oldHeader as typeof base.snapshot.header }, settings }, buildKpSnapshot(input), 3)).toEqual([]);
  });

  it('інша кількість позицій, назви, покупець, режим ПДВ', () => {
    expect(kpChangesSince(base, buildKpSnapshot({ ...input, rows: [rows[0]!] }), 3)).toEqual(['кількість позицій']);
    expect(kpChangesSince(base, buildKpSnapshot({ ...input, rows: [{ ...rows[0]!, name: 'Змішувач (1С)' }, rows[1]!] }), 3)).toEqual(['назви товарів']);
    expect(kpChangesSince(base, buildKpSnapshot({ ...input, buyer: kpBuyerOf(null, 'Інший клієнт', null) }), 3)).toEqual(['покупець']);
    expect(kpChangesSince(base, buildKpSnapshot({ ...input, settings: { ...input.settings, vatMode: 'with_vat' } }), 3)).toContain('ціни з ПДВ чи без');
  });
});
