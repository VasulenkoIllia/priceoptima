// Публічне API демо-каталогу: детермінований генератор постачальників, товарів з історією цін і демо-заявок.
// Чистий TypeScript без Node API — можна запускати і в браузері, і в тестах.

export { DEFAULT_SEED, generateCatalog, offerPriceUah, RRP_RATIO_RANGE } from './generate';
export type { GenerateOptions } from './generate';
export type {
  Currency,
  DemoCatalog,
  DemoCategory,
  DemoMarkupMethod,
  DemoOffer,
  DemoPricePoint,
  DemoProduct,
  DemoRequest,
  DemoRequestLine,
  DemoRequestStatus,
  DemoSupplier,
  SupplierKey,
} from './types';
