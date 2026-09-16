// Щоденне оновлення прайсів за посиланням: кожен постачальник — о своїй годині (за замовчуванням 06:00 за Києвом),
// постачальники по черзі, не паралельно. Не вийшло — у журналі запис із помилкою, повтор за годину, не більше трьох разів.
// Окремо о 03:30 — прибирання: товари, яких немає у прайсі понад 30 днів, ідуть в архів.
import { logger } from '../logger';
import { ApiError } from '../http/errors';
import {
  archiveLongMissing,
  lastLinkRunAt,
  runFeedUpdate,
  scheduledFeeds,
  type ScheduledFeed,
} from '../modules/price-updates/priceUpdates.service';
import { lastScheduledAt } from '../modules/price-updates/priceUpdates.rules';
import { scheduleDaily, type ScheduledTask } from './schedule';

export const HOUSEKEEPING_HOUR = 3;
export const HOUSEKEEPING_MINUTE = 30;

const RETRY_DELAY_MS = 60 * 60 * 1000;
const MAX_RETRIES = 3;

/** Черга оновлень: наступний постачальник стартує, коли попередній закінчив. */
let queue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): void {
  queue = queue.then(task).catch((err: unknown) => logger.error({ err }, 'Збій черги оновлення прайсів'));
}

/** Вмикає щогодинну перевірку розкладу прайсів і нічне прибирання; повертає завдання, яке можна зупинити. */
export function startPriceFeedJobs(): ScheduledTask {
  const tasks: ScheduledTask[] = Array.from({ length: 24 }, (_, hour) =>
    scheduleDaily({ hour, minute: 0, run: () => runDueFeeds(hour) }),
  );
  tasks.push(scheduleDaily({ hour: HOUSEKEEPING_HOUR, minute: HOUSEKEEPING_MINUTE, run: housekeeping }));
  void catchUpOnStart();
  logger.info(
    { housekeeping: `${String(HOUSEKEEPING_HOUR).padStart(2, '0')}:${HOUSEKEEPING_MINUTE}` },
    'Щоденне оновлення прайсів за посиланням заплановано',
  );
  return { stop: () => tasks.forEach((t) => t.stop()) };
}

async function runDueFeeds(hour: number): Promise<void> {
  try {
    const due = (await scheduledFeeds()).filter((f) => f.hour === hour);
    for (const feed of due) enqueue(() => runWithRetries(feed, 1));
  } catch (err) {
    logger.error({ err, hour }, 'Не вдалося прочитати розклад оновлення прайсів');
  }
}

/**
 * Старт сервера після години оновлення (перезапуск контейнера, розгортання): якщо відтоді за посиланням
 * ще не оновлювались — оновлюємо одразу, а не чекаємо ранку.
 */
async function catchUpOnStart(): Promise<void> {
  try {
    const now = new Date();
    for (const feed of await scheduledFeeds()) {
      const last = await lastLinkRunAt(feed.supplierId);
      if (!last || last < lastScheduledAt(now, feed.hour)) enqueue(() => runWithRetries(feed, 1));
    }
  } catch (err) {
    logger.error({ err }, 'Не вдалося перевірити пропущені оновлення прайсів при старті');
  }
}

async function runWithRetries(feed: ScheduledFeed, attempt: number): Promise<void> {
  const where = { supplierId: feed.supplierId, supplier: feed.supplierName, attempt };
  try {
    const run = await runFeedUpdate(feed.supplierId, { user: null });
    logger.info(
      { ...where, runId: run.id, total: run.productsTotal, changed: run.changed, added: run.added, missing: run.missing },
      'Прайс оновлено за розкладом',
    );
  } catch (err) {
    const willRetry = attempt <= MAX_RETRIES;
    // очікувані відмови (сервер постачальника, підозрілий прайс) пишемо коротко, поломки — повністю
    const reason = err instanceof ApiError ? { reason: err.message } : { err };
    logger.error({ ...where, ...reason, willRetry }, 'Не вдалося оновити прайс за розкладом');
    if (!willRetry) return;
    const timer = setTimeout(() => enqueue(() => runWithRetries(feed, attempt + 1)), RETRY_DELAY_MS);
    timer.unref?.();
  }
}

async function housekeeping(): Promise<void> {
  try {
    const archived = await archiveLongMissing();
    if (archived) logger.info({ archived }, 'Товари, яких давно немає у прайсі, перенесено в архів');
  } catch (err) {
    logger.error({ err }, 'Не вдалося перенести в архів товари, яких давно немає у прайсі');
  }
}
