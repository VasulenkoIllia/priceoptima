// «Створити товар» з вікна вибору (§6.7): товар у каталозі постачальника + пропозиція в блоці рядка.
import { App } from 'antd';
import type { ProductDetail, UUID } from '@shared/types';
import { DataSourceError } from '@/data/errors';
import { useRequestDoc } from '@/stores/requestDocStore';
import { NewProductDialog, type CreateProductInitial } from './NewProductDialog';

export type { CreateProductInitial };

export interface CreateProductDialogProps {
  open: boolean;
  lineId: UUID | null;
  /** Блок, куди стане пропозиція; null — блок постачальника знайдеться/створиться автоматично. */
  blockId: UUID | null;
  supplierId: UUID | null;
  initial?: CreateProductInitial;
  onClose(): void;
  onCreated?(product: ProductDetail): void;
}

export function CreateProductDialog({ open, lineId, blockId, supplierId, initial, onClose, onCreated }: CreateProductDialogProps) {
  const { message } = App.useApp();
  const suppliers = useRequestDoc((s) => s.suppliers);
  const createProductAndOffer = useRequestDoc((s) => s.createProductAndOffer);

  return (
    <NewProductDialog
      open={open}
      suppliers={suppliers}
      supplierId={supplierId}
      supplierLocked={!!blockId}
      initial={initial}
      okText="Створити і додати в заявку"
      netHint="піде в заявку"
      intro="Товар з'явиться в каталозі постачальника з позначкою «вручну» (прайс його не оновлює, ціну змінюють вручну), а в рядку заявки з'явиться пропозиція з цим товаром."
      onSubmit={(input) =>
        lineId ? createProductAndOffer(lineId, blockId, input) : Promise.reject(new DataSourceError('NOT_FOUND', 'Рядок заявки видалено'))
      }
      onClose={onClose}
      onCreated={(product) => {
        message.success(`Товар ${product.sku} додано в каталог і в заявку`);
        onCreated?.(product);
      }}
    />
  );
}
