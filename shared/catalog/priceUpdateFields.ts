// Що оновлює ручне оновлення прайсу (з вигрузки «Оновити вручну…» чи файлом) — рішення власника 28.09.
// Ціни й наявність: відмічене оновлюється так само, як в автооновленні; зняте — не чіпається.
// Опис товару: відмічене замінюється значенням із прайсу; не відмічене — як в автооновленні (порожнє заповнюється,
// заповнене не змінюється, різниця у звіті). Код товару — ідентифікатор, у виборі його немає.

export const PRICE_UPDATE_FIELDS = [
  'purchasePrice',
  'rrp',
  'stock',
  'newProducts',
  'markMissing',
  'nameWork',
  'brand',
  'categoryPath',
  'barcode',
  'unitCode',
  'multiplicity',
  'minOrderQty',
  'images',
  'name1c',
] as const;
export type PriceUpdateField = (typeof PRICE_UPDATE_FIELDS)[number];

/** Ціни й наявність — відмічене оновлюється, як в автооновленні. */
export const PRICE_BASE_FIELDS = ['purchasePrice', 'rrp', 'stock', 'newProducts', 'markMissing'] as const satisfies readonly PriceUpdateField[];

/** Опис товару, який можна замінити значенням із прайсу. */
export const PRICE_REPLACE_FIELDS = [
  'nameWork',
  'brand',
  'categoryPath',
  'barcode',
  'unitCode',
  'multiplicity',
  'minOrderQty',
  'images',
] as const satisfies readonly PriceUpdateField[];
export type PriceReplaceField = (typeof PRICE_REPLACE_FIELDS)[number];

/** Автооновлення за посиланням і стартовий вибір «Оновити вручну…»: ціни, наявність, нові, зниклі. */
export const FEED_DEFAULT_FIELDS: readonly PriceUpdateField[] = ['purchasePrice', 'rrp', 'stock', 'newProducts', 'markMissing'];
/** Стартовий вибір для файлу: ціни, наявність, нові (зниклі у файлі — лише свідомо, як і раніше). */
export const FILE_DEFAULT_FIELDS: readonly PriceUpdateField[] = ['purchasePrice', 'rrp', 'stock', 'newProducts'];

export const PRICE_UPDATE_FIELD_LABELS: Record<PriceUpdateField, string> = {
  purchasePrice: 'Вхідна ціна',
  rrp: 'РРЦ',
  stock: 'Наявність і залишок',
  newProducts: 'Додати нові товари',
  markMissing: 'Позначити зниклі («немає у прайсі»)',
  nameWork: 'Назва',
  brand: 'Бренд',
  categoryPath: 'Категорія',
  barcode: 'Штрихкод',
  unitCode: 'Одиниця',
  multiplicity: 'Кратність',
  minOrderQty: 'Мін. замовлення',
  images: 'Фото',
  name1c: 'Назва 1С = робоча назва (лише де порожня)',
};

/** Найдовша назва 1С (як у картці товару): довша робоча назва в назву 1С не копіюється. */
export const NAME1C_MAX_LENGTH = 300;
