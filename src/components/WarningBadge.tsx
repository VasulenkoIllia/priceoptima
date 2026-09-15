import { CloseCircleFilled, ExclamationCircleFilled, InfoCircleFilled } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { formatWarning } from '@shared/format';
import type { Warning } from '@shared/types';
import { BRAND_COLOR, SEMANTIC_COLORS } from '@/theme';

export interface WarningBadgeProps {
  warnings: readonly Pick<Warning, 'code' | 'params' | 'severity'>[];
  size?: number;
}

/** Іконка найвищої серйозності з тултипом-списком попереджень; без попереджень — нічого. */
export function WarningBadge({ warnings, size = 13 }: WarningBadgeProps) {
  if (!warnings.length) return null;
  const hasError = warnings.some((w) => w.severity === 'error');
  const hasWarning = warnings.some((w) => w.severity === 'warning');
  const Icon = hasError ? CloseCircleFilled : hasWarning ? ExclamationCircleFilled : InfoCircleFilled;
  const color = hasError ? SEMANTIC_COLORS.error : hasWarning ? SEMANTIC_COLORS.warning : BRAND_COLOR;
  const messages = [...new Set(warnings.map((w) => formatWarning(w)))];
  return (
    <Tooltip
      title={
        messages.length === 1 ? (
          messages[0]
        ) : (
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )
      }
    >
      <Icon style={{ color, fontSize: size, cursor: 'help' }} aria-label={messages.join('; ')} />
    </Tooltip>
  );
}
