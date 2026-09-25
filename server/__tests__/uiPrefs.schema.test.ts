// Налаштування інтерфейсу користувача: лише відомі поля з межами (правки замовника 25.09 п.1).
import { describe, expect, it } from 'vitest';
import { uiPrefsSchema } from '../modules/users/users.schemas';

describe('uiPrefsSchema', () => {
  it('відомі поля проходять; ширина округлюється; невідомі поля відкидаються', () => {
    const parsed = uiPrefsSchema.parse({
      columnWidths: { 'sourcing:block:name': 320.6, 'markup:client': 360 },
      editorMode: 'comparison',
      siderCollapsed: true,
      importMaps: { 'найменування|к-сть': { name: 1, unit: null, qty: 3, note: 4 } },
      щосьНове: 1,
    });
    expect(parsed).toEqual({
      columnWidths: { 'sourcing:block:name': 321, 'markup:client': 360 },
      editorMode: 'comparison',
      siderCollapsed: true,
      importMaps: { 'найменування|к-сть': { name: 1, unit: null, qty: 3, note: 4 } },
    });
    expect(uiPrefsSchema.parse({})).toEqual({});
  });

  it('межі: ширина 20–4000, невідомий режим, забагато колонок чи шаблонів — відмова', () => {
    expect(uiPrefsSchema.safeParse({ columnWidths: { a: 5 } }).success).toBe(false);
    expect(uiPrefsSchema.safeParse({ columnWidths: { a: 99999 } }).success).toBe(false);
    expect(uiPrefsSchema.safeParse({ columnWidths: { a: '300' } }).success).toBe(false);
    expect(uiPrefsSchema.safeParse({ editorMode: 'kanban' }).success).toBe(false);
    expect(uiPrefsSchema.parse({ columnOrder: { 'sourcing:block': ['net', 'sku'] } })).toEqual({ columnOrder: { 'sourcing:block': ['net', 'sku'] } });
    expect(uiPrefsSchema.safeParse({ columnOrder: { markup: 'rrp,qty' } }).success).toBe(false);
    expect(uiPrefsSchema.safeParse({ columnOrder: { markup: Array.from({ length: 101 }, (_, i) => `c${i}`) } }).success).toBe(false);
    const many = Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`k${i}`, 100]));
    expect(uiPrefsSchema.safeParse({ columnWidths: many }).success).toBe(false);
    const maps = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`h${i}`, { name: 0, unit: null, qty: 1, note: null }]));
    expect(uiPrefsSchema.safeParse({ importMaps: maps }).success).toBe(false);
  });
});
