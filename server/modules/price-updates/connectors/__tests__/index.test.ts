// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FEED_CONNECTOR_INFO, FEED_CONNECTORS, linkUpdatesPurchasePrice, type FeedConnector } from '@shared/catalog/connectors';
import { linkRolesOf, rolesFor } from '../../priceUpdates.rules';
import { DEFAULT_ADAPTER_OPTIONS, parseFeed } from '../index';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('підключення постачальника', () => {
  it('sandi — JSON САНДІ, sanwell — XML SANWELL, yml — стандартний YML', () => {
    expect(parseFeed('sandi', fixture('sandi.json')).rows[0]?.code).toBe('TS10045201');
    expect(parseFeed('sanwell', fixture('sanwell.xml')).rows[0]?.code).toBe('67042');
    expect(parseFeed('yml', fixture('sandi.yml')).rows[0]?.code).toBe('TS10045201');
  });

  it('кожне підключення в переліку має модуль розбору й підпис', () => {
    for (const c of FEED_CONNECTORS) {
      expect(FEED_CONNECTOR_INFO[c].label).toBeTruthy();
      expect(() => parseFeed(c, '')).toThrow();
    }
  });

  it('опції передаються адаптеру', () => {
    const { rows } = parseFeed('yml', fixture('sandi.yml'), { hasPurchasePrice: false });
    expect(rows[0]).toMatchObject({ purchasePrice: null, rrp: 78 });
  });

  it('картка «Що оновлюється» (linkRolesOf) збігається з цінами, які посилання справді записує', () => {
    const fixtures: Record<FeedConnector, string> = { sandi: 'sandi.json', sanwell: 'sanwell.xml', yml: 'sandi.yml' };
    for (const c of FEED_CONNECTORS) {
      for (const kind of ['auto', 'hybrid'] as const) {
        for (const has of [true, false]) {
          // як runFeedUpdate: розбір із прапорцем linkUpdatesPurchasePrice, без нього вхідні з рядків прибираються
          const withPurchase = linkUpdatesPurchasePrice(kind, c, has);
          const rows = parseFeed(c, fixture(fixtures[c]), { hasPurchasePrice: withPurchase }).rows;
          const roles = linkRolesOf(kind, c, has);
          const where = `${c} ${kind} ${String(has)}`;
          expect(roles?.purchasePrice, where).toBe(withPurchase && rows.some((r) => r.purchasePrice != null));
          expect(roles?.rrp !== 'none', where).toBe(rolesFor(kind, 'link').rrp !== 'none' && rows.some((r) => r.rrp != null));
        }
      }
    }
  });

  it('файл не того формату — помилка, а не порожній прайс', () => {
    expect(() => parseFeed('sanwell', fixture('sandi.yml'))).toThrow();
    expect(() => parseFeed('sandi', fixture('sanwell.xml'))).toThrow();
  });

  it('опції за замовчуванням: ціна закупівельна, гривня; явне undefined — теж за замовчуванням', () => {
    expect(DEFAULT_ADAPTER_OPTIONS).toEqual({ hasPurchasePrice: true, defaultCurrency: 'UAH' });
    const { rows } = parseFeed('yml', fixture('sandi.yml'), { hasPurchasePrice: undefined, defaultCurrency: undefined });
    expect(rows[0]).toMatchObject({ purchasePrice: 78, rrp: null, currency: 'UAH' });
  });
});
