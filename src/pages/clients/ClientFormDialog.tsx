// Створення / редагування клієнта: назва, відповідальний, контрагенти й контакти.
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Checkbox, Form, Input, Modal, Select, Tooltip, Typography } from 'antd';
import { useEffect } from 'react';
import type { ClientDetail, ClientInput, ContactInput, CounterpartyInput, UUID } from '@shared/types';
import { ds, errorMessage, isDataSourceError, qk } from '@/data';
import { newId } from '@/lib/ids';

interface CounterpartyValues {
  id: UUID;
  nameShort: string;
  nameFull?: string | null;
  edrpou?: string | null;
  isVatPayer: boolean;
  addressLegal?: string | null;
}

interface ContactValues {
  id: UUID;
  fullName: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  counterpartyId?: UUID | null;
}

interface FormValues {
  name: string;
  note?: string | null;
  responsibleUserId?: UUID | null;
  counterparties?: CounterpartyValues[];
  contacts?: ContactValues[];
}

const text = (v: string | null | undefined) => v?.trim() || null;

function toFormValues(c: ClientDetail | null): FormValues {
  if (!c) return { name: '', counterparties: [], contacts: [] };
  return {
    name: c.name,
    note: c.note,
    responsibleUserId: c.responsibleUserId,
    // архівні (прибрані раніше) у формі не показуємо — вони лишаються лише в старих заявках
    counterparties: c.counterparties
      .filter((cp) => cp.isActive)
      .map((cp) => ({
        id: cp.id,
        nameShort: cp.nameShort,
        nameFull: cp.nameFull,
        edrpou: cp.edrpou,
        isVatPayer: cp.isVatPayer,
        addressLegal: cp.addressLegal,
      })),
    contacts: c.contacts
      .filter((ct) => ct.isActive)
      .map((ct) => ({
        id: ct.id,
        fullName: ct.fullName,
        position: ct.position,
        phone: ct.phone,
        email: ct.email,
        counterpartyId: ct.counterpartyId,
      })),
  };
}

/** Повний ClientInput; поля, яких немає у формі, беремо з попередньої версії. */
function buildInput(v: FormValues, prev: ClientDetail | null): ClientInput {
  const name = v.name.trim();
  const prevCps = new Map(prev?.counterparties.map((x) => [x.id, x] as const));
  let counterparties: CounterpartyInput[] = (v.counterparties ?? []).map((cp) => {
    const old = prevCps.get(cp.id);
    return {
      id: cp.id,
      nameShort: cp.nameShort.trim(),
      nameFull: text(cp.nameFull),
      edrpou: text(cp.edrpou),
      ipn: old?.ipn ?? null,
      isVatPayer: !!cp.isVatPayer,
      addressLegal: text(cp.addressLegal),
      addressActual: old?.addressActual ?? null,
      note: old?.note ?? null,
      isDefault: old?.isDefault ?? false,
      isActive: old?.isActive ?? true,
    };
  });
  // ДОВ-2: у клієнта завжди є хоча б один контрагент
  if (!counterparties.length) {
    counterparties = [
      { id: newId(), nameShort: name, nameFull: null, edrpou: null, ipn: null, isVatPayer: true, addressLegal: null, addressActual: null, note: null, isDefault: true, isActive: true },
    ];
  }
  if (!counterparties.some((cp) => cp.isDefault)) counterparties[0] = { ...counterparties[0], isDefault: true };

  const cpIds = new Set(counterparties.map((cp) => cp.id));
  const prevCts = new Map(prev?.contacts.map((x) => [x.id, x] as const));
  const contacts: ContactInput[] = (v.contacts ?? []).map((ct) => {
    const old = prevCts.get(ct.id);
    return {
      id: ct.id,
      fullName: ct.fullName.trim(),
      position: text(ct.position),
      phone: text(ct.phone),
      email: text(ct.email),
      // контрагента могли видалити у формі
      counterpartyId: ct.counterpartyId && cpIds.has(ct.counterpartyId) ? ct.counterpartyId : null,
      note: old?.note ?? null,
      isPrimary: old?.isPrimary ?? false,
      isActive: old?.isActive ?? true,
    };
  });
  if (contacts.length && !contacts.some((c) => c.isPrimary)) contacts[0] = { ...contacts[0], isPrimary: true };

  // version — та, з якою відкрили картку: чужі правки не перезаписуємо
  return { version: prev?.version, name, note: text(v.note), responsibleUserId: v.responsibleUserId ?? null, isActive: prev?.isActive ?? true, counterparties, contacts };
}

export interface ClientFormDialogProps {
  open: boolean;
  /** null — новий клієнт. */
  client: ClientDetail | null;
  onClose: () => void;
  onSaved?: (id: UUID) => void;
}

