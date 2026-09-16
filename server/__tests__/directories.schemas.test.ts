// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ApiError } from '../http/errors';
import { parse } from '../http/validate';
import { clientInputSchema } from '../modules/clients/clients.schemas';
import { ownCompanyInputSchema } from '../modules/own-companies/ownCompanies.schemas';
import { manualRateSchema, ratesQuerySchema } from '../modules/rates/rates.schemas';
import { isHttpUrl, priceMappingSchema, priceSourceSchema, supplierInputSchema } from '../modules/suppliers/suppliers.schemas';
import { unitPatchSchema } from '../modules/units/units.schemas';

/** Повідомлення, яке побачить користувач. */
function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).code).toBe('VALIDATION_ERROR');
    return (e as ApiError).message;
  }
  throw new Error('очікували помилку перевірки');
}

describe('юрособа', () => {
  const valid = { code: 'ТОВ', nameShort: 'ТОВ «ДЕМО»', nameFull: 'ТОВАРИСТВО «ДЕМО»' };

  it('порожні поля стають null, а не порожніми рядками', () => {
    const out = parse(ownCompanyInputSchema, { ...valid, edrpou: '  ', email: '', iban: null });
    expect(out.edrpou).toBeNull();
    expect(out.email).toBeNull();
    expect(out.iban).toBeNull();
  });

  it('значення за замовчуванням: платник ПДВ, активна, не основна', () => {
    const out = parse(ownCompanyInputSchema, valid);
    expect(out.isVatPayer).toBe(true);
    expect(out.isActive).toBe(true);
    expect(out.isDefault).toBe(false);
  });

  it('без назв — зрозуміле повідомлення українською', () => {
    expect(messageOf(() => parse(ownCompanyInputSchema, {}))).toBe('Вкажіть позначку юрособи');
    expect(messageOf(() => parse(ownCompanyInputSchema, { code: 'ТОВ', nameShort: '   ' }))).toBe('Вкажіть коротку назву');
  });
});

describe('клієнт', () => {
  it('списки, яких не передали, лишаються невизначеними (їх не чіпаємо)', () => {
    const out = parse(clientInputSchema, { name: 'АВТОСТРАДА' });
    expect(out.counterparties).toBeUndefined();
    expect(out.contacts).toBeUndefined();
    expect(out.isActive).toBe(true);
  });

  it('вкладені контрагенти й контакти перевіряються теж', () => {
    const out = parse(clientInputSchema, {
      name: 'АВТОСТРАДА',
      counterparties: [{ nameShort: 'ТОВ «ВК АВТОСТРАДА»', edrpou: '44305608', isDefault: true }],
      contacts: [{ fullName: 'Петренко Андрій', counterpartyId: null, isPrimary: true }],
    });
    expect(out.counterparties?.[0].isDefault).toBe(true);
    expect(out.counterparties?.[0].isActive).toBe(true);
    expect(out.contacts?.[0].counterpartyId).toBeNull();
  });

  it('контрагент без назви не проходить', () => {
    expect(messageOf(() => parse(clientInputSchema, { name: 'АВТОСТРАДА', counterparties: [{}] }))).toBe(
      'Вкажіть назву контрагента',
    );
  });

  it('невірний ідентифікатор відповідального — помилка', () => {
    expect(messageOf(() => parse(clientInputSchema, { name: 'АВТОСТРАДА', responsibleUserId: 'koval' }))).toBe(
      'Невірний ідентифікатор',
    );
  });
});

describe('постачальник', () => {
  it('значення за замовчуванням відповідають схемі бази', () => {
    const out = parse(supplierInputSchema, { name: 'Дніпро-Сантехніка' });
    expect(out.defaultCurrency).toBe('UAH');
    expect(out.ratePolicy).toBe('price_list');
    expect(out.supplierMarkupPct).toBe(0);
    expect(out.rateAdjustPct).toBe(0);
    expect(out.sortOrder).toBe(0);
    expect(out.isActive).toBe(true);
    expect(out.priceListRates).toBeUndefined();
    expect(out.manualRateUsd).toBeNull();
  });

  it('політика курсу «НБУ ± %» приймається', () => {
    expect(parse(supplierInputSchema, { name: 'С', ratePolicy: 'nbu_adjusted', rateAdjustPct: 1.5 }).rateAdjustPct).toBe(1.5);
  });

  it('невідома валюта чи політика курсу — помилка', () => {
    expect(messageOf(() => parse(supplierInputSchema, { name: 'С', defaultCurrency: 'PLN' }))).toBe('Невідома валюта');
    expect(messageOf(() => parse(supplierInputSchema, { name: 'С', ratePolicy: 'як вийде' }))).toBe('Невідома політика курсу');
  });

  it('неіснуюча дата ручних курсів не проходить', () => {
    expect(messageOf(() => parse(supplierInputSchema, { name: 'С', manualRatesDate: '2026-02-31' }))).toBe(
      'Дата ручних курсів: такої дати не існує',
    );
  });
});

