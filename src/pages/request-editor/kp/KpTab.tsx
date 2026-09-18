// Вкладка «КП» (КП-1…КП-4): налаштування бланка, перевірка, «Сформувати КП» (номер з лічильника, незмінний знімок),
// версії КП і PDF / Excel. Попередній перегляд номер не витрачає.
import { CopyOutlined, FileExcelOutlined, FilePdfOutlined, FileTextOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Checkbox, Input, InputNumber, Radio, Select, Spin, Tag, Tooltip } from 'antd';
import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { KP_NAME_SOURCE_LABELS, KP_NAME_SOURCES, KP_VAT_MODE_LABELS, type KpNameSource, type KpVatMode } from '@shared/enums';
import { formatDateTime, formatKpNumber, formatMoney } from '@shared/format';
import { DEFAULT_KP_TERMS, defaultKpVatMode, latestBaseKp, resolveKpTerms, type KpChecks } from '@shared/pricing';
import type { KpDocumentDto, KpSettings, UUID } from '@shared/types';
import { KpTermsEditor } from '@/components';
import { ds, errorMessage, qk } from '@/data';
import { getRequestDocStore, useRequestDoc } from '@/stores/requestDocStore';
import { KpDocumentView } from './KpDocumentView';
import { downloadKpExcel } from './kpExcel';
import { downloadKpPdf } from './kpPdf';
import { useKpPreview } from './useKpPreview';

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="po-kp-field">
      <div className="po-field-label">{label}</div>
      {children}
      {hint ? <div className="po-kp-hint">{hint}</div> : null}
    </div>
  );
}

