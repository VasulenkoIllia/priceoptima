// Замовлення постачальникам (п.4.2 правок): лише погоджені позиції, по постачальниках обраних пропозицій,
// к-сть — погоджена, кратна пропозиції (округлення вгору). Один Excel, аркуш на кожного постачальника.
import { formatDate, formatRequestNumber } from '@shared/format';
import { checkMultiplicity, offerMultiplicity } from '@shared/pricing';
import type { DocumentRefs, KpRow, RequestComputed, RequestDocument, UUID } from '@shared/types';
import { loadExcelJs, saveBlob, XLSX_MIME } from '@/lib/files';

export interface SupplierOrderRow {
  lineId: UUID;
  sku: string;
  name: string;
  unit: string;
  qty: number;
  /** Погоджена к-сть була некратна — округлено вгору до кратності. */
  roundedFrom: number | null;
}

export interface SupplierOrder {
  supplierId: UUID | null;
  supplierName: string;
  rows: SupplierOrderRow[];
}

export interface SupplierOrdersResult {
  orders: SupplierOrder[];
  /** Погоджені рядки без обраної пропозиції (у замовлення не потрапили). */
  skipped: number;
}

/** Замовлення з погоджених рядків (к-сть — погоджена або з КП-основи) за постачальниками в порядку блоків. */
export function buildSupplierOrders(
  doc: Pick<RequestDocument, 'lines' | 'blocks' | 'offers'> & { refs: Pick<DocumentRefs, 'suppliers'> },
  computed: Pick<RequestComputed, 'markup'>,
  baseRows: readonly Pick<KpRow, 'lineId' | 'qty'>[],
): SupplierOrdersResult {
  const kpQty = new Map(baseRows.map((r) => [r.lineId, r.qty]));
  const offers = new Map(doc.offers.map((o) => [o.id, o]));
  const byBlock = new Map<UUID, SupplierOrderRow[]>();
  let skipped = 0;
  for (const line of [...doc.lines].sort((a, b) => a.position - b.position)) {
    if (!line.approval.approved || !kpQty.has(line.id)) continue;
    const mr = computed.markup.rows[line.id];
    const offer = mr?.effectiveOfferId ? offers.get(mr.effectiveOfferId) : undefined;
    if (!offer) {
      skipped++;
      continue;
    }
    const approved = line.approval.approvedQty ?? kpQty.get(line.id)!;
    const check = checkMultiplicity(approved, offerMultiplicity(offer));
    const qty = check.suggestedQty ?? approved;
    const list = byBlock.get(offer.blockId) ?? [];
    list.push({
      lineId: line.id,
      sku: offer.sku ?? '',
      name: offer.nameWork ?? offer.name1c ?? line.clientName,
      unit: offer.unitCode ?? line.clientUnit ?? '',
      qty,
      roundedFrom: qty !== approved ? approved : null,
    });
    byBlock.set(offer.blockId, list);
  }
  const orders = [...doc.blocks]
    .sort((a, b) => a.position - b.position)
    .flatMap((b): SupplierOrder[] => {
      const rows = byBlock.get(b.id);
      if (!rows?.length) return [];
      const supplier = b.supplierId ? doc.refs.suppliers[b.supplierId] : undefined;
      return [{ supplierId: b.supplierId, supplierName: supplier?.name ?? 'Постачальник', rows }];
    });
  return { orders, skipped };
}

/** Назва аркуша Excel: до 31 символу, без : \ / ? * [ ], унікальна в книзі. */
export function sheetName(name: string, taken: Set<string>): string {
  const base = name.replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Постачальник';
  let result = base;
  for (let i = 2; taken.has(result.toLowerCase()); i++) result = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  taken.add(result.toLowerCase());
  return result;
}

const LINE = { style: 'thin' as const, color: { argb: 'FFB8C2D0' } };
const BOX = { top: LINE, left: LINE, bottom: LINE, right: LINE };

export interface OrderMeta {
  requestNumber: number;
  requestDate: string;
  clientName: string | null;
}

export async function buildSupplierOrdersWorkbook(orders: readonly SupplierOrder[], meta: OrderMeta) {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  const taken = new Set<string>();
  for (const order of orders) {
    const ws = wb.addWorksheet(sheetName(order.supplierName, taken), {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = [{ width: 5 }, { width: 24 }, { width: 18 }, { width: 60 }, { width: 8 }, { width: 12 }];
    ws.mergeCells(1, 1, 1, 6);
    ws.getCell(1, 1).value = `Замовлення: ${order.supplierName}`;
    ws.getCell(1, 1).font = { bold: true, size: 13 };
    ws.mergeCells(2, 1, 2, 6);
    ws.getCell(2, 1).value = [
      `Заявка № ${formatRequestNumber(meta.requestNumber)} від ${formatDate(meta.requestDate)}`,
      meta.clientName ? `клієнт ${meta.clientName}` : null,
      `позицій: ${order.rows.length}`,
    ]
      .filter(Boolean)
      .join(' · ');
    ws.getCell(2, 1).font = { color: { argb: 'FF555555' } };

    const head = ws.getRow(4);
    head.values = ['№', 'Постачальник', 'Артикул', 'Найменування', 'Од.', 'Кількість'];
    head.eachCell((c) => {
      c.font = { bold: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F8' } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = BOX;
    });
    order.rows.forEach((r, i) => {
      const row = ws.getRow(5 + i);
      row.values = [i + 1, order.supplierName, r.sku, r.name, r.unit, r.qty];
      for (let c = 1; c <= 6; c++) row.getCell(c).border = BOX;
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'top' };
      row.getCell(4).alignment = { wrapText: true, vertical: 'top' };
      row.getCell(5).alignment = { horizontal: 'center', vertical: 'top' };
      row.getCell(6).numFmt = '#,##0.###';
      if (r.roundedFrom != null) row.getCell(6).note = `Погоджено ${r.roundedFrom}, округлено до кратності`;
    });
    ws.views = [{ state: 'frozen', ySplit: 4 }];
  }
  return wb;
}

export async function downloadSupplierOrders(orders: readonly SupplierOrder[], meta: OrderMeta): Promise<void> {
  const wb = await buildSupplierOrdersWorkbook(orders, meta);
  const data = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([data], { type: XLSX_MIME }), `Замовлення постачальникам ${formatRequestNumber(meta.requestNumber)}.xlsx`);
}
