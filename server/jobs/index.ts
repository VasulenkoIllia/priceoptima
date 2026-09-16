// Фонові завдання сервера. Запускаються один раз на старті (server/index.ts).
import { logger } from '../logger';
import { NBU_HOUR, NBU_MINUTE, startNbuRatesJob } from './nbuRates';

/** Вмикає щоденні завдання; таймери не тримають процес і зупиняються разом із ним. */
export function startJobs(): void {
  startNbuRatesJob();
  logger.info({ at: `${String(NBU_HOUR).padStart(2, '0')}:${String(NBU_MINUTE).padStart(2, '0')}` }, 'Щоденне оновлення курсів НБУ заплановано');
}
