// Підписи для карток постачальників.
import { formatDate, formatDateTime, formatPct, formatRate } from '@shared/format';
import { FEED_CONNECTOR_INFO } from '@shared/catalog/connectors';
import type {
  ISODateTime,
  PriceListRates,
  PriceSourceKind,
  PriceSourceRoles,
  SupplierListItem,
  SupplierPriceSource,
} from '@shared/types';

const KIND_LABELS: Record<PriceSourceKind, string> = { auto: 'Автоматично', manual: 'Вручну', hybrid: 'Гібрид' };

/** Частина прайсу приходить за посиланням (кнопка «Оновити зараз», розклад). */
export const viaLink = (kind: PriceSourceKind) => kind !== 'manual';

/** Ціни приносить менеджер файлом (кнопка «Завантажити прайс» — основна дія). */
export const pricesFromFile = (kind: PriceSourceKind) => kind !== 'auto';

export const PRICE_SOURCE_COLORS: Record<PriceSourceKind, string> = { auto: 'green', manual: 'blue', hybrid: 'cyan' };

const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/** «Автоматично · САНДІ — JSON · щодня о 06:00», «Вручну» або «Гібрид · SANWELL — XML · щодня о 06:00»; що саме оновлюється — sourceLines. */
export function priceSourceLabel(s: SupplierPriceSource): string {
  const parts = [KIND_LABELS[s.kind] ?? s.kind];
  if (viaLink(s.kind)) {
    if (s.connector) parts.push(FEED_CONNECTOR_INFO[s.connector]?.label ?? s.connector);
    if (s.scheduleHour != null) parts.push(`щодня о ${hourLabel(s.scheduleHour)}`);
  }
  return parts.join(' · ');
}

/** Рядок картки: що оновлює посилання чи файл і коли востаннє вдалося. */
export interface SourceLine {
  label: 'За посиланням' | 'Файлом';
  what: string;
  at: ISODateTime | null;
}

