// Вкладка «Погодження» (ПОГ-1…ПОГ-3): які позиції і в якій к-сті погодив клієнт — за цінами КП-основи (останнє звичайне КП).
// Погоджена сума — у заявці й реєстрі; «Сформувати фінальне КП» — лише погоджені позиції. Зберігається автоматично.
import { CheckOutlined, CloseOutlined, FileDoneOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Checkbox, InputNumber, Result, Select, Space, Spin, Table, Tag, type TableColumnsType } from 'antd';
import { useNavigate } from 'react-router';
import { KP_VAT_MODE_LABELS } from '@shared/enums';
import { formatDate, formatMoney, formatMoneyUah, formatPct, formatQty } from '@shared/format';
import { parseLocaleNumber } from '@shared/parse';
import { approvalBaseKp, approvedKpRows, approvedTotalsFromKp, checkMultiplicity, offerMultiplicity, round2 } from '@shared/pricing';
import type { KpRow, RequestLine, UUID } from '@shared/types';
import { EmptyState } from '@/components';
import { ds, errorMessage, qk } from '@/data';
import { getRequestDocStore, useRequestComputed, useRequestDoc } from '@/stores/requestDocStore';
import { buildSupplierOrders, downloadSupplierOrders } from './supplierOrders';

interface ApprovalRow {
  key: UUID;
  kp: KpRow;
  /** null — рядок видалено із заявки після КП. */
  line: RequestLine | null;
  multiplicity: number | null;
}

/** Кратність для погодження: вимкнена в пропозиції — не округлюємо. */
const offerMultiplicityOf = (o: Parameters<typeof offerMultiplicity>[0] | undefined) => (o ? offerMultiplicity(o) : null);

const sameRows = (a: readonly KpRow[], b: readonly KpRow[]) =>
  a.length === b.length && a.every((r, i) => r.lineId === b[i].lineId && r.qty === b[i].qty);

/** Погоджена к-сть: зберігається при втраті фокусу або Enter — лише якщо значення змінилось. */
function QtyInput({ row, disabled, onCommit }: { row: ApprovalRow; disabled: boolean; onCommit(v: number | null): void }) {
  const current = row.line?.approval.approvedQty ?? row.kp.qty;
  const commit = (raw: string) => {
    const value = parseLocaleNumber(raw).value;
    if (value !== current) onCommit(value);
  };
  return (
    <InputNumber
      key={`${row.key}:${current}`}
      size="small"
      min={0}
      decimalSeparator=","
      defaultValue={current}
      disabled={disabled}
      style={{ width: 100 }}
      onBlur={(e) => commit(e.target.value)}
      onPressEnter={(e) => commit((e.target as HTMLInputElement).value)}
    />
  );
}

/** Відхилення погодженої к-сті від КП: «+2» (дозамовили) або «−2». */
function QtyDiff({ kpQty, approvedQty }: { kpQty: number; approvedQty: number }) {
  const d = round2(approvedQty - kpQty);
  if (!d) return null;
  return (
    <Tag
      bordered={false}
      color={d > 0 ? 'orange' : 'default'}
      className="po-num"
      title={d > 0 ? `Більше, ніж у КП (${formatQty(kpQty)})` : `Менше, ніж у КП (${formatQty(kpQty)})`}
    >
      {d > 0 ? '+' : '−'}
      {formatQty(Math.abs(d))}
    </Tag>
  );
}

