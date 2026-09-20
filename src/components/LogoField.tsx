// Логотип для бланка КП і списків: файл зменшуємо в браузері й зберігаємо як зображення в самій картці,
// щоб бланк не залежав від зовнішніх посилань.
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { App, Button, Upload } from 'antd';
import { shrinkImageToDataUrl } from '@/lib/images';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/svg+xml';
const MAX_BYTES = 5 * 1024 * 1024;
/** Сторона, до якої зменшуємо логотип: у бланку він друкується не більшим за 120 pt. */
const MAX_SIDE = 320;

export interface LogoFieldProps {
  /** value і onChange підставляє Form.Item. */
  value?: string | null;
  onChange?: (value: string | null) => void;
  /** Підпис під кнопкою. */
  hint?: string;
}

export function LogoField({ value = null, onChange, hint }: LogoFieldProps) {
  const { message } = App.useApp();

  const pick = async (file: File) => {
    if (file.size > MAX_BYTES) {
      message.error('Файл більший за 5 МБ — виберіть менший');
      return;
    }
    try {
      onChange?.(await shrinkImageToDataUrl(file, MAX_SIDE));
    } catch {
      message.error('Не вдалося прочитати зображення');
    }
  };

  return (
    <div className="po-logo-field">
      <div className="po-logo-field-box">{value ? <img src={value} alt="Логотип" /> : <span className="po-muted">немає</span>}</div>
      <div className="po-logo-field-actions">
        <Upload
          accept={ACCEPT}
          showUploadList={false}
          beforeUpload={(file) => {
            void pick(file as unknown as File);
            return Upload.LIST_IGNORE;
          }}
        >
          <Button size="small" icon={<UploadOutlined />}>
            {value ? 'Замінити' : 'Завантажити'}
          </Button>
        </Upload>
        {value ? (
          <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onChange?.(null)}>
            Прибрати
          </Button>
        ) : null}
        {hint ? <div className="po-muted po-logo-field-hint">{hint}</div> : null}
      </div>
    </div>
  );
}
