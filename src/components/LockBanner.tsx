import { LockOutlined, ReloadOutlined, UnlockOutlined } from '@ant-design/icons';
import { Alert, Button, Popconfirm, Space } from 'antd';
import { useState } from 'react';
import { formatTime } from '@shared/format';
import type { LockInfo } from '@shared/types';
import type { LockLostInfo } from '@/stores/requestDocStore';

export interface LockBannerProps {
  /** Поточний власник блокування (не ця вкладка). */
  lock: LockInfo | null;
  lockLost: LockLostInfo | null;
  isAdmin: boolean;
  onRefresh: () => Promise<unknown> | void;
  onForce: () => Promise<unknown> | void;
}

function message(lock: LockInfo | null, lost: LockLostInfo | null): string {
  if (lost?.reason === 'forced') {
    return `Редагування забрав ${lost.byUserShortName ?? 'інший користувач'} о ${formatTime(lost.at, false)}. Ви в режимі перегляду.`;
  }
  if (lock && !lock.isMySession) {
    const since = formatTime(lock.lockedAt, false);
    return lock.isMine
      ? `Заявку редагуєте ви в іншій вкладці з ${since}. Тут режим перегляду.`
      : `Заявку редагує ${lock.userShortName} з ${since}. Ви в режимі перегляду.`;
  }
  if (lost) return 'Редагування втрачено (довго не було зв’язку або комп’ютер засинав). Ви в режимі перегляду.';
  return 'Заявку звільнено. Натисніть «Оновити», щоб перейти до редагування.';
}

/** Жовтий банер режиму перегляду (§6.11) з кнопками «Оновити» і «Забрати редагування» (адміністратор). */
export function LockBanner({ lock, lockLost, isAdmin, onRefresh, onForce }: LockBannerProps) {
  const [busy, setBusy] = useState<'refresh' | 'force' | null>(null);
  const run = async (kind: 'refresh' | 'force', fn: () => Promise<unknown> | void) => {
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };
  const heldByOther = !!lock && !lock.isMySession;
  return (
    <Alert
      type="warning"
      showIcon
      icon={heldByOther ? <LockOutlined /> : <UnlockOutlined />}
      message={message(lock, lockLost)}
      action={
        <Space size={6}>
          <Button size="small" icon={<ReloadOutlined />} loading={busy === 'refresh'} onClick={() => run('refresh', onRefresh)}>
            Оновити
          </Button>
          {isAdmin && heldByOther ? (
            <Popconfirm
              title="Забрати редагування?"
              description={`${lock.userShortName} перейде в режим перегляду; незбережені зміни в тій вкладці буде втрачено.`}
              okText="Забрати"
              cancelText="Скасувати"
              onConfirm={() => run('force', onForce)}
            >
              <Button size="small" danger loading={busy === 'force'}>
                Забрати редагування
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      }
      style={{ padding: '4px 12px' }}
    />
  );
}
