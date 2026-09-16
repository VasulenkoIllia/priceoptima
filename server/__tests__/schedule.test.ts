// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { msUntilDaily } from '../jobs/schedule';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe('щоденний запуск о 05:45 за Києвом', () => {
  it('до часу запуску лишається різниця в межах доби', () => {
    // 02:00 UTC = 05:00 у Києві (літній час) → до 05:45 лишилось 45 хвилин
    expect(msUntilDaily(new Date('2026-09-16T02:00:00.000Z'), 5, 45)).toBe(45 * MINUTE);
  });

  it('після часу запуску чекаємо наступного дня', () => {
    // 03:00 UTC = 06:00 у Києві → до 05:45 наступного дня 23 год 45 хв
    expect(msUntilDaily(new Date('2026-09-16T03:00:00.000Z'), 5, 45)).toBe(23 * HOUR + 45 * MINUTE);
  });

  it('узимку зсув київського часу інший, а розрахунок той самий', () => {
    // 03:00 UTC = 05:00 у Києві (зимовий час) → 45 хвилин
    expect(msUntilDaily(new Date('2026-01-15T03:00:00.000Z'), 5, 45)).toBe(45 * MINUTE);
  });

  it('секунди враховуються', () => {
    // 05:44:30 за Києвом → до запуску пів хвилини
    expect(msUntilDaily(new Date('2026-09-16T02:44:30.000Z'), 5, 45)).toBe(30_000);
  });

  it('рівно в час запуску чекаємо наступної доби, а не запускаємо двічі', () => {
    expect(msUntilDaily(new Date('2026-09-16T02:45:00.000Z'), 5, 45)).toBe(24 * HOUR);
  });

  it('опівночі за Києвом до ранкового запуску майже шість годин', () => {
    expect(msUntilDaily(new Date('2026-09-15T21:00:00.000Z'), 5, 45)).toBe(5 * HOUR + 45 * MINUTE);
  });
});
