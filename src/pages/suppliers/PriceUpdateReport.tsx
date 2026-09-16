// Звіт оновлення прайсу: що зміниться (або змінилось) і що свідомо не застосовано.
// Той самий вигляд — у попередньому перегляді перед записом і в журналі оновлень.
import { Alert, Collapse, Table, Tag, type TableColumnsType } from 'antd';
import type { ReactNode } from 'react';
import { formatMoney, formatQty } from '@shared/format';
import type {
  PriceBigChange,
  PriceDetailDiff,
  PriceDetailField,
  PriceNotFoundRow,
  PriceRelinkedItem,
  PriceReportSection,
  PriceSkippedRow,
  PriceUpdateDto,
} from '@shared/types';

const DETAIL_FIELD_LABELS: Record<PriceDetailField, string> = {
  nameWork: 'Назва',
  brand: 'Бренд',
  unitCode: 'Одиниця',
  multiplicity: 'Кратність',
  minOrderQty: 'Мін. партія',
  barcode: 'Штрихкод',
  categoryPath: 'Категорія',
};

const num = (v: number) => <span className="po-num">{formatQty(v)}</span>;

const BIG_COLUMNS: TableColumnsType<PriceBigChange> = [
  { title: 'Код', dataIndex: 'code', width: 150 },
  { title: 'Ціна', dataIndex: 'field', width: 90, render: (f: PriceBigChange['field']) => (f === 'rrp' ? 'РРЦ' : 'Вхідна') },
  { title: 'Було', dataIndex: 'old', align: 'right', render: (v: number) => <span className="po-num">{formatMoney(v)}</span> },
  { title: 'Стане', dataIndex: 'new', align: 'right', render: (v: number) => <span className="po-num">{formatMoney(v)}</span> },
  {
    title: 'Зміна',
    dataIndex: 'pct',
    align: 'right',
    render: (v: number) => (
      <span className={`po-num ${v > 0 ? 'po-sup-up' : 'po-sup-down'}`}>
        {v > 0 ? '+' : ''}
        {v.toLocaleString('uk-UA')} %
      </span>
    ),
  },
];

const DIFF_COLUMNS: TableColumnsType<PriceDetailDiff> = [
  { title: 'Код', dataIndex: 'code', width: 150 },
  { title: 'Поле', dataIndex: 'field', width: 100, render: (f: PriceDetailField) => DETAIL_FIELD_LABELS[f] ?? f },
  { title: 'У каталозі (лишається)', dataIndex: 'catalog' },
  { title: 'У прайсі', dataIndex: 'price', render: (v: string) => <span className="po-muted">{v}</span> },
];

const NOT_FOUND_COLUMNS: TableColumnsType<PriceNotFoundRow> = [
  { title: 'Рядок', dataIndex: 'row', width: 70, align: 'right', render: num },
  { title: 'Код', dataIndex: 'code', width: 150 },
  { title: 'Назва', dataIndex: 'name', render: (v: string | null) => v ?? <span className="po-muted">—</span> },
];

const SKIPPED_COLUMNS: TableColumnsType<PriceSkippedRow> = [
  { title: 'Рядок', dataIndex: 'row', width: 70, align: 'right', render: num },
  { title: 'Код', dataIndex: 'code', width: 150, render: (v: string) => v || <span className="po-muted">—</span> },
  { title: 'Причина', dataIndex: 'reason' },
];

const RELINKED_COLUMNS: TableColumnsType<PriceRelinkedItem> = [
  { title: 'Код у прайсі', dataIndex: 'code', width: 160 },
  { title: 'Був код у каталозі', dataIndex: 'previousSku', width: 160 },
  { title: 'Знайдено за', dataIndex: 'by', render: (v: PriceRelinkedItem['by']) => (v === 'barcode' ? 'штрихкодом' : 'артикулом') },
];

function sectionTable<T extends object>(section: PriceReportSection<T>, columns: TableColumnsType<T>): ReactNode {
  // у прикладах немає власного id — ключ рядка з порядкового номера
  const rows = section.sample.map((item, i) => ({ ...item, rowKey: i }));
  return (
    <>
      <Table<T & { rowKey: number }>
        size="small"
        className="po-pu-table"
        rowKey="rowKey"
        columns={columns as TableColumnsType<T & { rowKey: number }>}
        dataSource={rows}
        pagination={section.sample.length > 10 ? { pageSize: 10, size: 'small', showSizeChanger: false } : false}
      />
      {section.total > section.sample.length ? (
        <div className="po-muted po-pu-more">
          Показано перші {formatQty(section.sample.length)} з {formatQty(section.total)}
        </div>
      ) : null}
    </>
  );
}

export interface PriceUpdateReportViewProps {
  update: PriceUpdateDto;
  /** Попередній перегляд (нічого ще не записано) — підписи в майбутньому часі. */
  preview?: boolean;
}

