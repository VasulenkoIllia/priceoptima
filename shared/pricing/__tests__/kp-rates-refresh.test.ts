import { describe, expect, it } from 'vitest';
import type { CatalogSnapshot, MarkupRowComputed } from '../../types';
import { defaultKpSettings, DEFAULT_APP_SETTINGS, createRequestLine, defaultMarkupSettings, pricingSettingsFrom } from '../defaults';
import { approvedKpRows, buildKpRows, computeKpTotals, defaultKpVatMode, kpRowAmounts, kpRowNames } from '../kp-totals';
import { createSupplierBlock, supplierDefaultRates, supplierDefaultRatesInfo } from '../rates';
import { refreshOfferFromCatalog } from '../refresh';
import { computeRequest } from '../request';
import { makeBlock, makeCtx, makeDoc, makeHeader, makeLine, makeOffer, makeSupplier, uah } from './fixtures';

describe('F30–F31 КП (T15)', () => {
  const sumNet = [150, 2256, 15104];
  const sumGross = [180, 2707.2, 18124.8];

  it('without_vat', () => {
    expect(computeKpTotals(sumNet, 'without_vat', 20)).toEqual({
      vatMode: 'without_vat',
      vatRatePct: 20,
      totalNet: 17510,
      vat: 3502,
      totalGross: 21012,
      payable: 21012,
    });
  });

  it('with_vat: ПДВ з підсумку 20/120', () => {
    expect(computeKpTotals(sumGross, 'with_vat', 20)).toMatchObject({ totalGross: 21012, vat: 3502, totalNet: 17510, payable: 21012 });
  });

  it('no_vat (ФОП)', () => {
    expect(computeKpTotals(sumNet, 'no_vat', 20)).toMatchObject({ totalNet: 17510, totalGross: 17510, vat: 0, payable: 17510 });
  });

  it('копійкова різниця ПДВ від підсумку', () => {
    expect(computeKpTotals([0.05, 0.05, 0.05], 'without_vat', 20)).toMatchObject({ totalNet: 0.15, vat: 0.03, totalGross: 0.18 });
  });

  const row = {
    saleNet: 564,
    saleGross: 676.8,
    sumNet: 2256,
    sumGross: 2707.2,
    qty: 4,
    approvedQty: 2,
    approvedSumNet: 1128,
    approvedSumGross: 1353.6,
  } as MarkupRowComputed;

  it('F30 kpRowAmounts за режимом ПДВ і погодженою к-стю', () => {
    expect(kpRowAmounts(row, 'without_vat', 'net', false)).toEqual({ price: 564, sum: 2256, qty: 4 });
    expect(kpRowAmounts(row, 'with_vat', 'net', false)).toEqual({ price: 676.8, sum: 2707.2, qty: 4 });
    expect(kpRowAmounts(row, 'no_vat', 'net', false)).toEqual({ price: 564, sum: 2256, qty: 4 });
    expect(kpRowAmounts(row, 'no_vat', 'gross', false)).toEqual({ price: 676.8, sum: 2707.2, qty: 4 });
    expect(kpRowAmounts(row, 'without_vat', 'net', true)).toEqual({ price: 564, sum: 1128, qty: 2 });
    expect(kpRowAmounts({ ...row, approvedQty: null }, 'without_vat', 'net', true)).toBeNull();
    expect(kpRowAmounts({ ...row, saleNet: null }, 'without_vat', 'net', false)).toBeNull();
  });

  it('defaultKpVatMode: ФОП → no_vat', () => {
    expect(defaultKpVatMode(true, 'without_vat')).toBe('without_vat');
    expect(defaultKpVatMode(true, 'with_vat')).toBe('with_vat');
    expect(defaultKpVatMode(false, 'with_vat')).toBe('no_vat');
  });

  it('kpRowNames: з каталогу / клієнтська / з каталогу + клієнтська', () => {
    const line = { clientName: 'Змішувач д/раковини', kpName: null };
    const offer = { nameWork: 'Змішувач для умивальника Deante', name1c: 'ЗМІШ. DEANTE BCA' };
    expect(kpRowNames(line, offer, 'work')).toEqual({ name: 'Змішувач для умивальника Deante', nameSecondary: null });
    expect(kpRowNames(line, offer, 'client')).toEqual({ name: 'Змішувач д/раковини', nameSecondary: null });
    expect(kpRowNames(line, offer, 'work_with_client')).toEqual({
      name: 'Змішувач для умивальника Deante',
      nameSecondary: 'Змішувач д/раковини',
    });
    expect(kpRowNames({ ...line, kpName: 'Власна назва' }, offer, 'work').name).toBe('Власна назва');
    expect(kpRowNames(line, null, 'work').name).toBe('Змішувач д/раковини');
    // назва 1С (п.9.2 правок); якщо в товару її немає — з каталогу
    expect(kpRowNames(line, offer, 'name1c')).toEqual({ name: 'ЗМІШ. DEANTE BCA', nameSecondary: null });
    expect(kpRowNames(line, { ...offer, name1c: null }, 'name1c').name).toBe('Змішувач для умивальника Deante');
    // назву 1С завантажили або виправили в каталозі після підбору товару — береться актуальна
    expect(kpRowNames(line, { ...offer, name1c: null, catalog: { name1c: 'ЗМІШ. DEANTE (каталог)' } }, 'name1c').name).toBe('ЗМІШ. DEANTE (каталог)');
    expect(kpRowNames(line, { ...offer, catalog: { name1c: 'ЗМІШ. DEANTE BCA-011' } }, 'name1c').name).toBe('ЗМІШ. DEANTE BCA-011');
    expect(kpRowNames(line, { ...offer, catalog: { name1c: null } }, 'name1c').name).toBe('ЗМІШ. DEANTE BCA');
  });

  it('buildKpRows: з рядків заявки, «Код» = артикул; фінальне КП лише з погоджених', () => {
    const doc = makeDoc({
      lines: [
        makeLine('L1', 1, { approval: { approved: true, approvedQty: null } }),
        makeLine('L2', 4, {
          markup: { method: 'markup_on_cost', value: 20, manualPriceNet: null },
          approval: { approved: true, approvedQty: 2 },
        }),
        makeLine('L3', 1, { markup: { method: 'discount_from_rrp', value: 4, manualPriceNet: null } }),
        makeLine('L4', 1),
      ],
      blocks: [makeBlock('A', 0)],
      offers: [uah('L1', 'A', 120, { rrpCur: 180 }), uah('L2', 'A', 470), uah('L3', 'A', 15200, { rrpCur: 18880 })],
    });
    const ctx = makeCtx();
    const computed = computeRequest(doc, ctx);
    const settings = doc.header.kpSettings;
    const rows = buildKpRows(doc, computed, settings, ctx);
    expect(rows.map((r) => [r.n, r.code, r.name, r.qty, r.price, r.sum])).toEqual([
      [1, 'SKU-L1-A', 'Робоча L1', 1, 150, 150],
      [2, 'SKU-L2-A', 'Робоча L2', 4, 564, 2256],
      [3, 'SKU-L3-A', 'Робоча L3', 1, 15104, 15104],
    ]);
    expect(computeKpTotals(rows.map((r) => r.sum), settings.vatMode, 20).totalGross).toBe(21012);

    const final = buildKpRows(doc, computed, { ...settings, onlyApproved: true, vatMode: 'with_vat' }, ctx);
    expect(final.map((r) => [r.lineId, r.qty, r.price, r.sum])).toEqual([
      ['L1', 1, 180, 180],
      ['L2', 2, 676.8, 1353.6],
    ]);

    // Ф18: погодження від КП-основи — ціни з КП, к-сті погоджені
    const approved = approvedKpRows(rows, doc.lines);
    expect(approved.map((r) => [r.n, r.lineId, r.qty, r.price, r.sum])).toEqual([
      [1, 'L1', 1, 150, 150],
      [2, 'L2', 2, 564, 1128],
    ]);
    expect(computeKpTotals(approved.map((r) => r.sum), 'without_vat', 20)).toMatchObject({ totalNet: 1278, vat: 255.6, totalGross: 1533.6 });
  });
});