/** Налаштування бланка — у заявці (автозбереження); сформовані версії від них не змінюються. */
function KpSettingsForm() {
  const header = useRequestDoc((s) => s.doc?.header);
  const ownRef = useRequestDoc((s) => s.doc?.refs.ownCompany);
  const readOnly = useRequestDoc((s) => s.readOnly);
  const appSettings = useRequestDoc((s) => s.settings);
  const setHeader = useRequestDoc((s) => s.setHeader);
  const own = useQuery({ queryKey: qk.ownCompanies, queryFn: () => ds.listOwnCompanies() });
  const settings = useQuery({ queryKey: qk.settings, queryFn: () => ds.getSettings() });
  if (!header || !ownRef) return null;
  const k = header.kpSettings;
  const defaultTerms = settings.data?.kpTerms ?? DEFAULT_KP_TERMS;
  const isVatPayer = own.data?.find((c) => c.id === header.ownCompanyId)?.isVatPayer ?? ownRef.isVatPayer;
  const patch = (p: Partial<KpSettings>) => setHeader({ kpSettings: { ...k, ...p } });

  const onOwnCompany = (id: UUID) => {
    const c = own.data?.find((x) => x.id === id);
    if (!c) return;
    setHeader(
      {
        ownCompanyId: c.id,
        kpSettings: { ...k, ownCompanyId: c.id, vatMode: defaultKpVatMode(c.isVatPayer, appSettings?.kpDefaultVatMode ?? 'without_vat') },
      },
      { ownCompany: { id: c.id, nameShort: c.nameShort, isVatPayer: c.isVatPayer } },
    );
  };

  return (
    <>
      <Field label="Від кого">
        <Select
          value={header.ownCompanyId}
          disabled={readOnly}
          options={(own.data ?? [{ id: ownRef.id, nameShort: ownRef.nameShort, isVatPayer: ownRef.isVatPayer }]).map((c) => ({
            value: c.id,
            label: `${c.nameShort}${c.isVatPayer ? '' : ' · без ПДВ'}`,
          }))}
          onChange={onOwnCompany}
        />
      </Field>
      <Field
        label="Ціни"
        hint={
          isVatPayer
            ? 'Режим цін діє і на вкладці «Націнка»'
            : `ФОП не платник ПДВ: ${settings.data?.fopPriceBasis === 'net' ? 'ціни без ПДВ' : 'ціни на рівні з ПДВ, ПДВ не виділяється'} (змінюється в Налаштуваннях)`
        }
      >
        <Radio.Group
          optionType="button"
          buttonStyle="solid"
          size="small"
          value={k.vatMode}
          disabled={readOnly || !isVatPayer}
          onChange={(e) => patch({ vatMode: e.target.value as KpVatMode })}
          options={
            isVatPayer
              ? [
                  { value: 'without_vat', label: 'Без ПДВ' },
                  { value: 'with_vat', label: 'З ПДВ' },
                ]
              : [{ value: 'no_vat', label: 'ФОП' }]
          }
        />
      </Field>
      <Field label="Назва товару в КП" hint="«Код» — завжди артикул постачальника">
        <Select<KpNameSource>
          value={k.nameSource}
          disabled={readOnly}
          options={KP_NAME_SOURCES.map((v) => ({ value: v, label: KP_NAME_SOURCE_LABELS[v] }))}
          onChange={(v) => patch({ nameSource: v })}
        />
      </Field>
      <Field label="Фото товарів" hint="Поки що в КП буде місце під фото — самі фото товарів у бланк ще не підставляються">
        <Checkbox checked={k.showImages} disabled={readOnly} onChange={(e) => patch({ showImages: e.target.checked })}>
          Додати фото в КП
        </Checkbox>
      </Field>
      <Field label="Пропозиція дійсна, днів">
        <InputNumber
          min={0}
          max={90}
          value={k.validityDays}
          disabled={readOnly}
          onChange={(v) => v != null && v !== k.validityDays && patch({ validityDays: v })}
          style={{ width: 120 }}
        />
      </Field>
      <Field
        label="Умови"
        hint={
          k.terms == null ? (
            'Типові з Налаштувань; змініть тут, щоб задати для цього клієнта'
          ) : (
            <>
              Свої для цього клієнта ·{' '}
              <a onClick={() => !readOnly && patch({ terms: null })} aria-disabled={readOnly}>
                повернути типові
              </a>
            </>
          )
        }
      >
        <KpTermsEditor value={k.terms ?? defaultTerms} disabled={readOnly} compact onChange={(terms) => patch({ terms })} />
      </Field>
      <Field label="Дод. інформація">
        <Input.TextArea
          key={k.extraInfo ?? ''}
          defaultValue={k.extraInfo ?? ''}
          disabled={readOnly}
          autoSize={{ minRows: 2, maxRows: 5 }}
          placeholder="Будь-що ще для клієнта"
          onBlur={(e) => {
            const next = e.target.value.trim() || null;
            if (next !== k.extraInfo) patch({ extraInfo: next });
          }}
        />
      </Field>
    </>
  );
}

function ChecksList({ checks: c }: { checks: KpChecks }) {
  return (
    <ul className="po-kp-checks">
      <li>
        У КП підуть позицій: <b className="po-num">{c.inKp}</b>
      </li>
      {c.notApproved ? <li className="po-kp-check-warn">Не затверджено ✔: {c.notApproved} — з мінімальною ціною</li> : null}
      {c.notPicked ? <li className="po-muted">Не підібрано: {c.notPicked} — у КП не увійдуть</li> : null}
      {c.belowCost ? <li className="po-kp-check-err">Продаж нижче входу: {c.belowCost}</li> : null}
      {c.noPrice ? <li className="po-kp-check-err">Без ціни продажу: {c.noPrice} — не увійдуть; задайте ціну на вкладці «Націнка»</li> : null}
    </ul>
  );
}

