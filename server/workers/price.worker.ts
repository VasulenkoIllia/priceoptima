// Окремий потік для важкої частини оновлення прайсу: розбір вигрузки (десятки мегабайт JSON/XML) і звірка
// з каталогом постачальника (сотні тисяч позицій). У головному потоці це «заморожувало» сервер для всіх на 1–3 с.
import { parentPort } from 'node:worker_threads';
import type { PriceTask, PriceTaskReply } from '../lib/priceWorker';
import { runPriceTaskInline } from '../lib/priceWorkerTasks';

parentPort?.on('message', (task: PriceTask) => {
  let reply: PriceTaskReply;
  try {
    reply = { ok: true, result: runPriceTaskInline(task) };
  } catch (e) {
    reply = { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  parentPort?.postMessage(reply);
});