export function PriceUpdateReportView({ update: u, preview }: PriceUpdateReportViewProps) {
  const report = u.report ?? null;
  const verb = preview ? 'Буде' : 'Було';

  const counters: { label: string; value: ReactNode; hint?: string }[] = [
    { label: 'Позицій прайсу в каталозі', value: formatQty(u.productsTotal) },
    { label: 'Нові позиції', value: formatQty(u.added) },
    {
      label: 'Зміна ціни',
      value: (
        <>
          {formatQty(u.changed)}{' '}
          <span className="po-muted">
            (<span className="po-sup-up">▲ {formatQty(u.priceUp)}</span> <span className="po-sup-down">▼ {formatQty(u.priceDown)}</span>
            {u.changed > u.priceUp + u.priceDown ? `, вперше або нова валюта ${formatQty(u.changed - u.priceUp - u.priceDown)}` : ''})
          </span>
        </>
      ),
    },
    { label: 'Зміна наявності', value: formatQty(u.stockChanged) },
    { label: 'Позначено «немає у прайсі»', value: formatQty(u.missing) },
  ];
  if (u.restored) counters.push({ label: 'Повернуто з архіву', value: formatQty(u.restored) });
  if (u.relinked) counters.push({ label: 'Знайдено за штрихкодом / артикулом', value: formatQty(u.relinked) });
  if (u.detailsDiffer) counters.push({ label: 'Описи відрізняються (не змінено)', value: formatQty(u.detailsDiffer) });
  if (u.skipped) counters.push({ label: 'Пропущено рядків', value: formatQty(u.skipped) });

  const sections = report
    ? [
        report.bigPriceChanges.total
          ? {
              key: 'big',
              label: (
                <span>
                  Великі зміни ціни (понад 50 %) <Tag color="orange">{formatQty(report.bigPriceChanges.total)}</Tag>
                </span>
              ),
              children: (
                <>
                  <div className="po-muted po-pu-hint">{verb} застосовано — перевірте, чи це не помилка у прайсі.</div>
                  {sectionTable(report.bigPriceChanges, BIG_COLUMNS)}
                </>
              ),
            }
          : null,
        report.detailsDiffer.total
          ? {
              key: 'diff',
              label: (
                <span>
                  Описи відрізняються — не змінено <Tag>{formatQty(report.detailsDiffer.total)}</Tag>
                </span>
              ),
              children: (
                <>
                  <div className="po-muted po-pu-hint">
                    Заповнені назви, бренди й одиниці в каталозі прайс не перезаписує. Якщо значення з прайсу правильне — виправте в картці товару.
                  </div>
                  {sectionTable(report.detailsDiffer, DIFF_COLUMNS)}
                </>
              ),
            }
          : null,
        report.notFound.total
          ? {
              key: 'notFound',
              label: (
                <span>
                  Не знайдено в каталозі <Tag>{formatQty(report.notFound.total)}</Tag>
                </span>
              ),
              children: (
                <>
                  <div className="po-muted po-pu-hint">
                    Ці коди не оновлено й не додано: у гібридному режимі нові позиції приходять лише за посиланням.
                  </div>
                  {sectionTable(report.notFound, NOT_FOUND_COLUMNS)}
                </>
              ),
            }
          : null,
        report.skippedRows.total
          ? {
              key: 'skipped',
              label: (
                <span>
                  Пропущені рядки <Tag>{formatQty(report.skippedRows.total)}</Tag>
                </span>
              ),
              children: sectionTable(report.skippedRows, SKIPPED_COLUMNS),
            }
          : null,
        report.relinked.total
          ? {
              key: 'relinked',
              label: (
                <span>
                  Знайдено за штрихкодом / артикулом <Tag>{formatQty(report.relinked.total)}</Tag>
                </span>
              ),
              children: (
                <>
                  <div className="po-muted po-pu-hint">Код товару в каталозі замінено кодом із прайсу — ціни й історія лишаються при товарі.</div>
                  {sectionTable(report.relinked, RELINKED_COLUMNS)}
                </>
              ),
            }
          : null,
      ].filter((x): x is NonNullable<typeof x> => x != null)
    : [];

  return (
    <div className="po-pu-report">
      {u.status === 'error' ? (
        <Alert type="error" showIcon message="Оновлення не застосовано" description={u.error ?? 'Невідома помилка'} />
      ) : null}
      <dl className="po-pu-counters">
        {counters.map((c) => (
          <div key={c.label}>
            <dt>{c.label}</dt>
            <dd className="po-num">{c.value}</dd>
          </div>
        ))}
      </dl>
      {u.warnings?.length ? (
        <Alert
          type="warning"
          showIcon
          message="Попередження"
          description={
            <ul className="po-pu-warnings">
              {u.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          }
        />
      ) : null}
      {sections.length ? (
        <Collapse size="small" items={sections} defaultActiveKey={sections[0]?.key === 'big' ? ['big'] : []} />
      ) : report ? (
        <div className="po-muted">Розбіжностей, пропусків і великих змін цін немає.</div>
      ) : null}
    </div>
  );
}
