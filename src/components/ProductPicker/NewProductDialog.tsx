// Новий товар, доданий вручну (§6.7): спільна форма для «Номенклатури» і вікна вибору товару в заявці.
import { useQuery } from '@tanstack/react-query';
import { App, Col, Form, Input, InputNumber, Modal, Row, Select, Typography } from 'antd';
import { useState, type ReactNode } from 'react';
import { CURRENCY_CODES, CURRENCY_LABELS, type CurrencyCode } from '@shared/enums';
import { formatMoney } from '@shared/format';
import { DEFAULT_UNITS } from '@shared/parse';
import { normalizeInputPrice } from '@shared/pricing';
import type { ProductDetail, ProductInput, SupplierListItem, UUID } from '@shared/types';
import { SupplierLogo } from '@/components/SupplierLogo';
import { ds, qk } from '@/data';
import { errorMessage, isDataSourceError } from '@/data/errors';

export interface CreateProductInitial {
  sku?: string;
  nameWork?: string;
  unitCode?: string | null;
}

export interface NewProductDialogProps {
  open: boolean;
  suppliers: readonly SupplierListItem[];
  /** Постачальник за замовчуванням; null — обрати у формі. */
  supplierId: UUID | null;
  /** Постачальника не змінюють (пропозиція йде в конкретний блок заявки). */
  supplierLocked?: boolean;
  initial?: CreateProductInitial;
  okText: string;
  intro: ReactNode;
  /** Вхідна ціна обов'язкова. */
  requirePrice?: boolean;
  /** Куди піде ціна без ПДВ — підпис під ціною («піде в заявку» / «так зберігається в каталозі»). */
  netHint?: string;
  onSubmit(input: ProductInput): Promise<ProductDetail>;
  onClose(): void;
  onCreated?(product: ProductDetail): void;
}

interface FormValues {
  supplierId: UUID;
  sku: string;
  nameWork: string;
  name1c?: string;
  unitCode: string;
  currency: CurrencyCode;
  purchasePrice?: number | null;
  rrp?: number | null;
  multiplicity?: number | null;
  stockQty?: number | null;
}

const UNIT_OPTIONS = DEFAULT_UNITS.map((u) => ({ value: u.code, label: u.code }));
const CURRENCY_OPTIONS = CURRENCY_CODES.map((c) => ({ value: c, label: CURRENCY_LABELS[c] }));

export function NewProductDialog({
  open,
  suppliers,
  supplierId,
  supplierLocked,
  initial,
  okText,
  intro,
  requirePrice,
  netHint = 'так зберігається в каталозі',
  onSubmit,
  onClose,
  onCreated,
}: NewProductDialogProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [busy, setBusy] = useState(false);
  const settings = useQuery({ queryKey: qk.settings, queryFn: () => ds.getSettings(), enabled: open });
  const vatRatePct = settings.data?.vatRatePct ?? 20;
  const grossPrice = Form.useWatch('purchasePrice', form);
  const currency = Form.useWatch('currency', form);
  const supplier = suppliers.find((s) => s.id === supplierId);
  const supplierOptions = suppliers
    .filter((s) => s.isActive || s.id === supplierId)
    .map((s) => ({ value: s.id, label: <SupplierLogo name={s.name} logoUrl={s.logoUrl} color={s.color} size={16} showName /> }));

  const submit = async () => {
    if (busy) return;
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setBusy(true);
    try {
      const product = await onSubmit({
        supplierId: v.supplierId,
        // порожній артикул — сервер присвоїть «ВР-00001» (правки замовника 23.09 п.14)
        sku: v.sku?.trim() || null,
        nameWork: v.nameWork.trim(),
        name1c: v.name1c?.trim() || null,
        unitCode: v.unitCode,
        currency: v.currency,
        purchasePrice: v.purchasePrice ?? null,
        // вхід вводиться з ПДВ (п.7 правок); зберігається без ПДВ за ставкою з Налаштувань
        priceIncludesVat: true,
        rrp: v.rrp ?? null,
        multiplicity: v.multiplicity && v.multiplicity > 0 ? v.multiplicity : 1,
        stockQty: v.stockQty ?? null,
      });
      onCreated?.(product);
      onClose();
    } catch (e) {
      // такий артикул у постачальника вже є — підсвічуємо поле
      if (isDataSourceError(e, 'DUPLICATE')) form.setFields([{ name: 'sku', errors: [errorMessage(e)] }]);
      else message.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Створити товар"
      okText={okText}
      cancelText="Скасувати"
      onOk={() => void submit()}
      onCancel={onClose}
      confirmLoading={busy}
      destroyOnHidden
      width={620}
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: -4 }}>
        {intro}
      </Typography.Paragraph>
      <Form<FormValues>
        form={form}
        layout="vertical"
        preserve={false}
        requiredMark={false}
        initialValues={{
          supplierId: supplierId ?? undefined,
          sku: initial?.sku ?? '',
          nameWork: initial?.nameWork ?? '',
          unitCode: initial?.unitCode || 'шт',
          currency: supplier?.defaultCurrency ?? 'UAH',
          multiplicity: 1,
        }}
        onFinish={() => void submit()}
      >
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="supplierId" label="Постачальник" rules={[{ required: true, message: 'Оберіть постачальника' }]}>
              <Select
                disabled={supplierLocked}
                placeholder="Оберіть постачальника"
                options={supplierOptions}
                onChange={(id: UUID) => {
                  const s = suppliers.find((x) => x.id === id);
                  if (s) form.setFieldValue('currency', s.defaultCurrency);
                }}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="sku" label="Артикул" extra="Порожньо: присвоїться автоматично (ВР-00001, ВР-00002…)">
              <Input autoFocus={!initial?.sku} placeholder="присвоїться автоматично" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="nameWork" label="Найменування" rules={[{ required: true, whitespace: true, message: 'Вкажіть найменування' }]}>
          <Input autoFocus={!!initial?.sku} />
        </Form.Item>
        <Form.Item name="name1c" label="Назва 1С" extra="Як товар називається в 1С (для бухгалтерії); можна додати й пізніше в картці товару">
          <Input placeholder="не задано" />
        </Form.Item>
        <Row gutter={12}>
          <Col span={5}>
            <Form.Item name="unitCode" label="Од.">
              <Select options={UNIT_OPTIONS} showSearch />
            </Form.Item>
          </Col>
          <Col span={7}>
            <Form.Item
              name="purchasePrice"
              label="Вхід з ПДВ"
              rules={requirePrice ? [{ required: true, message: 'Вкажіть ціну' }] : undefined}
              extra={
                grossPrice != null && grossPrice > 0
                  ? `без ПДВ: ${formatMoney(normalizeInputPrice(grossPrice, true, vatRatePct))} ${currency ? CURRENCY_LABELS[currency] : ''} (${netHint})`
                  : undefined
              }
            >
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} decimalSeparator="," />
            </Form.Item>
          </Col>
          <Col span={5}>
            <Form.Item name="currency" label="Валюта">
              <Select options={CURRENCY_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={7}>
            <Form.Item name="rrp" label="РРЦ з ПДВ">
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} decimalSeparator="," placeholder="немає" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={6}>
            <Form.Item name="multiplicity" label="Кратність">
              <InputNumber min={0.001} style={{ width: '100%' }} decimalSeparator="," />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="stockQty" label="Наявність">
              <InputNumber min={0} style={{ width: '100%' }} placeholder="невідомо" decimalSeparator="," />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
