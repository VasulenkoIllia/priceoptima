import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Form, Input, Modal, Select } from 'antd';
import { useEffect } from 'react';
import { formatRequestNumber } from '@shared/format';
import type { UUID } from '@shared/types';
import { useSession } from '@/app/session';
import { ds, errorMessage, qk } from '@/data';
import { contactsFor, defaultContact, defaultCounterparty } from '@/lib/refs';

interface FormValues {
  clientId?: UUID;
  counterpartyId?: UUID;
  contactId?: UUID;
  ownCompanyId: UUID;
  managerId: UUID;
  title?: string;
}

export interface CreateRequestDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: UUID) => void;
}

/** «Створити заявку» (§6.2): клієнт → контрагент → контакт; наша юрособа; відповідальний. */
export function CreateRequestDialog({ open, onClose, onCreated }: CreateRequestDialogProps) {
  const { user } = useSession();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const clientId = Form.useWatch('clientId', form);
  const counterpartyId = Form.useWatch('counterpartyId', form);

  const clients = useQuery({ queryKey: qk.clients, queryFn: () => ds.listClients(), enabled: open });
  const client = useQuery({ queryKey: qk.client(clientId ?? ''), queryFn: () => ds.getClient(clientId!), enabled: open && !!clientId });
  const ownCompanies = useQuery({ queryKey: qk.ownCompanies, queryFn: () => ds.listOwnCompanies(), enabled: open });
  const users = useQuery({ queryKey: qk.users, queryFn: () => ds.listUsers(), enabled: open });

  const defaultOwnId = ownCompanies.data?.find((c) => c.isDefault)?.id ?? ownCompanies.data?.[0]?.id;
  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ managerId: form.getFieldValue('managerId') ?? user.id });
    if (defaultOwnId && !form.getFieldValue('ownCompanyId')) form.setFieldsValue({ ownCompanyId: defaultOwnId });
  }, [open, defaultOwnId, form, user.id]);

  // клієнт завантажився — дефолтні контрагент і контакт
  const detail = client.data?.id === clientId ? client.data : undefined;
  useEffect(() => {
    if (!detail || form.getFieldValue('counterpartyId')) return;
    const cp = defaultCounterparty(detail);
    form.setFieldsValue({ counterpartyId: cp?.id, contactId: defaultContact(detail, cp?.id)?.id });
  }, [detail, form]);

  const create = useMutation({
    mutationFn: (v: FormValues) =>
      ds.createRequest({
        clientId: v.clientId ?? null,
        counterpartyId: v.counterpartyId ?? null,
        contactId: v.contactId ?? null,
        ownCompanyId: v.ownCompanyId,
        managerId: v.managerId,
        title: v.title?.trim() || null,
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: qk.requestsAll });
      message.success(`Створено заявку № ${formatRequestNumber(res.number)}`);
      form.resetFields();
      onClose();
      onCreated(res.id);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const contacts = contactsFor(detail, counterpartyId);

  return (
    <Modal
      title="Нова заявка"
      open={open}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      onOk={() => form.submit()}
      okText="Створити"
      cancelText="Скасувати"
      confirmLoading={create.isPending}
      destroyOnHidden
      width={560}
    >
      <Form<FormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={(v) => create.mutate(v)}
        onValuesChange={(changed: Partial<FormValues>) => {
          if ('clientId' in changed) form.setFieldsValue({ counterpartyId: undefined, contactId: undefined });
          if ('counterpartyId' in changed) form.setFieldsValue({ contactId: defaultContact(detail, changed.counterpartyId)?.id });
        }}
        style={{ marginTop: 12 }}
      >
        <Form.Item name="clientId" label="Клієнт" extra="Можна вибрати пізніше в шапці заявки">
          <Select
            showSearch
            allowClear
            placeholder="Почніть вводити назву або ЄДРПОУ"
            loading={clients.isPending}
            optionFilterProp="search"
            options={clients.data?.map((c) => ({
              value: c.id,
              label: c.name,
              search: [c.name, ...c.counterparties.flatMap((cp) => [cp.nameShort, cp.edrpou ?? ''])].join(' '),
            }))}
          />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="counterpartyId" label="Контрагент">
            <Select
              allowClear
              disabled={!clientId}
              loading={client.isFetching}
              placeholder="Юрособа клієнта"
              options={detail?.counterparties
                .filter((cp) => cp.isActive)
                .map((cp) => ({
                  value: cp.id,
                  label: cp.edrpou ? `${cp.nameShort} (${cp.edrpou})` : cp.nameShort,
                }))}
            />
          </Form.Item>
          <Form.Item name="contactId" label="Контакт">
            <Select
              allowClear
              disabled={!clientId}
              placeholder="Контактна особа"
              options={contacts.map((c) => ({ value: c.id, label: c.position ? `${c.fullName} — ${c.position}` : c.fullName }))}
            />
          </Form.Item>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="ownCompanyId" label="Наша юрособа" rules={[{ required: true, message: 'Оберіть юрособу' }]}>
            <Select
              loading={ownCompanies.isPending}
              options={ownCompanies.data?.map((c) => ({
                value: c.id,
                label: `${c.nameShort}${c.isVatPayer ? ' · з ПДВ' : ' · без ПДВ'}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="managerId" label="Відповідальний" rules={[{ required: true, message: 'Оберіть відповідального' }]}>
            <Select
              loading={users.isPending}
              options={users.data?.filter((u) => u.isActive).map((u) => ({ value: u.id, label: u.shortName }))}
            />
          </Form.Item>
        </div>
        <Form.Item name="title" label="Тема (необов'язково)">
          <Input placeholder="Напр.: Комплектація санвузлів, корпус Б" maxLength={200} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
