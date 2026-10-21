// «Довідник» (правки замовника 21.10, п.11): спільні для всіх користувачів аркуші-таблиці (сайти брендів, нотатки).
// Аркуші — вкладками, як у книзі Excel; кожен зберігається сам. Список вкладок легкий (без вмісту) і перечитується,
// поки сторінка відкрита; відкритий аркуш перечитується, коли в списку з'явилася його новіша версія.
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Spin, Tabs } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { REFERENCE_MAX_SHEETS } from '@shared/reference/limits';
import type { ReferenceSheetMeta, UUID } from '@shared/types';
import { EmptyState, LoadError, PageHeader } from '@/components';
import { ds, errorMessage, qk } from '@/data';
import { SheetEditor } from './SheetEditor';
import { newSheet, newSheetTitle } from './sheet';
import './reference.css';

/** Як часто перечитувати список аркушів, поки сторінка відкрита: правки колег з'являються без оновлення сторінки. */
const REFRESH_MS = 60_000;
const DEFAULT_DEBOUNCE_MS = 800;
const SPIN_STYLE = { display: 'block', margin: '48px auto' };

interface SheetHostProps {
  meta: ReferenceSheetMeta;
  debounceMs: number;
  onConflict: () => void;
}

/** Вміст аркуша: завантажити, а коли колега зберіг новішу версію (видно зі списку) — перечитати. */
function SheetHost({ meta, debounceMs, onConflict }: SheetHostProps) {
  const sheet = useQuery({ queryKey: qk.referenceSheet(meta.id), queryFn: () => ds.getReferenceSheet(meta.id) });
  const loadedVersion = sheet.data?.version;
  const refetch = sheet.refetch;
  useEffect(() => {
    if (loadedVersion !== undefined && meta.version > loadedVersion) void refetch();
  }, [meta.version, loadedVersion, refetch]);

  if (sheet.data) return <SheetEditor sheet={sheet.data} debounceMs={debounceMs} onConflict={onConflict} />;
  if (sheet.isError) return <LoadError title="Не вдалося завантажити аркуш" error={sheet.error} onRetry={refetch} />;
  return <Spin style={SPIN_STYLE} />;
}

export default function ReferencePage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const sheets = useQuery({ queryKey: qk.referenceSheets, queryFn: () => ds.listReferenceSheets(), refetchInterval: REFRESH_MS });
  const settings = useQuery({ queryKey: qk.settings, queryFn: () => ds.getSettings() });
  const [activeId, setActiveId] = useState<UUID | null>(null);
  const list = sheets.data ?? [];
  const active = list.find((s) => s.id === activeId) ?? list[0] ?? null;

  const setList = (change: (list: ReferenceSheetMeta[]) => ReferenceSheetMeta[]) =>
    queryClient.setQueryData<ReferenceSheetMeta[]>(qk.referenceSheets, (l) => change(l ?? []));

  const create = useMutation({
    mutationFn: () => ds.saveReferenceSheet(null, newSheet(newSheetTitle(list.map((s) => s.title)))),
    onSuccess: (sheet) => {
      const { columns: _columns, rows: _rows, ...meta } = sheet;
      queryClient.setQueryData(qk.referenceSheet(sheet.id), sheet);
      setList((l) => [...l, meta]);
      setActiveId(sheet.id);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: UUID) => ds.deleteReferenceSheet(id),
    onSuccess: (_, id) => {
      setList((l) => l.filter((s) => s.id !== id));
      queryClient.removeQueries({ queryKey: qk.referenceSheet(id) });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const confirmDelete = (sheet: ReferenceSheetMeta) =>
    modal.confirm({
      title: `Видалити аркуш «${sheet.title}»?`,
      content: 'Аркуш зникне для всіх користувачів. Копію вмісту буде записано в журнал дій.',
      okText: 'Видалити',
      okButtonProps: { danger: true },
      cancelText: 'Скасувати',
      onOk: () => remove.mutateAsync(sheet.id),
    });

  // модалка лише пояснює; актуальну версію завантажує сам редактор (useSheetDraft)
  const onConflict = useCallback(() => {
    modal.warning({
      title: 'Аркуш змінив інший користувач',
      content: 'Показую актуальну версію аркуша. Ваші останні правки, які ще не встигли зберегтися, внесіть ще раз.',
      okText: 'Зрозуміло',
    });
  }, [modal]);

  const canAdd = list.length < REFERENCE_MAX_SHEETS && !create.isPending;
  const addButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => create.mutate()} disabled={!canAdd} loading={create.isPending}>
      Додати аркуш
    </Button>
  );

  return (
    <div className="po-page">
      <PageHeader title="Довідник" />
      {/* збій фонового перечитування не ховає відкритий аркуш: помилка лише без даних */}
      {sheets.isError && !sheets.data ? (
        <LoadError title="Не вдалося завантажити довідник" error={sheets.error} onRetry={sheets.refetch} />
      ) : sheets.isPending ? (
        <Spin style={SPIN_STYLE} />
      ) : !active ? (
        <EmptyState
          title="Аркушів ще немає"
          description="Аркуш це таблиця з колонками, як в Excel. Його бачать і правлять усі користувачі"
          action={addButton}
        />
      ) : (
        <>
          <Tabs
            className="po-ref-tabs"
            type="editable-card"
            activeKey={active.id}
            onChange={setActiveId}
            onEdit={(key, action) => {
              if (action === 'add') {
                if (canAdd) create.mutate();
                return;
              }
              const sheet = list.find((s) => s.id === key);
              if (sheet) confirmDelete(sheet);
            }}
            hideAdd={!canAdd}
            items={list.map((s) => ({ key: s.id, label: s.title }))}
          />
          <SheetHost key={active.id} meta={active} debounceMs={settings.data?.autosaveDebounceMs ?? DEFAULT_DEBOUNCE_MS} onConflict={onConflict} />
        </>
      )}
    </div>
  );
}
