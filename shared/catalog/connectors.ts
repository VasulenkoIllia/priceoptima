// Підключення автооновлення прайсу: у кожного постачальника своя вигрузка (формат, поля, доступ), тож і модуль свій.
// Новий постачальник з автооновленням — новий модуль у server/modules/price-updates/connectors і рядок тут.
// 'yml' — стандартний YML (Rozetka) і вигрузка Prom (shop/items/item) для постачальників без власного модуля.
import type { PriceFeedAuth, PriceSourceKind } from '../types';

export const FEED_CONNECTORS = ['sandi', 'sanwell', 'yml'] as const;
export type FeedConnector = (typeof FEED_CONNECTORS)[number];

/**
 * Які ціни дає вигрузка: 'both' — вхідну і РРЦ; 'rrp' — лише РРЦ; 'one' — одну ціну, а вхідна вона чи РРЦ,
 * адміністратор вказує в джерелі прайсу сам (типового значення немає: помилка тут тихо псує ціни).
 */
export type FeedPrices = 'both' | 'rrp' | 'one';

export interface FeedConnectorInfo {
  /** Назва у формі й картці постачальника. */
  label: string;
  /** Що це за вигрузка — підказка у формі. */
  hint: string;
  /** Типовий доступ, який форма підставляє при виборі (його можна змінити). */
  auth: PriceFeedAuth;
  prices: FeedPrices;
}

export const FEED_CONNECTOR_INFO: Record<FeedConnector, FeedConnectorInfo> = {
  sandi: {
    label: 'САНДІ (JSON)',
    hint: 'Постійне посилання з кабінету b2b: закупівельна ціна, РРЦ, залишки, фото.',
    auth: 'none',
    prices: 'both',
  },
  sanwell: {
    label: 'SANWELL (XML)',
    hint: 'Вигрузка з токеном у заголовку (токен діє місяць): РРЦ, залишки діапазоном, фото; закупівельних цін немає.',
    auth: 'bearer',
    prices: 'rrp',
  },
  yml: {
    label: 'Стандартний YML (Prom / Rozetka)',
    hint: 'Для постачальника без власного підключення: вигрузка YML або Prom. Ціна у вигрузці одна: вкажіть нижче, закупівельна вона чи РРЦ.',
    auth: 'none',
    prices: 'one',
  },
};

export function isFeedConnector(value: string | null | undefined): value is FeedConnector {
  return (FEED_CONNECTORS as readonly string[]).includes(value ?? '');
}

/**
 * Посилання оновлює вхідні ціни: лише в режимі «За посиланням», коли у вигрузці вони є й ціну вказано як вхідну.
 * У «Гібриді» вхідні ціни тільки з файлу, а ціна з посилання — РРЦ (і для нових товарів теж).
 */
export function linkUpdatesPurchasePrice(kind: PriceSourceKind, connector: string | null, hasPurchasePrice: boolean): boolean {
  if (kind !== 'auto' || !hasPurchasePrice) return false;
  return !isFeedConnector(connector) || FEED_CONNECTOR_INFO[connector].prices !== 'rrp';
}
