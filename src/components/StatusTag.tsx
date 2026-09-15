import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { REQUEST_STATUS_LABELS, type RequestStatus } from '@shared/enums';

export interface StatusTagProps {
  status: RequestStatus;
  /** Лише іконка (підпис — у title). */
  iconOnly?: boolean;
}

/** Статус заявки як в Excel клієнта: «В роботі» — синій кружок, «Виконано» — зелена галочка, «Скасовано» — червоний хрестик. */
export function StatusTag({ status, iconOnly }: StatusTagProps) {
  const label = REQUEST_STATUS_LABELS[status];
  const icon =
    status === 'in_progress' ? <span className="po-status-dot" /> : status === 'done' ? <CheckOutlined /> : <CloseOutlined />;
  return (
    <span className={`po-status po-status-${status}`} title={iconOnly ? label : undefined}>
      <span className="po-status-icon" aria-hidden>
        {icon}
      </span>
      {iconOnly ? null : <span>{label}</span>}
    </span>
  );
}
