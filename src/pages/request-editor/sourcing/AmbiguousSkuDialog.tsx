// Артикул без однозначного збігу: кілька товарів з тим самим артикулом або лише схожі (за префіксом) — вибір потрібного.
import { Button, List, Modal, Tag, Typography } from 'antd';
import { AVAILABILITY_LABELS, CURRENCY_LABELS } from '@shared/enums';
import { formatMoney, formatQty } from '@shared/format';
import { useRequestDoc } from '@/stores/requestDocStore';
import { isSimilarMiss } from './rows';
import { useSourcingUi } from './sourcingUiStore';
import { supplierOfBlock } from './useSourcingActions';

export function AmbiguousSkuDialog() {
  const target = useSourcingUi((s) => s.ambiguous);
  const close = useSourcingUi((s) => s.openAmbiguous);
  const setMiss = useSourcingUi((s) => s.setMiss);
  const openCreateProduct = useSourcingUi((s) => s.openCreateProduct);
  const setOfferFromProduct = useRequestDoc((s) => s.setOfferFromProduct);
  const readOnly = useRequestDoc((s) => s.readOnly);
  const candidates = target?.miss.candidates ?? [];
  const supplier = target ? supplierOfBlock(target.blockId) : null;
  const similar = target ? isSimilarMiss(target.miss) : false;
  const sku = target?.miss.sku ?? '';
  return (
    <Modal
      open={!!target}
      title={similar ? `Артикул «${sku}» не знайдено: схожі товари` : `Кілька товарів з артикулом «${sku}»`}
      footer={
        similar && target ? (
          <Button
            disabled={readOnly}
            onClick={() => {
              close(null);
              openCreateProduct({ lineId: target.lineId, blockId: target.blockId, sku });
            }}
          >
            Створити товар «{sku}»
          </Button>
        ) : null
      }
      width={640}
      onCancel={() => close(null)}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        {similar
          ? `Точного збігу в каталозі ${supplier?.name ?? 'постачальника'} немає. Оберіть схожий товар або створіть новий.`
          : `Оберіть товар ${supplier ? `постачальника ${supplier.name}` : ''} для рядка.`}
      </Typography.Paragraph>
      <List
        size="small"
        dataSource={candidates}
        renderItem={(p) => (
          <List.Item
            actions={[
              <Button
                key="pick"
                size="small"
                type="primary"
                disabled={readOnly || !target}
                onClick={() => {
                  if (!target) return;
                  setOfferFromProduct(target.lineId, target.blockId, p);
                  setMiss(target.lineId, target.blockId, null);
                  close(null);
                }}
              >
                Обрати
              </Button>,
            ]}
          >
            <List.Item.Meta
              title={
                <span>
                  <span className="po-num">{p.sku}</span> · {p.nameWork}
                </span>
              }
              description={
                <span className="po-num">
                  {formatMoney(p.purchasePrice)} {CURRENCY_LABELS[p.currency]} · {p.unitCode} · кратність {formatQty(p.multiplicity)} ·{' '}
                  <Tag bordered={false}>{AVAILABILITY_LABELS[p.availability]}</Tag>
                </span>
              }
            />
          </List.Item>
        )}
      />
    </Modal>
  );
}
