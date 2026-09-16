// Запит курсів до НБУ й розбір відповіді. Без бази й логів — щоб розбір можна було перевірити тестами.
// Приклад відповіді:
// [{ "r030": 840, "txt": "Долар США", "rate": 41.2, "cc": "USD", "exchangedate": "16.09.2026" }]
import type { ForeignCurrency } from '@shared/enums';
import type { ISODate } from '@shared/types';

export const NBU_ENDPOINT = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange';

const REQUEST_TIMEOUT_MS = 15_000;

export interface NbuRate {
  currency: ForeignCurrency;
  rateDate: ISODate;
  rate: number;
}

export function nbuUrl(currency: ForeignCurrency, date: ISODate): string {
  return `${NBU_ENDPOINT}?json&valcode=${currency}&date=${date.replace(/-/gu, '')}`;
}

/** '16.09.2026' → '2026-09-16'; інший формат — null. */
export function parseNbuDate(value: unknown): ISODate | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/u.exec(value.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Відповідь НБУ → курс; чужа або порожня відповідь — помилка з поясненням. */
export function parseNbuRate(payload: unknown, currency: ForeignCurrency, requestedDate: ISODate): NbuRate {
  const rows: unknown[] = Array.isArray(payload) ? payload : [];
  const row = rows.find((r): r is Record<string, unknown> => isRecord(r) && r.cc === currency);
  if (!row) throw new Error(`НБУ не повернув курс ${currency} на ${requestedDate}`);
  const rate = toNumber(row.rate);
  if (rate == null || rate <= 0) throw new Error(`НБУ повернув некоректний курс ${currency}: ${String(row.rate)}`);
  return { currency, rateDate: parseNbuDate(row.exchangedate) ?? requestedDate, rate };
}

export async function fetchNbuRate(currency: ForeignCurrency, date: ISODate): Promise<NbuRate> {
  const response = await fetch(nbuUrl(currency, date), {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`НБУ відповів ${response.status} для ${currency}`);
  return parseNbuRate(await response.json(), currency, date);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Число або рядок із комою ('41,2') → число; інше — null. */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : null;
}