export default function ApprovalTab() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const requestId = useRequestDoc((s) => s.requestId);
  const doc = useRequestDoc((s) => s.doc);
  const readOnly = useRequestDoc((s) => s.readOnly);
  const setApproval = useRequestDoc((s) => s.setApproval);
  const setApprovals = useRequestDoc((s) => s.setApprovals);
  const setHeader = useRequestDoc((s) => s.setHeader);
  const approvalKpId = useRequestDoc((s) => s.doc?.header.approvalKpId ?? null);
  const computed = useRequestComputed();
  const kps = useQuery({ queryKey: qk.kps(requestId ?? ''), queryFn: () => ds.listKps(requestId!), enabled: !!requestId });

  const createFinal = useMutation({
    mutationFn: async () => {
      await getRequestDocStore().getState().flush();
      const settings = getRequestDocStore().getState().doc!.header.kpSettings;
      return ds.createKp(requestId!, { settings, final: true, sessionId: ds.sessionId });
    },
    onSuccess: (kp) => {
      for (const queryKey of [qk.kps(kp.requestId), qk.history(kp.requestId), qk.requestsAll, qk.settings]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      message.success(`Сформовано фінальне КП № ${kp.numberLabel} · ${formatMoneyUah(kp.snapshot.totals.payable)}`);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  if (!doc || !computed || !requestId) return null;
  if (kps.isPending) {
    return (
      <div className="po-tab po-appr">
        <Spin />
      </div>
    );
  }
  if (kps.isError) return <Result status="warning" title="Не вдалося завантажити КП" subTitle={errorMessage(kps.error)} />;

  // клієнт погоджує обрану версію КП (за замовчуванням — останню звичайну)
  const base = approvalBaseKp(kps.data, approvalKpId);
  const regular = kps.data.filter((k) => !k.onlyApproved);
  if (!base) {
    return (
      <div className="po-tab po-appr">
        <EmptyState
          title="Спершу сформуйте КП"
          description="Клієнт погоджує позиції з комерційної пропозиції — сформуйте її на вкладці «КП»."
          action={
            <Button type="primary" onClick={() => navigate(`/requests/${requestId}/kp`)}>
              До КП
            </Button>
          }
        />
      </div>
    );
  }

  const lineById = new Map(doc.lines.map((l) => [l.id, l]));
  const offerById = new Map(doc.offers.map((o) => [o.id, o]));
  const rows: ApprovalRow[] = base.snapshot.rows.map((kp) => {
    const offerId = computed.markup.rows[kp.lineId]?.effectiveOfferId;
    return {
      key: kp.lineId,
      kp,
      line: lineById.get(kp.lineId) ?? null,
      multiplicity: offerId ? (offerMultiplicityOf(offerById.get(offerId)) ?? null) : null,
    };
  });
  const approved = approvedTotalsFromKp(base.snapshot, doc.lines);
  const approvedCount = approved?.rows.length ?? 0;
  const sharePct = approved && base.snapshot.totals.totalGross ? (approved.totalGross / base.snapshot.totals.totalGross) * 100 : null;
  // список КП — від найновішого: перше фінальне після основи — актуальне
  const finalKp = kps.data.find((k) => k.onlyApproved && k.version > base.version) ?? null;
  const finalOutdated = !!finalKp && !sameRows(approvedKpRows(base.snapshot.rows, doc.lines), finalKp.snapshot.rows);

  const exportOrders = async () => {
    const { orders, skipped } = buildSupplierOrders(doc, computed, base.snapshot.rows);
    if (!orders.length) {
      message.warning('Немає погоджених позицій з обраним постачальником');
      return;
    }
    try {
      await downloadSupplierOrders(orders, { requestNumber: doc.header.number, requestDate: doc.header.requestDate, clientName: doc.refs.client?.name ?? null });
      const parts = [`постачальників: ${orders.length}`, `позицій: ${orders.reduce((n, o) => n + o.rows.length, 0)}`];
      if (skipped) parts.push(`без обраного постачальника (не увійшли): ${skipped}`);
      message[skipped ? 'warning' : 'success'](`Замовлення сформовано: ${parts.join(', ')}`);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const setAll = (value: boolean) =>
    setApprovals(
      rows.flatMap((r) =>
        r.line ? [{ lineId: r.kp.lineId, approved: value, qty: value ? (r.line.approval.approved ? r.line.approval.approvedQty : r.kp.qty) : null }] : [],
      ),
    );

  // погоджена к-сть може бути й більшою, ніж у КП (клієнт дозамовив, п.4.1 правок); кратність — за поточною пропозицією (округлення вгору)
  const commitQty = (row: ApprovalRow, raw: number | null) => {
    if (!row.line?.approval.approved) return;
    let qty = raw == null || !(raw > 0) ? row.kp.qty : raw;
    const check = checkMultiplicity(qty, row.multiplicity);
    if (!check.isMultiple && check.suggestedQty != null) {
      message.info(`К-сть округлено з ${formatQty(qty)} до ${formatQty(check.suggestedQty)}, кратно ${formatQty(row.multiplicity)}`);
      qty = check.suggestedQty;
    }
    if (qty !== (row.line.approval.approvedQty ?? row.kp.qty)) setApproval(row.line.id, true, qty);
  };

  const columns: TableColumnsType<ApprovalRow> = [
    { key: 'n', title: '№', width: 48, align: 'center', render: (_, r) => r.kp.n },
    { key: 'code', title: 'Код', width: 118, render: (_, r) => <span className="po-num">{r.kp.code ?? ''}</span> },
    {
      key: 'name',
      title: 'Назва',
      render: (_, r) => (
        <>
          {r.kp.name}
          {r.kp.nameSecondary ? <div className="po-muted po-appr-secondary">{r.kp.nameSecondary}</div> : null}
          {!r.line ? (
            <Tag color="red" bordered={false}>
              рядок видалено із заявки
            </Tag>
          ) : null}
        </>
      ),
    },
    { key: 'unit', title: 'Од.', width: 56, align: 'center', render: (_, r) => r.kp.unit },
    { key: 'qty', title: 'К-сть у КП', width: 96, align: 'right', render: (_, r) => <span className="po-num">{formatQty(r.kp.qty)}</span> },
    {
      key: 'approved',
      title: 'Погоджено',
      width: 100,
      align: 'center',
      render: (_, r) => (
        <Checkbox
          checked={!!r.line?.approval.approved}
          disabled={readOnly || !r.line}
          onChange={(e) => setApproval(r.kp.lineId, e.target.checked, e.target.checked ? r.kp.qty : null)}
        />
      ),
    },
    {
      key: 'approvedQty',
      title: 'Погоджена к-сть',
      width: 176,
      render: (_, r) =>
        r.line?.approval.approved ? (
          <Space size={4}>
            <QtyInput row={r} disabled={readOnly} onCommit={(v) => commitQty(r, v)} />
            <QtyDiff kpQty={r.kp.qty} approvedQty={r.line.approval.approvedQty ?? r.kp.qty} />
          </Space>
        ) : (
          <span className="po-muted">—</span>
        ),
    },
    { key: 'price', title: base.snapshot.columns.priceHeader, width: 132, align: 'right', render: (_, r) => <span className="po-num">{formatMoney(r.kp.price)}</span> },
    {
      key: 'sum',
      title: 'Сума',
      width: 132,
      align: 'right',
      render: (_, r) =>
        r.line?.approval.approved ? (
          <b className="po-num">{formatMoney(round2(r.kp.price * (r.line.approval.approvedQty ?? r.kp.qty)))}</b>
        ) : (
          <span className="po-num po-muted" title="Сума в КП (не погоджено)">
            {formatMoney(r.kp.sum)}
          </span>
        ),
    },
  ];

  return (
    <div className="po-tab po-appr">
      <div className="po-appr-head">
        <div>
          <div className="po-appr-title">
            Погодження за КП
            <Select<UUID>
              size="small"
              className="po-appr-kp-select po-num"
              value={base.id}
              disabled={readOnly || regular.length < 2}
              popupMatchSelectWidth={false}
              options={regular.map((k, i) => ({ value: k.id, label: `№ ${k.numberLabel} від ${formatDate(k.snapshot.date)}${i === 0 ? ' — остання' : ''}` }))}
              onChange={(id) => setHeader({ approvalKpId: id === regular[0]?.id ? null : id })}
            />
          </div>
          <div className="po-muted">{KP_VAT_MODE_LABELS[base.vatMode]} · ціни — з КП, зміни націнки на погоджену суму не впливають</div>
        </div>
        <Space wrap>
          <Button icon={<CheckOutlined />} disabled={readOnly} onClick={() => setAll(true)}>
            Погодити все
          </Button>
          <Button icon={<CloseOutlined />} disabled={readOnly || !approvedCount} onClick={() => setAll(false)}>
            Зняти все
          </Button>
          <Button
            icon={<FileExcelOutlined />}
            disabled={!approvedCount}
            title="Один Excel, аркуш на кожного постачальника: артикул, найменування, од., погоджена кількість (кратно)"
            onClick={() => void exportOrders()}
          >
            Замовлення постачальникам
          </Button>
          <Button
            type="primary"
            icon={<FileDoneOutlined />}
            disabled={readOnly || !approvedCount}
            loading={createFinal.isPending}
            onClick={() => createFinal.mutate()}
          >
            Сформувати фінальне КП
          </Button>
        </Space>
      </div>

      <div className="po-appr-summary">
        <span>
          Погоджено{' '}
          <b className="po-num">
            {approvedCount} з {rows.length}
          </b>
        </span>
        <span>
          Погоджена сума: <b className="po-num po-appr-sum">{approved ? formatMoneyUah(approved.totalGross) : '—'}</b>
          {sharePct != null ? <span className="po-muted po-num"> ({formatPct(sharePct)} від КП)</span> : null}
        </span>
        {approved && base.vatMode !== 'no_vat' ? (
          <span className="po-muted po-num">
            без ПДВ {formatMoney(approved.totalNet)} · ПДВ {formatMoney(approved.vat)}
          </span>
        ) : null}
      </div>

      {finalKp ? (
        finalOutdated ? (
          <Alert type="warning" showIcon message={`Погодження змінилось після фінального КП № ${finalKp.numberLabel} — сформуйте його повторно`} />
        ) : (
          <Alert
            type="success"
            showIcon
            message={`Фінальне КП № ${finalKp.numberLabel} від ${formatDate(finalKp.snapshot.date)} · ${formatMoneyUah(finalKp.snapshot.totals.payable)}`}
            action={
              <Button size="small" onClick={() => navigate(`/requests/${requestId}/kp`, { state: { kpId: finalKp.id } })}>
                Відкрити
              </Button>
            }
          />
        )
      ) : null}

      <Table<ApprovalRow>
        size="small"
        rowKey="key"
        pagination={false}
        columns={columns}
        dataSource={rows}
        sticky
        rowClassName={(r) => (r.line?.approval.approved ? 'po-appr-row-ok' : '')}
      />
    </div>
  );
}
