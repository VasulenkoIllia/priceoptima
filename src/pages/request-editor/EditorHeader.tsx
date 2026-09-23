import { CopyOutlined, DownOutlined, RedoOutlined, UndoOutlined, UpOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Input, Select, Space, Tooltip, Typography } from 'antd';
import { useState, type ReactNode } from 'react';
import { REQUEST_STATUS_LABELS } from '@shared/enums';
import { formatDate, formatRate, formatRequestNumber } from '@shared/format';
import { defaultKpVatMode } from '@shared/pricing';
import type { RequestHeaderEditable, UUID } from '@shared/types';
import { useIsAdmin } from '@/app/session';
import { LastChangeNote, LockBanner, SaveIndicator } from '@/components';
import { ds, errorMessage, qk } from '@/data';
import { contactRef, contactsFor, counterpartyRef, defaultContact, defaultCounterparty } from '@/lib/refs';
import { useRequestDoc } from '@/stores/requestDocStore';
import { useUiPrefs } from '@/stores/uiPrefsStore';
import { CopyRequestDialog } from './CopyRequestDialog';
import { LostChangesDialog } from './LostChangesDialog';
import { StatusControl } from './StatusControl';

/** Підказка «Назад / Вперед»: що саме зміниться (перші кілька змін). */
function actionHint(title: string, items: readonly string[]): ReactNode {
  if (!items.length) return title;
  const shown = items.slice(0, 4);
  return (
    <div style={{ fontSize: 12 }}>
      <b>{title}:</b>
      {shown.map((t) => (
        <div key={t}>{t}</div>
      ))}
      {items.length > shown.length ? <div>і ще {items.length - shown.length}</div> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="po-field">
      <span className="po-field-label">{label}</span>
      {children}
    </label>
  );
}

/** Текстове поле шапки: зберігається при втраті фокусу (key = значення зі стору — зовнішня зміна перемальовує поле). */
function HeaderText({
  field,
  value,
  disabled,
  placeholder,
  multiline,
}: {
  field: 'title' | 'notes' | 'purchaseNote';
  value: string | null;
  disabled: boolean;
  placeholder: string;
  multiline?: boolean;
}) {
  const setHeader = useRequestDoc((s) => s.setHeader);
  const commit = (raw: string) => {
    const next = raw.trim() ? raw : null;
    if (next !== value) setHeader({ [field]: next } as Partial<RequestHeaderEditable>);
  };
  return multiline ? (
    <Input.TextArea
      key={value ?? ''}
      defaultValue={value ?? ''}
      disabled={disabled}
      placeholder={placeholder}
      autoSize={{ minRows: 1, maxRows: 4 }}
      onBlur={(e) => commit(e.target.value)}
    />
  ) : (
    <Input key={value ?? ''} defaultValue={value ?? ''} disabled={disabled} placeholder={placeholder} onBlur={(e) => commit(e.target.value)} />
  );
}

/** Шапка редактора (§6.3), спільна для всіх вкладок. */
export function EditorHeader() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();
  const requestId = useRequestDoc((s) => s.requestId);
  const header = useRequestDoc((s) => s.doc?.header);
  const refs = useRequestDoc((s) => s.doc?.refs);
  const readOnly = useRequestDoc((s) => s.readOnly);
  const readOnlyReason = useRequestDoc((s) => s.readOnlyReason);
  const lock = useRequestDoc((s) => s.lock);
  const lockLost = useRequestDoc((s) => s.lockLost);
  const save = useRequestDoc((s) => s.save);
  const dirty = useRequestDoc((s) => s.dirty);
  const settings = useRequestDoc((s) => s.settings);
  const setHeader = useRequestDoc((s) => s.setHeader);
  const retryLock = useRequestDoc((s) => s.retryLock);
  const forceLock = useRequestDoc((s) => s.forceLock);
  const canUndo = useRequestDoc((s) => s.canUndo);
  const canRedo = useRequestDoc((s) => s.canRedo);
  const undo = useRequestDoc((s) => s.undo);
  const redo = useRequestDoc((s) => s.redo);
  const describeUndo = useRequestDoc((s) => s.describeUndo);
  const meta = useRequestDoc((s) => s.doc?.meta);
  const reopen = useRequestDoc((s) => s.reopen);
  const [reopening, setReopening] = useState(false);
  const onReopen = async () => {
    setReopening(true);
    try {
      await reopen();
      message.success('Заявку перевідкрито, знову «В роботі»');
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setReopening(false);
    }
  };
  const describeRedo = useRequestDoc((s) => s.describeRedo);
  const flush = useRequestDoc((s) => s.flush);
  const notesOpen = useUiPrefs((s) => s.headerNotesOpen);
  const setNotesOpen = useUiPrefs((s) => s.setHeaderNotesOpen);
  const [copyOpen, setCopyOpen] = useState(false);

  const clients = useQuery({ queryKey: qk.clients, queryFn: () => ds.listClients() });
  const clientId = header?.clientId ?? null;
  const client = useQuery({
    queryKey: qk.client(clientId ?? ''),
    queryFn: () => ds.getClient(clientId!),
    enabled: !!clientId,
  });
  const ownCompanies = useQuery({ queryKey: qk.ownCompanies, queryFn: () => ds.listOwnCompanies() });
  const users = useQuery({ queryKey: qk.users, queryFn: () => ds.listUsers() });
  const detail = client.data?.id === clientId ? client.data : undefined;
  // документ закрито (стор скинуто) — компонент от-от зникне
  if (!header || !refs) return null;

  const onClientChange = async (id: UUID | undefined) => {
    if (!id) {
      setHeader({ clientId: null, counterpartyId: null, contactId: null }, { client: null, counterparty: null, contact: null });
      return;
    }
    try {
      const c = await queryClient.fetchQuery({ queryKey: qk.client(id), queryFn: () => ds.getClient(id) });
      const cp = defaultCounterparty(c);
      const ct = defaultContact(c, cp?.id);
      setHeader(
        { clientId: id, counterpartyId: cp?.id ?? null, contactId: ct?.id ?? null },
        { client: { id: c.id, name: c.name }, counterparty: cp ? counterpartyRef(cp) : null, contact: ct ? contactRef(ct) : null },
      );
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const onCounterpartyChange = (counterpartyId: UUID | undefined) => {
    const cp = detail?.counterparties.find((x) => x.id === counterpartyId);
    const ct = defaultContact(detail, cp?.id);
    setHeader(
      { counterpartyId: cp?.id ?? null, contactId: ct?.id ?? null },
      { counterparty: cp ? counterpartyRef(cp) : null, contact: ct ? contactRef(ct) : null },
    );
  };

  const onContactChange = (contactId: UUID | undefined) => {
    const ct = detail?.contacts.find((x) => x.id === contactId);
    setHeader({ contactId: ct?.id ?? null }, { contact: ct ? contactRef(ct) : null });
  };

  const onOwnCompanyChange = (id: UUID) => {
    const c = ownCompanies.data?.find((x) => x.id === id);
    if (!c) return;
    setHeader(
      {
        ownCompanyId: c.id,
        kpSettings: {
          ...header.kpSettings,
          ownCompanyId: c.id,
          vatMode: defaultKpVatMode(c.isVatPayer, settings?.kpDefaultVatMode ?? 'without_vat'),
        },
      },
      { ownCompany: { id: c.id, nameShort: c.nameShort, isVatPayer: c.isVatPayer } },
    );
  };

  const onManagerChange = (id: UUID) => {
    const u = users.data?.find((x) => x.id === id);
    if (u) setHeader({ managerId: u.id }, { manager: { id: u.id, shortName: u.shortName } });
  };

  // поки довідники вантажаться — показуємо значення з refs документа
  const clientOptions = clients.data?.map((c) => ({ value: c.id, label: c.name })) ?? (refs.client ? [{ value: refs.client.id, label: refs.client.name }] : []);
  // архівні контрагенти в нових заявках не пропонуємо, але в цій заявці лишається той, що вже обраний
  const counterpartyOptions =
    detail?.counterparties
      .filter((cp) => cp.isActive || cp.id === header.counterpartyId)
      .map((cp) => ({ value: cp.id, label: cp.edrpou ? `${cp.nameShort} (${cp.edrpou})` : cp.nameShort })) ??
    (refs.counterparty ? [{ value: refs.counterparty.id, label: refs.counterparty.nameShort }] : []);
  const contactOptions = detail
    ? contactsFor(detail, header.counterpartyId).map((c) => ({ value: c.id, label: c.fullName }))
    : refs.contact
      ? [{ value: refs.contact.id, label: refs.contact.fullName }]
      : [];
  const ownOptions =
    ownCompanies.data?.map((c) => ({ value: c.id, label: `${c.nameShort}${c.isVatPayer ? ' · з ПДВ' : ' · без ПДВ'}` })) ??
    [{ value: refs.ownCompany.id, label: refs.ownCompany.nameShort }];
  const managerOptions =
    users.data?.filter((u) => u.isActive).map((u) => ({ value: u.id, label: u.shortName })) ?? [{ value: refs.manager.id, label: refs.manager.shortName }];

  const showLockBanner = readOnlyReason === 'lock' || (lockLost !== null && readOnlyReason !== 'status');

  return (
    <div className="po-editor-header">
      <div className="po-editor-row">
        <div className="po-editor-title">
          <h1 className="po-num">
            Заявка № {formatRequestNumber(header.number)} від {formatDate(header.requestDate)}
          </h1>
          <Typography.Text type="secondary" ellipsis style={{ maxWidth: 320, fontSize: 12 }} title={header.title ?? undefined}>
            {header.title ?? 'Без теми'}
          </Typography.Text>
        </div>
        <Field label="Статус">
          <StatusControl />
        </Field>
        <Field label="Клієнт">
          <Select
            style={{ width: 170 }}
            showSearch
            allowClear
            optionFilterProp="label"
            placeholder="Оберіть клієнта"
            disabled={readOnly}
            value={header.clientId ?? undefined}
            options={clientOptions}
            onChange={(v?: UUID) => void onClientChange(v)}
          />
        </Field>
        <Field label="Контрагент">
          <Select
            style={{ width: 230 }}
            allowClear
            placeholder="Юрособа клієнта"
            disabled={readOnly || !header.clientId}
            value={header.counterpartyId ?? undefined}
            options={counterpartyOptions}
            onChange={(v?: UUID) => onCounterpartyChange(v)}
          />
        </Field>
        <Field label="Контакт">
          <Select
            style={{ width: 170 }}
            allowClear
            placeholder="Контактна особа"
            disabled={readOnly || !header.clientId}
            value={header.contactId ?? undefined}
            options={contactOptions}
            onChange={(v?: UUID) => onContactChange(v)}
          />
        </Field>
        <Field label="Наша юрособа">
          <Select style={{ width: 210 }} disabled={readOnly} value={header.ownCompanyId} options={ownOptions} onChange={onOwnCompanyChange} />
        </Field>
        <Field label="Відповідальний">
          <Select style={{ width: 140 }} disabled={readOnly} value={header.managerId} options={managerOptions} onChange={onManagerChange} />
        </Field>
        <Tooltip title="Загальний курс на дату заявки: ручний, якщо його задано в «Курси валют», інакше НБУ. Діє для постачальників без курсу в прайсі й без ручного курсу в картці; у блоці постачальника курс можна змінити.">
          <div className="po-editor-rates po-num">
            Курс {formatDate(header.rates.date ?? header.requestDate)}: USD {formatRate(header.rates.USD) || 'немає'} · EUR {formatRate(header.rates.EUR) || 'немає'}
          </div>
        </Tooltip>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
          {readOnly ? null : (
            <Space.Compact>
              <Tooltip title={() => actionHint('Скасувати (Ctrl+Z)', describeUndo())}>
                <Button size="small" icon={<UndoOutlined />} disabled={!canUndo} onClick={undo}>
                  Назад
                </Button>
              </Tooltip>
              <Tooltip title={() => actionHint('Повернути (Ctrl+Y)', describeRedo())}>
                <Button size="small" icon={<RedoOutlined />} disabled={!canRedo} onClick={redo}>
                  Вперед
                </Button>
              </Tooltip>
            </Space.Compact>
          )}
          {/* у перегляді видно, хто й коли востаннє змінив заявку (у редагуванні це ви самі) */}
          {readOnly && meta ? (
            <LastChangeNote change={{ at: meta.updatedAt, user: meta.updatedBy, summary: 'Остання зміна заявки' }} />
          ) : null}
          <SaveIndicator
            state={save.state}
            savedAt={save.savedAt}
            error={save.error}
            dirty={dirty}
            readOnly={readOnly}
            onRetry={() => void flush().catch(() => undefined)}
          />
          <Tooltip title="Нова заявка на основі цієї: з цінами оригіналу або перерахованими">
            <Button size="small" icon={<CopyOutlined />} onClick={() => setCopyOpen(true)}>
              Копіювати
            </Button>
          </Tooltip>
          <Button
            size="small"
            type="text"
            icon={notesOpen ? <UpOutlined /> : <DownOutlined />}
            onClick={() => setNotesOpen(!notesOpen)}
          >
            Нотатки
          </Button>
        </div>
      </div>
      <CopyRequestDialog
        source={copyOpen && requestId ? { id: requestId, number: header.number, clientId: header.clientId } : null}
        onClose={() => setCopyOpen(false)}
      />

      {showLockBanner ? (
        <LockBanner lock={lock} lockLost={lockLost} isAdmin={isAdmin} onRefresh={() => retryLock()} onForce={() => forceLock()} />
      ) : null}
      <LostChangesDialog />
      {readOnlyReason === 'status' ? (
        <Alert
          type="info"
          showIcon
          style={{ padding: '4px 12px' }}
          message={
            header.status === 'cancelled'
              ? `Заявку скасовано${header.cancelReason ? ` (причина: ${header.cancelReason})` : ''}, лише перегляд. Щоб змінити, перевідкрийте її.`
              : `Заявка «${REQUEST_STATUS_LABELS[header.status]}», лише перегляд. Щоб змінити, перевідкрийте її.`
          }
          action={
            <Button size="small" loading={reopening} onClick={() => void onReopen()}>
              Перевідкрити
            </Button>
          }
        />
      ) : null}

      {notesOpen ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(220px, 1.5fr) minmax(220px, 1.5fr)', gap: 12 }}>
          <Field label="Тема заявки">
            <HeaderText field="title" value={header.title} disabled={readOnly} placeholder="Коротко: що потрібно клієнту" />
          </Field>
          <Field label="Поле для нотаток">
            <HeaderText field="notes" value={header.notes} disabled={readOnly} placeholder="Нотатки менеджера" multiline />
          </Field>
          <Field label="Примітка до закупівлі">
            <HeaderText field="purchaseNote" value={header.purchaseNote} disabled={readOnly} placeholder="Для закупівлі: терміни, доставка…" multiline />
          </Field>
        </div>
      ) : null}
    </div>
  );
}
