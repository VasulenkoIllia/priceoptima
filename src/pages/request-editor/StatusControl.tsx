import { DownOutlined } from '@ant-design/icons';
import { App, Button, Dropdown, Input, Modal, Tooltip, type MenuProps } from 'antd';
import { useState } from 'react';
import { REQUEST_STATUS_LABELS, type RequestStatus } from '@shared/enums';
import { allowedTransitions } from '@shared/status';
import { useSession } from '@/app/session';
import { StatusTag } from '@/components';
import { errorMessage } from '@/data';
import { useRequestDoc } from '@/stores/requestDocStore';

/** Статус заявки (dropdown з 3 статусів; скасування — з причиною). Змінювати може лише вкладка з блокуванням. */
export function StatusControl() {
  const { user } = useSession();
  const { message } = App.useApp();
  const status = useRequestDoc((s) => s.doc?.header.status ?? 'in_progress');
  const cancelReason = useRequestDoc((s) => s.doc?.header.cancelReason ?? null);
  const hasLock = useRequestDoc((s) => s.hasLock);
  const setStatus = useRequestDoc((s) => s.setStatus);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const transitions = allowedTransitions(status, user.role);

  const apply = async (to: RequestStatus, why?: string) => {
    setBusy(true);
    try {
      await setStatus(to, why ?? null);
      message.success(`Статус заявки: «${REQUEST_STATUS_LABELS[to]}»`);
      return true;
    } catch (e) {
      message.error(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const menu: MenuProps = {
    items: transitions.map((t) => ({
      key: t.to,
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <StatusTag status={t.to} iconOnly />
          {t.label}
        </span>
      ),
    })),
    onClick: ({ key }) => {
      const t = transitions.find((x) => x.to === key);
      if (!t) return;
      if (t.requiresReason) setCancelOpen(true);
      else void apply(t.to);
    },
  };

  const button = (
    <Button loading={busy} disabled={!hasLock} style={{ minWidth: 132, display: 'inline-flex', justifyContent: 'space-between' }}>
      <StatusTag status={status} />
      <DownOutlined style={{ fontSize: 10 }} />
    </Button>
  );

  return (
    <>
      {hasLock ? (
        <Dropdown menu={menu} trigger={['click']} disabled={busy}>
          {button}
        </Dropdown>
      ) : (
        <Tooltip title={status === 'cancelled' && cancelReason ? `Причина: ${cancelReason}` : 'Статус змінює той, хто редагує заявку'}>
          {button}
        </Tooltip>
      )}
      <Modal
        title="Скасувати заявку"
        open={cancelOpen}
        okText="Скасувати заявку"
        cancelText="Назад"
        okButtonProps={{ danger: true, disabled: !reason.trim(), loading: busy }}
        onOk={async () => {
          if (await apply('cancelled', reason)) {
            setCancelOpen(false);
            setReason('');
          }
        }}
        onCancel={() => setCancelOpen(false)}
        destroyOnHidden
      >
        <p style={{ marginTop: 0 }}>Вкажіть причину — вона збережеться в заявці. Скасовану заявку можна перевідкрити.</p>
        <Input.TextArea
          autoFocus
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Напр.: клієнт закупив самостійно"
        />
      </Modal>
    </>
  );
}
