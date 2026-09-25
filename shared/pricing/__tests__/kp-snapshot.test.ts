import { describe, expect, it } from 'vitest';
import type { KpRow } from '../../types';
import {
  addDaysIso,
  approvedTotalsFromKp,
  buildFinalKpSnapshot,
  buildKpSnapshot,
  kpBlockReason,
  kpBuyerOf,
  kpChecks,
  kpManagerName,
  kpNumberLabel,
  kpSellerBlock,
  latestBaseKp,
} from '../kp-snapshot';
import { DEFAULT_KP_TERMS, resolveKpTerms } from '../defaults';
import { computeRequest } from '../request';
import { makeBlock, makeCtx, makeDoc, makeLine, makeSupplier, uah } from './fixtures';

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
  slogan: 'СЛОГАН',
  logoUrl: null,
  kpFooter: null,
};

const rows: KpRow[] = [
  { n: 1, lineId: 'L1', code: 'A1', imagePath: null, name: 'Змішувач', nameSecondary: null, unit: 'шт', qty: 2, price: 100, sum: 200 },
  { n: 2, lineId: 'L2', code: 'B2', imagePath: null, name: 'Труба', nameSecondary: null, unit: 'м', qty: 120, price: 10.5, sum: 1260 },
];

const BASE_INPUT: Parameters<typeof buildKpSnapshot>[0] = {
  kpNumber: 2114,
  requestNumber: 1,
  date: '2026-09-11',
  settings: { vatMode: 'without_vat', showImages: false, validityDays: 3, extraInfo: '  ' },
  vatRatePct: 20,
  rows,
  seller,
  buyer: kpBuyerOf({ nameShort: 'ТОВ «КЛІЄНТ»', edrpou: '41000011' }, 'Клієнт', { fullName: 'Петренко Андрій', email: null, phone: '067' }),
  managerName: kpManagerName({ shortName: 'Коваль О.В.', phone: '067 000' }),
  terms: [
    { label: ' Умови оплати ', value: ' Передоплата 50 % ' },
    { label: 'Гарантійний термін', value: '' },
  ],
};
const base = buildKpSnapshot(BASE_INPUT);

