// Налаштування джерела прайсу: вигрузка за посиланням (підключення постачальника, доступ, година оновлення) або файл від менеджера.
// Посилання й токен сервер назад не віддає: у формі видно лише, що вони збережені, а порожнє поле означає «лишити як є».
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Form, Input, Modal, Radio, Select, Spin, Switch } from 'antd';
import { useEffect } from 'react';
import { formatDateTime } from '@shared/format';
import { FEED_CONNECTOR_INFO, FEED_CONNECTORS, isFeedConnector, type FeedConnector } from '@shared/catalog/connectors';
import type { PriceFeedAuth, PriceSourceKind, SupplierPriceSourceInput, SupplierPriceSourceSettings, UUID } from '@shared/types';
import { ds, errorMessage, qk } from '@/data';
import { viaLink } from './supplierView';
import { LoadError } from '@/components';

/** Підключення, які сервер уміє читати за посиланням (у кожного постачальника своя вигрузка). */
const CONNECTOR_OPTIONS = FEED_CONNECTORS.map((c) => ({ value: c, label: FEED_CONNECTOR_INFO[c].label }));

const AUTH_OPTIONS: { value: PriceFeedAuth; label: string }[] = [
  { value: 'none', label: 'Без авторизації — ключ уже в посиланні' },
  { value: 'bearer', label: 'Токен у заголовку (Bearer)' },
  { value: 'query', label: 'Токен параметром посилання (?token=…)' },
  { value: 'basic', label: 'Логін і пароль' },
];

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${String(h).padStart(2, '0')}:00` }));

const KIND_HINTS: Record<PriceSourceKind, string> = {
  auto: 'Усе за посиланням: асортимент, ціни, наявність і фото оновлюються щодня самі.',
  manual: 'Прайс завантажує менеджер кнопкою «Завантажити прайс» — з файлу Excel або CSV.',
  hybrid:
    'Асортимент, наявність і фото — щодня за посиланням; ціни — файлом через «Завантажити прайс». Файл із цінами нових позицій не створює й не позначає відсутні.',
};

interface FormValues {
  kind: PriceSourceKind;
  connector: FeedConnector | null;
  url: string;
  auth: PriceFeedAuth;
  login: string;
  secret: string;
  scheduleHour: number;
  hasPurchasePrice: boolean;
  note: string;
}

function toFormValues(s: SupplierPriceSourceSettings): FormValues {
  return {
    kind: s.kind,
    connector: isFeedConnector(s.connector) ? s.connector : null,
    url: '',
    auth: s.auth,
    login: '',
    secret: '',
    scheduleHour: s.scheduleHour ?? 6,
    hasPurchasePrice: s.hasPurchasePrice,
    note: s.note ?? '',
  };
}

/** Порожні посилання й токен не надсилаємо — сервер лишить збережені. */
export function buildPriceSourceInput(v: FormValues, current: SupplierPriceSourceSettings): SupplierPriceSourceInput {
  const auto = viaLink(v.kind);
  const url = v.url.trim();
  let secret: string | undefined;
  if (auto && v.auth === 'basic') {
    secret = v.login.trim() || v.secret ? `${v.login.trim()}:${v.secret}` : undefined;
  } else if (auto && v.auth !== 'none') {
    secret = v.secret.trim() || undefined;
  } else if (auto && current.hasSecret) {
    // вигрузка без токена — збережений прибираємо (для файлового прайсу лишаємо: раптом повернуться до посилання)
    secret = '';
  }
  return {
    kind: v.kind,
    connector: auto ? v.connector : null,
    ...(url ? { url } : {}),
    auth: auto ? v.auth : 'none',
    ...(secret !== undefined ? { secret } : {}),
    scheduleHour: auto ? v.scheduleHour : null,
    // у гібриді ціни приходять файлом — прапорець стосується лише вигрузки з цінами
    hasPurchasePrice: v.kind === 'hybrid' ? current.hasPurchasePrice : v.hasPurchasePrice,
    note: v.note.trim() || null,
  };
}

export interface PriceSourceDialogProps {
  open: boolean;
  supplierId: UUID;
  supplierName: string;
  onClose: () => void;
}

export function PriceSourceDialog({ open, supplierId, supplierName, onClose }: PriceSourceDialogProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const kind = Form.useWatch('kind', form);
  const auth = Form.useWatch('auth', form);
  const connector = Form.useWatch('connector', form);
  const settings = useQuery({ queryKey: qk.supplierPriceSource(supplierId), queryFn: () => ds.getSupplierPriceSource(supplierId), enabled: open });
  const current = settings.data;

  useEffect(() => {
    if (!open || !current) return;
    form.resetFields();
    form.setFieldsValue(toFormValues(current));
  }, [open, current, form]);

  const save = useMutation({
    mutationFn: (v: FormValues) => ds.saveSupplierPriceSource(supplierId, buildPriceSourceInput(v, current!)),
    onSuccess: (saved) => {
      queryClient.setQueryData(qk.supplierPriceSource(supplierId), saved);
      void queryClient.invalidateQueries({ queryKey: qk.suppliers });
      void queryClient.invalidateQueries({ queryKey: qk.supplier(supplierId) });
      message.success(viaLink(saved.kind) ? 'Вигрузку налаштовано — оновлюватиметься щодня' : 'Прайс завантажуватиметься файлом');
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const keepHint = (saved: boolean, what: string) => (saved ? `${what} збережено — залиште порожнім, щоб не змінювати` : undefined);
  // збережений токен підходить лише до того самого способу доступу
  const secretKept = !!current?.hasSecret && auth === current.auth;

  return (
    <Modal
      open={open}
      title={`Джерело прайсу · ${supplierName}`}
      okText="Зберегти"
      cancelText="Скасувати"
      okButtonProps={{ disabled: !current }}
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
      width={600}
    >
      {settings.isError ? (
        <LoadError inline title="Не вдалося завантажити налаштування" error={settings.error} onRetry={settings.refetch} />
      ) : !current ? (
        <Spin style={{ display: 'block', margin: '32px auto' }} />
      ) : (
        <Form<FormValues> form={form} layout="vertical" requiredMark={false} onFinish={(v) => save.mutate(v)} style={{ marginTop: 12 }}>
          {current.lastError ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message={`Останнє оновлення не вдалося${current.lastErrorAt ? ` (${formatDateTime(current.lastErrorAt)})` : ''}`}
              description={current.lastError}
            />
          ) : null}
          <Form.Item name="kind" label="Як отримуємо прайс" extra={kind ? KIND_HINTS[kind] : null}>
            <Radio.Group
              optionType="button"
              options={[
                { value: 'auto', label: 'За посиланням' },
                { value: 'manual', label: 'Файлом' },
                { value: 'hybrid', label: 'Гібрид' },
              ]}
            />
          </Form.Item>

          {kind && viaLink(kind) ? (
            <>
              <Form.Item
                name="connector"
                label="Вигрузка постачальника"
                extra={connector ? FEED_CONNECTOR_INFO[connector].hint : 'Кожен постачальник вигружає прайс по-своєму — оберіть, чия це вигрузка'}
                rules={[{ required: true, message: 'Оберіть, чия це вигрузка' }]}
              >
                <Select
                  placeholder="Оберіть підключення"
                  options={CONNECTOR_OPTIONS}
                  // типовий доступ і вид ціни для цієї вигрузки; далі їх можна змінити
                  onChange={(c: FeedConnector) => form.setFieldsValue({ auth: FEED_CONNECTOR_INFO[c].auth, hasPurchasePrice: FEED_CONNECTOR_INFO[c].hasPurchasePrice })}
                />
              </Form.Item>
              <Form.Item
                name="url"
                label="Посилання на вигрузку"
                extra={current.hasUrl && current.host ? `Збережено посилання на ${current.host}` : undefined}
                rules={[
                  { required: !current.hasUrl, whitespace: true, message: 'Вкажіть посилання на вигрузку' },
                  { pattern: /^https?:\/\/\S+$/iu, message: 'Посилання має починатися з http:// або https://' },
                ]}
              >
                <Input placeholder={keepHint(current.hasUrl, 'Посилання') ?? 'https://…'} autoComplete="off" />
              </Form.Item>
              <Form.Item name="auth" label="Доступ">
                <Select options={AUTH_OPTIONS} />
              </Form.Item>
              {auth === 'basic' ? (
                <Form.Item
                  name="login"
                  label="Логін"
                  rules={[
                    ({ getFieldValue }) => ({
                      required: !secretKept || !!getFieldValue('secret'),
                      whitespace: true,
                      message: 'Вкажіть логін',
                    }),
                  ]}
                >
                  <Input placeholder={keepHint(secretKept, 'Логін і пароль')} autoComplete="off" />
                </Form.Item>
              ) : null}
              {auth && auth !== 'none' ? (
                <Form.Item
                  name="secret"
                  label={auth === 'basic' ? 'Пароль' : 'Токен'}
                  extra="Зберігається зашифрованим і більше ніде не показується"
                  dependencies={['login']}
                  rules={[
                    ({ getFieldValue }) => ({
                      required: !secretKept || (auth === 'basic' && !!getFieldValue('login')?.trim()),
                      whitespace: true,
                      message: auth === 'basic' ? 'Вкажіть пароль' : 'Вкажіть токен',
                    }),
                  ]}
                >
                  <Input.Password placeholder={keepHint(secretKept, auth === 'basic' ? 'Пароль' : 'Токен')} autoComplete="new-password" />
                </Form.Item>
              ) : null}
              <Form.Item name="scheduleHour" label="Оновлювати щодня о" extra="Якщо не вдалося — ще три спроби щогодини">
                <Select options={HOURS} style={{ width: 120 }} />
              </Form.Item>
            </>
          ) : null}

          {kind === 'auto' ? (
            <Form.Item
              name="hasPurchasePrice"
              label="У вигрузці є вхідні ціни"
              valuePropName="checked"
              extra="Вимкніть, якщо за посиланням лише РРЦ: ціни підуть у РРЦ, а вхідні краще брати файлом — тоді оберіть «Гібрид»"
            >
              <Switch />
            </Form.Item>
          ) : null}
          <Form.Item name="note" label="Примітка">
            <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} placeholder="Напр.: договірні ціни — у менеджера" />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}
