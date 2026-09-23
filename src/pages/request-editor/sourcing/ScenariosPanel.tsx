// Панель «Сценарії закупівлі» (§6.10): оптимальний мікс, поточний вибір, «все в одного постачальника»,
// мін. замовлення і лічильники попереджень з кліком-фільтром. Дані — лише з computeRequest.
import { BarChartOutlined, CheckOutlined } from '@ant-design/icons';
import { Alert, App, Button, Empty, Progress, Tag, Tooltip } from 'antd';
import { useMemo, type ReactNode } from 'react';
import { formatMoney, formatMoneyUah, formatPct, formatWarning } from '@shared/format';
import { SupplierLogo } from '@/components/SupplierLogo';
import { useRequestComputed, useRequestDoc } from '@/stores/requestDocStore';
import { useUiPrefs } from '@/stores/uiPrefsStore';
import type { RowFilter } from './rows';
import { buildScenarioView } from './scenarios';
import { useSourcingUi } from './sourcingUiStore';

const COUNTERS: { filter: RowFilter; label: string; hint: string }[] = [
  { filter: 'stock', label: 'Наявність', hint: 'Немає в наявності або залишку замало' },
  { filter: 'stale', label: 'Застарілі ціни', hint: 'Ціна старша за норму, перевірте на сайті постачальника' },
  { filter: 'unapproved', label: 'Не затверджено', hint: 'У націнку й КП піде мінімальна ціна з позначкою «не затверджено»' },
];

function Diff({ net, pct }: { net: number | null; pct: number | null }) {
  if (net == null) return null;
  if (net <= 0) return <span className="po-sc-good">як у міксі</span>;
  return (
    <span className="po-sc-bad po-num">
      +{formatMoney(net)} грн{pct != null ? ` (+${formatPct(pct, Math.abs(pct) < 1 ? 2 : 1)})` : ''}
    </span>
  );
}

function Card({ title, extra, tone, children }: { title: ReactNode; extra?: ReactNode; tone?: 'mix' | 'current'; children: ReactNode }) {
  return (
    <div className={tone ? `po-sc-card po-sc-${tone}` : 'po-sc-card'}>
      <div className="po-sc-card-head">
        <span className="po-sc-card-title">{title}</span>
        {extra}
      </div>
      {children}
    </div>
  );
}

export interface ScenariosPanelProps {
  counts: Record<RowFilter, number>;
}