export function ClientFormDialog({ open, client, onClose, onSaved }: ClientFormDialogProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const counterparties = Form.useWatch('counterparties', form);
  const users = useQuery({ queryKey: qk.users, queryFn: () => ds.listUsers(), enabled: open });

  // значення — при кожному відкритті: initialValues + preserve={false} у Form.List під StrictMode губить значення рядків списку
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(toFormValues(client));
  }, [open, client, form]);

  const save = useMutation({
    mutationFn: (v: FormValues) => ds.saveClient(client?.id ?? null, buildInput(v, client)),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: qk.clients });
      void queryClient.invalidateQueries({ queryKey: qk.client(saved.id) });
      void queryClient.invalidateQueries({ queryKey: qk.requestsAll });
      message.success(client ? 'Клієнта збережено' : `Клієнта «${saved.name}» створено`);
      onClose();
      onSaved?.(saved.id);
    },
    onError: (e) => {
      message.error(errorMessage(e));
      // картку встигли змінити — перечитуємо, щоб у формі були свіжі дані
      if (isDataSourceError(e, 'VERSION_CONFLICT')) void queryClient.invalidateQueries();
    },
  });

  const userOptions = (users.data ?? [])
    .filter((u) => u.isActive || u.id === client?.responsibleUserId)
    .map((u) => ({ value: u.id, label: u.shortName }));
  const cpOptions = (counterparties ?? [])
    .filter((cp): cp is CounterpartyValues => !!cp?.id)
    .map((cp) => ({ value: cp.id, label: cp.nameShort?.trim() || 'Без назви' }));

  return (
    <Modal
      open={open}
      title={client ? 'Редагування клієнта' : 'Новий клієнт'}
      okText={client ? 'Зберегти' : 'Створити'}
      cancelText="Скасувати"
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
      width={820}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 } }}
    >
      <Form<FormValues>
        form={form}
        className="po-cli-form"
        layout="vertical"
        requiredMark={false}
        onFinish={(v) => save.mutate(v)}
        style={{ marginTop: 12 }}
      >
        <div className="po-cli-grid po-cli-grid-2">
          <Form.Item name="name" label="Назва клієнта" rules={[{ required: true, whitespace: true, message: 'Вкажіть назву клієнта' }]}>
            <Input autoFocus placeholder="Напр.: БУДІНВЕСТ" maxLength={200} />
          </Form.Item>
          <Form.Item name="responsibleUserId" label="Відповідальний">
            <Select allowClear placeholder="Не вказано" loading={users.isPending} options={userOptions} />
          </Form.Item>
        </div>
        <Form.Item name="note" label="Примітка">
          <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} placeholder="Необов'язково" />
        </Form.Item>

        <div className="po-cli-section">
          Контрагенти <span className="po-cli-section-hint">юрособи клієнта, на які виставляються КП</span>
        </div>
        <Form.List name="counterparties">
          {(fields, { add, remove }) => (
            <div className="po-cli-items">
              {fields.map(({ key, name }) => (
                <div key={key} className="po-cli-item">
                  <Form.Item name={[name, 'id']} hidden>
                    <Input />
                  </Form.Item>
                  <div className="po-cli-grid po-cli-grid-cp">
                    <Form.Item name={[name, 'nameShort']} label="Коротка назва" rules={[{ required: true, whitespace: true, message: 'Вкажіть коротку назву' }]}>
                      <Input placeholder="ТОВ «…»" />
                    </Form.Item>
                    <Form.Item
                      name={[name, 'edrpou']}
                      label="ЄДРПОУ / РНОКПП"
                      normalize={(v: string) => v.replace(/\s/gu, '')}
                      // ДОВ-6: у даних клієнтів трапляються 9-значні коди — лише попередження, збереженню не заважає
                      rules={[{ pattern: /^\d{8}(\d{2})?$/u, message: 'Зазвичай 8 цифр (ЄДРПОУ) або 10 (РНОКПП)', warningOnly: true }]}
                    >
                      <Input className="po-num" maxLength={12} />
                    </Form.Item>
                    <Form.Item name={[name, 'isVatPayer']} label=" " valuePropName="checked">
                      <Checkbox>Платник ПДВ</Checkbox>
                    </Form.Item>
                  </div>
                  <div className="po-cli-grid po-cli-grid-2">
                    <Form.Item name={[name, 'nameFull']} label="Повна назва">
                      <Input placeholder="Для КП і документів" />
                    </Form.Item>
                    <Form.Item name={[name, 'addressLegal']} label="Юридична адреса">
                      <Input />
                    </Form.Item>
                  </div>
                  <Tooltip title="Видалити контрагента">
                    <Button className="po-cli-remove" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                  </Tooltip>
                </div>
              ))}
              {fields.length === 0 ? (
                <Typography.Text type="secondary">Якщо не додати жодного, буде створено контрагента з назвою клієнта.</Typography.Text>
              ) : null}
              <div>
                <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ id: newId(), nameShort: '', isVatPayer: true })}>
                  Додати контрагента
                </Button>
              </div>
            </div>
          )}
        </Form.List>

        <div className="po-cli-section">Контакти</div>
        <Form.List name="contacts">
          {(fields, { add, remove }) => (
            <div className="po-cli-items">
              {fields.map(({ key, name }) => (
                <div key={key} className="po-cli-item">
                  <Form.Item name={[name, 'id']} hidden>
                    <Input />
                  </Form.Item>
                  <div className="po-cli-grid po-cli-grid-ct">
                    <Form.Item name={[name, 'fullName']} label="ПІБ" rules={[{ required: true, whitespace: true, message: 'Вкажіть ПІБ' }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name={[name, 'position']} label="Посада">
                      <Input />
                    </Form.Item>
                    <Form.Item name={[name, 'phone']} label="Телефон">
                      <Input placeholder="067-000-00-00" />
                    </Form.Item>
                  </div>
                  <div className="po-cli-grid po-cli-grid-2">
                    <Form.Item name={[name, 'email']} label="E-mail" rules={[{ type: 'email', message: 'Схоже на некоректний e-mail', warningOnly: true }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name={[name, 'counterpartyId']} label="Контрагент">
                      <Select allowClear placeholder="Усі контрагенти" options={cpOptions} />
                    </Form.Item>
                  </div>
                  <Tooltip title="Видалити контакт">
                    <Button className="po-cli-remove" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                  </Tooltip>
                </div>
              ))}
              <div>
                <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ id: newId(), fullName: '', counterpartyId: cpOptions[0]?.value ?? null })}>
                  Додати контакт
                </Button>
              </div>
            </div>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}
