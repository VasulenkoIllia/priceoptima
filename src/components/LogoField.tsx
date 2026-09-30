// Логотип для бланка КП і списків: файл зменшуємо в браузері й зберігаємо як зображення в самій картці,
// щоб бланк не залежав від зовнішніх посилань.
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { App, Button, Upload } from 'antd';
import { shrinkImageToDataUrl } from '@/lib/images';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/svg+xml';
const MAX_BYTES = 5 * 1024 * 1024;
/** Сторона, до якої зменшуємо логотип (логотип постачальника — маленький значок). */
const MAX_SIDE = 320;
/** Межа сервера для логотипа, символів data URL. */
const MAX_DATA_URL = 300_000;
/** Менша сторона, нижче якої вже не зменшуємо. */
const MIN_SIDE = 160;

/** Зменшений логотип у межах сервера: складна картинка в PNG важить більше — зменшуємо ще. null — не влазить. */
async function logoDataUrl(file: File, maxSide: number): Promise<string | null> {
  let side = maxSide;
  let url = await shrinkImageToDataUrl(file, side);
  while (url.length > MAX_DATA_URL && side > MIN_SIDE && file.type !== 'image/svg+xml') {
    side = Math.round(side * 0.75);
    url = await shrinkImageToDataUrl(file, side);
  }
  return url.length > MAX_DATA_URL ? null : url;
}

export interface LogoFieldProps {
  /** value і onChange підставляє Form.Item. */
  value?: string | null;
  onChange?: (value: string | null) => void;
  /** Підпис під кнопкою. */
  hint?: string;
  /** Більша сторона після зменшення, пікселі (логотип КП — 640, щоб у друку був чітким). */
  maxSide?: number;
}

export function LogoField({ value = null, onChange, hint, maxSide = MAX_SIDE }: LogoFieldProps) {
  const { message } = App.useApp();

  const pick = async (file: File) => {
    if (file.size > MAX_BYTES) {
      message.error('Файл більший за 5 МБ, виберіть менший');
      return;
    }
    try {
      const url = await logoDataUrl(file, maxSide);
      if (url) onChange?.(url);
      else message.error('Зображення завелике для логотипа, виберіть простіше (PNG з прозорим фоном або SVG)');
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
