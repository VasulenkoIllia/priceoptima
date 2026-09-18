// Вкладка «Файли» (РЕД-16, КП-4): сформовані КП (PDF / Excel з незмінного знімка) і файли від клієнта.
// У прототипі нові файли не зберігаються — «Додати файл» лише показує, як це працюватиме.
import { FileExcelOutlined, FilePdfOutlined, FileTextOutlined, InboxOutlined, PaperClipOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { App, Button, List, Result, Spin, Tag, Tooltip, Typography, Upload } from 'antd';
import { useState } from 'react';
import { formatDateTime } from '@shared/format';
import type { KpDocumentDto } from '@shared/types';
import { ds, errorMessage, qk } from '@/data';
import { useRequestDoc } from '@/stores/requestDocStore';
import { downloadKpExcel } from '../kp/kpExcel';
import { downloadKpPdf } from '../kp/kpPdf';

interface FileRow {
  key: string;
  name: string;
  at: string;
  by: string | null;
  kp: KpDocumentDto | null;
}

export default function FilesTab() {
  const { message } = App.useApp();
  const requestId = useRequestDoc((s) => s.requestId);
  const doc = useRequestDoc((s) => s.doc);
  const readOnly = useRequestDoc((s) => s.readOnly);
  const kps = useQuery({ queryKey: qk.kps(requestId ?? ''), queryFn: () => ds.listKps(requestId!), enabled: !!requestId });
  const [busy, setBusy] = useState<string | null>(null);

  if (!doc) return null;
  if (kps.isError) return <Result status="warning" title="Не вдалося завантажити файли" subTitle={errorMessage(kps.error)} />;

  const download = async (kp: KpDocumentDto, kind: 'pdf' | 'xlsx') => {
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

  // демо-файли від клієнта (лист / Excel із заявкою) — лише в списку, вмісту в прототипі немає
  const clientFiles = Math.max(0, doc.meta.attachmentsCount - doc.meta.kpCount);
  const rows: FileRow[] = [
    ...(kps.data ?? []).map((k) => ({
      key: k.id,
      name: `КП № ${k.numberLabel}${k.onlyApproved ? ' — фінальне' : ''}`,
      at: k.createdAt,
      by: k.createdBy?.shortName ?? null,
      kp: k,
    })),
    ...Array.from({ length: clientFiles }, (_, i) => ({
      key: `client-${i}`,
      name: `Заявка клієнта${doc.refs.client ? ` ${doc.refs.client.name}` : ''}${i ? ` (${i + 1})` : ''}.xlsx`,
      at: doc.meta.createdAt,
      by: doc.refs.manager.shortName,
      kp: null,
    })),
  ];

  return (
    <div className="po-tab po-files">
      <Upload.Dragger
        className="po-files-drop"
        multiple={false}
        showUploadList={false}
        disabled={readOnly}
        beforeUpload={(file) => {
          message.info(`«${file.name}»: у робочій версії файл додасться до заявки. У прототипі файли не зберігаються.`, 5);
          return Upload.LIST_IGNORE;
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">Додати файл — перетягніть сюди або клацніть</p>
        <p className="ant-upload-hint">Лист чи Excel від клієнта, специфікація, рахунок постачальника — до 20 МБ</p>
      </Upload.Dragger>

      {kps.isPending ? (
        <Spin />
      ) : (
        <List<FileRow>
          bordered
          className="po-files-list"
          locale={{ emptyText: 'Файлів ще немає — сформовані КП з’являться тут автоматично' }}
          dataSource={rows}
          renderItem={(f) => (
            <List.Item
              actions={
                f.kp
                  ? [
                      <Button key="pdf" size="small" icon={<FilePdfOutlined />} loading={busy === `${f.key}:pdf`} onClick={() => void download(f.kp!, 'pdf')}>
                        PDF
                      </Button>,
                      <Button key="xlsx" size="small" icon={<FileExcelOutlined />} loading={busy === `${f.key}:xlsx`} onClick={() => void download(f.kp!, 'xlsx')}>
                        Excel
                      </Button>,
                    ]
                  : [
                      <Tooltip key="open" title="Демо-файл: у прототипі вміст файлів не зберігається">
                        <Button size="small" disabled>
                          Відкрити
                        </Button>
                      </Tooltip>,
                    ]
              }
            >
              <List.Item.Meta
                avatar={f.kp ? <FileTextOutlined className="po-files-icon po-files-icon-kp" /> : <PaperClipOutlined className="po-files-icon" />}
                title={
                  <span className="po-num">
                    {f.name}{' '}
                    {f.kp ? (
                      <Tag bordered={false} color={f.kp.onlyApproved ? 'purple' : 'blue'}>
                        КП
                      </Tag>
                    ) : (
                      <Tag bordered={false}>від клієнта</Tag>
                    )}
                  </span>
                }
                description={
                  <Typography.Text type="secondary" className="po-num">
                    {formatDateTime(f.at)} · {f.by ?? '—'}
                    {f.kp ? ' · PDF і Excel — з незмінного знімка КП' : ''}
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
