// Налаштування сервера зі змінних середовища. Помилка тут — це помилка розгортання,
// тому перевіряємо все на старті й падаємо з прозорим повідомленням, а не посеред першого запиту.
import path from 'node:path';
import { z } from 'zod';

/** '1'/'true' — так, '0'/'false' — ні; не задано — значення за замовчуванням. */
const booleanish = (fallback: boolean) =>
  z
    .enum(['1', '0', 'true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === '1' || v === 'true'));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Адреса, на якій слухаємо (у контейнері — усі інтерфейси). */
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'вкажіть рядок підключення до PostgreSQL'),
  /** Ключ підпису cookie сесії. Зміна ключа розлогінює всіх. */
  SESSION_SECRET: z.string().min(16, 'мінімум 16 символів'),
  /** Скільки живе сесія без активності. */
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Тека зі зібраним фронтом; за замовчуванням — dist/client поряд із робочою текою. */
  CLIENT_DIR: z.string().optional(),
  /** Тека зі завантаженими файлами (фото товарів, прайси); у docker — том ./data/uploads. */
  UPLOADS_DIR: z.string().optional(),
  /** Довіряти заголовкам X-Forwarded-* (за Traefik — так). */
  TRUST_PROXY: booleanish(true),
  /**
   * Cookie сесії лише для HTTPS. За замовчуванням — так у production (сервер за Traefik).
   * Для перевірки production-збірки на http://localhost — 0: Safari не зберігає захищену cookie без HTTPS.
   */
  COOKIE_SECURE: z.enum(['1', '0', 'true', 'false']).optional(),
  /** Обліковий запис адміністратора для першого запуску (створює сід). */
  ADMIN_LOGIN: z.string().trim().min(1).optional(),
  ADMIN_PASSWORD: z.string().min(8, 'мінімум 8 символів').optional(),
  ADMIN_FULL_NAME: z.string().trim().min(1).default('Адміністратор'),
  ADMIN_SHORT_NAME: z.string().trim().min(1).default('Адмін.'),
});

export type AppConfig = Readonly<Omit<z.infer<typeof schema>, 'COOKIE_SECURE'>> & {
  readonly isProduction: boolean;
  readonly cookieSecure: boolean;
  readonly clientDir: string;
  readonly uploadsDir: string;
  readonly sessionTtlMs: number;
};

/** Читає й перевіряє змінні середовища; кидає помилку зі списком проблемних змінних. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(env)'} — ${i.message}`);
    throw new Error(`Неправильні змінні середовища:\n${lines.join('\n')}`);
  }
  const { COOKIE_SECURE, ...value } = parsed.data;
  const isProduction = value.NODE_ENV === 'production';
  return Object.freeze({
    ...value,
    isProduction,
    cookieSecure: COOKIE_SECURE === undefined ? isProduction : COOKIE_SECURE === '1' || COOKIE_SECURE === 'true',
    clientDir: value.CLIENT_DIR ?? path.resolve(process.cwd(), 'dist/client'),
    uploadsDir: path.resolve(value.UPLOADS_DIR ?? path.resolve(process.cwd(), 'data/uploads')),
    sessionTtlMs: value.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export const config = loadConfig();