describe('F33 курси нового блоку (T20, T21)', () => {
  const header = { USD: 44.5526, EUR: 51.9, date: '2026-09-11' };

  it('T20: nbu_adjusted +1 % і manual', () => {
    expect(supplierDefaultRates(makeSupplier('S', { ratePolicy: 'nbu_adjusted', rateAdjustPct: 1 }), header)).toEqual({
      USD: 44.998126,
      EUR: 52.419,
    });
    expect(supplierDefaultRates(makeSupplier('S', { ratePolicy: 'manual', manualRateUsd: 45 }), header)).toEqual({
      USD: 45,
      EUR: 51.9,
    });
    expect(supplierDefaultRates(makeSupplier('S', { ratePolicy: 'nbu' }), header)).toEqual({ USD: 44.5526, EUR: 51.9 });
    expect(supplierDefaultRates(null, header)).toEqual({ USD: 44.5526, EUR: 51.9 });
  });

  it('T21: price_list — курси з прайсу, null-поля → НБУ з шапки', () => {
    const supplier = makeSupplier('S', { ratePolicy: 'price_list', priceListRates: { USD: 45, EUR: null, date: '2026-09-05' } });
    const info = supplierDefaultRatesInfo(supplier, header);
    expect(info.rates).toEqual({ USD: 45, EUR: 51.9 });
    expect(info.origins).toEqual({ USD: 'price_list', EUR: 'nbu' });
    expect(info.date).toBe('2026-09-05');

    const empty = makeSupplier('S', { ratePolicy: 'price_list' });
    expect(supplierDefaultRatesInfo(empty, header)).toEqual({ rates: { USD: 44.5526, EUR: 51.9 }, origins: { USD: 'nbu', EUR: 'nbu' }, date: '2026-09-11' });

    // немає ні прайсу, ні НБУ → null (RATE_MISSING у пропозиції)
    expect(supplierDefaultRates(empty, { USD: null, EUR: null })).toEqual({ USD: null, EUR: null });
  });

  it('Ф2 / ДОВ-3: прайс → ручний курс постачальника → НБУ', () => {
    const mixed = makeSupplier('S', {
      ratePolicy: 'price_list',
      manualRateEur: 52.5,
      priceListRates: { USD: 45, EUR: null, date: '2026-09-05' },
    });
    expect(supplierDefaultRatesInfo(mixed, header)).toEqual({
      rates: { USD: 45, EUR: 52.5 },
      origins: { USD: 'price_list', EUR: 'manual' },
      date: '2026-09-05',
    });
    const manualOnly = makeSupplier('S', { ratePolicy: 'price_list', manualRateUsd: 45.2 });
    expect(supplierDefaultRatesInfo(manualOnly, header)).toEqual({
      rates: { USD: 45.2, EUR: 51.9 },
      origins: { USD: 'manual', EUR: 'nbu' },
      date: null,
    });
    // політика «НБУ» ручний курс не бере
    expect(supplierDefaultRatesInfo(makeSupplier('S', { ratePolicy: 'nbu', manualRateUsd: 46 }), header).rates.USD).toBe(44.5526);
  });

  it('ланцюжок курсу блоку: прайс → ручний постачальника → загальний; підпис — за фактичним джерелом', () => {
    const header = makeHeader().rates;
    const noPriceList = { ratePolicy: 'price_list' as const, defaultCurrency: 'USD' as const, priceListRates: { USD: null, EUR: null, date: null } };
    // у прайсі курсу немає, ручного теж — загальний курс із шапки (ручний на дату або НБУ)
    const general = createSupplierBlock(makeSupplier('S', noPriceList), header, { id: 'b1', position: 0 });
    expect(general.rates.USD).toBe(header.USD);
    expect(general.rateSource).toBe('nbu');
    // є ручний курс постачальника — він раніше за загальний
    const manual = createSupplierBlock(makeSupplier('S', { ...noPriceList, manualRateUsd: 46.1 }), header, { id: 'b2', position: 1 });
    expect(manual.rates.USD).toBe(46.1);
    expect(manual.rateSource).toBe('manual');
  });

  it('createSupplierBlock: знімок курсів, валюта, націнка постачальника', () => {
    const supplier = makeSupplier('S', {
      defaultCurrency: 'USD',
      supplierMarkupPct: 2,
      ratePolicy: 'price_list',
      priceListRates: { USD: 45, EUR: 52, date: '2026-09-05' },
    });
    const block = createSupplierBlock(supplier, makeHeader().rates, { id: 'b1', position: 3 });
    expect(block).toMatchObject({
      id: 'b1',
      position: 3,
      supplierId: 'S',
      defaultCurrency: 'USD',
      rates: { USD: 45, EUR: 52 },
      rateSource: 'price_list',
      ratesDate: '2026-09-05',
      supplierMarkupPct: 2,
    });
    // курс блоку діє на пропозицію (F1)
    const c = computeRequest(
      makeDoc({ lines: [makeLine('L1', 1)], blocks: [block], offers: [makeOffer('L1', 'b1', { currency: 'EUR', purchasePriceCur: 10 })] }),
      makeCtx([supplier]),
    );
    expect(c.offers['L1:b1']!.rate).toBe(52);
    expect(c.offers['L1:b1']!.unitNetUah).toBe(530.4);
  });
});

