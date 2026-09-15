// Ступінчастий графік вхідної ціни за часом (inline SVG, без бібліотек).
import { CURRENCY_LABELS, type CurrencyCode } from '@shared/enums';
import { formatDate, formatDateTime, formatPct, formatRate } from '@shared/format';
import type { PriceHistoryEntry } from '@shared/types';
import { BRAND_COLOR, SEMANTIC_COLORS } from '@/theme';

const W = 560;
const H = 150;
const PAD = { top: 12, right: 14, bottom: 22, left: 60 };
const DAY_MS = 86_400_000;
const AXIS_TEXT = 'rgba(0,0,0,0.45)';

interface Point {
  t: number;
  v: number;
  at: string;
}

export interface PriceHistoryChartProps {
  /** Від найновішого запису (як повертає getPriceHistory). */
  history: PriceHistoryEntry[];
  currency: CurrencyCode;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function PriceHistoryChart({ history, currency }: PriceHistoryChartProps) {
  const cur = CURRENCY_LABELS[currency];
  const points: Point[] = history
    .flatMap((h) => (h.purchasePrice != null && h.currency === currency ? [{ t: Date.parse(h.effectiveAt), v: h.purchasePrice, at: h.effectiveAt }] : []))
    .sort((a, b) => a.t - b.t);

  if (!points.length) {
    return (
      <div className="po-cat-chart">
        <div className="po-cat-chart-empty">Немає даних про вхідну ціну</div>
      </div>
    );
  }

  const first = points[0];
  const last = points[points.length - 1];
  const t0 = first.t;
  const t1 = Math.max(last.t, Date.now());
  const span = Math.max(t1 - t0, DAY_MS);
  const values = points.map((p) => p.v);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const pad = (dataMax - dataMin) * 0.2 || Math.max(Math.abs(dataMax) * 0.05, 0.01);
  const min = dataMin - pad;
  const max = dataMax + pad;
  const x = (t: number) => r1(PAD.left + ((t - t0) / span) * (W - PAD.left - PAD.right));
  const y = (v: number) => r1(PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom));
  const bottom = H - PAD.bottom;

  // ціна тримається до наступної зміни: горизонталь, потім вертикаль
  let line = `M${x(first.t)},${y(first.v)}`;
  for (const p of points.slice(1)) line += ` H${x(p.t)} V${y(p.v)}`;
  line += ` H${x(t1)}`;
  const area = `${line} V${bottom} H${x(t0)} Z`;

  const ticks = dataMax === dataMin ? [dataMax] : [dataMax, dataMin];
  const changePct = first.v ? ((last.v - first.v) / first.v) * 100 : 0;
  const changeColor = changePct > 0 ? SEMANTIC_COLORS.error : SEMANTIC_COLORS.min;

  return (
    <div className="po-cat-chart">
      <div className="po-cat-chart-head">
        <span>Вхід без ПДВ, {cur}</span>
        {points.length > 1 && Math.abs(changePct) >= 0.01 ? (
          <span className="po-num" style={{ color: changeColor }}>
            {changePct > 0 ? '▲' : '▼'} {formatPct(Math.abs(changePct), 1)} за період
          </span>
        ) : (
          <span>без змін</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Графік вхідної ціни">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke={SEMANTIC_COLORS.border} strokeDasharray="3 3" />
            <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill={AXIS_TEXT}>
              {formatRate(v)}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={bottom} y2={bottom} stroke={SEMANTIC_COLORS.border} />
        <path d={area} fill={BRAND_COLOR} fillOpacity={0.07} />
        <path d={line} fill="none" stroke={BRAND_COLOR} strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle
            key={`${p.t}-${i}`}
            cx={x(p.t)}
            cy={y(p.v)}
            r={p === last ? 4 : 3}
            fill={p === last ? BRAND_COLOR : '#fff'}
            stroke={BRAND_COLOR}
            strokeWidth={1.5}
          >
            <title>{`${formatDateTime(p.at)} — ${formatRate(p.v)} ${cur}`}</title>
          </circle>
        ))}
        <text x={PAD.left} y={H - 6} fontSize={10} fill={AXIS_TEXT}>
          {formatDate(new Date(t0))}
        </text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize={10} fill={AXIS_TEXT}>
          {formatDate(new Date(t1))}
        </text>
      </svg>
    </div>
  );
}
