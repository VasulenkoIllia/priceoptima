// Сторінки за разовим посиланням (без входу): /invite/:token — реєстрація, /reset/:token — новий пароль. Після — одразу в програму.
import { LockOutlined, MailOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input, Result, Spin, Typography } from 'antd';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { USER_ROLE_LABELS } from '@shared/enums';
import type { AccessLinkKind } from '@shared/types';
import { ds, errorMessage, qk } from '@/data';
import { BRAND_COLOR } from '@/theme';

interface RegisterValues {
  login: string;
  fullName: string;
  phone?: string;
  email?: string;
  password: string;
  confirm: string;
}

const STATE_TEXT = {
  used: 'Цим посиланням уже скористалися',
  revoked: 'Посилання скасовано',
  expired: 'Строк дії посилання минув',
} as const;

const confirmRule = ({ getFieldValue }: { getFieldValue: (n: string) => unknown }) => ({
  validator: (_: unknown, v: string) => (!v || v === getFieldValue('password') ? Promise.resolve() : Promise.reject(new Error('Паролі не збігаються'))),
});

export function AccessLinkPage({ kind }: { kind: AccessLinkKind }) {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = useQuery({ queryKey: ['access-link', token], queryFn: () => ds.getAccessLink(token), retry: false });

  const done = (me: Awaited<ReturnType<typeof ds.registerByInvite>>) => {
    queryClient.setQueryData(qk.me, me);
    navigate('/requests', { replace: true });
  };

  const submit = async (v: RegisterValues) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      done(
        kind === 'invite'
          ? await ds.registerByInvite(token, { login: v.login, fullName: v.fullName, phone: v.phone || null, email: v.email || null, password: v.password })
          : await ds.resetPasswordByLink(token, v.password),
      );
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const card = (body: React.ReactNode) => (
    <div className="po-login">
      <Card style={{ width: '100%', maxWidth: 440 }}>
        <Typography.Title level={2} style={{ color: BRAND_COLOR, marginBottom: 4 }}>
          PriceOptima
        </Typography.Title>
        {body}
      </Card>
    </div>
  );

  if (info.isPending) return card(<Spin style={{ display: 'block', margin: '32px auto' }} />);
  if (info.isError || info.data.kind !== kind || info.data.state !== 'valid') {
    const state = info.data && info.data.kind === kind && info.data.state !== 'valid' ? info.data.state : null;
    return card(
      <Result
        status="warning"
        title={state ? STATE_TEXT[state] : 'Посилання не знайдено'}
        subTitle="Попросіть адміністратора надіслати нове посилання."
        extra={<Link to="/login">На сторінку входу</Link>}
      />,
    );
  }
  const link = info.data;
  return card(
    <>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 20 }}>
        {kind === 'invite'
          ? `Вас запросили до програми з роллю «${USER_ROLE_LABELS[link.role ?? 'user']}». Заповніть дані, і одразу почнете роботу.`
          : `Новий пароль для ${link.fullName ?? ''} (логін ${link.login ?? ''}). Після збереження ви одразу увійдете, старий пароль перестане діяти.`}
      </Typography.Paragraph>
      <Form<RegisterValues> layout="vertical" requiredMark={false} onFinish={(v) => void submit(v)} onValuesChange={() => setError(null)}>
        {kind === 'invite' ? (
          <>
            <Form.Item
              name="login"
              label="Логін"
              extra="Латинські літери, цифри, крапка, дефіс; ним ви входитимете"
              rules={[
                { required: true, whitespace: true, message: 'Вкажіть логін' },
                { pattern: /^[A-Za-z0-9._-]{3,60}$/u, message: 'Від 3 символів: латинські літери, цифри, крапка, дефіс, підкреслення' },
              ]}
            >
              <Input prefix={<UserOutlined className="po-muted" />} autoComplete="username" autoFocus />
            </Form.Item>
            <Form.Item name="fullName" label="Прізвище, ім’я, по батькові" rules={[{ required: true, whitespace: true, min: 3, message: 'Вкажіть ПІБ' }]}>
              <Input maxLength={160} autoComplete="name" />
            </Form.Item>
            <Form.Item name="phone" label="Телефон" extra="Друкується в КП у рядку «Менеджер»">
              <Input prefix={<PhoneOutlined className="po-muted" />} maxLength={40} autoComplete="tel" />
            </Form.Item>
            <Form.Item name="email" label="E-mail" rules={[{ type: 'email', message: 'Невірний e-mail' }]}>
              <Input prefix={<MailOutlined className="po-muted" />} maxLength={160} autoComplete="email" />
            </Form.Item>
          </>
        ) : null}
        <Form.Item name="password" label={kind === 'invite' ? 'Пароль' : 'Новий пароль'} rules={[{ required: true, min: 8, message: 'Пароль: не менше 8 символів' }]}>
          <Input.Password prefix={<LockOutlined className="po-muted" />} autoComplete="new-password" autoFocus={kind === 'reset'} />
        </Form.Item>
        <Form.Item name="confirm" label="Ще раз пароль" dependencies={['password']} rules={[{ required: true, message: 'Повторіть пароль' }, confirmRule]}>
          <Input.Password prefix={<LockOutlined className="po-muted" />} autoComplete="new-password" />
        </Form.Item>
        {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
        <Button type="primary" htmlType="submit" block loading={busy}>
          {kind === 'invite' ? 'Зареєструватися й увійти' : 'Зберегти пароль і увійти'}
        </Button>
      </Form>
    </>,
  );
}

export function InvitePage() {
  return <AccessLinkPage kind="invite" />;
}

export function ResetPasswordPage() {
  return <AccessLinkPage kind="reset" />;
}
