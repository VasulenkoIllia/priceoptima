// Перед тестами з базою: міграції накочуються на тестову базу (нічого не стирається; дані тестів унікальні на кожен запуск).
// Захист: лише локальна база з «test» у назві, бо тести пишуть у неї дані.
import { execFileSync } from 'node:child_process';

export default function setup(): void {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('TEST_DATABASE_URL не задано: вкажіть локальну тестову базу (див. README, «Тести з базою»)');
  const url = new URL(raw);
  const dbName = url.pathname.replace(/^\//u, '');
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/test/iu.test(dbName)) {
    throw new Error(`Тести з базою запускаються лише на локальній базі з «test» у назві (зараз ${url.hostname}/${dbName})`);
  }
  execFileSync('npx', ['prisma', 'migrate', 'deploy', '--schema', 'server/prisma/schema.prisma'], {
    env: { ...process.env, DATABASE_URL: raw },
    stdio: 'pipe',
  });
}
