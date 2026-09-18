// «Мій профіль»: ПІБ, коротке ім'я, телефон (друкується в КП), e-mail і зміна пароля. Логін і роль змінює адміністратор.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Divider, Form, Input, Modal } from 'antd';
import { USER_ROLE_LABELS } from '@shared/enums';
import type { MeResponse, UserDto } from '@shared/types';
import { ds, errorMessage, qk } from '@/data';

interface ProfileValues {
  fullName: string;
  shortName: string;
  phone?: string | null;
  email?: string | null;
}

export interface PasswordValues {
  currentPassword: string;
  newPassword: string;
  confirm: string;
}

const GRID_2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12 } as const;
const text = (v: string | null | undefined) => v?.trim() || null;

/** Оновити «хто я» після зміни профілю чи пароля. */
export function useSetMeUser() {
  const queryClient = useQueryClient();
  return (user: UserDto) => queryClient.setQueryData<MeResponse | null>(qk.me, (me) => (me ? { ...me, user } : me));
}

export function PasswordFields() {
  return (
    <>
      <Form.Item name="currentPassword" label="Поточний пароль" rules={[{ required: true, message: 'Вкажіть поточний пароль' }]}>
        <Input.Password autoComplete="current-password" />
      </Form.Item>
      <div style={GRID_2}>
        <Form.Item name="newPassword" label="Новий пароль" rules={[{ required: true, min: 8, message: 'Пароль — не менше 8 символів' }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="Ще раз новий"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: 'Повторіть пароль' },
            ({ getFieldValue }) => ({
              validator: (_, v: string) => (!v || v === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error('Паролі не збігаються'))),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </div>
    </>
  );
}

export function ProfileDialog({ open, user, onClose }: { open: boolean; user: UserDto; onClose(): void }) {
  const { message } = App.useApp();
  const setMeUser = useSetMeUser();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<ProfileValues>();
  const [pwdForm] = Form.useForm<PasswordValues>();

  const save = useMutation({
    mutationFn: (v: ProfileValues) => ds.updateProfile({ fullName: v.fullName.trim(), shortName: v.shortName.trim(), phone: text(v.phone), email: text(v.email) }),
    onSuccess: (saved) => {
      setMeUser(saved);
      void queryClient.invalidateQueries({ queryKey: qk.users });
      message.success('Профіль збережено');
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const password = useMutation({
    mutationFn: (v: PasswordValues) => ds.changePassword({ currentPassword: v.currentPassword, newPassword: v.newPassword }),
    onSuccess: (saved) => {
      setMeUser(saved);
      pwdForm.resetFields();
      message.success('Пароль змінено. На інших пристроях потрібно буде увійти знову');
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Modal
      open={open}
      title="Мій профіль"
      okText="Зберегти профіль"
      cancelText="Закрити"
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
      width={560}
    >
      <div className="po-muted" style={{ marginBottom: 12 }}>
        Логін <b className="po-num">{user.login}</b> · {USER_ROLE_LABELS[user.role]}. Логін і роль змінює адміністратор.
      </div>
      <Form<ProfileValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve={false}
        initialValues={{ fullName: user.fullName, shortName: user.shortName, phone: user.phone, email: user.email }}
        onFinish={(v) => save.mutate(v)}
      >
        <Form.Item name="fullName" label="ПІБ" rules={[{ required: true, whitespace: true, message: 'Вкажіть ПІБ' }]}>
          <Input maxLength={160} />
        </Form.Item>
        <div style={GRID_2}>
          <Form.Item name="shortName" label="Коротке ім’я" extra="У списках, історії й КП" rules={[{ required: true, whitespace: true, message: 'Вкажіть коротке ім’я' }]}>
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="phone" label="Телефон" extra="Друкується в КП у рядку «Менеджер»">
            <Input maxLength={40} />
          </Form.Item>
        </div>
        <Form.Item name="email" label="E-mail" rules={[{ type: 'email', message: 'Невірний e-mail' }]}>
          <Input maxLength={160} />
        </Form.Item>
      </Form>
      <Divider plain>Зміна пароля</Divider>
      <Form<PasswordValues> form={pwdForm} layout="vertical" requiredMark={false} onFinish={(v) => password.mutate(v)}>
        <PasswordFields />
        <Button htmlType="submit" loading={password.isPending}>
          Змінити пароль
        </Button>
      </Form>
    </Modal>
  );
}

/** Перший вхід адміністратора з .env: доки пароль не змінено, програма недоступна (РОЛ-2). */
export function ForcePasswordChange({ user }: { user: UserDto }) {
  const setMeUser = useSetMeUser();
  const queryClient = useQueryClient();
  const logout = async () => {
    await ds.logout().catch(() => undefined);
    queryClient.setQueryData(qk.me, null);
  };
  const [form] = Form.useForm<PasswordValues>();
  const change = useMutation({
    mutationFn: (v: PasswordValues) => ds.changePassword({ currentPassword: v.currentPassword, newPassword: v.newPassword }),
    onSuccess: (saved) => setMeUser(saved),
  });
  return (
    <div className="po-login">
      <div style={{ width: '100%', maxWidth: 460, background: '#fff', padding: 24, borderRadius: 8 }}>
        <h2 style={{ marginTop: 0 }}>Змініть пароль</h2>
        <p className="po-muted">
          {user.shortName}, ви входите вперше з паролем, заданим під час встановлення. Задайте власний пароль, щоб продовжити.
        </p>
        <Form<PasswordValues> form={form} layout="vertical" requiredMark={false} onFinish={(v) => change.mutate(v)}>
          <PasswordFields />
          {change.isError ? <Alert type="error" showIcon message={errorMessage(change.error)} style={{ marginBottom: 16 }} /> : null}
          <Button type="primary" htmlType="submit" block loading={change.isPending}>
            Зберегти й продовжити
          </Button>
        </Form>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <a onClick={() => void logout()}>Вийти</a>
        </div>
      </div>
    </div>
  );
}
