// Редагування картки товару: назви, бренд, одиниця, кратність, мінімальне замовлення, примітка.
// Ціни тут не змінюються (прайс або «Змінити ціну» для доданих вручну); заповнені поля прайс не перезаписує.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Form, Input, InputNumber, Modal } from 'antd';
import { useEffect } from 'react';
import type { ProductDetail, ProductPatch } from '@shared/types';
import { ds, errorMessage, isDataSourceError, qk } from '@/data';

interface Values {
  nameWork: string;
  name1c?: string | null;
  brand?: string | null;
  unitCode: string;
  multiplicity: number;
  minOrderQty?: number | null;
  notes?: string | null;
}

const text = (v: string | null | undefined) => v?.trim() || null;

export interface ProductEditDialogProps {
  open: boolean;
  product: ProductDetail;
  onClose: () => void;
}

export function ProductEditDialog({ open, product, onClose }: ProductEditDialogProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<Values>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      nameWork: product.nameWork,
      name1c: product.name1c,
      brand: product.brand,
      unitCode: product.unitCode,
      multiplicity: product.multiplicity,
      minOrderQty: product.minOrderQty,
      notes: product.notes,
    });
  }, [open, product, form]);

  const save = useMutation({
    mutationFn: (v: Values) => {
      const patch: ProductPatch = {
        version: product.version,
        nameWork: v.nameWork.trim(),
        name1c: text(v.name1c),
        brand: text(v.brand),
        unitCode: v.unitCode.trim(),
        multiplicity: v.multiplicity,
        minOrderQty: v.minOrderQty ?? null,
        notes: text(v.notes),
      };
      return ds.updateProduct(product.id, patch);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(qk.product(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: qk.productsAll });
      message.success('Картку товару збережено');
      onClose();
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
      title={`Редагування товару ${product.sku}`}
      okText="Зберегти"
      cancelText="Скасувати"
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
      width={620}
    >
      <p className="po-muted" style={{ marginTop: 0 }}>
        Оновлення прайсу ці поля не перезаписує. Ціни тут не змінюються: у товарів із прайсу їх веде прайс, у доданих вручну є «Змінити ціну».
      </p>
      <Form<Values> form={form} layout="vertical" requiredMark={false} onFinish={(v) => save.mutate(v)}>
        <Form.Item name="nameWork" label="Найменування робоче" rules={[{ required: true, whitespace: true, message: 'Вкажіть робочу назву' }]}>
          <Input maxLength={300} />
        </Form.Item>
        <Form.Item name="name1c" label="Найменування 1С" extra="Як у бухгалтерії; можна обрати для друку в КП">
          <Input maxLength={300} placeholder="не задано" />
        </Form.Item>
        <div className="po-cat-edit-grid">
          <Form.Item name="brand" label="Бренд">
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="unitCode" label="Од. виміру" rules={[{ required: true, whitespace: true, message: 'Вкажіть одиницю' }]}>
            <Input maxLength={20} />
          </Form.Item>
          <Form.Item
            name="multiplicity"
            label="Кратність"
            extra="Напр. 4: труба продається по 4 м"
            rules={[{ required: true, message: 'Вкажіть кратність' }]}
          >
            <InputNumber min={0.001} max={100_000} step={1} decimalSeparator="," style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="minOrderQty" label="Мін. замовлення">
            <InputNumber min={0} step={1} decimalSeparator="," style={{ width: '100%' }} placeholder="немає" />
          </Form.Item>
        </div>
        <Form.Item name="notes" label="Примітка">
          <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
