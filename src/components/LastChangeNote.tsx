// «Змінено 12.09.2026 14:03 · Коваль О.В.» — хто й коли востаннє змінив картку (підказка — що саме).
import { formatDateTime } from '@shared/format';
import type { LastChange } from '@shared/types';

export interface LastChangeNoteProps {
  change: LastChange | null | undefined;
}

export function LastChangeNote({ change }: LastChangeNoteProps) {
  if (!change) return null;
  return (
    <div className="po-muted" style={{ fontSize: 12 }} title={change.summary}>
      Змінено {formatDateTime(change.at)}
      {change.user ? ` · ${change.user.shortName}` : ''}
    </div>
  );
}
