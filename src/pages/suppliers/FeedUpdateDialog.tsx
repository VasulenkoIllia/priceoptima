// «Оновити вручну…» з вигрузки за посиланням (правки замовника 28.09): вибрати, що оновлювати, «Перевірити»
// (вигрузка завантажується й звіряється, нічого не записано) і «Застосувати» — рівно ці поля. Автооновлення не змінюється.
import { useMutation } from '@tanstack/react-query';
import { Alert, App, Button, Modal } from 'antd';
import { useState } from 'react';
import { FEED_DEFAULT_FIELDS, type PriceUpdateField } from '@shared/catalog/priceUpdateFields';
import type { PriceUpdateDto, SupplierListItem } from '@shared/types';
import { ds, errorMessage } from '@/data';
import { effectiveFields, PriceFieldsPicker, type UnavailableFields } from './PriceFieldsPicker';
import { PriceUpdateReportView } from './PriceUpdateReport';

interface FeedUpdateDialogProps {
  supplier: SupplierListItem;
  onClose(): void;
  /** Застосовано: звіт — у вікні, дані — оновити. */
  onApplied(result: PriceUpdateDto): void;
}

export function unavailableFeedFields(supplier: Pick<SupplierListItem, 'priceSource'>): UnavailableFields {
  const source = supplier.priceSource;
  if (source.kind === 'hybrid') return { purchasePrice: 'Гібрид: вхідні ціни завантажуються файлом, а не з вигрузки' };
  if (!source.hasPurchasePrice) return { purchasePrice: 'У вигрузці немає вхідних цін (лише РРЦ)' };
  return {};
}

export function FeedUpdateDialog({ supplier, onClose, onApplied }: FeedUpdateDialogProps) {
  const { message } = App.useApp();
  const unavailable = unavailableFeedFields(supplier);
  const [fields, setFields] = useState<PriceUpdateField[]>([...FEED_DEFAULT_FIELDS]);
  const selected = effectiveFields(fields, unavailable);
  const key = selected.join(',');
  // перевірка діє лише для того вибору, з яким її робили
  const [checked, setChecked] = useState<{ key: string; result: PriceUpdateDto } | null>(null);
  const preview = checked?.key === key ? checked.result : null;

  const check = useMutation({
    mutationFn: () => ds.refreshSupplierPrices(supplier.id, { dryRun: true, fields: selected }),
    onSuccess: (result) => setChecked({ key, result }),
    onError: (e) => message.error({ content: errorMessage(e), duration: 8 }),
  });
  const apply = useMutation({
    mutationFn: () => ds.refreshSupplierPrices(supplier.id, { fields: selected }),
    onSuccess: onApplied,
    onError: (e) => message.error({ content: errorMessage(e), duration: 8 }),
  });

  return (
    <Modal
      open
      title={`Оновити вручну: ${supplier.name}`}
      width={900}
      onCancel={onClose}
      destroyOnHidden
      footer={[
        <Button key="close" onClick={onClose}>
          Закрити
        </Button>,
        <Button key="check" loading={check.isPending} disabled={!selected.length || apply.isPending} onClick={() => check.mutate()}>
          Перевірити
        </Button>,
        <Button key="apply" type="primary" loading={apply.isPending} disabled={!preview || check.isPending} onClick={() => apply.mutate()}>
          Застосувати
        </Button>,
      ]}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="Разове оновлення з вигрузки лише вибраних полів. Щоденне автооновлення не змінюється."
        description="«Перевірити» завантажує вигрузку й показує, що зміниться, нічого не записуючи. «Застосувати» — після перевірки, з тим самим вибором."
      />
      <PriceFieldsPicker value={fields} onChange={setFields} unavailable={unavailable} disabled={check.isPending || apply.isPending} />
      {preview ? (
        <div className="po-pi-confirm" style={{ marginTop: 16 }}>
          <PriceUpdateReportView update={preview} preview />
        </div>
      ) : checked ? (
        <Alert type="warning" showIcon style={{ marginTop: 16 }} message="Вибір змінено після перевірки: перевірте ще раз" />
      ) : null}
    </Modal>
  );
}
