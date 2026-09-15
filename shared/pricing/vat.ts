import { round2, round4 } from './money';

/** k = 1 + v/100 */
export function vatFactor(vatRatePct: number): number {
  return 1 + vatRatePct / 100;
}

export function netToGross(net: number, vatRatePct: number, decimals: 2 | 4 = 4): number {
  const v = net * vatFactor(vatRatePct);
  return decimals === 2 ? round2(v) : round4(v);
}

export function grossToNet(gross: number, vatRatePct: number, decimals: 2 | 4 = 4): number {
  const v = gross / vatFactor(vatRatePct);
  return decimals === 2 ? round2(v) : round4(v);
}

/** Ф1: введена ціна → вхід без ПДВ (4 знаки). */
export function normalizeInputPrice(value: number, includesVat: boolean, vatRatePct: number): number {
  return round4(includesVat ? value / vatFactor(vatRatePct) : value);
}

/** Ф1: введена РРЦ → РРЦ з ПДВ (4 знаки). */
export function normalizeInputRrp(value: number, includesVat: boolean, vatRatePct: number): number {
  return round4(includesVat ? value : value * vatFactor(vatRatePct));
}

/** F2: показ вхідної ціни у форматі постачальника (з ПДВ, якщо прайс з ПДВ). */
export function displayInputPrice(net: number, includesVat: boolean, vatRatePct: number): number {
  return includesVat ? round4(net * vatFactor(vatRatePct)) : net;
}