describe('джерело прайсу', () => {
  it('файловий прайс не потребує посилання', () => {
    const out = parse(priceSourceSchema, { kind: 'manual' });
    expect(out.url).toBeUndefined();
    expect(out.auth).toBe('none');
    expect(out.hasPurchasePrice).toBe(true);
    expect(out.secret).toBeUndefined();
  });

  it('вигрузка за посиланням потребує формату', () => {
    expect(messageOf(() => parse(priceSourceSchema, { kind: 'auto' }))).toBe('Вкажіть формат вигрузки');
  });

  it('посилання, як і секрет: відсутнє — лишити збережене, порожнє — прибрати', () => {
    expect(parse(priceSourceSchema, { kind: 'auto', format: 'yml' }).url).toBeUndefined();
    expect(parse(priceSourceSchema, { kind: 'manual', url: '  ' }).url).toBe('');
    expect(parse(priceSourceSchema, { kind: 'manual', url: null }).url).toBeNull();
  });

  it('посилання приймаємо лише http(s)', () => {
    expect(messageOf(() => parse(priceSourceSchema, { kind: 'auto', format: 'yml', url: 'file:///etc/passwd' }))).toBe(
      'Посилання має починатися з http:// або https://',
    );
    expect(isHttpUrl('https://feed.example.com/price.yml')).toBe(true);
    expect(isHttpUrl('ftp://feed.example.com/price.yml')).toBe(false);
    expect(isHttpUrl('просто текст')).toBe(false);
  });

  it('година оновлення — від 0 до 23', () => {
    expect(parse(priceSourceSchema, { kind: 'manual', scheduleHour: 0 }).scheduleHour).toBe(0);
    expect(messageOf(() => parse(priceSourceSchema, { kind: 'manual', scheduleHour: 24 }))).toBe('Година оновлення: до 23');
  });

  it('порожній секрет означає «прибрати», відсутній — «лишити як є»', () => {
    expect(parse(priceSourceSchema, { kind: 'manual', secret: '' }).secret).toBe('');
    expect(parse(priceSourceSchema, { kind: 'manual', secret: null }).secret).toBeNull();
    expect(parse(priceSourceSchema, { kind: 'manual' }).secret).toBeUndefined();
  });
});

describe('зіставлення колонок файлу прайсу', () => {
  it('приймає збережене зіставлення й підставляє значення за замовчуванням', () => {
    const out = parse(priceMappingSchema, { headerRow: 0, columns: { code: { index: 0, header: 'Код' }, purchasePrice: { index: 3, header: 'Ціна з ПДВ' } } });
    expect(out).toEqual({
      sheetName: null,
      headerRow: 0,
      columns: { code: { index: 0, header: 'Код' }, purchasePrice: { index: 3, header: 'Ціна з ПДВ' } },
      pricesIncludeVat: false,
      currency: 'UAH',
      skipRowsWithoutPrice: true,
      markMissing: false,
    });
  });

  it('невідома колонка чи від’ємний номер не проходять', () => {
    expect(priceMappingSchema.safeParse({ columns: { colour: { index: 1, header: 'Колір' } } }).success).toBe(false);
    expect(priceMappingSchema.safeParse({ columns: { code: { index: -1, header: 'Код' } } }).success).toBe(false);
  });
});

describe('курси', () => {
  it('ручний курс: валюта, дата й додатне число', () => {
    const out = parse(manualRateSchema, { currency: 'USD', rateDate: '2026-09-16', rate: 44.85, note: '' });
    expect(out).toEqual({ currency: 'USD', rateDate: '2026-09-16', rate: 44.85, note: null });
  });

  it('гривня в довіднику курсів не ведеться', () => {
    expect(messageOf(() => parse(manualRateSchema, { currency: 'UAH', rateDate: '2026-09-16', rate: 1 }))).toBe(
      'Курс ведеться лише для USD і EUR',
    );
  });

  it('нульовий курс і неправильна дата не проходять', () => {
    expect(messageOf(() => parse(manualRateSchema, { currency: 'USD', rateDate: '2026-09-16', rate: 0 }))).toBe(
      'Курс має бути більшим за нуль',
    );
    expect(messageOf(() => parse(manualRateSchema, { currency: 'USD', rateDate: '16.09.2026', rate: 44 }))).toBe(
      'Дата курсу: дата у форматі РРРР-ММ-ДД',
    );
  });

  it('порожній фільтр списку — без обмежень', () => {
    expect(parse(ratesQuerySchema, {})).toEqual({ currency: undefined, from: null, to: null });
  });
});

describe('одиниця виміру', () => {
  it('без синонімів — порожній список', () => {
    expect(parse(unitPatchSchema, { name: 'Штука' })).toEqual({ name: 'Штука', aliases: [], isActive: true });
  });

  it('назва обов’язкова', () => {
    expect(messageOf(() => parse(unitPatchSchema, { aliases: ['шт.'] }))).toBe('Вкажіть назву');
  });
});
