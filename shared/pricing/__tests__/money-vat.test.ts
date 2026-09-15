import { describe, expect, it } from 'vitest';
import { pct, round2, round4, round6, roundHalfUp, roundSale, sumMoney } from '../money';
import { displayInputPrice, grossToNet, netToGross, normalizeInputPrice, normalizeInputRrp, vatFactor } from '../vat';

describe('§6.2 округлення half-up (T17)', () => {
  it('без артефактів double', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round4(464.50799999)).toBe(464.508);
  });

  it('шум множення гаситься: 8.602 × 45 = 387.09', () => {
    expect(8.602 * 45).not.toBe(387.09);
    expect(round4(8.602 * 45)).toBe(387.09);
  });

  it('без -0, NaN/Infinity як є, round6', () => {
    expect(Object.is(round2(-0.001), 0)).toBe(true);
    expect(roundHalfUp(Number.NaN, 2)).toBeNaN();
    expect(roundHalfUp(Infinity, 2)).toBe(Infinity);
    expect(round6(44.5526 * 1.01)).toBe(44.998126);
  });

  it('roundSale: копійки / цілі', () => {
    expect(roundSale(464.508, 'kopecks')).toBe(464.51);
    expect(roundSale(464.508, 'integer')).toBe(465);
    expect(roundSale(464.5, 'integer')).toBe(465);
  });

  it('sumMoney ігнорує null і округлює', () => {
    expect(sumMoney([0.1, 0.2, null, undefined])).toBe(0.3);
    expect(sumMoney([])).toBe(0);
  });

  it('pct: base 0 → null', () => {
    expect(pct(30, 120)).toBe(25);
    expect(pct(94, 564)).toBe(16.6667);
    expect(pct(1, 0)).toBeNull();
  });
});

describe('F2 ПДВ і нормалізація введеної ціни', () => {
  it('vatFactor, netToGross, grossToNet', () => {
    expect(vatFactor(20)).toBe(1.2);
    expect(netToGross(387.09, 20)).toBe(464.508);
    expect(netToGross(387.09, 20, 2)).toBe(464.51);
    expect(grossToNet(180, 20)).toBe(150);
    expect(grossToNet(18153.85, 20, 2)).toBe(15128.21);
  });

  it('Ф1: вхід з ПДВ ÷ 1.2; РРЦ без ПДВ × 1.2 (4 знаки)', () => {
    expect(normalizeInputPrice(10.3224, true, 20)).toBe(8.602);
    expect(normalizeInputPrice(10.74, true, 20)).toBe(8.95);
    expect(normalizeInputRrp(15.25, false, 20)).toBe(18.3);
    expect(normalizeInputRrp(18.3, true, 20)).toBe(18.3);
    expect(normalizeInputRrp(0.12345, false, 20)).toBe(0.1481);
  });

  it('normalizeInputPrice / displayInputPrice', () => {
    expect(normalizeInputPrice(120, true, 20)).toBe(100);
    expect(normalizeInputPrice(99.99, true, 20)).toBe(83.325);
    expect(normalizeInputPrice(100, false, 20)).toBe(100);
    expect(displayInputPrice(100, true, 20)).toBe(120);
    expect(displayInputPrice(83.325, true, 20)).toBe(99.99);
    expect(displayInputPrice(100, false, 20)).toBe(100);
  });
});
