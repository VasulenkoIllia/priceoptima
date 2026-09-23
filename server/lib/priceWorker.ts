// Запуск важкої частини оновлення прайсу в окремому потоці (server/workers/price.worker.ts).
// Потік на кожне завдання: оновлень кілька на день, а старт потоку коштує десятки мілісекунд.
// Потік — лише у зібраному сервері; у розробці (tsx), у тестах і з PRICE_WORKER=0 — у тому самому потоці.
import { Worker } from 'node:worker_threads';
import { runPriceTaskInline, type PriceTask, type PriceTaskResult } from './priceWorkerTasks';

export type { PriceTask } from './priceWorkerTasks';
export type PriceTaskReply = { ok: true; result: unknown } | { ok: false; message: string };

/** Розібраний прайс на 200 тис. позицій займає до ~1,5 ГБ; більше потоку не даємо. */
const WORKER_HEAP_MB = 1536;

// зібраний сервер: dist/server/price.worker.js поруч з index.js
const fromSource = import.meta.url.endsWith('.ts');
const workerUrl = new URL('./price.worker.js', import.meta.url);

function inline(): boolean {
  return fromSource || !!process.env.VITEST || process.env.PRICE_WORKER === '0';
}

export function runPriceTask<T extends PriceTask>(task: T): Promise<PriceTaskResult<T>> {
  if (inline()) {
    try {
      return Promise.resolve(runPriceTaskInline(task) as PriceTaskResult<T>);
    } catch (e) {
      return Promise.reject(e);
    }
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl, { resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB } });
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
      void worker.terminate();
    };
    worker.once('message', (reply: PriceTaskReply) =>
      done(() => (reply.ok ? resolve(reply.result as PriceTaskResult<T>) : reject(new Error(reply.message)))),
    );
    worker.once('error', (e) => done(() => reject(e)));
    worker.once('exit', (code) => done(() => reject(new Error(`Потік розбору прайсу завершився (код ${code})`))));
    worker.postMessage(task);
  });
}
