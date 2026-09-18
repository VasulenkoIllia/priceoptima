// Підключення постачальників: сирий текст вигрузки → внутрішні рядки (PriceRow) і попередження.
// Кожен постачальник з автооновленням — свій модуль; перелік і підписи — у shared/catalog/connectors.
import type { FeedConnector } from '@shared/catalog/connectors';
import type { AdapterOptions, AdapterResult } from './types';
import { parseSandiJson } from './sandi';
import { parseSanwellXml } from './sanwell';
import { parseYml } from './yml';

export type { AdapterOptions, AdapterResult, PriceRow } from './types';
export { DEFAULT_ADAPTER_OPTIONS } from './types';

const PARSERS: Record<FeedConnector, (body: string, options?: Partial<AdapterOptions>) => AdapterResult> = {
  sandi: parseSandiJson,
  sanwell: parseSanwellXml,
  yml: parseYml,
};

/** Розбір вигрузки модулем постачальника. */
export function parseFeed(connector: FeedConnector, body: string, options?: Partial<AdapterOptions>): AdapterResult {
  const parse = PARSERS[connector] as (typeof PARSERS)[FeedConnector] | undefined;
  if (!parse) throw new Error(`Підключення не підтримується: ${String(connector)}`);
  return parse(body, options);
}
