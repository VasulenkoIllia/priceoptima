import { CheckCircleOutlined, CloudOutlined, ExclamationCircleFilled, EyeOutlined, SyncOutlined } from '@ant-design/icons';
import { Button, Tooltip, Typography } from 'antd';
import { formatTime } from '@shared/format';
import type { SaveState } from '@/stores/requestDocStore';
import { SEMANTIC_COLORS } from '@/theme';

export interface SaveIndicatorProps {
  state: SaveState;
  savedAt: string | null;
  error: string | null;
  /** Є зміни, що чекають автозбереження. */
  dirty?: boolean;
  readOnly?: boolean;
  onRetry?: () => void;
}

/** «Збережено 12:03:15» / «Зберігаю…» / «Помилка збереження». */
export function SaveIndicator({ state, savedAt, error, dirty, readOnly, onRetry }: SaveIndicatorProps) {
  const text = (icon: React.ReactNode, label: React.ReactNode, type?: 'secondary' | 'danger') => (
    <Typography.Text type={type} style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
      {icon} {label}
    </Typography.Text>
  );
  if (state === 'error') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Tooltip title={error}>
          {text(<ExclamationCircleFilled style={{ color: SEMANTIC_COLORS.error }} />, 'Помилка збереження', 'danger')}
        </Tooltip>
        {onRetry && !readOnly ? (
          <Button size="small" type="link" onClick={onRetry} style={{ padding: 0 }}>
            Повторити
          </Button>
        ) : null}
      </span>
    );
  }
  if (readOnly) return text(<EyeOutlined />, 'Лише перегляд', 'secondary');
  if (state === 'saving' || dirty) return text(<SyncOutlined spin />, 'Зберігаю…', 'secondary');
  if (state === 'saved' && savedAt) return text(<CheckCircleOutlined style={{ color: SEMANTIC_COLORS.min }} />, `Збережено ${formatTime(savedAt)}`, 'secondary');
  return text(<CloudOutlined />, 'Автозбереження', 'secondary');
}
