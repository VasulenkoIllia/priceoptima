// Адміністратор змінює дані користувача: ПІБ, коротке ім'я, логін, контакти. Роль і доступ — окремими діями в списку.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Form, Input, Modal } from 'antd';
import { shortNameOf } from '@shared/format';
import type { UserDto, UserUpdateInput } from '@shared/types';
import { ds, errorMessage, qk } from '@/data';

interface FormValues {
  fullName: string;
  shortName: string;
  login: string;
  email?: string | null;
  phone?: string | null;
}

const GRID_2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12 } as const;
const text = (v: string | null | undefined) => v?.trim() || null;

export interface UserDialogProps {
  open: boolean;
  user: UserDto | null;
  onClose: () => void;
}

export function UserDialog({ open, user, onClose }: UserDialogProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const input: UserUpdateInput = { fullName: v.fullName.trim(), shortName: v.shortName.trim(), login: v.login.trim(), email: text(v.email), phone: text(v.phone) };
      return ds.updateUser(user!.id, input);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: qk.users });
      message.success(`Дані користувача ${saved.shortName} збережено`);
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Modal
      open={open && !!user}
      title={user ? `Користувач ${user.shortName}` : ''}
      okText="Зберегти"
      cancelText="Скасувати"
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
      width={560}
    >
      {user ? (
        <Form<FormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          preserve={false}
          initialValues={{ fullName: user.fullName, shortName: user.shortName, login: user.login, email: user.email, phone: user.phone }}
          onFinish={(v) => save.mutate(v)}
          onValuesChange={(changed: Partial<FormValues>, all) => {
            // коротке ім'я підлаштовується під ПІБ, поки його не правили вручну
            if (changed.fullName !== undefined && all.shortName === shortNameOf(user.fullName)) form.setFieldValue('shortName', shortNameOf(changed.fullName));
          }}
        >
          <Form.Item name="fullName" label="ПІБ" rules={[{ required: true, whitespace: true, message: 'Вкажіть ПІБ' }]}>
            <Input maxLength={160} />
          </Form.Item>
          <div style={GRID_2}>
            <Form.Item name="shortName" label="Коротке ім’я" extra="У списках, історії й КП" rules={[{ required: true, whitespace: true, message: 'Вкажіть коротке ім’я' }]}>
              <Input maxLength={60} />
            </Form.Item>
            <Form.Item name="login" label="Логін" rules={[{ required: true, whitespace: true, message: 'Вкажіть логін' }]}>
              <Input maxLength={60} autoComplete="off" />
            </Form.Item>
            <Form.Item name="phone" label="Телефон" extra="Друкується в КП у рядку «Менеджер»">
              <Input maxLength={40} />
            </Form.Item>
            <Form.Item name="email" label="E-mail" rules={[{ type: 'email', message: 'Невірний e-mail' }]}>
              <Input maxLength={160} />
            </Form.Item>
          </div>
        </Form>
      ) : null}
    </Modal>
  );
}
