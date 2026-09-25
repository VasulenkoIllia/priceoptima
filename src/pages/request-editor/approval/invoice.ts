// «Рахунок» (правки замовника 25.09 п.14): Excel для бухгалтера — погоджені позиції КП у порядку КП, погоджена к-сть,
// ціни й суми як у КП. Назва 1С — актуальна з каталогу (інакше зі знімка пропозиції); немає — клітинка жовта з підказкою
// запросити її в постачальника.
import { formatDate, formatRequestNumber } from '@shared/format';
import { approvedTotalsFromKp } from '@shared/pricing';
import type { DocumentRefs, KpSnapshot, RequestComputed, RequestDocument } from '@shared/types';
import { loadExcelJs, saveBlob, XLSX_MIME } from '@/lib/files';

export interface InvoiceRow {
  n: number;
  /** Назва 1С; null — немає ні в каталозі, ні в пропозиції. */
  name1c: string | null;
  /** Назва, як у КП. */
  kpName: string;
  sku: string;
  supplierName: string;
  unit: string;
  qty: number;
  price: number;
  sum: number;
}

export interface Invoice {
  rows: InvoiceRow[];
  priceHeader: string;
  sumHeader: string;
  /** У КП є ПДВ (ТОВ-платник): унизу «без ПДВ», «ПДВ», «з ПДВ»; інакше — лише «Разом». */
  withVat: boolean;
  totalNet: number;
  vat: number;
  totalGross: number;
  /** Позицій без назви 1С. */
  missing1c: number;
}

/** Рахунок із погоджених позицій КП-основи; null — погоджених немає. */
export function buildInvoice(
  doc: Pick<RequestDocument, 'lines' | 'blocks' | 'offers'> & { refs: Pick<DocumentRefs, 'suppliers'> },
  computed: Pick<RequestComputed, 'markup'>,
  base: Pick<KpSnapshot, 'rows' | 'totals' | 'columns'>,
): Invoice | null {
  const approved = approvedTotalsFromKp(base, doc.lines);
  if (!approved) return null;
  const blocks = new Map(doc.blocks.map((b) => [b.id, b]));
  const rows = approved.rows.map((r, i): InvoiceRow => {
    // пропозиція з КП: той самий артикул у рядку; якщо вибір потім змінили — поточна обрана
    const effectiveId = computed.markup.rows[r.lineId]?.effectiveOfferId;
    const offer =
      doc.offers.find((o) => o.lineId === r.lineId && r.code != null && o.sku === r.code) ?? doc.offers.find((o) => o.id === effectiveId);
    const supplierId = offer ? blocks.get(offer.blockId)?.supplierId : null;
    const name1c = offer?.catalog?.name1c?.trim() || offer?.name1c?.trim() || null;
    return {
      n: i + 1,
      name1c,
      kpName: r.name,
      sku: r.code ?? offer?.sku ?? '',
      supplierName: (supplierId ? doc.refs.suppliers[supplierId]?.name : null) ?? '',
      unit: r.unit,
      qty: r.qty,
      price: r.price,
      sum: r.sum,
    };
  });
  return {
    rows,
    priceHeader: base.columns.priceHeader,
    sumHeader: base.columns.sumHeader,
    withVat: base.totals.vatMode !== 'no_vat',
    totalNet: approved.totalNet,
    vat: approved.vat,
    totalGross: approved.totalGross,
    missing1c: rows.filter((r) => !r.name1c).length,
  };
}

/** Текст у клітинці «Назва 1С», коли назви немає. */
export function missing1cText(r: Pick<InvoiceRow, 'supplierName' | 'sku'>): string {
  const who = r.supplierName ? ` в постачальника ${r.supplierName}` : ' в постачальника';
  return `Немає назви 1С: запросити${who}${r.sku ? ` (артикул ${r.sku})` : ''}`;
}

export interface InvoiceMeta {
  requestNumber: number;
  kp: Pick<KpSnapshot, 'numberLabel' | 'date' | 'seller' | 'buyer'>;
}

