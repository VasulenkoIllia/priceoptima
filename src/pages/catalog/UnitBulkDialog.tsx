// Одиниця й кратність для кількох товарів одразу (правки замовника 25.09 п.8): напр., труби, які постачальник продає
// метрами відрізками по 4 м. Оновлення прайсу одиницю й кратність наявних товарів не змінює — задане тут лишається.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Form, InputNumber, Modal, Select } from 'antd';
import { formatQty } from '@shared/format';
import { DEFAULT_UNITS } from '@shared/parse';
import type { UUID } from '@shared/types';
import { ds, errorMessage, qk } from '@/data';

interface Values {
  unitCode: string;
  multiplicity: number;
}

const UNIT_OPTIONS = DEFAULT_UNITS.filter((u) => u.isActive).map((u) => ({ value: u.code, label: `${u.code} — ${u.name}` }));

interface UnitBulkDialogProps {
  open: boolean;
  /** Скільки товарів зміниться. */
  count: number;
  /** Про які товари йдеться: «вибрані» чи «знайдені». */
  scope: 'selected' | 'found';
  /** Id товарів (для «знайдених» — довантажуються за поточними фільтрами). */
  resolveIds: () => Promise<UUID[]>;
  onClose: () => void;
  onDone: () => void;
}

export function UnitBulkDialog({ open, count, scope, resolveIds, onClose, onDone }: UnitBulkDialogProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<Values>();

  const save = useMutation({
    mutationFn: async (v: Values) => ds.setProductsUnit({ ids: await resolveIds(), unitCode: v.unitCode.trim(), multiplicity: v.multiplicity }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: qk.productsAll });
      message.success(`Одиницю й кратність змінено: ${formatQty(r.updated)} товарів`);
      onDone();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Modal
      open={open}
      title={`Одиниця й кратність: ${scope === 'selected' ? 'вибрані' : 'знайдені'} товари (${formatQty(count)})`}
      okText="Змінити"
      cancelText="Скасувати"
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
      width={520}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Ціна в прайсі має бути саме за цю одиницю: напр., труба — ціна за метр, кратність 4 — продається відрізками по 4 м. Оновлення прайсу одиницю й кратність не змінює."
      />
      <Form<Values> form={form} layout="vertical" requiredMark={false} initialValues={{ multiplicity: 1 }} onFinish={(v) => save.mutate(v)}>
        {/* список, а не поле з підказками: відкриті підказки перекривали кнопку «Змінити» і клік обирав іншу одиницю */}
        <Form.Item name="unitCode" label="Од. виміру" rules={[{ required: true, message: 'Оберіть одиницю' }]}>
          <Select options={UNIT_OPTIONS} placeholder="Оберіть одиницю" showSearch optionFilterProp="label" />
        </Form.Item>
        <Form.Item name="multiplicity" label="Кратність" extra="Напр. 4: труба продається по 4 м; 1 — без округлення" rules={[{ required: true, message: 'Вкажіть кратність' }]}>
          <InputNumber min={0.001} max={100_000} step={1} decimalSeparator="," style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
