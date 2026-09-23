// Строки зберігання (рішення 23.09): історія цін — 3 роки, журнал дій — 1 рік. Історію заявок не чіпаємо.
// Останній запис історії кожного товару лишається завжди — інакше в картці давнього товару історія була б порожня.
// Видаляємо порціями: великий DELETE тримав би блокування й упирався б у межу часу запиту.
import { prisma } from '../../db';

export const PRICE_HISTORY_YEARS = 3;
export const AUDIT_LOG_YEARS = 1;
const BATCH = 10_000;
/** Вікно за id для історії цін: id ростуть разом із часом запису. */
const ID_WINDOW = 50_000;

export function yearsBefore(now: Date, years: number): Date {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
}

const utc = (d: Date) => d.toISOString();

/** Історія цін, старша за строк, крім останнього запису кожного товару. Повертає, скільки видалено. */
export async function prunePriceHistory(now = new Date()): Promise<number> {
  const cutoff = utc(yearsBefore(now, PRICE_HISTORY_YEARS));
  const [edge] = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT max(id) AS max FROM "PriceHistory" WHERE "effectiveAt" < (${cutoff}::timestamptz AT TIME ZONE 'UTC')`;
  if (!edge?.max) return 0;
  let deleted = 0;
  for (let from = 0; from < edge.max; from += ID_WINDOW) {
    deleted += await prisma.$executeRaw`
      DELETE FROM "PriceHistory" h
      WHERE h.id > ${from} AND h.id <= ${from + ID_WINDOW}
        AND h."effectiveAt" < (${cutoff}::timestamptz AT TIME ZONE 'UTC')
        AND EXISTS (
          SELECT 1 FROM "PriceHistory" n
          WHERE n."productId" = h."productId" AND (n."effectiveAt" > h."effectiveAt" OR (n."effectiveAt" = h."effectiveAt" AND n.id > h.id))
        )`;
  }
  return deleted;
}

/** Журнал дій, старший за строк. */
export async function pruneAuditLog(now = new Date()): Promise<number> {
  const cutoff = utc(yearsBefore(now, AUDIT_LOG_YEARS));
  let deleted = 0;
  for (;;) {
    const n = await prisma.$executeRaw`
      DELETE FROM "AuditEvent" WHERE id IN (
        SELECT id FROM "AuditEvent" WHERE at < (${cutoff}::timestamptz AT TIME ZONE 'UTC') LIMIT ${BATCH}
      )`;
    deleted += n;
    if (n < BATCH) return deleted;
  }
}
