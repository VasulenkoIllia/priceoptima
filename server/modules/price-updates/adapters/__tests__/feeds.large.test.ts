// @vitest-environment node
// Перевірка на повних вигрузках (десятки мегабайт) — не входить у звичайний прогін.
// Запуск (--reporter=verbose — щоб побачити підсумки, звичайний звіт ховає вивід успішних тестів):
//   PO_FEEDS_DIR=/шлях/до/вигрузок npx vitest run server/modules/price-updates/adapters/__tests__/feeds.large.test.ts --reporter=verbose
// У теці очікуються sandi.json, sanwell.xml, sandi.yml (яких немає — пропускаються).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFeed, type AdapterOptions } from '../index';

const FEEDS_DIR = process.env.PO_FEEDS_DIR;

const FEEDS: { file: string; format: 'json' | 'xml' | 'yml'; options?: Partial<AdapterOptions> }[] = [
  { file: 'sandi.json', format: 'json' },
  { file: 'sanwell.xml', format: 'xml' },
  // у YML САНДІ ціна роздрібна
  { file: 'sandi.yml', format: 'yml', options: { hasPurchasePrice: false } },
];

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} МБ`;

describe.skipIf(!FEEDS_DIR)('повні вигрузки постачальників', () => {
  for (const feed of FEEDS) {
    const path = join(FEEDS_DIR ?? '', feed.file);

    it.skipIf(!existsSync(path))(`${feed.file}`, { timeout: 60_000 }, () => {
      const body = readFileSync(path, 'utf8');
      const heapBefore = process.memoryUsage().heapUsed;
      const started = performance.now();
      const result = parseFeed(feed.format, body, feed.options);
      const ms = Math.round(performance.now() - started);
      const heapAfter = process.memoryUsage().heapUsed;

      const { rows } = result;
      const count = (predicate: (r: (typeof rows)[number]) => boolean) => rows.filter(predicate).length;
      const availability = Object.fromEntries(
        [...new Set(rows.map((r) => r.availability))].map((a) => [a, count((r) => r.availability === a)]),
      );
      console.info(
        [
          `${feed.file}: ${mb(Buffer.byteLength(body))}, рядків ${rows.length}, розбір ${ms} мс`,
          `  пам'ять: купа +${mb(heapAfter - heapBefore)}, пік процесу ${mb(process.resourceUsage().maxRSS * 1024)}`,
          `  з артикулом ${count((r) => r.sku != null)}, зі штрихкодом ${count((r) => r.barcode != null)}, ` +
            `з брендом ${count((r) => r.brand != null)}, з категорією ${count((r) => r.categoryPath != null)}, ` +
            `з фото ${count((r) => r.imageUrls.length > 0)}, з одиницею ${count((r) => r.unitCode != null)}, ` +
            `з кратністю ${count((r) => r.multiplicity != null)}`,
          `  закупівельна ${count((r) => r.purchasePrice != null)}, РРЦ ${count((r) => r.rrp != null)}, наявність ${JSON.stringify(availability)}`,
          `  курси ${JSON.stringify(result.rates ?? null)}`,
          `  попередження: ${result.warnings.length ? result.warnings.join(' | ') : '—'}`,
        ].join('\n'),
      );

      expect(rows.length).toBeGreaterThan(1000);
      expect(new Set(rows.map((r) => r.code)).size).toBe(rows.length);
      expect(rows.every((r) => r.imageUrls.length <= 5)).toBe(true);
    });
  }
});
