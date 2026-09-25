// «Імпорт з Excel» (п.2.1 правок): файл клієнта (колонки знаходимо самі, можна виправити, вибір запам'ятовується)
// або наш шаблон (розпізнається одразу). Рядки додаються в кінець заявки одним кроком (Ctrl+Z скасовує).
import { FileExcelOutlined, InboxOutlined } from '@ant-design/icons';
import { Alert, App, Button, InputNumber, Modal, Select, Space, Spin, Table, Tag, Typography, Upload } from 'antd';
import { useMemo, useState } from 'react';
import { formatQty } from '@shared/format';
import { errorMessage } from '@/data';
import { columnLetter, readSpreadsheetFile, SpreadsheetError, type SheetData } from '@/lib/spreadsheet';
import { useRequestDoc } from '@/stores/requestDocStore';
import { useUiPrefs } from '@/stores/uiPrefsStore';
import {
  buildRequestRows,
  detectRequestColumns,
  headerSignature,
  isRequestTemplate,
  REQUEST_COLUMN_ROLES,
  REQUEST_ROLE_LABELS,
  type RequestColumnMap,
  type RequestColumnRole,
  type RequestPreviewRow,
  type RequestRowStatus,
} from './requestRows';
import { downloadRequestTemplate } from './requestTemplate';

const NO_ROWS: string[][] = [];

const PREVIEW_LIMIT = 200;

/** Колонки: автопошук, поверх — запам'ятований вибір для такого самого заголовка (у налаштуваннях користувача). */
function initialMap(rows: string[][]): RequestColumnMap {
  const detected = detectRequestColumns(rows);
  const signature = headerSignature(rows, detected.headerRow);
  const saved = signature ? useUiPrefs.getState().importMaps[signature] : undefined;
  return saved ? { ...detected, ...saved } : detected;
}

const STATUS: Record<RequestRowStatus, { color: string; label: string }> = {
  ok: { color: 'green', label: 'додається' },
  bad_qty: { color: 'orange', label: 'к-сть не число, буде 0' },
  no_name: { color: 'default', label: 'немає назви' },
  total: { color: 'default', label: 'підсумок' },
};

export interface RequestImportDialogProps {
  open: boolean;
  onClose(): void;
}

