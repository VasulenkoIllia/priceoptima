import { InfoCircleFilled } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { formatQty, formatWarning } from '@shared/format';
import { SEMANTIC_COLORS } from '@/theme';

export interface QtyCellProps {
  qty: number | null | undefined;
  unit?: string | null;
  /** К-сть рядка до автоокруглення (118 при к-сті 120) — показується помаранчева підказка. */
  roundedFrom?: number | null;
  multiplicity?: number | null;
}

/** Кількість з одиницею; при автоокругленні кратності — іконка «округлено з 118, кратно 4». */
export function QtyCell({ qty, unit, roundedFrom, multiplicity }: QtyCellProps) {
  const rounded = roundedFrom != null && qty != null && roundedFrom !== qty;
  return (
    <span className="po-num" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {formatQty(qty)}
      {unit ? <span className="po-muted">{unit}</span> : null}
      {rounded ? (
        <Tooltip title={formatWarning({ code: 'QTY_ROUNDED', params: { from: roundedFrom, to: qty, multiplicity: multiplicity ?? 1 } })}>
          <InfoCircleFilled style={{ color: SEMANTIC_COLORS.warning, fontSize: 12 }} aria-label="Кількість округлено" />
        </Tooltip>
      ) : null}
    </span>
  );
}
