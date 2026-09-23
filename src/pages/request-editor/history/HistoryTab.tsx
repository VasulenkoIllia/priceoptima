// Вкладка «Історія»: журнал подій заявки — створення, статус, КП, погодження, зміни цін у заявці, копія, файли, передача редагування.
import {
  CheckCircleOutlined,
  CopyOutlined,
  DollarOutlined,
  FileTextOutlined,
  LockOutlined,
  PaperClipOutlined,
  PercentageOutlined,
  PlusCircleOutlined,
  ShopOutlined,
  SwapOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Empty, Spin, Timeline, Typography } from 'antd';
import { useEffect, type ReactNode } from 'react';
import { formatDateTime } from '@shared/format';
import type { RequestEventDto } from '@shared/types';
import { ds, qk } from '@/data';
import { useRequestDoc } from '@/stores/requestDocStore';
import { BRAND_COLOR, SEMANTIC_COLORS } from '@/theme';
import { LoadError } from '@/components';

const KIND: Record<RequestEventDto['kind'], { icon: ReactNode; color: string; label: string }> = {
  created: { icon: <PlusCircleOutlined />, color: BRAND_COLOR, label: 'Створення' },
  status_change: { icon: <SwapOutlined />, color: BRAND_COLOR, label: 'Статус' },
  lines_change: { icon: <UnorderedListOutlined />, color: '#607D8B', label: 'Позиції' },
  sourcing_change: { icon: <ShopOutlined />, color: '#00838F', label: 'Підбір' },
  markup_change: { icon: <PercentageOutlined />, color: '#AD6800', label: 'Націнка' },
  price_update: { icon: <DollarOutlined />, color: SEMANTIC_COLORS.warning, label: 'Ціна в заявці' },
  kp_created: { icon: <FileTextOutlined />, color: '#6A1B9A', label: 'КП' },
  approval: { icon: <CheckCircleOutlined />, color: SEMANTIC_COLORS.min, label: 'Погодження' },
  copy: { icon: <CopyOutlined />, color: '#607D8B', label: 'Копія' },
  lock_force: { icon: <LockOutlined />, color: SEMANTIC_COLORS.error, label: 'Редагування' },
  files: { icon: <PaperClipOutlined />, color: '#607D8B', label: 'Файли' },
};

export default function HistoryTab() {
  const queryClient = useQueryClient();
  const requestId = useRequestDoc((s) => s.requestId);
  const dirty = useRequestDoc((s) => s.dirty);
  const savedAt = useRequestDoc((s) => s.save.savedAt);
  const history = useQuery({
    queryKey: qk.history(requestId ?? ''),
    queryFn: () => ds.getRequestHistory(requestId!),
    enabled: !!requestId,
  });

  // після автозбереження (зміна ціни, погодження) — перечитати журнал
  useEffect(() => {
    if (requestId && savedAt) void queryClient.invalidateQueries({ queryKey: qk.history(requestId) });
  }, [queryClient, requestId, savedAt]);

  if (history.isError) return <LoadError status="warning" title="Не вдалося завантажити історію" error={history.error} onRetry={history.refetch} />;
  const events = history.data?.events ?? [];

  return (
    <div className="po-tab po-history">
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        Журнал доповнюється автоматично: позиції, постачальники й курси, ✔ і «не підходить», націнка, оновлення цін з прайсу, КП, погодження,
        статуси, копіювання. Сусідні дрібні зміни одного користувача зливаються в один запис.
      </Typography.Paragraph>
      {dirty ? <Alert type="info" showIcon message="Є незбережені зміни: вони з’являться тут після автозбереження" style={{ marginBottom: 12 }} /> : null}
      {history.isPending ? (
        <Spin />
      ) : events.length ? (
        <Timeline
          items={events.map((e) => {
            const k = KIND[e.kind];
            return {
              key: e.id,
              color: k.color,
              dot: <span style={{ color: k.color, fontSize: 15 }}>{k.icon}</span>,
              children: (
                <div className="po-history-item">
                  <div className="po-history-meta po-num">
                    {formatDateTime(e.at)} · {e.user?.shortName ?? 'автоматично'} · {k.label}
                  </div>
                  <div>{e.summary}</div>
                </div>
              ),
            };
          })}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Подій ще немає" />
      )}
    </div>
  );
}
