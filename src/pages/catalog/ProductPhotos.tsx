// Фото товару: посилання з прайсу постачальника і файли, завантажені нами. Головне фото йде в списки й КП.
import { DeleteOutlined, StarFilled, StarOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Image, Popconfirm, Spin, Tooltip, Upload } from 'antd';
import type { ProductImageDto, UUID } from '@shared/types';
import { ds, errorMessage, qk, SERVER_ENABLED } from '@/data';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_BYTES = 10 * 1024 * 1024;

export function ProductPhotos({ productId }: { productId: UUID }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const images = useQuery({ queryKey: qk.productImages(productId), queryFn: () => ds.listProductImages(productId) });

  const refresh = () => {
    for (const queryKey of [qk.productImages(productId), qk.product(productId), qk.productsAll]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
  const fail = (e: unknown) => message.error(errorMessage(e));

  const upload = useMutation({
    mutationFn: (file: File) => ds.uploadProductImage(productId, file),
    onSuccess: () => {
      message.success('Фото додано');
      refresh();
    },
    onError: fail,
  });
  const setMain = useMutation({
    mutationFn: (imageId: UUID) => ds.updateProductImage(productId, imageId, { isMain: true }),
    onSuccess: refresh,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (imageId: UUID) => ds.deleteProductImage(productId, imageId),
    onSuccess: () => {
      message.success('Фото видалено');
      refresh();
    },
    onError: fail,
  });

  const list: ProductImageDto[] = images.data ?? [];
  return (
    <>
      <div className="po-cat-section po-cat-photos-head">
        <span>Фото</span>
        {SERVER_ENABLED ? (
          <Upload
            accept={ACCEPT}
            showUploadList={false}
            beforeUpload={(file) => {
              if (file.size > MAX_BYTES) message.error('Фото більше за 10 МБ — стисніть або виберіть менше');
              else upload.mutate(file as unknown as File);
              return Upload.LIST_IGNORE;
            }}
          >
            <Button size="small" icon={<UploadOutlined />} loading={upload.isPending}>
              Додати фото
            </Button>
          </Upload>
        ) : null}
      </div>

      {images.isPending ? (
        <Spin style={{ display: 'block', margin: '16px auto' }} />
      ) : images.isError ? (
        <Alert type="error" showIcon message="Не вдалося завантажити фото" description={errorMessage(images.error)} />
      ) : list.length === 0 ? (
        <span className="po-muted">Фото немає{SERVER_ENABLED ? ' — додайте файл або воно зʼявиться з прайсу постачальника' : ''}</span>
      ) : (
        <Image.PreviewGroup>
          <div className="po-cat-photos">
            {list.map((img) => (
              <div key={img.id} className="po-cat-photo">
                <Image src={img.url} alt={img.fileName ?? 'Фото товару'} />
                {img.isMain ? (
                  <Tooltip title="Головне фото — показується в списках і в КП">
                    <StarFilled className="po-cat-photo-main" />
                  </Tooltip>
                ) : null}
                {SERVER_ENABLED ? (
                  <div className="po-cat-photo-actions">
                    <Tooltip title={img.isMain ? 'Уже головне' : 'Зробити головним'}>
                      <Button
                        type="text"
                        size="small"
                        icon={img.isMain ? <StarFilled /> : <StarOutlined />}
                        disabled={img.isMain || setMain.isPending}
                        onClick={() => setMain.mutate(img.id)}
                      />
                    </Tooltip>
                    <Popconfirm title="Видалити фото?" okText="Видалити" cancelText="Скасувати" onConfirm={() => remove.mutate(img.id)}>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} disabled={remove.isPending} />
                    </Popconfirm>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Image.PreviewGroup>
      )}
    </>
  );
}
