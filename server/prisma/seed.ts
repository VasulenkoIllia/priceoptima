// Початкове наповнення робочої бази: налаштування, одиниці виміру й один адміністратор.
// Сід ідемпотентний: нічого не перезаписує, тож його безпечно виконувати при кожному запуску.
import { DEFAULT_UNITS } from '@shared/parse';
import { DEFAULT_APP_SETTINGS } from '@shared/pricing';
import { config } from '../config';
import { prisma } from '../db';
import { logger } from '../logger';
import { hashPassword } from '../modules/auth/password';
import { SETTINGS_ID, toSettingsRow } from '../modules/settings/settings.mapper';

async function seedSettings(): Promise<void> {
  const exists = await prisma.appSettings.findUnique({ where: { id: SETTINGS_ID }, select: { id: true } });
  if (exists) {
    logger.info('Налаштування вже є — пропускаємо');
    return;
  }
  await prisma.appSettings.create({ data: { id: SETTINGS_ID, ...toSettingsRow(DEFAULT_APP_SETTINGS) } });
  logger.info('Створено рядок налаштувань');
}

async function seedUnits(): Promise<void> {
  const { count } = await prisma.unit.createMany({
    data: DEFAULT_UNITS.map((u) => ({
      code: u.code,
      name: u.name,
      aliases: [...u.aliases],
      sortOrder: u.sortOrder,
      isActive: u.isActive,
    })),
    skipDuplicates: true,
  });
  logger.info({ added: count, total: DEFAULT_UNITS.length }, 'Одиниці виміру');
}

async function seedAdmin(): Promise<void> {
  const login = config.ADMIN_LOGIN;
  const password = config.ADMIN_PASSWORD;
  if (!login || !password) {
    logger.warn('ADMIN_LOGIN / ADMIN_PASSWORD не задані — адміністратора не створено');
    return;
  }
  const exists = await prisma.user.findUnique({ where: { login }, select: { id: true } });
  if (exists) {
    logger.info({ login }, 'Користувач із таким логіном уже є — пропускаємо');
    return;
  }
  await prisma.user.create({
    data: {
      login,
      passwordHash: await hashPassword(password),
      fullName: config.ADMIN_FULL_NAME,
      shortName: config.ADMIN_SHORT_NAME,
      role: 'admin',
      // пароль із .env знає той, хто розгортав сервер: при першому вході адміністратор задає свій (РОЛ-2)
      mustChangePassword: true,
    },
  });
  logger.info({ login }, 'Створено адміністратора (при першому вході змінить пароль)');
}

async function main(): Promise<void> {
  await seedSettings();
  await seedUnits();
  await seedAdmin();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err: unknown) => {
    logger.error({ err }, 'Сід не виконано');
    await prisma.$disconnect();
    process.exit(1);
  });