describe('F34 оновлення з каталогу', () => {
  const offer = makeOffer('L1', 'A', { currency: 'USD', purchasePriceCur: 10, rrpCur: 20, stockQty: 5 });
  const catalog: CatalogSnapshot = {
    productId: 'p1',
    currency: 'USD',
    purchasePrice: 11,
    rrp: 22,
    priceUpdatedAt: '2026-09-11T06:00:00Z',
    stockQty: 7,
    availability: 'in_stock',
    isArchived: false,
  };
  const now = new Date('2026-09-11T09:00:00Z');

  it('зміна ціни → нові значення і priceChange з попередніми', () => {
    const r = refreshOfferFromCatalog(offer, catalog, 45, now, 'catalog_refresh', 2);
    expect(r).toMatchObject({ purchasePriceCur: 11, rrpCur: 22, stockQty: 7, priceDate: '2026-09-11T06:00:00Z' });
    expect(r.priceChange).toEqual({
      prevCurrency: 'USD',
      prevPurchasePriceCur: 10,
      prevRrpCur: 20,
      prevRate: 45,
      prevUnitNetUah: 459,
      reason: 'catalog_refresh',
      changedAt: '2026-09-11T09:00:00.000Z',
    });
    expect(offer.purchasePriceCur).toBe(10); // вхід не мутується
  });

  it('без зміни ціни → priceChange не з’являється, наявність оновлюється', () => {
    const r = refreshOfferFromCatalog(offer, { ...catalog, purchasePrice: 10, rrp: 20 }, 45, now, 'copy_refresh');
    expect(r.priceChange).toBeNull();
    expect(r.stockQty).toBe(7);
  });
});

