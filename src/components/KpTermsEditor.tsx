// Список умов КП «назва: значення» (п.3 правок): у Налаштуваннях — типові, у бланку КП — під клієнта.
// Зміни віддаються при втраті фокусу, видаленні й додаванні (не на кожну літеру — щоб Ctrl+Z скасовував цілу правку).
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { AutoComplete, Button, Input } from 'antd';
import { useEffect, useState } from 'react';
import { DEFAULT_KP_TERMS, KP_TERMS_MAX } from '@shared/pricing';
import type { KpTerm } from '@shared/types';

const LABEL_OPTIONS = DEFAULT_KP_TERMS.map((t) => ({ value: t.label }));

export interface KpTermsEditorProps {
  value: readonly KpTerm[];
  onChange(next: KpTerm[]): void;
  disabled?: boolean;
  /** Вузька колонка (бланк КП): назва над значенням. */
  compact?: boolean;
}

export function KpTermsEditor({ value, onChange, disabled, compact }: KpTermsEditorProps) {
  const [rows, setRows] = useState<KpTerm[]>(() => value.map((t) => ({ ...t })));
  useEffect(() => setRows(value.map((t) => ({ ...t }))), [value]);

  const same = (a: readonly KpTerm[], b: readonly KpTerm[]) =>
    a.length === b.length && a.every((t, i) => t.label === b[i].label && t.value === b[i].value);
  const commit = (next: KpTerm[]) => {
    if (!same(next, value)) onChange(next);
  };
  const edit = (i: number, patch: Partial<KpTerm>) => setRows((list) => list.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return (
    <div className={compact ? 'po-kp-terms-edit po-kp-terms-compact' : 'po-kp-terms-edit'}>
      {rows.map((t, i) => (
        <div key={i} className="po-kp-term-row">
          <AutoComplete
            className="po-kp-term-label"
            size="small"
            value={t.label}
            options={LABEL_OPTIONS}
            disabled={disabled}
            placeholder="Назва"
            onChange={(v) => edit(i, { label: v })}
            onBlur={() => commit(rows)}
            onSelect={(v) => commit(rows.map((x, j) => (j === i ? { ...x, label: v } : x)))}
          />
          <Input
            className="po-kp-term-value"
            size="small"
            value={t.value}
            disabled={disabled}
            placeholder="Значення (порожнє не друкується)"
            maxLength={300}
            onChange={(e) => edit(i, { value: e.target.value })}
            onBlur={() => commit(rows)}
            onPressEnter={() => commit(rows)}
          />
          <Button
            size="small"
            type="text"
            icon={<DeleteOutlined />}
            disabled={disabled}
            title="Прибрати умову"
            onClick={() => commit(rows.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      <Button
        size="small"
        type="dashed"
        icon={<PlusOutlined />}
        disabled={disabled || rows.length >= KP_TERMS_MAX}
        onClick={() => setRows((list) => [...list, { label: '', value: '' }])}
      >
        Додати умову
      </Button>
    </div>
  );
}
