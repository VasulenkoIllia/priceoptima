import type { ISODate, ISODateTime } from '../types';

const DASH = '—';
const MONTHS_GENITIVE = [
  'січня',
  'лютого',
  'березня',
  'квітня',
  'травня',
  'червня',
  'липня',
  'серпня',
  'вересня',
  'жовтня',
  'листопада',
  'грудня',
];

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

// Час показуємо за київським часом незалежно від налаштувань браузера.
let tz: string | undefined;
function timeZone(): string | undefined {
  if (tz !== undefined) return tz || undefined;
  for (const candidate of ['Europe/Kyiv', 'Europe/Kiev']) {
    try {
      new Intl.DateTimeFormat('uk-UA', { timeZone: candidate });
      tz = candidate;
      return tz;
    } catch {
      // пробуємо наступну назву зони
    }
  }
  tz = '';
  return undefined;
}

let partsFmt: Intl.DateTimeFormat | undefined;
function partsFormatter(): Intl.DateTimeFormat {
  partsFmt ??= new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  return partsFmt;
}

interface DateParts {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
}

function parts(input: ISODate | ISODateTime | Date): DateParts | null {
  if (typeof input === 'string') {
    const m = DATE_ONLY.exec(input);
    if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), hh: 0, mm: 0, ss: 0 };
  }
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  const p: Record<string, number> = {};
  for (const x of partsFormatter().formatToParts(date)) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return { y: p.year ?? 0, m: p.month ?? 0, d: p.day ?? 0, hh: p.hour ?? 0, mm: p.minute ?? 0, ss: p.second ?? 0 };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** '18.08.2026' */
export function formatDate(d: ISODate | ISODateTime | Date | null | undefined): string {
  const p = d ? parts(d) : null;
  return p ? `${pad(p.d)}.${pad(p.m)}.${p.y}` : DASH;
}

/** '18 серпня 2026 р.' */
export function formatDateLong(d: ISODate | ISODateTime | Date | null | undefined): string {
  const p = d ? parts(d) : null;
  return p ? `${p.d} ${MONTHS_GENITIVE[p.m - 1]} ${p.y} р.` : DASH;
}

/** '12:03:15' */
export function formatTime(d: ISODateTime | Date | null | undefined, withSeconds = true): string {
  const p = d ? parts(d) : null;
  if (!p) return DASH;
  return withSeconds ? `${pad(p.hh)}:${pad(p.mm)}:${pad(p.ss)}` : `${pad(p.hh)}:${pad(p.mm)}`;
}

/** '18.08.2026 12:03' */
export function formatDateTime(d: ISODateTime | Date | null | undefined): string {
  const p = d ? parts(d) : null;
  return p ? `${pad(p.d)}.${pad(p.m)}.${p.y} ${pad(p.hh)}:${pad(p.mm)}` : DASH;
}

/** Календарна дата за Києвом: Date → '2026-09-11'. */
export function toIsoDate(d: Date): ISODate {
  const p = parts(d);
  return p ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : '';
}