export function RequestImportDialog({ open, onClose }: RequestImportDialogProps) {
  const { message } = App.useApp();
  const addLines = useRequestDoc((s) => s.addLines);
  const readOnly = useRequestDoc((s) => s.readOnly);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [map, setMap] = useState<RequestColumnMap | null>(null);

  const rows = sheets[sheetIndex]?.rows ?? NO_ROWS;
  const template = useMemo(() => isRequestTemplate(rows), [rows]);
  const result = useMemo(() => (map ? buildRequestRows(rows, map) : null), [rows, map]);
  const header = map?.headerRow != null ? (rows[map.headerRow] ?? []) : [];
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const columnOptions = Array.from({ length: width }, (_, i) => ({
    value: i,
    label: `${columnLetter(i)}${header[i] ? `: ${header[i]}` : ''}`,
  }));

  const reset = () => {
    setError(null);
    setFileName(null);
    setSheets([]);
    setSheetIndex(0);
    setMap(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const pickSheet = (list: SheetData[], index: number) => {
    setSheetIndex(index);
    setMap(initialMap(list[index]?.rows ?? []));
  };

  const readFile = async (file: File) => {
    setReading(true);
    setError(null);
    try {
      const list = (await readSpreadsheetFile(file)).filter((s) => s.rows.length);
      if (!list.length) throw new SpreadsheetError('У файлі немає даних');
      setFileName(file.name);
      setSheets(list);
      // аркуш, де знайшлися колонки заявки; інакше — перший
      const found = list.findIndex((s) => detectRequestColumns(s.rows).headerRow != null);
      pickSheet(list, Math.max(0, found));
    } catch (e) {
      setError(e instanceof SpreadsheetError ? e.message : errorMessage(e));
    } finally {
      setReading(false);
    }
  };

  const apply = () => {
    if (!result?.lines.length || !map) return;
    const signature = headerSignature(rows, map.headerRow);
    if (signature && !template) useUiPrefs.getState().setImportMap(signature, { name: map.name, unit: map.unit, qty: map.qty, note: map.note });
    addLines(result.lines, 'append');
    const extra = result.badQty ? `; к-сть не розпізнано в ${result.badQty}, заповніть вручну` : '';
    message.success(`Додано позицій: ${result.lines.length}${extra}. Скасувати: Ctrl+Z`);
    close();
  };

  const setRole = (role: RequestColumnRole, value: number | null) => setMap((m) => (m ? { ...m, [role]: value } : m));

  const previewColumns = [
    { title: 'Рядок', dataIndex: 'rowNumber', width: 64, render: (v: number) => <span className="po-num po-muted">{v}</span> },
    { title: 'Найменування', key: 'name', className: 'po-cell-text', render: (_: unknown, r: RequestPreviewRow) => r.line?.clientName ?? '' },
    { title: 'Од.', key: 'unit', width: 70, render: (_: unknown, r: RequestPreviewRow) => r.line?.clientUnit ?? '' },
    {
      title: 'К-сть',
      key: 'qty',
      width: 90,
      render: (_: unknown, r: RequestPreviewRow) => <span className="po-num">{r.line ? formatQty(r.line.qty ?? 0) : r.rawQty}</span>,
    },
    { title: 'Примітка', key: 'note', width: 180, className: 'po-cell-text', ellipsis: true, render: (_: unknown, r: RequestPreviewRow) => r.line?.clientNote ?? '' },
    {
      title: '',
      key: 'status',
      width: 170,
      render: (_: unknown, r: RequestPreviewRow) => (
        <Tag bordered={false} color={STATUS[r.status].color}>
          {STATUS[r.status].label}
        </Tag>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      title="Імпорт позицій з Excel"
      width={980}
      onCancel={close}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={close}>Скасувати</Button>
          <Button type="primary" disabled={readOnly || !result?.lines.length} onClick={apply}>
            {result?.lines.length ? `Додати позицій: ${result.lines.length}` : 'Додати'}
          </Button>
        </Space>
      }
    >
      {!sheets.length ? (
        <Spin spinning={reading}>
          <Upload.Dragger
            accept=".xlsx,.xls,.csv,.tsv,.txt"
            maxCount={1}
            showUploadList={false}
            beforeUpload={(file) => {
              void readFile(file);
              return false;
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Перетягніть файл заявки клієнта або натисніть, щоб обрати</p>
            <p className="ant-upload-hint">
              xlsx або csv. Колонки «Найменування», «Од.», «Кількість» знайдемо самі; якщо ні, оберете вручну. Позиції додаються в кінець заявки.
            </p>
          </Upload.Dragger>
          <div style={{ marginTop: 12 }}>
            <Button icon={<FileExcelOutlined />} onClick={() => void downloadRequestTemplate().catch((e) => message.error(errorMessage(e)))}>
              Шаблон заявки Excel
            </Button>
            <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
              Можна надіслати клієнту: заповнений шаблон розпізнається одразу
            </Typography.Text>
          </div>
          {error ? <Alert type="error" showIcon message={error} style={{ marginTop: 12 }} /> : null}
        </Spin>
      ) : (
        <>
          <div className="po-ri-head">
            <b>{fileName}</b>
            {sheets.length > 1 ? (
              <Select
                size="small"
                value={sheetIndex}
                style={{ minWidth: 180 }}
                options={sheets.map((s, i) => ({ value: i, label: `Аркуш: ${s.name}` }))}
                onChange={(i) => pickSheet(sheets, i)}
              />
            ) : null}
            {template ? (
              <Tag color="blue" bordered={false}>
                Шаблон PriceOptima
              </Tag>
            ) : null}
            <a onClick={reset}>інший файл</a>
          </div>

          <div className="po-ri-map">
            <label>
              <span className="po-muted">Заголовок у рядку</span>
              <InputNumber
                size="small"
                min={1}
                max={rows.length}
                value={map?.headerRow != null ? map.headerRow + 1 : null}
                placeholder="немає"
                style={{ width: 80 }}
                onChange={(v) => setMap((m) => (m ? { ...m, headerRow: v == null ? null : v - 1 } : m))}
              />
            </label>
            {REQUEST_COLUMN_ROLES.map((role) => (
              <label key={role}>
                <span className="po-muted">
                  {REQUEST_ROLE_LABELS[role]}
                  {role === 'name' ? '*' : ''}
                </span>
                <Select
                  size="small"
                  allowClear
                  value={map?.[role] ?? undefined}
                  placeholder="немає"
                  style={{ width: 190 }}
                  options={columnOptions}
                  onChange={(v: number | undefined) => setRole(role, v ?? null)}
                />
              </label>
            ))}
          </div>

          {map?.name == null ? (
            <Alert type="warning" showIcon message="Оберіть колонку з найменуванням: без неї позиції не додаються" style={{ marginBottom: 8 }} />
          ) : result ? (
            <div className="po-muted" style={{ marginBottom: 8 }}>
              Буде додано позицій: <b>{result.lines.length}</b>
              {result.skipped ? ` · пропущено рядків без назви або з підсумком: ${result.skipped}` : ''}
              {result.badQty ? ` · к-сть не розпізнано: ${result.badQty} (додадуться з 0)` : ''}
            </div>
          ) : null}

          <Table<RequestPreviewRow>
            size="small"
            rowKey="rowNumber"
            pagination={false}
            scroll={{ y: 360 }}
            dataSource={(result?.rows ?? []).slice(0, PREVIEW_LIMIT)}
            columns={previewColumns}
            rowClassName={(r) => (r.line ? '' : 'po-ri-skip')}
          />
          {(result?.rows.length ?? 0) > PREVIEW_LIMIT ? (
            <div className="po-muted" style={{ marginTop: 6, fontSize: 12 }}>
              Показано перші {PREVIEW_LIMIT} рядків з {result!.rows.length}; додадуться всі.
            </div>
          ) : null}
        </>
      )}
    </Modal>
  );
}
