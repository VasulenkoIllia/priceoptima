// Додавання й редагування користувача (довідник відповідальних). У прототипі входить лише один обліковий запис — паролів тут немає.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Checkbox, Form, Input, Modal, Radio } from 'antd';
import { USER_ROLES, USER_ROLE_LABELS, type UserRole } from '@shared/enums';
import type { UserDto, UserInput } from '@shared/types';
import { ds, errorMessage, qk } from '@/data';

interface FormValues {
  fullName: string;
  shortName: string;
  login: string;
  role: UserRole;
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
}

const GRID_2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12 } as const;
const ROLE_OPTIONS = USER_ROLES.map((r) => ({ value: r, label: USER_ROLE_LABELS[r] }));
const text = (v: string | null | undefined) => v?.trim() || null;
const noSpaces = (v: string | undefined) => (v ?? '').replace(/\s/gu, '');

/** «Коваль Олена Вікторівна» → «Коваль О.В.» */
function toShortName(fullName: string): string {
  const [last, ...rest] = fullName.trim().split(/\s+/u);
  if (!last) return '';
  const initials = rest
    .slice(0, 2)
    .map((p) => `${p.charAt(0).toLocaleUpperCase('uk')}.`)
    .join('');
  return initials ? `${last} ${initials}` : last;
}

function toInput(v: FormValues): UserInput {
  return {
    fullName: v.fullName.trim(),
    shortName: v.shortName.trim(),
    login: v.login.trim(),
    role: v.role,
    email: text(v.email),
    phone: text(v.phone),
    isActive: !!v.isActive,
  };
}

export interface UserDialogProps {
  open: boolean;
  /** null — новий користувач. */
  user: UserDto | null;
  onClose: () => void;
}

export function UserDialog({ open, user, onClose }: UserDialogProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  // перевірки (обов'язкові поля, зайнятий логін, хоча б один активний адміністратор) — у ds.saveUser
  const save = useMutation({
    mutationFn: (v: FormValues) => ds.saveUser(user?.id ?? null, toInput(v)),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: qk.users });
      message.success(user ? `Зміни збережено: ${saved.shortName}` : `Користувача ${saved.shortName} додано`);
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Modal
      open={open}
      title={user ? `Користувач: ${user.shortName}` : 'Новий користувач'}
      okText={user ? 'Зберегти' : 'Додати'}
      cancelText="Скасувати"
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
      width={560}
    >
      <Form<FormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve={false}
        initialValues={user ?? { role: 'user', isActive: true }}
        onValuesChange={(changed: Partial<FormValues>) => {
          // новому користувачу коротке ім'я складаємо з ПІБ, доки його не змінили вручну
          if (!user && changed.fullName !== undefined && !form.isFieldTouched('shortName')) {
            form.setFieldValue('shortName', toShortName(changed.fullName));
          }
        }}
        onFinish={(v) => save.mutate(v)}
        style={{ marginTop: 12 }}
      >
        <Form.Item name="fullName" label="ПІБ" rules={[{ required: true, whitespace: true, message: 'Вкажіть ПІБ' }]}>
          <Input placeholder="Коваль Олена Вікторівна" autoFocus />
        </Form.Item>
        <div style={GRID_2}>
          <Form.Item name="shortName" label="Коротке ім’я" rules={[{ required: true, whitespace: true, message: 'Вкажіть коротке ім’я' }]}>
            <Input placeholder="Коваль О.В." />
          </Form.Item>
          <Form.Item name="login" label="Логін" normalize={noSpaces} rules={[{ required: true, message: 'Вкажіть логін' }]}>
            <Input className="po-num" placeholder="koval" autoComplete="off" />
          </Form.Item>
        </div>
        <Form.Item name="role" label="Роль">
          <Radio.Group optionType="button" buttonStyle="solid" options={ROLE_OPTIONS} />
        </Form.Item>
        <div style={GRID_2}>
          <Form.Item name="email" label="E-mail" rules={[{ type: 'email', message: 'Схоже на некоректний e-mail', warningOnly: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Телефон">
            <Input className="po-num" placeholder="+380…" />
          </Form.Item>
        </div>
        <Form.Item
          name="isActive"
          valuePropName="checked"
          style={{ marginBottom: 0 }}
          extra="Неактивний не може увійти й не пропонується відповідальним у нових заявках; його заявки зберігаються."
        >
          <Checkbox>Активний</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}
