// «Детальніше» → «Джерело прайсу»: коли востаннє оновлювалось посиланням і файлом, саме посилання й що чим оновлюється.
// Посилання (у ньому буває ключ доступу) сервер віддає лише адміністратору; менеджер бачить сайт вигрузки.
import { useQuery } from '@tanstack/react-query';
import { Descriptions, Typography } from 'antd';
import type { SupplierPriceSource, UUID } from '@shared/types';
import { ds, qk } from '@/data';
import { lastRunLabel, sourceFieldRows, sourceLines, viaLink } from './supplierView';

export interface PriceSourceDetailsProps {
  supplierId: UUID;
  source: SupplierPriceSource;
  isAdmin: boolean;
}

export function PriceSourceDetails({ supplierId, source, isAdmin }: PriceSourceDetailsProps) {
  const byLink = viaLink(source.kind);
  // той самий запит, що й у формі «Налаштувати»: після збереження посилання тут оновлюється само
  const settings = useQuery({
    queryKey: qk.supplierPriceSource(supplierId),
    queryFn: () => ds.getSupplierPriceSource(supplierId),
    enabled: isAdmin && byLink,
  });
  // вимкнений запит усе одно віддає кеш: якщо у вкладці раніше був адміністратор, посилання менеджеру не показуємо
  const url = isAdmin ? settings.data?.url : undefined;
  const rows = sourceFieldRows(source).map((r) => ({ key: r.field, label: r.field, children: r.how }));

  return (
    <>
      <span className="po-muted">
        {sourceLines(source)
          .map((line) => `${line.label}: ${lastRunLabel(line)}`)
          .join(' · ')}
      </span>
      {byLink && (url || source.host) ? (
        <span className="po-sup-source-url">
          <span className="po-muted">Посилання:</span>
          {url ? (
            <Typography.Text copyable={{ text: url, tooltips: ['Скопіювати посилання', 'Посилання скопійовано'] }} ellipsis={{ tooltip: url }}>
              {url}
            </Typography.Text>
          ) : (
            <span>{source.host}</span>
          )}
        </span>
      ) : null}
      {source.note ? <span className="po-muted">{source.note}</span> : null}
      <Descriptions title="Що оновлюється" column={1} size="small" items={rows} styles={{ label: { width: 190 } }} />
    </>
  );
}
