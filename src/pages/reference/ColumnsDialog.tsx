// Колонки аркуша «Довідника»: назви, порядок, нові й видалені. Застосовується разом кнопкою «Готово».
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Input, Modal, Popconfirm, Tooltip } from 'antd';
import { useState } from 'react';
import { pluralUk } from '@shared/format';
import { REFERENCE_MAX_COLUMNS, REFERENCE_TITLE_MAX } from '@shared/reference/limits';
import type { ReferenceColumn } from '@shared/types';
import { newColumnFor } from './sheet';

export interface ColumnsDialogProps {
  columns: ReferenceColumn[];
  /** Скільки заповнених клітинок у колонці: перед видаленням такої — перепитуємо. */
  filled: ReadonlyMap<string, number>;
  /** original — колонки на момент відкриття діалогу (щоб не загубити те, що тим часом змінив колега). */
  onApply: (original: ReferenceColumn[], edited: ReferenceColumn[]) => void;
  onClose: () => void;
}

/** Відкривається щоразу заново (рендериться лише відкритим), тож чернетка колонок — свіжа. */
export function ColumnsDialog({ columns, filled, onApply, onClose }: ColumnsDialogProps) {
  const [original] = useState(columns);
  const [list, setList] = useState(columns);
  // id нової колонки не збігається і з видаленими тут: їхні клітинки ще в аркуші до «Готово»
  const added = newColumnFor(list, original);

  const patch = (id: string, title: string) => setList((l) => l.map((c) => (c.id === id ? { ...c, title } : c)));
  const move = (index: number, by: -1 | 1) =>
    setList((l) => {
      const next = [...l];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  const remove = (id: string) => setList((l) => l.filter((c) => c.id !== id));

  return (
    <Modal
      open
      title="Колонки аркуша"
      okText="Готово"
      cancelText="Скасувати"
      onOk={() => onApply(original, list.map((c) => ({ ...c, title: c.title.trim() })))}
      onCancel={onClose}
      width={520}
    >
      <div className="po-ref-cols">
        {list.map((c, i) => {
          const count = filled.get(c.id) ?? 0;
          const name = c.title.trim() || `колонку ${i + 1}`;
          const del = (onClick?: () => void) => (
            <Button size="small" type="text" danger icon={<DeleteOutlined />} disabled={list.length === 1} onClick={onClick} aria-label={`Видалити ${name}`} />
          );
          return (
            <div key={c.id} className="po-ref-cols-row">
              <Input
                value={c.title}
                maxLength={REFERENCE_TITLE_MAX}
                placeholder="Без назви"
                aria-label={`Назва колонки ${i + 1}`}
                onChange={(e) => patch(c.id, e.target.value)}
              />
              <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Перемістити ${name} вище`} />
              <Button
                size="small"
                type="text"
                icon={<ArrowDownOutlined />}
                disabled={i === list.length - 1}
                onClick={() => move(i, 1)}
                aria-label={`Перемістити ${name} нижче`}
              />
              {count > 0 ? (
                <Popconfirm
                  title={`У колонці ${count} ${pluralUk(count, ['заповнена клітинка', 'заповнені клітинки', 'заповнених клітинок'])}`}
                  description="Після «Готово» їх буде видалено"
                  okText="Видалити"
                  cancelText="Залишити"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => remove(c.id)}
                >
                  {del()}
                </Popconfirm>
              ) : (
                <Tooltip title={list.length === 1 ? 'Має лишитися хоча б одна колонка' : null}>{del(() => remove(c.id))}</Tooltip>
              )}
            </div>
          );
        })}
      </div>
      <Button
        icon={<PlusOutlined />}
        disabled={!added}
        onClick={() => added && setList((l) => [...l, added])}
        style={{ marginTop: 12 }}
        title={added ? undefined : `До ${REFERENCE_MAX_COLUMNS} колонок`}
      >
        Колонка
      </Button>
    </Modal>
  );
}
