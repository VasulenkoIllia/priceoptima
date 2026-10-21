// Аркуш «Довідника»: пошук, видалення рядків, колонки, перейменування; зберігається сам.
// Рядки й колонки додаються «плюсиками» в самій таблиці (SheetGrid).
import { DeleteOutlined, EditOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons';
import { App, Button, Input, Modal, Popconfirm, Typography } from 'antd';
import { useCallback, useRef, useState } from 'react';
import { formatDateTime, pluralUk } from '@shared/format';
import { REFERENCE_MAX_SHEET_CHARS, REFERENCE_TITLE_MAX } from '@shared/reference/limits';
import type { ReferenceSheetDto } from '@shared/types';
import { SaveIndicator } from '@/components';
import { ColumnsDialog } from './ColumnsDialog';
import { SheetGrid, type SheetGridHandle } from './SheetGrid';
import { applyColumnEdits, deleteRows, filledCounts, removeColumn, renameColumn, type SheetContent } from './sheet';
import { useSheetDraft } from './useSheetDraft';

export interface SheetEditorProps {
  sheet: ReferenceSheetDto;
  debounceMs: number;
  /** Аркуш тим часом змінив колега: сторінка пояснює, що сталося. */
  onConflict: () => void;
}

/** Що перейменовуємо у вікні назви: аркуш чи колонку. */
type Naming = { kind: 'sheet'; value: string } | { kind: 'column'; colId: string; value: string };

const TOO_LARGE = `Аркуш завеликий: до ${REFERENCE_MAX_SHEET_CHARS.toLocaleString('uk-UA')} символів тексту. Розділіть таблицю на кілька аркушів`;
const filledLabel = (n: number) => `${n} ${pluralUk(n, ['заповнена клітинка', 'заповнені клітинки', 'заповнених клітинок'])}`;

export function SheetEditor({ sheet, debounceMs, onConflict }: SheetEditorProps) {
  const { message, modal } = App.useApp();
  const draft = useSheetDraft(sheet, debounceMs, onConflict);
  const { content, update: draftUpdate } = draft;
  const gridRef = useRef<SheetGridHandle>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(0);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [naming, setNaming] = useState<Naming | null>(null);
  // поки вікно назви закривається, у ньому лишається те, що й було (а не «Назва аркуша» з порожнім полем)
  const lastNaming = useRef<Naming | null>(null);
  if (naming) lastNaming.current = naming;
  const shownNaming = naming ?? lastNaming.current;

  const update = useCallback(
    (change: (s: SheetContent) => SheetContent) => {
      const accepted = draftUpdate(change);
      if (!accepted) message.warning(TOO_LARGE);
      return accepted;
    },
    [draftUpdate, message],
  );

  const clearSearch = useCallback(() => setSearch(''), []);

  const onRenameColumn = useCallback(
    (colId: string) => setNaming({ kind: 'column', colId, value: content.columns.find((c) => c.id === colId)?.title ?? '' }),
    [content.columns],
  );

  const onDeleteColumn = useCallback(
    (colId: string) => {
      const column = content.columns.find((c) => c.id === colId);
      if (!column) return;
      if (content.columns.length <= 1) {
        message.info('Має лишитися хоча б одна колонка');
        return;
      }
      const remove = () => update((s) => removeColumn(s, colId));
      const count = filledCounts(content.rows).get(colId) ?? 0;
      if (!count) {
        remove();
        return;
      }
      modal.confirm({
        title: `Видалити колонку «${column.title || 'Без назви'}»?`,
        content: `У колонці ${filledLabel(count)}, їх буде видалено разом з колонкою.`,
        okText: 'Видалити',
        okButtonProps: { danger: true },
        cancelText: 'Скасувати',
        onOk: remove,
      });
    },
    [content, message, modal, update],
  );

  const onDeleteRows = () => {
    const ids = new Set(gridRef.current?.selectedRowIds() ?? []);
    update((s) => deleteRows(s, ids));
  };

  const onNamingOk = () => {
    if (!naming) return;
    const value = naming.value.trim();
    if (naming.kind === 'sheet') {
      if (!value) return;
      update((s) => (s.title === value ? s : { ...s, title: value }));
      draft.flush();
    } else {
      update((s) => renameColumn(s, naming.colId, value));
    }
    setNaming(null);
  };

  return (
    <div className="po-ref-editor">
      <div className="po-toolbar">
        <Input
          allowClear
          prefix={<SearchOutlined className="po-muted" />}
          placeholder="Пошук в аркуші"
          aria-label="Пошук в аркуші"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 240 }}
        />
        <Popconfirm
          title={`Видалити ${selected} ${pluralUk(selected, ['рядок', 'рядки', 'рядків'])}?`}
          okText="Видалити"
          cancelText="Скасувати"
          okButtonProps={{ danger: true }}
          onConfirm={onDeleteRows}
          disabled={!selected}
        >
          <Button icon={<DeleteOutlined />} danger disabled={!selected} title={selected ? undefined : 'Позначте рядки галочками ліворуч'}>
            {selected ? `Видалити рядки (${selected})` : 'Видалити рядки'}
          </Button>
        </Popconfirm>
        <Button icon={<SettingOutlined />} onClick={() => setColumnsOpen(true)}>
          Налаштувати колонки
        </Button>
        <Button icon={<EditOutlined />} onClick={() => setNaming({ kind: 'sheet', value: content.title })}>
          Перейменувати аркуш
        </Button>
        <span className="po-ref-status" aria-live="polite">
          <SaveIndicator state={draft.saveState} savedAt={draft.savedAt} error={draft.error} dirty={draft.dirty} onRetry={draft.retry} />
          {sheet.updatedBy ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Остання зміна: {sheet.updatedBy.shortName}, {formatDateTime(sheet.updatedAt)}
            </Typography.Text>
          ) : null}
        </span>
      </div>
      <SheetGrid
        ref={gridRef}
        content={content}
        search={search}
        onChange={update}
        onSelectionCount={setSelected}
        onRowInsert={clearSearch}
        onRenameColumn={onRenameColumn}
        onDeleteColumn={onDeleteColumn}
      />
      {columnsOpen ? (
        <ColumnsDialog
          columns={content.columns}
          filled={filledCounts(content.rows)}
          onClose={() => setColumnsOpen(false)}
          onApply={(original, edited) => {
            update((s) => applyColumnEdits(s, original, edited));
            setColumnsOpen(false);
          }}
        />
      ) : null}
      <Modal
        open={naming !== null}
        title={shownNaming?.kind === 'column' ? 'Назва колонки' : 'Назва аркуша'}
        okText="Зберегти"
        cancelText="Скасувати"
        okButtonProps={{ disabled: naming?.kind === 'sheet' && !naming.value.trim() }}
        onOk={onNamingOk}
        onCancel={() => setNaming(null)}
        destroyOnHidden
      >
        <Input
          value={shownNaming?.value ?? ''}
          maxLength={REFERENCE_TITLE_MAX}
          placeholder={shownNaming?.kind === 'column' ? 'Без назви' : undefined}
          aria-label={shownNaming?.kind === 'column' ? 'Назва колонки' : 'Назва аркуша'}
          autoFocus
          onChange={(e) => setNaming((n) => (n ? { ...n, value: e.target.value } : n))}
          onPressEnter={onNamingOk}
        />
      </Modal>
    </div>
  );
}