describe('знімок КП', () => {
  it('строк дії не вказано (0 днів) — «Пропозиція дійсна до…» у КП немає (правки замовника 25.09 п.6)', () => {
    const noTerm = buildKpSnapshot({ ...BASE_INPUT, settings: { ...BASE_INPUT.settings, validityDays: 0 } });
    expect(noTerm.validUntil).toBeNull();
    const lines = [{ id: 'L2', approval: { approved: true, approvedQty: 80 } }];
    expect(buildFinalKpSnapshot(noTerm, lines, { kpNumber: 2115, date: '2026-09-12', validityDays: 0 }).validUntil).toBeNull();
  });

  it('номер, дата, строк дії, підсумки «ТОВ без ПДВ», сума прописом, сторони', () => {
    expect(base.numberLabel).toBe('2114 / 000001');
    expect(base.final).toBe(false);
    expect(base.dateLabel).toBe('11 вересня 2026 р.');
    expect(base.validUntil).toBe('2026-09-14');
    expect(base.totals).toMatchObject({ totalNet: 1460, vat: 292, totalGross: 1752, payable: 1752 });
    expect(base.amountInWords).toBe('Одна тисяча сімсот п’ятдесят дві гривні 00 копійок');
    expect(base.columns.priceHeader).toBe('Ціна без ПДВ, грн');
    expect(base.extraInfo).toBeNull();
    expect(base.buyer).toMatchObject({ title: 'ТОВ «КЛІЄНТ»', lines: ['код ЄДРПОУ 41000011'], contactName: 'Петренко Андрій', phone: '067' });
    expect(base.managerName).toBe('Коваль О.В., тел. 067 000');
    expect(kpNumberLabel(null, 7)).toBe('чернетка / 000007');
  });

  it('умови КП (п.3 правок): без порожніх; свої в заявці або типові з Налаштувань', () => {
    expect(base.terms).toEqual([{ label: 'Умови оплати', value: 'Передоплата 50 %' }]);
    const defaults = [{ label: 'Умови поставки', value: 'Самовивіз' }];
    expect(resolveKpTerms(null, defaults)).toEqual(defaults);
    expect(resolveKpTerms(undefined, defaults)).toEqual(defaults);
    expect(resolveKpTerms([{ label: 'Термін поставки', value: '2 дні' }], defaults)).toEqual([{ label: 'Термін поставки', value: '2 дні' }]);
    // усі умови прибрали в цьому КП — не друкуються
    expect(resolveKpTerms([], defaults)).toEqual([]);
    // у старих налаштуваннях умов немає — вбудовані типові
    expect(resolveKpTerms(null, undefined).map((t) => t.label)).toEqual(DEFAULT_KP_TERMS.map((t) => t.label));
  });

  it('реквізити: ТОВ — ЄДРПОУ й ІПН; ФОП — РНОКПП і «не є платником ПДВ»', () => {
    expect(kpSellerBlock(seller)).toEqual({
      title: 'ТОВ «ДЕМО ТРЕЙД»',
      lines: ['р/р UA21 в АТ «БАНК»', 'м. Київ', 'код ЄДРПОУ 40000001, ІПН 400000010001'],
    });
    expect(kpSellerBlock({ ...seller, isVatPayer: false, ipn: '3000000001' }).lines.at(-1)).toBe('РНОКПП 3000000001, не є платником ПДВ');
  });

  it('фінальне КП: погоджені рядки з погодженими к-стями за цінами основи', () => {
    const lines = [
      { id: 'L1', approval: { approved: false, approvedQty: null } },
      { id: 'L2', approval: { approved: true, approvedQty: 80 } },
    ];
    const fin = buildFinalKpSnapshot(base, lines, { kpNumber: 2115, date: '2026-09-12', validityDays: 3 });
    expect(fin.final).toBe(true);
    expect(fin.numberLabel).toBe('2115 / 000001');
    expect(fin.rows).toEqual([{ ...rows[1], n: 1, qty: 80, sum: 840 }]);
    expect(fin.totals).toMatchObject({ totalNet: 840, vat: 168, totalGross: 1008 });
    expect(fin.validUntil).toBe('2026-09-15');
    expect(approvedTotalsFromKp(base, lines)?.totalGross).toBe(1008);
    expect(approvedTotalsFromKp(base, [])).toBeNull();
  });

  it('КП-основа — остання звичайна версія (номер КП у всіх версій однаковий); дати', () => {
    const kps = [
      { kpNumber: 2114, version: 2, onlyApproved: false },
      { kpNumber: 2114, version: 3, onlyApproved: true },
      { kpNumber: 2114, version: 1, onlyApproved: false },
    ];
    expect(latestBaseKp(kps)?.version).toBe(2);
    expect(latestBaseKp([])).toBeNull();
    expect(addDaysIso('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('перевірки перед КП', () => {
  const ctx = makeCtx([makeSupplier('A')]);
  const withMarkup = (lines: ReturnType<typeof makeLine>[]) =>
    makeDoc({ lines, blocks: [makeBlock('A', 0)], offers: lines.map((l) => uah(l.id, 'A', 100, { rrpCur: 150 })) });

  it('рядок з підібраним товаром і к-стю 0 блокує КП (ТЗ: к-сть більше 0)', () => {
    const doc = withMarkup([makeLine('L1', 2), makeLine('L2', 0)]);
    const c = kpChecks(doc.lines, computeRequest(doc, ctx));
    expect([c.inKp, c.zeroQty]).toEqual([1, 1]);
    expect(kpBlockReason(c)).toMatch(/^Кількість 0: 1 поз\./u);
  });

  it('без проблем — КП можна формувати', () => {
    const doc = withMarkup([makeLine('L1', 2)]);
    expect(kpBlockReason(kpChecks(doc.lines, computeRequest(doc, ctx)))).toBeNull();
  });
});
