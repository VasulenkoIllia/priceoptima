// Створення / редагування постачальника: картка, умови цін і курсу, юрособи й контакти.
// Джерело прайсу (посилання, токен, розклад) налаштовується окремо — PriceSourceDialog.
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button, Checkbox, ColorPicker, Form, Input, InputNumber, Modal, Select, Switch, Tooltip } from 'antd';
import { useEffect } from 'react';
import { CURRENCY_CODES, CURRENCY_LABELS, RATE_POLICIES, RATE_POLICY_LABELS, type CurrencyCode, type RatePolicy } from '@shared/enums';
import { toIsoDate } from '@shared/format';
import type { SupplierDetail, SupplierInput, UUID } from '@shared/types';
import { LogoField, ManualRateFields } from '@/components';
import { ds, errorMessage, isDataSourceError, qk } from '@/data';
import { newId } from '@/lib/ids';

interface LegalEntityValues {
  id: UUID;
  nameShort: string;
  nameFull?: string | null;
  edrpou?: string | null;
  ipn?: string | null;
  isVatPayer: boolean;
  iban?: string | null;
  bankName?: string | null;
  address?: string | null;
}

interface ContactValues {
  id: UUID;
  fullName: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface FormValues {
  name: string;
  logoUrl?: string | null;
  color?: string | null;
  isActive: boolean;
  website?: string | null;
  b2bUrl?: string | null;
  searchUrlTemplate?: string | null;
  deliveryInfo?: string | null;
  defaultCurrency: CurrencyCode;
  pricesIncludeVat: boolean;
  rrpIncludesVat: boolean;
  supplierMarkupPct?: number | null;
  minOrderAmount?: number | null;
  priceStaleDays?: number | null;
  ratePolicy: RatePolicy;
  rateAdjustPct?: number | null;
  manualRateUsd?: number | null;
  manualRateEur?: number | null;
  notes?: string | null;
  legalEntities?: LegalEntityValues[];
  contacts?: ContactValues[];
}

const text = (v: string | null | undefined) => v?.trim() || null;

const RATE_POLICY_HINTS: Record<RatePolicy, string> = {
  price_list: 'Курс із прайсу постачальника; якщо в прайсі його немає, то ручний курс нижче, а далі загальний курс із «Курси валют» (або НБУ)',
  manual: 'Курс, узгоджений з постачальником: вказується нижче',
  nbu: 'Офіційний курс НБУ на дату заявки',
  nbu_adjusted: 'Курс НБУ з поправкою у відсотках',
};

function toFormValues(s: SupplierDetail | null): FormValues {
  if (!s) {
    return {
      name: '',
      isActive: true,
      defaultCurrency: 'UAH',
      pricesIncludeVat: false,
      rrpIncludesVat: true,
      supplierMarkupPct: 0,
      ratePolicy: 'price_list',
      rateAdjustPct: 0,
      legalEntities: [],
      contacts: [],
    };
  }
  return {
    name: s.name,
    logoUrl: s.logoUrl,
    color: s.color,
    isActive: s.isActive,
    website: s.website,
    b2bUrl: s.b2bUrl,
    searchUrlTemplate: s.searchUrlTemplate,
    deliveryInfo: s.deliveryInfo,
    defaultCurrency: s.defaultCurrency,
    pricesIncludeVat: s.pricesIncludeVat,
    rrpIncludesVat: s.rrpIncludesVat,
    supplierMarkupPct: s.supplierMarkupPct,
    minOrderAmount: s.minOrderAmount,
    priceStaleDays: s.priceStaleDays,
    ratePolicy: s.ratePolicy,
    rateAdjustPct: s.rateAdjustPct,
    manualRateUsd: s.manualRateUsd,
    manualRateEur: s.manualRateEur,
    notes: s.notes,
    legalEntities: s.legalEntities.map((le) => ({
      id: le.id,
      nameShort: le.nameShort,
      nameFull: le.nameFull,
      edrpou: le.edrpou,
      ipn: le.ipn,
      isVatPayer: le.isVatPayer,
      iban: le.iban,
      bankName: le.bankName,
      address: le.address,
    })),
    contacts: s.contacts.map((ct) => ({ id: ct.id, fullName: ct.fullName, position: ct.position, phone: ct.phone, email: ct.email })),
  };
}

/** Повний SupplierInput; поля, яких немає у формі, беремо з попередньої версії. Курси з прайсу не передаємо — їх веде завантаження. */
function buildInput(v: FormValues, prev: SupplierDetail | null, today: string): SupplierInput {
  const prevLe = new Map(prev?.legalEntities.map((x) => [x.id, x] as const));
  const legalEntities = (v.legalEntities ?? []).map((le, i) => {
    const old = prevLe.get(le.id);
    return {
      id: le.id,
      nameShort: le.nameShort.trim(),
      nameFull: text(le.nameFull),
      edrpou: text(le.edrpou),
      ipn: text(le.ipn),
      isVatPayer: !!le.isVatPayer,
      iban: text(le.iban)?.replace(/\s/gu, '') ?? null,
      bankName: text(le.bankName),
      address: text(le.address),
      note: old?.note ?? null,
      isDefault: old?.isDefault ?? i === 0,
      isActive: old?.isActive ?? true,
    };
  });
  const prevCt = new Map(prev?.contacts.map((x) => [x.id, x] as const));
  const contacts = (v.contacts ?? []).map((ct) => ({
    id: ct.id,
    fullName: ct.fullName.trim(),
    position: text(ct.position),
    phone: text(ct.phone),
    email: text(ct.email),
    note: prevCt.get(ct.id)?.note ?? null,
  }));
  // ручний курс постачальника діє і як основний («Вручну»), і як запасний, коли в прайсі курсу немає
  const manual = v.ratePolicy === 'manual' || v.ratePolicy === 'price_list';
  const manualRateUsd = manual ? (v.manualRateUsd ?? null) : (prev?.manualRateUsd ?? null);
  const manualRateEur = manual ? (v.manualRateEur ?? null) : (prev?.manualRateEur ?? null);
  const manualChanged = manualRateUsd !== (prev?.manualRateUsd ?? null) || manualRateEur !== (prev?.manualRateEur ?? null);
  return {
    version: prev?.version,
    name: v.name.trim(),
    logoUrl: v.logoUrl ?? null,
    color: v.color ?? null,
    defaultCurrency: v.defaultCurrency,
    pricesIncludeVat: !!v.pricesIncludeVat,
    rrpIncludesVat: !!v.rrpIncludesVat,
    supplierMarkupPct: v.supplierMarkupPct ?? 0,
    ratePolicy: v.ratePolicy,
    rateAdjustPct: v.ratePolicy === 'nbu_adjusted' ? (v.rateAdjustPct ?? 0) : (prev?.rateAdjustPct ?? 0),
    manualRateUsd,
    manualRateEur,
    // дата ручного курсу — день, коли його востаннє змінили
    manualRatesDate: manualChanged ? (manualRateUsd != null || manualRateEur != null ? today : null) : (prev?.manualRatesDate ?? null),
    minOrderAmount: v.minOrderAmount ?? null,
    priceStaleDays: v.priceStaleDays ?? null,
    searchUrlTemplate: text(v.searchUrlTemplate),
    website: text(v.website),
    b2bUrl: text(v.b2bUrl),
    notes: text(v.notes),
    deliveryInfo: text(v.deliveryInfo),
    isActive: !!v.isActive,
    sortOrder: prev?.sortOrder ?? 0,
    legalEntities,
    contacts,
  };
}

/** Колір значка постачальника: у формі — рядок '#1677ff' або null. */
function ColorField({ value, onChange }: { value?: string | null; onChange?: (v: string | null) => void }) {
  return (
    <ColorPicker
      value={value ?? undefined}
      allowClear
      format="hex"
      showText={(c) => (value ? c.toHexString() : 'Без кольору')}
      onChangeComplete={(c) => onChange?.(c.toHexString())}
      onClear={() => onChange?.(null)}
      presets={[{ label: 'Кольори', colors: ['#1677ff', '#13a8a8', '#52c41a', '#fa8c16', '#f5222d', '#722ed1', '#eb2f96', '#607d8b'] }]}
    />
  );
}

const urlRule = { pattern: /^https?:\/\/\S+$/iu, message: 'Посилання має починатися з http:// або https://' };

export interface SupplierFormDialogProps {
  open: boolean;
  /** null — новий постачальник. */
  supplier: SupplierDetail | null;
  onClose: () => void;
  onSaved?: (saved: SupplierDetail) => void;
}

export function SupplierFormDialog({ open, supplier, onClose, onSaved }: SupplierFormDialogProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const ratePolicy = Form.useWatch('ratePolicy', form);

  // значення — при кожному відкритті (див. ClientFormDialog: Form.List під StrictMode губить initialValues)
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(toFormValues(supplier));
  }, [open, supplier, form]);

  const save = useMutation({
    mutationFn: (v: FormValues) => ds.saveSupplier(supplier?.id ?? null, buildInput(v, supplier, toIsoDate(new Date()))),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: qk.suppliers });
      void queryClient.invalidateQueries({ queryKey: qk.supplier(saved.id) });
      message.success(supplier ? 'Постачальника збережено' : `Постачальника «${saved.name}» створено`);
      onClose();
      onSaved?.(saved);
    },
    onError: (e) => {
      message.error(errorMessage(e));
      // картку встигли змінити — перечитуємо, щоб у формі були свіжі дані
      if (isDataSourceError(e, 'VERSION_CONFLICT')) void queryClient.invalidateQueries();
    },
  });

  return (
    <Modal
      open={open}
      title={supplier ? 'Редагування постачальника' : 'Новий постачальник'}
      okText={supplier ? 'Зберегти' : 'Створити'}
      cancelText="Скасувати"
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
      width={820}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 } }}
    >
      <Form<FormValues>
        form={form}
        className="po-sup-edit"
        layout="vertical"
        requiredMark={false}
        onFinish={(v) => save.mutate(v)}
        style={{ marginTop: 12 }}
      >
        <div className="po-sup-grid-form po-sup-grid-name">
          <Form.Item name="name" label="Назва постачальника" rules={[{ required: true, whitespace: true, message: 'Вкажіть назву постачальника' }]}>
            <Input autoFocus placeholder="Напр.: САНДІ" maxLength={200} />
          </Form.Item>
          <Form.Item name="logoUrl" label="Логотип">
            <LogoField hint="Показуємо в списках і блоках заявки" />
          </Form.Item>
          <Form.Item name="color" label="Колір значка">
            <ColorField />
          </Form.Item>
          <Form.Item name="isActive" label="Активний" valuePropName="checked">
            <Switch />
          </Form.Item>
        </div>
        <div className="po-sup-grid-form po-sup-grid-2">
          <Form.Item name="website" label="Сайт" rules={[urlRule]}>
            <Input placeholder="https://…" />
          </Form.Item>
          <Form.Item name="b2bUrl" label="B2B-кабінет" rules={[urlRule]}>
            <Input placeholder="https://…" />
          </Form.Item>
        </div>
        <Form.Item
          name="searchUrlTemplate"
          label="Пошук на сайті"
          extra="Посилання пошуку, де {query} означає артикул або назву. Напр.: https://site.ua/search?q={query}"
          rules={[urlRule]}
        >
          <Input placeholder="https://…{query}" />
        </Form.Item>
        <Form.Item name="deliveryInfo" label="Доставка">
          <Input placeholder="Напр.: власна доставка по Києву, НП за рахунок покупця" />
        </Form.Item>

        <div className="po-sup-section">Ціни й курс</div>
        <div className="po-sup-grid-form po-sup-grid-3">
          <Form.Item name="defaultCurrency" label="Валюта прайсу">
            <Select options={CURRENCY_CODES.map((c) => ({ value: c, label: CURRENCY_LABELS[c] }))} />
          </Form.Item>
          <Form.Item name="pricesIncludeVat" label="Вхідні ціни" valuePropName="checked">
            <Checkbox>з ПДВ</Checkbox>
          </Form.Item>
          <Form.Item name="rrpIncludesVat" label="РРЦ" valuePropName="checked">
            <Checkbox>з ПДВ</Checkbox>
          </Form.Item>
        </div>
        <div className="po-sup-grid-form po-sup-grid-3">
          <Form.Item name="supplierMarkupPct" label="Націнка постачальника, %" extra="Додається до вхідної ціни в заявці">
            <InputNumber min={0} max={100} step={0.5} decimalSeparator="," style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="minOrderAmount" label="Мін. замовлення з ПДВ, грн" extra="Порівнюється із сумою з ПДВ по обраних рядках">
            <InputNumber min={0} step={100} decimalSeparator="," style={{ width: '100%' }} placeholder="немає" />
          </Form.Item>
          <Form.Item name="priceStaleDays" label="Ціна застаріває через, днів" extra="Якщо порожньо, як у налаштуваннях">
            <InputNumber min={1} max={365} precision={0} style={{ width: '100%' }} placeholder="за замовчуванням" />
          </Form.Item>
        </div>
        <div className="po-sup-grid-form po-sup-grid-3">
          <Form.Item name="ratePolicy" label="Курс для заявок" extra={ratePolicy ? RATE_POLICY_HINTS[ratePolicy] : null} className="po-sup-span-2">
            <Select options={RATE_POLICIES.map((p) => ({ value: p, label: RATE_POLICY_LABELS[p] }))} />
          </Form.Item>
          {ratePolicy === 'nbu_adjusted' ? (
            <Form.Item name="rateAdjustPct" label="Поправка до НБУ, %">
              <InputNumber min={-100} max={100} step={0.5} decimalSeparator="," style={{ width: '100%' }} />
            </Form.Item>
          ) : null}
        </div>
        {ratePolicy === 'manual' || ratePolicy === 'price_list' ? (
          <div className="po-sup-grid-form po-sup-grid-3">
            <ManualRateFields
              label={(c) => (ratePolicy === 'manual' ? `Курс ${c}, грн` : `Ручний курс ${c}, грн`)}
              extra={ratePolicy === 'price_list' ? 'Якщо в прайсі курсу немає' : 'Порожньо, якщо курс не задано'}
            />
          </div>
        ) : null}
        <Form.Item name="notes" label="Примітки">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="Умови оплати, особливості прайсу…" />
        </Form.Item>

        <div className="po-sup-section">Юрособи</div>
        <Form.List name="legalEntities">
          {(fields, { add, remove }) => (
            <div className="po-sup-items">
              {fields.map(({ key, name }) => (
                <div key={key} className="po-sup-item po-sup-edit-item">
                  <Form.Item name={[name, 'id']} hidden>
                    <Input />
                  </Form.Item>
                  <div className="po-sup-grid-form po-sup-grid-le">
                    <Form.Item name={[name, 'nameShort']} label="Коротка назва" rules={[{ required: true, whitespace: true, message: 'Вкажіть коротку назву' }]}>
                      <Input placeholder="ТОВ «…»" />
                    </Form.Item>
                    <Form.Item
                      name={[name, 'edrpou']}
                      label="ЄДРПОУ / РНОКПП"
                      normalize={(v: string) => v.replace(/\s/gu, '')}
                      rules={[{ pattern: /^\d{8}(\d{2})?$/u, message: 'Зазвичай 8 цифр (ЄДРПОУ) або 10 (РНОКПП)', warningOnly: true }]}
                    >
                      <Input className="po-num" maxLength={12} />
                    </Form.Item>
                    <Form.Item name={[name, 'isVatPayer']} label=" " valuePropName="checked">
                      <Checkbox>Платник ПДВ</Checkbox>
                    </Form.Item>
                  </div>
                  <div className="po-sup-grid-form po-sup-grid-2">
                    <Form.Item
                      name={[name, 'iban']}
                      label="IBAN"
                      rules={[{ pattern: /^UA\s?\d{2}(\s?\d){25}$/iu, message: 'IBAN: UA і 27 цифр', warningOnly: true }]}
                    >
                      <Input className="po-num" placeholder="UA…" />
                    </Form.Item>
                    <Form.Item name={[name, 'bankName']} label="Банк">
                      <Input />
                    </Form.Item>
                  </div>
                  <div className="po-sup-grid-form po-sup-grid-2">
                    <Form.Item name={[name, 'nameFull']} label="Повна назва">
                      <Input />
                    </Form.Item>
                    <Form.Item name={[name, 'address']} label="Адреса">
                      <Input />
                    </Form.Item>
                  </div>
                  <Tooltip title="Видалити юрособу">
                    <Button className="po-sup-remove" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                  </Tooltip>
                </div>
              ))}
              <div>
                <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ id: newId(), nameShort: '', isVatPayer: true })}>
                  Додати юрособу
                </Button>
              </div>
            </div>
          )}
        </Form.List>

        <div className="po-sup-section">Контакти</div>
        <Form.List name="contacts">
          {(fields, { add, remove }) => (
            <div className="po-sup-items">
              {fields.map(({ key, name }) => (
                <div key={key} className="po-sup-item po-sup-edit-item">
                  <Form.Item name={[name, 'id']} hidden>
                    <Input />
                  </Form.Item>
                  <div className="po-sup-grid-form po-sup-grid-ct">
                    <Form.Item name={[name, 'fullName']} label="ПІБ" rules={[{ required: true, whitespace: true, message: 'Вкажіть ПІБ' }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name={[name, 'position']} label="Посада">
                      <Input />
                    </Form.Item>
                    <Form.Item name={[name, 'phone']} label="Телефон">
                      <Input placeholder="067-000-00-00" />
                    </Form.Item>
                    <Form.Item name={[name, 'email']} label="E-mail" rules={[{ type: 'email', message: 'Схоже на некоректний e-mail', warningOnly: true }]}>
                      <Input />
                    </Form.Item>
                  </div>
                  <Tooltip title="Видалити контакт">
                    <Button className="po-sup-remove" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                  </Tooltip>
                </div>
              ))}
              <div>
                <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ id: newId(), fullName: '' })}>
                  Додати контакт
                </Button>
              </div>
            </div>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}
