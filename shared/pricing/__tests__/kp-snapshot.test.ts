import { describe, expect, it } from 'vitest';
import type { KpRow } from '../../types';
import {
  addDaysIso,
  approvedTotalsFromKp,
  buildFinalKpSnapshot,
  buildKpSnapshot,
  kpBuyerOf,
  kpManagerName,
  kpNumberLabel,
  kpSellerBlock,
  latestBaseKp,
} from '../kp-snapshot';

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

const base = buildKpSnapshot({
  kpNumber: 2114,
  requestNumber: 1,
  date: '2026-09-11',
  settings: { vatMode: 'without_vat', showImages: false, validityDays: 3, extraInfo: '  ' },
  vatRatePct: 20,
  rows,
  seller,
  buyer: kpBuyerOf({ nameShort: 'ТОВ «КЛІЄНТ»', edrpou: '41000011' }, 'Клієнт', { fullName: 'Петренко Андрій', email: null, phone: '067' }),
  managerName: kpManagerName({ shortName: 'Коваль О.В.', phone: '067 000' }),
});

describe('знімок КП', () => {
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
    expect(kpNumberLabel(null, 7)).toBe('— / 000007');
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

  it('КП-основа — останнє звичайне КП; дати', () => {
    const kps = [
      { kpNumber: 2110, onlyApproved: false },
      { kpNumber: 2111, onlyApproved: true },
      { kpNumber: 2109, onlyApproved: false },
    ];
    expect(latestBaseKp(kps)?.kpNumber).toBe(2110);
    expect(latestBaseKp([])).toBeNull();
    expect(addDaysIso('2026-12-30', 3)).toBe('2027-01-02');
  });
});
