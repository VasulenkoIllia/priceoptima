import { DownOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { App, Button, Dropdown, Input, Modal, Tooltip, type MenuProps } from 'antd';
import { useState } from 'react';
import { REQUEST_STATUS_LABELS, type RequestStatus } from '@shared/enums';
import { allowedTransitions, isEditableStatus } from '@shared/status';
import { useSession } from '@/app/session';
import { StatusTag } from '@/components';
import { ds, errorMessage, qk } from '@/data';
import { useRequestDoc } from '@/stores/requestDocStore';

/**
 * Статус заявки (dropdown з 3 статусів; скасування — з необов'язковою причиною). «В роботі» змінює вкладка з блокуванням;
 * виконану чи скасовану перевідкрити може будь-хто, хто її переглядає (блокування візьметься саме).
 */
export function StatusControl() {
  const { user } = useSession();
  const { message, modal } = App.useApp();
  const requestId = useRequestDoc((s) => s.requestId);
  const status = useRequestDoc((s) => s.doc?.header.status ?? 'in_progress');
  const cancelReason = useRequestDoc((s) => s.doc?.header.cancelReason ?? null);
  const approved = useRequestDoc((s) => !!s.doc?.lines.some((l) => l.approval.approved));
  const hasLock = useRequestDoc((s) => s.hasLock);
  const setStatus = useRequestDoc((s) => s.setStatus);
  const reopen = useRequestDoc((s) => s.reopen);
  const kps = useQuery({ queryKey: qk.kps(requestId ?? ''), queryFn: () => ds.listKps(requestId!), enabled: !!requestId });
  const closed = !isEditableStatus(status);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const transitions = allowedTransitions(status, user.role);

  const apply = async (to: RequestStatus, why?: string) => {
    setBusy(true);
    try {
      if (to === 'in_progress' && closed) await reopen();
      else await setStatus(to, why ?? null);
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
      if (t.asksReason) setCancelOpen(true);
      else if (t.to === 'done') confirmDone();
      else void apply(t.to);
    },
  };

  // СТА-1: «Виконано» без КП чи без погодження клієнта — перепитуємо
  const confirmDone = () => {
    const missing = [!kps.data?.length ? 'КП ще не формували' : null, !approved ? 'клієнт нічого не погодив' : null].filter(Boolean);
    if (!missing.length) {
      void apply('done');
      return;
    }
    modal.confirm({
      title: 'Позначити заявку виконаною?',
      content: `${missing.join('; ')}. Виконану заявку можна перевідкрити.`,
      okText: 'Позначити виконаною',
      cancelText: 'Ні',
      onOk: () => apply('done'),
    });
  };

  const button = (
    <Button loading={busy} disabled={!hasLock && !closed} style={{ minWidth: 132, display: 'inline-flex', justifyContent: 'space-between' }}>
      <StatusTag status={status} />
      <DownOutlined style={{ fontSize: 10 }} />
    </Button>
  );

  return (
    <>
      {hasLock || closed ? (
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
        okButtonProps={{ danger: true, loading: busy }}
        onOk={async () => {
          if (await apply('cancelled', reason)) {
            setCancelOpen(false);
            setReason('');
          }
        }}
        onCancel={() => setCancelOpen(false)}
        destroyOnHidden
      >
        <p style={{ marginTop: 0 }}>Причина необов’язкова, вона збережеться в заявці. Скасовану заявку можна перевідкрити.</p>
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
