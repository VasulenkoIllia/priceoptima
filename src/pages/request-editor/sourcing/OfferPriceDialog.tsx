// Ручна ціна входу для пропозиції (РЕД-10): лише в цій заявці. У каталозі ціну веде прайс постачальника
// (наступне оновлення переписало б ручну), тож туди не пишемо (правки замовника 23.09 п.8).
// Ціну вводять з ПДВ, як усюди (правки замовника 16.09 п.7); у заявку йде ціна без ПДВ.
import { App, Form, InputNumber, Modal, Typography } from 'antd';
import { useState } from 'react';
import { CURRENCY_LABELS } from '@shared/enums';
import { formatMoney, formatPct } from '@shared/format';
import { netToGross, normalizeInputPrice } from '@shared/pricing';
import type { Offer } from '@shared/types';
import { errorMessage } from '@/data';
import { useRequestDoc } from '@/stores/requestDocStore';
import { BIG_CHANGE_PCT } from '../offerCellInput';
import { useSourcingUi } from './sourcingUiStore';

interface Values {
  /** Вхід з ПДВ у валюті пропозиції. */
  purchasePrice: number | null;
}

export interface OfferPriceDialogProps {
  offer: Offer | null;
  onClose: () => void;
}


export function OfferPriceDialog({ offer, onClose }: OfferPriceDialogProps) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);
  const setOfferPurchasePrice = useRequestDoc((s) => s.setOfferPurchasePrice);
  const vatRatePct = useRequestDoc((s) => s.doc?.header.vatRatePct ?? 20);
  const price = Form.useWatch('purchasePrice', form);

  if (!offer) return null;
  const currency = CURRENCY_LABELS[offer.currency];
  const listed = offer.catalog?.purchasePrice ?? offer.purchasePriceCur;
  const initialGross = offer.purchasePriceCur == null ? null : netToGross(offer.purchasePriceCur, vatRatePct, 2);
  /** Введене з ПДВ → без ПДВ; ціну не чіпали — лишається точна ціна без ПДВ (без зсуву округлення). */
  const netOf = (gross: number | null) =>
    gross == null ? null : gross === initialGross ? offer.purchasePriceCur : normalizeInputPrice(gross, true, vatRatePct);

  const confirmBigChange = (v: Values) => {
    const before = offer.purchasePriceCur;
    const after = netOf(v.purchasePrice);
    const pct = before && after != null ? ((after - before) / before) * 100 : null;
    if (pct == null || Math.abs(pct) <= BIG_CHANGE_PCT) {
      void submit(v);
      return;
    }
    modal.confirm({
      title: `Ціна змінюється на ${pct > 0 ? '+' : '−'}${formatPct(Math.abs(pct), 0)}`,
      content: `Було ${formatMoney(initialGross)} ${currency}, стане ${formatMoney(v.purchasePrice)} ${currency} з ПДВ. Перевірте, чи немає зайвого нуля чи коми.`,
      okText: 'Так, змінити',
      cancelText: 'Виправити',
      onOk: () => submit(v),
    });
  };

  const submit = async (v: Values) => {
    setSaving(true);
    try {
      if (await setOfferPurchasePrice(offer.id, netOf(v.purchasePrice))) message.success('Ціну змінено в цій заявці');
      onClose();
    } catch (e) {
      message.error(errorMessage(e));
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
        {offer.nameWork ?? offer.name1c ?? ''}
        {listed != null ? (
          <>
            <br />У прайсі: {formatMoney(netToGross(listed, vatRatePct, 2))} {currency} з ПДВ
          </>
        ) : null}
      </Typography.Paragraph>
      <Form<Values>
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve={false}
        // значення підставляємо при кожному відкритті (форма живе лише поки відкрите вікно)
        key={offer.id}
        initialValues={{ purchasePrice: initialGross }}
        onFinish={confirmBigChange}
      >
        <Form.Item
          name="purchasePrice"
          label={`Вхід з ПДВ, ${currency}`}
          rules={[{ required: true, message: 'Вкажіть ціну' }]}
          extra={price != null && price > 0 ? `без ПДВ: ${formatMoney(netOf(price))} ${currency} (піде в заявку)` : undefined}
        >
          <InputNumber min={0} step={0.01} decimalSeparator="," style={{ width: 200 }} autoFocus />
        </Form.Item>
      </Form>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Ціна зміниться лише в цій заявці. У каталозі ціну веде прайс постачальника.
      </Typography.Text>
    </Modal>
  );
}

/** «Змінити ціну» пропозиції зі стану вкладки: з меню правого кліку й з бічної панелі. */
export function OfferPriceDialogHost() {
  const offerId = useSourcingUi((s) => s.priceOfferId);
  const offer = useRequestDoc((s) => (offerId ? (s.doc?.offers.find((o) => o.id === offerId) ?? null) : null));
  return <OfferPriceDialog offer={offer} onClose={() => useSourcingUi.getState().openPriceDialog(null)} />;
}
