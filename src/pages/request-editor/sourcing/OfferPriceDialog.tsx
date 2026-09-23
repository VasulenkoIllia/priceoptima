// Ручна ціна входу для пропозиції (РЕД-10): у цій заявці завжди, у каталозі — на вибір.
// У каталозі ціну веде прайс, тож наступне завантаження прайсу її замінить — про це пишемо в підказці.
import { App, Checkbox, Form, InputNumber, Modal, Typography } from 'antd';
import { useState } from 'react';
import { CURRENCY_LABELS } from '@shared/enums';
import { formatMoney } from '@shared/format';
import type { Offer } from '@shared/types';
import { errorMessage } from '@/data';
import { useRequestDoc } from '@/stores/requestDocStore';

interface Values {
  purchasePrice: number | null;
  updateCatalog: boolean;
}

export interface OfferPriceDialogProps {
  offer: Offer | null;
  onClose: () => void;
}

export function OfferPriceDialog({ offer, onClose }: OfferPriceDialogProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);
  const setOfferPurchasePrice = useRequestDoc((s) => s.setOfferPurchasePrice);

  if (!offer) return null;
  const currency = CURRENCY_LABELS[offer.currency];

  const submit = async (v: Values) => {
    setSaving(true);
    let changed = false;
    try {
      changed = await setOfferPurchasePrice(offer.id, v.purchasePrice ?? null, { updateCatalog: v.updateCatalog });
      if (changed) message.success(v.updateCatalog ? 'Ціну змінено в заявці й у каталозі' : 'Ціну змінено в цій заявці');
      onClose();
    } catch (e) {
      // у заявці ціна вже змінена, не записалось лише в каталог
      message.error(`Ціну змінено в заявці, але не в каталозі: ${errorMessage(e)}`);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title="Змінити вхідну ціну"
      okText="Зберегти"
      cancelText="Скасувати"
      confirmLoading={saving}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
      width={460}
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        {offer.sku ? `${offer.sku} · ` : ''}
        {offer.nameWork ?? offer.name1c ?? '—'}
        <br />У прайсі: {formatMoney(offer.catalog?.purchasePrice ?? offer.purchasePriceCur)} {currency} без ПДВ
      </Typography.Paragraph>
      <Form<Values>
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve={false}
        // значення підставляємо при кожному відкритті (форма живе лише поки відкрите вікно)
        key={offer.id}
        initialValues={{ purchasePrice: offer.purchasePriceCur, updateCatalog: false }}
        onFinish={(v) => void submit(v)}
      >
        <Form.Item name="purchasePrice" label={`Ціна входу без ПДВ, ${currency}`} rules={[{ required: true, message: 'Вкажіть ціну' }]}>
          <InputNumber min={0} step={0.01} decimalSeparator="," style={{ width: 200 }} autoFocus />
        </Form.Item>
        <Form.Item name="updateCatalog" valuePropName="checked" extra="У каталозі ціну веде прайс: наступне завантаження прайсу замінить її на прайсову.">
          <Checkbox disabled={!offer.productId}>Змінити ціну і в каталозі</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}
