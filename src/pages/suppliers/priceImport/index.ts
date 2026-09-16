// Завантаження прайсу постачальника файлом і наш шаблон Excel.
export { PriceImportDialog, type PriceImportDialogProps } from './PriceImportDialog';
export { downloadPriceTemplate, TEMPLATE_COLUMNS } from './template';
export { usePriceMappingStore, type SavedPriceMapping } from './mappingStore';
export {
  buildPriceRows,
  detectColumns,
  ROLE_LABELS,
  type PriceColumnMap,
  type PriceColumnRole,
  type PreviewRow,
} from './priceRows';
export { parseStockText, type ParsedStock } from './stock';
export { readSpreadsheetFile, SpreadsheetError, type SheetData } from './spreadsheet';
