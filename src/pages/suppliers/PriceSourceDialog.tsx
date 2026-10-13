// Налаштування джерела прайсу: вигрузка за посиланням (підключення постачальника, доступ, година оновлення) або файл від менеджера.
// Посилання й токен сервер назад не віддає: у формі видно лише, що вони збережені, а порожнє поле означає «лишити як є».
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Form, Input, Modal, Radio, Select, Spin } from 'antd';
import { useEffect } from 'react';
import { formatDateTime } from '@shared/format';
import {
  FEED_CONNECTOR_INFO,
  FEED_CONNECTORS,
  isFeedConnector,
  linkUpdatesPurchasePrice,
  type FeedConnector,
  type FeedPrices,
} from '@shared/catalog/connectors';
import type { PriceFeedAuth, PriceSourceKind, SupplierPriceSourceInput, SupplierPriceSourceSettings, UUID } from '@shared/types';
import { ds, errorMessage, qk } from '@/data';
import { viaLink } from './supplierView';
import { LoadError } from '@/components';

/** Підключення, які сервер уміє читати за посиланням (у кожного постачальника своя вигрузка). */
const CONNECTOR_OPTIONS = FEED_CONNECTORS.map((c) => ({ value: c, label: FEED_CONNECTOR_INFO[c].label }));

const AUTH_OPTIONS: { value: PriceFeedAuth; label: string }[] = [
  { value: 'none', label: 'Без авторизації (ключ уже в посиланні)' },
  { value: 'bearer', label: 'Токен у заголовку (Bearer)' },
  { value: 'query', label: 'Токен параметром посилання (?token=…)' },
  { value: 'basic', label: 'Логін і пароль' },
];

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${String(h).padStart(2, '0')}:00` }));

const KIND_HINTS: Record<PriceSourceKind, string> = {
  auto: 'Усе за посиланням: асортимент, ціни, наявність і фото оновлюються щодня самі.',
  manual: 'Прайс завантажує менеджер кнопкою «Завантажити прайс» з файлу Excel або CSV.',
  hybrid:
    'Асортимент, наявність, фото й РРЦ оновлюються щодня за посиланням; вхідні ціни завантажуються файлом через «Завантажити прайс». Файл із цінами нових позицій не створює й не позначає відсутні.',
};

/** Варіанти «Ціна у вигрузці» для вигрузки з вхідними цінами: true — посилання оновлює вхідні ціни. */
const LINK_PRICE_CHOICES: Record<Exclude<FeedPrices, 'rrp'>, { value: boolean; label: string }[]> = {
  one: [
    { value: true, label: 'Вхідна' },
    { value: false, label: 'РРЦ' },
  ],
  both: [
    { value: true, label: 'Вхідна і РРЦ' },
    { value: false, label: 'Лише РРЦ' },
  ],
};

interface FormValues {
  kind: PriceSourceKind;
  connector: FeedConnector | null;
  url: string;
  auth: PriceFeedAuth;
  login: string;
  secret: string;
  scheduleHour: number;
  /** undefined — ще не вибрано: «Ціна у вигрузці» обов'язкова й без типового значення. */
  hasPurchasePrice: boolean | undefined;
  note: string;
}

export function toFormValues(s: SupplierPriceSourceSettings): FormValues {
  return {
    kind: s.kind,
    connector: isFeedConnector(s.connector) ? s.connector : null,
    url: '',
    auth: s.auth,
    login: '',
    secret: '',
    scheduleHour: s.scheduleHour ?? 6,
    // у «Гібриді» й «Файлом» цей вибір не показувався й міг лишитися типовим: відкривши джерело такого постачальника
    // й перейшовши «За посиланням», вибирають заново
    hasPurchasePrice: s.kind === 'auto' ? s.hasPurchasePrice : undefined,
    note: s.note ?? '',
  };
}

/**
 * «Ціна у вигрузці» до збереження: «За посиланням» — вибір у формі (вигрузка лише з РРЦ — завжди ні);
 * «Гібрид» і «Файлом» вхідних цін із посилання не беруть, тож збережене значення не чіпаємо.
 */
function linkPurchaseInput(v: FormValues, current: SupplierPriceSourceSettings): boolean {
  if (v.kind !== 'auto') return current.hasPurchasePrice;
  return linkUpdatesPurchasePrice(v.kind, v.connector, v.hasPurchasePrice ?? current.hasPurchasePrice);
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
    hasPurchasePrice: linkPurchaseInput(v, current),
    note: v.note.trim() || null,
  };
}

// antd віддає role і aria-* групи в DOM, але в типах RadioGroupProps role немає: без них екранний читач не назве групу
const LINK_PRICE_GROUP_A11Y = { role: 'radiogroup', 'aria-label': 'Ціна у вигрузці' };

/** «Ціна у вигрузці» в режимі «За посиланням»: обов'язковий вибір без типового значення; вигрузка лише з РРЦ — без вибору. */
function LinkPriceField({ prices }: { prices: FeedPrices }) {
  if (prices === 'rrp') {
    return (
      <Form.Item label="Ціна у вигрузці">
        <span>Лише РРЦ: вхідних цін у цій вигрузці немає.</span>
      </Form.Item>
    );
  }
  return (
    <Form.Item
      name="hasPurchasePrice"
      label="Ціна у вигрузці"
      rules={[{ required: true, message: 'Оберіть, яка ціна у вигрузці' }]}
      extra="РРЦ: вхідні ціни за посиланням не оновлюються. Якщо вхідні будуть файлом, оберіть «Гібрид»."
    >
      <Radio.Group {...LINK_PRICE_GROUP_A11Y} options={LINK_PRICE_CHOICES[prices]} />
    </Form.Item>
  );
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
      message.success(viaLink(saved.kind) ? 'Вигрузку налаштовано, оновлюватиметься щодня' : 'Прайс завантажуватиметься файлом');
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const keepHint = (saved: boolean, what: string) => (saved ? `${what} збережено. Залиште порожнім, щоб не змінювати` : undefined);
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
        <Form<FormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          // onFinish отримує лише показані поля, а «Файлом» ховає посилання й доступ — беремо всі значення форми
          onFinish={() => save.mutate(form.getFieldsValue(true) as FormValues)}
          style={{ marginTop: 12 }}
        >
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
                extra={connector ? FEED_CONNECTOR_INFO[connector].hint : 'Кожен постачальник вигружає прайс по-своєму: оберіть, чия це вигрузка'}
                rules={[{ required: true, message: 'Оберіть, чия це вигрузка' }]}
              >
                <Select
                  placeholder="Оберіть підключення"
                  options={CONNECTOR_OPTIONS}
                  // типовий доступ для цієї вигрузки (його можна змінити); яка в ній ціна — вибирають заново
                  onChange={(c: FeedConnector) => form.setFieldsValue({ auth: FEED_CONNECTOR_INFO[c].auth, hasPurchasePrice: undefined })}
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
              <Form.Item name="scheduleHour" label="Оновлювати щодня о" extra="Якщо не вдалося, ще три спроби щогодини">
                <Select options={HOURS} style={{ width: 120 }} />
              </Form.Item>
            </>
          ) : null}

          {kind === 'auto' && connector ? <LinkPriceField prices={FEED_CONNECTOR_INFO[connector].prices} /> : null}
          {kind === 'hybrid' ? (
            <Form.Item label="Ціна у вигрузці">
              <span>РРЦ. Вхідні ціни завантажуються файлом («Завантажити прайс»).</span>
            </Form.Item>
          ) : null}
          <Form.Item name="note" label="Примітка">
            <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} placeholder="Напр.: договірні ціни у менеджера" />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}