const LINE = { style: 'thin' as const, color: { argb: 'FFB8C2D0' } };
const BOX = { top: LINE, left: LINE, bottom: LINE, right: LINE };
const MISSING_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFF3C4' } };
const MONEY = '#,##0.00';
const COLS = 9;

const party = (label: string, p: { title: string; lines: string[] }) => [label, p.title, ...p.lines].filter(Boolean).join(' · ');

export async function buildInvoiceWorkbook(invoice: Invoice, meta: InvoiceMeta) {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Рахунок', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [{ width: 5 }, { width: 50 }, { width: 50 }, { width: 18 }, { width: 20 }, { width: 8 }, { width: 11 }, { width: 14 }, { width: 16 }];

  const title = (row: number, text: string, bold = false) => {
    ws.mergeCells(row, 1, row, COLS);
    const cell = ws.getCell(row, 1);
    cell.value = text;
    cell.font = bold ? { bold: true, size: 13 } : { color: { argb: 'FF555555' } };
    cell.alignment = { wrapText: true, vertical: 'top' };
  };
  title(1, `Для рахунку: КП № ${meta.kp.numberLabel} від ${formatDate(meta.kp.date)}`, true);
  title(2, party('Постачальник:', meta.kp.seller));
  title(3, party('Покупець:', meta.kp.buyer));
  title(4, invoice.missing1c ? `Без назви 1С: ${invoice.missing1c} поз., запросити в постачальників (жовті клітинки)` : 'Назви 1С є в усіх позиціях');
  if (invoice.missing1c) ws.getCell(4, 1).font = { bold: true, color: { argb: 'FF9A6700' } };

  const HEAD = 6;
  const head = ws.getRow(HEAD);
  head.values = ['№', 'Найменування 1С', 'Найменування в КП', 'Артикул', 'Постачальник', 'Од.', 'Кількість', invoice.priceHeader, invoice.sumHeader];
  head.eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F8' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = BOX;
  });

  invoice.rows.forEach((r, i) => {
    const row = ws.getRow(HEAD + 1 + i);
    row.values = [r.n, r.name1c ?? missing1cText(r), r.kpName, r.sku, r.supplierName, r.unit, r.qty, r.price, r.sum];
    for (let c = 1; c <= COLS; c++) {
      row.getCell(c).border = BOX;
      row.getCell(c).alignment = { vertical: 'top', wrapText: c === 2 || c === 3, horizontal: c === 2 || c === 3 ? 'left' : 'center' };
    }
    if (!r.name1c) {
      row.getCell(2).fill = MISSING_FILL;
      row.getCell(2).font = { italic: true, color: { argb: 'FF9A6700' } };
    }
    row.getCell(7).numFmt = '#,##0.###';
    row.getCell(8).numFmt = MONEY;
    row.getCell(9).numFmt = MONEY;
  });

  const totals: [string, number][] = invoice.withVat
    ? [
        ['Разом без ПДВ', invoice.totalNet],
        ['ПДВ', invoice.vat],
        ['Разом з ПДВ', invoice.totalGross],
      ]
    : [['Разом', invoice.totalGross]];
  totals.forEach(([label, value], i) => {
    const row = ws.getRow(HEAD + 1 + invoice.rows.length + i);
    row.getCell(8).value = label;
    row.getCell(8).alignment = { horizontal: 'right' };
    row.getCell(9).value = value;
    row.getCell(9).numFmt = MONEY;
    row.font = { bold: i === totals.length - 1 };
  });
  ws.views = [{ state: 'frozen', ySplit: HEAD }];
  return wb;
}

export async function downloadInvoice(invoice: Invoice, meta: InvoiceMeta): Promise<void> {
  const wb = await buildInvoiceWorkbook(invoice, meta);
  const data = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([data], { type: XLSX_MIME }), `Рахунок ${formatRequestNumber(meta.requestNumber)}.xlsx`);
}
