// Завантаження прайсу постачальника файлом: файл → аркуш і заголовок → колонки → перегляд і застосування.
// Перед записом сервер рахує зміни без запису (dryRun) — користувач бачить звіт і лише тоді підтверджує.
// Зіставлення колонок зберігається на сервері для постачальника й підставляється наступного разу.
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Checkbox, InputNumber, Input, Modal, Select, Spin, Steps, Tooltip, Upload } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { CURRENCY_CODES, CURRENCY_LABELS, type CurrencyCode } from '@shared/enums';
import { formatQty } from '@shared/format';
import type { PriceImportMapping, PriceUpdateDto, UUID } from '@shared/types';
import { ds, errorMessage, qk } from '@/data';
import { PriceUpdateReportView } from '../PriceUpdateReport';
import { columnOptions, RowsPreview, SheetPreview } from './PriceTablePreview';
import {
  buildPriceRows,
  detectColumns,
  detectFileRates,
  detectHeaderCurrency,
  detectPriceIncludesVat,
  EMPTY_COLUMN_MAP,
  mapHeaderRow,
  PRICE_COLUMN_ROLES,
  ROLE_HINTS,
  ROLE_LABELS,
  type PriceColumnMap,
  type PriceColumnRole,
} from './priceRows';
import { applySavedMapping, savedMappingFits, toSavedMapping } from './mappingStore';
import { useIsAdmin } from '@/app/session';
import { usePriceListRateMaxAge } from '@/lib/rateLabels';
import { readSpreadsheetFile, sheetFromText, SpreadsheetError, type SheetData } from '@/lib/spreadsheet';
import { downloadPriceTemplate } from './template';
import './priceImport.css';

const CURRENCY_OPTIONS = CURRENCY_CODES.map((c) => ({ value: c, label: CURRENCY_LABELS[c] }));
const STEPS = [{ title: 'Файл' }, { title: 'Аркуш' }, { title: 'Колонки' }, { title: 'Перегляд' }];
const REQUIRED_ROLES: PriceColumnRole[] = ['code'];

interface ImportOptions {
  pricesIncludeVat: boolean;
  rrpIncludesVat: boolean;
  currency: CurrencyCode;
  skipRowsWithoutPrice: boolean;
  markMissing: boolean;
}

export interface PriceImportDialogProps {
  supplierId: UUID;
  supplierName: string;
  open: boolean;
  onClose: () => void;
  onDone?: (u: PriceUpdateDto) => void;
}

function TemplateButton() {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      await downloadPriceTemplate();
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Tooltip title="Надішліть цей файл постачальнику, який не дає посилання на прайс">
      <Button icon={<DownloadOutlined />} loading={busy} onClick={() => void download()}>
        Шаблон Excel
      </Button>
    </Tooltip>
  );
}

