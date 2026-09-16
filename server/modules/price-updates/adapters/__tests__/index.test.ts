// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ADAPTER_OPTIONS, parseFeed } from '../index';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('вибір адаптера за форматом', () => {
  it('json — САНДІ, xml — SANWELL, yml — YML', () => {
    expect(parseFeed('json', fixture('sandi.json')).rows[0]?.code).toBe('TS10045201');
    expect(parseFeed('xml', fixture('sanwell.xml')).rows[0]?.code).toBe('67042');
    expect(parseFeed('yml', fixture('sandi.yml')).rows[0]?.code).toBe('TS10045201');
  });

  it('опції передаються адаптеру', () => {
    const { rows } = parseFeed('yml', fixture('sandi.yml'), { hasPurchasePrice: false });
    expect(rows[0]).toMatchObject({ purchasePrice: null, rrp: 78 });
  });

  it('файл не того формату — помилка, а не порожній прайс', () => {
    expect(() => parseFeed('xml', fixture('sandi.yml'))).toThrow();
    expect(() => parseFeed('json', fixture('sanwell.xml'))).toThrow();
  });

  it('опції за замовчуванням: ціна закупівельна, гривня; явне undefined — теж за замовчуванням', () => {
    expect(DEFAULT_ADAPTER_OPTIONS).toEqual({ hasPurchasePrice: true, defaultCurrency: 'UAH' });
    const { rows } = parseFeed('yml', fixture('sandi.yml'), { hasPurchasePrice: undefined, defaultCurrency: undefined });
    expect(rows[0]).toMatchObject({ purchasePrice: 78, rrp: null, currency: 'UAH' });
  });
});
