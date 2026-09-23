// Один екземпляр Prisma на процес.
import { PrismaClient } from '@prisma/client';

/** Пул з'єднань: за замовчуванням Prisma бере 2×CPU+1 (9 на 4 vCPU) — при 10 користувачах і імпорті прайсу його бракувало. */
const POOL_PARAMS: Record<string, string> = { connection_limit: '15', pool_timeout: '20' };

/** Параметри пулу додаємо, лише якщо їх не задано в DATABASE_URL явно. */
export function withPoolParams(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    for (const [k, v] of Object.entries(POOL_PARAMS)) if (!u.searchParams.has(k)) u.searchParams.set(k, v);
    return u.toString();
  } catch {
    return url;
  }
}

export const prisma = new PrismaClient({ log: ['warn', 'error'], datasourceUrl: withPoolParams(process.env.DATABASE_URL) });

/** Проста перевірка, що база відповідає (для /health). */
export async function pingDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
