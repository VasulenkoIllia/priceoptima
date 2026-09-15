import type {
  CurrencyCode,
  ImportMissingPolicy,
  ImportRowAction,
  ImportSource,
  ImportStatus,
  AvailabilityStatus,
} from '../enums';
import type { ISODateTime, UUID, UserRef } from './common';
import type { AvailabilityMap } from './suppliers';

export type ImportField =
  | 'sku'
  | 'nameWork'
  | 'name1c'
  | 'brand'
  | 'unit'
  | 'currency'
  | 'purchasePrice'
  | 'rrp'
  | 'stockQty'
  | 'availability'
  | 'multiplicity'
  | 'productUrl';

export interface ColumnRef {
  /** 0-based колонка */
  index: number;
  /** Для повторного автозіставлення. */
  header?: string;
}

/** Обов'язкові: sku, nameWork, purchasePrice (або rrp). */
export type ImportColumnMap = Partial<Record<ImportField, ColumnRef>>;

export interface ImportOptions {
  defaultCurrency: CurrencyCode;
  defaultUnit: string;
  pricesIncludeVat: boolean;
  rrpIncludesVat: boolean;
  decimalSeparator: 'auto' | ',' | '.';
  skipRowsWithoutPrice: boolean;
  missingPolicy: ImportMissingPolicy;
  availabilityMap?: AvailabilityMap;
  /** Оновлювати назви існуючих товарів (d: false). */
  updateNames: boolean;
}

export interface ImportProfileDto {
  id: UUID;
  supplierId: UUID;
  name: string;
  isDefault: boolean;
  sheetName: string | null;
  headerRow: number | null;
  columnMap: ImportColumnMap;
  options: ImportOptions;
  sourceUrl: string | null;
  lastUsedAt: ISODateTime | null;
}
export type ImportProfileInput = Omit<ImportProfileDto, 'id' | 'supplierId' | 'lastUsedAt'>;

export interface ImportStats {
  totalRows: number;
  parsedRows: number;
  skipped: number;
  errors: number;
  toCreate: number;
  toUpdate: number;
  unchanged: number;
  priceUp: number;
  priceDown: number;
  missingInFile: number;
  duplicatesInFile: number;
  created?: number;
  updated?: number;
  markedOutOfStock?: number;
  archived?: number;
  durationMs?: number;
}

export interface ImportDto {
  id: UUID;
  supplierId: UUID;
  supplierName: string;
  profileId: UUID | null;
  source: ImportSource;
  originalFilename: string;
  fileSize: number;
  status: ImportStatus;
  sheetName: string | null;
  headerRow: number | null;
  columnMap: ImportColumnMap | null;
  options: ImportOptions | null;
  stats: ImportStats | null;
  errorMessage: string | null;
  createdBy: UserRef | null;
  createdAt: ISODateTime;
  appliedAt: ISODateTime | null;
}

export interface ImportAnalysis {
  sheets: { name: string; rowCount: number }[];
  sheetName: string;
  headerRowGuess: number | null;
  headerCandidates: { row: number; score: number }[];
  headers: string[];
  columnGuess: ImportColumnMap;
  /** Перші 30 рядків після заголовка. */
  sampleRows: (string | number | null)[][];
}

export interface ImportMappingBody {
  sheetName: string;
  headerRow: number;
  columnMap: ImportColumnMap;
  options: ImportOptions;
  saveProfile?: { name: string; isDefault: boolean } | null;
  /** Оновити існуючий профіль. */
  profileId?: UUID | null;
}

type DiffValue = { old: string | number | null; new: string | number | null };
export type ImportRowDiff = Partial<
  Record<
    'nameWork' | 'name1c' | 'unitCode' | 'currency' | 'purchasePrice' | 'rrp' | 'stockQty' | 'availability' | 'multiplicity',
    DiffValue
  >
> & { purchasePricePct?: number | null; rrpPct?: number | null };

export interface ImportRowDto {
  rowNumber: number;
  action: ImportRowAction;
  sku: string | null;
  nameWork: string | null;
  unitCode: string | null;
  currency: CurrencyCode | null;
  purchasePrice: number | null;
  rrp: number | null;
  stockQty: number | null;
  availability: AvailabilityStatus | null;
  productId: UUID | null;
  diff: ImportRowDiff | null;
  messages: string[];
}

export interface ImportApplyBody {
  missingPolicy?: ImportMissingPolicy;
}

/** Результат розбору рядків заявки клієнта (імпорт з Excel / вставка з буфера). */
export interface ParsedLinesResult {
  rows: { name: string; unit: string | null; qty: number | null; note: string | null }[];
  headerRow: number | null;
  columns: { name: number | null; unit: number | null; qty: number | null; note: number | null };
  warnings: string[];
}