/** «вхідні ціни, РРЦ, наявність, нові й зниклі товари» — те, що веде джерело (РРЦ «лише де порожньо» тут не згадуємо). */
function rolesWhat(roles: PriceSourceRoles, byLink: boolean): string {
  const parts = [
    roles.purchasePrice ? 'вхідні ціни' : null,
    roles.rrp === 'set' ? 'РРЦ' : null,
    roles.stock ? 'наявність' : null,
    roles.assortment ? (byLink ? 'нові й зниклі товари' : 'нові товари') : null,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'нічого';
}

/**
 * Два рядки для картки списку: що бере посилання і що файл. «Гібрид»: файл — лише те, чого не веде посилання (вхідні);
 * «За посиланням» — лише посилання (файл там запасний шлях); «Файлом» — лише файл.
 */
export function sourceLines(s: SupplierPriceSource): SourceLine[] {
  const link = s.linkRoles;
  const lines: SourceLine[] = [];
  if (link) lines.push({ label: 'За посиланням', what: rolesWhat(link, true), at: s.lastLinkAt });
  if (s.kind === 'auto') return lines;
  const file = link
    ? {
        purchasePrice: s.fileRoles.purchasePrice && !link.purchasePrice,
        rrp: link.rrp === 'set' ? ('none' as const) : s.fileRoles.rrp,
        stock: s.fileRoles.stock && !link.stock,
        assortment: s.fileRoles.assortment && !link.assortment,
      }
    : s.fileRoles;
  lines.push({ label: 'Файлом', what: rolesWhat(file, false), at: s.lastFileAt });
  return lines;
}

/** Коли рядок оновлювався востаннє: дата й час або «ще не було». */
export function lastRunLabel(line: SourceLine): string {
  if (line.at) return formatDateTime(line.at);
  return line.label === 'Файлом' ? 'ще не завантажували' : 'ще не оновлювалось';
}

/** За посиланням, а вхідних цін у вигрузці немає — помаранчева позначка на картці. */
export const lacksPurchasePrice = (s: SupplierPriceSource) => s.kind === 'auto' && !s.linkRoles?.purchasePrice;

/** Рядок таблиці «Що оновлюється» у «Детальніше». */
export interface SourceFieldRow {
  field: string;
  how: string;
}

/** Таблиця «Що оновлюється»: кожне поле — посиланням чи файлом і як саме (те саме правило, що й на сервері). */
export function sourceFieldRows(s: SupplierPriceSource): SourceFieldRow[] {
  const link = s.linkRoles;
  const file = s.fileRoles;
  const linkText = s.scheduleHour != null ? `за посиланням щодня о ${hourLabel(s.scheduleHour)}` : 'за посиланням';
  // «За посиланням» файл — запасний шлях: те, чого у вигрузці немає, можна довантажити файлом
  const fileText = s.kind === 'auto' ? 'у вигрузці немає, можна файлом' : 'файлом («Завантажити прайс»)';
  const replace = link
    ? '«Оновити вручну» → «Замінити з прайсу» або ті самі галочки при завантаженні файлу'
    : 'галочки «Замінити з прайсу» при завантаженні';
  const rrp =
    link?.rrp === 'set'
      ? `${linkText}${file.rrp === 'fill' ? '; файл лише заповнює порожню' : ''}`
      : file.rrp === 'set'
        ? fileText
        : file.rrp === 'fill'
          ? 'файлом, лише де порожньо'
          : 'не оновлюється';
  // у «Гібриді» файл — звичайний шлях вхідних, і залишки з нього теж пишуться (до наступного оновлення за посиланням)
  const stock = link?.stock
    ? `${linkText}${s.kind === 'hybrid' && file.stock ? '; файл теж, якщо в ньому є залишки' : ''}`
    : file.stock
      ? fileText
      : 'не оновлюється';
  return [
    { field: 'Вхідна ціна', how: link?.purchasePrice ? linkText : file.purchasePrice ? fileText : 'не оновлюється' },
    { field: 'РРЦ', how: rrp },
    { field: 'Наявність', how: stock },
    {
      field: 'Нові товари, «немає у прайсі»',
      how: link?.assortment
        ? `${linkText}: нові додаються, відсутні позначаються`
        : 'файлом: нові додаються, відсутні з галочкою «Позначити зниклі»',
    },
    {
      field: 'Фото й описи',
      how: `${link?.assortment ? 'за посиланням' : 'з файлу'}, лише де порожньо; замінити: ${replace}`,
    },
    { field: 'Назви, бренд, одиниці', how: `самі не змінюються, порожні заповнюються з прайсу; замінити: ${replace}` },
  ];
}

/**
 * Спосіб курсу постачальника тими самими словами, що й у блоці заявки: «з прайсу; якщо немає — ручний курс постачальника
 * USD 41,20», «ручний курс постачальника: USD 41,20», «загальний», «НБУ + 1,5 %».
 */
export function ratePolicyLabel(s: Pick<SupplierListItem, 'ratePolicy' | 'rateAdjustPct' | 'manualRateUsd' | 'manualRateEur'>): string {
  if (s.ratePolicy === 'nbu_adjusted') return `НБУ ${s.rateAdjustPct >= 0 ? '+' : '−'} ${pctLabel(Math.abs(s.rateAdjustPct))}`;
  if (s.ratePolicy === 'nbu') return 'загальний';
  const parts = [s.manualRateUsd != null ? `USD ${formatRate(s.manualRateUsd)}` : null, s.manualRateEur != null ? `EUR ${formatRate(s.manualRateEur)}` : null].filter(Boolean);
  if (s.ratePolicy === 'manual') return parts.length ? `ручний курс постачальника: ${parts.join(' · ')}` : 'ручний курс постачальника (не вказано), поки що загальний';
  return parts.length ? `з прайсу; якщо немає, ручний курс постачальника ${parts.join(' · ')}` : 'з прайсу; якщо немає, загальний';
}

/** 'USD 45,00 · EUR 52,10 (від 12.09.2026)'; курсів немає — 'немає'. */
export function priceListRatesLabel(r: PriceListRates): string {
  const parts: string[] = [];
  if (r.USD != null) parts.push(`USD ${formatRate(r.USD)}`);
  if (r.EUR != null) parts.push(`EUR ${formatRate(r.EUR)}`);
  if (!parts.length) return 'немає';
  return `${parts.join(' · ')}${r.date ? ` (від ${formatDate(r.date)})` : ''}`;
}

/** 2 → '2 %', 1,5 → '1,50 %'. */
export function pctLabel(v: number): string {
  return formatPct(v, Number.isInteger(v) ? 0 : 2);
}

/** 'https://b2b.example.com/' → 'b2b.example.com'. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/** Перетягнута картка стає перед чи після картки, над якою її відпустили (порядок постачальників, правки 25.09 п.3). */
export function moveSupplier(ids: readonly string[], dragId: string, targetId: string, after: boolean): string[] {
  if (dragId === targetId || !ids.includes(dragId) || !ids.includes(targetId)) return [...ids];
  const rest = ids.filter((id) => id !== dragId);
  const at = rest.indexOf(targetId) + (after ? 1 : 0);
  return [...rest.slice(0, at), dragId, ...rest.slice(at)];
}

