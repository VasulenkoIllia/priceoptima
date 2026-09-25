// «Назви 1С з Excel» (п.9.2 правок): файл «артикул → назва 1С» для товарів одного постачальника.
// Спершу перевірка (скільки знайдено й зміниться), потім запис. Оновлення прайсів ці назви не перезаписують.
import { InboxOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, InputNumber, Modal, Select, Space, Spin, Table, Typography, Upload } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { dedupeName1cRows } from '@shared/catalog/name1c';
import type { Name1cImportResult, UUID } from '@shared/types';
import { ds, errorMessage, qk } from '@/data';
import { columnLetter, readSpreadsheetFile, SpreadsheetError, type SheetData } from '@/lib/spreadsheet';
import { detectName1cColumns, name1cRowsOf, sumName1cResults, type Name1cColumns } from './name1cImport';

const NO_ROWS: string[][] = [];

/** Рядків в одному запиті (тіло запиту до 1 МБ). */
const CHUNK = 2000;

export interface Name1cImportDialogProps {
  supplierId: UUID;
  supplierName: string;
  open: boolean;
  onClose(): void;
}

export function Name1cImportDialog({ supplierId, supplierName, open, onClose }: Name1cImportDialogProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [cols, setCols] = useState<Name1cColumns | null>(null);
  const [check, setCheck] = useState<Name1cImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = sheets[sheetIndex]?.rows ?? NO_ROWS;
  const prepared = useMemo(() => dedupeName1cRows(cols ? name1cRowsOf(rows, cols) : []), [rows, cols]);
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const header = cols?.headerRow != null ? (rows[cols.headerRow] ?? []) : [];
  const columnOptions = Array.from({ length: width }, (_, i) => ({ value: i, label: `${columnLetter(i)}${header[i] ? `: ${header[i]}` : ''}` }));

  const send = async (dryRun: boolean): Promise<Name1cImportResult> => {
    const parts: Name1cImportResult[] = [];
    for (let i = 0; i < prepared.rows.length; i += CHUNK) {
      parts.push(await ds.importName1c({ supplierId, rows: prepared.rows.slice(i, i + CHUNK), dryRun }));
    }
    return sumName1cResults(parts, prepared.skipped, prepared.duplicates);
  };

  // перевірка на сервері: скільки знайдено в каталозі й зміниться (після вибору файлу або колонок)
  useEffect(() => {
    setCheck(null);
    if (!prepared.rows.length) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setBusy(true);
      send(true)
        .then((r) => !cancelled && setCheck(r))
        .catch((e) => !cancelled && setError(errorMessage(e)))
        .finally(() => !cancelled && setBusy(false));
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [prepared, supplierId]);

  const reset = () => {
    setError(null);
    setFileName(null);
    setSheets([]);
    setSheetIndex(0);
    setCols(null);
    setCheck(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const readFile = async (file: File) => {
    setReading(true);
    setError(null);
    try {
      const list = (await readSpreadsheetFile(file)).filter((s) => s.rows.length);
      if (!list.length) throw new SpreadsheetError('У файлі немає даних');
      const found = Math.max(0, list.findIndex((s) => detectName1cColumns(s.rows).headerRow != null));
      setFileName(file.name);
      setSheets(list);
      setSheetIndex(found);
      setCols(detectName1cColumns(list[found].rows));
    } catch (e) {
      setError(e instanceof SpreadsheetError ? e.message : errorMessage(e));
    } finally {
      setReading(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    try {
      const r = await send(false);
      void queryClient.invalidateQueries({ queryKey: qk.productsAll });
      message.success(`Назви 1С записано: ${r.updated}${r.unchanged ? `, без змін ${r.unchanged}` : ''}${r.notFoundCount ? `, не знайдено артикулів ${r.notFoundCount}` : ''}`);
      close();
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Назви 1С з Excel · ${supplierName}`}
      width={860}
      onCancel={close}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={close}>Скасувати</Button>
          <Button type="primary" disabled={!check?.updated} loading={busy && !!check} onClick={() => void apply()}>
            {check?.updated ? `Записати назви: ${check.updated}` : 'Записати'}
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
            <p className="ant-upload-text">Перетягніть файл або натисніть, щоб обрати (xlsx, csv)</p>
            <p className="ant-upload-hint">
              Потрібні дві колонки: артикул постачальника і назва 1С. Товар шукаємо за артикулом у каталозі {supplierName}; порожня назва
              наявну не стирає. Оновлення прайсів ці назви не перезаписують.
            </p>
          </Upload.Dragger>
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
                onChange={(i) => {
                  setSheetIndex(i);
                  setCols(detectName1cColumns(sheets[i].rows));
                }}
              />
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
                value={cols?.headerRow != null ? cols.headerRow + 1 : null}
                placeholder="немає"
                style={{ width: 80 }}
                onChange={(v) => setCols((c) => (c ? { ...c, headerRow: v == null ? null : v - 1 } : c))}
              />
            </label>
            <label>
              <span className="po-muted">Артикул*</span>
              <Select
                size="small"
                value={cols?.sku ?? undefined}
                placeholder="оберіть"
                style={{ width: 220 }}
                options={columnOptions}
                onChange={(v: number) => setCols((c) => (c ? { ...c, sku: v } : c))}
              />
            </label>
            <label>
              <span className="po-muted">Назва 1С*</span>
              <Select
                size="small"
                value={cols?.name1c ?? undefined}
                placeholder="оберіть"
                style={{ width: 260 }}
                options={columnOptions}
                onChange={(v: number) => setCols((c) => (c ? { ...c, name1c: v } : c))}
              />
            </label>
          </div>

          {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 8 }} /> : null}
          <Spin spinning={busy && !check}>
            {check ? (
              <Alert
                type={check.updated ? 'info' : 'warning'}
                showIcon
                style={{ marginBottom: 8 }}
                message={`Знайдено в каталозі: ${check.matched} · зміниться назв: ${check.updated} · без змін: ${check.unchanged}`}
                description={
                  <>
                    {check.notFoundCount ? (
                      <div>
                        Не знайдено артикулів: {check.notFoundCount} ({check.notFound.slice(0, 12).join(', ')}
                        {check.notFoundCount > 12 ? ' …' : ''})
                      </div>
                    ) : null}
                    {check.skipped ? <div>Рядків без артикула або назви (пропущено): {check.skipped}</div> : null}
                    {check.duplicates ? <div>Артикул повторюється: {check.duplicates} (береться останній рядок)</div> : null}
                  </>
                }
              />
            ) : !prepared.rows.length ? (
              <Alert type="warning" showIcon style={{ marginBottom: 8 }} message="Немає рядків з артикулом і назвою: перевірте колонки" />
            ) : null}
          </Spin>
          <Table
            size="small"
            rowKey="sku"
            pagination={false}
            scroll={{ y: 300 }}
            dataSource={prepared.rows.slice(0, 100)}
            columns={[
              { title: 'Артикул', dataIndex: 'sku', width: 180, render: (v: string) => <span className="po-num">{v}</span> },
              { title: 'Назва 1С', dataIndex: 'name1c', className: 'po-cell-text' },
            ]}
          />
          {prepared.rows.length > 100 ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Показано перші 100 з {prepared.rows.length}
            </Typography.Text>
          ) : null}
        </>
      )}
    </Modal>
  );
}
