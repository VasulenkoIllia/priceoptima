// Збірка сервера: esbuild складає server/ і shared/ в один файл на кожну точку входу.
// Пакети з node_modules лишаються зовнішніми — їх ставить npm ci у контейнері.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));

const entries = [
  { in: 'server/index.ts', out: 'dist/server/index.js' },
  { in: 'server/prisma/seed.ts', out: 'dist/server/seed.js' },
  // окремий потік розбору й звірки прайсу (server/lib/priceWorker.ts шукає його поруч з index.js)
  { in: 'server/workers/price.worker.ts', out: 'dist/server/price.worker.js' },
];

for (const entry of entries) {
  await build({
    absWorkingDir: root,
    entryPoints: [entry.in],
    outfile: entry.out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    packages: 'external',
    sourcemap: true,
    logLevel: 'info',
    alias: { '@shared': path.join(root, 'shared') },
  });
}
