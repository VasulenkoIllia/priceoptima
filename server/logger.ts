// Логи — JSON у stdout (їх збирає docker). Паролі й секрети в лог не потрапляють.
import { pino } from 'pino';
import { config } from './config';

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      'password',
      'passwordHash',
    ],
    censor: '[приховано]',
  },
});

export type Logger = typeof logger;
