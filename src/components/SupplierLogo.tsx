import { useState } from 'react';
import { initialsOf } from '@/lib/initials';

export interface SupplierLogoProps {
  name: string;
  logoUrl?: string | null;
  color?: string | null;
  /** Висота бейджа, px. */
  size?: number;
  showName?: boolean;
  /** Ширина логотипа (для широких PNG); за замовчуванням квадрат. */
  width?: number;
}

/** Логотип постачальника: зображення (SVG-бейдж або PNG з оверрайдів) або ініціали на кольоровому тлі. */
export function SupplierLogo({ name, logoUrl, color, size = 20, showName, width }: SupplierLogoProps) {
  const [failed, setFailed] = useState(false);
  const useImage = !!logoUrl && !failed;
  return (
    <span className="po-logo" title={showName ? undefined : name}>
      <span
        className="po-logo-box"
        style={{ width: width ?? size, height: size, background: useImage ? '#fff' : (color ?? '#607D8B') }}
      >
        {useImage ? (
          <img src={logoUrl!} alt={name} onError={() => setFailed(true)} />
        ) : (
          <span className="po-logo-initials" style={{ fontSize: Math.max(8, Math.round(size * 0.42)) }}>
            {initialsOf(name)}
          </span>
        )}
      </span>
      {showName ? <span className="po-logo-name">{name}</span> : null}
    </span>
  );
}