function VersionItem({ kp, active, onSelect }: { kp: KpDocumentDto; active: boolean; onSelect(): void }) {
  return (
    <div
      className={active ? 'po-kp-version po-kp-version-active' : 'po-kp-version'}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
    >
      <div className="po-kp-version-head">
        <b className="po-num">№ {kp.numberLabel}</b>
        {kp.onlyApproved ? (
          <Tag color="purple" bordered={false} style={{ margin: 0 }}>
            фінальне
          </Tag>
        ) : null}
      </div>
      <div className="po-muted po-num">
        {formatDateTime(kp.createdAt)} · {kp.createdBy?.shortName ?? '—'}
      </div>
      <div className="po-num">
        {KP_VAT_MODE_LABELS[kp.vatMode]} · <b>{formatMoney(kp.snapshot.totals.payable)} грн</b>
      </div>
    </div>
  );
}

export default function KpTab() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const location = useLocation();
  const requestId = useRequestDoc((s) => s.requestId);
  const readOnly = useRequestDoc((s) => s.readOnly);
  const setHeader = useRequestDoc((s) => s.setHeader);
  const own = useQuery({ queryKey: qk.ownCompanies, queryFn: () => ds.listOwnCompanies() });
  const { snapshot: preview, checks } = useKpPreview();
  const kps = useQuery({ queryKey: qk.kps(requestId ?? ''), queryFn: () => ds.listKps(requestId!), enabled: !!requestId });
  const appSettings = useQuery({ queryKey: qk.settings, queryFn: () => ds.getSettings() });
  const [selectedId, setSelectedId] = useState<UUID | null>((location.state as { kpId?: UUID } | null)?.kpId ?? null);
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      // незбережені зміни — спершу на сервер: КП будується зі збереженої заявки
      await getRequestDocStore().getState().flush();
      const kpSettings = getRequestDocStore().getState().doc!.header.kpSettings;
      // умови друкуються такими, як на момент формування: свої в заявці або типові з Налаштувань
      const settings = { ...kpSettings, terms: resolveKpTerms(kpSettings.terms, appSettings.data?.kpTerms) };
      return ds.createKp(requestId!, { settings, sessionId: ds.sessionId });
    },
    onSuccess: (kp) => {
      for (const queryKey of [qk.kps(kp.requestId), qk.history(kp.requestId), qk.requestsAll, qk.settings]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      setSelectedId(kp.id);
      message.success(`Сформовано КП № ${kp.numberLabel} · ${formatMoney(kp.snapshot.totals.payable)} грн`);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const download = async (kp: KpDocumentDto, kind: 'pdf' | 'xlsx') => {
    setBusy(kind);
    try {
      if (kind === 'pdf') await downloadKpPdf(kp.snapshot, kp.version);
      else await downloadKpExcel(kp.snapshot, kp.version);
    } catch (e) {
      message.error(`Не вдалося сформувати файл: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const selected = kps.data?.find((k) => k.id === selectedId) ?? null;
  const base = latestBaseKp(kps.data);
  const outdated =
    !!base &&
    !!preview &&
    (base.vatMode !== preview.totals.vatMode || base.snapshot.rows.length !== preview.rows.length || base.snapshot.totals.payable !== preview.totals.payable);
  const blockReason = readOnly
    ? 'Заявка відкрита лише для перегляду'
    : !checks
      ? 'Зачекайте…'
      : !checks.inKp
        ? 'Немає позицій з ціною продажу'
        : null;
  const kpPrefix = appSettings.data?.nextKpNumber;
  const requestNumber = useRequestDoc((s) => s.doc?.header.number);

  // КП-3: «Сформувати на основі цієї» — налаштування версії в заявку, далі перегляд за поточними цінами і «Сформувати»
  const basedOn = (kp: KpDocumentDto) => {
    const c = own.data?.find((x) => x.id === kp.ownCompanyId);
    setHeader(
      { ownCompanyId: kp.ownCompanyId, kpSettings: { ...kp.settings, ownCompanyId: kp.ownCompanyId, onlyApproved: false } },
      c ? { ownCompany: { id: c.id, nameShort: c.nameShort, isVatPayer: c.isVatPayer } } : undefined,
    );
    setSelectedId(null);
    message.info(`Налаштування взято з КП № ${kp.numberLabel} — перевірте перегляд і натисніть «Сформувати КП»`, 5);
  };

  // позиції без ціни продажу в КП не увійдуть — лише з підтвердженням
  const onCreate = () => {
    if (!checks?.noPrice) {
      create.mutate();
      return;
    }
    modal.confirm({
      title: `Без ціни продажу: ${checks.noPrice} поз.`,
      content: 'Ці позиції не увійдуть у КП. Щоб включити — задайте спосіб націнки або ціну вручну на вкладці «Націнка».',
      okText: 'Сформувати без них',
      cancelText: 'Скасувати',
      onOk: () => create.mutate(),
    });
  };

  return (
    <div className="po-tab po-kp">
      <aside className="po-kp-side">
        <section>
          <div className="po-kp-section-title">Бланк КП</div>
          <KpSettingsForm />
        </section>
        <section>
          <div className="po-kp-section-title">Перевірка</div>
          {checks ? <ChecksList checks={checks} /> : <Spin size="small" />}
          <Tooltip title={blockReason}>
            <Button
              type="primary"
              block
              icon={<FileTextOutlined />}
              loading={create.isPending}
              disabled={!!blockReason}
              onClick={onCreate}
              style={{ marginTop: 10 }}
            >
              Сформувати КП{kpPrefix && requestNumber != null ? ` № ${formatKpNumber(kpPrefix, requestNumber)}` : ''}
            </Button>
          </Tooltip>
          {outdated && base ? (
            <Alert type="warning" showIcon style={{ marginTop: 8 }} message={`Ціни змінились після КП № ${base.numberLabel} — сформуйте нову версію`} />
          ) : null}
        </section>
        <section>
          <div className="po-kp-section-title">Версії КП{kps.data?.length ? ` (${kps.data.length})` : ''}</div>
          <div className="po-kp-versions">
            <div
              className={selected ? 'po-kp-version' : 'po-kp-version po-kp-version-active'}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(null)}
              onKeyDown={(e) => e.key === 'Enter' && setSelectedId(null)}
            >
              <b>Попередній перегляд</b>
              <div className="po-muted">поточні ціни, без номера</div>
            </div>
            {kps.data?.map((k) => <VersionItem key={k.id} kp={k} active={k.id === selected?.id} onSelect={() => setSelectedId(k.id)} />)}
            {kps.data && !kps.data.length ? <div className="po-muted">КП ще не формували</div> : null}
          </div>
        </section>
      </aside>

      <main className="po-kp-main">
        <div className="po-kp-bar">
          {selected ? (
            <>
              <span>
                <b className="po-num">КП № {selected.numberLabel}</b>{' '}
                {selected.onlyApproved ? (
                  <Tag color="purple" bordered={false}>
                    фінальне
                  </Tag>
                ) : null}
                <span className="po-muted po-num">
                  · сформовано {formatDateTime(selected.createdAt)} · {selected.createdBy?.shortName ?? '—'}
                </span>
              </span>
              <span className="po-tab-spacer" />
              {selected.onlyApproved ? null : (
                <Tooltip title="Взяти налаштування цієї версії (юрособа, режим цін, назви, умови) і сформувати нову за поточними цінами">
                  <Button icon={<CopyOutlined />} disabled={readOnly} onClick={() => basedOn(selected)}>
                    На основі цієї
                  </Button>
                </Tooltip>
              )}
              <Button icon={<FilePdfOutlined />} loading={busy === 'pdf'} onClick={() => void download(selected, 'pdf')}>
                PDF
              </Button>
              <Button icon={<FileExcelOutlined />} loading={busy === 'xlsx'} onClick={() => void download(selected, 'xlsx')}>
                Excel
              </Button>
            </>
          ) : (
            <span className="po-muted">Попередній перегляд за поточними цінами. PDF і Excel — у сформованих версіях.</span>
          )}
        </div>
        {selected ? <KpDocumentView snapshot={selected.snapshot} /> : preview ? <KpDocumentView snapshot={preview} draft /> : <Spin />}
      </main>
    </div>
  );
}
