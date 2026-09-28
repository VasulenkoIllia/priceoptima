// Назва 1С масово (правки замовника 28.09): робоча назва в порожні назви 1С чи в усі, або очистити — для вибраних товарів
// або всіх знайдених за фільтрами «Номенклатури» (напр., цілий постачальник). Спершу підрахунок, потім «Застосувати».
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Modal, Radio, Space, Spin } from 'antd';
import { useState } from 'react';
import { formatQty } from '@shared/format';
import type { ProductListQuery, ProductsName1cMode, UUID } from '@shared/types';
import { ds, errorMessage, qk } from '@/data';

const MODES: { value: ProductsName1cMode; label: string }[] = [
  { value: 'copyEmpty', label: 'Скопіювати робочу назву в назву 1С — лише де назва 1С порожня' },
  { value: 'copyAll', label: 'Скопіювати робочу назву в назву 1С — у всі (вписані замінюються)' },
  { value: 'clear', label: 'Очистити назву 1С' },
];

interface Name1cBulkDialogProps {
  /** Про які товари йдеться: «вибрані» чи «знайдені». */
  scope: 'selected' | 'found';
  /** Скільки товарів у виборі (для заголовка). */
  count: number;
  ids?: UUID[];
  filter?: ProductListQuery;
  onClose: () => void;
  onDone: () => void;
}

export function Name1cBulkDialog({ scope, count, ids, filter, onClose, onDone }: Name1cBulkDialogProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ProductsName1cMode>('copyEmpty');
  const target = ids ? { ids } : { filter };

  const check = useQuery({
    queryKey: ['name1c-bulk-check', mode, ids ?? null, filter ?? null],
    queryFn: () => ds.setProductsName1c({ mode, ...target, dryRun: true }),
    staleTime: 0,
    gcTime: 0,
  });
  const apply = useMutation({
    mutationFn: () => ds.setProductsName1c({ mode, ...target }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: qk.productsAll });
      void queryClient.invalidateQueries({ queryKey: qk.productAll });
      message.success(`Назву 1С змінено: ${formatQty(r.changed)} товарів`);
      onDone();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const changed = check.data?.changed ?? 0;
  return (
    <Modal
      open
      title={`Назва 1С: ${scope === 'selected' ? 'вибрані' : 'знайдені'} товари (${formatQty(count)})`}
      okText="Застосувати"
      cancelText="Скасувати"
      okButtonProps={{ disabled: !check.data || changed === 0 || check.isFetching }}
      confirmLoading={apply.isPending}
      onOk={() => apply.mutate()}
      onCancel={onClose}
      destroyOnHidden
      width={620}
    >
      <Radio.Group value={mode} onChange={(e) => setMode(e.target.value as ProductsName1cMode)} disabled={apply.isPending}>
        <Space direction="vertical">
          {MODES.map((m) => (
            <Radio key={m.value} value={m.value}>
              {m.label}
            </Radio>
          ))}
        </Space>
      </Radio.Group>
      <div style={{ marginTop: 16 }}>
        {check.isFetching ? (
          <Spin size="small" />
        ) : check.isError ? (
          <Alert type="error" showIcon message={errorMessage(check.error)} />
        ) : check.data ? (
          <Alert
            type={changed ? (mode === 'copyEmpty' ? 'info' : 'warning') : 'success'}
            showIcon
            message={
              changed
                ? `Зміниться назва 1С у ${formatQty(changed)} з ${formatQty(check.data.matched)} товарів`
                : `Змінювати нічого: у ${formatQty(check.data.matched)} товарів уже так`
            }
            description={
              <>
                {mode === 'copyAll' && changed ? <div>Вписані вручну назви 1С буде замінено робочою назвою.</div> : null}
                {mode === 'clear' && changed ? <div>Назви 1С буде очищено; у рахунку для бухгалтера ці позиції стануть жовтими.</div> : null}
                {check.data.tooLong ? (
                  <div>Робоча назва довша за 300 символів у {formatQty(check.data.tooLong)} товарів — їм назву 1С не скопійовано.</div>
                ) : null}
              </>
            }
          />
        ) : null}
      </div>
    </Modal>
  );
}
