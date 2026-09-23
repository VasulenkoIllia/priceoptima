// Панель інструментів вкладки «Позиції і підбір» (§6.4). Рядки додаються в самій таблиці (порожній рядок унизу).
import { BarChartOutlined, CheckOutlined, DeleteOutlined, DownOutlined, FileExcelOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Button, Dropdown, Input, Segmented, Select, Tooltip } from 'antd';
import { useState } from 'react';
import { SupplierLogo } from '@/components/SupplierLogo';
import { useRequestDoc } from '@/stores/requestDocStore';
import { useUiPrefs, type EditorMode } from '@/stores/uiPrefsStore';
import { RequestImportDialog } from '../import/RequestImportDialog';
import { BASE_FILTERS, ROW_FILTER_LABELS, WARNING_FILTERS, type RowFilter } from './rows';
import { useSourcingUi } from './sourcingUiStore';
import { useSourcingActions } from './useSourcingActions';

const MODE_OPTIONS: { label: string; value: EditorMode }[] = [
  { label: 'Підбір', value: 'sourcing' },
  { label: 'Порівняння', value: 'comparison' },
];

export interface SourcingToolbarProps {
  counts: Record<RowFilter, number>;
}

export function SourcingToolbar({ counts }: SourcingToolbarProps) {
  const { message } = App.useApp();
  const actions = useSourcingActions();
  const readOnly = useRequestDoc((s) => s.readOnly);
  const suppliers = useRequestDoc((s) => s.suppliers);
  const blocks = useRequestDoc((s) => s.doc?.blocks);
  const addBlock = useRequestDoc((s) => s.addBlock);
  const acceptAll = useRequestDoc((s) => s.acceptAllRecommendations);
  const mode = useUiPrefs((s) => s.editorMode);
  const setMode = useUiPrefs((s) => s.setEditorMode);
  const scenariosOpen = useUiPrefs((s) => s.scenariosPanelOpen);
  const toggleScenarios = useUiPrefs((s) => s.toggleScenariosPanel);
  const filter = useSourcingUi((s) => s.filter);
  const setFilter = useSourcingUi((s) => s.setFilter);
  const search = useSourcingUi((s) => s.search);
  const setSearch = useSourcingUi((s) => s.setSearch);
  const selected = useSourcingUi((s) => s.selectedLineIds);
  const openDrawer = useSourcingUi((s) => s.openDrawer);
  const [importOpen, setImportOpen] = useState(false);

  const used = new Set((blocks ?? []).map((b) => b.supplierId));
  const supplierItems = suppliers
    .filter((s) => s.isActive || used.has(s.id))
    .map((s) => ({
      key: s.id,
      disabled: used.has(s.id),
      label: (
        <span className="po-supplier-option">
          <SupplierLogo name={s.name} logoUrl={s.logoUrl} color={s.color} size={18} showName />
          {used.has(s.id) ? <span className="po-muted"> · уже додано</span> : null}
        </span>
      ),
    }));

  const onAddSupplier = (id: string) => {
    const blockId = addBlock(id);
    const name = suppliers.find((s) => s.id === id)?.name ?? '';
    if (blockId) message.success(`Додано блок ${name}. Вставте артикули в колонку «Артикул»`);
  };

  const onAcceptAll = () => {
    const n = acceptAll();
    message[n ? 'success' : 'info'](n ? `Затверджено рекомендацій: ${n}` : 'Немає рядків без затвердження з рекомендацією');
  };

  return (
    <div className="po-sourcing-toolbar">
      <Segmented<EditorMode>
        options={MODE_OPTIONS}
        value={mode}
        onChange={(m) => {
          setMode(m);
          openDrawer(null);
        }}
      />
      <Dropdown
        disabled={readOnly}
        trigger={['click']}
        menu={{ items: supplierItems, onClick: ({ key }) => onAddSupplier(key) }}
      >
        <Button icon={<PlusOutlined />}>
          Постачальник <DownOutlined />
        </Button>
      </Dropdown>
      <Tooltip title="Позиції з файлу клієнта або нашого шаблону додаються в кінець заявки">
        <Button icon={<FileExcelOutlined />} disabled={readOnly} onClick={() => setImportOpen(true)}>
          Імпорт з Excel
        </Button>
      </Tooltip>
      <Tooltip title="Затвердити мінімальну ціну в рядках без ручного вибору (ручний вибір не змінюється)">
        <Button icon={<CheckOutlined />} disabled={readOnly || counts.unapproved === 0} onClick={onAcceptAll}>
          Прийняти всі рекомендації
        </Button>
      </Tooltip>
      <Select<RowFilter>
        value={filter}
        onChange={setFilter}
        style={{ width: 210 }}
        options={[
          ...BASE_FILTERS.map((f) => ({ value: f, label: `${f === 'all' ? 'Рядки: усі' : ROW_FILTER_LABELS[f]} (${counts[f]})` })),
          {
            label: 'За попередженням',
            options: WARNING_FILTERS.map((f) => ({ value: f, label: `${ROW_FILTER_LABELS[f]} (${counts[f]})` })),
          },
        ]}
        aria-label="Фільтр рядків"
      />
      <Input
        allowClear
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        prefix={<SearchOutlined className="po-muted" />}
        placeholder="Пошук рядка"
        style={{ width: 190 }}
      />
      {selected.length && mode === 'sourcing' ? (
        <Button danger icon={<DeleteOutlined />} disabled={readOnly} onClick={() => actions.removeLines(selected)}>
          Видалити виділені ({selected.length})
        </Button>
      ) : null}
      <span className="po-sourcing-toolbar-spacer" />
      <Button type={scenariosOpen ? 'primary' : 'default'} ghost={scenariosOpen} icon={<BarChartOutlined />} onClick={toggleScenarios}>
        Сценарії закупівлі
      </Button>
      <RequestImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
