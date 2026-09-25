// Параметри системи: ціни і націнка, КП (разом із типовими умовами), нумерація.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Form, InputNumber, Select, Spin } from 'antd';
import {
  DISCOUNT_FORMULAS,
  DISCOUNT_FORMULA_LABELS,
  FOP_PRICE_BASES,
  FOP_PRICE_BASIS_LABELS,
  KP_NAME_SOURCES,
  KP_NAME_SOURCE_LABELS,
  KP_VAT_MODE_LABELS,
  MARKUP_METHODS,
  MARKUP_METHOD_LABELS,
  PRICE_ROUNDINGS,
  PRICE_ROUNDING_LABELS,
  type KpVatMode,
} from '@shared/enums';
import { markupValueMax } from '@shared/pricing';
import type { AppSettings, AppSettingsPatch, KpTerm } from '@shared/types';
import { KpTermsEditor, LoadError } from '@/components';
import { ds, errorMessage, qk } from '@/data';

type FormValues = Pick<
  AppSettings,
  | 'vatRatePct'
  | 'priceStaleDays'
  | 'priceListRateMaxAgeDays'
  | 'defaultMarkupMethod'
  | 'defaultMarkupValue'
  | 'discountFormula'
  | 'priceRounding'
  | 'kpNameSource'
  | 'kpDefaultVatMode'
  | 'fopPriceBasis'
  | 'kpTerms'
  | 'nextRequestNumber'
  | 'nextKpNumber'
> & {
  /** Порожньо — термін дії не вказано (зберігається як 0): рядка «Пропозиція дійсна до…» у КП немає. */
  kpValidityDays: number | null;
};

const options = <T extends string>(values: readonly T[], labels: Record<T, string>) => values.map((value) => ({ value, label: labels[value] }));
/** ФОП-режим «без ПДВ» обирається в заявці автоматично — за замовчуванням лише ці два. */
const KP_VAT_OPTIONS = options<KpVatMode>(['without_vat', 'with_vat'], KP_VAT_MODE_LABELS);
const NUM = { style: { width: '100%' }, decimalSeparator: ',' } as const;

const NO_TERMS: KpTerm[] = [];

/** Поле форми для умов КП (Form.Item передає value / onChange). */
function KpTermsField({ value, onChange }: { value?: KpTerm[]; onChange?: (next: KpTerm[]) => void }) {
  return <KpTermsEditor value={value ?? NO_TERMS} onChange={(next) => onChange?.(next)} />;
}

function pickValues(s: AppSettings): FormValues {
  return {
    vatRatePct: s.vatRatePct,
    priceStaleDays: s.priceStaleDays,
    priceListRateMaxAgeDays: s.priceListRateMaxAgeDays,
    defaultMarkupMethod: s.defaultMarkupMethod,
    defaultMarkupValue: s.defaultMarkupValue,
    discountFormula: s.discountFormula,
    priceRounding: s.priceRounding,
    kpValidityDays: s.kpValidityDays || null,
    kpNameSource: s.kpNameSource,
    kpDefaultVatMode: s.kpDefaultVatMode,
    fopPriceBasis: s.fopPriceBasis,
    kpTerms: s.kpTerms,
    nextRequestNumber: s.nextRequestNumber,
    nextKpNumber: s.nextKpNumber,
  };
}

