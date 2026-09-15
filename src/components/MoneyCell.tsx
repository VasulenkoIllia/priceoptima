import { formatMoney } from '@shared/format';

export interface MoneyCellProps {
  value: number | null | undefined;
  /** Позначка валюти після числа ('грн', 'USD'). */
  suffix?: string;
  decimals?: number;
  strong?: boolean;
  muted?: boolean;
  /** Закреслено (виключена пропозиція). */
  strike?: boolean;
  className?: string;
  title?: string;
}

/** Сума: '1 234,56', моноширинні цифри; null → '—'. Придатна як cellRenderer AG Grid і в звичайній розмітці. */
export function MoneyCell({ value, suffix, decimals = 2, strong, muted, strike, className, title }: MoneyCellProps) {
  const style: React.CSSProperties = {
    fontWeight: strong ? 600 : undefined,
    color: muted ? 'rgba(0,0,0,0.45)' : undefined,
    textDecoration: strike ? 'line-through' : undefined,
  };
  return (
    <span className={`po-num${className ? ` ${className}` : ''}`} style={style} title={title}>
      {formatMoney(value, decimals)}
      {suffix && value != null ? ` ${suffix}` : ''}
    </span>
  );
}
