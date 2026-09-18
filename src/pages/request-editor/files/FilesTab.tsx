// Вкладка «Файли» (РЕД-16, КП-4): сформовані КП (PDF / Excel з незмінного знімка) і файли заявки (від клієнта тощо).
// Додає й прибирає файли лише той, хто редагує заявку; завантажити може кожен.
import { DeleteOutlined, DownloadOutlined, FileExcelOutlined, FilePdfOutlined, FileTextOutlined, InboxOutlined, PaperClipOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, List, Popconfirm, Result, Spin, Tag, Typography, Upload } from 'antd';
import { useState } from 'react';
import { formatDateTime } from '@shared/format';
import type { AttachmentDto, KpDocumentDto } from '@shared/types';
import { ds, errorMessage, qk } from '@/data';
import { useRequestDoc } from '@/stores/requestDocStore';
import { downloadKpExcel } from '../kp/kpExcel';
import { downloadKpPdf } from '../kp/kpPdf';

const MAX_MB = 20;

type FileRow =
  | { key: string; at: string; by: string | null; kind: 'kp'; kp: KpDocumentDto }
  | { key: string; at: string; by: string | null; kind: 'file'; file: AttachmentDto };

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
}

export default function FilesTab() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const requestId = useRequestDoc((s) => s.requestId);
  const doc = useRequestDoc((s) => s.doc);
  const readOnly = useRequestDoc((s) => s.readOnly);
  const kps = useQuery({ queryKey: qk.kps(requestId ?? ''), queryFn: () => ds.listKps(requestId!), enabled: !!requestId });
  const files = useQuery({ queryKey: qk.attachments(requestId ?? ''), queryFn: () => ds.listAttachments(requestId!), enabled: !!requestId });
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);

  if (!doc || !requestId) return null;
  const error = kps.error ?? files.error;
  if (error) return <Result status="warning" title="Не вдалося завантажити файли" subTitle={errorMessage(error)} />;

  const changed = () => {
    void queryClient.invalidateQueries({ queryKey: qk.attachments(requestId) });
    void queryClient.invalidateQueries({ queryKey: qk.history(requestId) });
    void queryClient.invalidateQueries({ queryKey: qk.requestsAll });
  };

  const downloadKp = async (kp: KpDocumentDto, kind: 'pdf' | 'xlsx') => {
    setBusy(`${kp.id}:${kind}`);
    try {
      if (kind === 'pdf') await downloadKpPdf(kp.snapshot, kp.version);
      else await downloadKpExcel(kp.snapshot, kp.version);
    } catch (e) {
      message.error(`Не вдалося сформувати файл: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file: File) => {
    if (file.size > MAX_MB * 1024 * 1024) {
      message.error(`«${file.name}»: файл завеликий — до ${MAX_MB} МБ`);
      return;
    }
    setUploading((n) => n + 1);
    try {
      await ds.uploadAttachment(requestId, file);
      message.success(`«${file.name}» додано`);
      changed();
    } catch (e) {
      message.error(`«${file.name}»: ${errorMessage(e)}`);
    } finally {
      setUploading((n) => n - 1);
    }
  };

  const remove = async (f: AttachmentDto) => {
    setBusy(`${f.id}:delete`);
    try {
      await ds.deleteAttachment(requestId, f.id);
      changed();
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const rows: FileRow[] = [
    ...(kps.data ?? []).map((k): FileRow => ({ key: k.id, at: k.createdAt, by: k.createdBy?.shortName ?? null, kind: 'kp', kp: k })),
    ...(files.data ?? []).map((f): FileRow => ({ key: f.id, at: f.createdAt, by: f.uploadedBy?.shortName ?? null, kind: 'file', file: f })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="po-tab po-files">
      <Upload.Dragger
        className="po-files-drop"
        multiple
        showUploadList={false}
        disabled={readOnly}
        beforeUpload={(file) => {
          void upload(file);
          return Upload.LIST_IGNORE;
        }}
      >
        <p className="ant-upload-drag-icon">{uploading ? <Spin /> : <InboxOutlined />}</p>
        <p className="ant-upload-text">{readOnly ? 'Додавати файли може той, хто редагує заявку' : 'Додати файл — перетягніть сюди або клацніть'}</p>
        <p className="ant-upload-hint">Лист чи Excel від клієнта, специфікація, рахунок постачальника — до {MAX_MB} МБ</p>
      </Upload.Dragger>

      {kps.isPending || files.isPending ? (
        <Spin />
      ) : (
        <List<FileRow>
          bordered
          className="po-files-list"
          locale={{ emptyText: 'Файлів ще немає — сформовані КП з’являться тут автоматично' }}
          dataSource={rows}
          renderItem={(r) => (
            <List.Item
              actions={
                r.kind === 'kp'
                  ? [
                      <Button key="pdf" size="small" icon={<FilePdfOutlined />} loading={busy === `${r.key}:pdf`} onClick={() => void downloadKp(r.kp, 'pdf')}>
                        PDF
                      </Button>,
                      <Button key="xlsx" size="small" icon={<FileExcelOutlined />} loading={busy === `${r.key}:xlsx`} onClick={() => void downloadKp(r.kp, 'xlsx')}>
                        Excel
                      </Button>,
                    ]
                  : [
                      <Button key="get" size="small" icon={<DownloadOutlined />} href={r.file.downloadUrl} download={r.file.originalFilename}>
                        Завантажити
                      </Button>,
                      ...(readOnly
                        ? []
                        : [
                            <Popconfirm
                              key="del"
                              title={`Прибрати «${r.file.originalFilename}»?`}
                              okText="Прибрати"
                              okButtonProps={{ danger: true }}
                              cancelText="Скасувати"
                              onConfirm={() => remove(r.file)}
                            >
                              <Button size="small" type="text" danger icon={<DeleteOutlined />} loading={busy === `${r.key}:delete`} aria-label="Прибрати файл" />
                            </Popconfirm>,
                          ]),
                    ]
              }
            >
              <List.Item.Meta
                avatar={r.kind === 'kp' ? <FileTextOutlined className="po-files-icon po-files-icon-kp" /> : <PaperClipOutlined className="po-files-icon" />}
                title={
                  <span className="po-num">
                    {r.kind === 'kp' ? `КП № ${r.kp.numberLabel}${r.kp.onlyApproved ? ' — фінальне' : ''}` : r.file.originalFilename}{' '}
                    {r.kind === 'kp' ? (
                      <Tag bordered={false} color={r.kp.onlyApproved ? 'purple' : 'blue'}>
                        КП
                      </Tag>
                    ) : null}
                  </span>
                }
                description={
                  <Typography.Text type="secondary" className="po-num">
                    {formatDateTime(r.at)} · {r.by ?? '—'}
                    {r.kind === 'kp' ? ' · PDF і Excel — з незмінного знімка КП' : ` · ${sizeLabel(r.file.sizeBytes)}`}
                  </Typography.Text>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );
}
