// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_UNITS, normalizeUnit } from '@shared/parse';
import { aliasKey, normalizeAlias, normalizeAliases } from '../modules/units/units.rules';

describe('синоніми одиниці виміру', () => {
  it('зводяться до нижнього регістру', () => {
    expect(normalizeAliases('шт', ['ШТ.', 'Штука'])).toEqual(['шт.', 'штука']);
  });

  it('повтори прибираються', () => {
    expect(normalizeAliases('м', ['метр', 'МЕТР', 'метр'])).toEqual(['метр']);
  });

  it('сам код одиниці серед синонімів не потрібен', () => {
    expect(normalizeAliases('кг', ['кг', 'КГ', 'kg'])).toEqual(['kg']);
  });

  it('порожні значення й самі пробіли відкидаються', () => {
    expect(normalizeAliases('л', ['', '   ', 'літр'])).toEqual(['літр']);
  });

  it('внутрішні пробіли стискаються', () => {
    expect(normalizeAliases('м2', ['кв.  м', 'КВ. М'])).toEqual(['кв. м']);
  });

  it('базовий довідник зберігається без змін (повторне збереження нічого не псує)', () => {
    for (const unit of DEFAULT_UNITS) {
      expect(normalizeAliases(unit.code, unit.aliases)).toEqual(unit.aliases);
    }
  });

  it('збережені синоніми впізнаються розпізнавачем одиниць', () => {
    const aliases = normalizeAliases('м2', ['М²', 'Кв.м']);
    expect(normalizeUnit('м²', [{ code: 'м2', aliases }])).toBe('м2');
    expect(normalizeUnit('КВ. М', [{ code: 'м2', aliases }])).toBe('м2');
  });
});

describe('ключ порівняння синонімів між одиницями', () => {
  it('не зважає на регістр, пробіли й крапку в кінці', () => {
    expect(aliasKey('Шт.')).toBe('шт');
    expect(aliasKey('кв. м')).toBe(aliasKey('КВ.М'));
  });

  it('до запису синонім лишається читабельним', () => {
    expect(normalizeAlias('  Кв.  М ')).toBe('кв. м');
  });
});
