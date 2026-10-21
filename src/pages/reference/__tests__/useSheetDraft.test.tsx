// Автозбереження аркуша «Довідника» (правки замовника 21.10, п.11): пауза, версія, чужі правки, помилки, закриття аркуша.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REFERENCE_MAX_CELL, REFERENCE_MAX_SHEET_CHARS } from '@shared/reference/limits';
import type { ReferenceSheetDto, ReferenceSheetInput } from '@shared/types';
import { DataSourceError, ds } from '@/data';
import { setCell } from '../sheet';
import { useSheetDraft } from '../useSheetDraft';

vi.mock('@/data', async () => {
  const errors = await import('@/data/errors');
  const { qk } = await import('@/data/queryKeys');
  return { ...errors, qk, ds: { saveReferenceSheet: vi.fn(), getReferenceSheet: vi.fn() } };
});

const save = vi.mocked(ds.saveReferenceSheet);
const load = vi.mocked(ds.getReferenceSheet);
const DEBOUNCE = 800;

const sheet = (patch: Partial<ReferenceSheetDto> = {}): ReferenceSheetDto => ({
  id: '00000000-0000-4000-8000-000000000001',
  version: 1,
  title: 'Сайти ТМ',
  sortOrder: 0,
  columns: [{ id: 'c1', title: 'Бренд' }],
  rows: [{ id: 'r1', cells: {} }],
  updatedAt: '2026-10-21T10:00:00.000Z',
  updatedBy: null,
  ...patch,
});

/** Відповідь сервера на збереження: версія +1, вміст — надісланий. */
const savedFrom = (input: ReferenceSheetInput): ReferenceSheetDto => sheet({ ...input, version: (input.version ?? 0) + 1 });

function setup(onConflict = vi.fn()) {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(({ s }) => useSheetDraft(s, DEBOUNCE, onConflict), { wrapper, initialProps: { s: sheet() } });
  return { ...hook, onConflict };
}

const type = (result: ReturnType<typeof setup>['result'], text: string) =>
  act(async () => {
    result.current.update((s) => setCell(s, 'r1', 'c1', text));
  });
const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers();
  save.mockReset();
  load.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('useSheetDraft', () => {
  it('зберігає після паузи цілим аркушем із версією; наступне збереження — з новою версією', async () => {
    save.mockImplementation(async (_id, input) => savedFrom(input));
    const { result } = setup();
    await type(result, 'Бренд А');
    expect(result.current.dirty).toBe(true);
    await wait(DEBOUNCE - 1);
    expect(save).not.toHaveBeenCalled();
    await wait(1);
    expect(save).toHaveBeenCalledWith(sheet().id, expect.objectContaining({ version: 1, rows: [{ id: 'r1', cells: { c1: 'Бренд А' } }] }));
    expect([result.current.saveState, result.current.dirty]).toEqual(['saved', false]);

    await type(result, 'Бренд Б');
    await wait(DEBOUNCE);
    expect(save).toHaveBeenLastCalledWith(sheet().id, expect.objectContaining({ version: 2 }));
  });

  it('чужі правки (VERSION_CONFLICT): пояснення, завантаження актуальної версії замість своєї, далі збереження з її версією', async () => {
    save.mockRejectedValueOnce(new DataSourceError('VERSION_CONFLICT', 'Картку змінив Коваль О.В.'));
    load.mockResolvedValueOnce(sheet({ version: 5, rows: [{ id: 'r1', cells: { c1: 'від колеги' } }] }));
    const { result, onConflict } = setup();
    await type(result, 'моя правка');
    await wait(DEBOUNCE);
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(result.current.content.rows[0].cells).toEqual({ c1: 'від колеги' });
    expect(result.current.dirty).toBe(false);

    save.mockImplementation(async (_id, input) => savedFrom(input));
    await type(result, 'ще раз');
    await wait(DEBOUNCE);
    expect(save).toHaveBeenLastCalledWith(sheet().id, expect.objectContaining({ version: 5 }));
  });

  it('відмова сервера (помилка в даних) не повторюється сама; «Повторити» — так', async () => {
    save.mockRejectedValue(new DataSourceError('VALIDATION_ERROR', 'Забагато тексту'));
    const { result } = setup();
    await type(result, 'x');
    await wait(DEBOUNCE);
    await wait(60_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect([result.current.saveState, result.current.error, result.current.dirty]).toEqual(['error', 'Забагато тексту', true]);

    save.mockImplementation(async (_id, input) => savedFrom(input));
    await act(async () => result.current.retry());
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.saveState).toBe('saved');
  });

  it('короткий збій мережі — повтор із наростаючою паузою', async () => {
    save.mockRejectedValueOnce(new DataSourceError('INTERNAL', 'Сервер недоступний, перевірте зʼєднання', undefined, true));
    save.mockImplementation(async (_id, input) => savedFrom(input));
    const { result } = setup();
    await type(result, 'x');
    await wait(DEBOUNCE);
    expect(save).toHaveBeenCalledTimes(1);
    await wait(DEBOUNCE * 2);
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.saveState).toBe('saved');
  });

  it('аркуш закрили з незбереженим: одне збереження одразу, без повторів після збою', async () => {
    save.mockRejectedValue(new DataSourceError('INTERNAL', 'Сервер недоступний, перевірте зʼєднання', undefined, true));
    const { result, unmount } = setup();
    await type(result, 'x');
    unmount();
    expect(save).toHaveBeenCalledTimes(1);
    await wait(60_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('зміна, після якої аркуш перевищив би межу тексту, не приймається', async () => {
    const { result } = setup();
    const big = 'я'.repeat(REFERENCE_MAX_CELL);
    let accepted = true;
    act(() => {
      accepted = result.current.update((s) => ({
        ...s,
        rows: Array.from({ length: Math.ceil(REFERENCE_MAX_SHEET_CHARS / REFERENCE_MAX_CELL) + 1 }, (_, i) => ({ id: `r${i}`, cells: { c1: big } })),
      }));
    });
    expect(accepted).toBe(false);
    expect(result.current.content.rows).toHaveLength(1);
    expect(result.current.dirty).toBe(false);
  });

  it('новішу версію з сервера приймає, лише коли своїх незбережених правок немає', async () => {
    const { result, rerender } = setup();
    rerender({ s: sheet({ version: 2, rows: [{ id: 'r1', cells: { c1: 'від колеги' } }] }) });
    expect(result.current.content.rows[0].cells).toEqual({ c1: 'від колеги' });

    await type(result, 'моє');
    rerender({ s: sheet({ version: 3, rows: [{ id: 'r1', cells: { c1: 'ще від колеги' } }] }) });
    expect(result.current.content.rows[0].cells).toEqual({ c1: 'моє' });
  });
});
