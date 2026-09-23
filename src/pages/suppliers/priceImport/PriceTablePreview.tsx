// Перегляд прайсу: сирі рядки файлу з позначками ролей і підсумковий перегляд розібраних рядків.
import { Table, Tag, Tooltip } from 'antd';
import { useMemo } from 'react';
import { AVAILABILITY_LABELS, CURRENCY_LABELS } from '@shared/enums';
import { formatMoney, formatQty } from '@shared/format';
import { columnLetter } from '@/lib/spreadsheet';
import { PRICE_COLUMN_ROLES, ROLE_LABELS, type PreviewRow, type PriceColumnMap } from './priceRows';

const short = (s: string, max = 26) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** Підписи колонок для Select: «C · Назва номенклатури». */
export function columnOptions(rows: readonly string[][], headerRow: number | null) {
  const width = rows.slice(0, 300).reduce((w, r) => Math.max(w, r.length), 0);
  const header = headerRow != null ? (rows[headerRow] ?? []) : [];
  return [
    { value: -1, label: 'немає' },
    ...Array.from({ length: width }, (_, c) => {
      const h = (header[c] ?? '').trim();
      return { value: c, label: h ? `${columnLetter(c)} · ${short(h)}` : `Колонка ${columnLetter(c)}` };
    }),
  ];
}

export interface SheetPreviewProps {
  rows: readonly string[][];
  mapping: PriceColumnMap;
  /** Скільки рядків показати. */
  limit?: number;
}

interface SheetRow {
  key: number;
  cells: readonly string[];
  isHeader: boolean;
}

/** Перші рядки файлу «як є»: букви колонок, позначки ролей, підсвічений рядок заголовка. */
export function SheetPreview({ rows, mapping, limit = 8 }: SheetPreviewProps) {
  const width = useMemo(() => rows.slice(0, 300).reduce((w, r) => Math.max(w, r.length), 0), [rows]);
  const rolesOf = (c: number) => PRICE_COLUMN_ROLES.filter((r) => mapping[r] === c);
  const start = mapping.headerRow ?? 0;
  const shown = rows.slice(start, start + limit + (mapping.headerRow != null ? 1 : 0));
  const data: SheetRow[] = shown.map((cells, i) => ({
    key: start + i,
    cells,
    isHeader: mapping.headerRow != null && i === 0,
  }));

  const columns = [
    {
      key: '#',
      title: '',
      width: 48,
      fixed: 'left' as const,
      render: (_: unknown, r: SheetRow) => <span className="po-muted po-num">{r.key + 1}</span>,
    },
    ...Array.from({ length: width }, (_, c) => {
      const roles = rolesOf(c);
      return {
        key: String(c),
        title: (
          <span className="po-pi-col">
            <span className="po-muted">{columnLetter(c)}</span>
            {roles.map((r) => (
              <Tag key={r} color="blue" bordered={false}>
                {ROLE_LABELS[r]}
              </Tag>
            ))}
          </span>
        ),
        className: roles.length ? 'po-pi-mapped' : undefined,
        ellipsis: true,
        width: roles.includes('name') ? 260 : 130,
        render: (_: unknown, r: SheetRow) => r.cells[c] ?? '',
      };
    }),
  ];

  const remaining = rows.length - start - shown.length;
  return (
    <div className="po-pi-sheet">
      <Table<SheetRow>
        size="small"
        bordered
        pagination={false}
        dataSource={data}
        columns={columns}
        scroll={{ x: 'max-content' }}
        rowClassName={(r) => (r.isHeader ? 'po-pi-header-row' : '')}
      />
      {remaining > 0 ? <div className="po-muted po-pi-more">… і ще рядків: {formatQty(remaining)}</div> : null}
    </div>
  );
}

export interface RowsPreviewProps {
  preview: readonly PreviewRow[];
  limit?: number;
}

/** Розібрані рядки: ціна вже без ПДВ, проблемні рядки підсвічені й не потраплять в імпорт. */
export function RowsPreview({ preview, limit = 50 }: RowsPreviewProps) {
  const data = preview.slice(0, limit);
  const columns = [
    {
      key: 'rowNumber',
      title: 'Рядок',
      width: 70,
      render: (_: unknown, r: PreviewRow) => <span className="po-muted po-num">{r.rowNumber}</span>,
    },
    {
      key: 'code',
      title: 'Код',
      width: 130,
      ellipsis: true,
      render: (_: unknown, r: PreviewRow) => <span className="po-num">{r.row.code || ''}</span>,
    },
    { key: 'sku', title: 'Артикул', width: 130, ellipsis: true, render: (_: unknown, r: PreviewRow) => r.row.sku ?? '' },
    { key: 'name', title: 'Назва', ellipsis: true, render: (_: unknown, r: PreviewRow) => r.row.name ?? '' },
    { key: 'brand', title: 'Бренд', width: 110, ellipsis: true, render: (_: unknown, r: PreviewRow) => r.row.brand ?? '' },
    { key: 'unit', title: 'Од.', width: 64, render: (_: unknown, r: PreviewRow) => r.row.unitCode ?? '' },
    {
      key: 'price',
      title: 'Ціна без ПДВ',
      width: 120,
      align: 'right' as const,
      render: (_: unknown, r: PreviewRow) => <span className="po-num">{formatMoney(r.row.purchasePrice)}</span>,
    },
    {
      key: 'currency',
      title: 'Вал.',
      width: 64,
      render: (_: unknown, r: PreviewRow) => (r.row.currency ? CURRENCY_LABELS[r.row.currency] : ''),
    },
    {
      key: 'rrp',
      title: 'РРЦ з ПДВ',
      width: 110,
      align: 'right' as const,
      render: (_: unknown, r: PreviewRow) => <span className="po-num">{formatMoney(r.row.rrp)}</span>,
    },
    {
      key: 'stock',
      title: 'Наявність',
      width: 150,
      render: (_: unknown, r: PreviewRow) => (
        <span>
          {r.row.stockQty != null ? <span className="po-num">{formatQty(r.row.stockQty)} · </span> : null}
          <span className="po-muted">{r.row.availability ? AVAILABILITY_LABELS[r.row.availability] : 'не змінюється'}</span>
        </span>
      ),
    },
    {
      key: 'issues',
      title: 'Проблеми',
      width: 190,
      render: (_: unknown, r: PreviewRow) => (
        <span className="po-pi-issues">
          {r.errors.map((e) => (
            <Tag key={e} color="error" bordered={false}>
              {e}
            </Tag>
          ))}
          {r.warnings.map((w) => (
            <Tag key={w} color="warning" bordered={false}>
              {w}
            </Tag>
          ))}
        </span>
      ),
    },
  ];

  return (
    <div className="po-pi-rows">
      <Table<PreviewRow>
        size="small"
        bordered
        rowKey={(r) => r.rowNumber}
        pagination={false}
        dataSource={data}
        columns={columns}
        scroll={{ x: 'max-content', y: 320 }}
        rowClassName={(r) => (r.skipped ? 'po-pi-row-bad' : '')}
      />
      {preview.length > data.length ? (
        <div className="po-muted po-pi-more">
          Показано перші {data.length} рядків.{' '}
          <Tooltip title="Решта рядків обробляється так само, перевірити можна після завантаження">
            <span>Усього рядків: {formatQty(preview.length)}</span>
          </Tooltip>
        </div>
      ) : null}
    </div>
  );
}