describe('Дефолти (§4 поправки)', () => {
  it('націнка по РРЦ, лічильники, ФОП → no_vat', () => {
    expect(DEFAULT_APP_SETTINGS.defaultMarkupMethod).toBe('rrp');
    expect(DEFAULT_APP_SETTINGS.defaultMarkupValue).toBe(0);
    expect(DEFAULT_APP_SETTINGS.nextKpNumber).toBe(2114);
    expect(defaultMarkupSettings(DEFAULT_APP_SETTINGS)).toEqual({ method: 'rrp', value: 0, rounding: 'kopecks', excludeUnavailable: false });
    expect(pricingSettingsFrom(DEFAULT_APP_SETTINGS).discountFormula).toBe('percent_off');
    const kp = defaultKpSettings(DEFAULT_APP_SETTINGS, { id: 'fop', isVatPayer: false });
    expect(kp).toMatchObject({ ownCompanyId: 'fop', vatMode: 'no_vat', nameSource: 'work', showSku: true, onlyApproved: false });
    expect(createRequestLine({ id: 'x', position: 2, clientName: 'Кран' })).toMatchObject({
      qty: 0,
      // одиниця за замовчуванням — «шт» (ТЗ РЕД-1)
      clientUnit: 'шт',
      selection: { blockId: null },
      approval: { approved: false, approvedQty: null },
    });
    expect(createRequestLine({ id: 'x', position: 2, clientName: 'Труба', clientUnit: 'м' }).clientUnit).toBe('м');
  });
});
