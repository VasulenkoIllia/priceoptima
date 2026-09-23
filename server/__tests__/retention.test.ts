import { describe, expect, it } from 'vitest';
import { yearsBefore } from '../modules/retention/retention.service';

describe('строки зберігання', () => {
  it('межа — та сама дата N років тому', () => {
    expect(yearsBefore(new Date('2026-09-23T03:30:00Z'), 3).toISOString()).toBe('2023-09-23T03:30:00.000Z');
    expect(yearsBefore(new Date('2028-02-29T00:00:00Z'), 1).toISOString()).toBe('2027-03-01T00:00:00.000Z');
  });
});
