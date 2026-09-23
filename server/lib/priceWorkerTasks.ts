// Завдання окремого потоку оновлення прайсу — чисті функції без бази (їх же виконуємо в тестах без потоку).
import type { FeedConnector } from '@shared/catalog/connectors';
import { parseFeed, type AdapterOptions, type AdapterResult } from '../modules/price-updates/connectors';
import { planApply, type ApplyPlan, type PlanInput, type PlanRejection } from '../modules/price-updates/plan';

export type PriceTask =
  | { kind: 'parseFeed'; connector: FeedConnector; body: string; options: Partial<AdapterOptions> }
  | { kind: 'plan'; input: Omit<PlanInput, 'newId'> };

export type PriceTaskResult<T extends PriceTask> = T extends { kind: 'parseFeed' } ? AdapterResult : ApplyPlan | PlanRejection;

export function runPriceTaskInline(task: PriceTask): AdapterResult | ApplyPlan | PlanRejection {
  return task.kind === 'parseFeed' ? parseFeed(task.connector, task.body, task.options) : planApply(task.input);
}
