// Точка входу: піднімає сервер, прибирає протерміновані сесії й коректно завершується за сигналом docker.
import { createApp } from './app';
import { config } from './config';
import { prisma } from './db';
import { logger } from './logger';
import { startJobs } from './jobs';
import { loginLimiter } from './modules/auth/auth.routes';
import { sweepExpiredSessions } from './modules/auth/auth.service';

/** Як часто прибирати протерміновані сесії. */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

const app = createApp();
const server = app.listen(config.PORT, config.HOST, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV, clientDir: config.clientDir }, 'PriceOptima API запущено');
});

const sweep = setInterval(() => {
  void sweepExpiredSessions().catch((err: unknown) => logger.error({ err }, 'Не вдалося прибрати сесії'));
  loginLimiter.sweep();
}, SWEEP_INTERVAL_MS);
sweep.unref();

void sweepExpiredSessions().catch((err: unknown) => logger.error({ err }, 'Не вдалося прибрати сесії'));

startJobs();

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'Зупинка сервера');
  clearInterval(sweep);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
  process.exit(0);
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

process.on('unhandledRejection', (err) => logger.error({ err }, 'Необроблена помилка'));
