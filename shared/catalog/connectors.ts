// Підключення автооновлення прайсу: у кожного постачальника своя вигрузка (формат, поля, доступ), тож і модуль свій.
// Новий постачальник з автооновленням — новий модуль у server/modules/price-updates/connectors і рядок тут.
// 'yml' — стандартний YML (Prom / Rozetka) для постачальників без власного модуля.
import type { PriceFeedAuth } from '../types';

export const FEED_CONNECTORS = ['sandi', 'sanwell', 'yml'] as const;
export type FeedConnector = (typeof FEED_CONNECTORS)[number];

export interface FeedConnectorInfo {
  /** Назва у формі й картці постачальника. */
  label: string;
  /** Що це за вигрузка — підказка у формі. */
  hint: string;
  /** Типові налаштування, які форма підставляє при виборі (їх можна змінити). */
  auth: PriceFeedAuth;
  hasPurchasePrice: boolean;
}

export const FEED_CONNECTOR_INFO: Record<FeedConnector, FeedConnectorInfo> = {
  sandi: {
    label: 'САНДІ — JSON',
    hint: 'Постійне посилання з кабінету b2b: закупівельна ціна, РРЦ, залишки, фото.',
    auth: 'none',
    hasPurchasePrice: true,
  },
  sanwell: {
    label: 'SANWELL — XML',
    hint: 'Вигрузка з токеном у заголовку (токен діє місяць): РРЦ, залишки діапазоном, фото; закупівельних цін немає.',
    auth: 'bearer',
    hasPurchasePrice: false,
  },
  yml: {
    label: 'Стандартний YML (Prom / Rozetka)',
    hint: 'Для постачальника без власного підключення. Ціна у YML одна: вкажіть нижче, закупівельна вона чи РРЦ.',
    auth: 'none',
    hasPurchasePrice: true,
  },
};

export function isFeedConnector(value: string | null | undefined): value is FeedConnector {
  return (FEED_CONNECTORS as readonly string[]).includes(value ?? '');
}
