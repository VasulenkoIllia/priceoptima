import type { AvailabilityStatus } from '../enums';

/** F20: наявність. */
export function checkStock(
  qty: number,
  stockQty: number | null,
  availability: AvailabilityStatus,
): { insufficient: boolean; outOfStock: boolean } {
  const outOfStock = availability === 'out_of_stock' || (stockQty != null && stockQty <= 0);
  const insufficient = stockQty != null && stockQty > 0 && qty > stockQty;
  return { insufficient, outOfStock };
}
