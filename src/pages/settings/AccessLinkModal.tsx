// Готове разове посилання (запрошення або зміна пароля): показується один раз — у базі лише його відбиток.
import { CopyOutlined } from '@ant-design/icons';
import { App, Button, Input, Modal, Space, Typography } from 'antd';
import { formatDateTime } from '@shared/format';
import type { AccessLinkCreated, AccessLinkKind } from '@shared/types';

export function accessLinkUrl(kind: AccessLinkKind, token: string): string {
  return `${window.location.origin}/${kind === 'invite' ? 'invite' : 'reset'}/${token}`;
}

export interface AccessLinkModalProps {
  link: (AccessLinkCreated & { kind: AccessLinkKind; forWhom: string }) | null;
  onClose(): void;
}

export function AccessLinkModal({ link, onClose }: AccessLinkModalProps) {
  const { message } = App.useApp();
  const url = link ? accessLinkUrl(link.kind, link.token) : '';
  const copy = () =>
    navigator.clipboard
      .writeText(url)
      .then(() => message.success('Посилання скопійовано'))
      .catch(() => message.warning('Не вдалося скопіювати — виділіть посилання й скопіюйте вручну'));
  return (
    <Modal
      open={!!link}
      title={link?.kind === 'invite' ? 'Запрошення готове' : 'Посилання для зміни пароля'}
      onCancel={onClose}
      footer={<Button type="primary" onClick={onClose}>Готово</Button>}
      destroyOnHidden
      width={620}
    >
      {link ? (
        <>
          <Typography.Paragraph>
            Кому: <b>{link.forWhom}</b>. Надішліть посилання месенджером чи поштою. Воно працює <b>один раз</b> і діє до{' '}
            <span className="po-num">{formatDateTime(link.expiresAt)}</span>.
            {link.kind === 'invite'
              ? ' Людина вкаже логін, ПІБ, телефон, e-mail і пароль і одразу потрапить у програму.'
              : ' Людина задасть новий пароль і одразу увійде; старий пароль перестане діяти.'}
          </Typography.Paragraph>
          <Space.Compact style={{ width: '100%' }}>
            <Input readOnly value={url} onFocus={(e) => e.target.select()} />
            <Button icon={<CopyOutlined />} onClick={() => void copy()}>
              Копіювати
            </Button>
          </Space.Compact>
          <Typography.Paragraph type="secondary" style={{ marginTop: 10, marginBottom: 0, fontSize: 12 }}>
            Після закриття цього вікна посилання більше не показується. Загубили — створіть нове, а старе скасуйте в списку нижче.
          </Typography.Paragraph>
        </>
      ) : null}
    </Modal>
  );
}
