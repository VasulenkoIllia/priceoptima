// Адаптери вигрузок постачальників: сирий текст прайсу → внутрішні рядки (PriceRow) і попередження.
import type { AdapterOptions, AdapterResult } from './types';
import { parseSandiJson } from './sandiJson';
import { parseSanwellXml } from './sanwellXml';
import { parseYml } from './ymlXml';

export type { AdapterOptions, AdapterResult, PriceRow } from './types';
export { DEFAULT_ADAPTER_OPTIONS } from './types';

/** Розбір вигрузки за форматом постачальника. */
export function parseFeed(format: 'json' | 'xml' | 'yml', body: string, options?: Partial<AdapterOptions>): AdapterResult {
  switch (format) {
    case 'json':
      return parseSandiJson(body, options);
    case 'xml':
      return parseSanwellXml(body, options);
    case 'yml':
      return parseYml(body, options);
    default: {
      const unsupported: never = format;
      throw new Error(`Формат вигрузки не підтримується: ${String(unsupported)}`);
    }
  }
}