export function ScenariosPanel({ counts }: ScenariosPanelProps) {
  const { message } = App.useApp();
  const doc = useRequestDoc((s) => s.doc);
  const readOnly = useRequestDoc((s) => s.readOnly);
  const selectAllInBlock = useRequestDoc((s) => s.selectAllInBlock);
  const computed = useRequestComputed();
  const toggle = useUiPrefs((s) => s.toggleScenariosPanel);
  const filter = useSourcingUi((s) => s.filter);
  const setFilter = useSourcingUi((s) => s.setFilter);
  const view = useMemo(
    () => (doc && computed ? buildScenarioView({ lines: doc.lines, blocks: doc.blocks, suppliers: doc.refs.suppliers }, computed) : null),
    [doc, computed],
  );

  const applySingle = (blockId: string, name: string) => {
    const n = selectAllInBlock(blockId);
    if (n) message.success(`Застосовано «все в ${name}»: змінено рядків ${n}. Скасувати: Ctrl+Z`);
    else message.info(`Сценарій «все в ${name}» уже застосовано`);
  };

  return (
    <aside className="po-scenarios" aria-label="Сценарії закупівлі">
      <div className="po-scenarios-head">
        <BarChartOutlined /> Сценарії закупівлі
        <a className="po-scenarios-close" onClick={toggle}>
          сховати
        </a>
      </div>

      {!view || !doc?.blocks.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Додайте постачальників, і тут з’являться сценарії закупівлі" />
      ) : (
        <>
          <div className="po-sc-meta">Порівняйте варіанти й натисніть «Застосувати»: вибір у таблиці зміниться (скасувати: Ctrl+Z).</div>
          <Card title="Оптимальний мікс" tone="mix">
            <div className="po-sc-sum po-num" title="Сума входу без ПДВ">
              {formatMoneyUah(view.mix.totalNet)} <span className="po-sc-vat">без ПДВ</span>
            </div>
            <div className="po-sc-meta">мінімальна ціна в кожному рядку · постачальників: {view.mix.suppliersUsed}</div>
            {view.mix.missing ? (
              <div className="po-sc-bad">
                не підібрано: {view.mix.missing} з {view.mix.total}
              </div>
            ) : (
              <div className="po-sc-good">підібрано всі рядки ({view.mix.total})</div>
            )}
            {/* затвердити мінімальні ціни — одна кнопка «Прийняти всі рекомендації» над таблицею */}
          </Card>

          <Card title="Поточний вибір" tone="current">
            <div className="po-sc-sum po-num" title="Сума входу без ПДВ">
              {formatMoneyUah(view.current.totalNet)} <span className="po-sc-vat">без ПДВ</span>
            </div>
            <div className="po-sc-meta">
              затверджено {view.current.approved} з {view.current.total}
            </div>
            <div>
              переплата vs мікс: <Diff net={view.current.overpayNet} pct={view.current.overpayPct} />
            </div>
            <div title="Прибуток без ПДВ за цінами продажу з вкладки «Націнка»">
              прибуток: <span className="po-num po-sc-good">{formatMoneyUah(view.current.profitNet)}</span>
            </div>
          </Card>

          <div className="po-sc-section">Все в одного постачальника</div>
          {view.singles.map((s) => {
            const name = s.supplier?.name ?? 'Постачальник';
            return (
              <Card
                key={s.blockId}
                title={<SupplierLogo name={name} logoUrl={s.supplier?.logoUrl} color={s.supplier?.color} size={18} showName />}
                extra={s.total > 0 && s.covered === s.total ? <Tag color="green">лише 1 постачальник</Tag> : null}
              >
                <div className="po-sc-sum po-num" title="Сума входу без ПДВ">
                  {formatMoneyUah(s.totalNet)} <span className="po-sc-vat">без ПДВ</span>
                </div>
                <div className="po-sc-cover">
                  <Progress percent={s.total ? Math.round((s.covered / s.total) * 100) : 0} size="small" showInfo={false} />
                  <span className="po-num" title="Покриття: рядків з ціною в цього постачальника">
                    {s.covered}/{s.total}
                  </span>
                </div>
                {s.missing ? <div className="po-sc-bad">бракує: {s.missing}</div> : null}
                <div>
                  різниця з міксом: <Diff net={s.diffVsMixNet} pct={s.diffVsMixPct} />
                </div>
                <div title="Прибуток без ПДВ, якби всі рядки з ціною в цього постачальника брали в нього; ціни продажу за способом націнки рядків">
                  прибуток: <span className="po-num po-sc-good">{formatMoneyUah(s.profitNet)}</span>
                </div>
                {s.belowMinOrder ? (
                  <Tag color="orange" style={{ marginTop: 4 }}>
                    сума менша за мін. замовлення
                  </Tag>
                ) : null}
                <Button
                  size="small"
                  block
                  icon={<CheckOutlined />}
                  className="po-sc-approve"
                  disabled={readOnly || !s.approvable}
                  title={s.approvable ? `Затвердити ${name} у рядках, де є його ціна (${s.approvable}); інші рядки без змін` : undefined}
                  onClick={() => applySingle(s.blockId, name)}
                >
                  Застосувати
                </Button>
              </Card>
            );
          })}

          {view.minOrder.map((m) => (
            <Alert key={m.blockId} className="po-sc-alert" type="warning" showIcon message={`${m.supplierName}: ${formatWarning(m.warning)}`} />
          ))}
        </>
      )}

      <div className="po-sc-section">Попередження</div>
      <div className="po-sc-counters">
        {COUNTERS.map((c) => {
          const n = counts[c.filter];
          const active = filter === c.filter;
          return (
            <Tooltip key={c.filter} title={c.hint} placement="left">
              <button
                type="button"
                className={active ? 'po-sc-counter po-sc-counter-active' : 'po-sc-counter'}
                onClick={() => setFilter(active ? 'all' : c.filter)}
              >
                <span>{c.label}</span>
                <span className={n ? 'po-num po-sc-count po-sc-count-warn' : 'po-num po-sc-count'}>{n}</span>
              </button>
            </Tooltip>
          );
        })}
      </div>
      {filter !== 'all' ? (
        <a className="po-sc-reset" onClick={() => setFilter('all')}>
          Показати всі рядки
        </a>
      ) : null}
    </aside>
  );
}
