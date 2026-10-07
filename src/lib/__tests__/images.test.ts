import { describe, expect, it } from 'vitest';
import { trimmedPlacementIn } from '../images';

describe('обрізаний логотип у місці (правки замовника 07.10)', () => {
  it('у масштабі всього малюнка з полями: бічних полів немає, малюнок не більшає, висота й положення ті самі', () => {
    // 1000 × 500 з полями, сам малюнок 600 × 200 з верхнім полем 100; весь вписався б у 180 × 64 з масштабом 0,128
    const t = { dataUrl: '', width: 600, height: 200, sourceWidth: 1000, sourceHeight: 500, top: 100 };
    const p = trimmedPlacementIn(t, [180, 64]);
    expect(p.width).toBeCloseTo(76.8);
    expect(p.height).toBeCloseTo(25.6);
    expect(p.top).toBeCloseTo(12.8);
    expect(p.bottom).toBeCloseTo(25.6);
    expect(p.top + p.height + p.bottom).toBeCloseTo(64);
  });

  it('без полів — як вписаний у місце, без відступів', () => {
    const t = { dataUrl: '', width: 640, height: 216, sourceWidth: 640, sourceHeight: 216, top: 0 };
    expect(trimmedPlacementIn(t, [180, 64])).toEqual({ width: 180, height: 60.75, top: 0, bottom: 0 });
  });
});
