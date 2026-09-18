// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isFeedConnector } from '@shared/catalog/connectors';
import { FULL_ROLES } from '../modules/price-updates/plan';
import {
  archiveCutoff,
  DEFAULT_FEED_HOUR,
  feedHourOf,
  lastScheduledAt,
  priceFileStoredPath,
  rolesFor,
} from '../modules/price-updates/priceUpdates.rules';

describe('ролі джерела прайсу', () => {
  it('auto й ручний режим: і посилання, і файл ведуть усе', () => {
    expect(rolesFor('auto', 'link')).toEqual(FULL_ROLES);
    expect(rolesFor('manual', 'file')).toEqual(FULL_ROLES);
    expect(rolesFor(null, 'file')).toEqual(FULL_ROLES);
  });

  it('hybrid: посилання — асортимент і наявність без цін; файл — ціни й наявність без асортименту', () => {
    expect(rolesFor('hybrid', 'link')).toEqual({ purchasePrice: false, rrp: 'set', stock: true, assortment: true });
    expect(rolesFor('hybrid', 'file')).toEqual({ purchasePrice: true, rrp: 'fill', stock: true, assortment: false });
  });
});

describe('підключення й година вигрузки', () => {
  it('за посиланням — лише відомі підключення постачальників', () => {
    expect(['sandi', 'sanwell', 'yml'].every(isFeedConnector)).toBe(true);
    expect(isFeedConnector('json')).toBe(false);
    expect(isFeedConnector(null)).toBe(false);
  });

  it('година з налаштувань або 6:00 за замовчуванням', () => {
    expect(feedHourOf(7)).toBe(7);
    expect(feedHourOf(0)).toBe(0);
    expect(feedHourOf(null)).toBe(DEFAULT_FEED_HOUR);
    expect(feedHourOf(24)).toBe(DEFAULT_FEED_HOUR);
  });
});

describe('останній запланований запуск', () => {
  it('після години запуску — сьогоднішній запуск', () => {
    // 06:30 за Києвом (літній час, UTC+3) → сьогодні 06:00
    expect(lastScheduledAt(new Date('2026-09-16T03:30:00.000Z'), 6).toISOString()).toBe('2026-09-16T03:00:00.000Z');
  });

  it('до години запуску — вчорашній', () => {
    // 05:00 за Києвом → учора 06:00
    expect(lastScheduledAt(new Date('2026-09-16T02:00:00.000Z'), 6).toISOString()).toBe('2026-09-15T03:00:00.000Z');
  });
});

describe('архівація товарів, яких давно немає у прайсі', () => {
  it('межа — 30 днів до сьогодні', () => {
    expect(archiveCutoff('2026-09-16')).toBe('2026-08-17');
  });

  it('позначений 31 день тому — в архів, рівно 30 днів тому — ще ні', () => {
    const cutoff = archiveCutoff('2026-09-16');
    expect('2026-08-16' < cutoff).toBe(true);
    expect('2026-08-17' < cutoff).toBe(false);
  });

  it('через межу місяця й року', () => {
    expect(archiveCutoff('2026-01-10')).toBe('2025-12-11');
    expect(archiveCutoff('2028-03-01')).toBe('2028-01-31');
  });
});

describe('шлях файлу прайсу', () => {
  it('тека постачальника, uuid і розширення з назви файлу', () => {
    const stored = priceFileStoredPath('sup-1', 'Прайс 16.09.XLSX');
    expect(stored).toMatch(/^price-lists\/sup-1\/[0-9a-f-]{36}\.xlsx$/u);
  });

  it('підозріле або відсутнє розширення — .bin; назва файлу в шлях не потрапляє', () => {
    expect(priceFileStoredPath('sup-1', '../../etc/passwd')).toMatch(/^price-lists\/sup-1\/[0-9a-f-]{36}\.bin$/u);
    expect(priceFileStoredPath('sup-1', 'прайс.x;rm -rf')).toMatch(/\.bin$/u);
    expect(priceFileStoredPath('sup-1', null)).toMatch(/\.bin$/u);
  });
});
