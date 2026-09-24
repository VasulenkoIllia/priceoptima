// «Змінити ціну» — лише для товарів, доданих вручну; ціну товару з прайсу веде прайс, її змінюють лише в заявці.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Col, Form, InputNumber, Modal, Row, Select, Typography } from 'antd';
import { CURRENCY_CODES, CURRENCY_LABELS, type CurrencyCode } from '@shared/enums';
import { round2 } from '@shared/pricing';
import type { ProductDetail } from '@shared/types';
import { ds, errorMessage, qk } from '@/data';
import { grossPrice, useVatRate } from './productView';

interface FormValues {
  currency: CurrencyCode;
  purchasePrice: number | null;
  rrp: number | null;
  stockQty: number | null;
}

const CURRENCY_OPTIONS = CURRENCY_CODES.map((c) => ({ value: c, label: CURRENCY_LABELS[c] }));

export interface ManualPriceDialogProps {
  open: boolean;
  product: ProductDetail;
  onClose: () => void;
}

export function ManualPriceDialog({ open, product, onClose }: ManualPriceDialogProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const vatRatePct = useVatRate();
  // вхід вводиться з ПДВ (п.7 правок); сервер зводить його до ціни без ПДВ за ставкою з Налаштувань.
  // У полі — до копійок (74,80, а не 74,796); не чіпали — лишається збережена ціна без ПДВ
  const exactGross = grossPrice(product.purchasePrice, vatRatePct);
  const initialGross = exactGross == null ? null : round2(exactGross);

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const unchanged = v.purchasePrice === initialGross && v.currency === product.currency;
      return ds.updateProductPrice(product.id, {
        currency: v.currency,
        // ціну не чіпали — лишаємо збережену без ПДВ (без округлення туди-назад)
        purchasePrice: unchanged ? product.purchasePrice : (v.purchasePrice ?? null),
        priceIncludesVat: !unchanged,
        rrp: v.rrp ?? null,
        stockQty: v.stockQty ?? null,
        source: 'manual',
      });
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: qk.productsAll });
      void queryClient.invalidateQueries({ queryKey: qk.product(product.id) });
      void queryClient.invalidateQueries({ queryKey: qk.priceHistory(product.id) });
      if (res.historyEntry) message.success('Ціну товару оновлено');
      else message.info('Ціна не змінилась');
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Modal
      open={open}
      title="Зміна ціни товару"
      okText="Зберегти"
      cancelText="Скасувати"
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
      width={520}
    >
      <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 12 }}>
        <span className="po-num">{product.sku}</span> · {product.nameWork}
      </Typography.Paragraph>

      <Form<FormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve={false}
        initialValues={{
          currency: product.currency,
          purchasePrice: initialGross,
          rrp: product.rrp,
          stockQty: product.stockQty,
        }}
        onFinish={(v) => save.mutate(v)}
      >
        <Row gutter={12}>
          <Col span={6}>
            <Form.Item name="currency" label="Валюта">
              <Select options={CURRENCY_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={9}>
            <Form.Item name="purchasePrice" label="Вхід з ПДВ" rules={[{ required: true, message: 'Вкажіть ціну' }]}>
              <InputNumber min={0} step={0.01} decimalSeparator="," style={{ width: '100%' }} autoFocus />
            </Form.Item>
          </Col>
          <Col span={9}>
            <Form.Item name="rrp" label="РРЦ з ПДВ">
              <InputNumber min={0} step={0.01} decimalSeparator="," style={{ width: '100%' }} placeholder="немає" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="stockQty" label="Наявність, од." style={{ marginBottom: 8 }}>
              <InputNumber min={0} decimalSeparator="," style={{ width: '100%' }} placeholder="невідомо" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Зміна потрапить в історію цін товару з позначкою «Вручну».
      </Typography.Text>
    </Modal>
  );
}
