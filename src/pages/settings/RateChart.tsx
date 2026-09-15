// Лінійний графік курсу за датами (inline SVG, без бібліотек).
import type { ForeignCurrency } from '@shared/enums';
import { formatDate, formatRate } from '@shared/format';
import type { ISODate } from '@shared/types';
import { SEMANTIC_COLORS } from '@/theme';

export interface RatePoint {
  date: ISODate;
  rate: number;
}

const W = 480;
const H = 130;
const PAD = { top: 10, right: 10, bottom: 20, left: 52 };
const AXIS_TEXT = 'rgba(0,0,0,0.45)';
const r1 = (n: number) => Math.round(n * 10) / 10;

export interface RateChartProps {
  /** Від найстарішої дати. */
  points: RatePoint[];
  currency: ForeignCurrency;
  color: string;
}

export function RateChart({ points, currency, color }: RateChartProps) {
  if (points.length < 2) return null;
  const rates = points.map((p) => p.rate);
  const dataMin = Math.min(...rates);
  const dataMax = Math.max(...rates);
  const pad = (dataMax - dataMin) * 0.15 || 0.05;
  const min = dataMin - pad;
  const max = dataMax + pad;
  const n = points.length - 1;
  const x = (i: number) => r1(PAD.left + (i / n) * (W - PAD.left - PAD.right));
  const y = (v: number) => r1(PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom));
  const bottom = H - PAD.bottom;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.rate)}`).join(' ');
  const gradId = `po-rate-grad-${currency}`;
  const last = points[n];

  return (
    <div className="po-rates-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Графік курсу ${currency}`}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[dataMax, dataMin].map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke={SEMANTIC_COLORS.border} strokeDasharray="3 3" />
            <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill={AXIS_TEXT}>
              {formatRate(v)}
            </text>
          </g>
        ))}
        <path d={`${line} L${x(n)},${bottom} L${x(0)},${bottom} Z`} fill={`url(#${gradId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={p.date} cx={x(i)} cy={y(p.rate)} r={5} fill="transparent">
            <title>{`${formatDate(p.date)} — ${formatRate(p.rate)} грн`}</title>
          </circle>
        ))}
        <circle cx={x(n)} cy={y(last.rate)} r={3.5} fill={color} stroke="#fff" strokeWidth={1.5} pointerEvents="none" />
        <text x={PAD.left} y={H - 5} fontSize={10} fill={AXIS_TEXT}>
          {formatDate(points[0].date)}
        </text>
        <text x={W - PAD.right} y={H - 5} textAnchor="end" fontSize={10} fill={AXIS_TEXT}>
          {formatDate(last.date)}
        </text>
      </svg>
    </div>
  );
}
