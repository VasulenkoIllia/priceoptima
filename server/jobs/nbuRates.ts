// Щоденні курси НБУ. О 05:45 за Києвом (курси на день НБУ публікує близько 05:30)
// запитуємо USD і EUR і кладемо в довідник із джерелом 'nbu'.
// Не вийшло — пишемо в лог і пробуємо ще раз за годину, не більше трьох разів.
import { FOREIGN_CURRENCIES } from '@shared/enums';
import type { ISODate } from '@shared/types';
import { logger } from '../logger';
import { getEffectiveRates, saveNbuRate, today } from '../modules/rates/rates.service';
import { fetchNbuRate } from './nbuApi';
import type { NbuRate } from './nbuApi';
import { scheduleDaily } from './schedule';
import type { ScheduledTask } from './schedule';

/** Час щоденного запуску за київським часом. */
export const NBU_HOUR = 5;
export const NBU_MINUTE = 45;

const RETRY_DELAY_MS = 60 * 60 * 1000;
const MAX_RETRIES = 3;

/** Забирає курси USD і EUR на дату й зберігає їх у довіднику. */
export async function syncNbuRates(date: ISODate = today()): Promise<NbuRate[]> {
  const saved: NbuRate[] = [];
  const failures: string[] = [];
  for (const currency of FOREIGN_CURRENCIES) {
    try {
      const rate = await fetchNbuRate(currency, date);
      await saveNbuRate(rate.currency, rate.rateDate, rate.rate);
      saved.push(rate);
    } catch (err) {
      failures.push(`${currency}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  // одна валюта не прийшла — вважаємо оновлення невдалим і повторимо обидві
  if (failures.length) throw new Error(failures.join('; '));
  return saved;
}

/** Щоденне оновлення курсів; повертає завдання, яке можна зупинити. */
export function startNbuRatesJob(): ScheduledTask {
  void catchUpOnStart();
  return scheduleDaily({ hour: NBU_HOUR, minute: NBU_MINUTE, run: () => runWithRetries(1) });
}

/**
 * Старт після 05:45 (перший запуск, перезапуск контейнера) — курсів на сьогодні ще може не бути.
 * Дивимось, чи вони вже є, і за потреби забираємо одразу, не чекаючи завтрашнього ранку.
 */
async function catchUpOnStart(): Promise<void> {
  try {
    const date = today();
    const effective = await getEffectiveRates(date);
    const fresh = FOREIGN_CURRENCIES.every((c) => effective[c]?.rateDate === date);
    if (fresh) return;
    await runWithRetries(1);
  } catch (err) {
    logger.error({ err }, 'Не вдалося перевірити курси на сьогодні при старті');
  }
}

async function runWithRetries(attempt: number): Promise<void> {
  try {
    const rates = await syncNbuRates();
    logger.info({ rates }, 'Курси НБУ оновлено');
  } catch (err) {
    const willRetry = attempt <= MAX_RETRIES;
    logger.error({ err, attempt, willRetry }, 'Не вдалося отримати курси НБУ');
    if (!willRetry) return;
    const timer = setTimeout(() => {
      void runWithRetries(attempt + 1);
    }, RETRY_DELAY_MS);
    timer.unref?.();
  }
}
