// «Копіювати заявку» (КОП-1, КОП-2): нова заявка з позиціями клієнта (і підбором, ✔, націнкою) —
// з цінами оригіналу або перерахованими за актуальним каталогом і курсами. Відкривається з редактора й з реєстру.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Checkbox, Form, Modal, Radio, Select, Typography } from 'antd';
import { useNavigate } from 'react-router';
import { formatRequestNumber } from '@shared/format';
import type { CopyRequestBody, UUID } from '@shared/types';
import { ds, errorMessage, qk } from '@/data';
import { getRequestDocStore } from '@/stores/requestDocStore';

interface FormValues {
  clientId?: UUID | null;
  withSourcing: boolean;
  priceMode: CopyRequestBody['priceMode'];
}

/** Заявка, яку копіюємо. */
export interface CopySource {
  id: UUID;
  number: number;
  clientId: UUID | null;
}

export interface CopyRequestDialogProps {
  /** null — діалог закрито. */
  source: CopySource | null;
  onClose(): void;
}

export function CopyRequestDialog({ source, onClose }: CopyRequestDialogProps) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const withSourcing = Form.useWatch('withSourcing', form) ?? true;
  const clients = useQuery({ queryKey: qk.clients, queryFn: () => ds.listClients(), enabled: !!source });

  const copy = useMutation({
    mutationFn: async (v: FormValues) => {
      // незбережені зміни оригіналу (якщо він відкритий у цій вкладці) — спершу на сервер
      const store = getRequestDocStore().getState();
      if (store.requestId === source!.id) await store.flush();
      const clientId = v.clientId ?? null;
      return ds.copyRequest(source!.id, {
        include: v.withSourcing ? 'full' : 'lines',
        priceMode: v.withSourcing ? v.priceMode : 'keep',
        ...(clientId !== source!.clientId ? { clientId } : {}),
      });
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: qk.requestsAll });
      const r = res.report;
      let text = `Створено заявку № ${formatRequestNumber(res.number)} — копію № ${formatRequestNumber(r.sourceNumber)}`;
      if (r.priceMode === 'refresh') {
        text += `. Перераховано цін: ${r.offersRefreshed} (▲ ${r.priceUp}, ▼ ${r.priceDown})`;
        if (r.offersNotInCatalog) text += `, немає в каталозі: ${r.offersNotInCatalog}`;
      }
      message.success(text, 6);
      onClose();
      navigate(`/requests/${res.id}`);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Modal
      title={source ? `Копіювати заявку № ${formatRequestNumber(source.number)}` : 'Копіювати заявку'}
      open={!!source}
      okText="Створити копію"
      cancelText="Скасувати"
      confirmLoading={copy.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
      width={520}
    >
      {source ? (
        <Form<FormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{ clientId: source.clientId, withSourcing: true, priceMode: 'keep' }}
          onFinish={(v) => copy.mutate(v)}
          style={{ marginTop: 12 }}
        >
          <Form.Item name="clientId" label="Клієнт" extra="Можна обрати іншого клієнта — контрагент і контакт підставляться">
            <Select
              showSearch
              allowClear
              placeholder="Без клієнта"
              loading={clients.isPending}
              optionFilterProp="label"
              options={clients.data?.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
          <Form.Item name="withSourcing" valuePropName="checked" style={{ marginBottom: 8 }} extra="Позиції клієнта копіюються завжди">
            <Checkbox>Блоки постачальників, підбір, ✔ і націнка</Checkbox>
          </Form.Item>
          <Form.Item name="priceMode" label="Ціни">
            <Radio.Group disabled={!withSourcing} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Radio value="keep">Залишити ціни й курси з цієї заявки</Radio>
              <Radio value="refresh">Перерахувати за актуальним каталогом і курсами (зміни позначаться ▲▼)</Radio>
            </Radio.Group>
          </Form.Item>
        </Form>
      ) : null}
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Нова заявка отримає наступний номер і статус «В роботі», відповідальний — ви. КП, погодження й історія не копіюються.
      </Typography.Text>
    </Modal>
  );
}
