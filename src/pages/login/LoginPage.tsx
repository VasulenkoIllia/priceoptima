import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useMeQuery } from '@/app/session';
import { ds, errorMessage, isDataSourceError, qk } from '@/data';
import { BRAND_COLOR } from '@/theme';

/** Лише внутрішні шляхи застосунку. */
function safeReturnPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/login')) return '/requests';
  return raw;
}

interface LoginValues {
  login: string;
  password: string;
}

/** «Вхід» (§6.1): логін і пароль. Вхід запам'ятовується в браузері — переживає перезавантаження й нові вкладки. */
export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const me = useMeQuery();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const returnPath = safeReturnPath(params.get('from'));

  // уже увійшли (наприклад, в іншій вкладці) — одразу в застосунок
  if (me.data) return <Navigate to={returnPath} replace />;

  const submit = async ({ login, password }: LoginValues) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await ds.login(login.trim(), password);
      queryClient.setQueryData(qk.me, res);
      navigate(returnPath, { replace: true });
    } catch (e) {
      setError(isDataSourceError(e, 'UNAUTHORIZED') ? 'Невірний логін або пароль' : errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="po-login">
      <Card style={{ width: '100%', maxWidth: 380 }}>
        <Typography.Title level={2} style={{ color: BRAND_COLOR, marginBottom: 4 }}>
          PriceOptima
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
          Підбір товарів у постачальників і порівняння цін.
        </Typography.Paragraph>
        <Form<LoginValues> layout="vertical" requiredMark={false} onFinish={(v) => void submit(v)} onValuesChange={() => setError(null)}>
          <Form.Item name="login" label="Логін" rules={[{ required: true, whitespace: true, message: 'Вкажіть логін' }]}>
            <Input prefix={<UserOutlined className="po-muted" />} autoComplete="username" autoFocus />
          </Form.Item>
          <Form.Item name="password" label="Пароль" rules={[{ required: true, message: 'Вкажіть пароль' }]}>
            <Input.Password prefix={<LockOutlined className="po-muted" />} autoComplete="current-password" />
          </Form.Item>
          {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
          <Button type="primary" htmlType="submit" block loading={busy}>
            Увійти
          </Button>
        </Form>
      </Card>
    </div>
  );
}