function ImportFlow({ supplierId, supplierName, onClose, onDone }: Omit<PriceImportDialogProps, 'open'>) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const supplier = useQuery({ queryKey: qk.supplier(supplierId), queryFn: () => ds.getSupplier(supplierId) });
  const settings = useQuery({ queryKey: qk.settings, queryFn: () => ds.getSettings() });
  const savedMapping = useQuery({ queryKey: qk.priceMapping(supplierId), queryFn: () => ds.getPriceImportMapping(supplierId) });
  const vatRatePct = settings.data?.vatRatePct ?? 20;
  const sourceKind = supplier.data?.priceSource.kind ?? 'manual';

  const [step, setStep] = useState(0);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [sheetName, setSheetName] = useState('');
  const [pasted, setPasted] = useState('');
  const [mapping, setMapping] = useState<PriceColumnMap>(EMPTY_COLUMN_MAP);
  // курс прайсу: знайдений у файлі або введений вручну — стає «курсом із прайсу» постачальника
  const [rates, setRates] = useState<{ USD: number | null; EUR: number | null }>({ USD: null, EUR: null });
  const [ratesWhere, setRatesWhere] = useState<string | null>(null);
  const maxAgeDays = usePriceListRateMaxAge();
  const [options, setOptions] = useState<ImportOptions>({
    pricesIncludeVat: false,
    rrpIncludesVat: true,
    currency: 'UAH',
    skipRowsWithoutPrice: true,
    markMissing: false,
  });

  const sheet = sheets.find((s) => s.name === sheetName) ?? sheets[0] ?? null;
  const rows = sheet?.rows ?? [];
  const header = mapping.headerRow != null ? (rows[mapping.headerRow] ?? []) : [];

  const built = useMemo(
    () => buildPriceRows(rows, mapping, { ...options, vatRatePct }),
    [rows, mapping, options, vatRatePct],
  );

  const colOptions = useMemo(() => columnOptions(rows, mapping.headerRow), [rows, mapping.headerRow]);

  /** Аркуш → автовизначення колонок + збережене минулого разу зіставлення цього постачальника. Повертає обраний аркуш. */
  const selectSheet = (list: SheetData[], name: string): SheetData => {
    const picked = list.find((s) => s.name === name) ?? list[0];
    const saved = savedMapping.data ?? null;
    const detected = detectColumns(picked.rows);
    const next = applySavedMapping(detected, saved, picked.rows);
    const head = next.headerRow != null ? (picked.rows[next.headerRow] ?? []) : [];
    const priceHeader = next.purchasePrice != null ? head[next.purchasePrice] : null;
    const currency = detectHeaderCurrency(priceHeader) ?? saved?.currency ?? supplier.data?.defaultCurrency ?? 'UAH';
    const found = detectFileRates(picked.rows, currency);
    setSheetName(picked.name);
    setMapping(next);
    setRates({ USD: found.USD, EUR: found.EUR });
    setRatesWhere(found.where);
    setOptions({
      pricesIncludeVat: detectPriceIncludesVat(priceHeader) ?? saved?.pricesIncludeVat ?? supplier.data?.pricesIncludeVat ?? false,
      // РРЦ у каталозі зберігається з ПДВ; як у прайсі — з картки постачальника, якщо профіль ще не збережено
      rrpIncludesVat: saved?.rrpIncludesVat ?? supplier.data?.rrpIncludesVat ?? true,
      currency,
      skipRowsWithoutPrice: saved?.skipRowsWithoutPrice ?? true,
      markMissing: saved?.markMissing ?? false,
    });
    return picked;
  };

  const takeSheets = (list: SheetData[], name: string) => {
    const withRows = list.filter((s) => s.rows.length > 0);
    if (!withRows.length) {
      setError('У файлі немає даних');
      return;
    }
    setError(null);
    setFileName(name);
    setSheets(withRows);
    const picked = selectSheet(withRows, savedMapping.data?.sheetName ?? withRows[0].name);
    // файл такий самий, як минулого разу (ті самі колонки) — одразу перегляд; аркуш і колонки — кнопкою
    const sameSheet = !savedMapping.data?.sheetName || picked.name === savedMapping.data.sheetName || withRows.length === 1;
    setStep(sameSheet && savedMappingFits(savedMapping.data ?? null, picked.rows) ? 3 : 1);
  };

  const readFile = async (file: File) => {
    setReading(true);
    try {
      takeSheets(await readSpreadsheetFile(file), file.name);
    } catch (e) {
      setError(e instanceof SpreadsheetError ? e.message : errorMessage(e));
    } finally {
      setReading(false);
    }
  };

  const setRole = (role: PriceColumnRole, col: number) => {
    const index = col < 0 ? null : col;
    setMapping((m) => ({ ...m, [role]: index }));
    // колонка ціни підказує, чи ціни з ПДВ
    if (role === 'purchasePrice' && index != null) {
      const vat = detectPriceIncludesVat(header[index]);
      if (vat != null) setOptions((o) => ({ ...o, pricesIncludeVat: vat }));
    }
  };

  const setHeaderRow = (value: number | null) => {
    const headerRow = value != null && value > 0 ? value - 1 : null;
    setMapping(headerRow == null ? { ...EMPTY_COLUMN_MAP } : { headerRow, ...mapHeaderRow(rows[headerRow] ?? []) });
  };

  const missingRoles = REQUIRED_ROLES.filter((r) => mapping[r] == null);
  // у гібриді файл не відповідає за асортимент — позначати відсутні він не може
  const markMissing = sourceKind !== 'hybrid' && options.markMissing;
  const hasPriceColumns = mapping.purchasePrice != null || mapping.rrp != null;

  const fileRates = rates.USD != null || rates.EUR != null ? rates : null;
  const importPrices = useMutation({
    mutationFn: () => ds.importSupplierPrices(supplierId, { rows: built.rows, fileName, markMissing, rates: fileRates }),
  });

  // «Перегляд»: що зміниться в каталозі — рахує сервер без запису (нова спроба заміняє попередню)
  const preview = useMutation({
    mutationFn: () => ds.importSupplierPrices(supplierId, { rows: built.rows, fileName, markMissing, rates: fileRates, dryRun: true }),
  });
  const runPreview = preview.mutate;
  const resetPreview = preview.reset;
  useEffect(() => {
    if (step === 3 && built.rows.length) runPreview();
    else resetPreview();
  }, [step, built.rows, markMissing, fileRates, runPreview, resetPreview]);

  const isAdmin = useIsAdmin();
  const switchToHybrid = useMutation({
    mutationFn: async () => {
      const s = await ds.getSupplierPriceSource(supplierId);
      return ds.saveSupplierPriceSource(supplierId, {
        kind: 'hybrid',
        connector: s.connector,
        auth: s.auth,
        scheduleHour: s.scheduleHour,
        hasPurchasePrice: s.hasPurchasePrice,
        note: s.note,
      });
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(qk.supplierPriceSource(supplierId), saved);
      void queryClient.invalidateQueries({ queryKey: qk.supplier(supplierId) });
      void queryClient.invalidateQueries({ queryKey: qk.suppliers });
      message.success('Режим «Гібрид»: ціни з файлу, асортимент і наявність за посиланням');
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const rememberColumns = async () => {
    const next: PriceImportMapping = toSavedMapping(mapping, header, options, sheetName);
    try {
      queryClient.setQueryData(qk.priceMapping(supplierId), await ds.savePriceImportMapping(supplierId, next));
    } catch (e) {
      message.warning(`Прайс завантажено, але вибір колонок не збережено: ${errorMessage(e)}`);
    }
  };

  const applyNow = async () => {
    const res = await importPrices.mutateAsync();
    await rememberColumns();
    for (const queryKey of [qk.suppliers, qk.supplier(supplierId), qk.productsAll, qk.productAll, qk.priceHistoryAll, qk.priceUpdatesAll]) {
      void queryClient.invalidateQueries({ queryKey });
    }
    message.success({
      content: `Прайс ${supplierName} завантажено: позицій ${formatQty(res.productsTotal)}, нових ${formatQty(res.added)}, змінилось цін ${formatQty(res.changed)}`,
      duration: 5,
    });
    onDone?.(res);
    onClose();
  };

  const apply = async () => {
    try {
      await applyNow();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  // два джерела цін: посилання перезапише ціни з файлу; у гібриді файл відповідає лише за ціни
  const sourceAlert =
    sourceKind === 'auto' && hasPriceColumns ? (
      <Alert
        type="warning"
        showIcon
        message="Ціни цього постачальника оновлюються за посиланням щоранку"
        description={
          <>
            Ціни з файлу протримаються лише до наступного оновлення вигрузки. Якщо ціни мають братися з файлу, а асортимент, наявність і
            фото з посилання, перемкніть постачальника в режим «Гібрид».
            {isAdmin ? (
              <div style={{ marginTop: 8 }}>
                <Button size="small" loading={switchToHybrid.isPending} onClick={() => switchToHybrid.mutate()}>
                  Перемкнути на «Гібрид»
                </Button>
              </div>
            ) : (
              <div style={{ marginTop: 8 }}>Перемкнути джерело прайсу може адміністратор.</div>
            )}
          </>
        }
      />
    ) : sourceKind === 'hybrid' ? (
      <Alert
        type="info"
        showIcon
        message="Гібрид: файл оновлює лише ціни (і наявність, якщо вибрано її колонку)"
        description="Нові позиції з файлу не створюються й відсутні не позначаються: асортимент веде вигрузка за посиланням. Коди, яких немає в каталозі, покажемо у звіті перед записом."
      />
    ) : null;

  // курс має сенс, коли прайс у валюті (або валюта в колонці) чи курс уже знайдено у файлі
  const needsRate = options.currency !== 'UAH' || mapping.currency != null || fileRates != null;
  const setRate = (c: 'USD' | 'EUR', v: number | null) => setRates((r) => ({ ...r, [c]: v != null && v > 0 ? v : null }));
  const ratesRow = needsRate ? (
    <div className="po-pi-options">
      <span>Курс прайсу:</span>
      {(['USD', 'EUR'] as const).map((c) => (
        <label key={c} className="po-pi-field">
          <span style={{ flexBasis: 'auto' }}>{c}</span>
          <InputNumber size="small" min={0.0001} max={10_000} step={0.01} decimalSeparator="," value={rates[c]} onChange={(v) => setRate(c, v)} placeholder="немає" style={{ width: 100 }} />
        </label>
      ))}
      <span className="po-muted" style={{ fontSize: 12 }}>
        {ratesWhere && fileRates ? `знайдено у файлі: ${ratesWhere}` : 'у файлі не знайдено, можна ввести вручну'}. Стане курсом із прайсу для нових заявок
        (діє {maxAgeDays} дн.); якщо порожньо, діє ручний курс постачальника або загальний.
      </span>
    </div>
  ) : null;

  const summary = (
    <div className="po-pi-summary">
      <span>
        Рядків: <b>{formatQty(built.stats.total)}</b>
      </span>
      <span>
        З них із ціною: <b>{formatQty(built.stats.withPrice)}</b>
      </span>
      <span>
        Без коду: <b>{formatQty(built.stats.noCode)}</b>
      </span>
      <span>
        Дублікати коду: <b>{formatQty(built.stats.duplicates)}</b>
      </span>
      <span>
        Піде в каталог: <b>{formatQty(built.rows.length)}</b>
      </span>
    </div>
  );

  const footer = (
    <div className="po-pi-footer">
      {step === 0 ? (
        <TemplateButton />
      ) : step === 3 ? (
        <Button onClick={() => setStep(1)} title="Змінити аркуш, рядок заголовка й колонки">
          Аркуш і колонки…
        </Button>
      ) : (
        <Button onClick={() => setStep((s) => s - 1)}>Назад</Button>
      )}
      <span className="po-pi-footer-spacer" />
      <Button onClick={onClose}>Скасувати</Button>
      {step < 3 ? (
        <Button
          type="primary"
          disabled={!sheets.length || (step === 2 && missingRoles.length > 0)}
          onClick={() => setStep((s) => s + 1)}
        >
          Далі
        </Button>
      ) : (
        <Button
          type="primary"
          loading={importPrices.isPending}
          disabled={!built.rows.length || !preview.isSuccess}
          onClick={() => void apply()}
        >
          Завантажити
        </Button>
      )}
    </div>
  );

  return (
    <Modal open title={`Завантажити прайс: ${supplierName}`} width={1000} onCancel={onClose} footer={footer} destroyOnHidden>
      <div className="po-pi-body">
        <Steps className="po-pi-steps" size="small" current={step} items={STEPS} />
        {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError(null)} /> : null}

        {step === 0 ? (
          <Spin spinning={reading || savedMapping.isPending} tip={reading ? 'Читаємо файл…' : 'Завантажуємо налаштування…'}>
            <Upload.Dragger
              className="po-pi-drop"
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
              <p className="ant-upload-text">Перетягніть сюди файл прайсу або натисніть для вибору</p>
              <p className="ant-upload-hint">
                xlsx, старий xls, csv або tsv.
              </p>
            </Upload.Dragger>
            <div style={{ marginTop: 16 }}>
              <div className="po-muted" style={{ fontSize: 12, marginBottom: 6 }}>
                Або вставте таблицю з буфера обміну (Ctrl+V) і натисніть «Розібрати»:
              </div>
              <Input.TextArea
                rows={3}
                value={pasted}
                placeholder="Код&#9;Назва&#9;Ціна&#9;Наявність"
                onChange={(e) => setPasted(e.target.value)}
              />
              <Button
                style={{ marginTop: 8 }}
                disabled={!pasted.trim()}
                onClick={() => {
                  try {
                    takeSheets([sheetFromText(pasted)], 'Вставлено з буфера');
                  } catch (e) {
                    setError(e instanceof SpreadsheetError ? e.message : 'Не вдалося розібрати вставлену таблицю');
                  }
                }}
              >
                Розібрати
              </Button>
            </div>
          </Spin>
        ) : null}

        {step === 1 && sheet ? (
          <>
            <div className="po-pi-file">
              <span className="po-pi-file-name">{fileName}</span>
              <label className="po-pi-field">
                <span>Аркуш:</span>
                <Select
                  value={sheet.name}
                  style={{ width: 220 }}
                  options={sheets.map((s) => ({ value: s.name, label: `${s.name} (${formatQty(s.rows.length)})` }))}
                  onChange={(v) => selectSheet(sheets, v)}
                />
              </label>
              <label className="po-pi-field" title="Рядок із назвами колонок; 0, якщо заголовка немає">
                <span>Рядок заголовка:</span>
                <InputNumber
                  min={0}
                  max={Math.min(rows.length, 50)}
                  value={(mapping.headerRow ?? -1) + 1}
                  style={{ width: 80 }}
                  onChange={setHeaderRow}
                />
              </label>
            </div>
            {mapping.headerRow == null ? (
              <Alert
                type="warning"
                showIcon
                message="Рядок заголовка не знайдено. Вкажіть його номер, інакше колонки доведеться вибирати вручну."
              />
            ) : null}
            <SheetPreview rows={rows} mapping={mapping} limit={10} />
          </>
        ) : null}

        {step === 2 && sheet ? (
          <>
            <div className="po-pi-fields">
              {PRICE_COLUMN_ROLES.map((role) => (
                <label key={role} className={`po-pi-field${REQUIRED_ROLES.includes(role) ? ' po-pi-required' : ''}`}>
                  <Tooltip title={ROLE_HINTS[role]}>
                    <span>{ROLE_LABELS[role]}</span>
                  </Tooltip>
                  <Select<number>
                    size="small"
                    value={mapping[role] ?? -1}
                    options={colOptions}
                    popupMatchSelectWidth={false}
                    onChange={(v) => setRole(role, v)}
                  />
                </label>
              ))}
            </div>
            <div className="po-pi-options">
              <Tooltip title="Ціни в колонці закупівлі вказані з ПДВ: поділимо на 1,2 і збережемо вхід без ПДВ">
                <Checkbox
                  checked={options.pricesIncludeVat}
                  onChange={(e) => setOptions((o) => ({ ...o, pricesIncludeVat: e.target.checked }))}
                >
                  Ціни з ПДВ
                </Checkbox>
              </Tooltip>
              <Tooltip title="РРЦ у прайсі вказана з ПДВ. Якщо без ПДВ, зніміть галочку, і ми помножимо на 1,2: у каталозі РРЦ завжди з ПДВ">
                <Checkbox
                  checked={options.rrpIncludesVat}
                  disabled={mapping.rrp == null}
                  onChange={(e) => setOptions((o) => ({ ...o, rrpIncludesVat: e.target.checked }))}
                >
                  РРЦ з ПДВ
                </Checkbox>
              </Tooltip>
              <label className="po-pi-field">
                <span style={{ flexBasis: 'auto' }}>Валюта прайсу:</span>
                <Select<CurrencyCode>
                  size="small"
                  value={options.currency}
                  options={CURRENCY_OPTIONS}
                  style={{ width: 90 }}
                  disabled={mapping.currency != null}
                  onChange={(v) => setOptions((o) => ({ ...o, currency: v }))}
                />
              </label>
              <Checkbox
                checked={options.skipRowsWithoutPrice}
                onChange={(e) => setOptions((o) => ({ ...o, skipRowsWithoutPrice: e.target.checked }))}
              >
                Пропускати рядки без ціни
              </Checkbox>
              {sourceKind === 'hybrid' ? null : (
                <Tooltip title="Позиції каталогу, яких немає у файлі, будуть позначені «немає у прайсі»">
                  <Checkbox
                    checked={options.markMissing}
                    onChange={(e) => setOptions((o) => ({ ...o, markMissing: e.target.checked }))}
                  >
                    Позначити зниклі позиції
                  </Checkbox>
                </Tooltip>
              )}
            </div>
            {ratesRow}
            {sourceAlert}
            {missingRoles.length ? (
              <Alert
                type="warning"
                showIcon
                message={`Вкажіть колонку: ${missingRoles.map((r) => ROLE_LABELS[r]).join(', ')}`}
              />
            ) : null}
            {mapping.purchasePrice == null ? (
              <Alert type="info" showIcon message="Колонку ціни не вибрано, ціни в каталозі не зміняться." />
            ) : null}
            <SheetPreview rows={rows} mapping={mapping} limit={8} />
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className="po-muted">
              Файл <b>{fileName}</b>
              {sheets.length > 1 ? `, аркуш «${sheet?.name ?? ''}»` : ''}. Нижче показано, що зміниться в каталозі; поки ви не натиснете «Завантажити», нічого не
              записано.
            </div>
            {ratesRow}
            {sourceAlert}
            {summary}
            {built.rows.length ? null : (
              <Alert type="error" showIcon message="Жоден рядок не придатний для завантаження, перевірте зіставлення колонок." />
            )}
            {preview.isPending ? <Spin style={{ display: 'block', margin: '16px auto' }} tip="Рахуємо, що зміниться…"><div style={{ height: 40 }} /></Spin> : null}
            {preview.isError ? (
              <Alert
                type="error"
                showIcon
                message={errorMessage(preview.error)}
                action={
                  <Button size="small" onClick={() => runPreview()}>
                    Спробувати ще раз
                  </Button>
                }
              />
            ) : null}
            {preview.data ? <PriceUpdateReportView update={preview.data} preview /> : null}
            <RowsPreview preview={built.preview} />
            <div className="po-muted" style={{ fontSize: 12 }}>
              Ціни показано вже зведеними до входу без ПДВ{options.pricesIncludeVat ? ` (поділено на ${(1 + vatRatePct / 100).toLocaleString('uk-UA')})` : ''}. РРЦ у
              каталозі зберігається з ПДВ{options.rrpIncludesVat ? '' : ` (помножено на ${(1 + vatRatePct / 100).toLocaleString('uk-UA')})`}.
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

/** Відкривається з картки постачальника («Завантажити прайс»). */
export function PriceImportDialog({ supplierId, supplierName, open, onClose, onDone }: PriceImportDialogProps) {
  if (!open) return null;
  return <ImportFlow key={supplierId} supplierId={supplierId} supplierName={supplierName} onClose={onClose} onDone={onDone} />;
}
