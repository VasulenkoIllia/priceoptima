// Імпорт заявки клієнта з Excel (п.2.1 правок): автопошук колонок «найменування / од. / к-сть / примітка»,
// наш шаблон розпізнається одразу. Чисті функції (без DOM) — покриті тестами.
import { normalizeUnit, parseLocaleNumber } from '@shared/parse';
import type { NewLineInput } from '@/stores/requestDocStore';

export const REQUEST_COLUMN_ROLES = ['name', 'unit', 'qty', 'note'] as const;
export type RequestColumnRole = (typeof REQUEST_COLUMN_ROLES)[number];

export const REQUEST_ROLE_LABELS: Record<RequestColumnRole, string> = {
  name: 'Найменування',
  unit: 'Од.',
  qty: 'Кількість',
  note: 'Примітка',
};

export type RequestColumnMap = { headerRow: number | null } & Record<RequestColumnRole, number | null>;

export const EMPTY_REQUEST_MAP: RequestColumnMap = { headerRow: null, name: null, unit: null, qty: null, note: null };

/** Заголовки нашого шаблону (зірочка — обов'язкова колонка). */
export const REQUEST_TEMPLATE_HEADERS = ['№', 'Найменування*', 'Од.', 'Кількість*', 'Примітка'] as const;

/** Ключ заголовка: без регістру, пробілів і розділових знаків — «К-сть, шт.» → «кстьшт». */
export function requestHeaderKey(cell: string): string {
  return cell.toLocaleLowerCase('uk').replace(/[\s.,\-_/\\'’ʼ"()«»:;*№#]+/gu, '');
}

// перше правило, що збіглося, і виграє
const RULES: { re: RegExp; role: RequestColumnRole }[] = [
  { re: /^(од|одвим|одиниц|одиницявиміру|едизм|ед|единиц|unit|uom)/u, role: 'unit' },
  { re: /(кількіст|кільк|^ксть|колво|количеств|^кво$|^qty|quantity|^к$)/u, role: 'qty' },
  { re: /(примітк|коментар|комментар|примечан|^note|^comment|побажан)/u, role: 'note' },
  { re: /(найменуван|наименован|назва|название|номенклатур|^товар|^позиц|^матеріал|^материал|^опис|^описан|^name|^item|^product)/u, role: 'name' },
];

export function requestHeaderRole(cell: string): RequestColumnRole | null {
  const key = requestHeaderKey(cell);
  if (!key) return null;
  return RULES.find((r) => r.re.test(key))?.role ?? null;
}

/** Ролі колонок рядка заголовка (перша колонка з роллю виграє). */
export function mapRequestHeader(header: readonly string[]): Record<RequestColumnRole, number | null> {
  const map: Record<RequestColumnRole, number | null> = { name: null, unit: null, qty: null, note: null };
  header.forEach((cell, i) => {
    const role = requestHeaderRole(cell);
    if (role && map[role] == null) map[role] = i;
  });
  return map;
}

/** Рядок заголовка: перший у перших 30, де є назва і к-сть (або назва й од.). */
export function detectRequestColumns(rows: readonly string[][]): RequestColumnMap {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const map = mapRequestHeader(rows[i]);
    if (map.name != null && (map.qty != null || map.unit != null)) return { headerRow: i, ...map };
  }
  return { ...EMPTY_REQUEST_MAP };
}

/** Наш шаблон: заголовки збігаються з шаблоном (зірочки й регістр неважливі). */
export function isRequestTemplate(rows: readonly string[][]): boolean {
  const want = REQUEST_TEMPLATE_HEADERS.map(requestHeaderKey);
  return rows.slice(0, 5).some((r) => want.every((w, i) => requestHeaderKey(r[i] ?? '') === w));
}

/** Підпис знайденого шаблону колонок — щоб запам'ятати вибір користувача для таких самих файлів. */
export function headerSignature(rows: readonly string[][], headerRow: number | null): string | null {
  if (headerRow == null) return null;
  const keys = (rows[headerRow] ?? []).map(requestHeaderKey);
  return keys.some(Boolean) ? keys.join('|') : null;
}

const TOTAL_ROW = /^(разом|всього|усього|итого|всего|total|підсумок)/u;

/** «10 шт» → 10 і «шт»; «12,5» → 12,5. */
export function parseQtyCell(raw: string): { qty: number | null; unit: string | null; valid: boolean } {
  const text = raw.trim();
  if (!text) return { qty: null, unit: null, valid: true };
  const direct = parseLocaleNumber(text);
  if (direct.valid) return { qty: direct.value, unit: null, valid: direct.value == null || direct.value >= 0 };
  const m = /^([\d\s.,]+?)\s*([^\d\s.,][^\d]*)$/u.exec(text);
  if (m) {
    const n = parseLocaleNumber(m[1]);
    if (n.valid && n.value != null && n.value >= 0) return { qty: n.value, unit: m[2].trim() || null, valid: true };
  }
  return { qty: null, unit: null, valid: false };
}

export type RequestRowStatus = 'ok' | 'no_name' | 'total' | 'bad_qty';

export interface RequestPreviewRow {
  /** Номер рядка у файлі (з 1). */
  rowNumber: number;
  status: RequestRowStatus;
  line: NewLineInput | null;
  rawQty: string;
}

export interface RequestRowsResult {
  rows: RequestPreviewRow[];
  lines: NewLineInput[];
  /** Некоректна к-сть: рядок додається з к-стю 0 — заповнити вручну. */
  badQty: number;
  skipped: number;
}

/** Рядки заявки з даних під заголовком: без назви й рядки підсумків пропускаються. */
export function buildRequestRows(data: readonly string[][], map: RequestColumnMap): RequestRowsResult {
  const rows: RequestPreviewRow[] = [];
  const lines: NewLineInput[] = [];
  let badQty = 0;
  let skipped = 0;
  if (map.name == null) return { rows, lines, badQty, skipped };
  const cell = (r: readonly string[], i: number | null) => (i == null ? '' : (r[i] ?? '').trim());
  const start = map.headerRow == null ? 0 : map.headerRow + 1;
  for (let i = start; i < data.length; i++) {
    const r = data[i];
    if (r.every((c) => !c.trim())) continue;
    const name = cell(r, map.name);
    const rawQty = cell(r, map.qty);
    const rowNumber = i + 1;
    if (!name) {
      skipped++;
      rows.push({ rowNumber, status: 'no_name', line: null, rawQty });
      continue;
    }
    if (TOTAL_ROW.test(name.toLocaleLowerCase('uk')) && !cell(r, map.unit)) {
      skipped++;
      rows.push({ rowNumber, status: 'total', line: null, rawQty });
      continue;
    }
    const q = parseQtyCell(rawQty);
    const rawUnit = cell(r, map.unit) || q.unit || '';
    // колонки «Од.» у файлі клієнта може не бути — тоді рядок отримає типове «шт»
    const unit = rawUnit ? (normalizeUnit(rawUnit) ?? rawUnit) : undefined;
    const note = cell(r, map.note) || null;
    const line: NewLineInput = { clientName: name, ...(unit ? { clientUnit: unit } : {}), qty: q.valid ? (q.qty ?? 0) : 0, clientNote: note };
    if (!q.valid) badQty++;
    rows.push({ rowNumber, status: q.valid ? 'ok' : 'bad_qty', line, rawQty });
    lines.push(line);
  }
  return { rows, lines, badQty, skipped };
}
