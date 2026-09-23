import { describe, expect, it } from 'vitest';
import { buildKpSnapshot, kpBuyerOf } from '@shared/pricing';
import type { KpRow } from '@shared/types';
import { buildKpWorkbook } from '../kpExcel';
import { buildKpPdf } from '../kpPdf';

// логотип-бейдж (SVG data URL), як завантажує користувач у Налаштуваннях
const LOGO = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="14" fill="#1050B8"/></svg>')}`;

const rows: KpRow[] = [
  { n: 1, lineId: 'L1', code: 'ЦР0000123', imagePath: null, name: 'Змішувач для раковини ПР1', nameSecondary: 'Змішувач д/раковини', unit: 'шт', qty: 2, price: 686.25, sum: 1372.5 },
  { n: 2, lineId: 'L2', code: 'PL0000134', imagePath: null, name: 'Труба ппр Basalt 40х4,2', nameSecondary: null, unit: 'м', qty: 120, price: 110, sum: 13200 },
];

const snapshot = buildKpSnapshot({
  kpNumber: 2114,
  requestNumber: 1,
  date: '2026-09-11',
  settings: { vatMode: 'without_vat', showImages: false, validityDays: 3, extraInfo: 'Поставка 3–5 робочих днів' },
  vatRatePct: 20,
  rows,
  seller: {
    nameShort: 'ТОВ «ТЕСТ ТРЕЙД»',
    nameFull: 'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ «ТЕСТ ТРЕЙД»',
    edrpou: '40000001',
    ipn: '400000010001',
    isVatPayer: true,
    iban: 'UA213223130000026007233566001',
    bankName: 'АТ «ТЕСТБАНК»',
    addressLegal: 'м. Київ, вул. Прикладна, 1',
    phone: '044 000 00 00',
    email: 'sales@test-trade.example',
    website: 'test-trade.example',
    slogan: 'ВСЕ ДЛЯ КОМПЛЕКТАЦІЇ ІНЖЕНЕРНИХ СИСТЕМ',
    logoUrl: LOGO,
    kpFooter: null,
  },
  buyer: kpBuyerOf({ nameShort: 'ТОВ «БК БУДІНВЕСТ»', edrpou: '41000011' }, 'БУДІНВЕСТ', { fullName: 'Петренко Андрій', email: 'a.petrenko@budinvest.example', phone: '067-000-12-34' }),
  managerName: 'Коваль О.В., тел. 067 000 11 22',
  terms: [
    { label: 'Умови оплати', value: 'Передоплата 100 %' },
    { label: 'Гарантійний термін', value: '12 місяців' },
  ],
});

describe('файли КП з одного знімка', () => {
  it('PDF: документ формується (кирилиця, SVG-логотип)', async () => {
    const buf = await (await buildKpPdf(snapshot)).getBuffer();
    expect(new TextDecoder().decode(buf.subarray(0, 5))).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(10_000);
  }, 30_000);

  it('Excel: к-сті, ціни й суми — числові клітинки; підсумок як у знімку', async () => {
    const wb = await buildKpWorkbook(snapshot);
    const ws = wb.getWorksheet('КП')!;
    let pipe: unknown[] | null = null;
    let total: unknown = null;
    ws.eachRow((row) => {
      const values = row.values as unknown[];
      if (values[2] === 'PL0000134') pipe = values;
      if (row.getCell(1).value === 'Всього з ПДВ:') total = row.getCell(7).value;
    });
    expect(pipe).not.toBeNull();
    expect(pipe!.slice(5, 8)).toEqual([120, 110, 13200]);
    expect(total).toBe(snapshot.totals.totalGross);
    expect(total).toBe(17487);
    const cells: unknown[] = [];
    ws.eachRow((row) => cells.push(row.getCell(1).value, row.getCell(3).value));
    expect(cells).toContain('Умови оплати:');
    expect(cells).toContain('Передоплата 100 %');
    expect((await wb.xlsx.writeBuffer()).byteLength).toBeGreaterThan(3000);
  });

  it('Excel з фото: колонка «Фото», зображення в рядку з фото, числа зсунуті на колонку', async () => {
    // 1×1 білий JPEG
    const JPEG =
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=';
    const withPhotos = {
      ...snapshot,
      columns: { ...snapshot.columns, showImages: true },
      rows: snapshot.rows.map((r, i) => ({ ...r, imagePath: i === 0 ? '/api/images/p1' : null })),
    };
    const wb = await buildKpWorkbook(withPhotos, new Map([['/api/images/p1', JPEG]]));
    const ws = wb.getWorksheet('КП')!;
    let head: unknown[] | null = null;
    let pipe: unknown[] | null = null;
    ws.eachRow((row) => {
      const values = row.values as unknown[];
      if (values[1] === '№') head = values;
      if (values[2] === 'PL0000134') pipe = values;
    });
    expect(head!.slice(1, 5)).toEqual(['№', 'Код', 'Фото', 'Товари (роботи, послуги)']);
    expect(pipe!.slice(6, 9)).toEqual([120, 110, 13200]);
    expect(ws.getImages()).toHaveLength(1);
    expect((await wb.xlsx.writeBuffer()).byteLength).toBeGreaterThan(3000);
  });
});
