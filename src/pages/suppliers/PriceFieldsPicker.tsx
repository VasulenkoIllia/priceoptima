// Що оновлює прайс: галочки ручного оновлення з вигрузки й завантаження файлом (правки замовника 28.09).
// Ціни й наявність — відмічене оновлюється, як в автооновленні; опис — відмічене замінюється значенням із прайсу,
// не відмічене лише заповнює порожнє. Артикул не змінюється ніколи: за ним товар звіряється з прайсом.
import { Checkbox, Tooltip } from 'antd';
import {
  PRICE_BASE_FIELDS,
  PRICE_REPLACE_FIELDS,
  PRICE_UPDATE_FIELD_LABELS,
  PRICE_UPDATE_FIELDS,
  type PriceUpdateField,
} from '@shared/catalog/priceUpdateFields';

/** Недоступні поля з поясненням (у прайсі немає такої колонки, у гібриді вхідні ціни з файлу тощо). */
export type UnavailableFields = Partial<Record<PriceUpdateField, string>>;

const HINTS: Partial<Record<PriceUpdateField, string>> = {
  images: 'Фото з прайсу замінюються новими, перше стає головним; фото, завантажені вручну, лишаються',
  markMissing: 'Товари постачальника, яких немає в прайсі, отримають позначку «немає у прайсі» (через 30 днів вони підуть в архів)',
  name1c: 'Лише товарам, у яких назва 1С порожня; вписані вручну назви 1С не змінюються',
};

/** Поля, що підуть на сервер: відмічені й доступні. */
export function effectiveFields(value: readonly PriceUpdateField[], unavailable: UnavailableFields = {}): PriceUpdateField[] {
  return PRICE_UPDATE_FIELDS.filter((f) => value.includes(f) && !unavailable[f]);
}

interface PriceFieldsPickerProps {
  value: readonly PriceUpdateField[];
  onChange(next: PriceUpdateField[]): void;
  unavailable?: UnavailableFields;
  disabled?: boolean;
}

export function PriceFieldsPicker({ value, onChange, unavailable = {}, disabled }: PriceFieldsPickerProps) {
  const toggle = (field: PriceUpdateField, on: boolean) => {
    const next = new Set(value);
    if (on) next.add(field);
    else next.delete(field);
    onChange(PRICE_UPDATE_FIELDS.filter((f) => next.has(f)));
  };
  const box = (field: PriceUpdateField) => {
    const why = unavailable[field];
    const label = field === 'images' ? 'Фото (замінити)' : PRICE_UPDATE_FIELD_LABELS[field];
    const checkbox = (
      <Checkbox checked={!why && value.includes(field)} disabled={disabled || !!why} onChange={(e) => toggle(field, e.target.checked)}>
        {label}
      </Checkbox>
    );
    const title = why ?? HINTS[field];
    return (
      <span key={field} className="po-pf-item">
        {title ? <Tooltip title={title}>{checkbox}</Tooltip> : checkbox}
      </span>
    );
  };
  return (
    <div className="po-pf">
      <div className="po-pf-group">
        <div className="po-pf-title">Ціни й наявність</div>
        <div className="po-pf-items">{PRICE_BASE_FIELDS.map(box)}</div>
      </div>
      <div className="po-pf-group">
        <div className="po-pf-title">Замінити з прайсу</div>
        <div className="po-pf-hint">Не відмічене: порожнє заповнюється з прайсу, заповнене не змінюється. Артикул не змінюється ніколи.</div>
        <div className="po-pf-items">{PRICE_REPLACE_FIELDS.map(box)}</div>
      </div>
      <div className="po-pf-group">
        <div className="po-pf-title">Назва 1С</div>
        <div className="po-pf-items">{box('name1c')}</div>
      </div>
    </div>
  );
}