function ParamsForm({ settings }: { settings: AppSettings }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const method = Form.useWatch('defaultMarkupMethod', form) ?? settings.defaultMarkupMethod;

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      // лічильники лише збільшуються: порівнюємо зі свіжими значеннями (заявку могли створити, поки форма відкрита)
      const current = await ds.getSettings();
      const { nextRequestNumber, nextKpNumber, kpTerms, kpValidityDays, ...rest } = v;
      // умова без назви не зберігається; без значення — зберігається, але в КП не друкується
      const patch: AppSettingsPatch = {
        ...rest,
        kpValidityDays: kpValidityDays ?? 0,
        kpTerms: kpTerms.map((t) => ({ label: t.label.trim(), value: t.value.trim() })).filter((t) => t.label),
      };
      if (nextRequestNumber > current.nextRequestNumber) patch.nextRequestNumber = nextRequestNumber;
      // номер КП — стала частина «2114 / номер заявки», його можна змінити будь-коли
      if (nextKpNumber !== current.nextKpNumber) patch.nextKpNumber = nextKpNumber;
      return ds.updateSettings(patch);
    },
    onSuccess: (next) => {
      queryClient.setQueryData(qk.settings, next);
      void queryClient.invalidateQueries({ queryKey: qk.settings });
      void queryClient.invalidateQueries({ queryKey: qk.me });
      form.setFieldsValue({ nextRequestNumber: next.nextRequestNumber, nextKpNumber: next.nextKpNumber, kpTerms: next.kpTerms });
      message.success('Налаштування збережено');
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const counterRules = (min: number) => [
    { required: true, message: 'Вкажіть номер' },
    { type: 'number' as const, min, message: `Не менше ніж ${min}` },
  ];

  return (
    <Form<FormValues> form={form} layout="vertical" requiredMark={false} initialValues={pickValues(settings)} onFinish={(v) => save.mutate(v)}>
      <div className="po-set-cards">
        <Card title="Ціни і націнка" size="small">
          <Form.Item name="vatRatePct" label="Ставка ПДВ, %" rules={[{ required: true, message: 'Вкажіть ставку' }]}>
            <InputNumber {...NUM} min={0} max={100} precision={2} />
          </Form.Item>
          <Form.Item name="priceStaleDays" label="Застарілість ціни, днів" extra="Старіша ціна позначається як «застаріла»" rules={[{ required: true, message: 'Вкажіть кількість днів' }]}>
            <InputNumber {...NUM} min={1} max={365} precision={0} />
          </Form.Item>
          <Form.Item
            name="priceListRateMaxAgeDays"
            label="Курс із прайсу діє, днів"
            extra="Старіший курс із прайсу в нові блоки заявок не йде: береться ручний курс постачальника, інакше загальний"
            rules={[{ required: true, message: 'Вкажіть кількість днів' }]}
          >
            <InputNumber {...NUM} min={1} max={365} precision={0} />
          </Form.Item>
          <Form.Item name="defaultMarkupMethod" label="Спосіб націнки нової заявки">
            <Select options={options(MARKUP_METHODS, MARKUP_METHOD_LABELS)} />
          </Form.Item>
          <Form.Item name="defaultMarkupValue" label="Значення, %" extra={method === 'rrp' || method === 'manual' ? 'Для цього способу не використовується' : undefined}>
            <InputNumber {...NUM} min={0} max={markupValueMax(method ?? 'markup_on_cost')} precision={2} disabled={method === 'rrp' || method === 'manual'} />
          </Form.Item>
          <Form.Item name="discountFormula" label="Формула знижки від РРЦ">
            <Select options={options(DISCOUNT_FORMULAS, DISCOUNT_FORMULA_LABELS)} />
          </Form.Item>
          <Form.Item name="priceRounding" label="Округлення ціни продажу" style={{ marginBottom: 0 }}>
            <Select options={options(PRICE_ROUNDINGS, PRICE_ROUNDING_LABELS)} />
          </Form.Item>
        </Card>
        <Card title="Комерційні пропозиції (КП)" size="small">
          <Form.Item name="kpValidityDays" label="КП: термін дії, днів" extra="Порожньо — у КП немає рядка «Пропозиція дійсна до…»">
            <InputNumber {...NUM} min={0} max={365} precision={0} />
          </Form.Item>
          <Form.Item name="kpNameSource" label="Назва товару в КП">
            <Select options={options(KP_NAME_SOURCES, KP_NAME_SOURCE_LABELS)} />
          </Form.Item>
          <Form.Item name="kpDefaultVatMode" label="Ціни в КП за замовчуванням">
            <Select options={KP_VAT_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="fopPriceBasis"
            label="Ціни в КП від ФОП"
            extra="ФОП не платник ПДВ: у КП ПДВ не виділяється, змінюється лише рівень цін"
            style={{ marginBottom: 0 }}
          >
            <Select options={options(FOP_PRICE_BASES, FOP_PRICE_BASIS_LABELS)} />
          </Form.Item>
        </Card>
        <Card title="Нумерація" size="small">
          <Form.Item name="nextRequestNumber" label="Наступний № заявки" extra="Лічильник можна лише збільшити" rules={counterRules(settings.nextRequestNumber)}>
            <InputNumber {...NUM} min={settings.nextRequestNumber} precision={0} />
          </Form.Item>
          <Form.Item
            name="nextKpNumber"
            label="Номер КП (стала частина)"
            extra={`Номер КП: ${settings.nextKpNumber} / номер заявки`}
            rules={[{ required: true, message: 'Вкажіть номер КП' }]}
            style={{ marginBottom: 0 }}
          >
            <InputNumber {...NUM} min={1} precision={0} />
          </Form.Item>
        </Card>
        <Card title="Умови в КП (типові)" size="small" className="po-set-wide">
          <p className="po-muted" style={{ marginTop: 0 }}>
            Друкуються внизу кожного КП. У бланку КП заявки їх можна змінити під клієнта, прибрати або додати свою. Порожнє значення не
            друкується.
          </p>
          <Form.Item name="kpTerms" style={{ marginBottom: 0 }}>
            <KpTermsField />
          </Form.Item>
        </Card>
      </div>
      <div className="po-set-actions">
        <Button type="primary" htmlType="submit" loading={save.isPending}>
          Зберегти
        </Button>
        <Button onClick={() => form.resetFields()}>Скасувати зміни</Button>
      </div>
    </Form>
  );
}

export function ParamsTab() {
  const settings = useQuery({ queryKey: qk.settings, queryFn: () => ds.getSettings() });
  if (settings.isPending) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (settings.isError) return <LoadError title="Не вдалося завантажити налаштування" error={settings.error} onRetry={settings.refetch} />;
  return <ParamsForm settings={settings.data} />;
}
