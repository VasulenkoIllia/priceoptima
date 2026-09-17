import { Button, Result, Spin, Tabs } from 'antd';
import { useEffect, useRef } from 'react';
import { formatRequestNumber } from '@shared/format';
import { useNavigate, useParams } from 'react-router';
import { useTabContext, useTabTitle } from '@/app/AppTabs';
import { getRequestDocStore, useRequestDoc } from '@/stores/requestDocStore';
import ApprovalTab from './approval/ApprovalTab';
import { EditorHeader } from './EditorHeader';
import FilesTab from './files/FilesTab';
import HistoryTab from './history/HistoryTab';
import KpTab from './kp/KpTab';
import MarkupTab from './markup/MarkupTab';
import SourcingTab from './sourcing/SourcingTab';
import './steps.css';

/** Кроки роботи із заявкою (ТЗ 4.5): підбір → націнка → КП → погодження; історія — довідково. */
const EDITOR_TABS = [
  { key: 'sourcing', label: '1. Позиції і підбір', render: () => <SourcingTab /> },
  { key: 'markup', label: '2. Націнка', render: () => <MarkupTab /> },
  { key: 'kp', label: '3. КП', render: () => <KpTab /> },
  { key: 'approval', label: '4. Погодження', render: () => <ApprovalTab /> },
  { key: 'files', label: 'Файли', render: () => <FilesTab /> },
  { key: 'history', label: 'Історія', render: () => <HistoryTab /> },
] as const;

export type EditorTabKey = (typeof EDITOR_TABS)[number]['key'];

/** Ctrl/Cmd+Z — скасувати, Ctrl/Cmd+Shift+Z або Ctrl+Y — повторити (не в полях введення; лише коли вкладка заявки на екрані). */
function useUndoShortcuts() {
  const { active } = useTabContext();
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!activeRef.current || !(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      const s = getRequestDocStore().getState();
      if (key === 'y' || e.shiftKey) s.redo();
      else s.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Редактор заявки: /requests/:id/:tab? — шапка + вкладки. Відкриття бере блокування, закриття — зберігає і звільняє. */
export default function RequestEditorPage() {
  const { id, tab } = useParams();
  const navigate = useNavigate();
  const load = useRequestDoc((s) => s.load);
  const unload = useRequestDoc((s) => s.unload);
  const loadState = useRequestDoc((s) => s.loadState);
  const loadError = useRequestDoc((s) => s.loadError);
  const requestId = useRequestDoc((s) => s.requestId);
  const number = useRequestDoc((s) => (s.requestId === id ? s.doc?.header.number : undefined));
  useUndoShortcuts();
  useTabTitle(number != null ? `Заявка ${formatRequestNumber(number)}` : null);

  useEffect(() => {
    if (!id) return;
    void load(id);
    return () => {
      void unload();
    };
  }, [id, load, unload]);

  const activeTab: EditorTabKey = EDITOR_TABS.some((t) => t.key === tab) ? (tab as EditorTabKey) : 'sourcing';

  if (loadState === 'error' && requestId === id) {
    return (
      <Result
        status="warning"
        title="Не вдалося відкрити заявку"
        subTitle={loadError}
        extra={[
          <Button key="back" type="primary" onClick={() => navigate('/requests')}>
            До реєстру
          </Button>,
          <Button key="retry" onClick={() => id && void load(id)}>
            Спробувати ще раз
          </Button>,
        ]}
      />
    );
  }
  if (loadState !== 'ready' || requestId !== id) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="Відкриваю заявку…">
          <div style={{ width: 160, height: 80 }} />
        </Spin>
      </div>
    );
  }

  return (
    <div className="po-editor">
      <EditorHeader />
      <Tabs
        className="po-editor-tabs"
        activeKey={activeTab}
        onChange={(key) => navigate(`/requests/${id}${key === 'sourcing' ? '' : `/${key}`}`, { replace: true })}
        // сітка підбору лишається змонтованою (стан прокрутки й фільтрів), решта вкладок — лише активна (свіжі дані при відкритті)
        items={EDITOR_TABS.map((t) => ({ key: t.key, label: t.label, children: t.key === 'sourcing' || t.key === activeTab ? t.render() : null }))}
      />
    </div>
  );
}
