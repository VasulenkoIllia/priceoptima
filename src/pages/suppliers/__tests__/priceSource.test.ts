// Звідки вхідні ціни постачальника: вибір «Ціна у вигрузці» у формі джерела й підпис на картці (13.10).
import { describe, expect, it } from 'vitest';
import type { SupplierPriceSource, SupplierPriceSourceSettings } from '@shared/types';
import { buildPriceSourceInput, toFormValues } from '../PriceSourceDialog';
import { priceSourceLabel, purchaseSourceLabel } from '../supplierView';

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
  ...patch,
});

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

describe('підпис «звідки вхідні ціни»', () => {
  it('за посиланням: вхідні або лише РРЦ', () => {
    expect(purchaseSourceLabel(source({}))).toEqual({ text: 'вхідні за посиланням', isRrpOnly: false });
    expect(purchaseSourceLabel(source({ hasPurchasePrice: false }))).toEqual({ text: 'лише РРЦ, вхідних немає', isRrpOnly: true });
    // SANWELL вхідних не дає, хоч би що лишилось у збереженому прапорці
    expect(purchaseSourceLabel(source({ connector: 'sanwell' })).isRrpOnly).toBe(true);
  });

  it('«Гібрид» і «Файлом»: вхідні файлом; у назві джерела цього більше немає', () => {
    expect(purchaseSourceLabel(source({ kind: 'hybrid' })).text).toBe('вхідні файлом');
    expect(purchaseSourceLabel(source({ kind: 'manual', connector: null })).text).toBe('вхідні файлом');
    expect(priceSourceLabel(source({ kind: 'hybrid' }))).toBe('Гібрид · Стандартний YML (Prom / Rozetka) · щодня о 06:00');
    expect(priceSourceLabel(source({ kind: 'manual', connector: null }))).toBe('Вручну');
  });
});

describe('«Ціна у вигрузці» при відкритті форми', () => {
  it('«За посиланням» — збережений вибір; «Гібрид» і «Файлом» — не вибрано (там поле не показувалось)', () => {
    expect(toFormValues(current({ hasPurchasePrice: false })).hasPurchasePrice).toBe(false);
    expect(toFormValues(current({ kind: 'hybrid', hasPurchasePrice: true })).hasPurchasePrice).toBeUndefined();
    expect(toFormValues(current({ kind: 'manual', connector: null, hasPurchasePrice: true })).hasPurchasePrice).toBeUndefined();
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
